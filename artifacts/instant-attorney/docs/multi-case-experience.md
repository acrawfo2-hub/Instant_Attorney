# Multi-case experience and context boundaries

The product hierarchy is **account → cases → case file** for clients and
**clients → matters → matter file** for attorneys. The cover sheet and its nine
destinations always describe exactly one file.

## Navigation contract

- `/dashboard` is the portfolio when a client has zero or multiple open cases.
- A client with one open case still lands directly on its cover sheet.
- The case-title menu is always interactive, even with one case, so **Start a
  new case** and **View all cases** remain discoverable.
- Chat repeats that same case boundary in a compact composer picker. Choosing a
  case continues its conversation; **Open 9-part case overview** returns to the
  Living File cover sheet and its nine destinations. Starting a case from chat
  goes through `/dashboard/new` rather than bypassing the explanation of file
  isolation.
- `/dashboard/new` explains the file boundary before handing a broad practice
  area to bare `/chat`. Bare chat remains the canonical new-matter route;
  `?caseFileId=` remains the canonical resume route.
- The attorney file header lists the selected client's sibling matters and
  links back to the person-level client record.

## Shared client details, isolated legal files

The orchestrator may see a deliberately narrow, provenance-labelled selection
of confirmed stable details from the same client's other files. The current
allowlist covers identity/contact details such as address, date of birth, phone,
email, legal name, and marital status. It excludes estimates, hypotheticals,
money, allegations, parties, incidents, deadlines, documents, and strategy.

Seeing a candidate does **not** add it to the current file. The assistant must:

1. say that it already has the detail from another case;
2. ask whether the detail is still current and relevant;
3. obtain the client's normal confirmation before `record_fact` writes it; and
4. preserve the source case in prompt context so it never implies the cases are
   legally connected.

This is intentionally a read-time orchestration feature rather than a shared
database fact store. Each Living File remains independently complete, auditable,
and safe to export. A future account-level facts table should replace this only
if the product needs client-managed canonical identity data, field-level
provenance, and explicit propagation/revocation workflows.
