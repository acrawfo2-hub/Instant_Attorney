"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AccountMenuProps {
  /**
   * Display name (full name preferred, falls back to email). Optional — when
   * omitted (e.g. on client-rendered pages), the menu fetches the signed-in
   * user's identity from /api/account/profile itself.
   */
  name?: string;
  /** Account email — shown under the name in the dropdown. */
  email?: string;
  /** Set when the header background is light, so the trigger uses dark text. */
  onLight?: boolean;
}

/**
 * Header identity control: shows who you're signed in as and opens a menu with
 * a path to account settings / billing and a sign-out action. Drop it into any
 * authenticated page header (replaces the bare LogoutButton). Pass name/email
 * from a server component to avoid a fetch, or omit them to self-resolve.
 */
export default function AccountMenu({ name: nameProp, email: emailProp, onLight = false }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Self-resolve identity when not supplied by a server parent.
  const [fetchedName, setFetchedName] = useState("");
  const [fetchedEmail, setFetchedEmail] = useState("");
  const [isAttorney, setIsAttorney] = useState(false);
  const needsFetch = !nameProp && !emailProp;

  useEffect(() => {
    if (!needsFetch) return;
    let active = true;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setFetchedEmail(data.email ?? "");
        setFetchedName((data.full_name?.trim() || data.email || "").trim());
        setIsAttorney(!!data.is_attorney);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsFetch]);

  const email = emailProp ?? fetchedEmail;
  const name = nameProp ?? (fetchedName || fetchedEmail || "Account");

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

  // Initial for the avatar chip — first letter of name, else "?".
  const initial = (name?.trim()?.[0] ?? email?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="am-root" ref={ref}>
      <button
        type="button"
        className={`am-trigger${onLight ? " am-trigger--on-light" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="am-avatar" aria-hidden="true">{initial}</span>
        <span className="am-trigger-name">{name}</span>
        <svg
          className={`am-caret${open ? " am-caret--open" : ""}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="am-menu" role="menu">
          <div className="am-menu-head">
            <div className="am-menu-name">{name}</div>
            <div className="am-menu-email">{email}</div>
          </div>
          <div className="am-menu-sep" />
          <Link href="/account" className="am-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            {isAttorney ? "Account settings" : "Account & billing"}
          </Link>
          {!isAttorney && (
            <Link href="/account#pay-history" className="am-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Payment history
            </Link>
          )}
          <div className="am-menu-sep" />
          <button type="button" className="am-menu-item am-menu-item--danger" role="menuitem" onClick={handleLogout} disabled={loading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {loading ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
