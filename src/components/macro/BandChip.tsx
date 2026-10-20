import { cn } from "@/lib/utils";

export type BandState = "cold" | "target" | "warm" | "hot" | "crisis";

const BAND_META: Record<BandState, { label: string; cls: string }> = {
  cold: { label: "Below target", cls: "text-sky-400 border-sky-400/40 bg-sky-400/10" },
  target: { label: "In target", cls: "text-success border-success/40 bg-success/10" },
  warm: { label: "Warming", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  hot: { label: "Hot", cls: "text-orange-400 border-orange-400/40 bg-orange-400/10" },
  crisis: { label: "Above target", cls: "text-red-500 border-red-500/40 bg-red-500/10" },
};

/** Small band-state chip shared by /economy and the /pulse economy strip. */
export function BandChip({ band, className }: { band: BandState | null; className?: string }) {
  if (!band) return null;
  const meta = BAND_META[band];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]",
        meta.cls,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
