import { defineMiddleware } from 'astro:middleware';

// キャッシュ禁止が必要なパスパターン
const NO_CACHE_RE = /^\/(vip|hospitality|private|collections)(\/|$)|^\/api\/hospitality\//;

// 管理画面もキャッシュ禁止
const ADMIN_RE = /^\/(admin|ai)(\/|$)/;

// Googleインデックス禁止（各ページのnoindexメタタグに加えた多層防御。HTMLパース不要で効き、
// 将来このパス配下に新しいページが増えても自動的にカバーされる）
const NO_INDEX_RE = /^\/admin(\/|$)|^\/ai(\/|$)|^\/private(\/|$)|^\/collections(\/|$)|^\/(en\/)?vip\/(keys|request-access)(\/|$)/;

// Content-Security-Policy（本番のみ適用。dev は HMR を壊さないよう除外）
// 注: GA / JSON-LD など is:inline スクリプトを多用しているため script-src は
//     'unsafe-inline' を許容。将来 nonce 方式へ移行して 'unsafe-inline' を外す。
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "media-src 'self' https: blob:",
  // WalletConnect（/stay/[tokenId] のモバイル購入フォールバック）のリレー・ウォレット一覧・検証用ドメインを許可
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.supabase.co https://cloudflareinsights.com wss://*.walletconnect.com wss://*.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const onRequest = defineMiddleware(async (_ctx, next) => {
  const path = new URL(_ctx.request.url).pathname;

  const res = await next();

  const headers = new Headers(res.headers);

  // ── Security headers (全ルート) ──────────────────────────
  headers.set('X-Frame-Options',           'DENY');
  headers.set('X-Content-Type-Options',    'nosniff');
  headers.set('Referrer-Policy',           'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy',        'camera=(), microphone=(), geolocation=()');

  // ── CSP / HSTS（本番のみ。HSTS は HTTPS 応答でのみ有効）──────
  if (import.meta.env.PROD) {
    headers.set('Content-Security-Policy', CSP);
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // ── Cache-Control (プライベート・認証ルート) ─────────────
  if (NO_CACHE_RE.test(path) || ADMIN_RE.test(path)) {
    headers.set('Cache-Control', 'no-store, private');
    headers.set('Pragma',        'no-cache');
    // Cloudflare に認証済みレスポンスをキャッシュさせない
    headers.set('CDN-Cache-Control', 'no-store');
  }

  // ── X-Robots-Tag（管理画面・非公開ページ） ─────────────
  if (NO_INDEX_RE.test(path)) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return new Response(res.body, {
    status:     res.status,
    statusText: res.statusText,
    headers,
  });
});
