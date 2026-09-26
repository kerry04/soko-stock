import { Activity, Globe, Star, TrendingUp } from "lucide-react";

export interface TerminalSection {
  label: string;
  to: string;
  icon: typeof Globe;
  hint: string;
}

/** The four ops-room sections. Order is the product's spine. */
export const TERMINAL_SECTIONS: TerminalSection[] = [
  { label: "Map", to: "/", icon: Globe, hint: "Live signal map" },
  { label: "Markets", to: "/markets", icon: TrendingUp, hint: "Prediction markets" },
  { label: "Pulse", to: "/pulse", icon: Activity, hint: "Daily published pulse" },
  { label: "Watchlist", to: "/watchlist", icon: Star, hint: "Markets you follow" },
];

export function isSectionActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}
