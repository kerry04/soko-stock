/**
 * Pure sorting and grouping for the Globe's discovery lists. The server
 * endpoint gathers board rows; this module decides what belongs in each
 * list, so the rules are testable without a network or database.
 *
 * There is deliberately no "most popular" list — the app has no honest
 * crowd data. "Most talked about" is the news wire's measured heat list.
 */

export interface DiscoveryRow {
  ticker: string;
  name: string;
  exchange: string;
  price: number;
  changePercent: number | null;
  currencySymbol: string;
  /** Value traded in display currency, used to order sector groups. */
  value: number | null;
  asOf: string;
  /** The daily board's own label when it publishes one. */
  updated: string | null;
  sector: string | null;
}

export type SectorGroupId = "banks" | "telecoms" | "energy" | "food-drink";

export interface SectorGroupDef {
  id: SectorGroupId;
  label: string;
  patterns: RegExp[];
}

export const SECTOR_GROUPS: SectorGroupDef[] = [
  {
    id: "banks",
    label: "Banks",
    patterns: [/bank/i],
  },
  {
    id: "telecoms",
    label: "Telecoms",
    patterns: [/telecom/i, /telecommunication/i, /mobile/i, /cellular/i],
  },
  {
    id: "energy",
    label: "Energy",
    patterns: [/energy/i, /oil/i, /gas/i, /petroleum/i, /power/i, /electric/i, /fuel/i],
  },
  {
    id: "food-drink",
    label: "Food & drink",
    patterns: [/food/i, /beverage/i, /drink/i, /brew/i, /distill/i, /dairy/i, /sugar/i],
  },
];

/** Which named group a board's free-text sector belongs to, if any. */
export function sectorGroupFor(sector: string | null | undefined): SectorGroupId | null {
  if (!sector) return null;
  for (const group of SECTOR_GROUPS) {
    if (group.patterns.some((re) => re.test(sector))) return group.id;
  }
  return null;
}

export interface Movers {
  gainers: DiscoveryRow[];
  losers: DiscoveryRow[];
}

/** Top gainers and top losers by day change. Flat and missing moves stay out. */
export function topMovers(rows: DiscoveryRow[], limit = 5): Movers {
  const moved = rows.filter(
    (r) => r.changePercent != null && Number.isFinite(r.changePercent),
  );
  return {
    gainers: [...moved]
      .filter((r) => (r.changePercent as number) > 0)
      .sort((a, b) => (b.changePercent as number) - (a.changePercent as number))
      .slice(0, limit),
    losers: [...moved]
      .filter((r) => (r.changePercent as number) < 0)
      .sort((a, b) => (a.changePercent as number) - (b.changePercent as number))
      .slice(0, limit),
  };
}

export interface SectorList {
  id: SectorGroupId;
  label: string;
  rows: DiscoveryRow[];
}

/**
 * Daily-board companies grouped by sector text, each group ordered by
 * value traded, at most six names per group. Empty groups are omitted.
 */
export function groupBySector(rows: DiscoveryRow[], limit = 6): SectorList[] {
  return SECTOR_GROUPS.map((group) => {
    const members = rows
      .filter((r) => sectorGroupFor(r.sector) === group.id)
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
      .slice(0, limit);
    return { id: group.id, label: group.label, rows: members };
  }).filter((group) => group.rows.length > 0);
}

/** UTC date stamp for a list payload. */
export function discoveryDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
