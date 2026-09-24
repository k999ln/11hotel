// 読み取り専用。整理候補テーブルの中身（ステータス内訳・古さ）を出す。
// node scripts/audit-cleanup.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function breakdown(table, statusCol = 'status') {
  console.log(`\n=== ${table} ===`);
  const { data, error } = await sb.from(table).select(`${statusCol},created_at`).limit(5000);
  if (error) { console.log('  err:', error.message); return; }
  const byStatus = {};
  let oldest = null, newest = null;
  for (const r of data) {
    const s = r[statusCol] ?? '(null)';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    const t = r.created_at ? new Date(r.created_at) : null;
    if (t) { if (!oldest || t < oldest) oldest = t; if (!newest || t > newest) newest = t; }
  }
  console.log('  total:', data.length);
  console.log('  status:', JSON.stringify(byStatus));
  if (oldest) console.log('  oldest:', oldest.toISOString().slice(0,10), ' newest:', newest.toISOString().slice(0,10));
}

await breakdown('ai_tasks');
await breakdown('photography_outreach');
await breakdown('private_inquiry_signals', 'signal_type');
