/** Compact list row for the Living File matter switcher. */
export interface MatterSwitcherItem {
  id: string;
  title: string;
  next_action: string | null;
  matter_type: string | null;
  updated_at: string;
}

export function matterDisplayTitle(file: {
  title?: string | null;
  matter_subtype?: string | null;
  file_type?: string | null;
}): string {
  if (file.title?.trim()) return file.title.trim();
  if (file.matter_subtype) return file.matter_subtype.replace(/_/g, " ");
  if (file.file_type === "quick_consult") return "Quick consult";
  return "Untitled matter";
}

export function toMatterSwitcherItem(file: {
  id: string;
  title?: string | null;
  matter_subtype?: string | null;
  matter_type?: string | null;
  file_type?: string | null;
  next_action?: string | null;
  updated_at: string;
}): MatterSwitcherItem {
  return {
    id: file.id,
    title: matterDisplayTitle(file),
    next_action: file.next_action ?? null,
    matter_type: file.matter_type ?? null,
    updated_at: file.updated_at,
  };
}

export const LAST_MATTER_STORAGE_KEY = "ia_last_open_matter_id";
