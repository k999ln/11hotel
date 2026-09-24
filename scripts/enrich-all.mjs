// 全ホテルのdetails/tagline/overviewをAIで一括生成
// node scripts/enrich-all.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// .env 読み込み
const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

async function callClaude(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

function extractJson(text) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) return JSON.parse(block[1].trim());
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) return JSON.parse(raw[0]);
  throw new Error('JSONが見つかりません');
}

function buildPrompt(hotel) {
  const isRestaurant = hotel.category === 'restaurant';
  const label = isRestaurant ? 'レストラン' : 'ホテル';

  const ctx = [
    `施設名: ${hotel.hotel_name}`,
    hotel.city ? `都市/エリア: ${hotel.city}` : null,
    `カテゴリ: ${label}`,
    hotel.official_url ? `公式サイト: ${hotel.official_url}` : null,
  ].filter(Boolean).join('\n');

  const hotelFields = isRestaurant ? '' : `
    "spa": {
      "name": "スパ名",
      "overview": "1〜2文",
      "hours": "営業時間",
      "treatments": ["代表トリートメント"]
    },
    "rooms": [{
      "name": "客室タイプ名",
      "size": "広さ",
      "bed": "ベッドタイプ",
      "view": "ビュー",
      "features": ["特徴"]
    }],`;

  const footer = isRestaurant
    ? '"visit_copy": "訪問体験の詩的な1文"'
    : '"stay_copy": "宿泊体験の詩的な1〜2文"';

  return `以下の${label}について編集コンテンツと詳細データをJSONで生成してください。

${ctx}

以下の構造で出力（知っている情報のみ・不明なキーは省略）:
{
  "tagline": "1文の詩的なキャッチコピー（日本語）",
  "overview": "3〜4文の編集テキスト（なぜここが特別か・どんな体験か・文末は余韻を残す表現で）",
  "details": {
    "facts": {
      "opened": "開業年",
      "floors": "所在階",
      "rooms": "客室数",
      "brand": "ブランド名",
      "architect": "設計者",
      "interior_designer": "インテリアデザイナー"
    },
    "dining": [{
      "name": "店名",
      "type": "restaurant | bar | lounge | cafe",
      "cuisine": "料理ジャンル",
      "seats": "席数",
      "hours": "営業時間",
      "overview": "1〜2文"
    }],${hotelFields}
    "access": [{
      "method": "交通手段",
      "detail": "詳細（例: 丸ノ内線「三越前」駅より徒歩3分）",
      "minutes": 数字
    }],
    ${footer}
  }
}`;
}

async function enrichHotel(hotel) {
  const system = 'あなたはラグジュアリーホスピタリティの専門家です。施設情報をもとに高品質な日本語の編集コンテンツを生成します。知識にある正確な情報のみを使用し、不確かな情報は含めないでください。出力はJSONのみ。';

  const text = await callClaude(system, buildPrompt(hotel));
  const enriched = extractJson(text);

  const payload = {};
  if (enriched.tagline) payload.tagline = enriched.tagline;
  if (enriched.overview) payload.overview = enriched.overview;
  if (enriched.details) payload.details = enriched.details;

  const { error } = await supabase.from('hotels').update(payload).eq('id', hotel.id);
  if (error) throw new Error(error.message);

  return enriched;
}

// メイン
const { data: hotels, error } = await supabase
  .from('hotels')
  .select('id, hotel_name, city, category, official_url, details')
  .eq('status', 'published')
  .order('created_at');

if (error) { console.error(error); process.exit(1); }

// details が空の施設だけを対象にする（入力済みの施設は上書きしない）
const targets = hotels.filter(h => !h.details || Object.keys(h.details).length === 0);
console.log(`\n対象: ${targets.length}件\n`);

for (const hotel of targets) {
  process.stdout.write(`処理中: ${hotel.hotel_name} (${hotel.category})... `);
  try {
    const result = await enrichHotel(hotel);
    const keys = result.details ? Object.keys(result.details).join(', ') : '-';
    console.log(`✓ [${keys}]`);
  } catch (e) {
    console.log(`✗ エラー: ${e.message}`);
  }
  // レートリミット対策で1秒待つ
  await new Promise(r => setTimeout(r, 1000));
}

console.log('\n完了！');
