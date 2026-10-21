import { useEffect, useState } from "react";

export interface DirectoryEntry {
  ticker: string;
  name: string;
  exchange: string;
}

let directoryPromise: Promise<DirectoryEntry[]> | null = null;

/**
 * The full cross-exchange stock directory (every listed name, ~467),
 * loaded once and shared by the command line and the ⌘K palette so both
 * search surfaces resolve the same universe.
 */
export function loadStockDirectory(): Promise<DirectoryEntry[]> {
  directoryPromise ??= fetch("/api/stocks/directory")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const list = (j?.stocks as DirectoryEntry[] | undefined) ?? [];
      if (list.length === 0) directoryPromise = null; // let a later attempt retry
      return list;
    })
    .catch(() => {
      directoryPromise = null;
      return [];
    });
  return directoryPromise;
}

/** Directory entries for a component, loaded when `active` turns true. */
export function useStockDirectory(active: boolean): DirectoryEntry[] {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadStockDirectory().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return entries;
}
