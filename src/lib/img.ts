const SUPABASE_OBJECT_PREFIX = '/storage/v1/object/public/';
const SUPABASE_RENDER_PREFIX = '/storage/v1/render/image/public/';

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function toSupabaseRenderUrl(url: string, width?: number, quality?: number): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!parsed.hostname.endsWith('.supabase.co')) return null;

  let storagePath = '';
  if (parsed.pathname.startsWith(SUPABASE_OBJECT_PREFIX)) {
    storagePath = parsed.pathname.slice(SUPABASE_OBJECT_PREFIX.length);
  } else if (parsed.pathname.startsWith(SUPABASE_RENDER_PREFIX)) {
    storagePath = parsed.pathname.slice(SUPABASE_RENDER_PREFIX.length);
  } else {
    return null;
  }
  if (!storagePath) return null;

  parsed.pathname = `${SUPABASE_RENDER_PREFIX}${storagePath}`;
  if (width) parsed.searchParams.set('width', String(clampInt(width, 1200, 64, 2400)));
  if (quality) parsed.searchParams.set('quality', String(clampInt(quality, 76, 40, 90)));
  return parsed.toString();
}

export function cfImage(
  url: string | null | undefined,
  width?: number,
  quality = 76,
): string | null {
  if (!url) return null;
  return toSupabaseRenderUrl(url, width, quality) ?? url;
}

export function cfImageSrcset(
  url: string | null | undefined,
  sizes = [480, 768, 1200, 1600],
  quality = 76,
): string | undefined {
  if (!url) return undefined;
  const srcset = [...new Set(sizes)]
    .map(size => clampInt(size, 1200, 64, 2400))
    .sort((a, b) => a - b)
    .map(size => {
      const transformed = cfImage(url, size, quality);
      return transformed ? `${transformed} ${size}w` : null;
    })
    .filter(Boolean)
    .join(', ');
  return srcset || undefined;
}
