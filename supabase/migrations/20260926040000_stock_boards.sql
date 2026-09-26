-- Daily end-of-day stock boards for African exchanges without a machine
-- readable quote API (NSE, NGX, GSE). A VM cron fetches the African
-- Financials price-list pages (curl passes their WAF; Vercel/pg_net do not)
-- and POSTs the raw HTML to the ingest-boards hook, which parses and
-- upserts here. The public board/quote API reads from this table.

create table public.stock_boards (
  exchange text not null,               -- NSE | NGX | GSE
  ticker text not null,                 -- e.g. SCOM.NSE
  name text not null,                   -- e.g. Safaricom
  price numeric not null,
  change_percent numeric,
  volume bigint,
  value_traded bigint,
  ytd_percent numeric,
  sector text,
  updated text,                         -- source "Updated" label, e.g. Sep 25, 2026
  fetched_at timestamptz not null default now(),
  primary key (exchange, ticker)
);

alter table public.stock_boards enable row level security;

grant select on public.stock_boards to anon;
grant select on public.stock_boards to authenticated;
grant select, insert, update, delete on public.stock_boards to service_role;

-- Public read: the stock terminal is a public, read-only product.
create policy "stock boards public read"
  on public.stock_boards for select
  to anon, authenticated
  using (true);

create index stock_boards_exchange_idx on public.stock_boards (exchange);
