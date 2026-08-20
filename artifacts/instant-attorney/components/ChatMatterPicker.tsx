"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { matterDisplayTitle } from "@/lib/matter-switcher";

interface MatterOption {
  id: string;
  title: string | null;
  matter_type: string | null;
  matter_subtype: string | null;
  file_type?: string | null;
  status: string;
  next_action: string | null;
  updated_at: string;
}

function matterName(file: MatterOption) {
  return matterDisplayTitle(file);
}

/** Compact, searchable matter context control for the client chat composer. */
export default function ChatMatterPicker({
  currentId,
  hasMessages,
}: {
  currentId: string | null;
  hasMessages: boolean;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<MatterOption[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/case-files")
      .then((response) => response.ok ? response.json() : { files: [] })
      .then((data) => { if (!cancelled) setFiles(data.files ?? []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [currentId]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // The case portfolio deliberately keeps archived files available for restore,
  // but chat context only offers active Living Files. This mirrors the case
  // header switcher and avoids accidentally adding new facts to a closed file.
  const openFiles = useMemo(() => files.filter((file) => file.status === "open"), [files]);
  const current = openFiles.find((file) => file.id === currentId);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? openFiles.filter((file) => `${matterName(file)} ${file.next_action ?? ""}`.toLowerCase().includes(needle))
      : openFiles;
  }, [openFiles, query]);

  function go(href: string) {
    if (hasMessages && !window.confirm("Start a separate conversation? This conversation is already saved to its current matter.")) return;
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="chat-matter-picker" ref={root}>
      <button
        type="button"
        className="chat-matter-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chat-matter-picker__icon" aria-hidden>▣</span>
        <span><small>{current ? "Case" : "Case context"}</small>{current ? matterName(current) : "Choose a case"}</span>
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div className="chat-matter-picker__menu" role="dialog" aria-label="Choose a matter">
          <div className="chat-matter-picker__heading">What are we working on?</div>
          <p className="chat-matter-picker__intro">Chat adds facts, drafts, and next steps to one case&apos;s nine-part Living File.</p>
          {openFiles.length > 6 && (
            <input
              autoFocus
              className="chat-matter-picker__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your matters…"
              aria-label="Search your matters"
            />
          )}
          <div className="chat-matter-picker__list">
            {shown.map((file) => (
              <div key={file.id} className={`chat-matter-picker__case${file.id === currentId ? " is-current" : ""}`}>
                <button type="button" onClick={() => go(`/chat?caseFileId=${file.id}`)}>
                  <span>{matterName(file)}<small>{file.next_action || (file.id === currentId ? "Current conversation" : "Continue this conversation")}</small></span>
                  <span aria-hidden>→</span>
                </button>
                <Link href={`/dashboard/${file.id}`} onClick={() => setOpen(false)}>Open 9-part case overview</Link>
              </div>
            ))}
            {shown.length === 0 && <p>No matching matters</p>}
          </div>
          <Link className="chat-matter-picker__new" href="/dashboard/new" onClick={() => setOpen(false)}>
            <span aria-hidden>＋</span><span><strong>Start a new case</strong><small>First keep its facts and documents separate</small></span>
          </Link>
          <Link className="chat-matter-picker__all" href="/dashboard" onClick={() => setOpen(false)}>View all cases →</Link>
          {!currentId && <p className="chat-matter-picker__hint">Not sure? Just start typing. The assistant will create a separate matter and help classify it.</p>}
        </div>
      )}
    </div>
  );
}
