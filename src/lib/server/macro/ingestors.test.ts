import { describe, expect, it } from "vitest";
import { parseCbkCbr, parseCbkFx, parseCbkTbill, parseKnbsCpi } from "./ingestors";

// Handcrafted fixtures using GENERIC phrasing the tolerant parsers look for.
// No network anywhere in these tests.

const SRC = "https://example.com/page";

const KNBS_HTML = `<!doctype html><html><head><title>Consumer Price Indices and Inflation Rates - KNBS</title></head>
<body><h1>Consumer Price Indices and Inflation Rates</h1>
<p>The annual inflation rate for the month of September 2026 stood at 4.22 percent.</p>
</body></html>`;

const CBR_HTML = `<html><body><h1>Central Bank Rate</h1>
<p>The Central Bank Rate (CBR) was retained at 9.50 percent on 12 August 2026.</p>
</body></html>`;

const FX_HTML = `<html><body><h1>Indicative Foreign Exchange Rates</h1>
<p>Daily indicative rates. Mean KES/USD: 129.25 on 16 October 2026.</p>
</body></html>`;

const TBILL_HTML = `<html><body><h1>Treasury Bills Auction Results</h1>
<table><tr><td>91-day</td><td>9.123%</td></tr>
<tr><td>182-day</td><td>9.456%</td></tr>
<tr><td>364-day</td><td>9.789%</td></tr></table>
</body></html>`;

const MALFORMED = "<html><body><p>No data available on this page.</p></body></html>";

// Live-page shapes captured 2026-10-16. These guard against regressions where
// a parser matched a stale or wrong section of the real page.

const CBR_LIVE_SHAPE = `<html><body><h1>Central Bank Rate</h1>
<p>Recent News: MPC retains the CBR at 9.00 percent.</p>
<table><tr><td>09/12/2025</td><td>9.00</td></tr>
<tr><td>07/10/2026</td><td>8.75</td></tr></table>
</body></html>`;

const FX_LIVE_SHAPE = `<html><body><h1>Forex</h1>
<table><tr><td>05/01/2024</td><td>US DOLLAR</td><td>157.9012</td></tr></table>
<div>US DOLLAR 1.00 Search for: Daily KES Exchange Rates US DOLLAR 129.81
STG POUND 171.30 EURO 144.43 More... Posted On: 15-10-2026</div>
</body></html>`;

const TBILL_LIVE_SHAPE = `<html><body><h1>Treasury Bills on Offer</h1>
<div>91-DAY Issue Number: 2705/091 Auction Date: 22nd October 2026
Value Dated: 26th October 2026 Previous Average Interest Rate: 8.7500%
182-DAY Issue Number: 2679/182 Auction Date: 22nd October 2026
Value Dated: 26th October 2026 Previous Average Interest Rate: 8.8600 %
364-DAY Issue Number: 2634/364 Auction Date: 22nd October 2026
Value Dated: 26th October 2026 Previous Average Interest Rate: 9.0383%</div>
</body></html>`;

describe("parseKnbsCpi", () => {
  it("extracts the YoY inflation figure and release date", () => {
    const r = parseKnbsCpi(KNBS_HTML, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators).toHaveLength(1);
    expect(r.indicators[0]).toMatchObject({
      indicator: "cpi_yoy",
      value: 4.22,
      unit: "%",
      source: "KNBS",
      source_url: SRC,
    });
    expect(r.indicators[0].released_at.startsWith("2026-09")).toBe(true);
  });

  it("returns ok:false (no throw) on empty and malformed HTML", () => {
    for (const html of ["", "   ", MALFORMED]) {
      const r = parseKnbsCpi(html, SRC);
      expect(r.ok).toBe(false);
      expect(r.indicators).toEqual([]);
      expect(typeof r.error).toBe("string");
    }
  });
});

describe("parseCbkCbr", () => {
  it("extracts the policy rate and release date", () => {
    const r = parseCbkCbr(CBR_HTML, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators).toHaveLength(1);
    expect(r.indicators[0]).toMatchObject({
      indicator: "cbr",
      value: 9.5,
      unit: "%",
      source: "CBK",
      source_url: SRC,
    });
    expect(r.indicators[0].released_at.startsWith("2026-08")).toBe(true);
  });

  it("returns ok:false (no throw) on empty and malformed HTML", () => {
    for (const html of ["", "   ", MALFORMED]) {
      const r = parseCbkCbr(html, SRC);
      expect(r.ok).toBe(false);
      expect(r.indicators).toEqual([]);
      expect(typeof r.error).toBe("string");
    }
  });

  it("prefers the rate-history table's newest row over a stale headline", () => {
    const r = parseCbkCbr(CBR_LIVE_SHAPE, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators[0]).toMatchObject({
      indicator: "cbr",
      value: 8.75,
      unit: "%",
    });
    expect(r.indicators[0].released_at.startsWith("2026-10-07")).toBe(true);
  });
});

describe("parseCbkFx", () => {
  it("extracts the mean KES/USD rate and release date", () => {
    const r = parseCbkFx(FX_HTML, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators).toHaveLength(1);
    expect(r.indicators[0]).toMatchObject({
      indicator: "fx_usd",
      value: 129.25,
      unit: "KES/USD",
      source: "CBK",
      source_url: SRC,
    });
    expect(r.indicators[0].released_at.startsWith("2026-10")).toBe(true);
  });

  it("returns ok:false (no throw) on empty and malformed HTML", () => {
    for (const html of ["", "   ", MALFORMED]) {
      const r = parseCbkFx(html, SRC);
      expect(r.ok).toBe(false);
      expect(r.indicators).toEqual([]);
      expect(typeof r.error).toBe("string");
    }
  });

  it("reads the current Daily KES Exchange Rates widget, not a stale history row", () => {
    const r = parseCbkFx(FX_LIVE_SHAPE, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators[0]).toMatchObject({
      indicator: "fx_usd",
      value: 129.81,
      unit: "KES/USD",
    });
    expect(r.indicators[0].released_at.startsWith("2026-10-15")).toBe(true);
  });
});

describe("parseCbkTbill", () => {
  it("extracts all three tenors", () => {
    const r = parseCbkTbill(TBILL_HTML, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators).toHaveLength(3);
    expect(r.indicators.map((i) => i.indicator)).toEqual([
      "tbill_91",
      "tbill_182",
      "tbill_364",
    ]);
    expect(r.indicators.map((i) => i.value)).toEqual([9.123, 9.456, 9.789]);
    for (const ind of r.indicators) {
      expect(ind.unit).toBe("%");
      expect(ind.source).toBe("CBK");
      expect(ind.source_url).toBe(SRC);
    }
  });

  it("returns ok:false (no throw) on empty and malformed HTML", () => {
    for (const html of ["", "   ", MALFORMED]) {
      const r = parseCbkTbill(html, SRC);
      expect(r.ok).toBe(false);
      expect(r.indicators).toEqual([]);
      expect(typeof r.error).toBe("string");
    }
  });

  it("returns ok:false when only some tenors are present", () => {
    const partial = `<html><body><p>91-day: 9.123%</p></body></html>`;
    const r = parseCbkTbill(partial, SRC);
    expect(r.ok).toBe(false);
    expect(r.indicators).toEqual([]);
  });

  it("reads the Previous Average Interest Rate from the live on-offer page", () => {
    const r = parseCbkTbill(TBILL_LIVE_SHAPE, SRC);
    expect(r.ok).toBe(true);
    expect(r.indicators.map((i) => i.indicator)).toEqual([
      "tbill_91",
      "tbill_182",
      "tbill_364",
    ]);
    expect(r.indicators.map((i) => i.value)).toEqual([8.75, 8.86, 9.0383]);
  });
});
