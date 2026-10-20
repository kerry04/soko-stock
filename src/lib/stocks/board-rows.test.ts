import { describe, expect, it } from "vitest";
import { isSpeculative } from "./board-rows.server";

describe("isSpeculative", () => {
  const row = { changePercent: 7, liquidity: "thin" as const, newsSurge: null };

  it("flags a big move on a thin counter with no news behind it", () => {
    expect(isSpeculative(row)).toBe(true);
    expect(isSpeculative({ ...row, changePercent: -5 })).toBe(true);
  });

  it("stays quiet when any leg of the signature is missing", () => {
    expect(isSpeculative({ ...row, changePercent: 4.9 })).toBe(false); // move too small
    expect(isSpeculative({ ...row, liquidity: "active" })).toBe(false); // not thin
    expect(isSpeculative({ ...row, liquidity: "liquid" })).toBe(false);
    expect(isSpeculative({ ...row, newsSurge: 3.2 })).toBe(false); // news explains it
    expect(isSpeculative({ ...row, changePercent: null })).toBe(false); // no move known
  });
});
