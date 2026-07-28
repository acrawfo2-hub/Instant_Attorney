import Anthropic from "@anthropic-ai/sdk";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import type { CitationType, CitationVerdict, Document } from "@/lib/types";

// Phase 2 of the attorney review orchestrator — the Authorities QA gate. After the
// revised draft is produced, extract every FORMAL legal citation and verify each
// one (cases and statutes) via live web search, so a mis-identified case can never
// silently reach the client. Runs on a LOW-COST model (Haiku) and batches all
// citations into a single web-search pass to keep server-tool spend minimal.
// See docs/attorney-review-orchestrator.md.

// Cheap model — this is extraction + grounded verification, not drafting.
const AUTHORITIES_MODEL = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const CITATION_TYPES = new Set<CitationType>(["case", "statute", "rule", "other"]);
const VERDICTS = new Set<CitationVerdict>(["verified", "unverified", "unsupported", "error"]);

interface ExtractedCitation {
  raw: string;
  citation_type: CitationType;
  claim: string;
}
interface VerifiedCitation extends ExtractedCitation {
  verdict: CitationVerdict;
  evidence: string;
  source_url: string | null;
}

const EXTRACT_SYSTEM = `You extract FORMAL legal citations from a legal document. A formal citation is one a reader could look up:
- a case citation (a party-v-party case name, with or without a reporter/court/year), e.g. "Smith v. Jones, 123 F.3d 456 (5th Cir. 2001)" or "Smith v. Jones";
- a statutory citation with a section, e.g. "Tex. Fam. Code § 6.301", "42 U.S.C. § 1983";
- a court rule, e.g. "Fed. R. Civ. P. 12(b)(6)".

Do NOT extract plain-meaning references to law that name no specific authority (e.g. "under Texas homestead law", "the applicable statute of limitations"). Only extract when a specific, lookup-able authority is named.

For each citation, capture the exact text as it appears and, in one short phrase, the proposition the document uses it to support.

Return ONLY a JSON array (no prose, no markdown). Empty array if there are none:
[{"raw":"<exact citation text>","citation_type":"case|statute|rule|other","claim":"<what the document says it supports>"}]`;

const VERIFY_SYSTEM = `You are a legal citation checker. For each citation, use web_search to determine:
1. whether the authority is REAL (the case/statute/rule actually exists as cited), and
2. whether it plausibly SUPPORTS the stated claim.

Prefer authoritative sources (court/government sites, reputable legal databases). Never guess — if you cannot find credible confirmation, the verdict is "unverified".

Verdicts:
- "verified": the authority is real AND supports the claim.
- "unsupported": the authority is real but does NOT support the claim (or says the opposite).
- "unverified": you cannot confirm the authority exists as cited.

Return ONLY a JSON array (no prose, no markdown), one object per input citation, in the same order:
[{"raw":"<exact citation text, copied from input>","verdict":"verified|unsupported|unverified","evidence":"<one sentence: what you found>","source_url":"<verifying URL or empty>"}]`;

function textOf(msg: Anthropic.Message): string {
  return (msg.content ?? [])
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Run the Authorities gate for a run's revised draft. Extracts formal citations,
 * verifies them via web search, and replaces this document's citation rows with
 * the results. Returns a summary. Resilient: a verification failure marks the
 * affected citations "error" (which blocks approval, failing safe) rather than
 * throwing — the surrounding run still completes.
 */
export async function runAuthoritiesGate(
  db: Db,
  runId: string,
  parentDoc: Document,
  revisedDraftText: string,
): Promise<{ total: number; blocking: number }> {
  // ── Extract ────────────────────────────────────────────────────────────────
  let extracted: ExtractedCitation[] = [];
  try {
    const extractResp = await anthropic.messages
      .stream({
        model: AUTHORITIES_MODEL,
        max_tokens: 1500,
        system: EXTRACT_SYSTEM,
        messages: [{ role: "user", content: `Document:\n\n${revisedDraftText}` }],
      })
      .finalMessage();
    await recordAiFromMessage(db, extractResp, {
      userId: parentDoc.user_id,
      caseFileId: parentDoc.case_file_id,
      feature: "attorney_review",
      metadata: { document_id: parentDoc.id, run_id: runId, stage: "authorities_extract" },
    });
    extracted = parseJsonArray(textOf(extractResp))
      .map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        const raw = typeof o.raw === "string" ? o.raw.trim() : "";
        if (!raw) return null;
        const t = typeof o.citation_type === "string" && CITATION_TYPES.has(o.citation_type as CitationType)
          ? (o.citation_type as CitationType)
          : "other";
        return { raw, citation_type: t, claim: typeof o.claim === "string" ? o.claim.trim() : "" };
      })
      .filter((c): c is ExtractedCitation => c !== null);
  } catch (err) {
    console.error("[authorities] extraction failed:", err);
    return { total: 0, blocking: 0 };
  }

  // Always replace this document's prior citation rows for a clean re-run.
  await db.from("document_qa_citations").delete().eq("document_id", parentDoc.id);

  if (extracted.length === 0) {
    return { total: 0, blocking: 0 };
  }

  // ── Verify (batched, single web-search pass) ─────────────────────────────────
  let verified: VerifiedCitation[];
  try {
    const list = extracted
      .map((c, i) => `${i + 1}. [${c.citation_type}] ${c.raw}\n   Claimed to support: ${c.claim || "(unspecified)"}`)
      .join("\n");
    const verifyResp = await anthropic.messages
      .stream({
        model: AUTHORITIES_MODEL,
        max_tokens: 2500,
        system: VERIFY_SYSTEM,
        tools: [
          { type: "web_search_20260209", name: "web_search" },
          { type: "web_fetch_20260209", name: "web_fetch" },
        ],
        messages: [{ role: "user", content: `Verify these ${extracted.length} citation(s):\n\n${list}` }],
      })
      .finalMessage();

    const searchRequests =
      (verifyResp.usage as { server_tool_use?: { web_search_requests?: number } })
        .server_tool_use?.web_search_requests ?? 0;
    await recordAiFromMessage(db, verifyResp, {
      userId: parentDoc.user_id,
      caseFileId: parentDoc.case_file_id,
      feature: "attorney_review",
      metadata: {
        document_id: parentDoc.id,
        run_id: runId,
        stage: "authorities_verify",
        server_tools: true,
        web_search_requests: searchRequests,
      },
    });

    const byRaw = new Map<string, { verdict: CitationVerdict; evidence: string; source_url: string | null }>();
    for (const r of parseJsonArray(textOf(verifyResp))) {
      const o = (r ?? {}) as Record<string, unknown>;
      const raw = typeof o.raw === "string" ? o.raw.trim() : "";
      if (!raw) continue;
      const verdict = typeof o.verdict === "string" && VERDICTS.has(o.verdict as CitationVerdict)
        ? (o.verdict as CitationVerdict)
        : "unverified";
      const url = typeof o.source_url === "string" && o.source_url.trim() ? o.source_url.trim() : null;
      byRaw.set(raw, { verdict, evidence: typeof o.evidence === "string" ? o.evidence.trim() : "", source_url: url });
    }

    verified = extracted.map((c) => {
      // Match on exact raw, else fall back to case-insensitive contains so a minor
      // reformat by the verifier doesn't lose a result (unmatched = unverified).
      const hit =
        byRaw.get(c.raw) ??
        [...byRaw.entries()].find(([k]) => k.toLowerCase().includes(c.raw.toLowerCase()) || c.raw.toLowerCase().includes(k.toLowerCase()))?.[1];
      return {
        ...c,
        verdict: hit?.verdict ?? "unverified",
        evidence: hit?.evidence ?? "Automated verification returned no result for this citation.",
        source_url: hit?.source_url ?? null,
      };
    });
  } catch (err) {
    console.error("[authorities] verification failed:", err);
    // Fail safe: verification unavailable → mark as error (blocks approval).
    verified = extracted.map((c) => ({
      ...c,
      verdict: "error" as CitationVerdict,
      evidence: "Automated verification could not run — verify this authority manually before approving.",
      source_url: null,
    }));
  }

  await db.from("document_qa_citations").insert(
    verified.map((c) => ({
      run_id: runId,
      document_id: parentDoc.id,
      raw: c.raw,
      citation_type: c.citation_type,
      claim: c.claim,
      verdict: c.verdict,
      evidence: c.evidence,
      source_url: c.source_url,
    })),
  );

  const blocking = verified.filter((c) => c.verdict !== "verified").length;
  return { total: verified.length, blocking };
}
