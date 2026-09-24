import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/admin-auth';

// 1トークンの仕入れ判断コメントを Claude で生成（運営者向け・参考。POST, requireAdmin）。
// これは投資助言ではなく、運営者自身の仕入れ判断の材料。数値は概算・非保証。

const SYSTEM_PROMPT = `あなたは NOT A HOTEL「THE KEY」宿泊券NFTの転売を検討する運営者のアシスタントです。
渡された数値（出品価格・フロア・直近成約中央値・そのトークンの前回売買・想定手数料/ガス・期待利益）をもとに、
運営者自身の仕入れ判断の“参考コメント”を日本語で簡潔に返します。次を厳守:
- 「買い妙味あり / 様子見 / 見送り」のいずれかの見立てと、その理由を数値に即して述べる
- リスク（流動性の薄さ、チェックイン日が近い/過ぎ、手数料負け、価格のブレ）に触れる
- 断定・投資助言・利益保証はしない。最後に「※概算・非保証。最終判断はご自身で」と添える
- 120〜200字。本文のみ。`;

export const POST: APIRoute = async ({ request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => null) as any;
  if (!body?.token_id) return Response.json({ error: 'token_id required' }, { status: 400 });

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  const fallback = () => {
    const ep = Number(body.expected_profit);
    const view = Number.isFinite(ep) ? (ep > 0.05 ? '買い妙味あり' : ep > 0 ? '小幅・様子見' : '見送り') : '判断材料不足';
    return `${view}：出品 ${body.price ?? '—'} ETH に対し、参照値ベースの期待利益は ${Number.isFinite(ep) ? ep.toFixed(4) : '—'} ETH。流動性の薄さ・チェックイン日・手数料負けに注意。※概算・非保証。最終判断はご自身で。`;
  };

  if (!apiKey) return Response.json({ ok: true, text: fallback(), generated_by: 'template' });

  const context = [
    `HOUSE: ${body.house ?? '—'}`,
    `Token: ${body.token_id}`,
    `チェックイン: ${body.checkin_label ?? '—'} / ${body.nights ?? '—'}泊`,
    `出品価格: ${body.price ?? '—'} ETH`,
    `フロア: ${body.floor ?? '—'} ETH`,
    `直近成約中央値: ${body.recent_median ?? '—'} ETH`,
    `このトークンの前回売買: ${body.last_sale ?? '—'} ETH`,
    `想定手数料率: ${body.fee_pct ?? '—'}% / ガス: ${body.gas ?? '—'} ETH`,
    `試算した期待利益: ${body.expected_profit ?? '—'} ETH`,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `次の宿泊券の仕入れ判断コメントを:\n\n${context}` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return Response.json({ ok: true, text: fallback(), generated_by: 'template_fallback' });
    const json = await res.json();
    const text = json.content?.[0]?.text?.trim() || fallback();
    return Response.json({ ok: true, text, generated_by: 'ai' });
  } catch {
    return Response.json({ ok: true, text: fallback(), generated_by: 'template_fallback' });
  }
};
