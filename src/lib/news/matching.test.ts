import { describe, expect, it } from "vitest";
import { compileMatchers, stockKeywords, titleMatches } from "./matching";
import { pickLeadStory } from "./lead";

/** Does any heat company's matcher claim this headline? (The tier-1 test.) */
const heatQualifies = (title: string, heatNames: string[]) =>
  heatNames.some((n) => titleMatches(title, compileMatchers(stockKeywords(n))));

describe("stockKeywords — a heat match never rests on one common word", () => {
  it("a stored name that is one common word yields no matchers (SET)", () => {
    // Live board data, 2026-10-22: NSLTEC.NGX is stored with name "SET".
    expect(stockKeywords("SET")).toEqual([]);
  });

  it("a stored name that is one common word yields no matchers (FAMILY)", () => {
    // Live board data, 2026-10-22: FMLY.NSE is stored with name "FAMILY".
    expect(stockKeywords("FAMILY")).toEqual([]);
  });

  it("the Ebola headline does not heat-qualify via 'set'", () => {
    // Regression, live wire 2026-10-22: this story LED the wire because
    // the word "set" matched the company stored as "SET".
    expect(
      heatQualifies("First Ebola contacts set to return home Sunday", [
        "SET",
        "FAMILY",
      ]),
    ).toBe(false);
  });

  it("'Family Bank posts…' does not qualify via bare 'family'", () => {
    expect(
      heatQualifies("Family Bank posts record half-year profit", ["FAMILY"]),
    ).toBe(false);
  });

  it("…but the full name 'Family Bank' still matches as a phrase", () => {
    expect(stockKeywords("Family Bank")).toContain("family bank");
    expect(
      heatQualifies("Family Bank posts record half-year profit", ["Family Bank"]),
    ).toBe(true);
  });

  it("generic one-word names get no bare matcher either (Enterprise, Express)", () => {
    expect(stockKeywords("Enterprise")).toEqual([]);
    expect(stockKeywords("Express")).toEqual([]);
  });

  it("other common bare words on the boards yield no matchers (Access, Total, Press)", () => {
    expect(stockKeywords("Access")).toEqual([]);
    expect(stockKeywords("Total")).toEqual([]);
    expect(stockKeywords("Press")).toEqual([]);
  });

  it("a distinctive one-word brand still matches alone (Safaricom)", () => {
    expect(stockKeywords("Safaricom")).toEqual(["safaricom"]);
    expect(
      heatQualifies("Safaricom expands M-Pesa services into Ethiopia", [
        "Safaricom",
      ]),
    ).toBe(true);
  });

  it("other coined one-word brands still match (Britam, Sanlam, Sasol)", () => {
    expect(stockKeywords("Britam")).toEqual(["britam"]);
    expect(stockKeywords("Sanlam")).toEqual(["sanlam"]);
    expect(stockKeywords("Sasol Limited")).toEqual(["sasol"]);
  });

  it("phrase behaviour is unchanged (Standard Bank, Pick n Pay, Equity Group)", () => {
    expect(stockKeywords("Standard Bank Group Limited")).toContain("standard bank");
    expect(stockKeywords("Pick n Pay Stores Limited")).toContain("pick n pay");
    expect(stockKeywords("Equity Group Holdings")).toContain("equity group");
  });

  it("a long generic word inside a name gains no bare recall matcher (Sterling)", () => {
    const kw = stockKeywords("Sterling Bank");
    expect(kw).toContain("sterling bank");
    expect(kw).not.toContain("sterling");
  });

  it("the lead pick skips the Ebola story for a real heat-company story", () => {
    const wire = [
      { title: "First Ebola contacts set to return home Sunday" },
      { title: "Safaricom expands M-Pesa services into Ethiopia" },
    ];
    expect(pickLeadStory(wire, ["SET", "FAMILY", "Safaricom"])?.title).toBe(
      "Safaricom expands M-Pesa services into Ethiopia",
    );
  });
});
