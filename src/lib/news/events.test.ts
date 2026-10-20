import { describe, expect, it } from "vitest";
import { classifyHeadline } from "./events";

describe("classifyHeadline", () => {
  it("flags profit warnings first, even inside results language", () => {
    expect(classifyHeadline("KCB issues profit warning as earnings fall")).toBe("profit-warning");
    expect(classifyHeadline("Bank warns of lower profit this year")).toBe("profit-warning");
  });

  it("classifies dividends", () => {
    expect(classifyHeadline("Safaricom declares interim dividend of Sh1 per share")).toBe("dividend");
    expect(classifyHeadline("Co-op Bank raises dividend payout")).toBe("dividend");
  });

  it("classifies results", () => {
    expect(classifyHeadline("Equity Group net profit rises 14% in Q3")).toBe("results");
    expect(classifyHeadline("East African Breweries posts a loss for the half year")).toBe("results");
    expect(classifyHeadline("Britam loss widens on claims")).toBe("results");
  });

  it("classifies corporate actions", () => {
    expect(classifyHeadline("Absa acquires local insurer in Sh2bn deal")).toBe("corporate-action");
    expect(classifyHeadline("NSE suspends trading in Atlas Mara shares")).toBe("corporate-action");
  });

  it("classifies policy and regulation", () => {
    expect(classifyHeadline("Central Bank holds benchmark rate at MPC meeting")).toBe("policy");
    expect(classifyHeadline("Capital Markets Authority approves new REIT rules")).toBe("policy");
  });

  it("leaves general news unclassified", () => {
    expect(classifyHeadline("Kenya launches new industrial park in Athi River")).toBeNull();
    expect(classifyHeadline("Harambee Stars name squad for AFCON qualifiers")).toBeNull();
  });
});
