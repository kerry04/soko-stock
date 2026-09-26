import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { TERMINAL_SECTIONS, isSectionActive } from "./terminal-nav";

/**
 * Mobile bottom tab bar: the same four ops-room sections, terminal-styled.
 * Fixed with safe-area padding. md+ is covered by the CommandBar.
 */
export function TerminalTabs() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Terminal tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4 px-2 pt-1.5">
        {TERMINAL_SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = isSectionActive(pathname, s.to);
          return (
            <Link
              key={s.to}
              to={s.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                active ? "text-success" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
                {s.label}
              </span>
              {active && <span className="h-0.5 w-8 rounded bg-success" aria-hidden />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
