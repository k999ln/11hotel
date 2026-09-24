import type { AstroCookies } from 'astro';

const ALLOWED_ORIGINS = new Set([
  'https://11hotel.vip',
  'http://localhost:4321',
  'http://localhost:3000',
]);

export function requireAdmin(
  cookies: AstroCookies,
  request: Request,
): Response | null {
  const token = cookies.get('admin_token')?.value;
  if (!token || token !== import.meta.env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // CSRF: 状態変更リクエストは Origin を厳格検証（fail-closed）。
  // Origin が無い／許可リスト外なら拒否する。一部のブラウザは同一オリジンの
  // POST で Origin を送らないことがあるが、その場合は Referer を代替確認する。
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    let allowed = false;
    if (origin) {
      allowed = ALLOWED_ORIGINS.has(origin);
    } else {
      // Origin 欠落時は Referer のオリジンで判定
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          allowed = ALLOWED_ORIGINS.has(new URL(referer).origin);
        } catch {
          allowed = false;
        }
      }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
