# Document signatures & execution

Instant Attorney splits “signatures” into three paths so clients can finish
simple docs quickly without e-signing instruments that need witnesses or a notary.

## Paths

| Mode | When | Client experience |
|------|------|-------------------|
| **E-sign / sign & send** | Letters, contracts, waivers, most bilateral docs | Typed-name quick sign in the Living File; optional Dropbox Sign when configured |
| **Print formalities** | Wills, POAs, medical directives, TOD deeds, prenups, waivers of service | Badge + steps + labeled roles; download approved `.docx` + separate **print & sign packet** |
| **Court / clerk** | Petitions, decrees, motions | Filing checklist; judge/clerk completes |

Classifier: `lib/execution.ts` (instrument key → title heuristics → wizard type).

## Platform agreements (onboarding)

Typed-name UETA/ESIGN clickwrap remains in onboarding. The API now records:

- agreement / consent **version**
- **SHA-256** of the exact text presented (`lib/agreement-sign.ts`)
- signer **IP** and **user-agent**

Receipt download: `GET /api/agreements/receipt` (`.docx`).

## Matter documents

After attorney **approval**, `DocumentExecutionPanel` appears on each document in
the Living File (`#documents`).

- Quick sign → `POST /api/documents/:id/sign` `{ action: "quick_sign", signatureName }`
- Print packet → `GET /api/documents/:id/execution-packet`
- Dropbox Sign → `{ action: "dropbox_sign" }` when `DROPBOX_SIGN_API_KEY` is set
- Webhook → `POST /api/dropbox-sign/webhook`

Audit rows land in `document_executions` (service-role writes only). Schema:
`supabase/schema-stage32-signatures-execution.sql`.

## Env

```
DROPBOX_SIGN_API_KEY=          # optional; enables counterparty / email e-sign
```

Without the key, in-app quick-sign still works for e-sign-allowed documents.
Formalities docs never offer in-app e-sign.
