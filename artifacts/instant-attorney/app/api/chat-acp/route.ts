import Anthropic from "@anthropic-ai/sdk";
import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { logTruncation } from "@/lib/truncation-logger";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildAcpSystemPrompt, buildFileContext, ORCHESTRATOR_TOOLS_GUIDANCE } from "@/lib/prompts";
import { formatCoverBriefing } from "@/lib/cover-sheet";
import { ORCHESTRATOR_TOOLS, dispatchTool } from "@/lib/orchestrator-tools";
import { detectAcpAreasFromContext } from "@/lib/acp-area-router";
import { parseAndUpdateFile, isCompleteFileUpdate } from "@/lib/file-parser";
import { markLivingFileSyncedThrough, syncLivingFile, type MessageCursor } from "@/lib/living-file-extractor";
import { triggerPendingLookups } from "@/lib/gov-form-lookup";
import { generateCaseTitle } from "@/lib/title-generator";
import { toAnthropicBlock, processAttachment } from "@/lib/attachment-processor";
import { parseDrafts, planAssistantDraftPersistence } from "@/lib/freestyle-drafts";
import { persistDrafts } from "@/lib/draft-persistence";
import { stripToolMarkers } from "@/lib/tool-markers";
import { dispatchDocumentPlan, parseDocumentPlan } from "@/lib/document-plan";
import { kickDocumentGenerationJobs } from "@/lib/document-job-worker";
import { createDurableAcpJob, getAcpJob, getPredecessorChain, emitAcpChunk, finishDurableAcpJob } from "@/lib/acp-jobs";
import { recordAiFromMessage, recordAiUsage, recordStorageUpload } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, RequestedAttachment, CounselEngagementGoal } from "@/lib/types";
import { buildCounselContextPatch, persistCounselContext } from "@/lib/existing-counsel-persist";
import { resolveMatter } from "@/lib/matter-routing";
import {
  jurisdictionFromCaseFileText,
  normalizeStateCode,
  stateName,
} from "@/lib/jurisdiction";
import { getAnthropicClient, isXaiConfigured } from "@/lib/ai/clients";
import { resolveModel } from "@/lib/ai/models";
import { parseAiProvider } from "@/lib/ai/providers";
import { joinSystemBlocks, streamXaiChat } from "@/lib/ai/xai-chat";

const anthropic = getAnthropicClient();
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
// Cap on model↔tool round-trips per user turn, so a tool loop can't run away.
const MAX_TOOL_ITERATIONS = 5;

// Anthropic server-side web tools, offered alongside the custom orchestrator
// tools. They let the assistant actually LOOK at a client's live
// website (or an official source) instead of guessing — Anthropic executes them
// inline within the same stream. max_uses caps the per-turn server-tool fee, and
// max_content_tokens keeps a fetched page from blowing out the context window.
// Same proven pattern as the grounded gov-form lookup (see lib/gov-form-lookup.ts).
const WEB_TOOLS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 30000 },
] as unknown as Anthropic.Tool[];

// The freestyle tool loop can chain several model round-trips, so give the
// function room beyond the platform default.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { messages, caseFileId, pendingAttachment, fileType, counselContext } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    caseFileId?: string;
    fileType?: "standard" | "quick_consult";
    mode?: "intake" | "freestyle";
    pendingAttachment?: { data: string; mimeType: string; fileName: string };
    counselContext?: {
      has_existing_counsel: boolean;
      unsure?: boolean;
      existing_counsel_name?: string;
      counsel_engagement_goal?: CounselEngagementGoal | null;
    };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  let userId: string;
  let resolvedCaseFileId: string = caseFileId ?? "";

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = user.id;

    // The subscription check and the billing gate both depend only on the user
    // id, so run them concurrently to shave a DB round-trip off the latency
    // before the model stream can start.
    const [{ data: sub }, gate] = await Promise.all([
      db
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle(),
      // Pre-call billing gate: block new AI spend while a top-up is pending/failed.
      getBillingGate(user.id),
    ]);

    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: "Token top-up required",
          reason: gate.reason,
          meter_usd: gate.meterUsd,
          threshold_usd: gate.thresholdUsd,
        },
        { status: 402 }
      );
    }
  }

  // Ensure case file exists — seed jurisdiction from the client's home_state.
  // Also load AI provider preference for the workhorse model resolver.
  const { data: homeStateRow } = await db
    .from("profiles")
    .select("home_state, preferred_ai_provider")
    .eq("id", userId)
    .maybeSingle();
  const profileHomeState = normalizeStateCode(homeStateRow?.home_state ?? null);
  const preferredAiProvider = parseAiProvider(homeStateRow?.preferred_ai_provider);

  // Which matter this turn belongs to — the one place that decides. An explicit
  // caseFileId is verified and used; no caseFileId opens a new matter. It never
  // falls back to the client's most recent file. See lib/matter-routing.ts.
  const routed = await resolveMatter(db, userId, {
    caseFileId: resolvedCaseFileId || undefined,
    fileType,
    homeState: homeStateRow?.home_state ?? null,
  });
  if (!routed.ok) {
    return NextResponse.json({ error: routed.error }, { status: routed.status });
  }
  resolvedCaseFileId = routed.caseFileId;

  // Apply counsel intake from the pre-chat modal when the file has not recorded it yet.
  if (counselContext && resolvedCaseFileId) {
    const { data: intakeRow } = await db
      .from("case_files")
      .select("counsel_intake_at")
      .eq("id", resolvedCaseFileId)
      .maybeSingle();

    if (!intakeRow?.counsel_intake_at) {
      const built = buildCounselContextPatch(counselContext);
      if (!("error" in built)) {
        await persistCounselContext(
          db,
          resolvedCaseFileId,
          userId,
          built,
          counselContext.has_existing_counsel === true
        );
      }
    }
  }

  // Load current file state + attachments for context injection
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }, { data: accountRow }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", resolvedCaseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", resolvedCaseFileId),
      db.from("attachments").select("*").eq("case_file_id", resolvedCaseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", resolvedCaseFileId),
      db.from("profiles").select("account_type").eq("id", userId).maybeSingle(),
    ]);

  // Attorney-users get a reframed intake persona (no privilege/representation
  // language) — see buildAcpCoreHead/buildAcpCoreTail in lib/prompts.ts.
  const acpPersona = accountRow?.account_type === "attorney_user" ? "attorney_user" as const : "client" as const;

  const caseFile = caseFileRow as CaseFile | null;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];

  const fileContext = caseFile
    ? [
        formatCoverBriefing({
          matterSubtype: caseFile.matter_subtype,
          jurisdiction: caseFile.jurisdiction,
          goals: caseFile.goals,
          summary: caseFile.summary,
          blockingGap: facts.find((f) => f.status === "gap" && f.kind !== "hypothetical" && !/^What-if · /i.test(f.description))?.description ?? null,
          strategyRisk: caseFile.legal_strategy?.risks?.[0] ?? null,
          nextStep: caseFile.next_action ?? null,
        }),
        buildFileContext(caseFile, facts, attachments, requestedAttachments),
      ].join("\n")
    : "";

  // Build Anthropic messages — replace last user message with multimodal if attachment present
  type AnthropicMessage = { role: "user" | "assistant"; content: Anthropic.MessageParam["content"] };
  const anthropicMessages: AnthropicMessage[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  if (pendingAttachment) {
    const lastUserIdx = [...anthropicMessages].map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.role === "user")?.i ?? -1;

    if (lastUserIdx >= 0) {
      try {
        const buffer = Buffer.from(pendingAttachment.data, "base64");
        const blocks = await toAnthropicBlock(buffer, pendingAttachment.mimeType, pendingAttachment.fileName);
        const textContent = typeof anthropicMessages[lastUserIdx].content === "string"
          ? anthropicMessages[lastUserIdx].content as string
          : "";

        anthropicMessages[lastUserIdx] = {
          role: "user",
          content: [
            ...blocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[],
            ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
          ],
        };
      } catch (err) {
        console.error("[chat-acp] failed to build attachment block:", err);
      }
    }
  }

  // Persist the last user message concurrently with the model stream rather than
  // blocking time-to-first-token on the insert. Only the inline-screenshot path
  // (after the stream) needs its id; the stream's finally awaits this promise
  // before the response closes, so persistence is still guaranteed.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userMessagePromise: Promise<(MessageCursor & { id: string }) | null> = lastUserMsg
    ? (async () => {
        try {
          const { data } = await db
            .from("intake_messages")
            .insert({
              case_file_id: resolvedCaseFileId,
              user_id: userId,
              role: "user",
              content: pendingAttachment
                ? `[${pendingAttachment.fileName}]\n${lastUserMsg.content}`
                : lastUserMsg.content,
            })
            .select("id, created_at")
            .single();
          return data ? { id: data.id, createdAt: data.created_at } : null;
        } catch (err) {
          console.error("[chat-acp] failed to persist user message:", err);
          return null;
        }
      })()
    : Promise.resolve(null);

  // Route the deep-dive practice-area modules: load only the law this matter
  // implicates (detected from the conversation + case file) instead of all eight
  // areas every turn. prompts.ts always includes the compact area index, so an
  // as-yet-unmatched opening turn still degrades gracefully.
  const detectedAreas = detectAcpAreasFromContext(messages, caseFile);

  // Backfill jurisdiction from profile when the Living File has none yet.
  let effectiveJurisdiction = caseFile?.jurisdiction ?? null;
  if (!jurisdictionFromCaseFileText(effectiveJurisdiction) && profileHomeState) {
    effectiveJurisdiction =
      profileHomeState === "OTHER" ? "Outside the United States" : stateName(profileHomeState);
    if (resolvedCaseFileId && !caseFile?.jurisdiction) {
      await db
        .from("case_files")
        .update({ jurisdiction: effectiveJurisdiction })
        .eq("id", resolvedCaseFileId);
      if (caseFile) caseFile.jurisdiction = effectiveJurisdiction;
    }
  }

  const acpSystemPrompt = buildAcpSystemPrompt(detectedAreas, acpPersona, {
    homeState: profileHomeState,
    jurisdiction: effectiveJurisdiction,
  });

  // One assistant: calculators, record_fact, and document planning are always
  // available. That means this route always needs a tool-capable provider
  // (Anthropic today). A posted `mode` from older clients is ignored.
  const requiresAnthropicCapabilities = true;
  const resolved = resolveModel({
    tier: "workhorse",
    preference: preferredAiProvider,
    requiresAnthropicCapabilities,
    xaiConfigured: isXaiConfigured(),
  });
  const useXai = resolved.provider === "xai";
  const systemBlocks = [
    { type: "text" as const, text: acpSystemPrompt, cache_control: { type: "ephemeral" as const } },
    ...(fileContext ? [{ type: "text" as const, text: fileContext }] : []),
    { type: "text" as const, text: ORCHESTRATOR_TOOLS_GUIDANCE },
  ];

  const encoder = new TextEncoder();

  // Register this turn as a background job so the status endpoint can report
  // it and a reconnecting client can recover the finished text. createAcpJob
  // queues it behind any still-unfinished turn for this case; waiting on the
  // immediate predecessor is transitive (that predecessor waits on ITS
  // predecessor before it starts), so turns execute strictly in order.
  const job = await createDurableAcpJob(db, resolvedCaseFileId, userId);
  const waitForPrev = job.predecessorId ? getAcpJob(job.predecessorId) : null;
  // Never wait forever on a predecessor — if it somehow never finishes (crash
  // before finish, swept as stale), proceed without its reply.
  const PREV_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

  // Runs the model/tool loop and ALL persistence to completion, detached from
  // the HTTP response — if the browser disconnects or the user navigates away
  // mid-generation, the run keeps going and the assistant message, drafts, and
  // file updates still land in the DB. Progress fans out to any connected
  // stream via the job's listeners.
  const executeTurn = async (loopMessages: AnthropicMessage[]) => {
      let fullResponse = "";
      let runError: string | null = null;
      // The last model turn's final message — used below for truncation/usage.
      let finalMsg: Anthropic.Message | null = null;
      let assistantMessageId: string | null = null;
      let xaiFinishReason: string | null = null;
      let xaiOutputTokens = 0;
      // #87 declared loopMessages here; it is an executeTurn parameter now, so
      // the local shadow would break the detached-execution contract.
      const toolDb = createServiceClient();

      try {
        if (useXai) {
          const xaiMessages = [
            { role: "system" as const, content: joinSystemBlocks(systemBlocks) },
            ...messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
          ];
          const xaiResult = await streamXaiChat({
            model: resolved.modelId,
            messages: xaiMessages,
            maxTokens: maxOutputTokensFor(resolved.modelId),
            onTextDelta: (delta) => {
              fullResponse += delta;
              // #87 wrote straight to the response controller. Execution is
              // detached from the HTTP response now, so deltas fan out through
              // the job's listeners — otherwise an xAI turn would stream
              // nowhere once the browser disconnects.
              emitAcpChunk(job, delta);
            },
          });
          xaiFinishReason = xaiResult.finishReason;
          xaiOutputTokens = xaiResult.usage?.completion_tokens ?? 0;
          if (xaiResult.usage) {
            await recordAiUsage(db, {
              userId,
              actorId: userId,
              caseFileId: resolvedCaseFileId,
              feature: "chat_acp",
              model: xaiResult.model || resolved.modelId,
              inputTokens: xaiResult.usage.prompt_tokens,
              outputTokens: xaiResult.usage.completion_tokens,
              cacheReadTokens: xaiResult.usage.prompt_tokens_details?.cached_tokens ?? 0,
              metadata: {
                ...limitSignalMetadata({
                  model: xaiResult.model || resolved.modelId,
                  outputTokens: xaiResult.usage.completion_tokens,
                  priorLimit: 4000,
                  stopReason: xaiResult.finishReason,
                }),
                provider: "xai",
                resolve_reason: resolved.reason,
                preferred_ai_provider: preferredAiProvider,
                x_zero_data_retention: xaiResult.zeroDataRetention,
              },
            });
          }
        } else for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const turn = anthropic.messages.stream({
            model: resolved.modelId,
            max_tokens: maxOutputTokensFor(resolved.modelId),
            system: systemBlocks,
            messages: loopMessages,
            ...( { tools: [...ORCHESTRATOR_TOOLS, ...WEB_TOOLS] } ),
          });

          for await (const event of turn) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullResponse += event.delta.text;
              emitAcpChunk(job, event.delta.text);
            }
          }

          finalMsg = await turn.finalMessage().catch(() => null);
          if (finalMsg) {
            // Web tools carry a per-use server-tool fee billed separately from
            // tokens; flag it (with the request counts) so it lands on the
            // admin server-tool reconciliation pass instead of leaking margin.
            const serverToolUse = (finalMsg.usage as {
              server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
            }).server_tool_use;
            await recordAiFromMessage(db, finalMsg, {
              userId,
              actorId: userId,
              caseFileId: resolvedCaseFileId,
              feature: "chat_acp",
              metadata: {
                ...limitSignalMetadata({
                  model: finalMsg.model,
                  outputTokens: finalMsg.usage.output_tokens,
                  priorLimit: 4000,
                  stopReason: finalMsg.stop_reason,
                }),
                provider: "anthropic",
                resolve_reason: resolved.reason,
                preferred_ai_provider: preferredAiProvider,
                ...(serverToolUse
                  ? {
                      server_tools: true,
                      web_search_requests: serverToolUse.web_search_requests ?? 0,
                      web_fetch_requests: serverToolUse.web_fetch_requests ?? 0,
                    }
                  : {}),
              },
            });
          }

          if (!finalMsg) break;

          // A server-side web tool (web_search/web_fetch) can pause the turn
          // mid-research: resend the accumulated assistant content so Anthropic
          // resumes it — there are no tool results of ours to add.
          if (finalMsg.stop_reason === "pause_turn") {
            loopMessages.push({ role: "assistant", content: finalMsg.content });
            continue;
          }

          // Done unless the model asked to call one of OUR custom tools.
          if (finalMsg.stop_reason !== "tool_use") break;

          const toolUses = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            // Inline status marker so the UI can show a "running…" chip.
            emitAcpChunk(job, `\x02TOOL:${tu.name}:running\x02`);
            const out = await dispatchTool(tu.name, tu.input, { db, userId, caseFileId: resolvedCaseFileId });
            emitAcpChunk(job, `\x02TOOL:${tu.name}:done\x02`);
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: out.forModel });
            toolDb.from("orchestrator_tool_calls").insert({
              case_file_id: resolvedCaseFileId,
              user_id: userId,
              tool_name: tu.name,
              input: (tu.input ?? {}) as Record<string, unknown>,
              result: out.raw ?? null,
            }).then(undefined, (err) => console.error("[chat-acp] tool-call persist error:", err));
          }

          // Feed the assistant's tool_use turn and the results back for the next turn.
          loopMessages.push({ role: "assistant", content: finalMsg.content });
          loopMessages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        console.error("[chat-acp] generation error:", err);
        // Anthropic 400 "Could not process image" — bad/corrupt/too-small image.
        // Emit as a friendly assistant message rather than a hard error so the
        // user sees actionable text instead of "something went wrong".
        const errMsg = err instanceof Error ? err.message : String(err);
        const isImageError = /could not process image/i.test(errMsg) ||
          (typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 400 &&
           /image/i.test(errMsg));
        if (isImageError && !fullResponse) {
          fullResponse =
            "I wasn't able to read that image — it may be too small, corrupted, or in an unsupported format. " +
            "Please try a different image (PNG or JPEG, at least a few KB) or describe what's in it and I'll work from your description.";
          emitAcpChunk(job, fullResponse);
        } else {
          runError = errMsg;
        }
      } finally {
        try {
        // The user-message insert was kicked off before the stream to keep it
        // off time-to-first-token; await it here so its id is available for the
        // screenshot path below and persistence is flushed before the response
        // closes.
        const userMessageCursor = await userMessagePromise;
        const userMessageId = userMessageCursor?.id ?? null;

        if (fullResponse) {
          const { data: assistantMessage } = await db.from("intake_messages").insert({
            case_file_id: resolvedCaseFileId,
            user_id: userId,
            role: "assistant",
            content: fullResponse,
          }).select("id").single();
          assistantMessageId = assistantMessage?.id ?? null;

          // Land planned documents and ---DRAFT--- blocks in the drafts panel.
          // Stable protocol ids update their draft; a title is only a fallback
          // when it resolves unambiguously.
          {
            const plan = parseDocumentPlan(fullResponse);
            if (plan) {
              try {
                const jobIds = await dispatchDocumentPlan(toolDb, { caseFileId: resolvedCaseFileId, userId, plan });
                // Kick now, in a separate invocation when possible. The archival
                // cron is retention-only and must not be what fills this shell.
                if (jobIds.length) {
                  after(() => { kickDocumentGenerationJobs(toolDb, jobIds); });
                }
              } catch (err) {
                console.error("[chat-acp] document-plan dispatch error:", err);
              }
            }
            // Legacy inline drafts remain supported, but planned documents are
            // only enqueued here and are generated by the durable worker.
            //
            // #108's retry harness drives the loop; the callbacks keep #105's
            // semantics. Using #108's own callbacks would have matched on title
            // alone and updated unconditionally, dropping the two guards #105
            // exists for: never touch a draft the client has edited
            // (source <> 'assistant') and never touch one already promoted to a
            // document.
            const completedDrafts = parseDrafts(fullResponse);
            job.draftPersistence = await persistDrafts(completedDrafts, {
              find: async (draft) => {
                let query = db
                  .from("client_workspace_drafts")
                  .select("id, source, content, promoted_document_id, title")
                  .eq("case_file_id", resolvedCaseFileId)
                  .eq("user_id", userId);
                query = draft.draftId ? query.eq("id", draft.draftId) : query.eq("title", draft.title);
                const { data: matches, error } = await query
                  .order("updated_at", { ascending: false })
                  .limit(draft.draftId ? 1 : 2);
                if (error) return { id: null, error };
                const action = planAssistantDraftPersistence(draft, matches ?? []);
                // A null id routes the harness to insert(), which is what the
                // planner means by "do not overwrite this one".
                return { id: action.kind === "update" ? action.id : null, error: null };
              },
              update: async (id, draft) => {
                const { error } = await db.from("client_workspace_drafts")
                  .update({ content: draft.content, source: "assistant", updated_at: new Date().toISOString() })
                  .eq("id", id)
                  .eq("source", "assistant")
                  .is("promoted_document_id", null);
                return { error };
              },
              insert: async (draft) => {
                const action = planAssistantDraftPersistence(draft, []);
                const { data, error } = await db.from("client_workspace_drafts").insert({
                  case_file_id: resolvedCaseFileId,
                  user_id: userId,
                  title: action.kind === "insert" ? action.title : draft.title,
                  content: draft.content,
                  source: "assistant",
                  revision_of_draft_id: action.kind === "insert" ? action.revisionOfDraftId ?? null : null,
                }).select("id").single();
                return { id: data?.id ?? null, error };
              },
            });
            if (job.draftPersistence.failed.length > 0) {
              runError = "One or more generated drafts still need to be saved.";
              console.error("[chat-acp] draft persistence exhausted retries", job.draftPersistence.failed);
            }
          }

          // Parse and update file if response contains structured blocks
          const hasLivingFile = fullResponse.includes("---LIVING FILE---");
          const hasStrategy = fullResponse.includes("---LEGAL STRATEGY---");
          const hasRequestedAttachments = fullResponse.includes("---REQUESTED ATTACHMENTS---");
          const hasGovForms = fullResponse.includes("---GOVERNMENT FORMS---");

          if (hasLivingFile || hasStrategy || hasRequestedAttachments || hasGovForms) {
            // Warn when the model emitted a FILE UPDATE opening marker but the
            // closing marker is missing — parseAndUpdateFile will safely skip it,
            // but log it so we can see how often truncation silently drops updates.
            const hasFileUpdateBlock = fullResponse.includes("---FILE UPDATE---");
            if (hasFileUpdateBlock && !isCompleteFileUpdate(fullResponse)) {
              console.warn(
                "[chat-acp] Living File block detected but incomplete (truncated?) — update skipped.",
                { caseFileId: resolvedCaseFileId, responseLength: fullResponse.length }
              );
            }

            try {
              await parseAndUpdateFile(db, resolvedCaseFileId, userId, fullResponse);

              // When the model emitted a COMPLETE inline Living File block this
              // turn, advance the sync watermark so the background extractor
              // doesn't reprocess these same messages and produce near-duplicate
              // facts (upsertFacts only dedupes exact matches). Incomplete blocks
              // are left un-watermarked so the extractor still catches them.
              if (hasLivingFile && fullResponse.includes("---END FILE---") && userMessageCursor) {
                await markLivingFileSyncedThrough(db, resolvedCaseFileId, userMessageCursor);
              }

              // Kick off grounded web lookups for any newly-detected forms that
              // aren't in the curated registry (fire-and-forget, non-blocking).
              if (hasGovForms) {
                triggerPendingLookups(anthropic, db, resolvedCaseFileId, userId).catch(
                  (err) => console.error("[chat-acp] gov-form lookup trigger error:", err)
                );
              }

              // Generate a title after the first living file update if one isn't set yet
              if (hasLivingFile && caseFile && !caseFile.title) {
                const { data: freshFile } = await db
                  .from("case_files")
                  .select("title, summary, matter_type, matter_subtype")
                  .eq("id", resolvedCaseFileId)
                  .single();
                if (freshFile && !freshFile.title) {
                  generateCaseTitle(
                    db, resolvedCaseFileId,
                    freshFile.summary ?? "",
                    freshFile.matter_type,
                    freshFile.matter_subtype
                  ).catch((err) => console.error("[chat-acp] title gen error:", err));
                }
              }
            } catch (parseErr) {
              console.error("[chat-acp] file parser error:", parseErr);
            }
          }

          // Upload inline screenshot to storage + queue background analysis
          if (pendingAttachment) {
            try {
              const buffer = Buffer.from(pendingAttachment.data, "base64");
              const fileId = randomUUID();
              const storagePath = `${userId}/${resolvedCaseFileId}/${fileId}-${pendingAttachment.fileName}`;

              const serviceDb = createServiceClient();
              const { error: uploadErr } = await serviceDb.storage
                .from("case-attachments")
                .upload(storagePath, buffer, {
                  contentType: pendingAttachment.mimeType,
                  upsert: false,
                });

              if (!uploadErr) {
                await recordStorageUpload(db, {
                  userId,
                  actorId: userId,
                  caseFileId: resolvedCaseFileId,
                  bytes: buffer.length,
                  fileName: pendingAttachment.fileName,
                  mimeType: pendingAttachment.mimeType,
                });

                const { data: att } = await db
                  .from("attachments")
                  .insert({
                    case_file_id: resolvedCaseFileId,
                    user_id: userId,
                    message_id: userMessageId,
                    file_name: pendingAttachment.fileName,
                    file_type: pendingAttachment.mimeType,
                    file_size: buffer.length,
                    storage_path: storagePath,
                    attachment_type: pendingAttachment.mimeType.startsWith("image/") ? "screenshot" : "document",
                    status: "processing",
                  })
                  .select()
                  .single();

                if (att) {
                  processAttachment(
                    serviceDb, att.id, buffer,
                    pendingAttachment.mimeType, pendingAttachment.fileName,
                    resolvedCaseFileId
                  ).catch((err) => console.error("[chat-acp] screenshot processing error:", err));
                }
              }
            } catch (err) {
              console.error("[chat-acp] screenshot storage error:", err);
            }
          }
        }
        // Background Living File sweep (both modes). Debounced inside the
        // extractor — a cheap no-op until enough new messages accumulate — so
        // the file stays current even when this turn emitted no inline block.
        // Fire-and-forget, same lifetime as the other post-stream background
        // tasks above.
        syncLivingFile(anthropic, db, resolvedCaseFileId, userId,
          userMessageCursor ? { through: userMessageCursor } : {}).catch(
          (err) => console.error("[chat-acp] living file sync error:", err)
        );

        const truncated =
          finalMsg?.stop_reason === "max_tokens" ||
          xaiFinishReason === "length";
        if (truncated) {
          logTruncation({
            endpoint: "chat-acp",
            feature: "chat_acp",
            userId,
            caseFileId: resolvedCaseFileId,
            outputTokens: finalMsg?.usage.output_tokens ?? xaiOutputTokens,
          });
        }
        } catch (persistErr) {
          // Post-stream persistence must never leave the job unfinished — a
          // dangling job would make later turns wait on it and the client poll
          // forever.
          console.error("[chat-acp] post-processing error:", persistErr);
          runError = runError ?? "Post-processing failed.";
        } finally {
          await finishDurableAcpJob(db, job, {
            finalText: fullResponse,
            truncated: finalMsg?.stop_reason === "max_tokens",
            error: runError,
            assistantMessageId,
          });
        }
      }
  };

  // The turn runs detached from the HTTP stream: it starts whether or not the
  // client ever consumes the response, waits for its predecessor (transitively
  // serializing all turns for the case), and splices any predecessor replies
  // the client's history is missing before calling the model.
  const runTurn = async () => {
    const loopMessages: AnthropicMessage[] = [...anthropicMessages];

    if (waitForPrev && !waitForPrev.done) {
      // Keep-alive tool markers while the previous turn finishes (the client
      // strips these into a "running…" chip; without traffic the proxy would
      // drop a silent multi-minute connection). Emitted through the job so
      // any subscriber — live stream or a re-attached one — receives them.
      emitAcpChunk(job, "\x02TOOL:previous_turn:running\x02");
      const hb = setInterval(() => emitAcpChunk(job, "\x02TOOL:previous_turn:running\x02"), 8000);
      let waitTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          waitForPrev.promise,
          new Promise<void>((res) => { waitTimer = setTimeout(res, PREV_WAIT_TIMEOUT_MS); }),
        ]);
      } finally {
        clearInterval(hb);
        if (waitTimer) clearTimeout(waitTimer);
      }
      emitAcpChunk(job, "\x02TOOL:previous_turn:done\x02");
    }

    await db.from("chat_acp_jobs").update({ state: "running", updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("user_id", userId);

    // The client's history can't contain replies it never received — splice
    // every finished predecessor reply that's missing from the history in
    // ahead of the new user message (oldest first) so the model sees a
    // coherent conversation.
    const missingReplies = getPredecessorChain(job)
      .filter((p) => p.done)
      .map((p) => stripToolMarkers(p.finalText ?? "").trim())
      .filter((txt) => txt.length > 0)
      .filter((txt) => !loopMessages.some(
        (m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim() === txt
      ));
    if (missingReplies.length > 0) {
      let lastUserIdx = -1;
      for (let i = loopMessages.length - 1; i >= 0; i--) {
        if (loopMessages[i].role === "user") { lastUserIdx = i; break; }
      }
      if (lastUserIdx >= 0) {
        loopMessages.splice(lastUserIdx, 0, ...missingReplies.map(
          (txt) => ({ role: "assistant" as const, content: txt })
        ));
      }
    }

    await executeTurn(loopMessages);
  };
  void runTurn().catch((err) => {
    console.error("[chat-acp] turn failed to start:", err);
    if (!job.done) {
      void finishDurableAcpJob(db, job, { finalText: "", truncated: false, error: "The turn failed to start." });
    }
  });

  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (s: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(s)); } catch { closed = true; }
      };
      // Header frame: case file id + job id, so the client can re-attach via
      // the status endpoint if it lets go of this stream.
      safeEnqueue(`\x00${resolvedCaseFileId}|${job.id}\x00`);

      // Subscribe, then replay whatever the detached run already emitted.
      // (Synchronous block — no await between snapshot, add, and replay — so
      // nothing is lost or duplicated.)
      const listener = (chunk: string) => safeEnqueue(chunk);
      const alreadyEmitted = job.text;
      job.listeners.add(listener);
      if (alreadyEmitted) safeEnqueue(alreadyEmitted);
      await job.promise;
      job.listeners.delete(listener);

      if (job.truncated) {
        // Sentinel the client can detect to show a soft truncation notice.
        // \x01 is a non-printable ASCII control character that never appears in AI text.
        safeEnqueue("\x01TRUNCATED\x01");
      }
      if (job.error && !closed) {
        try { controller.error(new Error(job.error)); } catch { /* already closed */ }
        return;
      }
      try { controller.close(); } catch { /* client already gone */ }
    },
    cancel() {
      // Browser disconnected — executeTurn keeps running and persists results.
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
