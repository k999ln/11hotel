import type { APIRoute } from 'astro';
import { OPENSEA_STAY_COLLECTION } from '@/lib/opensea-stays';
import { encodeFunctionData } from 'viem';
import {
  ELEVEN_HOTEL_CHECKOUT_ABI, ELEVEN_HOTEL_CHECKOUT_V2_ABI,
  checkoutFee, checkoutFeeV2, resolveCheckoutMode,
} from '@/lib/checkout';
import { SEAPORT_FUNCTIONS, toSeaportArgs } from '@/lib/seaport';
import { clientIp, requireSameOrigin } from '@/lib/public-api-security';

// 非カストディアル決済の中継（POST, 公開）。
// 公開出品を再検証し、11hotel決済コントラクト用の原子的購入データを返す。
// 署名・送金は買い手自身のウォレットが行い、仕入れ額はSeaportへ、粗利益はtreasuryへ同一取引で送られる。
//
// 安全策:
// - orderHash が「現在この collection に出ている出品」であることをサーバー側で必ず検証
//   （任意のオーダーを中継するオープンリレーにしない）
// - wei 値の精度落ち対策として、OpenSea 応答の 15 桁以上の裸の数値を文字列化してから parse

const OS_BASE = 'https://api.opensea.io/api/v2';
const ORDER_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const LISTING_TTL_MS = 20_000;

// 既知の Seaport 公式コントラクト以外へは絶対に誘導しない
const SEAPORT_ALLOW = new Set([
  '0x0000000000000068f116a894984e2db1123eb395', // Seaport 1.6
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', // Seaport 1.5
]);

// 簡易レート制限（isolate単位・IPごと 10回/分）。OpenSea キーの踏み台化を抑える
const RL_LIMIT = 10;
const RL_WINDOW_MS = 60_000;
const rlByIp = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rlByIp.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  rlByIp.set(ip, hits);
  if (rlByIp.size > 2000) rlByIp.delete(rlByIp.keys().next().value!);
  return hits.length > RL_LIMIT;
}

interface KnownListing { protocolAddress: string; priceWei: string; currency: string; tokenId: string; contractAddress: string }
let listingCache: { map: Map<string, KnownListing>; expires: number } | null = null;

/** JSON テキスト中の 15 桁以上の「裸の数値」を文字列に変換（BigInt 精度保護） */
function quoteBigInts(text: string): string {
  return text.replace(/([:\[,]\s*)(\d{15,})(?=\s*[,\]}])/g, '$1"$2"');
}

async function osJson(path: string, apiKey: string, init?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(`${OS_BASE}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return JSON.parse(quoteBigInts(await res.text()));
  } catch {
    return null;
  }
}

async function loadKnownListings(apiKey: string, force = false): Promise<Map<string, KnownListing>> {
  if (!force && listingCache && listingCache.expires > Date.now()) return listingCache.map;
  const map = new Map<string, KnownListing>();
  let next = '';
  for (let page = 0; page < 3; page++) {
    const q = next ? `&next=${encodeURIComponent(next)}` : '';
    const data = await osJson(`/listings/collection/${OPENSEA_STAY_COLLECTION}/best?limit=100${q}`, apiKey);
    if (!data) break;
    for (const l of data.listings ?? []) {
      const hash = typeof l?.order_hash === 'string' ? l.order_hash.toLowerCase() : null;
      const protocolAddress = typeof l?.protocol_address === 'string' ? l.protocol_address : null;
      const cur = l?.price?.current;
      const tokenId = l?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria;
      const contractAddress = l?.asset?.contract ?? l?.protocol_data?.parameters?.offer?.[0]?.token;
      if (!hash || !protocolAddress || cur?.value == null) continue;
      map.set(hash, {
        protocolAddress,
        priceWei: String(cur.value),
        currency: typeof cur.currency === 'string' ? cur.currency : 'ETH',
        tokenId: tokenId != null ? String(tokenId) : '',
        contractAddress: typeof contractAddress === 'string' ? contractAddress.toLowerCase() : '',
      });
    }
    next = typeof data.next === 'string' ? data.next : '';
    if (!next) break;
  }
  if (map.size > 0) listingCache = { map, expires: Date.now() + LISTING_TTL_MS };
  return map;
}

// V2（1泊あたり最低販売価格）の下限計算にのみ必要。V1では呼ばない。
async function fetchNights(apiKey: string, contract: string, tokenId: string): Promise<number> {
  const data = await osJson(`/chain/ethereum/contract/${contract}/nfts/${tokenId}`, apiKey);
  const traits = data?.nft?.traits as Array<{ trait_type?: unknown; value?: unknown }> | undefined;
  const trait = (traits ?? []).find((t) => /NUMBER OF NIGHTS/i.test(String(t?.trait_type ?? '')));
  const n = Number.parseInt(String(trait?.value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const POST: APIRoute = async (ctx) => {
  const request = ctx.request;
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(ctx);
  if (rateLimited(ip)) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { orderHash?: string; fulfiller?: string } | null;
  const orderHash = body?.orderHash?.trim().toLowerCase() ?? '';
  const fulfiller = body?.fulfiller?.trim() ?? '';
  if (!ORDER_RE.test(orderHash) || !ADDR_RE.test(fulfiller)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const apiKey = import.meta.env.OPENSEA_API_KEY;
  if (!apiKey) return Response.json({ error: 'setup_required' }, { status: 503 });
  const checkoutAddress = String(import.meta.env.KEY_CHECKOUT_CONTRACT ?? '').trim().toLowerCase();
  const expectedCollection = String(import.meta.env.KEY_COLLECTION_CONTRACT ?? '0xf3f8257fbcfdeff9354b6a0e1a948f7a5ff135a2').trim().toLowerCase();
  const configuredBps = Number(import.meta.env.KEY_SUPPORT_FEE_BPS ?? 500);
  const feeBps = Number.isFinite(configuredBps) ? Math.max(1, Math.min(3000, Math.round(configuredBps))) : 500;
  if (!ADDR_RE.test(checkoutAddress) || !ADDR_RE.test(expectedCollection)) {
    return Response.json({ error: 'checkout_not_configured' }, { status: 503 });
  }
  const nightlyFloorEthRaw = String(import.meta.env.KEY_NIGHTLY_FLOOR_ETH ?? '');
  const { ready: checkoutReady, v2: isV2, perNightFloorWei } = await resolveCheckoutMode(checkoutAddress, feeBps, nightlyFloorEthRaw);
  if (!checkoutReady) {
    console.error('[vip/fulfill] checkout not ready:', { feeBps, isV2 });
    return Response.json({ error: isV2 ? 'checkout_verification_unavailable' : 'checkout_pricing_mismatch' }, { status: 503 });
  }

  // この collection の現行出品であることを検証（オープンリレー防止）
  let known = (await loadKnownListings(apiKey)).get(orderHash);
  if (!known) known = (await loadKnownListings(apiKey, true)).get(orderHash);
  if (!known) return Response.json({ error: 'listing_not_found' }, { status: 404 });
  if (known.currency !== 'ETH') return Response.json({ error: 'unsupported_currency' }, { status: 400 });
  if (known.contractAddress !== expectedCollection) return Response.json({ error: 'unsupported_collection' }, { status: 400 });

  const fd = await osJson('/listings/fulfillment_data', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      listing: { hash: orderHash, chain: 'ethereum', protocol_address: known.protocolAddress },
      fulfiller: { address: checkoutAddress },
    }),
  });

  const tx = fd?.fulfillment_data?.transaction;
  if (!tx?.to || !tx?.function) {
    return Response.json({ error: 'fulfillment_unavailable' }, { status: 409 });
  }

  // 多層防御: 送信先が既知の Seaport であること・金額が出品価格を超えないことをサーバー側でも検証
  if (!SEAPORT_ALLOW.has(String(tx.to).toLowerCase())) {
    console.error('[vip/fulfill] unexpected contract:', tx.to);
    return Response.json({ error: 'fulfillment_unavailable' }, { status: 409 });
  }
  try {
    if (tx.value != null && BigInt(String(tx.value)) > BigInt(known.priceWei)) {
      console.error('[vip/fulfill] value exceeds listing price:', tx.value, known.priceWei);
      return Response.json({ error: 'fulfillment_unavailable' }, { status: 409 });
    }
  } catch {
    return Response.json({ error: 'fulfillment_unavailable' }, { status: 409 });
  }

  const fnName = String(tx.function).split('(')[0];
  const settlementAbi = SEAPORT_FUNCTIONS[fnName];
  if (!settlementAbi) return Response.json({ error: 'unsupported_fulfillment' }, { status: 409 });
  let settlementCalldata: `0x${string}`;
  try {
    settlementCalldata = encodeFunctionData({
      abi: [settlementAbi] as any,
      functionName: fnName,
      args: toSeaportArgs(settlementAbi.inputs, tx.input_data ?? {}) as any,
    });
  } catch {
    return Response.json({ error: 'unsupported_fulfillment' }, { status: 409 });
  }

  const listingPrice = BigInt(known.priceWei);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 5 * 60);
  let feeWei: bigint;
  let checkoutCalldata: `0x${string}`;
  if (isV2 && perNightFloorWei != null) {
    const nights = BigInt(await fetchNights(apiKey, known.contractAddress, known.tokenId));
    feeWei = checkoutFeeV2(listingPrice, feeBps, nights, perNightFloorWei);
    checkoutCalldata = encodeFunctionData({
      abi: ELEVEN_HOTEL_CHECKOUT_V2_ABI,
      functionName: 'purchase',
      args: [String(tx.to) as `0x${string}`, settlementCalldata, BigInt(known.tokenId), listingPrice, nights, deadline],
    });
  } else {
    feeWei = checkoutFee(listingPrice, feeBps);
    checkoutCalldata = encodeFunctionData({
      abi: ELEVEN_HOTEL_CHECKOUT_ABI,
      functionName: 'purchase',
      args: [String(tx.to) as `0x${string}`, settlementCalldata, BigInt(known.tokenId), listingPrice, deadline],
    });
  }
  const totalWei = listingPrice + feeWei;

  return Response.json({
    ok: true,
    tokenId: known.tokenId,
    priceWei: known.priceWei,
    feeWei: feeWei.toString(),
    totalWei: totalWei.toString(),
    feeBps,
    tx: {
      to: checkoutAddress,
      value: totalWei.toString(),
      data: checkoutCalldata,
    },
  }, { headers: { 'cache-control': 'no-store' } });
};
