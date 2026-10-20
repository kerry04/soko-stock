import { Activity, Globe, Landmark, Newspaper, SlidersHorizontal, Star, CandlestickChart } from "lucide-react";

export interface TerminalSection {
  label: string;
  to: string;
  icon: typeof Globe;
  hint: string;
}

/** The seven ops-room sections. Order is the product's spine. */
export const TERMINAL_SECTIONS: TerminalSection[] = [
  { label: "Stocks", to: "/", icon: CandlestickChart, hint: "African stock boards" },
  { label: "Screener", to: "/screener", icon: SlidersHorizontal, hint: "Signal scans across every board" },
  { label: "News", to: "/news", icon: Newspaper, hint: "The 48h wire and topic desks" },
  { label: "Map", to: "/map", icon: Globe, hint: "Live global signal map" },
  { label: "Pulse", to: "/pulse", icon: Activity, hint: "Market-moving news digest" },
  { label: "Economy", to: "/economy", icon: Landmark, hint: "Inflation, rates & shilling" },
  { label: "Watchlist", to: "/watchlist", icon: Star, hint: "Stocks you follow" },
];

export function isSectionActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/stocks");
  return pathname === to || pathname.startsWith(to + "/");
}
