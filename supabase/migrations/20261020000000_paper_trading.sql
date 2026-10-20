-- Paper trading v1 ledger (plan: docs/superpowers/plans/2026-10-20-paper-trading.md Task 1).
create table if not exists public.paper_portfolios (
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('ZAR','KES','NGN','GHS')),
  cash numeric not null default 100000 check (cash >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, currency)
);
create table if not exists public.paper_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  qty numeric not null check (qty >= 0),
  avg_cost numeric not null check (avg_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);
create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  exchange text not null,
  side text not null check (side in ('BUY','SELL')),
  qty numeric not null check (qty > 0),
  fill_price numeric not null check (fill_price > 0),
  source text not null check (source in ('yahoo','eod')),
  as_of timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.paper_portfolios enable row level security;
alter table public.paper_positions enable row level security;
alter table public.paper_orders enable row level security;
grant select, insert, update, delete on public.paper_portfolios to authenticated;
grant select, insert, update, delete on public.paper_positions to authenticated;
grant select, insert, update, delete on public.paper_orders to authenticated;
grant all on public.paper_portfolios to service_role;
grant all on public.paper_positions to service_role;
grant all on public.paper_orders to service_role;
drop policy if exists "own portfolios" on public.paper_portfolios;
drop policy if exists "own positions" on public.paper_positions;
drop policy if exists "own orders" on public.paper_orders;
create policy "own portfolios" on public.paper_portfolios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own positions" on public.paper_positions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own orders" on public.paper_orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
