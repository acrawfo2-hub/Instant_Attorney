import Link from "next/link";
import type { FileTile, TileIcon } from "@/lib/file-deck";

// The map of the file. Six buttons, always the same six in the same order, each
// naming a thing a client came here to find and showing its live state. The
// detail behind each one is still on the page — it just lives inside the tile's
// section instead of being poured onto the page at once.
//
// In-page targets are plain anchors so they work with JS disabled and are
// shareable; FileSection listens for the hash and opens itself.

const ICONS: Record<TileIcon, React.ReactNode> = {
  documents: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>
  ),
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
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
  scales: (
    <>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M8 7l-4 7a4 4 0 0 0 8 0z" />
      <path d="M16 7l-4 7a4 4 0 0 0 8 0z" />
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
