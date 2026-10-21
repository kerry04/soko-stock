import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";
import { TERMINAL_SECTIONS, isSectionActive } from "./terminal-nav";
import { CommandPalette } from "./CommandPalette";
import { loadStockDirectory, type DirectoryEntry } from "./use-directory";

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
        SOKO<span className="text-primary">_STOCK</span>
      </span>
    </Link>
  );
}

/**
 * Bloomberg-style command line: type a function code (ECO, MAP, SCRN…)
 * or a ticker / company name and hit Enter. Tickers resolve against the
 * full directory (all exchanges), loaded lazily on first focus via the
 * shared directory hook. A query that matches nothing hands off to the
 * ⌘K palette.
 */
function CommandLine({ onOpenPalette }: { onOpenPalette: () => void }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = () => {
    if (directory) return;
    loadStockDirectory().then((list) => {
      if (list.length > 0) setDirectory(list);
    });
  };

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    const upper = q.toUpperCase();
    const section = TERMINAL_SECTIONS.find(
      (s) => s.code === upper || s.label.toUpperCase() === upper,
    );
    if (section) {
      setValue("");
      inputRef.current?.blur();
      navigate({ to: section.to });
      return;
    }
    const base = (t: string) => t.split(".")[0].toUpperCase();
    const dir = directory ?? [];
    const hit =
      dir.find((d) => d.ticker.toUpperCase() === upper || base(d.ticker) === upper) ??
      dir.find((d) => base(d.ticker).startsWith(upper)) ??
      dir.find((d) => d.name.toLowerCase().includes(q.toLowerCase()));
    if (hit) {
      setValue("");
      inputRef.current?.blur();
      navigate({ to: `/stocks/${hit.ticker}` });
      return;
    }
    onOpenPalette();
  };

  return (
    <form
      role="search"
      aria-label="Terminal command line"
      className="hidden min-w-0 flex-1 items-center justify-center px-3 lg:flex"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border/70 bg-card/40 px-2.5 transition-colors focus-within:border-primary/60">
        <span className="font-mono text-xs font-black text-primary" aria-hidden>
          &gt;
        </span>
        <input
          ref={inputRef}
          value={value}
          onFocus={loadDirectory}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="Type a company or ticker — try Safaricom"
          aria-label="Command line: ticker or function code"
          className="w-full bg-transparent font-mono text-[11px] uppercase tracking-[0.14em] text-foreground placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none"
        />
        <kbd className="shrink-0 rounded border border-border/70 bg-background px-1 font-mono text-[9px] text-muted-foreground">
          ↵
        </kbd>
      </div>
    </form>
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="mr-1.5 hidden font-bold text-primary/80 xl:inline" aria-hidden>
                    {s.code}
                  </span>
                  {s.label}
                  {active && (
                    <span
                      className="absolute inset-x-3 -bottom-[9px] h-0.5 bg-primary"
                      aria-hidden
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <CommandLine onOpenPalette={() => setPaletteOpen(true)} />

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Quick switcher (Ctrl+K)"
              className="hidden h-8 items-center gap-2 rounded-md border border-border/70 bg-card/40 px-2.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">Jump to…</span>
              <kbd className="rounded border border-border/70 bg-background px-1 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
