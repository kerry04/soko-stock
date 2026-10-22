/**
 * Pure headline→company matchers, shared by the server signal engine
 * (news-signals.server) and client surfaces (the News page's headline
 * ticker chips). No imports, no env, no I/O — safe in any bundle.
 *
 * Moved verbatim from news-signals.server.ts (2026-10-21) so the match
 * semantics can never drift between the engine and the UI.
 */

const STOP = new Set([
  "the", "a", "an", "and", "of", "group", "limited", "ltd", "holdings",
  "plc", "sa", "nv", "inc", "corp", "corporation", "company", "co", "ag",
  "sca", "pty", "investments", "investment", "properties", "property",
  "stores", "store",
]);

/**
 * Words that are too generic to ever identify a company on their own.
 * A name that reduces to one of these falls back to a multi-word phrase.
 */
const GENERIC = new Set([
  "standard", "price", "prices", "pick", "click", "clicks", "first", "new",
  "national", "united", "international", "global", "world", "continental",
  "financial", "finance", "capital", "bank", "banks", "banking", "american",
  "british", "africa", "african", "south", "resources", "energy", "mining",
  "metals", "foods", "food", "retail", "telecom", "communications", "insurance",
  "life", "general", "trust", "partners", "enterprise", "industries",
  "industrial", "consumer", "digital", "technology", "tech", "media",
  "tobacco", "platinum", "gold", "equity", "securities", "express",
]);

/**
 * Words that can never identify a company when they appear ALONE in a
 * headline, however they reach the matcher — as the whole stored name,
 * as the one token left after cleanup, or as a long word inside a
 * longer name. Two families:
 *
 *  - Ordinary English words. The African Financials boards store short
 *    display names, so real rows arrive as bare "SET" (NSLTEC.NGX) and
 *    "FAMILY" (FMLY.NSE) — and on 2026-10-22 "First Ebola contacts set
 *    to return home Sunday" led the news wire because "set" matched.
 *    "access", "total", "press", "seed" and friends are the same trap:
 *    they saturate ordinary headlines.
 *  - Generic corporate vocabulary and suffixes. A phrase built from
 *    them ("standard bank", "family bank") still identifies a company;
 *    the bare word never does.
 *
 * Coined one-word brands — "safaricom", "britam", "sanlam", "sasol" —
 * are not here and still match on their own.
 */
const COMMON = new Set([
  "set", "family", "access", "art", "bat", "delta", "diamond", "far",
  "initiates", "press", "seed", "total",
  "group", "bank", "holdings", "holding", "trust", "fund", "capital",
  "global", "united", "national", "first", "standard", "royal",
  "crown", "union", "general", "premier", "sterling",
  "plc", "ltd", "limited", "inc", "co", "company",
  // Added 2026-10-22 after auditing every bare matcher the boards
  // produce (467 names): ordinary words and place names that saturate
  // headlines on their own. "university" is the one that bit — a bus
  // crash story led the wire as a University Press story. Each company
  // keeps its full-name phrase ("university press", "kenya airways",
  // "mt nigeria"); names stored as one such word alone ("Champion",
  // "Jubilee", "Livestock") yield no matchers, same as "SET" above.
  "academy", "airways", "alliance", "associated", "atlantic",
  "benefits", "breweries", "champion", "chemical", "cigarette",
  "cornerstone", "custodian", "depository", "eastern", "exchange",
  "hippo", "housing", "icon", "infinity", "jubilee", "leasing",
  "legend", "liberty", "livestock", "mwalimu", "nigeria", "nigerian",
  "precision", "prestige", "rainbow", "republic", "sovereign",
  "tanzania", "thomas", "universal", "university", "warehouse",
]);

/** Can this word identify a company when it appears alone in a title? */
function matchableAlone(word: string): boolean {
  return word.length >= 3 && !GENERIC.has(word) && !COMMON.has(word);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Pick n Pay Stores Limited" → phrase regex matching "Pick n Pay". */
function phraseRegex(tokens: string[]): RegExp {
  return new RegExp(`\\b${tokens.map(escapeRegExp).join("\\W+")}\\b`, "i");
}

/**
 * Distinctive match phrases for a company name. A name matches either
 * as a phrase of 2+ words ("Standard Bank Group Limited" →
 * ["standard bank"], "Clicks Group Limited" → ["clicks group"]) or as
 * one distinctive word ("Sasol Limited" → ["sasol"]). It NEVER matches
 * as one common word: a name that reduces to a lone COMMON/GENERIC
 * word ("SET", "FAMILY", "Enterprise") yields no matchers at all.
 */
export function stockKeywords(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Keep 1-char tokens inside phrases ("pick n pay"); only the
  // standalone shortcut requires a distinctive word (see matchableAlone).
  const tokens = cleaned.filter((w) => !STOP.has(w));
  if (tokens.length === 0) return [];

  // One distinctive token: use it alone ("sasol", "vodacom", "naspers").
  if (tokens.length === 1 && matchableAlone(tokens[0])) {
    return [tokens[0]];
  }

  // Otherwise the full distinctive phrase ("standard bank", "pick n pay").
  const phraseTokens =
    tokens.length === 1
      ? cleaned.filter((w) => w.length > 1).slice(0, 2) // "equity group"
      : tokens;
  // The fallback above can still collapse to a single word when the
  // stored name IS a single word ("SET", "Enterprise", "Access"). If
  // that word is not distinctive, the name identifies nothing — return
  // no matchers instead of a bare common word.
  if (phraseTokens.length === 1 && !matchableAlone(phraseTokens[0])) {
    return [];
  }
  const phrases = [phraseTokens.join(" ")];

  // Plus any long, distinctive single token for recall
  // ("sibanye stillwater" also matches bare "sibanye"; "sterling bank"
  // does NOT gain a bare "sterling").
  for (const t of tokens) {
    if (t.length >= 7 && matchableAlone(t) && !phrases.includes(t)) {
      phrases.push(t);
    }
  }
  return phrases;
}

/** Precompiled matchers for a set of keyword phrases. */
export function compileMatchers(keywords: string[]): RegExp[] {
  return keywords.map((k) => phraseRegex(k.split(" ")));
}

export function titleMatches(title: string, matchers: RegExp[]): boolean {
  return matchers.some((re) => re.test(title));
}
