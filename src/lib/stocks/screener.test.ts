import { describe, expect, it } from "vitest";
import { SCREEN_MATCHERS, type ScreenerRow } from "./screener.server";

const base = {
  price: 100,
  changePercent: null,
  wk52High: null,
  wk52Low: null,
  rsi: null,
  aboveSma50: null,
  relVolume: null,
  newsSurge: null,
} satisfies Parameters<(typeof SCREEN_MATCHERS)["gainers"]>[0];

describe("SCREEN_MATCHERS", () => {
  it("matches 52-week zones at the 1% boundary, not outside it", () => {
    expect(SCREEN_MATCHERS["52wk-high"]({ ...base, price: 99, wk52High: 100 })).toBe(true);
    expect(SCREEN_MATCHERS["52wk-high"]({ ...base, price: 98.9, wk52High: 100 })).toBe(false);
    expect(SCREEN_MATCHERS["52wk-low"]({ ...base, price: 101, wk52Low: 100 })).toBe(true);
    expect(SCREEN_MATCHERS["52wk-low"]({ ...base, price: 101.1, wk52Low: 100 })).toBe(false);
  });

  it("matches RSI extremes inclusively", () => {
    expect(SCREEN_MATCHERS["rsi-oversold"]({ ...base, rsi: 30 })).toBe(true);
    expect(SCREEN_MATCHERS["rsi-oversold"]({ ...base, rsi: 30.1 })).toBe(false);
    expect(SCREEN_MATCHERS["rsi-overbought"]({ ...base, rsi: 70 })).toBe(true);
    expect(SCREEN_MATCHERS["rsi-overbought"]({ ...base, rsi: 69.9 })).toBe(false);
  });

  it("matches volume surge at 2x and never on null history", () => {
    expect(SCREEN_MATCHERS["volume-surge"]({ ...base, relVolume: 2 })).toBe(true);
    expect(SCREEN_MATCHERS["volume-surge"](base)).toBe(false);
  });

  it("matches gainers/losers at the ±2% boundary and news on any surge ratio", () => {
    expect(SCREEN_MATCHERS.gainers({ ...base, changePercent: 2 })).toBe(true);
    expect(SCREEN_MATCHERS.gainers({ ...base, changePercent: 1.99 })).toBe(false);
    expect(SCREEN_MATCHERS.losers({ ...base, changePercent: -2 })).toBe(true);
    expect(SCREEN_MATCHERS["news-surge"]({ ...base, newsSurge: 3.1 })).toBe(true);
    expect(SCREEN_MATCHERS["news-surge"](base)).toBe(false);
  });

  it("trend screens require a real position vs the 50-day average", () => {
    expect(SCREEN_MATCHERS.uptrend({ ...base, aboveSma50: true })).toBe(true);
    expect(SCREEN_MATCHERS.uptrend({ ...base, aboveSma50: null })).toBe(false);
    expect(SCREEN_MATCHERS.downtrend({ ...base, aboveSma50: false })).toBe(true);
  });
});

// Type guard: ScreenerRow stays assignable to the row shape matchers consume.
type _RowCheck = Parameters<(typeof SCREEN_MATCHERS)["gainers"]>[0] extends Pick<
  ScreenerRow,
  "price" | "changePercent" | "wk52High" | "wk52Low" | "rsi" | "aboveSma50" | "relVolume" | "newsSurge"
>
  ? true
  : never;
const _check: _RowCheck = true;
void _check;
