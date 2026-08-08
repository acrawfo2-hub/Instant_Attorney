"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StrengthCheck } from "@/lib/strength-check-types";

// "How strong is my position?" — the client-facing adversarial stress test.
// On-demand (a full model run costs real money), streamed with NDJSON
// heartbeats so a multi-minute run never dies as a network error, and stored on
// legal_strategy so the attorney sees exactly what the client was told.

const BTN_IDLE = "Run strength check";
const BTN_RERUN = "Re-run with today's facts";

export default function StrengthCheckCard({
  caseFileId,
  check: initialCheck,
  isAttorney = false,
}: {
  caseFileId: string;
  check: StrengthCheck | null;
  isAttorney?: boolean;
}) {
  const router = useRouter();
  const [check, setCheck] = useState<StrengthCheck | null>(initialCheck);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Evidence items already sent to the checklist this session, by item text.
  const [added, setAdded] = useState<Record<string, "adding" | "added" | "error">>({});

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/strength-check`, { method: "POST" });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "The analysis could not start — try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { type?: string; check?: StrengthCheck; error?: string };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "result" && msg.check) {
            setCheck(msg.check);
            setAdded({});
          } else if (msg.type === "error") {
            throw new Error(msg.error ?? "The analysis failed — try again.");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setRunning(false);
    }
  }

  async function addEvidence(item: string, why?: string) {
    setAdded((m) => ({ ...m, [item]: "adding" }));
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/strength-check/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, why }),
      });
      if (!res.ok) throw new Error();
      setAdded((m) => ({ ...m, [item]: "added" }));
      // Refresh the server-rendered file so "Where things stand" picks it up.
      router.refresh();
    } catch {
      setAdded((m) => ({ ...m, [item]: "error" }));
    }
  }

  return (
    <div className="lf-card lf-card-full lf-strength" id="strength-check">
      <div className="lf-strength-head">
        <div>
          <div className="lf-card-label">
            How strong is my position?
            {!isAttorney && (
              <span className="lf-plain-caption">
                An honest read of your case the way the other side will see it
              </span>
            )}
          </div>
          {check && (
            <p className="lf-strength-meta">
              Last checked{" "}
              {new Date(check.generated_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
        </div>
        <button className="lf-strength-run" onClick={run} disabled={running}>
          {running ? (
            <>
              <span className="lf-strength-spinner" aria-hidden />
              Stress-testing your case…
            </>
          ) : check ? (
            BTN_RERUN
          ) : (
            BTN_IDLE
          )}
        </button>
      </div>

      {error && (
        <p className="lf-strength-error" role="alert">
          {error}
        </p>
      )}

      {!check && !running && !error && (
        <p className="lf-strength-empty">
          Before anything goes out, see your case the way opposing counsel will: your strongest
          points, the holes they&apos;ll aim for, and exactly what evidence closes them.
        </p>
      )}

      {running && (
        <p className="lf-strength-empty">
          Reading your full file — facts, deadlines, and drafts — and attacking it like the other
          side would. This can take a minute or two.
        </p>
      )}

      {check && (
        <div className="lf-strength-body">
          <p className="lf-strength-headline">{check.headline}</p>

          <div className="lf-strength-grid">
            {check.strongest.length > 0 && (
              <div>
                <div className="lf-strategy-sub">What&apos;s working for you</div>
                <ul className="lf-list lf-list-confirmed">
                  {check.strongest.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {check.weakest.length > 0 && (
              <div>
                <div className="lf-strategy-sub">Where you&apos;re exposed</div>
                <ul className="lf-list lf-list-gap">
                  {check.weakest.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {check.counterarguments.length > 0 && (
            <div className="lf-strength-section">
              <div className="lf-strategy-sub">How they&apos;ll attack — and your answer</div>
              <ul className="lf-strength-counters">
                {check.counterarguments.map((c, i) => (
                  <li key={i}>
                    <span className="lf-strength-attack">“{c.attack}”</span>
                    {c.response && <span className="lf-strength-response">→ {c.response}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {check.evidence.length > 0 && (
            <div className="lf-strength-section">
              <div className="lf-strategy-sub">Evidence that closes the gaps</div>
              <ul className="lf-strength-evidence">
                {check.evidence.map((e, i) => {
                  const state = added[e.item];
                  return (
                    <li key={i}>
                      <span className="lf-strength-evidence-body">
                        <span className="lf-strength-evidence-item">{e.item}</span>
                        {e.why && <span className="lf-strength-evidence-why">{e.why}</span>}
                      </span>
                      {!isAttorney && (
                        <button
                          className="lf-strength-add"
                          onClick={() => addEvidence(e.item, e.why)}
                          disabled={state === "adding" || state === "added"}
                        >
                          {state === "added"
                            ? "✓ On your checklist"
                            : state === "adding"
                              ? "Adding…"
                              : state === "error"
                                ? "Retry adding"
                                : "Add to my checklist"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="lf-strength-caveat">{check.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
