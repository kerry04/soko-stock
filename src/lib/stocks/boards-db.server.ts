import { createClient } from "@supabase/supabase-js";

// Server-side reader for the daily EOD boards (NSE/NGX/GSE) stored in
// public.stock_boards. Public read is granted to anon; the ingest hook
// writes via service role.
export interface BoardRow {
  exchange: string;
  ticker: string;
  name: string;
  price: number;
  change_percent: number | null;
  volume: number | null;
  value_traded: number | null;
  ytd_percent: number | null;
  sector: string | null;
  updated: string | null;
  fetched_at: string;
}

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function getDBBoard(exchange: string): Promise<BoardRow[]> {
  const { data, error } = await client()
    .from("stock_boards")
    .select("*")
    .eq("exchange", exchange)
    .order("ticker");
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[];
}

export async function getDBQuote(ticker: string): Promise<BoardRow | null> {
  const { data, error } = await client()
    .from("stock_boards")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as BoardRow | null;
}
