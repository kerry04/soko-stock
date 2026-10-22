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

  it("a long generic word inside a name gains no bare recall matcher (University)", () => {
    const kw = stockKeywords("University Press");
    expect(kw).toContain("university press");
    expect(kw).not.toContain("university");
  });

  it("the bus-crash headline does not heat-qualify via 'university'", () => {
    // Regression, live wire 2026-10-22: this story LED /news as a
    // University Press story — bare "university" matched, which also
    // inflated the publisher into the heat set the lead pick reads.
    expect(
      heatQualifies(
        "Bus Driver Faces 12 Charges Over Fatal Crash Involving University Students",
        ["University Press"],
      ),
    ).toBe(false);
  });

  it("a real University Press story still matches as a phrase", () => {
    expect(
      heatQualifies("University Press declares dividend after a strong year", [
        "University Press",
      ]),
    ).toBe(true);
  });

  it("place and sector words inside names gain no bare recall matcher", () => {
    // From the 2026-10-22 audit of every bare matcher the boards
    // produce: these words saturate headlines on their own.
    expect(stockKeywords("Kenya Airways")).not.toContain("airways");
    expect(stockKeywords("Housing Finance")).not.toContain("housing");
    expect(stockKeywords("MTN Nigeria")).not.toContain("nigeria");
    expect(stockKeywords("Tanzania Breweries")).not.toContain("tanzania");
    expect(stockKeywords("Republic Bank")).not.toContain("republic");
    expect(stockKeywords("Sovereign Trust")).not.toContain("sovereign");
    expect(stockKeywords("Royal Exchange")).not.toContain("exchange");
  });

  it("saturated headlines do not heat-qualify via those words", () => {
    expect(
      heatQualifies("Nigeria's central bank holds its benchmark rate", [
        "MTN Nigeria",
      ]),
    ).toBe(false);
    expect(
      heatQualifies("Treasury issues a new sovereign bond", ["Sovereign Trust"]),
    ).toBe(false);
    expect(
      heatQualifies("Housing prices rise in Nairobi suburbs", ["Housing Finance"]),
    ).toBe(false);
  });

  it("one-word names that are plain English yield no matchers (audit additions)", () => {
    expect(stockKeywords("Champion")).toEqual([]);
    expect(stockKeywords("Jubilee")).toEqual([]);
    expect(stockKeywords("Livestock")).toEqual([]);
    expect(stockKeywords("Liberty")).toEqual([]);
    expect(stockKeywords("Legend")).toEqual([]);
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
