import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

// 転売在庫の新規追加（候補 / 仕入済）。requireAdmin で保護。
// 実売買は運営者が OpenSea 上で自分のウォレットで行う。ここは記録のみ。

const TOKEN_ID_RE = /^\d{1,78}$/;
const STATUS = new Set(['candidate', 'bought', 'listed', 'sold', 'dropped']);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function num(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}
function httpsUrl(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === 'https:' ? s : null; } catch { return null; }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => null) as any;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const tokenId = str(body.token_id, 80);
  if (!tokenId || !TOKEN_ID_RE.test(tokenId)) {
    return Response.json({ error: 'Token ID（数字）を指定してください' }, { status: 400 });
  }
  const status = STATUS.has(body.status) ? body.status : 'candidate';

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('stay_inventory').insert({
    token_id: tokenId,
    chain: str(body.chain, 40) || 'ethereum',
    contract_address: str(body.contract_address, 80),
    house: str(body.house, 200),
    prefecture: str(body.prefecture, 100),
    place: str(body.place, 100),
    checkin_date: isoDate(body.checkin_date),
    nights: (() => { const n = num(body.nights); return n ? Math.round(n) : null; })(),
    image_url: httpsUrl(body.image_url),
    opensea_url: httpsUrl(body.opensea_url),
    status,
    buy_price_eth: num(body.buy_price_eth),
    bought_at: status === 'bought' || num(body.buy_price_eth) != null ? new Date().toISOString() : null,
    notes: str(body.notes, 2000),
    wallet_address: str(body.wallet_address, 60),
  }).select('id').single();

  if (error) {
    console.error('[stay/inventory create]', error.message);
    return Response.json({ error: '保存に失敗しました' }, { status: 500 });
  }
  return Response.json({ ok: true, id: data.id });
};
