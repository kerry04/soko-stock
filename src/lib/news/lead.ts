import { compileMatchers, stockKeywords, titleMatches } from "./matching";
import { classifyHeadline } from "./events";

/**
 * The lead-story pick, shared so it can be tested and run where the
 * filtered pipeline wire lives (the server). The lead is an editorial
 * pick, not just the newest story: the first article that names a
 * company the wire is tracking (the heat set, matched with the shared
 * engine) or carries a classified market event. Falls back to the
 * newest story when nothing qualifies, so the front page never renders
 * empty.
 *
 * Callers pass the FILTERED PIPELINE wire only — never the world-merged
 * list. On 2026-10-22 the pick ran client-side over the merged wire and
 * a pipeline blotter story that had landed seconds earlier ("Body of
 * Kirinyaga University student recovered from River Thiba…") took the
 * crown through the newest-story fallback. World items may lead only
 * when the pipeline wire itself is empty and the caller falls back.
 */
export function pickLeadStory<T extends { title: string }>(
  articles: readonly T[],
  heatNames: readonly string[],
): T | null {
  if (articles.length === 0) return null;
  const matchers = heatNames.map((name) => compileMatchers(stockKeywords(name)));
  const qualifies = (title: string) =>
    matchers.some((m) => titleMatches(title, m)) || classifyHeadline(title) != null;
  return articles.find((a) => qualifies(a.title)) ?? articles[0];
}
