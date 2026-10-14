/**
 * Presentation-layer types for the trip document vault.
 * Defined here (not in TripDetailFinanceView) so the hook layer can import
 * them without creating an inverted dependency on a UI component.
 */
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";

export type DocCategory =
  | "vehicle"
  | "trip"
  | "driver"
  | "driver_identity"
  | "lr"
  | "eway"
  | "invoice"
  | "trip_details";

export type TripDetailsSlot = "lr" | "invoice" | "memo" | "other" | "bank_docs";

export const TRIP_DETAILS_SLOTS: readonly {
  id: TripDetailsSlot;
  label: string;
}[] = [
  { id: "lr", label: "LR Document" },
  { id: "invoice", label: "Invoice" },
  { id: "memo", label: "Memo" },
  { id: "other", label: "Other Documents" },
  { id: "bank_docs", label: "Bank Docs" },
];

export const TRIP_DETAILS_TYPE_HINT = "LR · INVOICE · MEMO · OTHER · BANK";

export interface TripDocFile {
  id: string;
  label: string;
  type: string;
  storagePath: string;
  documentId?: string;
  fileName?: string;
  /** Which Trip Details field this file belongs to. */
  slotType?: TripDetailsSlot;
  /** Invoice number typed for this file. */
  invoiceNumber?: string;
  /** Bucket used to resolve signed URLs. Default: trip documents. */
  docSource?: "trip" | "vehicle" | "compliance";
}

export interface TripDocItem {
  id: string;
  label: string;
  type: string;
  status: "Verified" | "Uploaded" | "Pending";
  /** When set, preview modal can fetch and show the file (e.g. Driver POD from trip_documents). */
  storagePath?: string;
  /** Optional backend document id for future use (e.g. multiple PODs). */
  documentId?: string;
  /** Which storage bucket to resolve signed URLs from. Default: 'trip' (trip-documents bucket). */
  docSource?: "trip" | "vehicle" | "compliance";
  /** Optional grouping metadata for downstream preview behavior. */
  category?: DocCategory;
  /** Extra files nested in this slot (one card, many uploads). */
  files?: TripDocFile[];
  /** Printed LR / e-way bill number when the user entered one or OCR extracted it. */
  documentNumber?: string | null;
  /** Printed LR date from OCR when available. */
  documentDate?: string | null;
  /** Printed invoice number typed with the LR. */
  invoiceNumber?: string | null;
  /** Upload timestamp for the latest file in this slot (ISO). */
  uploadedAt?: string | null;
}

/** Matches trip-documents + vehicle-documents bucket limits (100 MB). */
export const VAULT_DOC_MAX_BYTES = 100 * 1024 * 1024;
export const VAULT_DOC_MAX_MB = VAULT_DOC_MAX_BYTES / (1024 * 1024);
export const VAULT_DOC_TYPES_LABEL = "PDF, JPEG, PNG, WebP";
export const VAULT_DOC_LIMIT_HINT = `${VAULT_DOC_TYPES_LABEL} · ${VAULT_DOC_MAX_MB} MB max per file`;
export const VAULT_DOC_PICKER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const VAULT_OK_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const VAULT_OK_EXT = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

export function isSupportedVaultDocument(file: {
  name?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? "").toLowerCase().trim();
  if (mime) return VAULT_OK_MIME.has(mime);
  const fileName = file.fileName ?? file.name ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ext) return true;
  return VAULT_OK_EXT.has(ext);
}

/** Returns an error string when any picked file is too large or unsupported. */
export function vaultPickerRejectionMessage(
  assets: {
    name?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }[],
): string | null {
  if (assets.length === 0) return null;
  const oversized = assets.filter(
    (asset) => typeof asset.size === "number" && asset.size > VAULT_DOC_MAX_BYTES,
  );
  if (oversized.length > 0) {
    const names = oversized
      .map((asset) => asset.fileName?.trim() || asset.name?.trim() || "A file")
      .join(", ");
    return `${names} ${oversized.length === 1 ? "exceeds" : "exceed"} ${VAULT_DOC_MAX_MB} MB. Each file must be ${VAULT_DOC_MAX_MB} MB or smaller.`;
  }
  const unsupported = assets.filter((asset) => !isSupportedVaultDocument(asset));
  if (unsupported.length > 0) {
    const names = unsupported
      .map((asset) => asset.fileName?.trim() || asset.name?.trim() || "A file")
      .join(", ");
    return `${names} ${unsupported.length === 1 ? "is" : "are"} not supported. Use ${VAULT_DOC_TYPES_LABEL}.`;
  }
  return null;
}

export function isEwayBillVaultDoc(
  doc: Pick<TripDocItem, "category" | "id"> | null | undefined,
): boolean {
  return doc?.id === "eway_bill" || doc?.category === "eway";
}

export function isLrVaultDoc(
  doc: Pick<TripDocItem, "category" | "id"> | null | undefined,
): boolean {
  return doc?.id === "lr" || doc?.category === "lr";
}

export function isTripDetailsVaultDoc(
  doc: Pick<TripDocItem, "category" | "id"> | null | undefined,
): boolean {
  return doc?.id === "trip-details" || doc?.category === "trip_details";
}

export function isDriverPodVaultDoc(
  doc: Pick<TripDocItem, "id" | "category"> | null | undefined,
): boolean {
  if (!doc) return false;
  const id = (doc.id ?? "").toLowerCase();
  return id === "pod" || id.startsWith("pod-") || doc.category === "driver";
}

/**
 * Vault mutate gate. Authorization only — Driver POD may be added or
 * supplemented before or after trip completion (R2). `tripCompleted` is
 * accepted so existing call sites keep compiling; it is not a lock.
 */
export function canMutateTripVaultDoc(options: {
  doc: Pick<TripDocItem, "id" | "category"> | null | undefined;
  canUploadTripDocs: boolean;
  tripCompleted: boolean;
}): boolean {
  if (!options.canUploadTripDocs || !options.doc) return false;
  return true;
}

export function canAddMoreTripDocs(
  doc: Pick<TripDocItem, "category" | "docSource" | "id"> | null | undefined,
): boolean {
  if (!doc) return false;
  if (
    doc.category === "vehicle" ||
    doc.docSource === "vehicle" ||
    doc.id === "vehicle-documents"
  ) {
    return true;
  }
  if (
    doc.category === "driver_identity" ||
    doc.docSource === "compliance" ||
    doc.id === "driver-documents"
  ) {
    return true;
  }
  if (doc.category === "trip_details" || doc.id === "trip-details") {
    return true;
  }
  return (
    doc.category === "lr" ||
    doc.category === "trip" ||
    doc.category === "driver" ||
    doc.category === "invoice" ||
    doc.id === "invoice"
  );
}

export function isDriverIdentityVaultDoc(
  doc: Pick<TripDocItem, "id" | "category"> | null | undefined,
): boolean {
  if (!doc) return false;
  return doc.id === "driver-documents" || doc.category === "driver_identity";
}

/** True when Preview can open a file (storage path, file list, or uploaded status). */
export function vaultDocHasPreviewableFile(
  doc:
    | Pick<TripDocItem, "status" | "storagePath" | "files">
    | null
    | undefined,
): boolean {
  if (!doc) return false;
  if ((doc.storagePath ?? "").trim()) return true;
  if ((doc.files?.length ?? 0) > 0) return true;
  return doc.status !== "Pending";
}

function pathLooksLikePdf(value?: string | null): boolean {
  const path = (value ?? "").toLowerCase().split("?")[0];
  return path.endsWith(".pdf");
}

/** True when vault metadata, mime, filename, or storage path identifies a PDF. */
export function isPdfTripDoc(doc: {
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
} | null | undefined): boolean {
  if (!doc) return false;
  if ((doc.type ?? "").toUpperCase() === "PDF") return true;
  if ((doc.mimeType ?? "").toLowerCase().includes("pdf")) return true;
  if (pathLooksLikePdf(doc.fileName)) return true;
  return pathLooksLikePdf(doc.storagePath);
}

const VAULT_DATE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function padDay(value: string): string {
  return value.padStart(2, "0");
}

function formatDayMonthYear(day: number, monthIndex: number, year: number): string | null {
  if (day < 1 || day > 31 || monthIndex < 1 || monthIndex > 12 || !Number.isFinite(year)) {
    return null;
  }
  return `${padDay(String(day))}-${VAULT_DATE_MONTHS[monthIndex - 1]}-${String(year).slice(-2)}`;
}

/** Card-face date, e.g. 04-Sep-26. Accepts ISO, DD-MM-YYYY, or already-formatted values. */
export function formatVaultDocDate(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{2}-[A-Za-z]{3}-\d{2}$/.test(raw)) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return formatDayMonthYear(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const monthIndex = Number(dmy[2]);
    const yearPart = dmy[3];
    const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
    return formatDayMonthYear(day, monthIndex, year);
  }

  return null;
}

/** LR number shown on the vault card, e.g. `LR No. AI3583`. */
export function formatLrVaultNumberLabel(number?: string | null): string | null {
  const trimmed = parseLrFieldValues(number).lrNumber;
  if (!trimmed) return null;
  return /^lr\s*no\.?/i.test(trimmed) ? trimmed : `LR No. ${trimmed}`;
}

/** Invoice number stored on one invoice row: plain text, or the invoice field of an LR payload. */
export function readStoredInvoiceNumber(raw?: string | null): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const parsed = parseLrFieldValues(text);
  if (text.startsWith("{")) return parsed.invoice;
  return parsed.invoice || parsed.lrNumber;
}

/** Every invoice number for the card, oldest upload first: `123456/897654/345678`. */
export function joinInvoiceNumbers(values: Array<string | null | undefined>): string {
  return values
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0)
    .join("/");
}

/** Invoice number shown on the Invoice bar, e.g. `Invoice No. 123456/897654`. */
export function formatInvoiceVaultNumberLabel(number?: string | null): string | null {
  const trimmed = (number ?? "").trim();
  if (!trimmed) return null;
  const value = trimmed.includes("/")
    ? joinInvoiceNumbers(trimmed.split("/"))
    : readStoredInvoiceNumber(trimmed);
  if (!value) return null;
  return /^invoice\s*no\.?/i.test(value) ? value : `Invoice No. ${value}`;
}
export function formatLrVaultDateLabel(value?: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^lr\s*date\s*/i, "").trim();
  const formatted = formatVaultDocDate(withoutPrefix || raw);
  if (!formatted) return null;
  return `LR date ${formatted}`;
}

/** Convert a vault date (ISO, DD-MM-YYYY, or 04-Sep-26) to `YYYY-MM-DD` for date pickers. */
export function vaultDocDateToIso(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const pretty = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  if (pretty) {
    const monthIndex = VAULT_DATE_MONTHS.findIndex(
      (month) => month.toLowerCase() === pretty[2].toLowerCase(),
    );
    if (monthIndex < 0) return null;
    const year = 2000 + Number(pretty[3]);
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${pretty[1]}`;
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!dmy) return null;
  const day = Number(dmy[1]);
  const monthIndex = Number(dmy[2]);
  const yearPart = dmy[3];
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  if (day < 1 || day > 31 || monthIndex < 1 || monthIndex > 12 || !Number.isFinite(year)) {
    return null;
  }
  return `${year}-${String(monthIndex).padStart(2, "0")}-${padDay(String(day))}`;
}
