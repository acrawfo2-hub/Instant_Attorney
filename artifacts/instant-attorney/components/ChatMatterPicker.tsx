"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface MatterOption {
  id: string;
  title: string | null;
  matter_type: string | null;
  matter_subtype: string | null;
  updated_at: string;
}

function matterName(file: MatterOption) {
  return file.title || file.matter_subtype?.replace(/_/g, " ") || file.matter_type || "Untitled matter";
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

  const current = files.find((file) => file.id === currentId);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? files.filter((file) => matterName(file).toLowerCase().includes(needle)) : files;
  }, [files, query]);

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
        <span>{current ? matterName(current) : "Choose a matter"}</span>
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div className="chat-matter-picker__menu" role="dialog" aria-label="Choose a matter">
          <div className="chat-matter-picker__heading">What are we working on?</div>
          {files.length > 6 && (
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
              <button key={file.id} type="button" onClick={() => go(`/chat?caseFileId=${file.id}`)} className={file.id === currentId ? "is-current" : ""}>
                <span>{matterName(file)}</span>
                <small>{file.id === currentId ? "Current conversation" : "Open conversation"}</small>
              </button>
            ))}
            {shown.length === 0 && <p>No matching matters</p>}
          </div>
          <button type="button" className="chat-matter-picker__new" onClick={() => go("/chat?newCase=1")}>
            <span aria-hidden>＋</span><span><strong>Start a new matter</strong><small>The assistant will organize it as you talk</small></span>
          </button>
          {!currentId && <p className="chat-matter-picker__hint">Not sure? Just start typing. The assistant will create a separate matter and help classify it.</p>}
        </div>
      )}
    </div>
  );
}
