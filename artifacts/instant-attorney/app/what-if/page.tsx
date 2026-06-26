"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// The What-If Game — a standalone, OPTIONAL strategy tool.
//
// It is intentionally NOT part of any wizard. It helps a user pressure-test
// their goals against scenarios the law has seen many times, then (optionally)
// saves their answers into their Living File as facts. It never changes their
// documents or which wizards are recommended.
// ─────────────────────────────────────────────────────────────────────────────

interface Scenario {
  id: string;
  question: string;
  why_it_matters: string;
  legal_basis: string;
  fact_label: string;
  doc_nudge?: string;
}

interface WhatIfResult {
  intro: string;
  scenarios: Scenario[];
  closing?: string;
}

type Phase = "intro" | "loading" | "playing" | "summary";

const navy = "var(--brand-navy)";
const gold = "var(--brand-gold)";
const cream = "var(--brand-cream)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const serif = "var(--font-playfair), Georgia, serif";

function Shield({ size = 18, color = gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function WhatIfGame() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [phase, setPhase] = useState<Phase>("intro");
  const [scenarioInput, setScenarioInput] = useState("");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedCount, setSavedCount] = useState(0);

  // Prefill from a query param so the dashboard/file can deep-link a topic.
  useEffect(() => {
    const topic = params.get("topic");
    if (topic) setScenarioInput(topic);
  }, [params]);

  async function startGame() {
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId: caseFileId ?? undefined, scenario: scenarioInput.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setPhase("intro");
        return;
      }
      setResult(data.result as WhatIfResult);
      setSessionId(data.sessionId ?? null);
      setIndex(0);
      setAnswers({});
      setPhase("playing");
    } catch {
      setError("Network error. Please try again.");
      setPhase("intro");
    }
  }

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function advance() {
    if (!result) return;
    if (index < result.scenarios.length - 1) setIndex((i) => i + 1);
    else setPhase("summary");
  }

  async function saveToFile() {
    if (!result || !caseFileId) return;
    setSaveState("saving");
    const payload = result.scenarios
      .map((s) => ({ fact_label: s.fact_label, value: (answers[s.id] ?? "").trim() }))
      .filter((a) => a.value.length > 0);
    try {
      const res = await fetch("/api/what-if/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, sessionId, answers: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveState("error");
        return;
      }
      setSavedCount(data.saved ?? payload.length);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const answeredCount = result
    ? result.scenarios.filter((s) => (answers[s.id] ?? "").trim().length > 0).length
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>The What-If Game</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        {/* INTRO */}
        {phase === "intro" && (
          <section>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: "var(--brand-text-md)", padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
              <Shield size={14} color={gold} /> Optional strategy tool · won't change your documents
            </div>
            <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
              Think a few steps ahead
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 14px" }}>
              You have goals — but the law has seen these situations play out many times. This is a
              quick, no-pressure way to think through <em>&ldquo;what if…&rdquo;</em> possibilities you
              may not have considered, so your strategy gets sharper. It's completely optional, and it
              will never change your documents.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: textLt, margin: "0 0 22px" }}>
              {caseFileId
                ? "We'll use your file for context. Anything you decide to save is added to your Living File as notes — your drafts and attorney review are untouched."
                : "Describe a situation below. Tip: open this from one of your files and we'll tailor the questions to your matter — and let you save your answers."}
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: textMd, marginBottom: 8 }}>
              {caseFileId ? "Anything specific you want to pressure-test? (optional)" : "What's the situation?"}
            </label>
            <textarea
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              placeholder={caseFileId
                ? "e.g. I'm setting up a will and want to make sure my kids are protected…"
                : "e.g. I'm signing a contract to renovate my house with a $40k contractor…"}
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", padding: 14, fontSize: 15, lineHeight: 1.5, border: `1px solid ${border}`, borderRadius: 8, resize: "vertical", fontFamily: "inherit", color: textDk, background: "var(--brand-white)" }}
            />

            {error && <p style={{ color: "#b4341f", fontSize: 14, marginTop: 12 }}>{error}</p>}

            <button
              onClick={startGame}
              disabled={!caseFileId && scenarioInput.trim().length < 10}
              style={{ marginTop: 18, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer", opacity: !caseFileId && scenarioInput.trim().length < 10 ? 0.5 : 1 }}
            >
              Start the What-If Game →
            </button>
          </section>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <section style={{ textAlign: "center", padding: "80px 0" }}>
            <div className="wi-spin" style={{ width: 34, height: 34, border: `3px solid ${border}`, borderTopColor: gold, borderRadius: "50%", margin: "0 auto 18px" }} />
            <p style={{ color: textMd, fontSize: 15 }}>Thinking through the possibilities the law has seen…</p>
          </section>
        )}

        {/* PLAYING */}
        {phase === "playing" && result && (
          <section>
            {index === 0 && result.intro && (
              <p style={{ fontSize: 15.5, lineHeight: 1.6, color: textMd, margin: "0 0 22px", fontStyle: "italic" }}>{result.intro}</p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              {result.scenarios.map((s, i) => (
                <span key={s.id} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= index ? gold : border }} />
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: textLt, marginBottom: 18 }}>
              Scenario {index + 1} of {result.scenarios.length}
            </p>

            {(() => {
              const s = result.scenarios[index];
              return (
                <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
                  <h2 style={{ fontFamily: serif, fontSize: 23, lineHeight: 1.25, margin: "0 0 14px" }}>{s.question}</h2>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: textMd, margin: "0 0 14px" }}>{s.why_it_matters}</p>
                  {s.legal_basis && (
                    <p style={{ fontSize: 13, color: textLt, margin: "0 0 16px", paddingLeft: 12, borderLeft: `2px solid ${gold}` }}>
                      <strong style={{ color: textMd }}>Why the law cares:</strong> {s.legal_basis}
                    </p>
                  )}
                  {s.doc_nudge && (
                    <p style={{ fontSize: 13, color: textMd, background: "rgba(200,169,110,0.12)", padding: "10px 12px", borderRadius: 8, margin: "0 0 16px" }}>
                      💡 {s.doc_nudge}
                    </p>
                  )}
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: textMd, marginBottom: 8 }}>
                    What would you want to happen?
                  </label>
                  <textarea
                    value={answers[s.id] ?? ""}
                    onChange={(e) => setAnswer(s.id, e.target.value)}
                    placeholder="Type your thoughts… (or skip — nothing is required)"
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", padding: 12, fontSize: 15, lineHeight: 1.5, border: `1px solid ${border}`, borderRadius: 8, resize: "vertical", fontFamily: "inherit", color: textDk }}
                  />
                </div>
              );
            })()}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
              <button
                onClick={() => (index > 0 ? setIndex((i) => i - 1) : setPhase("intro"))}
                style={{ padding: "10px 16px", fontSize: 14, color: textMd, background: "transparent", border: `1px solid ${border}`, borderRadius: 8, cursor: "pointer" }}
              >
                ← Back
              </button>
              <button
                onClick={advance}
                style={{ padding: "12px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                {index < result.scenarios.length - 1 ? "Next →" : "See my summary →"}
              </button>
            </div>
          </section>
        )}

        {/* SUMMARY */}
        {phase === "summary" && result && (
          <section>
            <h1 style={{ fontFamily: serif, fontSize: 30, margin: "0 0 10px" }}>Your strategy notes</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: textMd, margin: "0 0 24px" }}>
              {result.closing ?? "Here's what you thought through. Nothing here changes your documents."}
            </p>

            {result.scenarios.map((s) => {
              const a = (answers[s.id] ?? "").trim();
              return (
                <div key={s.id} style={{ borderBottom: `1px solid ${border}`, padding: "14px 0" }}>
                  <p style={{ fontSize: 14.5, fontWeight: 500, margin: "0 0 4px" }}>{s.question}</p>
                  <p style={{ fontSize: 14, color: a ? textMd : textLt, margin: 0, fontStyle: a ? "normal" : "italic" }}>
                    {a || "— skipped —"}
                  </p>
                </div>
              );
            })}

            <div style={{ marginTop: 28 }}>
              {caseFileId ? (
                saveState === "saved" ? (
                  <div style={{ background: "rgba(200,169,110,0.14)", borderRadius: 10, padding: 18 }}>
                    <p style={{ margin: "0 0 12px", fontSize: 15, color: textDk }}>
                      ✓ Saved {savedCount} note{savedCount === 1 ? "" : "s"} to your Living File. Your drafts and attorney review are unchanged.
                    </p>
                    <Link href={`/dashboard/${caseFileId}`} style={{ color: navy, fontWeight: 500, fontSize: 14.5 }}>
                      Back to my file →
                    </Link>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={saveToFile}
                      disabled={saveState === "saving" || answeredCount === 0}
                      style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer", opacity: answeredCount === 0 ? 0.5 : 1 }}
                    >
                      {saveState === "saving" ? "Saving…" : `Save ${answeredCount} note${answeredCount === 1 ? "" : "s"} to my file`}
                    </button>
                    {saveState === "error" && <p style={{ color: "#b4341f", fontSize: 14, marginTop: 10 }}>Couldn't save just now — please try again.</p>}
                    <p style={{ fontSize: 12.5, color: textLt, marginTop: 10 }}>
                      Saving adds these as notes to your Living File only. It won't alter or generate any documents.
                    </p>
                  </>
                )
              ) : (
                <div style={{ background: "rgba(200,169,110,0.14)", borderRadius: 10, padding: 18 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14.5, color: textDk }}>
                    Want to keep these notes? Open the What-If Game from one of your files and we'll save your answers there.
                  </p>
                  <Link href="/dashboard" style={{ color: navy, fontWeight: 500, fontSize: 14.5 }}>Go to my files →</Link>
                </div>
              )}
            </div>

            <button
              onClick={() => { setPhase("intro"); setResult(null); setScenarioInput(""); setSaveState("idle"); }}
              style={{ marginTop: 22, padding: "10px 16px", fontSize: 14, color: textMd, background: "transparent", border: `1px solid ${border}`, borderRadius: 8, cursor: "pointer" }}
            >
              Play again with a different situation
            </button>
          </section>
        )}
      </main>

      <style>{`@keyframes wi-spin { to { transform: rotate(360deg); } } .wi-spin { animation: wi-spin 0.8s linear infinite; }`}</style>
    </div>
  );
}

export default function WhatIfPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--brand-cream)" }} />}>
      <WhatIfGame />
    </Suspense>
  );
}
