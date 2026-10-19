import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isStaleEod } from "@/lib/paper/fill";
import { usePaperSession } from "./use-paper-session";
import { PaperLoginForm } from "./auth";

const FRIENDLY: Record<string, string> = {
  insufficient_cash: "Not enough virtual cash for this order.",
  insufficient_shares: "You don't hold that many shares.",
  invalid_qty: "Enter a whole number of shares.",
  quote_unavailable: "Quote unavailable right now — try again shortly.",
  stale_eod: "This board is stale (no fresh close). Trading reopens on the next ingest.",
  exchange_not_live: "This market isn't tradeable yet.",
  login_required: "Your session expired — log in again.",
  invalid_token: "Your session expired — log in again.",
};

function fmt(v: number, sym: string): string {
  return `${sym}${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface TradeTicketProps {
  ticker: string;
  /** Displayed board price (JSE Rand or EOD close). Fills re-read it server-side. */
  price: number | null;
  currencySymbol: string;
  /** True for NSE/NGX/GSE end-of-day listings. */
  eod: boolean;
  /** ISO fetch time: Yahoo asOf for JSE, stock_boards fetched_at for EOD. */
  asOf: string | null;
  /** Source "Updated" label for EOD (e.g. "Sep 25, 2026"). */
  eodLabel?: string | null;
  timeNote?: string;
}

/**
 * One paper ticket for every board (spec §4). Same component everywhere;
 * the badge tells the truth per source. Market-only, instant, long-only.
 */
export function TradeTicket({
  ticker,
  price,
  currencySymbol: sym,
  eod,
  asOf,
  eodLabel,
  timeNote,
}: TradeTicketProps) {
  const { user, loading } = usePaperSession();
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<"BUY" | "SELL" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<{ price: number; side: string; qty: number } | null>(null);

  if (loading) {
    return <div className="mt-3 h-24 animate-pulse rounded-xl bg-muted/40" />;
  }
  if (!user) {
    return (
      <div className="mt-3">
        <PaperLoginForm compact />
      </div>
    );
  }

  const stale = eod && isStaleEod(asOf);
  const disabled = price == null || stale;

  const submit = async (side: "BUY" | "SELL") => {
    setPending(side);
    setError(null);
    setFill(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError(FRIENDLY.login_required);
        setPending(null);
        return;
      }
      const r = await fetch("/api/paper/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticker,
          side,
          qty,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        error?: string;
        fill_price?: number;
      };
      if (!j.ok) {
        setError(FRIENDLY[j.error ?? ""] ?? "Order failed — try again.");
      } else {
        setFill({ price: j.fill_price ?? 0, side, qty });
      }
    } catch {
      setError("Network error — order status unknown. Check your portfolio before retrying.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-label="Paper trade ticket"
      className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Paper trade
        </p>
        {eod ? (
          <span
            title={asOf ? `Last close ingested ${asOf}` : "End-of-day price"}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
              stale ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500",
            )}
          >
            {stale ? "EOD stale" : `EOD · last close ${eodLabel ?? ""}`.trim()}
          </span>
        ) : (
          <span
            title={asOf ? `Quote as of ${asOf}` : timeNote}
            className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-success"
          >
            Live · ~15min delayed
          </span>
        )}
      </div>

      {price == null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Quote unavailable right now — check back shortly.
        </p>
      ) : stale ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This board hasn&apos;t published a fresh close in over 36 hours. Trading reopens on the
          next ingest — your virtual cash is safe.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor="paper-qty"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              Qty
            </label>
            <input
              id="paper-qty"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="num w-24 rounded-md border border-border/70 bg-background px-2 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
            />
            <p className="num ml-auto font-mono text-sm font-semibold">≈ {fmt(qty * price, sym)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => submit("BUY")}
              className="rounded-md bg-success/15 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-success disabled:opacity-40"
            >
              {pending === "BUY" ? "Filling…" : "Buy"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => submit("SELL")}
              className="rounded-md bg-red-500/15 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-red-500 disabled:opacity-40"
            >
              {pending === "SELL" ? "Filling…" : "Sell"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
      {fill && (
        <p className="mt-2 text-sm text-success">
          Filled {fill.side} {fill.qty} @ {fmt(fill.price, sym)}.{" "}
          <Link to="/portfolio" className="underline">
            View portfolio
          </Link>
        </p>
      )}
      <p className="mt-3 border-t border-border/50 pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Virtual cash only — not investment advice.
        {eod ? " EOD fills at the last published close." : " Fills at the displayed quote."}
      </p>
    </section>
  );
}
