import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

// 公開 POST。「11hotelに購入相談」→ stay_deals(status=new) を作成し、管理者へ通知する。
// 出品スナップショットはクライアント（/stay/[tokenId]）から受け取る（opensea-stays はライブ取得のため）。
// 11hotel は NFT・代金を預からない。決済/移転は OpenSea 上。ここでは相談の受付のみ。

const CONTACT_METHODS = new Set(['email', 'line', 'whatsapp', 'phone', 'instagram', 'other', '']);
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_ID_RE = /^\d{1,78}$/;

const RL_IP_LIMIT = 8;
const RL_IP_WINDOW = 10 * 60 * 1000; // 10分

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

export const POST: APIRoute = async ({ request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  const rl = await checkRateLimit({
    supabaseUrl, supabaseServiceKey,
    event: 'rl_stay_inquiry', key: ip,
    limit: RL_IP_LIMIT, windowMs: RL_IP_WINDOW,
  });
  if (rl.limited) {
    return Response.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as any;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const tokenId = str(body.token_id, 80);
  const email = str(body.email, 200);
  const contactMethod = typeof body.contact_method === 'string' ? body.contact_method.trim() : '';
  const consent = body.consent === true;

  if (!tokenId || !TOKEN_ID_RE.test(tokenId)) {
    return Response.json({ error: 'The stay key for this inquiry is invalid.' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (!CONTACT_METHODS.has(contactMethod)) {
    return Response.json({ error: 'Please choose a valid contact method.' }, { status: 400 });
  }
  if (!consent) {
    return Response.json({ error: 'Please agree to how your information will be used.' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const wallet = str(body.wallet_address, 60);
  const feeBps = Math.max(0, Math.min(3000, Math.round(num(body.support_fee_bps) ?? 0)));
  const feeEth = num(body.support_fee_eth);
  const totalEth = num(body.support_total_eth);
  const supportNote = feeBps > 0
    ? `11hotel購入サポート希望（成約手数料 ${feeBps / 100}% / ${feeEth ?? '—'} ETH / 合計目安 ${totalEth ?? '—'} ETH）`
    : '通常の購入相談';

  const { data: inserted, error } = await supabase.from('stay_deals').insert({
    token_id: tokenId,
    order_hash: str(body.order_hash, 120),
    display_price_eth: num(body.display_price_eth),
    desired_price_eth: num(body.desired_price_eth),
    house: str(body.house, 200),
    prefecture: str(body.prefecture, 100),
    place: str(body.place, 100),
    checkin_date: isoDate(body.checkin_date),
    nights: (() => { const n = num(body.nights); return n ? Math.round(n) : null; })(),
    buyer_name: str(body.name, 120),
    buyer_email: email,
    buyer_contact_method: contactMethod || null,
    buyer_contact_handle: str(body.contact_handle, 200),
    buyer_wallet_address: wallet && WALLET_RE.test(wallet) ? wallet : null,
    purpose: str(body.purpose, 500),
    message: str(body.message, 2000),
    source: str(body.source, 100),
    campaign: str(body.campaign, 100),
    referrer: request.headers.get('referer')?.slice(0, 300) ?? null,
    status: 'new',
    history: [{ at: new Date().toISOString(), by: 'system', type: 'created', note: supportNote }],
  }).select('id').single();

  if (error) {
    console.error('[api/stays/inquiry]', error.message);
    return Response.json({ error: 'Could not send your message. Please try again shortly.' }, { status: 500 });
  }

  // 管理者通知（Slack）— private-signal.ts と同じ内部転送経路を使う
  const apiBase = import.meta.env.API_BASE;
  const adminSecret = import.meta.env.ADMIN_SECRET;
  if (apiBase && adminSecret) {
    const priceTxt = num(body.display_price_eth) != null ? `${num(body.display_price_eth)} ETH` : '—';
    const desiredTxt = num(body.desired_price_eth) != null ? `${num(body.desired_price_eth)} ETH` : '—';
    const text = [
      '🗝️ 新しい宿泊券 購入相談',
      `施設: ${str(body.house, 120) ?? '—'}`,
      `Token ID: ${tokenId}`,
      `表示価格: ${priceTxt} / 希望価格: ${desiredTxt}`,
      `サポート: ${supportNote}`,
      `連絡方法: ${contactMethod || '—'}`,
      `目的: ${str(body.purpose, 120) ?? '—'}`,
      '管理画面: https://11hotel.vip/admin/stay-deals',
    ].join('\n');
    try {
      await fetch(`${apiBase}/api/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ text }),
      });
    } catch (e: any) {
      console.error('[api/stays/inquiry] slack notify failed:', e?.message);
    }
  }

  return Response.json({ ok: true, id: inserted.id });
};
