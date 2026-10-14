import { MAX_TRIP_DOC_BYTES } from "@/features/trips/services/tripDocuments.service";

/** User-uploadable Compliance trip files (not place-proof TXT, which the driver app writes). */
export const COMPLIANCE_TRIP_DOC_FORMAT_LABEL = "PDF, JPG, JPEG, PNG or WebP";

export const COMPLIANCE_TRIP_DOC_PICKER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MIME_TO_EXTS: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export function complianceTripDocMaxMb(maxBytes = MAX_TRIP_DOC_BYTES): number {
  return Math.round(maxBytes / (1024 * 1024));
}

export function complianceTripDocFormatHint(maxBytes = MAX_TRIP_DOC_BYTES): string {
  return `${COMPLIANCE_TRIP_DOC_FORMAT_LABEL} • Up to ${complianceTripDocMaxMb(maxBytes)} MB per file. Large scans load in the preview panel.`;
}

export function fileExtension(fileName: string | null | undefined): string {
  const name = (fileName ?? "").trim().toLowerCase().split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1);
}

export function normalizeComplianceTripDocMime(mimeType: string | null | undefined): string {
  const raw = (mimeType ?? "").trim().toLowerCase().split(";")[0].trim();
  if (raw === "image/jpg") return "image/jpeg";
  return raw;
}

export function inferComplianceTripDocMime(input: {
  fileName?: string | null;
  mimeType?: string | null;
}): string | null {
  const pickerMime = normalizeComplianceTripDocMime(input.mimeType);
  const canonicalPicker = pickerMime && MIME_TO_EXTS[pickerMime] ? (pickerMime === "image/jpg" ? "image/jpeg" : pickerMime) : null;
  const fromExt = EXT_TO_MIME[fileExtension(input.fileName)] ?? null;
  return canonicalPicker ?? fromExt;
}

export function isComplianceTripDocPreviewableMime(mimeType: string | null | undefined): boolean {
  const mime = normalizeComplianceTripDocMime(mimeType);
  return mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export function complianceTripDocPreviewKind(
  mimeType: string | null | undefined,
): "pdf" | "image" | "none" {
  const mime = normalizeComplianceTripDocMime(mimeType);
  if (mime.includes("pdf")) return "pdf";
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/gif") {
    return "image";
  }
  return "none";
}

export type ComplianceTripDocValidation =
  | { ok: true; mimeType: string; extension: string }
  | { ok: false; reason: string };

export function validateComplianceTripDocumentFile(input: {
  fileName?: string | null;
  mimeType?: string | null;
  byteLength?: number | null;
  maxBytes?: number;
}): ComplianceTripDocValidation {
  const maxBytes = input.maxBytes ?? MAX_TRIP_DOC_BYTES;
  const byteLength = input.byteLength ?? 0;
  if (!byteLength) {
    return { ok: false, reason: "File is empty." };
  }
  if (byteLength > maxBytes) {
    const mb = (byteLength / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `File is larger than the ${complianceTripDocMaxMb(maxBytes)} MB limit (${mb} MB).`,
    };
  }

  const ext = fileExtension(input.fileName);
  const pickerMime = normalizeComplianceTripDocMime(input.mimeType);
  const canonicalPicker =
    pickerMime && MIME_TO_EXTS[pickerMime] ? (pickerMime === "image/jpg" ? "image/jpeg" : pickerMime) : null;
  const fromExt = EXT_TO_MIME[ext] ?? null;

  if (canonicalPicker && fromExt && canonicalPicker !== fromExt) {
    return {
      ok: false,
      reason: `Unsupported file format. Please upload ${COMPLIANCE_TRIP_DOC_FORMAT_LABEL}.`,
    };
  }

  const mime = canonicalPicker ?? fromExt;
  if (!mime) {
    return {
      ok: false,
      reason: `Unsupported file format. Please upload ${COMPLIANCE_TRIP_DOC_FORMAT_LABEL}.`,
    };
  }

  const allowedExts = MIME_TO_EXTS[mime];
  return { ok: true, mimeType: mime, extension: ext || allowedExts[0] };
}
