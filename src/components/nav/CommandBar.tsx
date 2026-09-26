import { Link, useLocation } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/engagement/NotificationBell";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { TERMINAL_SECTIONS, isSectionActive } from "./terminal-nav";
import { CommandPalette } from "./CommandPalette";

export function StockBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" aria-label="Soko Stock home" className="flex shrink-0 items-center gap-2.5">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span
        className={cn(
          "font-mono font-bold tracking-[0.22em] text-foreground",
          compact ? "text-xs" : "text-sm",
        )}
      >
        SOKO<span className="text-success">_STOCK</span>
      </span>
    </Link>
  );
}

/**
 * Ops-room command bar. Dense, terminal-like: mono section labels, a live
 * clock-ish pulse dot, ⌘K quick switcher, theme toggle, auth actions.
 * Desktop shows sections inline; mobile shows brand + actions (sections live
 * in the bottom tab bar).
 */
export function CommandBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The palette's own global shortcut dispatches this when it is closed.
  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener("soko:palette-open", open);
    return () => window.removeEventListener("soko:palette-open", open);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 h-12 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-3 sm:px-5">
          <StockBrand />

          <nav aria-label="Terminal" className="hidden items-center gap-1 md:flex">
            {TERMINAL_SECTIONS.map((s) => {
              const active = isSectionActive(pathname, s.to);
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  title={s.hint}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                    active ? "text-success" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                  {active && (
                    <span
                      className="absolute inset-x-3 -bottom-[9px] h-0.5 bg-success"
                      aria-hidden
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Quick switcher (Ctrl+K)"
              className="hidden h-8 items-center gap-2 rounded-md border border-border/70 bg-card/40 px-2.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60 sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">Jump to…</span>
              <kbd className="rounded border border-border/70 bg-background px-1 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
            {user && <NotificationBell />}
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-8 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                <Link to="/profile">Account</Link>
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="hidden h-8 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground sm:inline-flex"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="h-8 bg-success font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-success-foreground hover:bg-success/90"
                >
                  <Link to="/signup">Start</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
