import AccountConsole from "@/components/admin/AccountConsole";

export const dynamic = "force-dynamic";

/**
 * People — the unlock desk.
 *
 * Access is gated by app/admin/layout.tsx. Everything on this page is read and
 * repaired through /api/admin/accounts, so the same verdict logic runs whether
 * you land here or hit the API directly.
 */
export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <>
      <h1 className="admin-page-title">People</h1>
      <p className="admin-intro">
        Find an account, see in one line whether they can actually get in, and fix it. Every
        repair here runs with the service role and is recorded in the audit trail with the reason
        you give it.
      </p>
      <AccountConsole initialId={id} />
    </>
  );
}
