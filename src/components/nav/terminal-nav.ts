import { Globe, Newspaper } from "lucide-react";

export interface TerminalSection {
  label: string;
  /** Bloomberg-style function code, shown in the nav and typed in the command line. */
  code: string;
  to: string;
  icon: typeof Globe;
  hint: string;
}

/** The whole app is two sections now: the Globe (home) and the News
 * wire. Stock pages hang off both. Order is the product's spine. */
export const TERMINAL_SECTIONS: TerminalSection[] = [
  { label: "Globe", code: "GLOB", to: "/", icon: Globe, hint: "The world map, your practice account and your shares" },
  { label: "News", code: "NEWS", to: "/news", icon: Newspaper, hint: "The Soko Wire — stock prices and the news moving them" },
];

export function isSectionActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/stocks");
  return pathname === to || pathname.startsWith(to + "/");
}
