import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The single Chip dialect — filter tabs, desk selectors, range toggles,
 * exchange pills. One active state (amber) everywhere; there is no green
 * or inverted-foreground variant. Mono, uppercase, tracked, token radius.
 */
const chipVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded border font-mono uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      active: {
        true: "border-primary/60 bg-primary/10 font-bold text-primary",
        false:
          "border-border bg-card/40 font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      },
      size: {
        sm: "px-2 py-1 text-[10px]",
        md: "px-2.5 py-1.5 text-[11px]",
      },
    },
    defaultVariants: {
      active: false,
      size: "md",
    },
  },
);

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {}

function Chip({ className, active, size, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active ?? false}
      className={cn(chipVariants({ active, size }), className)}
      {...props}
    />
  );
}

export { Chip, chipVariants };
