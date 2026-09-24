import type { APIContext } from 'astro';

export function requireSameOrigin(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  const isLocal = requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';

  if (!origin) {
    if (isLocal) return null;
    return Response.json({ error: 'origin_required' }, { status: 403 });
  }

  try {
    if (new URL(origin).origin !== requestUrl.origin) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
  } catch {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}

export function clientIp(ctx: APIContext): string {
  const cfIp = ctx.request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.slice(0, 80);
  try {
    return (ctx.clientAddress || 'unknown').slice(0, 80);
  } catch {
    return 'unknown';
  }
}

export function storedTxHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as { tx_hash?: unknown };
    return typeof parsed.tx_hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(parsed.tx_hash)
      ? parsed.tx_hash.toLowerCase()
      : null;
  } catch {
    return null;
  }
}
