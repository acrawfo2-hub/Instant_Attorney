import HealthBoard from "@/components/admin/HealthBoard";

export const dynamic = "force-dynamic";

/**
 * Health — is everything actually up.
 *
 * Rendered client-side on purpose: the probes take seconds and one of them
 * calls back into this deployment over HTTP, so running them during the server
 * render would block the page on the very things being tested.
 */
export default function AdminHealthPage() {
  return (
    <>
      <h1 className="admin-page-title">Health</h1>
      <p className="admin-intro">
        Each check asserts an invariant this system has broken before, not just that a
        service answers. Three of them cover failures that are invisible from inside the
        product: an unapplied migration, an API prefix shadowed by Express, and a model
        with no pricing entry.
      </p>
      <HealthBoard />
    </>
  );
}
