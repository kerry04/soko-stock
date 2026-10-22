import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — the boards live on the News page now. */
export const Route = createFileRoute("/screener")({
  beforeLoad: () => {
    throw redirect({ to: "/news" });
  },
});
