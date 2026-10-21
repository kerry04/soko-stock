import { Activity, ArrowLeftRight, Briefcase, Globe, Landmark, Newspaper, Rocket, SlidersHorizontal, Star, CandlestickChart } from "lucide-react";

export interface TerminalSection {
  label: string;
  /** Bloomberg-style function code, shown in the nav and typed in the command line. */
  code: string;
  to: string;
  icon: typeof Globe;
  hint: string;
}

/** The ops-room sections. Order is the product's spine. */
export const TERMINAL_SECTIONS: TerminalSection[] = [
  { label: "Start", code: "STRT", to: "/start", icon: Rocket, hint: "The path to your first share" },
  { label: "Trade", code: "TRDE", to: "/trade", icon: ArrowLeftRight, hint: "Buy and sell shares with practice money" },
  { label: "Stocks", code: "STK", to: "/", icon: CandlestickChart, hint: "African stock boards" },
  { label: "Screener", code: "SCRN", to: "/screener", icon: SlidersHorizontal, hint: "Filter stocks by what they did today" },
  { label: "News", code: "NEWS", to: "/news", icon: Newspaper, hint: "Headlines from the last 48 hours, by topic" },
  { label: "Map", code: "MAP", to: "/map", icon: Globe, hint: "Live global signal map" },
  { label: "Pulse", code: "PLS", to: "/pulse", icon: Activity, hint: "Market-moving news digest" },
  { label: "Economy", code: "ECO", to: "/economy", icon: Landmark, hint: "Inflation, rates & shilling" },
  { label: "Watchlist", code: "WCH", to: "/watchlist", icon: Star, hint: "Stocks you follow" },
  { label: "Portfolio", code: "PORT", to: "/portfolio", icon: Briefcase, hint: "Paper portfolio, positions & orders" },
];

export function isSectionActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/stocks");
  return pathname === to || pathname.startsWith(to + "/");
}
