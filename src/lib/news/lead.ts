import { compileMatchers, stockKeywords, titleMatches } from "./matching";
import { classifyHeadline } from "./events";

/**
 * A world-merge story offered to the lead pick, tagged with the desk it
 * sits on in the merged wire ("africa" or "world"). World items have
 * already passed the market-relevance filter at fetch, so a candidate
 * is never sports/celebrity/viral filler.
 */
export interface LeadWorldCandidate {
  title: string;
  published_at: string;
  desk: "africa" | "world";
}

/** How close an Africa-desk story has to be to the freshest world
 *  story to win the tier-2 pick on home-continent grounds. */
export const AFRICA_LEAD_WINDOW_MS = 6 * 3600 * 1000;

/**
 * Tier 2, the world pick. Rule, kept simple on purpose: the freshest
 * world story sets the bar. An Africa-desk story no more than
 * AFRICA_LEAD_WINDOW_MS older than that bar wins — at similar freshness
 * the home-continent story is the better lead. If the freshest Africa
 * story is older than the window, the stories are not at similar
 * freshness, so the freshest story overall wins, whichever desk it
 * sits on.
 */
function pickWorldLead<W extends LeadWorldCandidate>(world: readonly W[]): W | null {
  if (world.length === 0) return null;
  const byNewest = [...world].sort((a, b) =>
    a.published_at < b.published_at ? 1 : -1,
  );
  const newest = byNewest[0];
  const newestAfrica = byNewest.find((a) => a.desk === "africa");
  if (
    newestAfrica &&
    Date.parse(newest.published_at) - Date.parse(newestAfrica.published_at) <=
      AFRICA_LEAD_WINDOW_MS
  ) {
    return newestAfrica;
  }
  return newest;
}

/**
 * The lead-story pick, shared so it can be tested and run where the
 * filtered pipeline wire lives (the server). The lead is an editorial
 * pick, not just the newest story, and it comes in three tiers:
 *
 *  1. The first pipeline article that names a company the wire is
 *     tracking (the heat set, matched with the shared engine) or
 *     carries a classified market event. A qualifying pipeline story
 *     always leads — world items never beat it.
 *  2. The pick from the world merge (see pickWorldLead). Reached only
 *     when no pipeline story qualifies. Pipeline stories pass a looser
 *     gate than the world feeds, so when nothing on the pipeline wire
 *     qualifies, its newest story can still be a non-market one — on
 *     2026-10-22 a bus-crash blotter story led /news exactly that way.
 *     A market-relevant world story is the better lead.
 *  3. The newest pipeline article, so the page never renders empty.
 */
export function pickLeadStory<T extends { title: string }, W extends LeadWorldCandidate>(
  articles: readonly T[],
  heatNames: readonly string[],
  world: readonly W[] = [],
): T | W | null {
  if (articles.length > 0) {
    const matchers = heatNames.map((name) => compileMatchers(stockKeywords(name)));
    const qualifies = (title: string) =>
      matchers.some((m) => titleMatches(title, m)) || classifyHeadline(title) != null;
    const hit = articles.find((a) => qualifies(a.title));
    if (hit) return hit;
  }
  return pickWorldLead(world) ?? articles[0] ?? null;
}
