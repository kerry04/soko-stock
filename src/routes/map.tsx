import { Component, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { StateBlock } from "@/components/common/states";
import { SignalMap } from "@/components/signals/SignalMap";
import { SessionRing } from "@/components/signals/SessionRing";

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

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Signal Map — Soko Stock" },
      {
        name: "description",
        content:
          "A live world map of where the news is worst — tap a country to read its top stories and see its local stocks.",
      },
      { property: "og:title", content: "Signal Map — Soko Stock" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="MAP · World news map"
          title="Global signal map"
          description="A world map of where the news is worst. Countries glow brighter the more bad news mentions them — protests, conflict, disasters, crime. Tap a country to read its top stories."
        />
        <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <SessionRing />
          <MapErrorBoundary>
            <SignalMap />
          </MapErrorBoundary>
        </div>
      </PageContainer>
    </TerminalShell>
  );
}
