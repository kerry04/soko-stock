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
  timeNote: string;
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
    timeNote: "Quotes via Yahoo Finance, ~15 min delayed",
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
    timeNote: "End-of-day quotes via African Financials",
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
    timeNote: "End-of-day quotes via African Financials",
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
    timeNote: "End-of-day quotes via African Financials",
    tickers: [],
  },
];

export const EXCHANGE_BY_ID: Record<string, Exchange> = Object.fromEntries(
  EXCHANGES.map((e) => [e.id, e]),
);

export const LIVE_EXCHANGES = EXCHANGES.filter((e) => e.status === "live");
