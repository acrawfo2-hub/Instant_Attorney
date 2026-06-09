"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // best effort
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      className="lf-logout-btn"
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? "Signing out…" : "Sign Out"}
    </button>
  );
}
