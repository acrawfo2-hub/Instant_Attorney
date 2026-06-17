---
name: Background process reaping in bash tool
description: Long-running processes spawned from the bash tool get SIGKILLed; use a managed workflow instead.
---

Processes started from the agent bash tool do NOT reliably survive once the tool
call returns — the environment SIGKILLs them within tens of seconds to a couple
minutes. `setsid`, `nohup`, `disown`, and redirecting stdio do NOT save them.

**Symptoms:** a detached `node`/`tsx` script writes progress (heartbeat file, partial
output) then abruptly stops with NO error in its log — no thrown exception, no
`uncaughtException`/`unhandledRejection`, no stream `error`. That silent stop = an
untrappable SIGKILL from the sandbox, not a bug in the script. Death timing is
variable (e.g. ~33s one run, ~45s the next), which distinguishes it from a
deterministic in-code crash.

**Why:** only Replit-managed workflows are kept alive across tool calls. Ad-hoc bash
background jobs are tied to the tool session and reaped.

**How to apply:** to run a long (>~120s, beyond one bash timeout) one-shot script —
e.g. an AI generation that takes minutes — register it as a temporary workflow via
`configureWorkflow({name, command, outputType:"console", autoStart:true})`, have the
script persist its result (DB row and/or a `/tmp` JSON file), poll for the result
file, then `removeWorkflow`. Do not try to keep a bash background job alive.
