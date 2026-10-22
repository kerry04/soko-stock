import { Clock3 } from "lucide-react";
import { priceAsOfLabel, type PriceAsOfInput } from "@/lib/stocks/price-asof";
import { cn } from "@/lib/utils";

/**
 * The one price-timing chip. Daily boards state their own close label;
 * Johannesburg states its fifteen-minute delay. It never says "live".
 */
export function PriceAsOf({
  exchange,
  updated,
  asOf,
  className,
}: PriceAsOfInput & { className?: string }) {
  const label = priceAsOfLabel({ exchange, updated, asOf });
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[9.5px] leading-tight tracking-[0.02em] text-muted-foreground",
        className,
      )}
    >
      <Clock3 className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
