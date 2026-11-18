import type {
  BatchStatus,
  BulkField,
  BulkIssue,
  BulkPermissions,
  BulkPreviewRow,
  BulkTemplate,
  ColumnMapping,
  DuplicateDecision,
  ExecutionRowOutcome,
  ParsedSheet,
} from "@/features/bulkOperations/utils/bulkOperation.model";

export const BULK_FILE_MAX_BYTES = 1024 * 1024;

export function bulkFileExceedsLimit(byteLength: number): boolean {
  return byteLength > BULK_FILE_MAX_BYTES;
}

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Header row plus data. A leading `#` comment line is ignored so templates can carry a version. */
export function parseBulkCsv(csvText: string): ParsedSheet {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

export function suggestMapping(headers: string[], fields: BulkField[]): ColumnMapping {
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const field of fields) {
    const names = new Set([field.label, field.key, ...field.aliases].map(normalizeHeader));
    const index = headers.findIndex((header, position) => !used.has(position) && names.has(normalizeHeader(header)));
    if (index >= 0) {
      used.add(index);
      mapping[field.key] = headers[index];
    } else {
      mapping[field.key] = null;
    }
  }
  return mapping;
}

export function unmappedHeaders(headers: string[], mapping: ColumnMapping): string[] {
  const used = new Set(Object.values(mapping).filter((value): value is string => Boolean(value)));
  return headers.filter((header) => !used.has(header));
}

export function mappingIssues(template: BulkTemplate, mapping: ColumnMapping): BulkIssue[] {
  return template.fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => ({ field: field.key, message: `Map a column to ${field.label}.` }));
}

export function cellsForRow(headers: string[], cells: string[], mapping: ColumnMapping, fields: BulkField[]): Record<string, string> {
  const indexOf = new Map(headers.map((header, index) => [header, index]));
  const values: Record<string, string> = {};
  for (const field of fields) {
    const header = mapping[field.key];
    const index = header ? indexOf.get(header) : undefined;
    values[field.key] = index == null ? "" : (cells[index] ?? "").trim();
  }
  return values;
}

export function templateCsv(template: BulkTemplate): string {
  const header = template.fields.map((field) => field.label).join(",");
  const example = template.fields.map((field) => field.example).join(",");
  const notes = template.fields.map((field) => `${field.label}: ${field.format}${field.required ? " (required)" : ""}`).join(" | ");
  return [`# ${template.id} ${template.version}`, `# ${notes}`, header, example].join("\n");
}

export function canPerformBulkAction(
  action: keyof BulkPermissions,
  permissions: BulkPermissions,
  granted: ReadonlySet<string>,
): boolean {
  return granted.has(permissions[action]);
}

/**
 * Client hint only. Execution ownership, resume and replay are decided in the
 * database. A live batch is never stolen after a timeout.
 */
export function decideDuplicateBatch(status: BatchStatus | null): DuplicateDecision {
  if (!status) return "create";
  if (status === "completed") return "replay";
  if (status === "partial" || status === "failed") return "review_existing";
  return "in_progress";
}

export function summarizeOutcomes(outcomes: ExecutionRowOutcome[]): BatchStatus {
  const applied = outcomes.filter((outcome) => outcome === "applied" || outcome === "already_applied").length;
  const failed = outcomes.filter((outcome) => outcome === "failed" || outcome === "stale").length;
  if (failed === 0) return "completed";
  if (applied === 0) return "failed";
  return "partial";
}

/** The patch that is allowed to be written. Preserved keys are dropped even if a file column tried to set them. */
export function buildWritablePatch(
  selected: readonly string[],
  preserved: readonly string[],
  before: Record<string, string>,
  proposed: Record<string, string>,
): Record<string, string> {
  const blocked = new Set(preserved);
  const patch: Record<string, string> = {};
  for (const key of selected) {
    if (blocked.has(key)) continue;
    const next = (proposed[key] ?? "").trim();
    const current = (before[key] ?? "").trim();
    if (next && next !== current) patch[key] = next;
  }
  return patch;
}

export function staleFields(
  before: Record<string, string>,
  live: Record<string, string>,
  selected: readonly string[],
): string[] {
  return selected.filter((key) => (before[key] ?? "").trim() !== (live[key] ?? "").trim());
}

export function includedReadyCount(rows: BulkPreviewRow[]): number {
  return rows.filter((row) => row.status === "ready" && row.included).length;
}

/** Stable idempotency fingerprint of the file, mapping and selected fields. */
export function bulkFingerprint(parts: readonly string[]): string {
  const text = parts.join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}-${text.length}`;
}
