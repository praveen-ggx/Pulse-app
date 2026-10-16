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

export function normalizeIndianDrivingLicense(display: string): string {
  return display.trim().toUpperCase().replace(DL_CLEAN, "");
}

export function getIndianDlNormalizedLength(display: string): number {
  return normalizeIndianDrivingLicense(display).length;
}

export function isIndianDrivingLicenseComplete(display: string): boolean {
  return getIndianDlNormalizedLength(display) >= INDIAN_DL_MIN_LENGTH;
}

export type IndianDlKeyboardKind = "letters" | "numbers";

export function getIndianDlKeyboardKind(normalizedLen: number): IndianDlKeyboardKind {
  return normalizedLen <= 1 ? "letters" : "numbers";
}

export function getIndianDlFormatHint(normalizedLen: number): string {
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

export function applyIndianDlKeystroke(nextRaw: string): string {
  const norm = normalizeIndianDrivingLicense(nextRaw);
  let built = "";
  for (let i = 0; i < norm.length && built.length < INDIAN_DL_MAX_LENGTH; i++) {
    const ch = norm[i]!;
    const pos = built.length;
    if (pos <= 1) {
      if (/[A-Z]/.test(ch)) built += ch;
    } else if (/[0-9]/.test(ch)) {
      built += ch;
    }
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
