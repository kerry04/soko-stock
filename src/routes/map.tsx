import { createFileRoute } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { SignalMap } from "@/components/signals/SignalMap";

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
        <SignalMap />
      </div>
    </TerminalShell>
  );
}
