import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — the digest lives on the News page now. */
export const Route = createFileRoute("/pulse")({
  beforeLoad: () => {
    throw redirect({ to: "/news" });
  },
});
