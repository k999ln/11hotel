-- 202607030003_stay_inventory.sql
-- 「11hotel自身が仕入れて転売」の在庫・損益を管理するテーブル（非カストディアル）。
--
-- 重要な前提（安全設計）:
-- - 実際の売買・NFT移転・署名は、運営者が自分のウォレットで OpenSea 上で行う。
-- - 11hotel のサーバーはウォレット秘密鍵も資金も保持しない。ここは「記録・管理」だけ。
-- - よって custody（顧客資産の預かり）には当たらない。運営者自身の資産の在庫管理。
--
-- 方針（他テーブルと同じ）:
-- - public クライアントにはポリシーを付けない。参照/更新は service role（admin API）経由のみ。

create table if not exists public.stay_inventory (
  id                 uuid primary key default gen_random_uuid(),

  -- 対象NFTのスナップショット
  token_id           text not null,
  chain              text,
  contract_address   text,
  house              text,
  prefecture         text,
  place              text,
  checkin_date       date,
  nights             integer,
  image_url          text,
  opensea_url        text,

  -- ステータス: 候補 → 仕入済 → 出品中 → 売却 / 見送り
  status             text not null default 'candidate'
    check (status in ('candidate','bought','listed','sold','dropped')),

  -- 価格・日付（ETH建て。実額は運営者がOpenSea/ウォレットで確認して入力）
  buy_price_eth      numeric,   -- 仕入れ額
  bought_at          timestamptz,
  list_price_eth     numeric,   -- 出品額
  listed_at          timestamptz,
  sold_price_eth     numeric,   -- 売却額
  sold_at            timestamptz,
  fees_eth           numeric default 0,  -- ガス/マーケット手数料の概算（任意）

  wallet_address     text,      -- 実行に使った運営者ウォレット（記録用・任意）
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 実現損益 = sold_price_eth - buy_price_eth - fees_eth（sold のとき）はアプリ側で集計する。

create index if not exists stay_inventory_status_idx on public.stay_inventory (status, updated_at desc);
create index if not exists stay_inventory_token_idx   on public.stay_inventory (token_id);

alter table public.stay_inventory enable row level security;
revoke all on table public.stay_inventory from anon, authenticated;
