/** Bank UTR / reference numbers: letters, digits and - / only. */
export const COMPLIANCE_UTR_MAX_LENGTH = 40;
const UTR_PATTERN = /^[A-Z0-9/-]+$/;
const LEDGER_META_PREFIX = "[[QMETA:";

export function normalizeComplianceUtr(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function validateComplianceUtr(value: string): string | null {
  const utr = normalizeComplianceUtr(value);
  if (!utr) return "Enter the UTR / reference number.";
  if (utr.length < 6) return "UTR looks too short — check the bank reference.";
  if (utr.length > COMPLIANCE_UTR_MAX_LENGTH) {
    return `UTR can be at most ${COMPLIANCE_UTR_MAX_LENGTH} characters.`;
  }
  if (!UTR_PATTERN.test(utr)) return "Use only letters, numbers, - or /.";
  return null;
}

/** True when the payment mode is cash — cash postings never carry a UTR. */
export function isCashPaymentMode(mode: string | null | undefined): boolean {
  return (mode ?? "").trim().toUpperCase() === "CASH";
}

function withMetaUtr(meta: string, utr: string): string {
  const json = meta.slice(LEDGER_META_PREFIX.length).replace(/\]\]\s*$/, "");
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return `${LEDGER_META_PREFIX}${JSON.stringify({ ...parsed, payment_reference: utr })}]]`;
  } catch {
    return meta;
  }
}

/**
 * Replace only the UTR of a ledger description
 * (`Category | Mode: X | UTR: Y | Notes: Z [[QMETA:{…}]]`), keeping category,
 * mode, notes and the QMETA tag (its `payment_reference` is updated too).
 */
export function withLedgerDescriptionUtr(description: string | null | undefined, utr: string): string {
  const raw = String(description ?? "");
  const metaIdx = raw.indexOf(LEDGER_META_PREFIX);
  const body = (metaIdx < 0 ? raw : raw.slice(0, metaIdx)).trim();
  const meta = metaIdx < 0 ? "" : withMetaUtr(raw.slice(metaIdx).trim(), utr);
  const parts = body
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !/^UTR:/i.test(part));
  if (parts.length === 0) parts.push("ENTRY");
  const modeIdx = parts.findIndex((part) => /^Mode:/i.test(part));
  parts.splice(modeIdx >= 0 ? modeIdx + 1 : 1, 0, `UTR: ${utr}`);
  const line = parts.join(" | ");
  return meta ? `${line} ${meta}` : line;
}

/** Payment request ID (Finance / bank request reference): letters, digits, - / _ only. */
export const COMPLIANCE_REQUEST_ID_MAX_LENGTH = 40;
const REQUEST_ID_PATTERN = /^[A-Z0-9/_-]+$/;
const REQUEST_ID_SEGMENT = /^Request ID:/i;

export function normalizeComplianceRequestId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function validateComplianceRequestId(value: string): string | null {
  const id = normalizeComplianceRequestId(value);
  if (!id) return "Enter the request ID.";
  if (id.length < 3) return "Request ID looks too short.";
  if (id.length > COMPLIANCE_REQUEST_ID_MAX_LENGTH) {
    return `Request ID can be at most ${COMPLIANCE_REQUEST_ID_MAX_LENGTH} characters.`;
  }
  if (!REQUEST_ID_PATTERN.test(id)) return "Use only letters, numbers, -, / or _.";
  return null;
}

/** Request ID stored on a ledger description (`… | Request ID: X | …`). */
export function readLedgerRequestId(description: string | null | undefined): string | null {
  const raw = String(description ?? "");
  const metaIdx = raw.indexOf(LEDGER_META_PREFIX);
  const body = metaIdx < 0 ? raw : raw.slice(0, metaIdx);
  const segment = body
    .split("|")
    .map((part) => part.trim())
    .find((part) => REQUEST_ID_SEGMENT.test(part));
  const value = segment?.replace(REQUEST_ID_SEGMENT, "").trim() ?? "";
  return value || null;
}

/**
 * Replace only the Request ID of a ledger description, placed after UTR (or
 * Mode). Category stays first so ledger category parsing is unaffected.
 */
export function withLedgerDescriptionRequestId(description: string | null | undefined, requestId: string): string {
  const raw = String(description ?? "");
  const metaIdx = raw.indexOf(LEDGER_META_PREFIX);
  const body = (metaIdx < 0 ? raw : raw.slice(0, metaIdx)).trim();
  const meta = metaIdx < 0 ? "" : raw.slice(metaIdx).trim();
  const parts = body
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !REQUEST_ID_SEGMENT.test(part));
  if (parts.length === 0) parts.push("ENTRY");
  const anchor = Math.max(
    parts.findIndex((part) => /^UTR:/i.test(part)),
    parts.findIndex((part) => /^Mode:/i.test(part)),
  );
  parts.splice(anchor >= 0 ? anchor + 1 : 1, 0, `Request ID: ${requestId}`);
  const line = parts.join(" | ");
  return meta ? `${line} ${meta}` : line;
}
