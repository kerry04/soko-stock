import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — trading happens on each company's stock page now. */
export const Route = createFileRoute("/trade")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
