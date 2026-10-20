import { Component, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { SignalMap } from "@/components/signals/SignalMap";

/** Diagnostic boundary: catches whatever is killing the map subtree and
 *  prints it in place, so the failure is visible instead of a dead page. */
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
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-red-500">
            Map failed to render
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-foreground">
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </div>
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
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
            Global signal map
          </h1>
          <p className="text-sm text-muted-foreground">
            The news behind the numbers — instability and converging signals, live.
          </p>
        </div>
        <MapErrorBoundary>
          <SignalMap />
        </MapErrorBoundary>
      </div>
    </TerminalShell>
  );
}
