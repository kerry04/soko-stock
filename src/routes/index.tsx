import { Component, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { StateBlock } from "@/components/common/states";
import { SignalMap } from "@/components/signals/SignalMap";
import { SessionRing } from "@/components/signals/SessionRing";
import { AccountStrip, YourShares } from "@/components/paper/AccountStrip";
import { usePaperSession } from "@/components/paper/use-paper-session";
import { usePaperPortfolio } from "@/components/paper/trade-panel";
import { useStockDirectory } from "@/components/nav/use-directory";

/** Safety net for the map subtree: a failure here degrades to a contained
 *  notice instead of taking the whole page down with it. */
class MapErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <StateBlock
          tone="error"
          title="Map failed to render"
          message={this.state.error.message}
        />
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Soko Stock — African stock markets on a globe" },
      {
        name: "description",
        content:
          "A world map of where the news is worst, the African exchanges on one globe, and your practice trading account — KSh 100,000 of virtual cash at real prices.",
      },
      { property: "og:title", content: "Soko Stock — African stock markets on a globe" },
    ],
  }),
  component: GlobePage,
});

function GlobePage() {
  const { user, loading: authLoading } = usePaperSession();
  const userId = user?.id ?? null;
  const { data, failed } = usePaperPortfolio(userId);
  const directory = useStockDirectory(!!user);
  const account = { user, authLoading, data, failed, directory };

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <AccountStrip state={account} />
        <PageHeader
          slug="GLOB · World news map"
          title="Global signal map"
          description="A world map of where the news is worst. Countries glow brighter the more bad news mentions them — protests, conflict, disasters, crime. Tap a country to read its top stories."
        />
        <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <SessionRing />
          <MapErrorBoundary>
            <SignalMap />
          </MapErrorBoundary>
        </div>
        <YourShares state={account} />
      </PageContainer>
    </TerminalShell>
  );
}
