import type { APIRoute } from 'astro';
import { fetchStayListings } from '@/lib/opensea-stays';

const CACHE_SECONDS = 30;
const STALE_SECONDS = 120;
const API_CACHE_VERSION = 'hotel-photo-v2';
let lastGoodPayload: string | null = null;

function json(body: string, status = 200, cache = false): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache
        ? `public, max-age=10, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
        : 'no-store',
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return json(JSON.stringify({
      error: 'OPENSEA_API_KEY is not configured',
      setupRequired: true,
    }), 503);
  }

  const cache = (caches as unknown as { default?: Cache }).default;
  const cacheUrl = new URL('/api/stays/opensea', request.url);
  cacheUrl.searchParams.set('v', API_CACHE_VERSION);
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) return cached;

  try {
    const data = await fetchStayListings(apiKey);
    const configuredFeeBps = Number(import.meta.env.KEY_SUPPORT_FEE_BPS ?? 500);
    const supportFeeBps = Number.isFinite(configuredFeeBps) ? Math.max(0, Math.min(3000, Math.round(configuredFeeBps))) : 500;
    const payload = JSON.stringify({ ...data, supportFeeBps });
    lastGoodPayload = payload;
    const response = json(payload, 200, true);
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    console.error('[stays/opensea]', error instanceof Error ? error.message : error);
    if (lastGoodPayload) {
      const stale = JSON.parse(lastGoodPayload) as Record<string, unknown>;
      stale.stale = true;
      return json(JSON.stringify(stale), 200, false);
    }
    return json(JSON.stringify({ error: 'OpenSeaの出品情報を取得できませんでした' }), 502);
  }
};
