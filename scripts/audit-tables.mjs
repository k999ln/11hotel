// 読み取り専用。全テーブルの「行数 × 現行コード参照」を棚卸しし、KEEP/DROP候補に仕分ける。
// node scripts/audit-tables.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ALL = [
  'admin_audit_logs','affiliate_clicks','affiliate_links','ai_tasks','app_config','app_secrets','app_settings',
  'approval_queue','areas','auth_failures','campaign_reports','concierge_requests','facilities','facility_contracts',
  'facility_inquiries','home_projects','hospitality_access_logs','hospitality_access_requests','hospitality_asset_favorites',
  'hospitality_asset_grants','hospitality_asset_shoots','hospitality_assets','hospitality_invitations','hospitality_private_docs',
  'hospitality_sessions','hotels','inquiries','leads','lottery_entries','lottery_events','member_consents','member_preferences',
  'members','models','notifications','partners','photography_appointments','photography_outreach','place_relationships',
  'private_collection_requests','private_collections','private_contacts','private_inquiry_signals','private_signal_notifications',
  'properties','property_inquiries','property_intelligence','property_listing_snapshots','property_listings',
  'property_media_deliverables','property_partners','property_referral_reports','property_research_notes','property_scores',
  'property_sources','rate_limits','real_estate_contracts','real_estate_inquiries','route_items','routes','salon_members',
  'salon_posts','tiktok_tokens','waitlist','waitlist_consents',
];

function refCount(t) {
  try {
    const out = execSync(
      `grep -rohE "\\.from\\((['\\\"])${t}\\1\\)" src worker --include=*.ts --include=*.astro 2>/dev/null | grep -v node_modules | wc -l`,
      { shell: '/bin/bash' },
    ).toString().trim();
    return parseInt(out) || 0;
  } catch { return 0; }
}

const rows = [];
for (const t of ALL) {
  // 存在確認は count/head:true を信用せず、実クエリが PGRST205 を返すかで判定する（09_memory/rules.md）
  const { error: existsErr } = await sb.from(t).select('*').limit(1);
  if (existsErr) continue; // PGRST205 等 = 存在しない
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  rows.push({ t, rows: count ?? 0, refs: refCount(t) });
}

const pad = (s, n) => String(s).padEnd(n);
const keep = rows.filter(r => r.refs > 0).sort((a, b) => b.rows - a.rows);
const drop = rows.filter(r => r.refs === 0).sort((a, b) => a.rows - b.rows);

console.log('\n■ 現行コードが参照（KEEP）');
keep.forEach(r => console.log('  ' + pad(r.t, 34) + 'rows=' + pad(r.rows, 7) + 'refs=' + r.refs));
console.log('\n■ コード参照なし（DROP候補）');
drop.forEach(r => console.log('  ' + pad(r.t, 34) + 'rows=' + r.rows));
console.log('\n実在:', rows.length, '/ KEEP:', keep.length, '/ DROP候補:', drop.length, '（うち空:', drop.filter(r => r.rows === 0).length, '）');
