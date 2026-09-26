import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/lib/watchlist";

export function WatchButton({ marketId, className }: { marketId: string; className?: string }) {
  const { has, toggle } = useWatchlist();
  const active = has(marketId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(marketId);
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      title={active ? "Watching" : "Watch this market"}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
        active
          ? "border-success/60 bg-success/10 text-success"
          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
        className,
      )}
    >
      <Star className={cn("h-4 w-4", active && "fill-current")} aria-hidden />
    </button>
  );
}
