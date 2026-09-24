type Env = {
  ADMIN_SECRET: string;
  SLACK_WEBHOOK_URL?: string;
};

const ALLOWED_ORIGIN = 'https://11hotel.vip';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Vary': 'Origin',
  };
}

function withCors(response: Response, origin: string | null): Response {
  const next = new Response(response.body, response);
  for (const [key, value] of Object.entries(cors(origin))) next.headers.set(key, value);
  return next;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/notify-slack') {
      return new Response('Not Found', { status: 404 });
    }
    if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
      return withCors(Response.json({ error: 'unauthorized' }, { status: 401 }), origin);
    }
    if (!env.SLACK_WEBHOOK_URL) {
      return withCors(Response.json({ error: 'slack not configured' }, { status: 503 }), origin);
    }

    const body = await request.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.slice(0, 3000) : '';
    if (!text) {
      return withCors(Response.json({ error: 'text required' }, { status: 400 }), origin);
    }

    const result = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!result.ok) {
      return withCors(Response.json({ error: `slack ${result.status}` }, { status: 502 }), origin);
    }
    return withCors(Response.json({ ok: true }), origin);
  },
};
