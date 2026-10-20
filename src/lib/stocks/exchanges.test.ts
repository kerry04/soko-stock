import { describe, expect, it } from "vitest";
import { EXCHANGES, limitHitFor } from "./exchanges";

describe("limitHitFor", () => {
  it("flags moves at the band, both directions", () => {
    expect(limitHitFor(10, 10)).toBe("up");
    expect(limitHitFor(-10, 10)).toBe("down");
    expect(limitHitFor(9.97, 10)).toBe("up"); // EOD rounding tolerance
    expect(limitHitFor(24.96, 25)).toBe("up");
  });

  it("stays quiet inside the band or without data", () => {
    expect(limitHitFor(9.5, 10)).toBeNull();
    expect(limitHitFor(0, 10)).toBeNull();
    expect(limitHitFor(null, 10)).toBeNull();
    expect(limitHitFor(12, null)).toBeNull(); // no published band, no call
  });

  it("keeps verified limits honest per exchange", () => {
    const byId = Object.fromEntries(EXCHANGES.map((e) => [e.id, e.dailyLimitPct]));
    expect(byId).toMatchObject({
      NSE: 10, NGX: 10, GSE: 10, USE: 10, ZSE: 15, LUSE: 25,
      JSE: null, DSE: null, BSE: null, MSE: null, SEM: null, VFEX: null,
    });
  });
});
