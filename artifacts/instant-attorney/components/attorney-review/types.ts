export interface ReviewChange {
  id: string;
  before: string;
  after: string;
  summary: string;
}

export type RevisionSaveState = "idle" | "dirty" | "saving" | "saved" | "error";
