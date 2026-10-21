import type { ReactNode } from "react";
import { CommandBar } from "./CommandBar";
import { SiteFooter } from "./SiteFooter";
import { TerminalTabs } from "./TerminalTabs";

/**
 * Shared ops-room shell: command bar on top, the folio footer under the
 * content, tab bar on phones. Used by public pages and the signed-in
 * account layout alike. Page content sits inside a PageContainer owned
 * by each route; the shell owns the chrome and the footer.
 */
export function TerminalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <CommandBar />
      <main className="pb-[76px] md:pb-0">
        {children}
        <SiteFooter />
      </main>
      <TerminalTabs />
    </div>
  );
}
