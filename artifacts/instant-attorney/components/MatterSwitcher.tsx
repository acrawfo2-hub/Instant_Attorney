"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LAST_MATTER_STORAGE_KEY,
  type MatterSwitcherItem,
} from "@/lib/matter-switcher";

/**
 * Header control to jump between open Living Files without returning to the
 * dashboard index. It remains a menu with one matter so starting a second case
 * is discoverable without interrupting the one-case cover-sheet experience.
 */
export default function MatterSwitcher({
  currentId,
  matters,
}: {
  currentId: string;
  matters: MatterSwitcherItem[];
}) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const current = matters.find((m) => m.id === currentId) ?? matters[0];
  const others = matters.filter((m) => m.id !== currentId);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_MATTER_STORAGE_KEY, currentId);
    } catch {
      /* ignore */
    }
  }, [currentId]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  function go(id: string) {
    setOpen(false);
    if (id === currentId) return;
    router.push(`/dashboard/${id}`);
  }

  return (
    <div className="matter-switcher" ref={rootRef}>
      <button
        type="button"
        className="matter-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="matter-switcher-label">Case</span>
        <span className="matter-switcher-title">{current.title}</span>
        <svg
          className={`matter-switcher-caret${open ? " matter-switcher-caret--open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="matter-switcher-menu" role="listbox" id={listId} aria-label="Open matters">
          <div className="matter-switcher-menu-head">Your cases</div>
          <button
            type="button"
            role="option"
            aria-selected="true"
            className="matter-switcher-item matter-switcher-item--current"
            onClick={() => setOpen(false)}
          >
            <span className="matter-switcher-item-title">{current.title}</span>
            {current.next_action && (
              <span className="matter-switcher-item-next">{current.next_action}</span>
            )}
            <span className="matter-switcher-item-badge">Current</span>
          </button>
          {others.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected="false"
              className="matter-switcher-item"
              onClick={() => go(m.id)}
            >
              <span className="matter-switcher-item-title">{m.title}</span>
              {m.next_action ? (
                <span className="matter-switcher-item-next">{m.next_action}</span>
              ) : (
                <span className="matter-switcher-item-next matter-switcher-item-next--muted">
                  No next step yet
                </span>
              )}
            </button>
          ))}
          <Link href="/dashboard/new" className="matter-switcher-all" onClick={() => setOpen(false)}>
            ＋ Start a new case
          </Link>
          <Link
            href="/dashboard"
            className="matter-switcher-all"
            onClick={() => setOpen(false)}
          >
            View all cases →
          </Link>
        </div>
      )}
    </div>
  );
}
