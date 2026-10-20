import { describe, expect, it } from "vitest";
import { bandState, cbrChange, fxShock } from "./signals";

describe("bandState", () => {
  const thresholdTable: Array<[number, string]> = [
    [2.49, "cold"],
    [2.5, "target"],
    [6.74, "warm"],
    [6.75, "hot"],
    [7.5, "hot"],
    [7.6, "crisis"],
  ];
  for (const [cpi, expected] of thresholdTable) {
    it(`cpi=${cpi} -> ${expected}`, () => {
      expect(bandState(cpi)).toBe(expected);
    });
  }

  it("supports a custom band", () => {
    expect(bandState(3.25, 3, 5)).toBe("target");
    expect(bandState(2.99, 3, 5)).toBe("cold");
    expect(bandState(3.5, 3, 5)).toBe("warm"); // upper - 1.5
    expect(bandState(4.25, 3, 5)).toBe("hot"); // upper - 0.75
    expect(bandState(5, 3, 5)).toBe("hot");
    expect(bandState(5.01, 3, 5)).toBe("crisis");
  });
});

describe("cbrChange", () => {
  it("returns [] for empty history", () => {
    expect(cbrChange([])).toEqual([]);
  });

  it("returns [] for a single reading", () => {
    expect(cbrChange([{ date: "2026-08-12", rate: 9.5 }])).toEqual([]);
  });

  it("returns [] when the rate never changes", () => {
    expect(
      cbrChange([
        { date: "2026-04-08", rate: 10 },
        { date: "2026-06-10", rate: 10 },
        { date: "2026-08-12", rate: 10 },
      ]),
    ).toEqual([]);
  });

  it("emits one event per consecutive change, sorted by date", () => {
    const events = cbrChange([
      { date: "2026-10-14", rate: 9.25 },
      { date: "2026-04-08", rate: 10 },
      { date: "2026-06-10", rate: 10 },
      { date: "2026-08-12", rate: 9.5 },
    ]);
    expect(events).toEqual([
      { date: "2026-08-12", from: 10, to: 9.5, deltaBps: -50 },
      { date: "2026-10-14", from: 9.5, to: 9.25, deltaBps: -25 },
    ]);
  });

  it("rounds fractional basis-point deltas", () => {
    expect(
      cbrChange([
        { date: "2026-01-01", rate: 9.5 },
        { date: "2026-02-01", rate: 9.625 },
      ]),
    ).toEqual([{ date: "2026-02-01", from: 9.5, to: 9.625, deltaBps: 13 }]);
  });
});

describe("fxShock", () => {
  it("returns nulls for empty and singleton series", () => {
    expect(fxShock([])).toEqual({ shocked: false, move: null, prev: null });
    expect(fxShock([{ date: "2026-10-16", value: 129.25 }])).toEqual({
      shocked: false,
      move: null,
      prev: null,
    });
  });

  it("flags a move exactly at the threshold", () => {
    const r = fxShock([
      { date: "2026-10-15", value: 100 },
      { date: "2026-10-16", value: 101.5 },
    ]);
    expect(r.shocked).toBe(true);
    expect(r.move).toBeCloseTo(1.5, 10);
    expect(r.prev).toBe(100);
  });

  it("does not flag a move just under the threshold", () => {
    const r = fxShock([
      { date: "2026-10-15", value: 100 },
      { date: "2026-10-16", value: 101.49 },
    ]);
    expect(r.shocked).toBe(false);
    expect(r.move).toBeCloseTo(1.49, 10);
    expect(r.prev).toBe(100);
  });

  it("flags negative shocks and honors a custom threshold", () => {
    const down = fxShock(
      [
        { date: "2026-10-15", value: 100 },
        { date: "2026-10-16", value: 96 },
      ],
      2,
    );
    expect(down.shocked).toBe(true);
    expect(down.move).toBeCloseTo(-4, 10);

    const calm = fxShock(
      [
        { date: "2026-10-15", value: 100 },
        { date: "2026-10-16", value: 101 },
      ],
      2,
    );
    expect(calm.shocked).toBe(false);
  });
});
