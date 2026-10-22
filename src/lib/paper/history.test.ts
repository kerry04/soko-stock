import { describe, expect, it } from "vitest";
import {
  changeSinceStart,
  formatValueDay,
  pointsInRange,
  scrubIndex,
  seriesForCurrency,
  stepScrub,
} from "./history";
import type { PortfolioHistoryPoint } from "./valuation";

const point = (
  date: string,
  total: number,
  currency = "KES",
  current = false,
): PortfolioHistoryPoint => ({
  currency,
  date,
  total,
  cash: total,
  shares: 0,
  current,
});

describe("seriesForCurrency", () => {
  it("keeps one currency, oldest first", () => {
    const series = seriesForCurrency(
      [
        point("2026-10-20", 101_000),
        point("2026-10-18", 100_000),
        point("2026-10-19", 99_000, "ZAR"),
      ],
      "KES",
    );
    expect(series).toEqual([
      { date: "2026-10-18", total: 100_000 },
      { date: "2026-10-20", total: 101_000 },
    ]);
  });

  it("lets the current point replace a stored snapshot for the same day", () => {
    const series = seriesForCurrency(
      [point("2026-10-21", 101_000), point("2026-10-21", 101_500, "KES", true)],
      "KES",
    );
    expect(series).toEqual([{ date: "2026-10-21", total: 101_500 }]);
  });

  it("does not let a stored point overwrite a current point that came first", () => {
    const series = seriesForCurrency(
      [point("2026-10-21", 101_500, "KES", true), point("2026-10-21", 101_000)],
      "KES",
    );
    expect(series).toEqual([{ date: "2026-10-21", total: 101_500 }]);
  });

  it("drops non-finite totals", () => {
    const series = seriesForCurrency(
      [point("2026-10-20", Number.NaN), point("2026-10-21", 100_000)],
      "KES",
    );
    expect(series).toEqual([{ date: "2026-10-21", total: 100_000 }]);
  });
});

describe("pointsInRange", () => {
  const points = [
    { date: "2026-01-01", total: 100_000 },
    { date: "2026-06-01", total: 110_000 },
    { date: "2026-09-15", total: 105_000 },
    { date: "2026-10-20", total: 112_000 },
  ];

  it("keeps a month from the newest point", () => {
    expect(pointsInRange(points, "1m")).toEqual([{ date: "2026-10-20", total: 112_000 }]);
  });

  it("keeps three months from the newest point", () => {
    expect(pointsInRange(points, "3m").map((p) => p.date)).toEqual([
      "2026-09-15",
      "2026-10-20",
    ]);
  });

  it("keeps a year and everything", () => {
    expect(pointsInRange(points, "1y")).toHaveLength(4);
    expect(pointsInRange(points, "all")).toHaveLength(4);
  });

  it("returns nothing for an empty series", () => {
    expect(pointsInRange([], "1m")).toEqual([]);
  });
});

describe("changeSinceStart", () => {
  it("reports money and percent from the first point", () => {
    expect(
      changeSinceStart([
        { date: "2026-10-01", total: 100_000 },
        { date: "2026-10-20", total: 102_500 },
      ]),
    ).toMatchObject({ amount: 2_500, percent: 2.5 });
  });

  it("handles a fall", () => {
    expect(
      changeSinceStart([
        { date: "2026-10-01", total: 100_000 },
        { date: "2026-10-20", total: 95_000 },
      ]),
    ).toMatchObject({ amount: -5_000, percent: -5 });
  });

  it("needs two points", () => {
    expect(changeSinceStart([{ date: "2026-10-20", total: 100_000 }])).toBeNull();
    expect(changeSinceStart([])).toBeNull();
  });

  it("omits percent when the first value is zero", () => {
    expect(
      changeSinceStart([
        { date: "2026-10-01", total: 0 },
        { date: "2026-10-02", total: 50 },
      ])?.percent,
    ).toBeNull();
  });
});

describe("scrubbing", () => {
  it("maps pointer fractions to the nearest point", () => {
    expect(scrubIndex(0, 4)).toBe(0);
    expect(scrubIndex(0.5, 4)).toBe(2);
    expect(scrubIndex(1, 4)).toBe(3);
    expect(scrubIndex(-2, 4)).toBe(0);
    expect(scrubIndex(9, 4)).toBe(3);
  });

  it("handles a single point and bad fractions", () => {
    expect(scrubIndex(0.4, 1)).toBe(0);
    expect(scrubIndex(Number.NaN, 3)).toBe(2);
  });

  it("steps without wrapping", () => {
    expect(stepScrub(0, -1, 3)).toBe(0);
    expect(stepScrub(1, -1, 3)).toBe(0);
    expect(stepScrub(2, 1, 3)).toBe(2);
    expect(stepScrub(0, 1, 3)).toBe(1);
  });
});

describe("formatValueDay", () => {
  it("reads as a plain day", () => {
    expect(formatValueDay("2026-10-20")).toBe("20 Oct 2026");
  });
});
