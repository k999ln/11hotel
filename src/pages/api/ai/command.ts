import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/admin-auth';
import { json, publicCommand, queueCommand } from '@/lib/ai-control';

export const POST: APIRoute = async ({ request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const command = await queueCommand(body.action, body.payload);
    return json({ ok: true, queued: true, command: publicCommand(command) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'command failed' }, 400);
  }
};
