// 全ホテルのスラグを整理する
// node scripts/fix-slugs.mjs          → dry-run（確認のみ）
// node scripts/fix-slugs.mjs --apply  → 実際に更新

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = !process.argv.includes('--apply');

// 英語名から自動生成できないものの手動マッピング
const MANUAL = {
  'シャングリ・ラ 東京':                    'shangri-la-tokyo',
  'フォーシーズンズホテル 東京 大手町':      'four-seasons-tokyo-otemachi',
  'ふふ　銀座':                             'fufu-ginza',
  'ふふ 河口湖':                            'fufu-kawaguchiko',
  '箱根・強羅 佳ら久':                      'karaku-hakone',
  'aman':                                   'aman-tokyo',
  '天冨良 よこ田':                          'tempura-yokota',
  '玉家 / Tamaya':                          'tamaya',
  '吉田':                                   'yoshida',
  '琥珀宮':                                 'kohakumiya',
  '嘉禅':                                   'kazen',
  '桃仙閣':                                 'tosenkaku',
  '李朝房':                                 'richobo',
  '松風':                                   'matsukaze',
  'かっぽれ':                               'kappore',
};

function toSlug(name) {
  if (!name) return null;
  if (MANUAL[name]) return MANUAL[name];

  // 英字・数字・スペース・ハイフンのみ抽出してkebab-case化
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // アクセント除去 (é→e など)
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return ascii.length >= 2 ? ascii : null;
}

const { data: hotels, error } = await supabase
  .from('hotels')
  .select('id, slug, hotel_name, status')
  .not('hotel_name', 'is', null)
  .order('posted_at', { ascending: false });

if (error) { console.error(error); process.exit(1); }

const used = new Set();
const updates = [];
const skipped = [];

for (const h of hotels) {
  const proposed = toSlug(h.hotel_name);
  if (!proposed) { skipped.push(h); continue; }

  // 重複回避
  let slug = proposed;
  let i = 2;
  while (used.has(slug)) slug = `${proposed}-${i++}`;
  used.add(slug);

  if (slug !== h.slug) {
    updates.push({ id: h.id, name: h.hotel_name, old: h.slug, new: slug, status: h.status });
  } else {
    console.log(`  ✓ unchanged  ${h.slug}`);
    used.add(slug);
  }
}

console.log('\n━━━ 変更予定 ━━━');
updates.forEach(u => {
  console.log(`[${u.status}] ${u.name}`);
  console.log(`  ${u.old}`);
  console.log(`  → ${u.new}\n`);
});

if (skipped.length > 0) {
  console.log('━━━ スキップ（スラグ生成不可） ━━━');
  skipped.forEach(h => console.log(`  ${h.hotel_name} / ${h.slug}`));
}

if (DRY_RUN) {
  console.log('\n[dry-run] 変更は適用されていません。--apply を付けて実行すると更新します。');
  process.exit(0);
}

console.log('\n━━━ 適用中 ━━━');
for (const u of updates) {
  const { error } = await supabase
    .from('hotels')
    .update({ slug: u.new })
    .eq('id', u.id);
  if (error) console.error(`✗ ${u.name}: ${error.message}`);
  else console.log(`✓ ${u.name} → /${u.new}`);
}
console.log('\n完了。');
