-- 202607040001_security_hardening.sql
-- SECURITY-AUDIT.md の対応: 🔴B（RPC権限）/ 🟡D（hotelsカラム制限）/ 🟡E（properties休眠ポリシー）/ 🔴A（home_projects予防）
-- Supabase ダッシュボード SQL Editor での手動適用を想定（DDLのため）。

-- ── B: SECURITY DEFINER RPC を service_role 専用に（anon の RLS バイパス防止）──
-- 関数が存在しない環境ではスキップ（notice のみ）
do $$ begin
  revoke execute on function public.append_gallery_url(uuid, text) from public, anon, authenticated;
  grant execute on function public.append_gallery_url(uuid, text) to service_role;
exception when undefined_function then raise notice 'append_gallery_url not found - skipped';
end $$;

do $$ begin
  revoke execute on function public.increment_collection_view(uuid) from public, anon, authenticated;
  grant execute on function public.increment_collection_view(uuid) to service_role;
exception when undefined_function then raise notice 'increment_collection_view not found - skipped';
end $$;

do $$ begin
  revoke execute on function public.claim_invitation_key(text) from public, anon, authenticated;
  grant execute on function public.claim_invitation_key(text) to service_role;
exception when undefined_function then raise notice 'claim_invitation_key not found - skipped';
end $$;

-- ── D: hotels の anon SELECT を公開カラムのみに（notes=内部メモ / email を遮断）──
-- 注意: anon クライアントで select('*') は権限エラーになる。公開ページは明示カラム指定を維持すること
--（現状の anon 利用は index.astro / date.astro のみで、どちらも明示指定済み）。
revoke select on table public.hotels from anon;
grant select (
  id, ig_media_id, ig_permalink, source, embed_code, media_url, thumbnail_url,
  caption, slug, hotel_name, city, country, area, themes, tags, price_range,
  booking_url, agoda_url, jalan_url, status, posted_at, created_at, updated_at, category,
  ikkyu_url, ikkyu_restaurant_url, jtb_url, yahoo_travel_url, gallery_urls, video_url,
  phone_number, official_url, map_url, tagline, overview, details
) on table public.hotels to anon;

-- ── E: 休眠 properties テーブルの anon 公開ポリシーを撤去（事業方針転換に整合）──
drop policy if exists "Public can read published properties" on public.properties;
revoke select on table public.properties from anon;

-- ── A(予防): home_projects が存在する環境では RLS を必ず有効化 ──
alter table if exists public.home_projects enable row level security;
