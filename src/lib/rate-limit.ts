import { createClient } from '@supabase/supabase-js';

export async function checkRateLimit(opts: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  event: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ limited: boolean; count: number }> {
  const supabase = createClient(opts.supabaseUrl, opts.supabaseServiceKey);
  const since = new Date(Date.now() - opts.windowMs).toISOString();
  const { count, error } = await supabase
    .from('admin_audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('action', opts.event)
    .eq('target', opts.key)
    .gte('created_at', since);

  if (error) {
    console.error('[checkRateLimit] DB error:', error.message);
    return { limited: true, count: 0 };
  }
  const value = count ?? 0;
  const limited = value >= opts.limit;
  if (!limited) {
    const { error: insertError } = await supabase.from('admin_audit_logs').insert({
      action: opts.event,
      target: opts.key,
      detail: { kind: 'rate_limit' },
    });
    if (insertError) {
      console.error('[checkRateLimit] insert error:', insertError.message);
      return { limited: true, count: value };
    }
  }
  return { limited, count: value };
}
