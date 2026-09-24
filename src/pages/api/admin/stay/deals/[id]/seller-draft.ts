import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

// 販売者への連絡文ドラフトを生成する（送信はしない・下書きのみ）。
// ANTHROPIC_API_KEY があれば Claude で作成、無ければテンプレートで返す。requireAdmin で保護。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SYSTEM_PROMPT = `あなたは11hotelの担当者アシスタントです。OpenSeaで宿泊券NFT(NOT A HOTEL THE KEY)を出品している販売者へ、
購入希望者が現れたことを丁寧に伝える日本語の連絡文の下書きを作成します。次の条件を厳守してください。
- 11hotelは仲介業者ではなく、購入希望者と販売者をつなぐ案内役であること
- 11hotelは代金やNFTを預からず、決済とNFT移転はOpenSea上で行われること
- 価格・宿泊権・真正性を保証しないこと
- 断定的・強引な表現を避け、丁寧でフラットな文章にすること
- 価格交渉を11hotelが行うと約束しないこと
出力は本文のみ。署名は「11hotel」。200〜320字程度。`;

function fallbackTemplate(deal: any): string {
  const house = deal.house || 'ご出品の宿泊券';
  const price = deal.display_price_eth != null ? `${deal.display_price_eth} ETH` : '—';
  const desired = deal.desired_price_eth != null ? `${deal.desired_price_eth} ETH` : '未指定';
  return [
    `${house}（Token ID #${deal.token_id}）のご出品を拝見し、ご連絡いたしました。`,
    '',
    'この宿泊券に関心をお持ちの購入希望者の方から、11hotel宛にお問い合わせをいただいております。',
    `現在の出品価格：${price} / 購入希望者の希望価格帯：${desired}`,
    '',
    '11hotelは販売者様と購入希望者をおつなぎする案内役です。決済およびNFTの移転はOpenSea上で行われ、',
    '11hotelが代金やNFTをお預かりすることはございません。価格・宿泊権・真正性を保証するものでもございません。',
    '',
    'もしご対応いただける場合は、OpenSea上でのお取引に向けて、ご希望条件をお聞かせいただけますと幸いです。',
    '',
    '11hotel',
  ].join('\n');
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });

  const supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: deal, error } = await supabase
    .from('stay_deals')
    .select('token_id, house, prefecture, place, checkin_date, nights, display_price_eth, desired_price_eth, purpose')
    .eq('id', id)
    .single();
  if (error || !deal) return Response.json({ error: 'deal not found' }, { status: 404 });

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: true, draft: fallbackTemplate(deal), generated_by: 'template' });
  }

  try {
    const context = [
      `施設: ${deal.house ?? '—'}`,
      `場所: ${[deal.prefecture, deal.place].filter(Boolean).join(' / ') || '—'}`,
      `Token ID: ${deal.token_id}`,
      `チェックイン: ${deal.checkin_date ?? '—'} / ${deal.nights ?? '—'}泊`,
      `出品価格: ${deal.display_price_eth ?? '—'} ETH`,
      `購入希望価格: ${deal.desired_price_eth ?? '未指定'} ETH`,
      `利用目的: ${deal.purpose ?? '—'}`,
    ].join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `次の商談情報をもとに、販売者への連絡文の下書きを作成してください。\n\n${context}` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.error('[seller-draft] Claude error:', res.status);
      return Response.json({ ok: true, draft: fallbackTemplate(deal), generated_by: 'template_fallback' });
    }
    const json = await res.json();
    const text: string = json.content?.[0]?.text?.trim() || fallbackTemplate(deal);
    return Response.json({ ok: true, draft: text, generated_by: 'ai' });
  } catch (e: any) {
    console.error('[seller-draft] error:', e?.message);
    return Response.json({ ok: true, draft: fallbackTemplate(deal), generated_by: 'template_fallback' });
  }
};
