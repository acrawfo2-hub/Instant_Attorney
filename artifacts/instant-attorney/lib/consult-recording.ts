/**
 * Consult recording storage. A completed audio recording is archived
 * byte-for-byte and a consult_recordings row is written to track it and its
 * (later) transcript. Modeled on lib/document-delivery.ts — writes go through
 * a SERVICE-ROLE client only (consult_recordings has no client write policy),
 * so the recording/transcript trail cannot be forged from a user session.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsultRecording } from "./types";

export const RECORDING_BUCKET = "consult-recordings";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function extensionFor(contentType: string): string {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mp4")) return "mp4";
  return "audio";
}

interface StoreRecordingInput {
  /** Must be a service-role client — consult_recordings is service-write only. */
  serviceDb: SupabaseClient;
  consultRequestId: string;
  recordedBy: string;
  buffer: Buffer;
  contentType: string;
  durationSeconds: number | null;
}

/** Archive the recording and insert its tracking row. Throws on failure — unlike
 *  document delivery, a lost recording is the whole point of this feature, so
 *  callers should surface the error rather than swallow it. */
export async function storeConsultRecording(
  input: StoreRecordingInput
): Promise<ConsultRecording> {
  const { serviceDb, consultRequestId, recordedBy, buffer, contentType, durationSeconds } = input;

  const hash = sha256(buffer);
  const path = `${consultRequestId}/${hash}.${extensionFor(contentType)}`;

  const attempt = () =>
    serviceDb.storage.from(RECORDING_BUCKET).upload(path, buffer, { contentType, upsert: false });

  let { error } = await attempt();

  if (error && /bucket.*not.*found|not.*found.*bucket|no such bucket/i.test(error.message)) {
    const { error: bucketErr } = await serviceDb.storage.createBucket(RECORDING_BUCKET, { public: false });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      throw new Error(`Failed to create recording bucket: ${bucketErr.message}`);
    }
    ({ error } = await attempt());
  }

  // Same hash already archived (e.g. a retried upload) — reuse the object.
  const alreadyStored = error && /exist|duplicate/i.test(error.message);
  if (error && !alreadyStored) {
    throw new Error(`Failed to upload recording: ${error.message}`);
  }

  const { data: row, error: insertErr } = await serviceDb
    .from("consult_recordings")
    .insert({
      consult_request_id: consultRequestId,
      recorded_by: recordedBy,
      storage_bucket: RECORDING_BUCKET,
      storage_path: path,
      content_sha256: hash,
      byte_size: buffer.byteLength,
      duration_seconds: durationSeconds,
      transcript_status: "pending",
    })
    .select("*")
    .single();

  if (insertErr || !row) {
    throw new Error(`Failed to record consult recording: ${insertErr?.message}`);
  }
  return row as ConsultRecording;
}
