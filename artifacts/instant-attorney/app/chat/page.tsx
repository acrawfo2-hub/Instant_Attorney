import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { BYPASS_EMAIL, personDisplayName } from "@/lib/types";
import AcpChatClient from "./AcpChatClient";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function getAccountIdentity() {
  if (BYPASS_AUTH) {
    return {
      accountName: personDisplayName({ full_name: "Test User", email: BYPASS_EMAIL }, BYPASS_EMAIL),
      accountEmail: BYPASS_EMAIL,
    };
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return { accountName: undefined, accountEmail: undefined };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? "";
  return {
    accountName: personDisplayName({ full_name: profile?.full_name, email }, email || "Account"),
    accountEmail: email,
  };
}

export default async function AcpChatPage() {
  const { accountName, accountEmail } = await getAccountIdentity();

  return (
    <Suspense>
      <AcpChatClient accountName={accountName} accountEmail={accountEmail} />
    </Suspense>
  );
}
