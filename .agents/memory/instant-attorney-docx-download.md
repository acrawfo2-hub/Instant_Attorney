---
name: Instant-Attorney DOCX download
description: Why doc downloads crash on some titles and why literal ** leaks into .docx
---

# DOCX download: header + Markdown pitfalls

The download/generate routes build a Word file from `doc.draft_text` via
`generateDocxFromText` and set a `Content-Disposition` header.

## Content-Disposition must be Latin-1 (ByteString)
Document titles contain an em-dash (`—`, U+2014) — e.g. "Draft Contract — 6/16/2026".
Putting a non-ASCII title straight into `Content-Disposition` throws a ByteString /
"Cannot convert ... to ByteString" error and 502s the download.
**Rule:** always build the header with `docxContentDisposition(title)` (in
`lib/doc-generator.ts`). It emits an ASCII-sanitized `filename="..."` (non-ASCII dropped,
path-reserved `/ \ : * ? < > |` → hyphen so dates like 6/16/2026 don't become path
segments) plus an RFC5987 `filename*=UTF-8''...` for modern browsers. Never hand-build
this header anywhere else.

## Literal ** leaking into the .docx
The drafting models emit lightweight Markdown (`**bold**`, `*italic*`, `#`, `[[placeholder]]`).
Two spots in the `generateDocxFromText` parser used to leak raw `**`:
- `inlineRuns` split on `[[placeholder]]` BEFORE parsing emphasis, so `**[[X]]**` was torn
  into `... **` + `**.` (orphan markers). Fix: strip emphasis that wraps a placeholder
  first, and strip any residual `**` from token text (a stray `**` is always a broken bold
  marker in these drafts, never literal).
- The section-heading branch rendered the raw `unwrapped` line, so a heading like
  `**STATE OF TEXAS** §` (internal, not whole-line, emphasis) leaked `**`. Fix: render
  heading text via `stripInlineMarkers()`.
**Why:** underscores are deliberately NOT treated as emphasis (signature lines like
`______`), so the safety strip targets `**` only — don't broaden it to single `*`/`_`.
**How to verify:** unzip the .docx and count `**` in concatenated `<w:t>` — must be 0.
