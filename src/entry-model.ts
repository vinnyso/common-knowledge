export type EntryStatus = "active" | "superseded" | "retired";

export type EntryMetadata = Record<string, unknown> & {
  id: string;
  status: EntryStatus;
  title: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  supersedes?: string;
};

export interface ParsedEntry {
  readonly metadata: EntryMetadata;
  readonly body: string;
}

export interface LoadedEntry extends ParsedEntry {
  readonly path: string;
  readonly source: string;
}

export class EntryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryCommandError";
  }
}
