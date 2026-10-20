-- Macro-economic indicators for Kenya: CPI (YoY), Central Bank Rate,
-- KES/USD FX, T-bill auction rates. Ingested by the
-- /api/public/hooks/ingest-macro cron hook (service-role writes); the public
-- economy page and the /pulse strip read via anon. Rows are tagged
-- verified=false until the owner validates a scrape against the live source.

create table if not exists public.macro_indicators (
  id           uuid primary key default gen_random_uuid(),
  indicator    text not null,          -- 'cpi_yoy' | 'cbr' | 'fx_usd' | 'tbill_91' | 'tbill_182' | 'tbill_364'
  country      text not null default 'KE',
  value        numeric not null,
  unit         text,                   -- e.g. '%', 'KES/USD'
  released_at  timestamptz not null,
  source       text not null,          -- e.g. 'KNBS', 'CBK'
  source_url   text,
  verified     boolean not null default false,
  ingested_at  timestamptz not null default now()
);

create index if not exists idx_macro_indicators_lookup
  on public.macro_indicators (indicator, country, released_at desc);

-- Idempotent upsert key for the ingest hook (onConflict: indicator,country,released_at).
create unique index if not exists uq_macro_indicators_series
  on public.macro_indicators (indicator, country, released_at);

alter table public.macro_indicators enable row level security;

grant select on public.macro_indicators to anon;
grant select on public.macro_indicators to authenticated;
grant select, insert, update, delete on public.macro_indicators to service_role;

-- Public read: the economy page is a public, read-only product.
-- No write policies — writes are service-role only (bypasses RLS).
create policy "macro indicators public read"
  on public.macro_indicators for select
  to anon, authenticated
  using (true);
