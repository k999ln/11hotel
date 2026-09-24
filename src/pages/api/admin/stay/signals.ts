import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/admin-auth';
import { fetchProfitData } from '@/lib/stay-profit';

// 運営者向けの利益シグナル取得（GET, requireAdmin）。
// ポーリングで叩かれるため、OpenSea 負荷を抑える短命の in-memory キャッシュを挟む。

let cache: { at: number; body: string; status: number } | null = null;
const TTL_MS = 20_000;

export const GET: APIRoute = async ({ request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  if (cache && Date.now() - cache.at < TTL_MS) {
    return new Response(cache.body, { status: cache.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  const data = await fetchProfitData({ OPENSEA_API_KEY: import.meta.env.OPENSEA_API_KEY });
  const status = ('error' in data) ? ((data as any).setupRequired ? 503 : 502) : 200;
  const body = JSON.stringify(data);
  if (status === 200) cache = { at: Date.now(), body, status };

  return new Response(body, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};
