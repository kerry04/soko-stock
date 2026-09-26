import type { ReactNode } from "react";
import { CommandBar } from "./CommandBar";
import { TerminalTabs } from "./TerminalTabs";

/**
 * Shared ops-room shell: command bar on top, tab bar on phones.
 * Used by public pages and the signed-in account layout alike.
 */
export function TerminalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <CommandBar />
      <main className="pb-[76px] md:pb-0">{children}</main>
      <TerminalTabs />
    </div>
  );
}
