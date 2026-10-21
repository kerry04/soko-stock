/**
 * Market-relevance filter — Soko Stock's read of the shared news pipeline.
 *
 * The pipeline carries the full Kenyan firehose (SokoResult's prediction
 * markets need all of it). A stock terminal does not: a headline earns
 * its place here only if it could plausibly move a price, a rate, or a
 * sector. Entertainment, sports, celebrity filler, crime blotter and
 * viral human-interest are dropped.
 *
 * Two gates, in order:
 *  0. FORMAT signatures — celebrity-bio and release formats that are
 *     never market news, checked first (a song titled 'Tea' is not
 *     agriculture coverage).
 *  1. KEEP signals — any market/macro/sector/policy word in the title
 *     keeps the story, whatever else it mentions. This gate runs first
 *     so a corruption arrest at a listed bank survives the blotter rules.
 *  2. DROP families — clear non-market signatures (celebrity bio filler,
 *     sports, showbiz, violent-incident blotter, viral posts, listicles).
 * Anything that matches neither gate is kept: borderline stays, the desks
 * and classifiers downstream sort it out. Deterministic keyword rules,
 * same philosophy as the event classifier.
 */

const KEEP_PATTERNS: RegExp[] = [
  // Markets & money
  /\bstocks?\b/i, /\bshares?\b/i, /investor/i, /\bnse\b/i, /dividend/i,
  /\bprofit/i, /revenue/i, /earnings/i, /listing/i, /\bipo\b/i, /\bbond/i,
  /treasury/i, /t-?bill/i, /privatis/i, /shareholder/i, /market\s*cap/i,
  // Macro & policy
  /\btax(es|ation)?\b/i, /\bpaye\b/i, /budget/i, /inflation/i,
  /central\s*bank/i, /\bcbk\b/i, /\bcbr\b/i, /interest\s*rates?/i,
  /shilling/i, /exchange\s*rate/i, /\bgdp\b/i, /\bdebt\b/i, /deficit/i,
  /fiscal/i, /monetary/i, /hustler\s*fund/i,
  // Sectors & real economy
  /\bfuel\b/i, /petrol/i, /diesel/i, /\boil\b/i, /pipeline/i, /\bepra\b/i,
  /\bbanks?\b/i, /insurance/i, /sacco/i, /microfinance/i, /telecom/i,
  /m-?pesa/i, /agricultur/i, /\btea\b/i, /coffee/i, /maize/i, /sugar/i,
  /milk\s*prices?/i, /export/i, /import/i, /\btrade\b/i, /manufactur/i,
  /industr/i, /housing/i, /construction/i, /tender/i, /procurement/i,
  /power\s*(tariff|bills?|prices?)/i, /electricity/i,
  // Corporate & governance
  /\bceo\b/i, /appoint/i, /\bresign/i, /acqui/i, /merger/i, /takeover/i,
  /graft/i, /corruption/i, /\beacc\b/i, /fraud/i,
  // A fine keeps a story only at corporate scale or from a regulator —
  // a footballer's Sh38,000 disciplinary fine is sports news.
  /(fine[ds]?|penalt\w+)\b[^.]{0,45}(million|billion|trillion)/i,
  /regulat/i, /\bcma\b/i, /\bkra\b/i, /court\s*orders?/i,
  // Jobs & programmes
  /\bjobs?\b/i, /internship\s*programme/i, /employment/i, /salary|wages?/i,
  // Risk that moves markets
  /sanction/i, /embargo/i, /drone\s*strike/i, /\bwar\b/i, /ceasefire/i,
  /election/i, /referendum/i, /impeach/i,
];

/**
 * Format signatures checked BEFORE the keep gate. These are publishing
 * formats, not topics — no market headline is ever a celebrity bio or a
 * song release — so they may outrank a stray keep-word (a song literally
 * titled 'Tea' must not pass as agriculture news).
 */
const FORMAT_DROP_PATTERNS: RegExp[] = [
  /siblings:/i, /getting\s+to\s+know/i, /:\s*all\s+about/i,
  /^who\s+is\s/i, /net\s+worth\s+of/i, /biography/i,
  /net\s+worth\s*(in\s+)?\d{4}/i, /net\s+worth\s*:/i,
  /new\s+song/i, /\balbum\b/i, /telenovela/i, /reality\s+(show|star)/i,
  /red\s+carpet/i,
];

const DROP_PATTERNS: RegExp[] = [
  // Entertainment & showbiz
  /\bsinger\b/i, /\bmusician\b/i, /\brapper\b/i, /\bcomedian\b/i,
  /\bactress\b/i, /\bactor\b/i, /celebrity/i, /showbiz/i, /concert/i,
  /headline\s+show/i, /\bvaping\b/i, /\bstage\b/i, /world\s*tour/i,
  // Sports
  /afcon/i, /world\s*cup/i, /premier\s*league/i, /champions\s*league/i,
  /stadium/i, /striker/i, /midfielder/i, /goalkeeper/i, /athlete/i,
  /olympic/i, /\bmarathon\b/i, /footballer/i, /\brugby\b/i,
  /\bcricket\b/i, /ronaldo/i, /messi/i, /mbapp/i, /arsenal/i,
  /chelsea/i, /manchester\s+(united|city)/i, /liverpool/i,
  /\bsport(s|men|women|sperson)?\b/i,
  // US sports — the international firehose (Fox Latest et al.) carries
  // them; the football-only list above let a World Series preview onto
  // the live wire on 2026-10-21.
  /world\s*series/i, /baseball/i, /super\s*bowl/i,
  /\bnfl\b/i, /\bnba\b/i, /\bmlb\b/i, /\bnhl\b/i,
  // Crime blotter & accidents (incident reports, not graft — graft keeps above)
  /shot\s+(dead|after)/i, /set\s+ablaze/i, /decomposed\s+body/i,
  /body\s+found/i, /found\s+dead/i, /dies\s+after\s+falling/i,
  /died\s+after\s+falling/i, /rescued\s+from\s+(a\s+)?house/i,
  /gang\s+member/i, /robbery\s+suspect/i,
  // Viral & human interest
  /amuses\s+kenyans/i, /kenyans\s+amused/i, /hilarious/i,
  /goes\s+viral/i, /gone\s+viral/i, /cheeky\s+.*\s+post/i,
  // Listicle filler
  /lists\s+\d+\s/i, /\d+\s+(things|ways|reasons|signs)\s/i,
];

/** True when a headline belongs on a stock terminal. */
export function isMarketRelevant(title: string): boolean {
  if (FORMAT_DROP_PATTERNS.some((re) => re.test(title))) return false;
  if (KEEP_PATTERNS.some((re) => re.test(title))) return true;
  if (DROP_PATTERNS.some((re) => re.test(title))) return false;
  return true;
}
