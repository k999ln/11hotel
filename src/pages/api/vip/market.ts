import type { APIRoute } from 'astro';
import { fetchKeyMarket } from '@/lib/key-market';
import { resolveCheckoutMode } from '@/lib/checkout';

// THE KEY 公開マーケットボード（GET, 公開）。
// - エッジキャッシュ60秒 + モジュール内キャッシュ30秒で OpenSea / Claude への負荷を抑える。
// - 取得失敗時は直近の正常データを stale として返す。

const EDGE_SECONDS = 20;
const MODULE_TTL_MS = 10_000;

let moduleCache: { payload: string; expires: number } | null = null;
let lastGoodPayload: string | null = null;

function json(body: string, status = 200, cache = false): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache
        ? `public, max-age=5, s-maxage=${EDGE_SECONDS}, stale-while-revalidate=120`
        : 'no-store',
    },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (moduleCache && moduleCache.expires > Date.now()) {
    return json(moduleCache.payload, 200, true);
  }

  const cache = (caches as unknown as { default?: Cache }).default;
  const cacheKey = new Request(new URL('/api/vip/market', request.url), { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) return cached;

  // Cloudflare Workers では waitUntil で応答後にAI生成を続行（一覧表示をブロックしない）
  // Astro v6: ExecutionContext は locals.cfContext（旧 runtime.ctx はアクセスすると例外）
  let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  try { ctx = (locals as any)?.cfContext; } catch { ctx = undefined; }
  const data = await fetchKeyMarket({
    OPENSEA_API_KEY: import.meta.env.OPENSEA_API_KEY,
    ANTHROPIC_API_KEY: import.meta.env.ANTHROPIC_API_KEY,
  }, { waitUntil: ctx?.waitUntil ? ctx.waitUntil.bind(ctx) : undefined });

  if ('error' in data) {
    if (lastGoodPayload) {
      const stale = JSON.parse(lastGoodPayload) as Record<string, unknown>;
      stale.stale = true;
      return json(JSON.stringify(stale), 200, false);
    }
    return json(JSON.stringify(data), data.setupRequired ? 503 : 502, false);
  }

  // OpenSea上の直接購入価格には上乗せできないため、11hotel購入サポートの
  // 成約手数料率を別建てで公開する。既定5%、本番環境変数で変更可能。
  const configuredBps = Number(import.meta.env.KEY_SUPPORT_FEE_BPS ?? 500);
  const supportFeeBps = Number.isFinite(configuredBps)
    ? Math.max(1, Math.min(3000, Math.round(configuredBps)))
    : 500;
  const checkoutAddress = String(import.meta.env.KEY_CHECKOUT_CONTRACT ?? '').trim();
  const nightlyFloorEthRaw = String(import.meta.env.KEY_NIGHTLY_FLOOR_ETH ?? '');
  const { ready: checkoutReady, v2 } = await resolveCheckoutMode(checkoutAddress, supportFeeBps, nightlyFloorEthRaw);
  if (!checkoutReady) console.error('[vip/market] checkout disabled:', { supportFeeBps, v2 });
  // V2稼働時は決済コントラクトに固定された実際の下限値をそのままクライアントへ渡し、
  // カード表示（1泊あたり最低販売価格）と実際の請求額が常に同じ数値を参照するようにする
  const nightlyFloorEth = v2 && nightlyFloorEthRaw.trim() ? Number(nightlyFloorEthRaw.trim()) : null;
  const payload = JSON.stringify({ ...data, supportFeeBps, checkoutReady, nightlyFloorEth });
  moduleCache = { payload, expires: Date.now() + MODULE_TTL_MS };
  lastGoodPayload = payload;

  const response = json(payload, 200, true);
  if (cache) await cache.put(cacheKey, response.clone());
  return response;
};
