-- Paper portfolio value snapshots: one row per practice account, per
-- currency, per day. Written once a day by the snapshot-paper-portfolios
-- cron after the evening boards ingest. Never backfilled — there is no
-- stored history of what an account was worth before this table existed.
create table if not exists public.paper_portfolio_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null,
  captured_on date not null,
  total_value numeric not null check (total_value >= 0),
  cash numeric not null check (cash >= 0),
  shares_value numeric not null check (shares_value >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, currency, captured_on)
);

alter table public.paper_portfolio_snapshots enable row level security;

-- Same grants and ownership policy as the paper ledger tables.
grant select, insert, update, delete on public.paper_portfolio_snapshots to authenticated;
grant all on public.paper_portfolio_snapshots to service_role;

drop policy if exists "own portfolio snapshots" on public.paper_portfolio_snapshots;
create policy "own portfolio snapshots"
  on public.paper_portfolio_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists paper_portfolio_snapshots_user_day_idx
  on public.paper_portfolio_snapshots (user_id, currency, captured_on);
