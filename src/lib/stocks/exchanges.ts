/**
 * African exchange definitions + curated constituents.
 *
 * Tickers are Yahoo Finance symbols (validated live 2026-09-26). Names and
 * prices always come from Yahoo at request time — this file only pins the
 * ticker list so the board is deterministic. No fabricated prices, ever.
 */

export interface Exchange {
  id: string;
  name: string;
  shortName: string;
  country: string;
  countryAlpha2: string;
  currency: string;
  currencySymbol: string;
  /** "live" = real quote feed wired; "soon" = exchange wanted, feed pending. */
  status: "live" | "soon";
  /** yahoo = per-ticker chart API; africanfinancials = EOD price-list tables. */
  source: "yahoo" | "africanfinancials";
  tickers: string[];
  /** cents-to-unit divisor: JSE quotes in ZAc (cents), display in Rand. */
  divisor: number;
  /**
   * Daily price limit in %, where the exchange publishes a single flat
   * band. Null = no flat band (JSE uses volatility auctions; DSE is
   * tiered 15/5/2 by market cap) or not yet verified. Never guess one.
   * Verified 2026-10-20 — see other-markets fact sheet.
   */
  dailyLimitPct: number | null;
  timeNote: string;
  /** IANA timezone of the exchange's home city — local-time displays
   *  (session ring, session strips). Metadata only; never a trading-hours claim. */
  tz: string;
}

export const EXCHANGES: Exchange[] = [
  {
    id: "JSE",
    name: "Johannesburg Stock Exchange",
    shortName: "JSE",
    country: "South Africa",
    countryAlpha2: "ZA",
    currency: "ZAR",
    currencySymbol: "R",
    status: "live",
    source: "yahoo",
    divisor: 100, // Yahoo quotes JSE equities in ZAc (cents)
    dailyLimitPct: null, // volatility auctions — no fixed band
    timeNote: "Quotes via Yahoo Finance, ~15 min delayed",
    tz: "Africa/Johannesburg",
    tickers: [
      "NPN.JO", // Naspers
      "PRX.JO", // Prosus
      "CFR.JO", // Richemont
      "ANH.JO", // AB InBev
      "AGL.JO", // Anglo American
      "BTI.JO", // British American Tobacco
      "SOL.JO", // Sasol
      "SBK.JO", // Standard Bank
      "FSR.JO", // FirstRand
      "MTN.JO", // MTN Group
      "SHP.JO", // Shoprite
      "VOD.JO", // Vodacom
      "ABG.JO", // Absa
      "NED.JO", // Nedbank
      "REM.JO", // Remgro
      "IMP.JO", // Impala Platinum
      "SSW.JO", // Sibanye Stillwater
      "KIO.JO", // Kumba Iron Ore
      "GRT.JO", // Growthpoint
      "RNI.JO", // Reinet
      "CLS.JO", // Clicks
      "PIK.JO", // Pick n Pay
      "MRP.JO", // Mr Price
      "TFG.JO", // Foschini
    ],
  },
  {
    id: "NSE",
    name: "Nairobi Securities Exchange",
    shortName: "NSE",
    country: "Kenya",
    countryAlpha2: "KE",
    currency: "KES",
    currencySymbol: "KSh",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 10,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Nairobi",
    tickers: [],
  },
  {
    id: "NGX",
    name: "Nigerian Exchange",
    shortName: "NGX",
    country: "Nigeria",
    countryAlpha2: "NG",
    currency: "NGN",
    currencySymbol: "₦",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 10,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Lagos",
    tickers: [],
  },
  {
    id: "GSE",
    name: "Ghana Stock Exchange",
    shortName: "GSE",
    country: "Ghana",
    countryAlpha2: "GH",
    currency: "GHS",
    currencySymbol: "GH₵",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 10,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Accra",
    tickers: [],
  },
  {
    id: "DSE",
    name: "Dar es Salaam Stock Exchange",
    shortName: "DSE",
    country: "Tanzania",
    countryAlpha2: "TZ",
    currency: "TZS",
    currencySymbol: "TSh",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: null,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Dar_es_Salaam",
    tickers: [],
  },
  {
    id: "USE",
    name: "Uganda Securities Exchange",
    shortName: "USE",
    country: "Uganda",
    countryAlpha2: "UG",
    currency: "UGX",
    currencySymbol: "USh",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 10,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Kampala",
    tickers: [],
  },
  {
    id: "LUSE",
    name: "Lusaka Securities Exchange",
    shortName: "LuSE",
    country: "Zambia",
    countryAlpha2: "ZM",
    currency: "ZMW",
    currencySymbol: "K",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 25,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Lusaka",
    tickers: [],
  },
  {
    id: "BSE",
    name: "Botswana Stock Exchange",
    shortName: "BSE",
    country: "Botswana",
    countryAlpha2: "BW",
    currency: "BWP",
    currencySymbol: "P",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: null,
    timeNote: "End-of-day quotes via African Financials (listed in thebe, shown in pula)",
    tz: "Africa/Gaborone",
    tickers: [],
  },
  {
    id: "MSE",
    name: "Malawi Stock Exchange",
    shortName: "MSE",
    country: "Malawi",
    countryAlpha2: "MW",
    currency: "MWK",
    currencySymbol: "MK",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: null,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Africa/Blantyre",
    tickers: [],
  },
  {
    id: "SEM",
    name: "Stock Exchange of Mauritius",
    shortName: "SEM",
    country: "Mauritius",
    countryAlpha2: "MU",
    currency: "MUR",
    currencySymbol: "Rs",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: null,
    timeNote: "End-of-day quotes via African Financials",
    tz: "Indian/Mauritius",
    tickers: [],
  },
  {
    id: "VFEX",
    name: "Victoria Falls Stock Exchange",
    shortName: "VFEX",
    country: "Zimbabwe",
    countryAlpha2: "ZW",
    currency: "USD",
    currencySymbol: "$",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: null,
    timeNote: "End-of-day quotes via African Financials (listed in US cents, shown in USD)",
    tz: "Africa/Harare",
    tickers: [],
  },
  {
    id: "ZSE",
    name: "Zimbabwe Stock Exchange",
    shortName: "ZSE",
    country: "Zimbabwe",
    countryAlpha2: "ZW",
    currency: "ZWG",
    currencySymbol: "ZiG",
    status: "live",
    source: "africanfinancials",
    divisor: 1,
    dailyLimitPct: 15,
    timeNote: "End-of-day quotes via African Financials (listed in ZiG cents, shown in ZiG)",
    tz: "Africa/Harare",
    tickers: [],
  },
];

export const EXCHANGE_BY_ID: Record<string, Exchange> = Object.fromEntries(
  EXCHANGES.map((e) => [e.id, e]),
);

export const LIVE_EXCHANGES = EXCHANGES.filter((e) => e.status === "live");

/**
 * "up" / "down" when a move has reached the exchange's daily band
 * (within 0.05pt — EOD tables round), else null. Null limit = no call.
 */
export function limitHitFor(
  changePercent: number | null,
  limitPct: number | null,
): "up" | "down" | null {
  if (changePercent == null || limitPct == null) return null;
  if (Math.abs(changePercent) < limitPct - 0.05) return null;
  return changePercent >= 0 ? "up" : "down";
}
