import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import { readStoredElrSnapshot } from "@/features/trips/services/elrSnapshot.util";

export const ORG_LR_DUPLICATE_MESSAGE =
  "This LR number already exists in this workspace. Duplicate LR numbers are not allowed.";

export const ORG_LR_CHECK_UNAVAILABLE_MESSAGE =
  "Couldn't check whether this LR number is already used. Check your connection and try again.";

/** Compare LR numbers the same way in the form and in stored documents. */
export function normalizeOrgLrNumber(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Pulls the operator-facing LR number from vault, E-LR JSON, or plain text. */
export function lrNumberFromStoredDocumentNumber(
  raw: string | null | undefined,
): string {
  const elr = readStoredElrSnapshot(raw);
  if (elr?.lrNumber) return normalizeOrgLrNumber(elr.lrNumber);
  return normalizeOrgLrNumber(parseLrFieldValues(raw).lrNumber);
}
