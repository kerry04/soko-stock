import { describe, expect, it } from "vitest";
import { applyBuy, applySell, START_CASH, EOD_STALE_MS, isStaleEod } from "./fill";

describe("fill math", () => {
  it("weights avg cost on buy", () => {
    expect(applyBuy({ qty: 10, avg: 100 }, 10, 110)).toEqual({
      qty: 20,
      avg: 105,
      cost: 1100,
    });
  });

  it("starts a position from nothing", () => {
    expect(applyBuy(null, 5, 200)).toEqual({ qty: 5, avg: 200, cost: 1000 });
  });

  it("rejects oversell", () => {
    expect(applySell({ qty: 3, avg: 50 }, 10)).toEqual({
      error: "insufficient_shares",
    });
  });

  it("reduces qty on partial sell keeping avg", () => {
    expect(applySell({ qty: 10, avg: 50 }, 4)).toEqual({ qty: 6, avg: 50 });
  });

  it("rejects non-positive qty", () => {
    expect(applySell({ qty: 10, avg: 50 }, 0)).toEqual({ error: "invalid_qty" });
  });

  it("starts at 100k virtual cash", () => {
    expect(START_CASH).toBe(100000);
  });

  it("EOD stale window is 36h", () => {
    expect(EOD_STALE_MS).toBe(36 * 3600 * 1000);
  });

  it("flags EOD older than 36h as stale", () => {
    const now = new Date("2026-09-27T12:00:00Z").getTime();
    expect(isStaleEod("2026-09-25T23:00:00Z", now)).toBe(true);
    expect(isStaleEod("2026-09-26T12:00:00Z", now)).toBe(false);
  });

  it("treats unparseable timestamps as stale (never fill blind)", () => {
    expect(isStaleEod("not-a-date", Date.now())).toBe(true);
    expect(isStaleEod(null, Date.now())).toBe(true);
  });
});
