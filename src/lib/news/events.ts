/**
 * Headline event classification — the desk structure for company news.
 *
 * A headline gets at most one event class, by urgency: a profit warning
 * outranks a dividend mention inside a results story, and so on. Keyword
 * rules only — deterministic, no model call — so the desk a story lands
 * on never changes between page loads. Null = general news.
 */

export type HeadlineEvent =
  | "profit-warning"
  | "management"
  | "enforcement"
  | "dividend"
  | "results"
  | "corporate-action"
  | "contract"
  | "policy";

export const HEADLINE_EVENT_LABELS: Record<HeadlineEvent, string> = {
  "profit-warning": "Profit warning",
  management: "Management",
  enforcement: "Enforcement",
  dividend: "Dividend",
  results: "Results",
  "corporate-action": "Corporate action",
  contract: "Contract win",
  policy: "Policy & regulation",
};

const RULES: Array<[HeadlineEvent, string[]]> = [
  [
    "profit-warning",
    [
      "profit warning",
      "earnings warning",
      "profit alert",
      "issues warning",
      "warns of",
      "warning on profit",
    ],
  ],
  [
    "management",
    [
      "appoints",
      "appointed as",
      "names new",
      "new chief executive",
      "new ceo",
      "acting ceo",
      "resigns",
      "resignation",
      "steps down",
      "stepping down",
      "ousted",
      "sacks",
      "board appoints",
    ],
  ],
  [
    "enforcement",
    [
      "fined",
      "fines",
      "penalty of",
      "sued",
      "lawsuit",
      "court orders",
      "probe into",
      "investigates",
      "fraud",
      "graft",
      "licence revoked",
      "license revoked",
      "charged with",
      "arrested over",
    ],
  ],
  [
    "dividend",
    ["dividend", "payout ratio", "shareholder payout"],
  ],
  [
    "results",
    [
      "net profit",
      "profit after tax",
      "profit rises",
      "profit jumps",
      "profit surges",
      "profit drops",
      "profit falls",
      "profit grows",
      "earnings rise",
      "earnings jump",
      "earnings fall",
      "earnings drop",
      "half-year results",
      "half year results",
      "full-year results",
      "full year results",
      "quarterly results",
      "q1 results",
      "q2 results",
      "q3 results",
      "q4 results",
      "posts profit",
      "posts a profit",
      "posts loss",
      "posts a loss",
      "loss widens",
      "loss narrows",
      "revenue rises",
      "revenue falls",
      "turnover rises",
      "turnover falls",
    ],
  ],
  [
    "corporate-action",
    [
      "acquir",
      "merger",
      "takeover",
      "rights issue",
      "bonus issue",
      "share split",
      "stock split",
      "buyback",
      "buy-back",
      "delist",
      "lists on",
      "listing on",
      "ipo",
      "suspends trading",
      "trading suspension",
      "stake in",
      "sells stake",
      "buys stake",
    ],
  ],
  [
    "contract",
    [
      "wins contract",
      "awarded contract",
      "awards contract",
      "awarded tender",
      "awards tender",
      "tender award",
      "wins tender",
      "secures contract",
      "bags contract",
      "signs deal",
      "inks deal",
      "deal to build",
      "deal to supply",
      "contract worth",
    ],
  ],
  [
    "policy",
    [
      "central bank",
      "monetary policy",
      "cbr",
      "capital markets authority",
      "cma ",
      "regulator",
      "rate cut",
      "rate hike",
      "rates cut",
      "rates hike",
      "finance bill",
      "treasury bill",
      "t-bill",
    ],
  ],
];

export function classifyHeadline(title: string): HeadlineEvent | null {
  const t = ` ${title.toLowerCase()} `;
  for (const [event, phrases] of RULES) {
    if (phrases.some((p) => t.includes(p))) return event;
  }
  return null;
}
