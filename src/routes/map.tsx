import { createFileRoute, redirect } from "@tanstack/react-router";

/** The globe is the home page now — /map lives on as a redirect so old
 * links and bookmarks land in the right place. */
export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
