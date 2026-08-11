import Link from "next/link";
import type { FileTile, TileIcon } from "@/lib/file-deck";

// The map of the file. Eight stable buttons, each with its own focused target,
// naming a thing a client came here to find and showing its live state. The
// detail behind each one is still on the file — it just lives behind its own
// destination instead of being poured onto the landing page at once.
//
// Each tile is a real link to a routed view (/dashboard/[id]?view=…), so a
// destination is shareable, survives a reload, and works with JS disabled. The
// three document tiles add a hash (?view=documents#uploads) to land on their
// band within the documents table.

const ICONS: Record<TileIcon, React.ReactNode> = {
  draft: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>
  ),
  review: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <polyline points="7 9 12 4 17 9" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  facts: (
    <>
      <path d="M9 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" />
      <path d="M5 3h4v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <line x1="12" y1="9" x2="17" y2="9" />
      <line x1="12" y1="13" x2="17" y2="13" />
    </>
  ),
  opponent: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="m9 11 2 2 4-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  wallet: (
    <>
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h14" />
      <path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h3v-4z" />
    </>
  ),
  person: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
};

function TileIconSvg({ name }: { name: TileIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

function Tile({ tile }: { tile: FileTile }) {
  const inner = (
    <>
      <span className="lf-tile-icon">
        <TileIconSvg name={tile.icon} />
      </span>
      <span className="lf-tile-body">
        <span className="lf-tile-label">
          {tile.label}
          {tile.count !== null && <span className="lf-tile-count">{tile.count}</span>}
        </span>
        <span className="lf-tile-status">{tile.status}</span>
      </span>
      <svg
        className="lf-tile-chev"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </>
  );

  const className = `lf-tile lf-tile-${tile.tone}`;

  // Same-page targets stay real anchors (shareable, work without JS); route
  // changes go through the router so the file doesn't do a full reload.
  return tile.href.startsWith("#") ? (
    <a href={tile.href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={tile.href} className={className}>
      {inner}
    </Link>
  );
}

export default function FileTiles({ tiles }: { tiles: FileTile[] }) {
  return (
    <nav className="lf-tiles" aria-label="Everything on your file">
      {tiles.map((t) => (
        <Tile key={t.id} tile={t} />
      ))}
    </nav>
  );
}
