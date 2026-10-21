import { fmtChange } from "@/lib/stocks/format";
import { cn } from "@/lib/utils";

/**
 * The one change renderer. Direction is always the semantic token
 * (success / destructive / muted) with a ▲▼ glyph — never a raw palette
 * colour, never a second dialect. Text form: `ChangeCell`; tinted chip
 * form: `ChangeBadge`.
 */

function directionOf(v: number | null): "up" | "down" | "flat" | "none" {
  if (v == null || !Number.isFinite(v)) return "none";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

const CELL_CLASSES = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
  none: "text-muted-foreground",
} as const;

const BADGE_CLASSES = {
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  flat: "bg-flat-soft text-flat",
  none: "bg-flat-soft text-flat",
} as const;

function Glyph({ dir }: { dir: ReturnType<typeof directionOf> }) {
  if (dir === "up") return <span aria-hidden>▲</span>;
  if (dir === "down") return <span aria-hidden>▼</span>;
  return null;
}

/** Inline signed percent: `▲ +1.23%` in Plex Mono via the `num` voice. */
export function ChangeCell({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  const dir = directionOf(value);
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 font-mono text-[12px] font-semibold",
        CELL_CLASSES[dir],
        className,
      )}
    >
      <Glyph dir={dir} />
      {fmtChange(value)}
    </span>
  );
}

/** Tinted chip form of the same renderer, for strips and ledgers. */
export function ChangeBadge({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  const dir = directionOf(value);
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold",
        BADGE_CLASSES[dir],
        className,
      )}
    >
      <Glyph dir={dir} />
      {fmtChange(value)}
    </span>
  );
}
