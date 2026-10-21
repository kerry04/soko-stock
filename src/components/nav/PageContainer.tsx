import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one container width for the whole terminal (1400px, the command
 * bar's measure). Pages render their content inside it so the gutter and
 * measure never drift between routes.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-3 sm:px-5", className)}>
      {children}
    </div>
  );
}
