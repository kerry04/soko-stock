import { describe, expect, it } from "vitest";
import { sharesForAmount, sellSharesForAmount } from "./amount";

describe("sharesForAmount", () => {
  it("buys whole shares and leaves the change as cash", () => {
    // 1,000 at 35.20 a share → 28 shares (985.60), 14.40 left over.
    expect(sharesForAmount(1000, 35.2)).toEqual({
      shares: 28,
      cost: 985.6,
      leftover: 14.4,
    });
  });

  it("spends the lot on an exact division", () => {
    expect(sharesForAmount(1000, 25)).toEqual({ shares: 40, cost: 1000, leftover: 0 });
  });

  it("buys nothing when the amount is under one share", () => {
    expect(sharesForAmount(20, 35.2)).toEqual({ shares: 0, cost: 0, leftover: 20 });
  });

  it("rounds the cost to cents", () => {
    expect(sharesForAmount(100, 33.33)).toEqual({
      shares: 3,
      cost: 99.99,
      leftover: 0.01,
    });
  });

  it("does not lose a share to float dust", () => {
    expect(sharesForAmount(0.3, 0.1).shares).toBe(3);
  });

  it("plans nothing for bad inputs", () => {
    expect(sharesForAmount(0, 10)).toEqual({ shares: 0, cost: 0, leftover: 0 });
    expect(sharesForAmount(-50, 10)).toEqual({ shares: 0, cost: 0, leftover: 0 });
    expect(sharesForAmount(100, 0)).toEqual({ shares: 0, cost: 0, leftover: 0 });
    expect(sharesForAmount(100, -5)).toEqual({ shares: 0, cost: 0, leftover: 0 });
    expect(sharesForAmount(Number.NaN, 10)).toEqual({ shares: 0, cost: 0, leftover: 0 });
    expect(sharesForAmount(100, Number.NaN)).toEqual({ shares: 0, cost: 0, leftover: 0 });
  });
});

describe("sellSharesForAmount", () => {
  it("converts an amount into shares", () => {
    expect(sellSharesForAmount(500, 35.2, 100)).toBe(14);
  });

  it("never sells more than is owned", () => {
    expect(sellSharesForAmount(100_000, 35.2, 10)).toBe(10);
  });

  it("sells nothing for bad inputs", () => {
    expect(sellSharesForAmount(500, 35.2, 0)).toBe(0);
    expect(sellSharesForAmount(0, 35.2, 10)).toBe(0);
    expect(sellSharesForAmount(500, 0, 10)).toBe(0);
  });
});
