// The client file's routed destinations.
//
// Every tile and every "see more" link on the landing page resolves to one of
// these via /dashboard/[id]?view=<destination>. The list lives here rather than
// inline in the page so the router, the view, and the test that guards against
// orphaned destinations all read the same source.
//
// The invariant worth protecting: a destination that nothing links to is dead
// content. It still renders, still routes, and no client can ever reach it —
// which is exactly how the case-details view was lost when the tile map was
// reduced. See client-destinations.test.ts.

export const CLIENT_DESTINATIONS = [
  "documents",
  "deadlines",
  "case-details",
  "facts",
  "strength",
  "help",
] as const;

export type ClientDestination = (typeof CLIENT_DESTINATIONS)[number];

/** Narrow an untrusted ?view= value to a destination we actually render. */
export function parseClientDestination(view: string | undefined): ClientDestination | null {
  return CLIENT_DESTINATIONS.find((d) => d === view) ?? null;
}
