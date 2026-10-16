/**
 * Indian DL: 2 letters · 2 digits · 4 digits · 7-8 digits.
 * Length is NOT fixed across states — most RTOs issue 15 chars
 * (TN01 20200001234) but some (e.g. AP) issue 16 (AP00 219960000365).
 * Accept both: complete at 15, still typeable up to 16.
 */
export const INDIAN_DL_SEGMENT_LENGTHS = [2, 2, 4, 7] as const;
export const INDIAN_DL_MIN_LENGTH = 15;
export const INDIAN_DL_MAX_LENGTH = 16;
/** @deprecated use INDIAN_DL_MIN_LENGTH / INDIAN_DL_MAX_LENGTH */
export const INDIAN_DL_TOTAL_LENGTH = INDIAN_DL_MIN_LENGTH;

const DL_CLEAN = /[\s-]/g;

/**
 * Licence layouts the user can pick. "standard" is the default and the only
 * one typed unless the user picks another format explicitly.
 *   standard  — TN01 20200001234 (2 letters · 2 digits · 4-digit year · 7-8 digits)
 *   rtoLetter — TN29 Z19940001713 (2 letters · 2 digits · 1 letter · 4-digit year · 7 digits)
 */
export type IndianDlFormat = "standard" | "rtoLetter";

export const INDIAN_DL_FORMATS: readonly {
  id: IndianDlFormat;
  label: string;
  example: string;
}[] = [
  { id: "standard", label: "Standard", example: "TN01 20200001234" },
  { id: "rtoLetter", label: "Letter after RTO", example: "TN29 Z19940001713" },
];

const DL_FORMAT_PATTERNS: Record<IndianDlFormat, RegExp> = {
  standard: /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7,8}$/,
  rtoLetter: /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}[0-9]{7}$/,
};

const DL_FORMAT_MAX_LENGTH: Record<IndianDlFormat, number> = {
  standard: 16,
  rtoLetter: 16,
};

/** Positions (0-based) that take a letter; every other position takes a digit. */
function isDlLetterPosition(pos: number, format: IndianDlFormat): boolean {
  if (pos <= 1) return true;
  return format === "rtoLetter" && pos === 4;
}

/** True when the licence matches one of the supported formats (spaces / hyphens ignored). */
export function isIndianDrivingLicenseFormatValid(display: string): boolean {
  return detectIndianDlFormat(display) !== null;
}

/** Which supported format a complete licence matches, or null. */
export function detectIndianDlFormat(display: string): IndianDlFormat | null {
  const norm = normalizeIndianDrivingLicense(display);
  for (const f of INDIAN_DL_FORMATS) {
    if (DL_FORMAT_PATTERNS[f.id].test(norm)) return f.id;
  }
  return null;
}

export function normalizeIndianDrivingLicense(display: string): string {
  return display.trim().toUpperCase().replace(DL_CLEAN, "");
}

export function getIndianDlNormalizedLength(display: string): number {
  return normalizeIndianDrivingLicense(display).length;
}

export function isIndianDrivingLicenseComplete(display: string): boolean {
  return isIndianDrivingLicenseFormatValid(display);
}

export type IndianDlKeyboardKind = "letters" | "numbers";

export function getIndianDlKeyboardKind(
  normalizedLen: number,
  format: IndianDlFormat = "standard",
): IndianDlKeyboardKind {
  return isDlLetterPosition(normalizedLen, format) ? "letters" : "numbers";
}

export function getIndianDlFormatHint(
  normalizedLen: number,
  format: IndianDlFormat = "standard",
): string {
  if (format === "rtoLetter") {
    if (normalizedLen < 2) return "Enter 2 letters (state code, e.g. TN)";
    if (normalizedLen < 4) return "Enter 2 digits (RTO code)";
    if (normalizedLen < 5) return "Enter 1 letter (e.g. Z)";
    if (normalizedLen < 9) return "Enter 4 digits (issue year)";
    if (normalizedLen < 16) {
      const need = 16 - normalizedLen;
      return `Enter ${need} more digit${need === 1 ? "" : "s"}`;
    }
    return "Format: TN29 Z19940001713";
  }
  if (normalizedLen < 2) return "Enter 2 letters (state code, e.g. TN)";
  if (normalizedLen < 4) return "Enter 2 digits (RTO code)";
  if (normalizedLen < 8) return "Enter 4 digits (issue year)";
  if (normalizedLen < INDIAN_DL_MIN_LENGTH) {
    const need = INDIAN_DL_MIN_LENGTH - normalizedLen;
    return `Enter ${need} more digit${need === 1 ? "" : "s"} (7 or 8 in this block)`;
  }
  if (normalizedLen < INDIAN_DL_MAX_LENGTH) {
    return "Done — add 1 more digit if your licence has 16";
  }
  return "Format: TN01 20200001234";
}

export function formatIndianDrivingLicenseInput(built: string): string {
  const norm = normalizeIndianDrivingLicense(built);
  if (norm.length <= 4) return norm;
  return `${norm.slice(0, 4)} ${norm.slice(4)}`;
}

export function applyIndianDlKeystroke(
  nextRaw: string,
  format: IndianDlFormat = "standard",
): string {
  const norm = normalizeIndianDrivingLicense(nextRaw);
  const max = DL_FORMAT_MAX_LENGTH[format];
  let built = "";
  for (let i = 0; i < norm.length && built.length < max; i++) {
    const ch = norm[i]!;
    const wantLetter = isDlLetterPosition(built.length, format);
    if (wantLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch)) built += ch;
  }
  return formatIndianDrivingLicenseInput(built);
}

export function deleteIndianDlLastChar(display: string): string {
  const norm = normalizeIndianDrivingLicense(display);
  if (norm.length === 0) return "";
  return formatIndianDrivingLicenseInput(norm.slice(0, -1));
}

export function appendIndianDlChar(
  display: string,
  char: string,
  format: IndianDlFormat = "standard",
): string {
  return applyIndianDlKeystroke(display + char.toUpperCase(), format);
}
