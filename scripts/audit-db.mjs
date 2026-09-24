// 読み取り専用のDB監査。マイグレーション適用状況と各テーブルの行数を出す。
// node scripts/audit-db.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// table -> 期待カラム（マイグレーション確認用）
const TABLES = {
  hotels:                         ['phone_number', 'official_url', 'map_url', 'gallery_urls'],          // 011
  leads:                          [],
  private_inquiry_signals:        [],                                                                   // 009
  private_signal_notifications:   [],                                                                   // 009
  private_collections:            [],                                                                   // 010
  private_collection_requests:    ['ai_summary', 'ai_category'],                                        // 012
  hospitality_assets:             ['concept_copy', 'featured', 'display_order', 'visible_on_collection'], // 017/019/020
  hospitality_access_requests:    ['approved_token_expires_at', 'ai_seriousness', 'ai_handoff_draft', 'ai_matched_asset_ids', 'ai_classified_at'], // 030/033
  hospitality_asset_favorites:    [],                                                                   // 031
  hospitality_asset_shoots:       [],                                                                   // 032
  hospitality_invitations:        [],                                                                   // 022
  hospitality_sessions:           [],                                                                   // 023
  hospitality_asset_grants:       [],                                                                   // 024
  hospitality_access_logs:        [],                                                                   // 025
  hospitality_private_docs:       [],                                                                   // 026
  home_projects:                  [],                                                                   // 021
  app_settings:                   [],                                                                   // 006
  photography_outreach:           ['draft_subject'],                                                    // 005
  photography_appointments:       [],
  ai_tasks:                       [],
  admin_audit_logs:               [],
  // --- 整理候補（旧機能）---
  concierge_requests:             [],
  affiliate_clicks:               [],
  members:                        [],
  member_preferences:             [],
  member_consents:                [],
};

const results = [];
for (const [table, cols] of Object.entries(TABLES)) {
  // 存在確認は count/head:true を信用せず、実クエリが PGRST205 を返すかで判定する（09_memory/rules.md）
  const { error: existsErr } = await sb.from(table).select('*').limit(1);
  if (existsErr) {
    const gone = existsErr.code === 'PGRST205' || existsErr.code === '42P01' || /does not exist|find the table/i.test(existsErr.message);
    results.push({ table, exists: false, count: '-', missingCols: '-', note: gone ? 'テーブル無し' : existsErr.message });
    continue;
  }
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
  const missing = [];
  for (const c of cols) {
    const { error: cerr } = await sb.from(table).select(c).limit(1);
    if (cerr && (cerr.code === '42703' || /column .* does not exist|find the .* column/i.test(cerr.message))) missing.push(c);
  }
  results.push({ table, exists: true, count, missingCols: missing.length ? missing.join(',') : 'OK', note: '' });
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('TABLE', 32) + pad('EXISTS', 8) + pad('ROWS', 8) + pad('COLS', 20) + 'NOTE');
console.log('-'.repeat(90));
for (const r of results) {
  console.log(pad(r.table, 32) + pad(r.exists ? '✓' : '✗', 8) + pad(r.count, 8) + pad(r.missingCols === 'OK' ? 'OK' : (r.missingCols === '-' ? '-' : '欠:' + r.missingCols), 20) + r.note);
}
console.log('\n欠カラムがあるテーブルは該当マイグレーション未適用です。');
