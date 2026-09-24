import { getHouseNote, getNotAHotelProfile, type NotAHotelProfile } from './notahotel-houses';

export const OPENSEA_STAY_COLLECTION = 'the-key-nah';
export const OPENSEA_COLLECTION_URL = `https://opensea.io/collection/${OPENSEA_STAY_COLLECTION}`;

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const PAGE_SIZE = 200;
const MAX_PAGES = 10;

type OpenSeaTrait = {
  trait_type?: unknown;
  value?: unknown;
};

type OpenSeaNft = {
  identifier?: unknown;
  contract?: unknown;
  name?: unknown;
  description?: unknown;
  image_url?: unknown;
  display_image_url?: unknown;
  opensea_url?: unknown;
  traits?: OpenSeaTrait[];
};

type OpenSeaListing = {
  order_hash?: unknown;
  chain?: unknown;
  status?: unknown;
  asset?: { identifier?: unknown; contract?: unknown };
  price?: { current?: { currency?: unknown; decimals?: unknown; value?: unknown } };
};

export type StayListing = {
  tokenId: string;
  orderHash: string;
  name: string;
  description: string;
  /**
   * Public display image. Prefer the NOT A HOTEL property photo when we can identify
   * the house, because /stay is a lodging comparison surface.
   */
  imageUrl: string | null;
  /** Original OpenSea NFT artwork image for THE KEY. */
  keyImageUrl: string | null;
  /** true: imageUrl is the area's representative photo, not a photo of this specific house. */
  imageIsAreaPhoto: boolean;
  /** NOT A HOTEL official page for this house's area, when identified (not the generic top page). */
  houseOfficialUrl: string | null;
  /** Short editorial description of this specific house type, when identified (not area-level). */
  houseNote: string | null;
  openseaUrl: string;
  prefecture: string;
  place: string;
  house: string;
  checkIn: string;
  checkInLabel: string;
  nights: number | null;
  price: string;
  currency: string;
  property: NotAHotelProfile | null;
};

export type StayListingsPayload = {
  collection: string;
  collectionUrl: string;
  updatedAt: string;
  refreshAfterSeconds: number;
  listings: StayListing[];
};

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function traitValue(nft: OpenSeaNft, matcher: RegExp): string {
  const trait = (nft.traits ?? []).find((candidate) => matcher.test(asString(candidate.trait_type)));
  return asString(trait?.value);
}

function formatUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction = decimals === 0 ? '' : padded.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  return fraction ? `${whole}.${fraction}` : whole;
}

// JSTの暦日として扱う（UTC正午に固定すればタイムゾーンで暦日がずれない）
function exactDate(y: number, m: number, d: number): { iso: string; label: string } | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== d) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  }).format(date);
  return { iso, label };
}

const MONTH_ABBR: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// チェックイン日の解決。trait「CHECK-IN DATE(JST)」は "July 2026" のように月までしか
// 持たないため、正確な日を持つ tokenId 先頭6桁（YYMMDD）→ NFT名（"JUL.06, 2026"）→ trait の順で使う。
function resolveCheckIn(tokenId: string, name: string, rawTrait: string): { iso: string; label: string } {
  const idMatch = tokenId.match(/^(\d{2})(\d{2})(\d{2})\d{6,}$/);
  if (idMatch) {
    const hit = exactDate(2000 + Number(idMatch[1]), Number(idMatch[2]), Number(idMatch[3]));
    if (hit) return hit;
  }
  const nameMatch = name.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\.?\s*(\d{1,2})\s*,?\s*(20\d{2})/);
  if (nameMatch) {
    const hit = exactDate(Number(nameMatch[3]), MONTH_ABBR[nameMatch[1]], Number(nameMatch[2]));
    if (hit) return hit;
  }
  return normalizeDate(rawTrait);
}

function normalizeDate(raw: string): { iso: string; label: string } {
  if (!raw) return { iso: '', label: 'Check date on OpenSea' };

  const isoMatch = raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let date: Date | null = isoMatch
    ? new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])))
    : null;

  if (!date || Number.isNaN(date.getTime())) {
    const parsed = new Date(raw.replace(/\.(?=\d)/g, ' '));
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (!date) return { iso: '', label: raw };
  const iso = date.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
  return { iso, label };
}

async function openSeaGet<T>(path: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${OPENSEA_API_BASE}${path}`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`OpenSea API ${response.status}: ${detail}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllNfts(apiKey: string): Promise<OpenSeaNft[]> {
  const nfts: OpenSeaNft[] = [];
  let cursor = '';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set('next', cursor);
    const data = await openSeaGet<{ nfts?: OpenSeaNft[]; next?: string }>(
      `/collection/${OPENSEA_STAY_COLLECTION}/nfts?${query}`,
      apiKey,
    );
    nfts.push(...(data.nfts ?? []));
    cursor = asString(data.next);
    if (!cursor) break;
  }

  return nfts;
}

// 出品中トークンだけメタデータを並列取得する高速パス（コールドスタート短縮）。
// 出品が多い場合（>30）は従来の全件クロールにフォールバック。
async function fetchNftsForListings(
  apiKey: string,
  listings: OpenSeaListing[],
): Promise<Map<string, OpenSeaNft> | null> {
  const wanted = new Map<string, string>(); // tokenId -> contract
  for (const l of listings) {
    if (asString(l.status).toUpperCase() !== 'ACTIVE') continue;
    const id = asString(l.asset?.identifier);
    const contract = asString(l.asset?.contract);
    if (!id || !contract) return null; // contract 不明なら安全側でクロールへ
    if (!wanted.has(id)) wanted.set(id, contract);
  }
  if (wanted.size === 0 || wanted.size > 30) return null;
  const entries = await Promise.all([...wanted].map(async ([id, contract]) => {
    try {
      const data = await openSeaGet<{ nft?: OpenSeaNft }>(`/chain/ethereum/contract/${contract}/nfts/${id}`, apiKey);
      return [id, data?.nft] as const;
    } catch {
      return [id, undefined] as const;
    }
  }));
  const map = new Map<string, OpenSeaNft>();
  for (const [id, nft] of entries) {
    if (nft) map.set(id, { ...nft, identifier: nft.identifier ?? id });
  }
  return map.size > 0 ? map : null;
}

export async function fetchStayListings(apiKey: string): Promise<StayListingsPayload> {
  const listingData = await openSeaGet<{ listings?: OpenSeaListing[] }>(
    `/listings/collection/${OPENSEA_STAY_COLLECTION}/best?limit=${PAGE_SIZE}`,
    apiKey,
  );

  let nftById = await fetchNftsForListings(apiKey, listingData.listings ?? []);
  if (!nftById) {
    const nfts = await fetchAllNfts(apiKey);
    nftById = new Map(nfts.map((nft) => [asString(nft.identifier), nft]));
  }
  const seen = new Set<string>();
  const listings: StayListing[] = [];

  for (const listing of listingData.listings ?? []) {
    if (asString(listing.status).toUpperCase() !== 'ACTIVE') continue;
    const tokenId = asString(listing.asset?.identifier);
    if (!tokenId || seen.has(tokenId)) continue;
    const nft = nftById.get(tokenId);
    if (!nft) continue;

    const date = resolveCheckIn(tokenId, asString(nft.name), traitValue(nft, /CHECK[- ]?IN DATE/i));
    const rawNights = traitValue(nft, /NUMBER OF NIGHTS/i);
    const parsedNights = Number.parseInt(rawNights, 10);
    const current = listing.price?.current;
    const decimals = Number(current?.decimals ?? 0);
    const rawPrice = asString(current?.value);
    const contract = asString(nft.contract || listing.asset?.contract);
    const chain = asString(listing.chain) || 'ethereum';
    const keyImageUrl = asString(nft.display_image_url || nft.image_url) || null;

    seen.add(tokenId);
    const baseListing = {
      tokenId,
      orderHash: asString(listing.order_hash),
      name: asString(nft.name) || `THE KEY #${tokenId}`,
      description: asString(nft.description),
      imageUrl: keyImageUrl,
      keyImageUrl,
      openseaUrl: asString(nft.opensea_url) || `https://opensea.io/assets/${encodeURIComponent(chain)}/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`,
      prefecture: traitValue(nft, /PREFECTURE/i),
      place: traitValue(nft, /^\s*2?\s*PLACE\s*$/i),
      house: traitValue(nft, /HOUSE/i),
      checkIn: date.iso,
      checkInLabel: date.label,
      nights: Number.isFinite(parsedNights) && parsedNights > 0 ? parsedNights : null,
      price: formatUnits(rawPrice, decimals),
      currency: asString(current?.currency) || 'ETH',
    };
    const property = getNotAHotelProfile(baseListing);

    listings.push({
      ...baseListing,
      imageUrl: property?.imageUrl || keyImageUrl,
      imageIsAreaPhoto: Boolean(property?.imageUrl),
      houseOfficialUrl: property?.officialUrl ?? null,
      houseNote: getHouseNote(property, baseListing.house),
      property,
    });
  }

  listings.sort((a, b) => {
    if (a.checkIn && b.checkIn) return a.checkIn.localeCompare(b.checkIn) || Number(a.price) - Number(b.price);
    if (a.checkIn) return -1;
    if (b.checkIn) return 1;
    return Number(a.price) - Number(b.price);
  });

  return {
    collection: 'NOT A HOTEL - THE KEY',
    collectionUrl: OPENSEA_COLLECTION_URL,
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: 30,
    listings,
  };
}
