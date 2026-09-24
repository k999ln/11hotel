export const ELEVEN_HOTEL_CHECKOUT_ABI = [{
  type: 'function',
  name: 'purchase',
  stateMutability: 'payable',
  inputs: [
    { name: 'settlement', type: 'address' },
    { name: 'settlementCalldata', type: 'bytes' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'listingPrice', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  outputs: [],
}, {
  type: 'function',
  name: 'feeBps',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ name: '', type: 'uint16' }],
}, {
  type: 'event',
  name: 'Purchased',
  inputs: [
    { name: 'buyer', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
    { name: 'listingPrice', type: 'uint256', indexed: false },
    { name: 'fee', type: 'uint256', indexed: false },
    { name: 'settlement', type: 'address', indexed: true },
  ],
}] as const;

export function checkoutFee(listingPrice: bigint, feeBps: number): bigint {
  if (listingPrice < 0n || !Number.isInteger(feeBps) || feeBps <= 0 || feeBps > 3000) {
    throw new RangeError('invalid checkout pricing');
  }
  return (listingPrice * BigInt(feeBps) + 9_999n) / 10_000n;
}

export function checkoutPricingMatches(configuredFeeBps: number, onchainFeeBps: number): boolean {
  return Number.isInteger(configuredFeeBps)
    && configuredFeeBps > 0
    && configuredFeeBps <= 3000
    && configuredFeeBps === onchainFeeBps;
}

export async function readCheckoutFeeBps(checkoutAddress: string, rpcUrl = 'https://ethereum-rpc.publicnode.com'): Promise<number | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(checkoutAddress)) return null;
  const data = encodeFunctionData({ abi: ELEVEN_HOTEL_CHECKOUT_ABI, functionName: 'feeBps' });
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: checkoutAddress, data }, 'latest'] }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json() as { result?: `0x${string}`; error?: unknown };
    if (!res.ok || !json.result || json.error) return null;
    return Number(decodeFunctionResult({ abi: ELEVEN_HOTEL_CHECKOUT_ABI, functionName: 'feeBps', data: json.result }));
  } catch {
    return null;
  }
}

// ── V2（未デプロイ・ドラフト）: 一律料率に加えて「1泊あたりの最低販売価格」の下限を設ける ──
// total = max(listingPrice + ceil(listingPrice * feeBps / 10000), perNightFloor * nights)
// fee = total - listingPrice
// 出品価格ベースの通常価格が1泊あたりperNightFloorを上回っていればそのまま料率適用、
// 下回っていればperNightFloorまで引き上げ、その差額も11hotelの利益（fee）に含める。
// perNightFloorは契約デプロイ時点のETH/JPYレートでETH建てに固定するため、為替変動で
// 実質的な円換算額はずれていく（大きくずれたら新コントラクトを再デプロイして再設定する）。
// V1と同じく契約はimmutable・アップグレード不可・管理者キーなし。
// 本番の KEY_CHECKOUT_CONTRACT / KEY_SUPPORT_FEE_BPS はまだこのV2を指していない。
export const ELEVEN_HOTEL_CHECKOUT_V2_ABI = [{
  type: 'function',
  name: 'purchase',
  stateMutability: 'payable',
  inputs: [
    { name: 'settlement', type: 'address' },
    { name: 'settlementCalldata', type: 'bytes' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'listingPrice', type: 'uint256' },
    { name: 'nights', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  outputs: [],
}, {
  type: 'function',
  name: 'feeBps',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ name: '', type: 'uint16' }],
}, {
  type: 'function',
  name: 'perNightFloor',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ name: '', type: 'uint256' }],
}, {
  type: 'event',
  name: 'Purchased',
  inputs: [
    { name: 'buyer', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
    { name: 'listingPrice', type: 'uint256', indexed: false },
    { name: 'nights', type: 'uint256', indexed: false },
    { name: 'fee', type: 'uint256', indexed: false },
    { name: 'settlement', type: 'address', indexed: true },
  ],
}] as const;

export function checkoutFeeV2(listingPrice: bigint, feeBps: number, nights: bigint, perNightFloorWei: bigint): bigint {
  if (listingPrice < 0n || !Number.isInteger(feeBps) || feeBps <= 0 || feeBps > 3000
    || nights <= 0n || perNightFloorWei < 0n) {
    throw new RangeError('invalid checkout pricing');
  }
  const rateFee = (listingPrice * BigInt(feeBps) + 9_999n) / 10_000n;
  const standardTotal = listingPrice + rateFee;
  const floorTotal = perNightFloorWei * nights;
  const total = standardTotal > floorTotal ? standardTotal : floorTotal;
  return total - listingPrice;
}

export function checkoutPricingMatchesV2(
  configured: { feeBps: number; perNightFloorWei: bigint },
  onchain: { feeBps: number; perNightFloorWei: bigint },
): boolean {
  return checkoutPricingMatches(configured.feeBps, onchain.feeBps)
    && configured.perNightFloorWei >= 0n
    && configured.perNightFloorWei === onchain.perNightFloorWei;
}

export async function readCheckoutConfigV2(
  checkoutAddress: string,
  rpcUrl = 'https://ethereum-rpc.publicnode.com',
): Promise<{ feeBps: number; perNightFloorWei: bigint } | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(checkoutAddress)) return null;
  const call = async (functionName: 'feeBps' | 'perNightFloor') => {
    const data = encodeFunctionData({ abi: ELEVEN_HOTEL_CHECKOUT_V2_ABI, functionName });
    const res = await fetch(rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: checkoutAddress, data }, 'latest'] }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json() as { result?: `0x${string}`; error?: unknown };
    if (!res.ok || !json.result || json.error) return null;
    return decodeFunctionResult({ abi: ELEVEN_HOTEL_CHECKOUT_V2_ABI, functionName, data: json.result });
  };
  try {
    const [feeBps, perNightFloor] = await Promise.all([call('feeBps'), call('perNightFloor')]);
    if (feeBps == null || perNightFloor == null) return null;
    return { feeBps: Number(feeBps), perNightFloorWei: BigInt(perNightFloor as bigint) };
  } catch {
    return null;
  }
}

// 本番のKEY_CHECKOUT_CONTRACTがV1・V2のどちらかを、環境変数KEY_NIGHTLY_FLOOR_ETHの有無だけで
// 判定する。設定されていればV2（1泊あたり最低販売価格つき）として検証し、無ければ従来のV1として扱う。
// market.ts / fulfill.ts / stay/[tokenId].astro の3箇所で同じ判定をさせ、表示と実際の請求額が
// 常に同じロジックで一致するようにする。
export async function resolveCheckoutMode(
  checkoutAddress: string,
  feeBps: number,
  nightlyFloorEthRaw: string,
  rpcUrl = 'https://ethereum-rpc.publicnode.com',
): Promise<{ ready: boolean; v2: boolean; perNightFloorWei: bigint | null }> {
  const trimmed = nightlyFloorEthRaw.trim();
  if (!trimmed) {
    const contractFeeBps = await readCheckoutFeeBps(checkoutAddress, rpcUrl);
    return { ready: contractFeeBps != null && checkoutPricingMatches(feeBps, contractFeeBps), v2: false, perNightFloorWei: null };
  }
  let perNightFloorWei: bigint;
  try {
    perNightFloorWei = parseEther(trimmed);
    if (perNightFloorWei <= 0n) throw new Error('invalid');
  } catch {
    return { ready: false, v2: true, perNightFloorWei: null };
  }
  const cfg = await readCheckoutConfigV2(checkoutAddress, rpcUrl);
  const ready = cfg != null && checkoutPricingMatchesV2({ feeBps, perNightFloorWei }, cfg);
  return { ready, v2: true, perNightFloorWei };
}

import { decodeFunctionResult, encodeFunctionData, parseEther } from 'viem';
