-- 旧Editorial / 撮影営業 / AIタスク / Private Inquiry / Hospitalityを完全撤去する。
-- THE KEYのstay_*テーブル、決済ログ、admin_audit_logsは保持する。

drop table if exists public.place_relationships cascade;

drop table if exists public.photography_appointments cascade;
drop table if exists public.photography_outreach cascade;

drop table if exists public.ai_tasks cascade;

drop table if exists public.private_signal_notifications cascade;
drop table if exists public.private_collection_requests cascade;
drop table if exists public.private_collections cascade;
drop table if exists public.private_inquiry_signals cascade;

drop table if exists public.hospitality_asset_favorites cascade;
drop table if exists public.hospitality_asset_shoots cascade;
drop table if exists public.hospitality_private_docs cascade;
drop table if exists public.hospitality_access_logs cascade;
drop table if exists public.hospitality_asset_grants cascade;
drop table if exists public.hospitality_sessions cascade;
drop table if exists public.hospitality_invitations cascade;
drop table if exists public.hospitality_access_requests cascade;
drop table if exists public.hospitality_assets cascade;

drop table if exists public.hotels cascade;
