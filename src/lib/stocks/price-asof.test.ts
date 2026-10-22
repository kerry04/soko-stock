import { describe, expect, it } from "vitest";
import { priceAsOfLabel } from "./price-asof";

describe("priceAsOfLabel", () => {
  it("uses the daily board's own label before the word close", () => {
    expect(
      priceAsOfLabel({ exchange: "NSE", updated: "Sep 25, 2026", asOf: "2026-09-25T18:00:00Z" }),
    ).toBe("Price · Sep 25, 2026 close");
  });

  it("falls back to the last close and its day and month", () => {
    expect(priceAsOfLabel({ exchange: "NGX", asOf: "2026-09-25T18:00:00Z" })).toBe(
      "Price · last close, 25 Sept",
    );
  });

  it("says only last close when there is no date either", () => {
    expect(priceAsOfLabel({ exchange: "GSE" })).toBe("Price · last close");
    expect(priceAsOfLabel({ exchange: "GSE", asOf: "not-a-date" })).toBe("Price · last close");
  });

  it("always states Johannesburg as about fifteen minutes behind", () => {
    expect(priceAsOfLabel({ exchange: "JSE", updated: "Sep 25, 2026" })).toBe(
      "Price · about fifteen minutes behind",
    );
  });
});
