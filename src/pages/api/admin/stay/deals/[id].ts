import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

// 商談(stay_deals)の更新。requireAdmin（Cookie + Origin/Referer CSRF, fail-closed）で保護。
// クライアント提供の任意フィールドは許可リストで絞る。history はサーバー側で追記する。

const ALLOWED_STATUS = new Set([
  'new', 'qualified', 'seller_contacted', 'negotiating', 'redirected', 'closed', 'lost',
]);

const TEXT_FIELDS = new Set([
  'seller_name', 'seller_contact', 'seller_notes', 'assignee', 'referral_fee',
  'buyer_contact_handle', 'purpose',
]);
const NUM_FIELDS = new Set(['desired_price_eth', 'close_amount_eth']);

function str(v: unknown, max = 500): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function num(v: unknown): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });

  const body = await request.json().catch(() => null) as any;
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);

  // 既存行（history 追記のため取得）
  const { data: existing, error: getErr } = await supabase
    .from('stay_deals').select('id, status, history').eq('id', id).single();
  if (getErr || !existing) return Response.json({ error: 'deal not found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const historyEntries: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return Response.json({ error: 'invalid status' }, { status: 400 });
    if (body.status !== existing.status) {
      patch.status = body.status;
      historyEntries.push({ at: now, by: 'admin', type: 'status', note: `${existing.status} → ${body.status}` });
      if (body.status === 'closed') patch.closed_at = now;
    }
  }

  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) patch[f] = str(body[f], f === 'seller_notes' ? 3000 : 500);
  }
  for (const f of NUM_FIELDS) {
    if (body[f] !== undefined) patch[f] = num(body[f]);
  }

  // 手動の履歴メモ追加
  const note = str(body.note, 2000);
  if (note) historyEntries.push({ at: now, by: 'admin', type: 'note', note });

  if (historyEntries.length > 0) {
    const prev = Array.isArray(existing.history) ? existing.history : [];
    patch.history = [...prev, ...historyEntries];
  }

  const { error: upErr } = await supabase.from('stay_deals').update(patch).eq('id', id);
  if (upErr) {
    console.error('[admin/stay/deals PATCH]', upErr.message);
    return Response.json({ error: '更新に失敗しました' }, { status: 500 });
  }
  return Response.json({ ok: true });
};
