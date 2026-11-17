/** Shared contract for every Pulse bulk operation. Adapters supply rules; they do not own this lifecycle. */

export type BulkOperationKind = "import" | "update" | "field_update";

export type BulkAction = "upload" | "review" | "execute" | "correct";

export type BulkField = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
  example: string;
  format: string;
  /** May be edited in the preview and in a later correction. */
  editable: boolean;
};

export type BulkTemplate = {
  id: string;
  version: string;
  title: string;
  operation: BulkOperationKind;
  matchField: string;
  fields: BulkField[];
};

export type BulkPermissions = Record<BulkAction, string>;

export type ColumnMapping = Record<string, string | null>;

export type BulkIssue = { field?: string; message: string };

export type BulkRowStatus = "ready" | "invalid" | "unchanged" | "duplicate" | "blocked";

export type BulkPreviewRow = {
  rowIndex: number;
  matchKey: string;
  recordId: string | null;
  status: BulkRowStatus;
  message: string;
  before: Record<string, string>;
  proposed: Record<string, string>;
  preserved: Record<string, string>;
  included: boolean;
};

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

export type BatchStatus = "confirmed" | "executing" | "completed" | "partial" | "failed";

export type DuplicateDecision = "create" | "replay" | "in_progress" | "review_existing" | "resume";

export type ExecutionRowOutcome = "applied" | "failed" | "stale" | "skipped" | "already_applied";
