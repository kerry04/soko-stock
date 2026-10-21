import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Panel — the one surface recipe. Token radius (0.25rem), hairline border,
 * no consumer shadow. Variants:
 *  - plain: the default board surface.
 *  - folio: newspaper folio — an amber top rule marks the nameplate tier.
 *  - stat:  a denser, slightly recessed surface for stat grids.
 * Reach for Panel instead of hand-rolling `rounded-xl border bg-card/40`.
 */
const panelVariants = cva("rounded-lg border border-border text-card-foreground", {
  variants: {
    variant: {
      plain: "bg-card",
      folio: "border-t-2 border-t-primary bg-card",
      stat: "bg-card/60",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: {
    variant: "plain",
    padding: "md",
  },
});

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div ref={ref} className={cn(panelVariants({ variant, padding }), className)} {...props} />
  ),
);
Panel.displayName = "Panel";

/** Folio header row inside a Panel: mono slug title left, actions right. */
const PanelHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mb-3 flex items-center justify-between gap-3", className)}
      {...props}
    />
  ),
);
PanelHeader.displayName = "PanelHeader";

const PanelTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
PanelTitle.displayName = "PanelTitle";

const PanelContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />,
);
PanelContent.displayName = "PanelContent";

/* ── shadcn Card API, re-pointed at the token recipe for compatibility ── */

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelContent,
  panelVariants,
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
