// The client file's routed destinations.
//
// Every tile and every "see more" link on the landing page resolves to one of
// these via /dashboard/[id]?view=<destination>. The list lives here rather than
// inline in the page so the router, the view, and the test that guards against
// orphaned destinations all read the same source.
//
// The invariant worth protecting: a destination that nothing links to is dead
// content. It still renders, still routes, and no client can ever get there —
// which is exactly how the Living File was lost when the tile map dropped
// case-details. See client-destinations.test.ts.

export const CLIENT_DESTINATIONS = [
  "living-file",
  "documents",
  "deadlines",
  "facts",
  "strength",
  "help",
] as const;

export type ClientDestination = (typeof CLIENT_DESTINATIONS)[number];

/** Old bookmarks for the Living File, before it had its own tile. */
const ALIASES: Record<string, ClientDestination> = {
  "case-details": "living-file",
};

/** Narrow an untrusted ?view= value to a destination we actually render. */
export function parseClientDestination(view: string | undefined): ClientDestination | null {
  if (!view) return null;
  if (view in ALIASES) return ALIASES[view];
  return CLIENT_DESTINATIONS.find((d) => d === view) ?? null;
}
