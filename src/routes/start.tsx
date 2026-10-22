import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — the short answers live at the foot of every stock page now. */
export const Route = createFileRoute("/start")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
