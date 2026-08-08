// Next.js startup instrumentation. `register()` runs once when the server
// process boots (Node runtime only). We use it to install process-level safety
// nets so a single stray background promise rejection can never take the whole
// app down — and, just as important, so we get a log line when one happens.
//
// Why this exists: most route-handler errors are already caught by Next and
// turned into 500 responses. The dangerous case is fire-and-forget background
// work (e.g. attachment analysis, gov-form lookup, draft gap-sync) that escapes
// the request lifecycle. Node's default for an unhandled rejection is to
// terminate the process — on a single-instance deployment that is a full outage
// with no diagnostic trail. Logging and staying alive trades a (rare, already
// guarded) inconsistent-state risk for uptime and observability.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Counted as well as logged so /admin/health can show that the guard fired,
  // rather than the evidence living only in a log nobody is reading.
  const { recordCrashEvent } = await import("./lib/crash-counter");

  process.on("unhandledRejection", (reason) => {
    recordCrashEvent("unhandledRejection", reason);
    console.error(
      "[instrumentation] Unhandled promise rejection — kept server alive:",
      reason
    );
  });

  process.on("uncaughtException", (err) => {
    recordCrashEvent("uncaughtException", err);
    console.error(
      "[instrumentation] Uncaught exception — kept server alive:",
      err
    );
  });
}
