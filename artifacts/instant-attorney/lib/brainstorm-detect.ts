/**
 * Pure helper — no server imports, safe to use in "use client" components.
 *
 * Returns true when text contains a complete ---LIVING FILE--- or
 * ---LEGAL STRATEGY--- block that parseAndUpdateFile would act on.
 * Kept separate from file-parser.ts because that module has a transitive
 * server-only import chain (gov-form-lookup → usage-tracker → supabase/server
 * → next/headers) that breaks the client bundle.
 */
export function hasApplicableUpdate(text: string): boolean {
  return (
    /---LIVING FILE---([\s\S]*?)---END FILE---/.test(text) ||
    /---LEGAL STRATEGY---([\s\S]*?)---END STRATEGY---/.test(text)
  );
}
