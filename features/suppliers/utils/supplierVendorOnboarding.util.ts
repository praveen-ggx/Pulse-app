import type {
  SupplierKycDocType,
  SupplierKycDocument,
  SupplierVendorStatus,
} from "@/features/suppliers/types/supplierManagement.types";

// ── Vault sections ───────────────────────────────────────────────────────────

export type VendorVaultSectionId =
  | "pan"
  | "aadhaar"
  | "bank"
  | "registration"
  | "physical"
  | "signed"
  | "tds"
  | "other";

export type VendorVaultSection = {
  id: VendorVaultSectionId;
  title: string;
  /** single = one file per doc type (replace); multi = many files (append). */
  kind: "single" | "multi";
  docTypes: readonly SupplierKycDocType[];
  /** Multi sections that need a user-entered name per file. */
  requiresName?: boolean;
  /** Image-only hint for photo sections. */
  photosOnly?: boolean;
};

export const VENDOR_VAULT_SECTIONS: readonly VendorVaultSection[] = [
  { id: "pan", title: "PAN", kind: "single", docTypes: ["pan"] },
  { id: "aadhaar", title: "Aadhaar", kind: "single", docTypes: ["aadhaar_front", "aadhaar_back"] },
  {
    id: "bank",
    title: "Bank account",
    kind: "single",
    docTypes: ["cancelled_cheque", "bank_statement", "bank_proof_other"],
  },
  {
    id: "registration",
    title: "GST / Udyam / MSME / Gumasta",
    kind: "single",
    docTypes: ["gstin", "udyam", "msme", "gumasta"],
  },
  {
    id: "physical",
    title: "Physical verification photos",
    kind: "multi",
    docTypes: ["physical_verification"],
    photosOnly: true,
  },
  { id: "signed", title: "Vendor signed documents", kind: "multi", docTypes: ["signed_agreement"] },
  {
    id: "tds",
    title: "TDS documents",
    kind: "multi",
    docTypes: ["tds_supporting_document"],
  },
  { id: "other", title: "Other documents", kind: "multi", docTypes: ["other"], requiresName: true },
];

export const BANK_PROOF_OPTIONS: readonly { docType: SupplierKycDocType; label: string }[] = [
  { docType: "cancelled_cheque", label: "Cancelled cheque" },
  { docType: "bank_statement", label: "Statement screenshot" },
  { docType: "bank_proof_other", label: "Other" },
];

export type RegistrationKind = "gstin" | "udyam" | "msme" | "gumasta";

/** Gumasta = Maharashtra Shop & Establishment licence (mostly Mumbai vendors). */
export const REGISTRATION_OPTIONS: readonly { docType: RegistrationKind; label: string }[] = [
  { docType: "gstin", label: "GST" },
  { docType: "udyam", label: "Udyam" },
  { docType: "msme", label: "MSME" },
  { docType: "gumasta", label: "Gumasta" },
];

/** suppliers column that holds each registration kind's number. */
export const REGISTRATION_NUMBER_FIELD: Record<RegistrationKind, "gstin" | "msme_number" | "gumasta_number"> = {
  gstin: "gstin",
  udyam: "msme_number",
  msme: "msme_number",
  gumasta: "gumasta_number",
};

function byNewest(a: SupplierKycDocument, b: SupplierKycDocument): number {
  const va = a.version_number ?? 0;
  const vb = b.version_number ?? 0;
  if (va !== vb) return vb - va;
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

/** Latest (highest version, then newest) document of a type. */
export function latestDocOfType(
  docs: readonly SupplierKycDocument[],
  docType: SupplierKycDocType,
): SupplierKycDocument | undefined {
  return docs.filter((d) => d.doc_type === docType).sort(byNewest)[0];
}

/** Latest document among several types (e.g. whichever bank proof was uploaded last). */
export function latestDocOfTypes(
  docs: readonly SupplierKycDocument[],
  docTypes: readonly SupplierKycDocType[],
): SupplierKycDocument | undefined {
  return docs
    .filter((d) => docTypes.includes(d.doc_type))
    .sort((a, b) =>
      String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")),
    )[0];
}

/** All documents of a multi-file section, oldest first. */
export function docsForSection(
  docs: readonly SupplierKycDocument[],
  section: VendorVaultSection,
): SupplierKycDocument[] {
  return docs
    .filter((d) => section.docTypes.includes(d.doc_type))
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

// ── Number validation ────────────────────────────────────────────────────────

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^[0-9]{12}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UDYAM_RE = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;

export function normalizeIdNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export type VendorNumberKind =
  | "pan"
  | "aadhaar"
  | "ifsc"
  | "gstin"
  | "udyam"
  | "msme"
  | "gumasta"
  | "account";

/** Returns an error message, or null when valid / empty (empty = not provided). */
export function validateVendorNumber(kind: VendorNumberKind, raw: string): string | null {
  const v = normalizeIdNumber(raw);
  if (!v) return null;
  switch (kind) {
    case "pan":
      return PAN_RE.test(v) ? null : "PAN must look like ABCDE1234F.";
    case "aadhaar":
      return AADHAAR_RE.test(v) ? null : "Aadhaar must be exactly 12 digits.";
    case "ifsc":
      return IFSC_RE.test(v) ? null : "IFSC must look like HDFC0001234.";
    case "gstin":
      return GSTIN_RE.test(v) ? null : "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
    case "udyam":
      return UDYAM_RE.test(v) ? null : "Udyam number must look like UDYAM-KA-01-0012345.";
    case "msme":
      return v.length >= 6 ? null : "Enter a valid MSME registration number.";
    case "gumasta":
      // Formats vary by ward/year (e.g. 760012345/Commercial II), so only a sanity check.
      return v.length >= 4 ? null : "Enter a valid Gumasta licence number.";
    case "account":
      return ACCOUNT_RE.test(v) ? null : "Account number must be 9–18 digits.";
  }
}

/** Groups a 12-digit Aadhaar as `XXXX XXXX XXXX`, keeping leading zeros. */
export function formatAadhaarNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 12);
  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12)].filter((part) => part.length > 0).join(" ");
}

/** Shows only the last 4 digits, e.g. "XXXX XXXX 1234". */
export function maskAadhaar(raw: string | null | undefined): string {
  const v = normalizeIdNumber(raw ?? "");
  if (v.length < 4) return v ? "XXXX" : "";
  return `XXXX XXXX ${v.slice(-4)}`;
}

/** Shows only the last 4 digits of a bank account. */
export function maskAccountNumber(raw: string | null | undefined): string {
  const v = normalizeIdNumber(raw ?? "");
  if (v.length <= 4) return v;
  return `${"X".repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`;
}

// ── Financial year (India: April–March) ──────────────────────────────────────

/** "2026-27" for any date from 1 Apr 2026 to 31 Mar 2027. */
export function financialYearOf(date: Date): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Next FY, current FY, then the previous `back` years — newest first. */
export function financialYearOptions(now: Date, back = 3): string[] {
  const cur = Number(financialYearOf(now).slice(0, 4));
  const out: string[] = [];
  for (let start = cur + 1; start >= cur - back; start--) {
    out.push(`${start}-${String((start + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Rolling window for `now`, plus any years that already have a saved rate.
 * Older saved years stay selectable after they fall out of the recent window.
 */
export function financialYearChoices(now: Date, savedYears: readonly string[] = [], back = 3): string[] {
  const years = new Set(financialYearOptions(now, back));
  for (const year of savedYears) {
    if (isValidFinancialYear(year)) years.add(year);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function isValidFinancialYear(value: string): boolean {
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(value);
  if (!m) return false;
  return (Number(m[1]) + 1) % 100 === Number(m[2]);
}

/** Parses a 0–100 percentage with up to 2 decimals; returns null when invalid.
 *  Accepts an optional trailing `%` (e.g. `"2%"`, `" 1.5 % "`) so label-driven
 *  inputs like "TDS rate %" don't reject a natural entry. */
export function parsePercentage(raw: string): number | null {
  const v = raw.trim().replace(/%/g, "").trim();
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n >= 0 && n <= 100 ? n : null;
}

// ── Vendor status ────────────────────────────────────────────────────────────

export const VENDOR_STATUS_LABELS: Record<SupplierVendorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

export function normalizeVendorStatus(raw: string | null | undefined): SupplierVendorStatus {
  return raw === "inactive" || raw === "blacklisted" ? raw : "active";
}

/** Blacklisting needs a reason; other statuses clear it. */
export function validateVendorStatusChange(
  next: SupplierVendorStatus,
  reason: string,
): string | null {
  if (next === "blacklisted" && !reason.trim()) return "Enter a reason for blacklisting this vendor.";
  return null;
}
