import { describe, expect, it } from "vitest";
import {
  discoveryDate,
  groupBySector,
  newestRowDate,
  sectorGroupFor,
  topMovers,
  type DiscoveryRow,
} from "./discovery";

const row = (
  ticker: string,
  changePercent: number | null,
  sector: string | null = null,
  value: number | null = null,
): DiscoveryRow => ({
  ticker,
  name: ticker,
  exchange: "NSE",
  price: 10,
  changePercent,
  currencySymbol: "KSh",
  value,
  asOf: "2026-10-22T18:00:00Z",
  updated: "Oct 22, 2026",
  sector,
});

describe("topMovers", () => {
  it("takes the five biggest gainers and losers, ignoring flat and missing", () => {
    const movers = topMovers([
      row("A", 5),
      row("B", 4),
      row("C", 3),
      row("D", 2),
      row("E", 1),
      row("F", 0),
      row("G", null),
      row("H", -1),
      row("I", -2),
      row("J", -3),
      row("K", -4),
      row("L", -5),
    ]);
    expect(movers.gainers.map((r) => r.ticker)).toEqual(["A", "B", "C", "D", "E"]);
    expect(movers.losers.map((r) => r.ticker)).toEqual(["L", "K", "J", "I", "H"]);
  });
});

describe("sectorGroupFor", () => {
  it("matches the named sector groups", () => {
    expect(sectorGroupFor("Banking")).toBe("banks");
    expect(sectorGroupFor("Commercial & Services - Telecom")).toBe("telecoms");
    expect(sectorGroupFor("Energy & Petroleum")).toBe("energy");
    expect(sectorGroupFor("Food, Beverages & Tobacco")).toBe("food-drink");
    expect(sectorGroupFor("Construction")).toBeNull();
    expect(sectorGroupFor(null)).toBeNull();
  });
});

describe("groupBySector", () => {
  it("groups by sector, orders by value traded and caps at six", () => {
    const rows = [
      row("BANK1", 1, "Banking", 100),
      row("BANK2", 1, "Banking", 900),
      row("BANK3", 1, "Banking", 500),
      row("TEL1", 1, "Telecom", 200),
      row("OIL1", 1, "Oil & Gas", 50),
      row("FOOD1", 1, "Food & Beverages", 70),
      ...Array.from({ length: 6 }, (_, i) => row(`EXTRA${i}`, 1, "Banking", i)),
    ];
    const groups = groupBySector(rows);
    expect(groups.map((g) => g.id)).toEqual(["banks", "telecoms", "energy", "food-drink"]);
    expect(groups[0].rows).toHaveLength(6);
    expect(groups[0].rows[0].ticker).toBe("BANK2");
    expect(groups[0].rows[1].ticker).toBe("BANK3");
    expect(groups[1].rows[0].ticker).toBe("TEL1");
  });

  it("omits empty groups", () => {
    expect(groupBySector([row("X", 1, "Construction", 1)])).toEqual([]);
  });
});

describe("discoveryDate", () => {
  it("is the UTC calendar day", () => {
    expect(discoveryDate(new Date("2026-10-22T23:30:00Z"))).toBe("2026-10-22");
  });
});

describe("newestRowDate", () => {
  it("stamps a list with the newest price date among its rows", () => {
    expect(
      newestRowDate(
        [{ asOf: "2026-10-20T18:00:00Z" }, { asOf: "2026-10-21T07:30:00Z" }],
        "2026-10-22",
      ),
    ).toBe("2026-10-21");
  });

  it("falls back when no row carries a usable date", () => {
    expect(newestRowDate([{ asOf: null }, { asOf: "n/a" }], "2026-10-22")).toBe(
      "2026-10-22",
    );
    expect(newestRowDate([], "2026-10-22")).toBe("2026-10-22");
  });
});
