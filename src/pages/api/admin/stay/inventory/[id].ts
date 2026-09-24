import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

// 転売在庫の更新（ステータス遷移・価格・手数料・メモ等）と削除。requireAdmin で保護。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = new Set(['candidate', 'bought', 'listed', 'sold', 'dropped']);
const NUM_FIELDS = new Set(['buy_price_eth', 'list_price_eth', 'sold_price_eth', 'fees_eth']);
const TEXT_FIELDS = new Set(['notes', 'wallet_address', 'house']);

function num(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function str(v: unknown, max: number): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });

  const body = await request.json().catch(() => null) as any;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: existing } = await supabase.from('stay_inventory').select('id, status').eq('id', id).single();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const now = new Date().toISOString();

  if (body.status !== undefined) {
    if (!STATUS.has(body.status)) return Response.json({ error: 'invalid status' }, { status: 400 });
    patch.status = body.status;
    // ステータス遷移時に対応する日時を自動記録（未設定のとき）
    if (body.status === 'bought') patch.bought_at = body.bought_at ?? now;
    if (body.status === 'listed') patch.listed_at = body.listed_at ?? now;
    if (body.status === 'sold') patch.sold_at = body.sold_at ?? now;
  }
  for (const f of NUM_FIELDS) if (body[f] !== undefined) patch[f] = num(body[f]);
  for (const f of TEXT_FIELDS) if (body[f] !== undefined) patch[f] = str(body[f], f === 'notes' ? 2000 : 200);

  const { error } = await supabase.from('stay_inventory').update(patch).eq('id', id);
  if (error) {
    console.error('[stay/inventory PATCH]', error.message);
    return Response.json({ error: '更新に失敗しました' }, { status: 500 });
  }
  return Response.json({ ok: true });
};

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from('stay_inventory').delete().eq('id', id);
  if (error) return Response.json({ error: '削除に失敗しました' }, { status: 500 });
  return Response.json({ ok: true });
};
