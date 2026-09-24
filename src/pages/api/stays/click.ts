import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { OPENSEA_STAY_COLLECTION } from '@/lib/opensea-stays';

const TOKEN_ID_RE = /^\d{1,78}$/;
const ORDER_HASH_RE = /^0x[a-f0-9]{64}$/i;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const tokenId = typeof body.tokenId === 'string' ? body.tokenId : '';
  const orderHash = typeof body.orderHash === 'string' ? body.orderHash : '';
  if (!TOKEN_ID_RE.test(tokenId) || (orderHash && !ORDER_HASH_RE.test(orderHash))) {
    return new Response(null, { status: 400 });
  }

  try {
    const supabase = createClient(
      import.meta.env.SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { error } = await supabase.from('stay_referral_clicks').insert({
      collection_slug: OPENSEA_STAY_COLLECTION,
      token_id: tokenId,
      order_hash: orderHash || null,
      source_path: '/stay',
      referrer_host: (() => {
        try { return new URL(request.headers.get('referer') ?? '').host || null; } catch { return null; }
      })(),
    });
    if (error) console.warn('[stays/click]', error.message);
  } catch (error) {
    console.warn('[stays/click]', error instanceof Error ? error.message : error);
  }

  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
