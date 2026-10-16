/**
 * Indian DL. The common layout is 2 letters · 2 digits · 4 digits · 7-8 digits
 * (TN01 20200001234, AP00 219960000365), but older and state-specific licences
 * mix letters, digits and "/" anywhere — so entry accepts any alphanumeric
 * value of 10–20 characters instead of enforcing the common layout. Minimum 10
 * so a half-typed licence can't unlock Continue.
 */
export const INDIAN_DL_SEGMENT_LENGTHS = [2, 2, 4, 7] as const;
export const INDIAN_DL_MIN_LENGTH = 10;
export const INDIAN_DL_MAX_LENGTH = 20;
/** @deprecated use INDIAN_DL_MIN_LENGTH / INDIAN_DL_MAX_LENGTH */
export const INDIAN_DL_TOTAL_LENGTH = INDIAN_DL_MIN_LENGTH;

const DL_CLEAN = /[\s-]/g;
/** Normalized (no spaces / hyphens) licence: letters, digits and "/" only. */
const DL_FORMAT = /^[A-Z0-9/]{10,20}$/;
/** Free-text input allows spaces and hyphens on top of the normalized charset. */
const DL_TEXT_INPUT_MAX_LENGTH = 24;

export function normalizeIndianDrivingLicense(display: string): string {
  return display.trim().toUpperCase().replace(DL_CLEAN, "");
}

export function getIndianDlNormalizedLength(display: string): number {
  return normalizeIndianDrivingLicense(display).length;
}

export function isIndianDrivingLicenseComplete(display: string): boolean {
  return getIndianDlNormalizedLength(display) >= INDIAN_DL_MIN_LENGTH;
}

/** True when the licence is 10–20 letters / digits / "/" (spaces and hyphens ignored). */
export function isIndianDrivingLicenseFormatValid(display: string): boolean {
  return DL_FORMAT.test(normalizeIndianDrivingLicense(display));
}

/** Sanitize a free-text licence field: uppercase, keep letters, digits, space, "-" and "/". */
export function sanitizeIndianDlTextInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s/-]/g, "")
    .slice(0, DL_TEXT_INPUT_MAX_LENGTH);
}

export type IndianDlKeyboardKind = "letters" | "numbers";

export function getIndianDlKeyboardKind(normalizedLen: number): IndianDlKeyboardKind {
  return normalizedLen <= 1 ? "letters" : "numbers";
}

export function getIndianDlFormatHint(normalizedLen: number): string {
  if (normalizedLen < INDIAN_DL_MIN_LENGTH) {
    return "Enter the licence number as printed — letters and numbers (e.g. TN01 20200001234)";
  }
  if (normalizedLen < INDIAN_DL_MAX_LENGTH) {
    return "Done — keep typing if your licence has more characters";
  }
  return "Maximum length reached";
}

export function formatIndianDrivingLicenseInput(built: string): string {
  const norm = normalizeIndianDrivingLicense(built);
  if (norm.length <= 4) return norm;
  return `${norm.slice(0, 4)} ${norm.slice(4)}`;
}

export function applyIndianDlKeystroke(nextRaw: string): string {
  const norm = normalizeIndianDrivingLicense(nextRaw);
  let built = "";
  for (let i = 0; i < norm.length && built.length < INDIAN_DL_MAX_LENGTH; i++) {
    const ch = norm[i]!;
    if (/[A-Z0-9/]/.test(ch)) built += ch;
  }
  return formatIndianDrivingLicenseInput(built);
}

export function deleteIndianDlLastChar(display: string): string {
  const norm = normalizeIndianDrivingLicense(display);
  if (norm.length === 0) return "";
  return formatIndianDrivingLicenseInput(norm.slice(0, -1));
}

export function appendIndianDlChar(display: string, char: string): string {
  return applyIndianDlKeystroke(display + char.toUpperCase());
}
