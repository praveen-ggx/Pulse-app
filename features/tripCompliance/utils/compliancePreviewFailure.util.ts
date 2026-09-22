import { isComplianceTripDocPreviewableMime } from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";

export type CompliancePreviewFailureKind =
  | "missing"
  | "permission_denied"
  | "signed_url_failed"
  | "unsupported"
  | "unreadable"
  | "temporary"
  | "unknown";

export function classifyPreviewFailure(input: {
  hasStoragePath: boolean;
  error?: unknown;
  url?: string | null;
  mime?: string | null;
}): { kind: CompliancePreviewFailureKind; message: string } {
  if (!input.hasStoragePath) {
    return {
      kind: "missing",
      message: "This document has not been uploaded yet.",
    };
  }

  const raw = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  const lower = raw.toLowerCase();

  if (/permission|not authorized|rls|401|403|jwt|row-level/.test(lower)) {
    return {
      kind: "permission_denied",
      message: "You don't have permission to preview this file.",
    };
  }
  if (/expired|sign/.test(lower) && /url|token|link/.test(lower)) {
    return {
      kind: "signed_url_failed",
      message: "The preview link expired or could not be signed. Try again.",
    };
  }

  const mime = (input.mime ?? "").toLowerCase();
  if (input.url && mime && !isComplianceTripDocPreviewableMime(mime)) {
    return {
      kind: "unsupported",
      message: "This file type can't be previewed here. Download it from Trip documents if you need to inspect it.",
    };
  }

  if (!input.url && !input.error) {
    return {
      kind: "signed_url_failed",
      message:
        "Couldn't create a preview link for this file. The file may be missing from storage — try Replace to upload it again.",
    };
  }

  if (/network|timeout|temporar|unavailable|500|502|503/.test(lower)) {
    return {
      kind: "temporary",
      message: raw || "Preview failed because of a temporary error. Try again.",
    };
  }

  if (raw) {
    return {
      kind: "unknown",
      message: `Preview failed. ${raw}`,
    };
  }

  return {
    kind: "unknown",
    message: "Preview failed. The file may be unreadable, or this may be a temporary error.",
  };
}

export function unreadablePreviewFailure(): { kind: CompliancePreviewFailureKind; message: string } {
  return {
    kind: "unreadable",
    message: "The file couldn't be displayed. It may be corrupted or in an unsupported format.",
  };
}
