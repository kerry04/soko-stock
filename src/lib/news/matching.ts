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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Pick n Pay Stores Limited" → phrase regex matching "Pick n Pay". */
function phraseRegex(tokens: string[]): RegExp {
  return new RegExp(`\\b${tokens.map(escapeRegExp).join("\\W+")}\\b`, "i");
}

/**
 * Distinctive match phrases for a company name. Never returns a bare
 * generic word: "Standard Bank Group Limited" → ["standard bank"],
 * "Clicks Group Limited" → ["clicks group"], "Sasol Limited" → ["sasol"].
 */
export function stockKeywords(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Keep 1-char tokens inside phrases ("pick n pay"); only the
  // standalone shortcut requires length ≥ 3.
  const tokens = cleaned.filter((w) => !STOP.has(w));
  if (tokens.length === 0) return [];

  // One distinctive token: use it alone ("sasol", "vodacom", "naspers").
  if (
    tokens.length === 1 &&
    tokens[0].length >= 3 &&
    !GENERIC.has(tokens[0])
  ) {
    return [tokens[0]];
  }

  // Otherwise the full distinctive phrase ("standard bank", "pick n pay").
  const phraseTokens =
    tokens.length === 1
      ? cleaned.filter((w) => w.length > 1).slice(0, 2) // "equity group"
      : tokens;
  const phrases = [phraseTokens.join(" ")];

  // Plus any long, non-generic single token for recall
  // ("sibanye stillwater" also matches bare "sibanye").
  for (const t of tokens) {
    if (t.length >= 7 && !GENERIC.has(t) && !phrases.includes(t)) {
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
