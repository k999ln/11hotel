import type { APIRoute } from 'astro';
import { OPENSEA_STAY_COLLECTION } from '@/lib/opensea-stays';

// 指定ウォレットが所有する THE KEY NFT の一覧（POST, 公開・読み取りのみ）。
// - 秘密鍵・署名は扱わない。アドレスの形式チェックのみで OpenSea に問い合わせる。
// - ウォレット単位でモジュール内60秒キャッシュ。

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const TTL_MS = 60_000;
const cacheByWallet = new Map<string, { payload: string; expires: number }>();

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as { walletAddress?: string } | null;
  const address = body?.walletAddress?.trim().toLowerCase() ?? '';
  if (!ADDR_RE.test(address)) {
    return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const apiKey = import.meta.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENSEA_API_KEY is not configured', setupRequired: true }, { status: 503 });
  }

  const hit = cacheByWallet.get(address);
  if (hit && hit.expires > Date.now()) {
    return new Response(hit.payload, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  try {
    // ページネーション対応（50件×最大4ページ＝200件まで）
    const raw: Array<Record<string, unknown>> = [];
    let next = '';
    for (let page = 0; page < 4; page++) {
      const q = next ? `&next=${encodeURIComponent(next)}` : '';
      const res = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=${OPENSEA_STAY_COLLECTION}&limit=50${q}`,
        { headers: { accept: 'application/json', 'x-api-key': apiKey }, signal: AbortSignal.timeout(12000) },
      );
      if (!res.ok) {
        return Response.json({ error: 'OpenSeaの照会に失敗しました' }, { status: 502 });
      }
      const data = await res.json() as { nfts?: Array<Record<string, unknown>>; next?: string };
      raw.push(...(data.nfts ?? []));
      next = typeof data.next === 'string' ? data.next : '';
      if (!next) break;
    }
    const nfts = raw.map((n) => ({
      tokenId: n.identifier != null ? String(n.identifier) : '',
      name: typeof n.name === 'string' ? n.name : '',
      imageUrl: typeof n.display_image_url === 'string' ? n.display_image_url
        : typeof n.image_url === 'string' ? n.image_url : null,
      openseaUrl: typeof n.opensea_url === 'string' ? n.opensea_url : '',
    })).filter((n) => n.tokenId);

    const payload = JSON.stringify({ walletAddress: address, count: nfts.length, nfts });
    cacheByWallet.set(address, { payload, expires: Date.now() + TTL_MS });
    // 簡易的なサイズ上限（メモリ保護）
    if (cacheByWallet.size > 500) {
      const oldest = cacheByWallet.keys().next().value;
      if (oldest) cacheByWallet.delete(oldest);
    }
    return new Response(payload, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch {
    return Response.json({ error: 'OpenSeaの照会に失敗しました' }, { status: 502 });
  }
};
