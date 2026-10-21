import { describe, expect, it } from "vitest";
import { estimateRealCost, stampDutyFor } from "./real-cost";

// Fee stack per the trading-pivot research brief (2026-10-21): levies fixed
// at 0.34% (CMA 0.12 + NSE 0.12 + CDSC 0.08 + funds 0.02), brokerage shown
// as the typical 1.5%–2.1% range, stamp duty KSh 2 per KSh 10,000 or part.

describe("stampDutyFor", () => {
  it("charges per full or part KSh 10,000 bracket", () => {
    expect(stampDutyFor(1)).toBe(2);
    expect(stampDutyFor(9_999)).toBe(2);
    expect(stampDutyFor(10_000)).toBe(2);
    expect(stampDutyFor(10_001)).toBe(4);
    expect(stampDutyFor(250_000)).toBe(50);
  });

  it("is zero on nothing", () => {
    expect(stampDutyFor(0)).toBe(0);
    expect(stampDutyFor(-500)).toBe(0);
  });
});

describe("estimateRealCost", () => {
  it("KSh 1,000 — stamp duty dominates the percentage fees", () => {
    const c = estimateRealCost(1_000);
    expect(c.levies).toBe(3.4);
    expect(c.stampDuty).toBe(2);
    expect(c.brokerageLow).toBe(15);
    expect(c.brokerageHigh).toBe(21);
    expect(c.brokerageMid).toBe(18);
    expect(c.totalLow).toBe(20.4);
    expect(c.totalHigh).toBe(26.4);
    expect(c.totalMid).toBe(23.4);
  });

  it("KSh 10,000 — the brief's worked example size", () => {
    const c = estimateRealCost(10_000);
    expect(c.levies).toBe(34);
    expect(c.stampDuty).toBe(2);
    expect(c.brokerageLow).toBe(150);
    expect(c.brokerageHigh).toBe(210);
    expect(c.totalLow).toBe(186);
    expect(c.totalHigh).toBe(246);
    expect(c.totalMid).toBe(216);
  });

  it("KSh 250,000 — percentages dominate at size", () => {
    const c = estimateRealCost(250_000);
    expect(c.levies).toBe(850);
    expect(c.stampDuty).toBe(50);
    expect(c.brokerageLow).toBe(3_750);
    expect(c.brokerageHigh).toBe(5_250);
    expect(c.totalLow).toBe(4_650);
    expect(c.totalHigh).toBe(6_150);
    expect(c.totalMid).toBe(5_400);
  });

  it("zero and negative amounts cost nothing", () => {
    for (const c of [estimateRealCost(0), estimateRealCost(-1_000)]) {
      expect(c.totalLow).toBe(0);
      expect(c.totalHigh).toBe(0);
      expect(c.totalMid).toBe(0);
      expect(c.stampDuty).toBe(0);
    }
  });

  it("totals always add up: levies + stamp duty + brokerage", () => {
    for (const amt of [500, 7_500, 33_333, 1_000_000]) {
      const c = estimateRealCost(amt);
      expect(c.totalLow).toBeCloseTo(c.levies + c.stampDuty + c.brokerageLow, 2);
      expect(c.totalHigh).toBeCloseTo(c.levies + c.stampDuty + c.brokerageHigh, 2);
      expect(c.totalMid).toBeCloseTo(c.levies + c.stampDuty + c.brokerageMid, 2);
      expect(c.totalLow).toBeLessThanOrEqual(c.totalMid);
      expect(c.totalMid).toBeLessThanOrEqual(c.totalHigh);
    }
  });
});
