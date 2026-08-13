"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { personDisplayName } from "@/lib/types";
import type { CaseFile, Profile } from "@/lib/types";

type FileRow = CaseFile & { profiles: Profile | null };

type SortKey = "client" | "matter" | "status" | "updated";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  referred: "Referred",
  archived: "Archived",
};

function clientName(f: FileRow) {
  return personDisplayName(f.profiles);
}

function matterLabel(f: FileRow) {
  const t = f.matter_type ?? "Unclassified";
  return f.matter_subtype ? `${t} — ${f.matter_subtype}` : t;
}

export default function AttorneyFileLog({ files }: { files: FileRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [clientFilter, setClientFilter] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updated" ? "desc" : "asc");
    }
  }

  const rows = useMemo(() => {
    let list = files;
    if (clientFilter) list = list.filter((f) => f.user_id === clientFilter.id);
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) list = list.filter((f) =>
      clientName(f).toLowerCase().includes(normalizedQuery) ||
      matterLabel(f).toLowerCase().includes(normalizedQuery) ||
      (f.next_action ?? "").toLowerCase().includes(normalizedQuery));

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "client":
          cmp = clientName(a).localeCompare(clientName(b));
          break;
        case "matter":
          cmp = matterLabel(a).localeCompare(matterLabel(b));
          break;
        case "status":
          cmp = (a.status ?? "").localeCompare(b.status ?? "");
          break;
        case "updated":
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }
      return cmp * dir;
    });
  }, [files, clientFilter, query, sortKey, sortDir]);

  function arrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="atty-th-arrow">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (!files.length) {
    return <div className="atty-empty">No client files</div>;
  }

  return (
    <div className="atty-log">
      <label className="atty-client-search">
        <span>Search clients and matters</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client, matter, or next action…" />
      </label>
      {clientFilter ? (
        <div className="atty-log-filter">
          Showing all files for <strong>{clientFilter.name}</strong>
          <button className="atty-chip-clear" onClick={() => setClientFilter(null)}>
            Clear ✕
          </button>
        </div>
      ) : (
        <div className="atty-log-hint">
          Sorted by most recent edit. Click a row to open its full file — or click a
          client&apos;s name to see all their files.
        </div>
      )}

      <table className="atty-table">
        <thead>
          <tr>
            <th className="atty-th-sort" onClick={() => toggleSort("client")}>Client {arrow("client")}</th>
            <th className="atty-th-sort" onClick={() => toggleSort("matter")}>Matter {arrow("matter")}</th>
            <th className="atty-th-sort" onClick={() => toggleSort("status")}>Status {arrow("status")}</th>
            <th className="atty-th-sort" onClick={() => toggleSort("updated")}>Last edited {arrow("updated")}</th>
            <th>Goals</th>
            <th aria-label="open" />
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr
              key={f.id}
              className="atty-tr-link"
              onClick={() => router.push(`/attorney/workbench/${f.id}`)}
            >
              <td>
                <button
                  className="atty-client-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    setClientFilter({ id: f.user_id, name: clientName(f) });
                  }}
                >
                  {clientName(f)}
                </button>
              </td>
              <td className="atty-td-matter">{matterLabel(f)}</td>
              <td>
                <span className={`atty-badge atty-status-${f.status}`}>
                  {STATUS_LABELS[f.status] ?? f.status}
                </span>
              </td>
              <td className="atty-td-muted">
                {new Date(f.updated_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </td>
              <td className="atty-td-muted">{f.goals?.length ?? 0}</td>
              <td className="atty-td-arrow"><span className="atty-workbench-label">Open workbench</span> →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
