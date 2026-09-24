import type { APIRoute } from 'astro';
import {
  json,
  listCommands,
  requireBridge,
  saveSnapshot,
  updateCommand,
} from '@/lib/ai-control';

export const GET: APIRoute = async ({ request }) => {
  const authErr = await requireBridge(request);
  if (authErr) return authErr;
  try {
    const pending = await listCommands(new Set(['pending', 'running']));
    return json({
      ok: true,
      commands: pending.map((command) => ({
        id: command.id,
        action: command.action,
        payload: command.payload,
        status: command.status,
        created_at: command.created_at,
      })),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'bridge failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const authErr = await requireBridge(request);
  if (authErr) return authErr;
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return json({ error: 'invalid body' }, 400);
    }
    const type = String(body.type ?? '');
    if (type === 'snapshot') {
      await saveSnapshot(body.snapshot);
      return json({ ok: true });
    }
    if (type === 'command_result') {
      const updated = await updateCommand(
        String(body.id ?? ''),
        body.status,
        body.result,
        body.error,
      );
      if (!updated) return json({ error: 'command not found' }, 404);
      return json({ ok: true, id: updated.id, status: updated.status });
    }
    return json({ error: 'unsupported type' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'bridge failed' }, 400);
  }
};
