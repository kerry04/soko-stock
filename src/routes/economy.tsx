import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — the economy desk lives on the News page now. */
export const Route = createFileRoute("/economy")({
  beforeLoad: () => {
    throw redirect({ to: "/news" });
  },
});
