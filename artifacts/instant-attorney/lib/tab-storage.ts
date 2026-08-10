// Thin localStorage wrapper for remembering which tab a client last visited per
// case file. Kept in its own module so it can be unit-tested without a browser.

export type TabId = "documents" | "case-details" | "facts" | "strength" | "help";

export const VALID_TAB_IDS = new Set<string>([
  "documents",
  "case-details",
  "facts",
  "strength",
  "help",
]);

export function tabLsKey(caseFileId: string): string {
  return `lf-tab:${caseFileId}`;
}

export function readStoredTab(caseFileId: string): TabId | null {
  try {
    const v = localStorage.getItem(tabLsKey(caseFileId));
    return v && VALID_TAB_IDS.has(v) ? (v as TabId) : null;
  } catch {
    return null;
  }
}

export function writeStoredTab(caseFileId: string, tab: TabId): void {
  try {
    localStorage.setItem(tabLsKey(caseFileId), tab);
  } catch {
    /* quota / private browsing — ignore */
  }
}
