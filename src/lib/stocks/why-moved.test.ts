import { describe, expect, it } from "vitest";
import {
  boardAverageSentence,
  classifiedStories,
  fiveDayChange,
  summarizeMove,
} from "./why-moved";

const NOW = new Date("2026-10-22T12:00:00Z").getTime();

const article = (id: string, title: string, daysAgo: number, source = "Wire") => ({
  id,
  title,
  url: `https://example.com/${id}`,
  source,
  published_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
});

const bars = (closes: number[]) => closes.map((c) => ({ c }));

describe("fiveDayChange", () => {
  it("measures the last close against five trading days earlier", () => {
    expect(fiveDayChange(bars([100, 101, 102, 103, 104, 105]))).toBeCloseTo(5, 5);
    expect(fiveDayChange(bars([100, 101, 102, 103, 104, 90]))).toBeCloseTo(-10, 5);
  });

  it("needs six closes", () => {
    expect(fiveDayChange(bars([100, 101, 102, 103, 104]))).toBeNull();
    expect(fiveDayChange([])).toBeNull();
  });
});

describe("summarizeMove", () => {
  it("uses the five-day change when daily bars exist", () => {
    const m = summarizeMove({
      name: "Safaricom",
      bars: bars([100, 101, 102, 103, 104, 105]),
      lastChangePercent: 0.5,
      nowMs: NOW,
    });
    expect(m.kind).toBe("five-day");
    expect(m.sentence).toBe("Safaricom is up 5.00% over the last five trading days.");
  });

  it("falls back to the last close for end-of-day listings", () => {
    const m = summarizeMove({
      name: "Safaricom",
      bars: [],
      lastChangePercent: -1.2,
      nowMs: NOW,
    });
    expect(m.kind).toBe("last-close");
    expect(m.sentence).toBe("At the last close, Safaricom was down 1.20%.");
  });

  it("says flat rather than up 0.00%", () => {
    const m = summarizeMove({
      name: "Safaricom",
      bars: bars([100, 100, 100, 100, 100, 100]),
      lastChangePercent: 0,
      nowMs: NOW,
    });
    expect(m.sentence).toContain("flat");
  });

  it("handles a missing close without inventing one", () => {
    const m = summarizeMove({
      name: "Safaricom",
      bars: [],
      lastChangePercent: null,
      nowMs: NOW,
    });
    expect(m.changePercent).toBeNull();
    expect(m.sentence).toContain("no completed close");
  });

  it("never uses causal words", () => {
    const m = summarizeMove({
      name: "Safaricom",
      bars: bars([100, 101, 102, 103, 104, 105]),
      lastChangePercent: 1,
      boardAveragePercent: 1.1,
      boardName: "Nairobi Securities Exchange",
      nowMs: NOW,
    });
    for (const text of [m.sentence, m.boardSentence ?? "", m.noStorySentence]) {
      expect(text.toLowerCase()).not.toContain("because");
      expect(text.toLowerCase()).not.toContain("caused by");
      expect(text.toLowerCase()).not.toContain("thanks to");
    }
  });
});

describe("boardAverageSentence", () => {
  it("speaks only when the moves are alike", () => {
    expect(boardAverageSentence(1.2, 1.4, "NSE")).toContain("similar move");
    expect(boardAverageSentence(1.2, 0.2, "NSE")).toBeNull();
    expect(boardAverageSentence(1.2, -1.2, "NSE")).toBeNull();
    expect(boardAverageSentence(null, 1.2, "NSE")).toBeNull();
    expect(boardAverageSentence(1.2, null, "NSE")).toBeNull();
  });
});

describe("classifiedStories", () => {
  it("keeps only classified headlines from the last seven days", () => {
    const stories = classifiedStories(
      [
        article("a", "Safaricom posts profit jump", 1),
        article("b", "Safaricom names new chief executive", 3),
        article("c", "Safaricom general news update", 2),
        article("d", "Safaricom profit warning", 9),
      ],
      NOW,
    );
    expect(stories.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("caps at two and dedupes repeated titles", () => {
    const stories = classifiedStories(
      [
        article("a", "Safaricom posts profit jump", 1),
        article("b", "Safaricom posts profit jump", 2),
        article("c", "Safaricom declares dividend", 3),
      ],
      NOW,
    );
    expect(stories).toHaveLength(2);
    expect(stories[0].event).toBe("results");
    expect(stories[1].event).toBe("dividend");
  });
});
