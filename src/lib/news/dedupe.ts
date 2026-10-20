/**
 * Syndication dedupe for the terminal's news reads.
 *
 * The same story reaches raw_news_data several times — wire copy carried
 * by multiple outlets, plus outright duplicate rows (identical headlines
 * were observed twice in a single 60-headline live sample). Left alone,
 * copies inflate story counts, surge ratios, desk baselines and company
 * heat. This collapses copies by normalized title and keeps the earliest
 * publication — the moment the market could first act on it.
 *
 * Normalization: lowercase, HTML entities stripped (the feed carries
 * things like "Gov&#x27;t"), punctuation removed, whitespace collapsed.
 * Near-identical headlines with real edits are NOT merged — that needs
 * similarity scoring and is deliberately out of scope here.
 */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, "")
    // Apostrophes are deleted, not separators: "Gov't", "Govt" and
    // "Gov&#x27;t" are the same word for matching purposes.
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse same-title copies, keeping the earliest-published one.
 * Returns a new array sorted newest first (the order every reader of
 * the feed already assumes).
 */
export function dedupeByTitle<T extends { title: string; published_at: string }>(
  articles: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const a of articles) {
    const key = normalizeTitle(a.title);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || a.published_at < prev.published_at) byKey.set(key, a);
  }
  return [...byKey.values()].sort((x, y) =>
    x.published_at < y.published_at ? 1 : -1,
  );
}
