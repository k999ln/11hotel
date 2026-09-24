create table if not exists public.stay_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  collection_slug text not null,
  token_id text not null,
  order_hash text,
  source_path text not null default '/stay',
  referrer_host text,
  created_at timestamptz not null default now()
);

create index if not exists stay_referral_clicks_created_at_idx
  on public.stay_referral_clicks (created_at desc);

create index if not exists stay_referral_clicks_token_id_idx
  on public.stay_referral_clicks (token_id, created_at desc);

alter table public.stay_referral_clicks enable row level security;

-- Public clients receive no policy. Inserts and reporting go through the server's
-- service-role client so OpenSea referral analytics cannot be forged or enumerated.
