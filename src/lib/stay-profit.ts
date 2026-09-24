// 転売の利益計算（運営者向けの取引デスク用）。サーバー専用。OPENSEA_API_KEY はブラウザに出さない。
//
// 方針:
// - 出品価格 vs「市場の参照値（フロア / 直近成約中央値 / そのトークンの前回売買）」を並べ、
//   手数料・ガスを差し引いた「期待利益」を計算できる素材を返す。
// - false precision を避けるため、推定は複数の参照値を「そのまま」返し、
//   採用基準・手数料率・ガスは管理画面（運営者）が調整して最終判断する。
// - これは投資助言ではなく、運営者自身の仕入れ判断の材料（admin 限定）。

import { fetchStayListings, OPENSEA_STAY_COLLECTION, type StayListing } from './opensea-stays';
import { parseUnits } from 'viem';

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';

export interface ProfitListing {
  tokenId: string;
  house: string;
  prefecture: string;
  place: string;
  checkIn: string;
  checkInLabel: string;
  nights: number | null;
  price: number | null;        // 出品価格（ETH換算, number）
  priceWei: string | null;     // 決済・表示照合用（整数文字列）
  currency: string;
  imageUrl: string | null;
  keyImageUrl: string | null;
  imageIsAreaPhoto: boolean;
  houseOfficialUrl: string | null;
  houseNote: string | null;
  openseaUrl: string;
  orderHash: string;
  lastSale: number | null;     // このトークンの直近売買（あれば）
}

export interface RecentSale {
  tokenId: string | null;
  price: number;   // ETH
  at: number;      // unix 秒（不明なら 0）
}

export interface ProfitData {
  updatedAt: string;
  collectionUrl: string;
  floor: number | null;            // コレクションのフロア価格（ETH）
  recentSaleMedian: number | null; // 直近売買の中央値（ETH）
  recentSaleCount: number;
  recentSales: RecentSale[];       // 新しい順（ティッカー等の表示用）
  listings: ProfitListing[];
  note: string;
}

async function osGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`${OPENSEA_API_BASE}${path}`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function median(nums: number[]): number | null {
  const arr = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

// コレクションのフロア（v2 stats。パスは /collections/ ＝複数形が正）
async function fetchFloor(apiKey: string): Promise<number | null> {
  const data = await osGet<any>(`/collections/${OPENSEA_STAY_COLLECTION}/stats`, apiKey);
  const f = data?.total?.floor_price;
  return typeof f === 'number' && Number.isFinite(f) ? f : null;
}

// 直近の売買（v2 events, event_type=sale）→ トークン別直近価格 + 全体中央値
async function fetchSales(apiKey: string): Promise<{ byToken: Map<string, number>; prices: number[]; recent: RecentSale[] }> {
  const byToken = new Map<string, number>();
  const prices: number[] = [];
  const recent: RecentSale[] = [];
  const data = await osGet<any>(`/events/collection/${OPENSEA_STAY_COLLECTION}?event_type=sale&limit=50`, apiKey);
  const events: any[] = data?.asset_events ?? [];
  for (const ev of events) {
    const id = ev?.nft?.identifier != null ? String(ev.nft.identifier) : null;
    const pay = ev?.payment;
    if (!pay) continue;
    const decimals = Number(pay.decimals ?? 18);
    const raw = pay.quantity != null ? String(pay.quantity) : '';
    if (!/^\d+$/.test(raw)) continue;
    // wei -> ETH（number, 表示用途）
    const val = Number(raw) / 10 ** decimals;
    if (!Number.isFinite(val) || val <= 0) continue;
    prices.push(val);
    if (recent.length < 12) {
      const at = Number(ev?.event_timestamp);
      recent.push({ tokenId: id, price: val, at: Number.isFinite(at) ? at : 0 });
    }
    // 直近優先（events は新しい順の想定。既にあれば上書きしない）
    if (id && !byToken.has(id)) byToken.set(id, val);
  }
  return { byToken, prices, recent };
}

export async function fetchProfitData(env: { OPENSEA_API_KEY?: string }): Promise<ProfitData | { error: string; setupRequired?: boolean }> {
  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) return { error: 'OPENSEA_API_KEY is not configured', setupRequired: true };

  let listingPayload: Awaited<ReturnType<typeof fetchStayListings>>;
  try {
    listingPayload = await fetchStayListings(apiKey);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'OpenSeaの出品情報を取得できませんでした' };
  }

  const [floor, sales] = await Promise.all([fetchFloor(apiKey), fetchSales(apiKey)]);
  const recentSaleMedian = median(sales.prices);

  const listings: ProfitListing[] = (listingPayload.listings as StayListing[]).map((l) => ({
    tokenId: l.tokenId,
    house: l.house || l.name,
    prefecture: l.prefecture,
    place: l.place,
    checkIn: l.checkIn,
    checkInLabel: l.checkInLabel,
    nights: l.nights,
    price: (() => { const n = Number(l.price); return Number.isFinite(n) && n > 0 ? n : null; })(),
    priceWei: (() => { try { return parseUnits(l.price, 18).toString(); } catch { return null; } })(),
    currency: l.currency,
    imageUrl: l.imageUrl,
    keyImageUrl: l.keyImageUrl,
    imageIsAreaPhoto: l.imageIsAreaPhoto,
    houseOfficialUrl: l.houseOfficialUrl,
    houseNote: l.houseNote,
    openseaUrl: l.openseaUrl,
    orderHash: l.orderHash,
    lastSale: sales.byToken.get(l.tokenId) ?? null,
  }));

  return {
    updatedAt: new Date().toISOString(),
    collectionUrl: listingPayload.collectionUrl,
    floor,
    recentSaleMedian,
    recentSaleCount: sales.prices.length,
    recentSales: sales.recent,
    listings,
    note: '期待利益 = 参照値 ×(1−手数料率) − 出品価格 − ガス。参照値・手数料・ガスは管理画面で調整。数値は概算で、利益・流動性を保証しません。',
  };
}
