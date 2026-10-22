/**
 * One honest label for what a price is timed at. Boards publish once a
 * day at the close, except Johannesburg, which is about fifteen minutes
 * behind. Nothing here ever calls a price live.
 */

export interface PriceAsOfInput {
  /** Exchange id, e.g. JSE, NSE, NGX. */
  exchange: string | null | undefined;
  /** The daily board's own "Updated" label, when the source publishes one. */
  updated?: string | null;
  /** Timestamp the price was fetched — the fallback for a missing label. */
  asOf?: string | null;
}

/** `Price · Sep 25, 2026 close`, `Price · last close, 25 Sep`, or the JSE line. */
export function priceAsOfLabel({ exchange, updated, asOf }: PriceAsOfInput): string {
  if (exchange === "JSE") return "Price · about fifteen minutes behind";

  const label = updated?.trim();
  if (label) return `Price · ${label} close`;

  const t = asOf ? new Date(asOf) : null;
  if (t && Number.isFinite(t.getTime())) {
    const day = t.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return `Price · last close, ${day}`;
  }
  return "Price · last close";
}
