import { describe, expect, it } from "vitest";
import { dayIndex } from "./news-signals.server";

// Regression tests for the UTC day-bucket fix: both timestamps are
// normalized to UTC calendar dates, so intraday times can no longer
// push an article out of range or into the wrong bucket.
describe("dayIndex (UTC calendar dates)", () => {
  const NOW = new Date("2026-10-20T14:00:00Z");

  it("puts an article from earlier today in the last bucket", () => {
    expect(dayIndex("2026-10-20T01:30:00Z", 30, NOW)).toBe(29);
    expect(dayIndex("2026-10-20T13:59:00Z", 30, NOW)).toBe(29);
  });

  it("puts yesterday in the second-to-last bucket, whatever the hour", () => {
    expect(dayIndex("2026-10-19T23:30:00Z", 30, NOW)).toBe(28);
    expect(dayIndex("2026-10-19T00:15:00Z", 30, NOW)).toBe(28);
  });

  it("handles the window edges", () => {
    expect(dayIndex("2026-09-21T10:00:00Z", 30, NOW)).toBe(0);
    expect(dayIndex("2026-09-20T10:00:00Z", 30, NOW)).toBe(-1);
  });

  it("handles midnight and leap day", () => {
    const midnight = new Date("2026-10-20T00:05:00Z");
    expect(dayIndex("2026-10-19T23:55:00Z", 30, midnight)).toBe(28);
    const mar1 = new Date("2024-03-01T12:00:00Z");
    expect(dayIndex("2024-02-29T12:00:00Z", 30, mar1)).toBe(28);
    expect(dayIndex("2024-02-28T12:00:00Z", 30, mar1)).toBe(27);
  });
});
