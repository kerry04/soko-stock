import { compileMatchers, stockKeywords, titleMatches } from "./matching";
import { classifyHeadline, type HeadlineEvent } from "./events";

/**
 * Event classes that can never carry a story to the lead on their own.
 * Enforcement is the classifier's crime-and-blotter bucket — arrests,
 * fines, lawsuits, fraud probes. Those stories stay on the wire as
 * ordinary articles, and one still leads when it names a heat company
 * (the company door), but on a stock product a crime story must not
 * become the lead just for being classified and fresh: on 2026-10-22 a
 * prison warder's murder arrest in Kilifi led /news exactly that way.
 * The market classes — results, dividends, deals, rates, policy and
 * the rest — stay eligible.
 */
const LEAD_EXCLUDED_EVENTS: ReadonlySet<HeadlineEvent> = new Set(["enforcement"]);

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
 *  1. A pipeline article that names a company the wire is tracking
 *     (the heat set, matched with the shared engine); failing that, a
 *     pipeline article carrying a classified market event, with the
 *     enforcement class excluded (see LEAD_EXCLUDED_EVENTS). A
 *     qualifying pipeline story always leads — world items never
 *     beat it.
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
    const companyHit = articles.find((a) =>
      matchers.some((m) => titleMatches(a.title, m)),
    );
    if (companyHit) return companyHit;
    const eventHit = articles.find((a) => {
      const event = classifyHeadline(a.title);
      return event != null && !LEAD_EXCLUDED_EVENTS.has(event);
    });
    if (eventHit) return eventHit;
  }
  return pickWorldLead(world) ?? articles[0] ?? null;
}
