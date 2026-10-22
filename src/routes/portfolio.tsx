import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the three-page restructure — your shares live on the globe home page now. */
export const Route = createFileRoute("/portfolio")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
