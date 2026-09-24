// THE KEY 公開マーケットボード用のデータ組み立て。サーバー専用（OPENSEA/ANTHROPIC キーはブラウザに出さない）。
//
// 方針:
// - fetchProfitData（出品 + フロア + 直近成約）を土台に、出品ごとの「売れやすい価格帯の目安」を返す。
// - 目安はまず決定的な計算（中央値/フロア基準）で出し、ANTHROPIC_API_KEY があれば Claude で
//   レンジとひとことコメント（ja/en）を上書きする。AI結果は出品セットが変わらない限り5分キャッシュ。
// - 公開ページ向けなので、利益・投資を煽る表現は使わない。すべて「目安・非保証」の参考情報。

import { fetchProfitData, type ProfitData, type ProfitListing, type RecentSale } from './stay-profit';

const AI_TTL_MS = 5 * 60 * 1000;
const AI_MAX_LISTINGS = 20;

export interface MarketListing {
  tokenId: string;
  orderHash: string;
  house: string;
  prefecture: string;
  place: string;
  checkIn: string;
  checkInLabel: string;
  nights: number | null;
  price: number | null;
  priceWei: string | null;
  imageUrl: string | null;
  /** true: houseの実写真ではなく、拠点(area)全体の代表写真をフォールバック表示している */
  imageIsAreaPhoto: boolean;
  /** NOT A HOTEL公式の拠点別ページ（識別できた場合のみ。汎用トップではない） */
  houseOfficialUrl: string | null;
  /** このHOUSEタイプ固有の短い説明（識別できた場合のみ。拠点全体の説明ではない） */
  houseNote: string | null;
  openseaUrl: string;
  lastSale: number | null;
  /** 売れやすい価格帯の目安（ETH） */
  sellLow: number | null;
  sellHigh: number | null;
  /** 出品価格の相場感: below=目安より低め / fair=目安圏内 / above=目安より高め */
  verdict: 'below' | 'fair' | 'above' | null;
  comment: { ja: string; en: string } | null;
}

export interface KeyMarketData {
  updatedAt: string;
  collectionUrl: string;
  floor: number | null;
  recentSaleMedian: number | null;
  recentSaleCount: number;
  recentSales: RecentSale[];
  /** ETH→JPY の参考レート（CoinGecko・5分キャッシュ。取得失敗時は null） */
  ethJpy: number | null;
  aiGenerated: boolean;
  listings: MarketListing[];
}

let jpyCache: { rate: number; expires: number } | null = null;

// 複数ソースのフォールバック（Cloudflare Workers からのアクセスを弾くAPIがあるため）
const JPY_SOURCES: Array<{ url: string; pick: (j: any) => number }> = [
  { url: 'https://api.coinbase.com/v2/exchange-rates?currency=ETH', pick: (j) => Number(j?.data?.rates?.JPY) },
  { url: 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=JPY', pick: (j) => Number(j?.JPY) },
  { url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=jpy', pick: (j) => Number(j?.ethereum?.jpy) },
];

async function fetchEthJpy(): Promise<number | null> {
  if (jpyCache && jpyCache.expires > Date.now()) return jpyCache.rate;
  for (const src of JPY_SOURCES) {
    try {
      const res = await fetch(src.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const rate = src.pick(await res.json());
      if (Number.isFinite(rate) && rate > 0) {
        jpyCache = { rate, expires: Date.now() + 5 * 60_000 };
        return rate;
      }
    } catch { /* 次のソースへ */ }
  }
  return jpyCache?.rate ?? null;
}

interface AiBand {
  lo: number | null;
  hi: number | null;
  ja: string;
  en: string;
}

let aiCache: { key: string; expires: number; byToken: Map<string, AiBand> } | null = null;

const round = (n: number) => Math.round(n * 1000) / 1000;

function referenceOf(data: ProfitData, l: ProfitListing): number | null {
  return data.recentSaleMedian ?? data.floor ?? l.lastSale ?? null;
}

// 宿泊券は宿泊日に価値が失効する消費期限つき在庫のため、直前ほど値崩れしやすいという
// 実勢の傾向を「参考価格帯」に反映する（実際の決済価格には影響しない、表示上の目安のみ）。
const PROXIMITY_WINDOW_DAYS = 45;
const LAST_MINUTE_DISCOUNT = 0.12;

function daysUntilCheckin(checkIn: string): number | null {
  if (!checkIn) return null;
  const target = new Date(`${checkIn}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

// 0（宿泊日が遠い・影響なし）〜1（当日・最大割り引き）
function proximityWeight(daysUntil: number | null): number {
  if (daysUntil == null) return 0;
  if (daysUntil <= 0) return 1;
  if (daysUntil >= PROXIMITY_WINDOW_DAYS) return 0;
  return 1 - daysUntil / PROXIMITY_WINDOW_DAYS;
}

function fallbackBand(data: ProfitData, l: ProfitListing): { lo: number | null; hi: number | null } {
  const ref = referenceOf(data, l);
  if (ref == null) return { lo: null, hi: null };
  // フロアを下回る出品が最も動きやすい、という一般則に寄せた保守的なレンジ
  const anchor = data.floor != null ? Math.min(ref, data.floor) : ref;
  const compression = 1 - proximityWeight(daysUntilCheckin(l.checkIn)) * LAST_MINUTE_DISCOUNT;
  return { lo: round(anchor * 0.9 * compression), hi: round(Math.max(ref, anchor) * 1.05 * compression) };
}

function verdictOf(price: number | null, lo: number | null, hi: number | null): MarketListing['verdict'] {
  if (price == null || lo == null || hi == null) return null;
  if (price < lo * 0.98) return 'below';
  if (price <= hi * 1.02) return 'fair';
  return 'above';
}

const AI_SYSTEM = `You are a pricing assistant for "NOT A HOTEL - THE KEY" stay-voucher NFTs on OpenSea.
For each listing, estimate the price band (ETH) in which it would realistically sell, based on the floor price, recent sale median, the token's last sale, check-in date and nights.
Return STRICT JSON only — an array like:
[{"t":"<tokenId>","lo":0.85,"hi":1.05,"ja":"<=50 chars, Japanese, calm/informational>","en":"<=80 chars, English, calm/informational>"}]
Rules:
- lo/hi are numbers in ETH, lo < hi, grounded in the given data. If data is too thin, widen the band.
- Stay vouchers expire at check-in, so sellers commonly discount as the date approaches. For check-ins within ~45 days, skew the band lower than you would for the same floor/median far out; do not assume a discount beyond ~45 days out.
- Comments state facts and uncertainty (e.g. proximity of check-in date, thin liquidity). No hype, no profit promises, no investment advice.
- Output the JSON array only. No markdown, no prose.`;

async function fetchAiBands(
  apiKey: string,
  data: ProfitData,
): Promise<Map<string, AiBand> | null> {
  const lines = data.listings.slice(0, AI_MAX_LISTINGS).map((l) =>
    `token=${l.tokenId} house=${l.house} checkin=${l.checkIn || '-'} daysToCheckin=${daysUntilCheckin(l.checkIn) ?? '-'} nights=${l.nights ?? '-'} ask=${l.price ?? '-'} lastSale=${l.lastSale ?? '-'}`,
  );
  const context = [
    `floor=${data.floor ?? '-'} ETH`,
    `recentSaleMedian=${data.recentSaleMedian ?? '-'} ETH (n=${data.recentSaleCount})`,
    `today=${new Date().toISOString().slice(0, 10)}`,
    '',
    ...lines,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: AI_SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const text: string = json.content?.[0]?.text ?? '';
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const arr = JSON.parse(text.slice(start, end + 1)) as any[];
    const map = new Map<string, AiBand>();
    for (const row of arr) {
      const t = row?.t != null ? String(row.t) : null;
      if (!t) continue;
      const lo = Number(row.lo);
      const hi = Number(row.hi);
      map.set(t, {
        lo: Number.isFinite(lo) && lo > 0 ? round(lo) : null,
        hi: Number.isFinite(hi) && hi > 0 ? round(hi) : null,
        ja: typeof row.ja === 'string' ? row.ja.slice(0, 120) : '',
        en: typeof row.en === 'string' ? row.en.slice(0, 200) : '',
      });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

let aiInFlight = false;

export async function fetchKeyMarket(env: {
  OPENSEA_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}, opts?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<KeyMarketData | { error: string; setupRequired?: boolean }> {
  const [data, ethJpy] = await Promise.all([fetchProfitData(env), fetchEthJpy()]);
  if ('error' in data) return data;

  // 出品セット（token+価格）が同じ間は AI 結果を再利用
  const cacheKey = data.listings.map((l) => `${l.tokenId}@${l.price}`).sort().join('|')
    + `#${data.floor}#${data.recentSaleMedian}`;
  let byToken: Map<string, AiBand> | null = null;
  let aiGenerated = false;

  if (aiCache && aiCache.key === cacheKey && aiCache.expires > Date.now()) {
    byToken = aiCache.byToken;
    aiGenerated = true;
  } else if (env.ANTHROPIC_API_KEY && data.listings.length > 0 && !aiInFlight) {
    // 一覧表示をブロックしないよう、AI生成はバックグラウンドで行い次回ポーリングで反映する
    aiInFlight = true;
    const job = fetchAiBands(env.ANTHROPIC_API_KEY, data)
      .then((map) => { if (map) aiCache = { key: cacheKey, expires: Date.now() + AI_TTL_MS, byToken: map }; })
      .finally(() => { aiInFlight = false; });
    if (opts?.waitUntil) opts.waitUntil(job);
    else await job.catch(() => {}); // waitUntil が無い環境（dev等）では従来どおり待つ
    if (aiCache && aiCache.key === cacheKey && aiCache.expires > Date.now()) {
      byToken = aiCache.byToken;
      aiGenerated = true;
    }
  }

  const listings: MarketListing[] = data.listings.map((l) => {
    const ai = byToken?.get(l.tokenId) ?? null;
    const fb = fallbackBand(data, l);
    // AIの外れ値対策: 参照値の 0.3〜3 倍を超えるレンジは採用せずフォールバックへ
    const ref = referenceOf(data, l);
    const sane = (n: number | null) => n != null && (ref == null || (n >= ref * 0.3 && n <= ref * 3));
    let lo = sane(ai?.lo ?? null) ? ai!.lo : fb.lo;
    let hi = sane(ai?.hi ?? null) ? ai!.hi : fb.hi;
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    return {
      tokenId: l.tokenId,
      orderHash: l.orderHash,
      house: l.house,
      prefecture: l.prefecture,
      place: l.place,
      checkIn: l.checkIn,
      checkInLabel: l.checkInLabel,
      nights: l.nights,
      price: l.price,
      priceWei: l.priceWei,
      imageUrl: l.imageUrl,
      imageIsAreaPhoto: l.imageIsAreaPhoto,
      houseOfficialUrl: l.houseOfficialUrl,
      houseNote: l.houseNote,
      openseaUrl: l.openseaUrl,
      lastSale: l.lastSale,
      sellLow: lo,
      sellHigh: hi,
      verdict: verdictOf(l.price, lo, hi),
      comment: ai && (ai.ja || ai.en) ? { ja: ai.ja, en: ai.en } : null,
    };
  });

  return {
    updatedAt: data.updatedAt,
    collectionUrl: data.collectionUrl,
    floor: data.floor,
    recentSaleMedian: data.recentSaleMedian,
    recentSaleCount: data.recentSaleCount,
    recentSales: data.recentSales,
    ethJpy,
    aiGenerated,
    listings,
  };
}
