import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { decodeEventLog } from 'viem';
import { ELEVEN_HOTEL_CHECKOUT_ABI } from '@/lib/checkout';
import { clientIp, requireSameOrigin, storedTxHash } from '@/lib/public-api-security';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const RL_LIMIT = 40;
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

const rpc = async (method: string, params: unknown[]) => {
  const res = await fetch('https://ethereum-rpc.publicnode.com', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  const json = await res.json() as any;
  if (!res.ok || json.error) throw new Error('rpc_failed');
  return json.result;
};

export const POST: APIRoute = async (ctx) => {
  const { request } = ctx;
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (rateLimited(clientIp(ctx))) return Response.json({ error: 'rate_limited' }, { status: 429 });
  const body = await request.json().catch(() => null) as { id?: string; txHash?: string } | null;
  const id = body?.id?.trim() ?? '';
  const txHash = body?.txHash?.trim() ?? '';
  if (!UUID_RE.test(id) || !TX_RE.test(txHash)) return Response.json({ error: 'invalid_request' }, { status: 400 });

  const checkout = String(import.meta.env.KEY_CHECKOUT_CONTRACT ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(checkout)) return Response.json({ error: 'not_configured' }, { status: 503 });
  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: deal } = await supabase.from('stay_deals').select('id,token_id,buyer_wallet_address,status,referral_fee,history').eq('id', id).single();
  if (!deal) return Response.json({ error: 'not_found' }, { status: 404 });
  const boundTxHash = storedTxHash(deal.referral_fee);
  if (!boundTxHash || boundTxHash !== txHash.toLowerCase()) {
    return Response.json({ error: 'transaction_mismatch' }, { status: 403 });
  }
  if (deal.status === 'closed') return Response.json({ status: 'confirmed' });
  if (deal.status === 'lost') return Response.json({ status: 'failed' });

  const receipt = await rpc('eth_getTransactionReceipt', [txHash]).catch(() => null);
  if (!receipt) return Response.json({ status: 'pending' });
  const history = Array.isArray(deal.history) ? deal.history : [];
  if (String(receipt.transactionHash ?? '').toLowerCase() !== txHash.toLowerCase()) {
    return Response.json({ error: 'transaction_mismatch' }, { status: 403 });
  }
  if (receipt.status !== '0x1' || String(receipt.to).toLowerCase() !== checkout) {
    await supabase.from('stay_deals').update({ status: 'lost', history: [...history, { at: new Date().toISOString(), by: 'system', type: 'purchase_failed', note: `tx ${txHash}` }] }).eq('id', id).eq('status', 'negotiating');
    return Response.json({ status: 'failed' });
  }

  let purchased: any = null;
  for (const log of receipt.logs ?? []) {
    if (String(log.address).toLowerCase() !== checkout) continue;
    try {
      const decoded = decodeEventLog({ abi: ELEVEN_HOTEL_CHECKOUT_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'Purchased') purchased = decoded.args;
    } catch { /* unrelated log */ }
  }
  if (!purchased || String(purchased.tokenId) !== String(deal.token_id)
    || (deal.buyer_wallet_address && String(purchased.buyer).toLowerCase() !== String(deal.buyer_wallet_address).toLowerCase())) {
    return Response.json({ status: 'pending' });
  }
  const listingEth = Number(purchased.listingPrice) / 1e18;
  const feeEth = Number(purchased.fee) / 1e18;
  const totalEth = listingEth + feeEth;
  const rateBps = Number(import.meta.env.KEY_SUPPORT_FEE_BPS ?? 500);
  const revenue = JSON.stringify({ rate_bps: rateBps, listing_eth: listingEth, fee_eth: feeEth, total_eth: totalEth, tx_hash: txHash, confirmed: true });
  await supabase.from('stay_deals').update({
    status: 'closed', display_price_eth: listingEth, close_amount_eth: totalEth,
    referral_fee: revenue, closed_at: new Date().toISOString(),
    message: `サイト内購入確定。販売総額 ${totalEth} ETH / 11hotel取扱料 ${feeEth} ETH / tx: https://etherscan.io/tx/${txHash}`,
    history: [...history, { at: new Date().toISOString(), by: 'system', type: 'purchase_confirmed', note: `total ${totalEth} ETH / fee ${feeEth} ETH / tx ${txHash}` }],
  }).eq('id', id).eq('status', 'negotiating');
  return Response.json({ status: 'confirmed', listingEth, feeEth, totalEth });
};
