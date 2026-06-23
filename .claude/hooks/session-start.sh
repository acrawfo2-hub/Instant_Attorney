#!/bin/bash
set -euo pipefail

# SessionStart hook — installs dependencies so `npm test` and `npm run typecheck`
# work in Claude Code on the web sessions.
#
# Scope: artifacts/instant-attorney — the deployable Next.js app where the unit
# tests (`npm test`) and the typecheck (`npm run typecheck`) live. It is
# deliberately excluded from the root pnpm workspace, so it is installed on its
# own here.
#
# Why pnpm and not npm: this remote environment's package mirror
# (package-firewall.replit.local) intermittently returns ENOTFOUND for tarballs,
# which makes `npm install` / `npm ci` crash with "Exit handler never called!".
# pnpm's fetcher retries reliably and installs cleanly here. Flags:
#   --ignore-workspace  keep this standalone npm project isolated from the root
#   --no-lockfile       don't drop a stray pnpm-lock.yaml into an npm project
# node_modules is gitignored, so nothing produced here is ever committed.

# Only run in the remote (web) environment; local machines manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
APP_DIR="$ROOT/artifacts/instant-attorney"

# Send progress to stderr so it stays out of the session context on stdout.
echo "[session-start] Installing instant-attorney dependencies with pnpm..." >&2
( cd "$APP_DIR" && pnpm install --ignore-workspace --no-lockfile )
echo "[session-start] Dependencies installed." >&2
