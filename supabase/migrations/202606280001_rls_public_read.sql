-- 公開トップを service role から anon キー + RLS へ移すための土台。
--
-- 方針:
--   hotels             … 公開テーブル。anon は status='published' の行のみ SELECT 可。
--   hospitality_assets … 機微テーブル。anon ポリシーは付けない（= anon は読めない）。
--                        アプリは service role で読むため RLS をバイパスして従来通り動作する。
--                        anon キーが万一漏れても匿名ティーザー含め一切読めない状態にする。
--
-- 適用順: このマイグレーションを先に本番へ適用 → その後 index.astro を anon クライアントへ切替。
-- 冪等性: 既にポリシー/RLSが有効でも壊れないよう DROP IF EXISTS / IF NOT EXISTS を使用。

-- ── hotels: 公開行のみ anon/authenticated に開放 ───────────────────────────
alter table public.hotels enable row level security;

-- anon/authenticated にテーブルレベルの SELECT 権限を付与（RLS が行を絞る）
grant select on table public.hotels to anon, authenticated;

drop policy if exists "public read published hotels" on public.hotels;
create policy "public read published hotels"
  on public.hotels
  for select
  to anon, authenticated
  using (status = 'published');

-- ── hospitality_assets: RLS 有効化のみ。anon ポリシーは付けない ─────────────
-- service role は RLS をバイパスするため、アプリ（index.astro の gated クエリ／
-- 管理画面／VIP トークン検証）は従来通り動作する。
alter table public.hospitality_assets enable row level security;

-- 念のため anon/authenticated の直接 SELECT 権限を剥奪（ポリシーが無いので実質読めないが、
-- 権限自体を絞っておく。service role は別ロールのため影響なし）。
revoke select on table public.hospitality_assets from anon, authenticated;
