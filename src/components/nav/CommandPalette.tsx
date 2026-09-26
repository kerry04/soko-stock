import { useNavigate } from "@tanstack/react-router";
import { CandlestickChart, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TERMINAL_SECTIONS } from "./terminal-nav";

interface PaletteProps {
  open: boolean;
  onClose: () => void;
}

interface StockHit {
  ticker: string;
  name: string;
}

/**
 * Lightweight ⌘K / Ctrl-K quick switcher: terminal sections and stock
 * search. No external deps, keyboard navigable.
 */
export function CommandPalette({ open, onClose }: PaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [stocks, setStocks] = useState<StockHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
        else {
          setQuery("");
          setCursor(0);
          // Open via a custom event so the bar's state stays the source of truth.
          window.dispatchEvent(new CustomEvent("soko:palette-open"));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      // Load the board once per open for local stock search.
      let cancelled = false;
      fetch("/api/stocks/board?exchange=JSE")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled && j?.rows) {
            setStocks(
              (j.rows as { ticker: string; name: string }[]).map((r) => ({
                ticker: r.ticker,
                name: r.name,
              })),
            );
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [open ]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = TERMINAL_SECTIONS.map((s) => ({
      kind: "page" as const,
      label: s.label,
      hint: s.hint,
      to: s.to,
    })).filter((p) => !q || p.label.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q));
    const stockHits =
      q.length >= 2
        ? stocks
            .filter(
              (s) =>
                s.name.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q),
            )
            .slice(0, 6)
            .map((s) => ({
              kind: "stock" as const,
              label: s.name,
              hint: s.ticker,
              to: `/stocks/${s.ticker}`,
            }))
        : [];
    return [...pages, ...stockHits];
  }, [query, stocks]);

  useEffect(() => setCursor(0), [items.length]);

  const go = (to: string) => {
    onClose();
    navigate({ to });
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick switcher"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          }
          if (e.key === "Enter" && items[cursor]) go(items[cursor].to);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a section or stock…"
            aria-label="Jump to a section or stock"
            className="h-12 w-full bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border/70 px-1.5 font-mono text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto py-2" role="listbox" aria-label="Results">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
              No matches. Try a stock name.
            </li>
          )}
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.to}-${i}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item.to)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  i === cursor ? "bg-accent" : "bg-transparent",
                )}
              >
                {item.kind === "stock" ? (
                  <CandlestickChart className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">
                    ›
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.label}</span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
