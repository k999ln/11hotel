import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/admin-auth';
import { buildPublicStatus, json } from '@/lib/ai-control';

export const GET: APIRoute = async ({ request, cookies }) => {
  const authErr = requireAdmin(cookies, request);
  if (authErr) return authErr;
  try {
    return json(await buildPublicStatus());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'status failed' }, 500);
  }
};
