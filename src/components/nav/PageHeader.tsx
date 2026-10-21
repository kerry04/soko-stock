import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page-header dialect: a mono folio slug line (function code ·
 * context) over a Fraunces serif title, with an optional muted standfirst
 * and right-aligned actions. Every route heads its page with this.
 */
export function PageHeader({
  slug,
  title,
  description,
  actions,
  className,
}: {
  /** Folio slug, e.g. "SCRN · Signal scans" — printed in mono above the title. */
  slug?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5", className)}>
      {slug && (
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 bg-primary" aria-hidden />
          {slug}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {actions && <div className="flex items-center gap-2 pb-0.5">{actions}</div>}
      </div>
      {description && (
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}
