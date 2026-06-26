/**
 * Matter cold-archival engine.
 *
 * archiveMatter(): serialize a matter (all hot rows + attachment bytes) → gzip →
 * AES-256-GCM encrypt → upload one object to cold storage → VERIFY the stored
 * object decrypts to the original checksum → write the manifest → only then
 * purge the hot rows. Verify-before-purge is mandatory: we never delete live
 * data until the archive is proven retrievable.
 *
 * This REPLACES permanent deletion at archive_at. The matter is retained (not
 * destroyed) for the retention period recorded in the manifest and can be
 * produced on demand via retrieveMatter().
 */

import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Document } from "@/lib/types";
import { encryptArchive, decryptArchive, ENC_ALGO, ENC_KEY_VERSION, archiveEncryptionConfigured } from "./crypto";
import { inferRetentionCategory, computeRetentionUntil, type RetentionCategory } from "./retention";
import { DELIVERY_BUCKET } from "../document-delivery";

const ARCHIVE_BUCKET = "matter-archives";
const ATTACHMENT_BUCKET = "case-attachments";
// v2 adds document_deliveries (delivery audit trail) + their snapshot blobs.
const BUNDLE_SCHEMA_VERSION = 2;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Create the private archive bucket if it does not already exist. */
async function ensureArchiveBucket(serviceDb: SupabaseClient): Promise<void> {
  const { error } = await serviceDb.storage.createBucket(ARCHIVE_BUCKET, { public: false });
  // Ignore "already exists"; surface anything else.
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`Failed to ensure archive bucket: ${error.message}`);
  }
}

interface MatterBundle {
  schema_version: number;
  firm: string;
  archived_at: string;
  case_file: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  fact_items: unknown[];
  intake_messages: unknown[];
  documents: Record<string, unknown>[];
  attachments: Array<Record<string, unknown> & { content_base64: string | null }>;
  requested_attachments: unknown[];
  what_if_sessions: unknown[];
  form_instruments: unknown[];
  consult_requests: unknown[];
  // Delivery audit rows (what was delivered, to whom, in what review state) plus
  // the de-duplicated snapshot blobs they reference, so the byte-for-byte record
  // survives cold archival rather than being orphaned in live storage. Optional
  // for back-compat with v1 archives that predate the delivery trail.
  document_deliveries?: Record<string, unknown>[];
  document_delivery_blobs?: Array<{ storage_path: string; content_base64: string }>;
}

/** Gather every hot row + attachment byte for a matter into one bundle. */
export async function buildMatterBundle(
  serviceDb: SupabaseClient,
  caseFileId: string
): Promise<{ bundle: MatterBundle; meta: {
  userId: string | null; email: string | null; title: string | null;
  matterType: string | null; fileType: string | null;
  category: RetentionCategory; documentCount: number; attachmentCount: number;
} }> {
  const { data: caseFile } = await serviceDb
    .from("case_files").select("*").eq("id", caseFileId).single();
  if (!caseFile) throw new Error(`Matter ${caseFileId} not found`);

  const userId: string | null = caseFile.user_id ?? null;

  const [profileRes, factsRes, msgsRes, docsRes, attRes, reqAttRes, whatIfRes, formRes, consultRes, deliveriesRes] =
    await Promise.all([
      userId ? serviceDb.from("profiles").select("id, email, full_name, phone").eq("id", userId).maybeSingle()
             : Promise.resolve({ data: null }),
      serviceDb.from("fact_items").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("intake_messages").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("documents").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("attachments").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("what_if_sessions").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("form_instruments").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("consult_requests").select("*").eq("case_file_id", caseFileId),
      serviceDb.from("document_deliveries").select("*").eq("case_file_id", caseFileId),
    ]);

  const attachmentsRaw = (attRes.data ?? []) as Array<Record<string, unknown>>;

  // Pull the actual attachment bytes so the archived file is complete and does
  // not depend on the live storage bucket after purge.
  const attachments = await Promise.all(
    attachmentsRaw.map(async (a) => {
      const path = a.storage_path as string | undefined;
      let content_base64: string | null = null;
      if (path) {
        const { data, error } = await serviceDb.storage.from(ATTACHMENT_BUCKET).download(path);
        if (!error && data) {
          const buf = Buffer.from(await data.arrayBuffer());
          content_base64 = buf.toString("base64");
        }
      }
      return { ...a, content_base64 };
    })
  );

  const documents = (docsRes.data ?? []) as Record<string, unknown>[];
  const category = inferRetentionCategory(
    documents.map((d) => ({ doc_type: d.doc_type as Document["doc_type"] }))
  );

  // Delivery audit rows + their snapshot bytes. Snapshots are de-duplicated by
  // hash in storage, so download each distinct path once rather than per row.
  const documentDeliveries = (deliveriesRes.data ?? []) as Record<string, unknown>[];
  const deliveryPaths = Array.from(
    new Set(
      documentDeliveries
        .map((d) => d.storage_path as string | null)
        .filter((p): p is string => !!p)
    )
  );
  const document_delivery_blobs = (
    await Promise.all(
      deliveryPaths.map(async (storage_path) => {
        const { data, error } = await serviceDb.storage.from(DELIVERY_BUCKET).download(storage_path);
        if (error || !data) return null;
        const buf = Buffer.from(await data.arrayBuffer());
        return { storage_path, content_base64: buf.toString("base64") };
      })
    )
  ).filter((b): b is { storage_path: string; content_base64: string } => b !== null);

  const bundle: MatterBundle = {
    schema_version: BUNDLE_SCHEMA_VERSION,
    firm: "Crawford Law PLLC",
    archived_at: new Date().toISOString(),
    case_file: caseFile,
    profile: (profileRes.data as Record<string, unknown> | null) ?? null,
    fact_items: factsRes.data ?? [],
    intake_messages: msgsRes.data ?? [],
    documents,
    attachments,
    requested_attachments: reqAttRes.data ?? [],
    what_if_sessions: whatIfRes.data ?? [],
    form_instruments: formRes.data ?? [],
    consult_requests: consultRes.data ?? [],
    document_deliveries: documentDeliveries,
    document_delivery_blobs,
  };

  return {
    bundle,
    meta: {
      userId,
      email: (profileRes.data as { email?: string } | null)?.email ?? null,
      title: (caseFile.title as string) ?? (caseFile.matter_subtype as string) ?? null,
      matterType: (caseFile.matter_type as string) ?? null,
      fileType: (caseFile.file_type as string) ?? null,
      category,
      documentCount: documents.length,
      attachmentCount: attachments.length,
    },
  };
}

export interface ArchiveResult {
  archiveId: string;
  caseFileId: string;
  storagePath: string;
  sizeBytes: number;
  retentionUntil: string | null;
}

/** Archive a single matter to cold storage and purge the hot rows. */
export async function archiveMatter(
  serviceDb: SupabaseClient,
  caseFileId: string
): Promise<ArchiveResult> {
  if (!archiveEncryptionConfigured()) {
    throw new Error("Archival disabled: ARCHIVE_ENCRYPTION_KEY not set.");
  }
  await ensureArchiveBucket(serviceDb);

  const { bundle, meta } = await buildMatterBundle(serviceDb, caseFileId);

  // gzip(JSON) → checksum → encrypt → checksum
  const plaintext = gzipSync(Buffer.from(JSON.stringify(bundle)));
  const plaintextSha = sha256(plaintext);
  const blob = encryptArchive(plaintext);
  const blobSha = sha256(blob);

  const storagePath = `${meta.userId ?? "unknown"}/${caseFileId}-${Date.now()}.bin.enc`;

  const { error: upErr } = await serviceDb.storage
    .from(ARCHIVE_BUCKET)
    .upload(storagePath, blob, { contentType: "application/octet-stream", upsert: false });
  if (upErr) throw new Error(`Archive upload failed: ${upErr.message}`);

  // VERIFY before purge: re-download, decrypt, and confirm the checksum.
  try {
    const { data: verifyData, error: dlErr } = await serviceDb.storage
      .from(ARCHIVE_BUCKET).download(storagePath);
    if (dlErr || !verifyData) throw new Error(dlErr?.message ?? "download returned no data");
    const downloaded = Buffer.from(await verifyData.arrayBuffer());
    if (sha256(downloaded) !== blobSha) throw new Error("stored object checksum mismatch");
    if (sha256(decryptArchive(downloaded)) !== plaintextSha) {
      throw new Error("decrypted bundle checksum mismatch");
    }
  } catch (err) {
    // Verification failed — remove the bad object and DO NOT purge hot data.
    await serviceDb.storage.from(ARCHIVE_BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`Archive verification failed for ${caseFileId}: ${(err as Error).message}`);
  }

  const archivedAt = new Date();
  const retentionUntil = computeRetentionUntil(meta.category, archivedAt);

  const { data: manifest, error: manErr } = await serviceDb
    .from("matter_archives")
    .insert({
      case_file_id: caseFileId,
      user_id: meta.userId,
      user_email: meta.email,
      matter_title: meta.title,
      matter_type: meta.matterType,
      file_type: meta.fileType,
      storage_bucket: ARCHIVE_BUCKET,
      storage_path: storagePath,
      sha256: blobSha,
      plaintext_sha256: plaintextSha,
      size_bytes: blob.length,
      enc_algo: ENC_ALGO,
      enc_key_version: ENC_KEY_VERSION,
      document_count: meta.documentCount,
      attachment_count: meta.attachmentCount,
      category: meta.category,
      archived_at: archivedAt.toISOString(),
      retention_until: retentionUntil,
    })
    .select()
    .single();
  if (manErr || !manifest) {
    await serviceDb.storage.from(ARCHIVE_BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`Manifest write failed: ${manErr?.message}`);
  }

  // Purge hot data. Storage objects first (not cascade-covered): attachment bytes
  // and document-delivery snapshots. Then the case_files row (cascades to
  // fact_items, intake_messages, documents, attachments, requested_attachments,
  // what_if_sessions, form_instruments, and — via documents — document_deliveries).
  // consult_requests/usage_events use ON DELETE SET NULL and are intentionally
  // preserved (scheduling + billing records).
  const attachmentPaths = bundle.attachments
    .map((a) => a.storage_path as string | undefined)
    .filter((p): p is string => !!p);
  if (attachmentPaths.length) {
    await serviceDb.storage.from(ATTACHMENT_BUCKET).remove(attachmentPaths).catch(() => {});
  }
  const deliveryPaths = (bundle.document_delivery_blobs ?? []).map((b) => b.storage_path);
  if (deliveryPaths.length) {
    await serviceDb.storage.from(DELIVERY_BUCKET).remove(deliveryPaths).catch(() => {});
  }
  await serviceDb.from("case_files").delete().eq("id", caseFileId);

  return {
    archiveId: manifest.id,
    caseFileId,
    storagePath,
    sizeBytes: blob.length,
    retentionUntil,
  };
}

/** Retrieve and decrypt an archived matter for production to the client/court. */
export async function retrieveMatter(
  serviceDb: SupabaseClient,
  archiveId: string
): Promise<{ manifest: Record<string, unknown>; bundle: MatterBundle }> {
  const { data: manifest } = await serviceDb
    .from("matter_archives").select("*").eq("id", archiveId).single();
  if (!manifest) throw new Error(`Archive ${archiveId} not found`);
  if (manifest.destroyed_at) throw new Error(`Archive ${archiveId} was destroyed on ${manifest.destroyed_at}`);

  const { data, error } = await serviceDb.storage
    .from(manifest.storage_bucket).download(manifest.storage_path);
  if (error || !data) throw new Error(`Archive object download failed: ${error?.message}`);

  const blob = Buffer.from(await data.arrayBuffer());
  if (sha256(blob) !== manifest.sha256) throw new Error("Archive integrity check failed (object checksum)");
  const plaintext = decryptArchive(blob);
  if (sha256(plaintext) !== manifest.plaintext_sha256) {
    throw new Error("Archive integrity check failed (bundle checksum)");
  }
  const bundle = JSON.parse(gunzipSync(plaintext).toString()) as MatterBundle;
  return { manifest, bundle };
}

export interface SweepResult {
  scanned: number;
  archived: ArchiveResult[];
  failures: Array<{ caseFileId: string; error: string }>;
  skipped: string;
}

/**
 * Archive all matters that have reached their archive date and are not on legal
 * hold. Intended to run on a daily schedule. Safe to re-run; failures are
 * isolated per matter so one bad matter does not block the rest.
 */
export async function sweepArchivableMatters(
  serviceDb: SupabaseClient,
  limit = 50
): Promise<SweepResult> {
  if (!archiveEncryptionConfigured()) {
    return { scanned: 0, archived: [], failures: [], skipped: "ARCHIVE_ENCRYPTION_KEY not set" };
  }

  const nowIso = new Date().toISOString();
  const { data: due } = await serviceDb
    .from("case_files")
    .select("id")
    .eq("status", "archived")
    .eq("legal_hold", false)
    .not("archive_at", "is", null)
    .lte("archive_at", nowIso)
    .limit(limit);

  const matters = (due ?? []) as Array<{ id: string }>;
  const archived: ArchiveResult[] = [];
  const failures: Array<{ caseFileId: string; error: string }> = [];

  for (const m of matters) {
    try {
      archived.push(await archiveMatter(serviceDb, m.id));
    } catch (err) {
      failures.push({ caseFileId: m.id, error: (err as Error).message });
    }
  }

  return { scanned: matters.length, archived, failures, skipped: "" };
}
