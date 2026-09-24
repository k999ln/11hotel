import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { clientIp, requireSameOrigin } from '@/lib/public-api-security';

// サイト内購入の送信記録。送信時点では negotiating とし、チェーン確認後にのみ closed にする。
// - 公開POST（購入者が押した瞬間にクライアントから叩く）。形式検証＋同一オリジン＋IPレート制限。

const TOKEN_ID_RE = /^\d{1,78}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const RL_LIMIT = 6;
const RL_WINDOW_MS = 60_000;
const rlByIp = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rlByIp.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  rlByIp.set(ip, hits);
  if (rlByIp.size > 2000) rlByIp.delete(rlByIp.keys().next().value!);
  return hits.length > RL_LIMIT;
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) || null : null;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// クライアントが送る first-touch 流入元。許可キーのみ・長さ上限つきで取り込む
const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid', 'source', 'campaign', 'landing_page', 'captured_at'];
const pickAttribution = (v: unknown): Record<string, string> | null => {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, string> = {};
  for (const k of ATTR_KEYS) {
    const s = str((v as Record<string, unknown>)[k], 300);
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
};

export const POST: APIRoute = async (ctx) => {
  const request = ctx.request;
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(ctx);
  if (rateLimited(ip)) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = await request.json().catch(() => null) as any;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const tokenId = str(body.token_id, 80);
  const txHash = str(body.tx_hash, 70);
  const wallet = str(body.wallet_address, 60);
  const orderHash = str(body.order_hash, 120);
  if (!tokenId || !TOKEN_ID_RE.test(tokenId)) return Response.json({ error: 'invalid token' }, { status: 400 });
  if (!txHash || !TX_RE.test(txHash)) return Response.json({ error: 'invalid tx' }, { status: 400 });
  if (!wallet || !ADDR_RE.test(wallet)) return Response.json({ error: 'invalid wallet' }, { status: 400 });
  if (!orderHash || !TX_RE.test(orderHash)) return Response.json({ error: 'invalid order' }, { status: 400 });

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const priceEth = num(body.price_eth);
  const feeEth = num(body.fee_eth);
  const totalEth = num(body.total_eth);
  const feeBps = num(body.fee_bps);
  const expectedFeeBps = Math.max(1, Math.min(3000, Math.round(Number(import.meta.env.KEY_SUPPORT_FEE_BPS ?? 500))));
  const finiteNonNegative = [priceEth, feeEth, totalEth].every((n) => n != null && n >= 0 && n <= 1_000_000);
  const amountsMatch = priceEth != null && feeEth != null && totalEth != null
    && Math.abs((priceEth + feeEth) - totalEth) < 1e-12;
  if (!finiteNonNegative || !amountsMatch || feeBps !== expectedFeeBps) {
    return Response.json({ error: 'invalid_amounts' }, { status: 400 });
  }
  const attribution = pickAttribution(body.attribution);
  const revenue = JSON.stringify({ rate_bps: feeBps, fee_eth: feeEth, total_eth: totalEth, tx_hash: txHash.toLowerCase() });
  const { data: inserted, error } = await supabase.from('stay_deals').insert({
    token_id: tokenId,
    order_hash: orderHash.toLowerCase(),
    display_price_eth: priceEth,
    house: str(body.house, 200),
    prefecture: str(body.prefecture, 100),
    place: str(body.place, 100),
    checkin_date: typeof body.checkin_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.checkin_date) ? body.checkin_date : null,
    nights: (() => { const n = num(body.nights); return n ? Math.round(n) : null; })(),
    buyer_wallet_address: wallet,
    source: 'onsite_purchase',
    campaign: attribution?.utm_campaign ?? attribution?.campaign ?? null,
    status: 'negotiating',
    close_amount_eth: null,
    referral_fee: revenue,
    closed_at: null,
    message: `サイト内購入を送信。チェーン確認待ち。tx: https://etherscan.io/tx/${txHash}`,
    history: [{
      at: new Date().toISOString(), by: 'system', type: 'purchase_submitted', note: `tx ${txHash}`,
      ...(attribution ? { attribution } : {}),
    }],
  }).select('id').single();

  if (error) {
    console.error('[api/vip/purchase-log]', error.message);
    return Response.json({ error: 'log failed' }, { status: 500 });
  }

  // Slack 通知（inquiry.ts と同じ内部転送経路）
  const apiBase = import.meta.env.API_BASE;
  const adminSecret = import.meta.env.ADMIN_SECRET;
  if (apiBase && adminSecret) {
    const text = [
      '⏳ サイト内購入が送信されました（チェーン確認待ち）',
      `施設: ${str(body.house, 120) ?? '—'} / Token: ${tokenId}`,
      `販売総額: ${totalEth != null ? `${totalEth} ETH` : '—'} / 11hotel取扱料: ${feeEth != null ? `${feeEth} ETH` : '—'}`,
      `tx: https://etherscan.io/tx/${txHash}`,
      '管理画面: https://11hotel.vip/admin/stay-deals',
    ].join('\n');
    try {
      await fetch(`${apiBase}/api/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ text }),
      });
    } catch (e: any) {
      console.error('[api/vip/purchase-log] slack notify failed:', e?.message);
    }
  }

  return Response.json({ ok: true, id: inserted.id });
};
