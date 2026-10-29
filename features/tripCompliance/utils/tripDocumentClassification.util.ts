/**
 * Single source of truth for what a `trip_documents` row actually holds.
 *
 * A row reaches `trip_documents` through several intake paths (see the Compliance
 * intake matrix): an uploaded Storage object, typed-in details saved as a
 * `…/fields.json` marker with the values in `document_number`, a vehicle-vault
 * reference (`ref:vehicle-document:…` / `source_entity_document_id`), or an
 * external URL. Consumers (rows, checklist, stage, preview, counts) must decide
 * presence and preview behaviour from this classification — never by
 * re-inspecting `storage_path` themselves.
 *
 * Classification is about content only. Review status (pending / verified /
 * rejected) is orthogonal and stays with the caller.
 *
 * No rule here depends on `document_type`: the details marker is recognised by
 * its storage shape, not by being an E-way bill or an LR.
 */
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";

export type TripDocumentKind = "file" | "details" | "reference" | "url" | "empty";

export type TripDocumentClassification = {
  kind: TripDocumentKind;
  /** Openable through a signed URL / file preview (file, url, reference). */
  hasBinary: boolean;
  /** `document_number` carries real typed values (also true for file + details). */
  hasDetails: boolean;
  /** The document exists for presence purposes (checklist, stage, counts). */
  present: boolean;
};

export type ClassifiableTripDocument = Pick<ComplianceDocumentRow, "storage_path" | "file_name"> &
  Partial<Pick<ComplianceDocumentRow, "document_number" | "source_entity_document_id">>;

/** Synthetic marker written by `use_vehicle_document_for_trip()`; not a bucket object. */
const REFERENCE_PATH_PREFIX = "ref:vehicle-document:";
const DETAILS_MARKER_BASENAME = "fields.json";
const DETAILS_MARKER_FILE_SUFFIX = "-fields.json";

function normalizedPath(storagePath: string | null | undefined): string {
  return String(storagePath ?? "").trim().split("?")[0] ?? "";
}

function basename(value: string): string {
  const parts = value.split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/** `…/fields.json` or a `*-fields.json` file name — typed values, no Storage object. */
export function isTypedDetailsMarker(doc: Pick<ComplianceDocumentRow, "storage_path" | "file_name">): boolean {
  const path = normalizedPath(doc.storage_path);
  const fileName = String(doc.file_name ?? "").trim().toLowerCase();
  return (
    basename(path) === DETAILS_MARKER_BASENAME ||
    basename(path).endsWith(DETAILS_MARKER_FILE_SUFFIX) ||
    fileName.endsWith(DETAILS_MARKER_FILE_SUFFIX)
  );
}

function hasNonEmptyLeaf(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.some(hasNonEmptyLeaf);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasNonEmptyLeaf);
  return false;
}

/**
 * True when `document_number` holds real values. Accepts both stored shapes:
 * a JSON object/array (E-way entries, LR `{lrNumber,date,invoice}`) or a plain
 * string (LR number only). `{}`, `[]`, `null`, blank strings are empty.
 */
export function hasTypedDetails(documentNumber: string | null | undefined): boolean {
  const text = String(documentNumber ?? "").trim();
  if (!text) return false;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return hasNonEmptyLeaf(JSON.parse(text));
    } catch {
      return true; // malformed JSON is still user-entered text
    }
  }
  return text !== "null";
}

/** A usable bucket object key: non-empty, not a folder, no traversal. */
function isValidObjectPath(path: string): boolean {
  if (!path) return false;
  if (path.endsWith("/")) return false;
  if (path.split("/").some((segment) => segment === "..")) return false;
  return true;
}

export function classifyTripDocument(doc: ClassifiableTripDocument | null | undefined): TripDocumentClassification {
  if (!doc) return { kind: "empty", hasBinary: false, hasDetails: false, present: false };
  const path = normalizedPath(doc.storage_path);
  const hasDetails = hasTypedDetails(doc.document_number);
  const result = (kind: TripDocumentKind): TripDocumentClassification => ({
    kind,
    hasBinary: kind === "file" || kind === "url" || kind === "reference",
    hasDetails,
    present: kind !== "empty",
  });

  if (path.startsWith(REFERENCE_PATH_PREFIX)) return result("reference");
  if (/^https?:\/\//i.test(path)) return result("url");
  if (isTypedDetailsMarker(doc)) return result(hasDetails ? "details" : "empty");
  // A real object path after reject → replace is the current file. A leftover
  // `source_entity_document_id` from vault reuse must not hide it.
  if (isValidObjectPath(path)) return result("file");
  if (doc.source_entity_document_id) return result("reference");
  return result(hasDetails ? "details" : "empty");
}

export type TypedDetailLine = { label: string; value: string };

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : key;
}

function primitiveLines(record: Record<string, unknown>, suffix: string): TypedDetailLine[] {
  return Object.entries(record)
    .filter(([, value]) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)))
    .map(([key, value]) => ({ label: `${humanizeKey(key)}${suffix}`, value: String(value).trim() }));
}

/**
 * Label/value lines for typed-in details, by stored shape only (no document
 * type): a JSON object's non-empty scalar fields; when it carries an `entries`
 * array (multi-entry form), one numbered block per entry instead; a plain
 * string becomes a single "Value" line.
 */
export function readTypedDetails(documentNumber: string | null | undefined): TypedDetailLine[] {
  const text = String(documentNumber ?? "").trim();
  if (!hasTypedDetails(text)) return [];
  if (!(text.startsWith("{") || text.startsWith("["))) return [{ label: "Value", value: text }];
  try {
    const parsed: unknown = JSON.parse(text);
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
        ? ((parsed as { entries: unknown[] }).entries)
        : null;
    if (entries) {
      const records = entries.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      );
      return records.flatMap((entry, index) => primitiveLines(entry, records.length > 1 ? ` ${index + 1}` : ""));
    }
    if (parsed && typeof parsed === "object") return primitiveLines(parsed as Record<string, unknown>, "");
    return [{ label: "Value", value: text }];
  } catch {
    return [{ label: "Value", value: text }];
  }
}
