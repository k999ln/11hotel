-- 202607030002_stay_deals.sql
-- 宿泊券(OpenSea NFT / THE KEY)の「購入相談 → 商談化」を管理するテーブル。
-- 既存の 202607030001_stay_referral_clicks.sql（送客計測）とは別の追加テーブル。
--
-- 方針（stay_referral_clicks と同じ）:
-- - public クライアントにはポリシーを付けない。挿入・参照は service role（/api/stays/inquiry と admin API）経由のみ。
-- - 11hotel は NFT・代金を預からない。決済/移転は OpenSea 上。11hotel は購入相談・販売者接続・進捗管理・成約確認を担当。
-- - referral_fee（紹介料）・契約・NFT/宿泊権の表示・法的位置づけは専門家確認を前提とする（text で柔軟に保持）。

create table if not exists public.stay_deals (
  id                 uuid primary key default gen_random_uuid(),

  -- 対象出品のスナップショット（出品が消えても記録が残る）
  token_id           text not null,
  order_hash         text,
  display_price_eth  numeric,                 -- 相談時点の表示価格
  desired_price_eth  numeric,                 -- 購入希望価格
  house              text,
  prefecture         text,
  place              text,
  checkin_date       date,
  nights             integer,

  -- 購入希望者情報
  buyer_name           text,
  buyer_email          text,
  buyer_contact_method text,                  -- email / line / whatsapp / phone / instagram / other
  buyer_contact_handle text,
  buyer_wallet_address text,                  -- MetaMask 接続時のみ（読み取り。任意）
  purpose              text,                  -- 利用目的
  message              text,

  -- 販売者情報（管理者が接続後に入力）
  seller_name        text,
  seller_contact     text,
  seller_notes       text,

  -- 流入・担当・進捗
  source             text,
  campaign           text,
  referrer           text,
  assignee           text,
  status             text not null default 'new'
    check (status in ('new','qualified','seller_contacted','negotiating','redirected','closed','lost')),
  history            jsonb default '[]',      -- 商談履歴 [{at,by,type,note}]

  -- 成約
  close_amount_eth   numeric,
  referral_fee       text,                    -- 金額/率/条件（専門家確認前提）
  closed_at          timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists stay_deals_status_idx  on public.stay_deals (status, created_at desc);
create index if not exists stay_deals_token_idx    on public.stay_deals (token_id, created_at desc);

alter table public.stay_deals enable row level security;

-- public クライアントにはポリシーを付けない（service role のみ）。多層防御で直接権限も剥奪。
revoke all on table public.stay_deals from anon, authenticated;
