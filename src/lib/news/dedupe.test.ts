import { describe, expect, it } from "vitest";
import { dedupeByTitle, normalizeTitle } from "./dedupe";

const a = (title: string, published_at: string, source = "Nation") => ({
  title,
  published_at,
  source,
});

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation and HTML entities", () => {
    expect(normalizeTitle("Gov&#x27;t Announces 6,000 Jobs!")).toBe(
      "govt announces 6 000 jobs",
    );
    expect(normalizeTitle("Gov't announces 6,000 jobs")).toBe(
      "govt announces 6 000 jobs",
    );
  });
});

describe("dedupeByTitle", () => {
  it("collapses identical headlines from different outlets, keeping the earliest", () => {
    const rows = [
      a("Ruto replaces 'hustler' tag with new slogan", "2026-10-20T09:00:00Z", "Tuko"),
      a("Ruto replaces 'hustler' tag with new slogan", "2026-10-20T08:15:00Z", "Nation"),
      a("Treasury gives update on expressway", "2026-10-20T07:00:00Z"),
    ];
    const out = dedupeByTitle(rows);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.title.startsWith("Ruto"))?.source).toBe("Nation");
  });

  it("merges entity/punctuation variants of the same story", () => {
    const rows = [
      a("Gov&#x27;t announces 6,000 internship opportunities", "2026-10-20T06:00:00Z"),
      a("Gov't announces 6,000 internship opportunities.", "2026-10-20T06:30:00Z"),
    ];
    expect(dedupeByTitle(rows)).toHaveLength(1);
  });

  it("keeps genuinely different stories and returns newest first", () => {
    const rows = [
      a("KCB profit rises", "2026-10-19T06:00:00Z"),
      a("KCB profit warning issued", "2026-10-20T06:00:00Z"),
    ];
    const out = dedupeByTitle(rows);
    expect(out).toHaveLength(2);
    expect(out[0].title).toContain("warning");
  });
});
