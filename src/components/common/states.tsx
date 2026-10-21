import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The one set of loading / empty / error blocks. A terminal whose data is
 * often EOD or stale treats state design as product design: every surface
 * says what state it is in, in the same mono slug dialect.
 */

const TONE_SLUG = {
  loading: { text: "Loading", className: "text-primary" },
  empty: { text: "No data", className: "text-muted-foreground" },
  error: { text: "Error", className: "text-destructive" },
} as const;

export function StateBlock({
  tone = "empty",
  title,
  message,
  action,
  className,
}: {
  tone?: keyof typeof TONE_SLUG;
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  const slug = TONE_SLUG[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border border-dashed border-border px-4 py-8 text-center",
        className,
      )}
    >
      <p
        className={cn(
          "font-mono text-[10px] font-bold uppercase tracking-[0.22em]",
          slug.className,
          tone === "loading" ? "animate-pulse" : "",
        )}
      >
        {slug.text}
      </p>
      {title && (
        <p className="font-display mt-2 text-lg font-semibold leading-snug">{title}</p>
      )}
      {message && <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** A single pulse block — for cards and strips that are still loading. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn("h-24 rounded-lg", className)} />;
}

/** Stacked skeleton lines — list-shaped loading for non-table surfaces. */
export function SkeletonRows({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-16 shrink-0" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}
