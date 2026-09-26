import { Activity, Globe, Star, CandlestickChart } from "lucide-react";

export interface TerminalSection {
  label: string;
  to: string;
  icon: typeof Globe;
  hint: string;
}

/** The four ops-room sections. Order is the product's spine. */
export const TERMINAL_SECTIONS: TerminalSection[] = [
  { label: "Stocks", to: "/", icon: CandlestickChart, hint: "African stock boards" },
  { label: "Map", to: "/map", icon: Globe, hint: "Live global signal map" },
  { label: "Pulse", to: "/pulse", icon: Activity, hint: "Market-moving news digest" },
  { label: "Watchlist", to: "/watchlist", icon: Star, hint: "Stocks you follow" },
];

export function isSectionActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/stocks");
  return pathname === to || pathname.startsWith(to + "/");
}
