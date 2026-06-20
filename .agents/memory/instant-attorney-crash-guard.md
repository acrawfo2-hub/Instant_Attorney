---
name: Instant-Attorney global crash guard
description: Why instrumentation.ts installs unhandledRejection/uncaughtException handlers and must not be removed.
---

`artifacts/instant-attorney/instrumentation.ts` installs process-level
`unhandledRejection` + `uncaughtException` handlers (via Next's `register()`,
nodejs runtime only) that LOG and keep the process alive. Do NOT remove it or
make it `process.exit()`.

**Why:** the app runs as a single production instance on Replit. Node's default
on an unhandled promise rejection is to terminate the process = full outage with
no diagnostic trail. The app has several fire-and-forget background AI tasks
(attachment analysis, gov-form lookup, draft gap-sync). They each have a
`.catch()` today, but a future one that forgets would silently take the whole
site down. Logging + staying alive trades a rare inconsistent-state risk for
uptime and (critically) a log line next time.

**How to apply:** keep background tasks individually `.catch()`-guarded anyway;
this is only the last-resort net. If you ever see a real outage, grep production
logs for `[instrumentation]` first — that's where an escaped rejection surfaces.
