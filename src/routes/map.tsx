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
          "Live world signal map: news intensity, instability index, and converging signals per country.",
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
          slug="MAP · Signal atlas"
          title="Global signal map"
          description="The news behind the numbers — instability and converging signals, live."
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
