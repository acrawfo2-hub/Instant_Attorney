"use client";

import { useEffect, useRef } from "react";

// A collapsed section of the Living File that opens itself when something links
// to it. The tile grid above is only useful if pressing "Key dates" actually
// lands the client *inside* key dates — a bare `<details>` would scroll to a
// closed lid. This listens for its own hash (on mount and on every hashchange),
// opens, and scrolls into view under the sticky header.
//
// Children are rendered by the server; this is a client shell purely for the
// open/scroll behavior, so nothing inside has to become a client component.

export default function FileSection({
  id,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function sync() {
      const el = ref.current;
      if (!el || window.location.hash !== `#${id}`) return;
      el.open = true;
      // Let the open transition commit before measuring the scroll target.
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);

  return (
    <details id={id} ref={ref} className="lf-details-section lf-anchor" open={defaultOpen}>
      <summary className="lf-details-summary">
        <span className="lf-details-summary-main">{title}</span>
        {hint && <span className="lf-details-summary-hint">{hint}</span>}
      </summary>
      <div className="lf-details-body">{children}</div>
    </details>
  );
}
