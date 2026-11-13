/**
 * Indian DL: 2 letters · 2 digits · 4-digit year · 6-8 digits.
 * Length is NOT fixed across states — older cards are 14
 * (WB01 2003692449), most RTOs issue 15 (TN01 20200001234),
 * some (e.g. AP) issue 16 (AP00 219960000365).
 * Accept 14 through 16: complete at 14, still typeable up to 16.
 */
export const INDIAN_DL_SEGMENT_LENGTHS = [2, 2, 4, 6] as const;
export const INDIAN_DL_MIN_LENGTH = 14;
export const INDIAN_DL_MAX_LENGTH = 16;
/** @deprecated use INDIAN_DL_MIN_LENGTH / INDIAN_DL_MAX_LENGTH */
export const INDIAN_DL_TOTAL_LENGTH = INDIAN_DL_MIN_LENGTH;

const DL_CLEAN = /[\s-]/g;

/**
 * Licence layouts the user can pick. "standard" is the default and the only
 * one typed unless the user picks another format explicitly.
 *   standard  — TN01 20200001234 (2 letters · 2 digits · 4-digit year · 6-8 digits)
 *   rtoLetter — TN29 Z19940001713 (2 letters · 2 digits · 1 letter · 4-digit year · 7 digits)
 *   other     — any other layout, typed exactly as printed on the card. States
 *               issued many shapes over the years, e.g. a Telangana number-only card,
 *               DLFAP029126912005OD, 1043/HW/1997OD, MH04/12345/2005,
 *               P03042000123456. Accepted when it is 7-21 letters / digits
 *               (optionally split by single "/") with at least 5 digits.
 */
export type IndianDlFormat = "standard" | "rtoLetter" | "other";

export const INDIAN_DL_FORMATS: readonly {
  id: IndianDlFormat;
  label: string;
  example: string;
}[] = [
  { id: "standard", label: "Standard", example: "TN01 20200001234" },
  { id: "rtoLetter", label: "RTO letter", example: "TN29 Z19940001713" },
  { id: "other", label: "Other / old card", example: "As printed on the card" },
];

const DL_FORMAT_PATTERNS: Record<IndianDlFormat, RegExp> = {
  standard: /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{6,8}$/,
  rtoLetter: /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}[0-9]{7}$/,
  other: /^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/,
};

/** Longest old / smart card: DLF + 2 letters + 13 digits + 3 letters. */
export const INDIAN_DL_OTHER_MAX_LENGTH = 21;
export const INDIAN_DL_OTHER_MIN_LENGTH = 7;
/** Every real licence number carries a serial; this keeps names / junk out. */
const INDIAN_DL_OTHER_MIN_DIGITS = 5;

function matchesDlFormat(norm: string, format: IndianDlFormat): boolean {
  if (!DL_FORMAT_PATTERNS[format].test(norm)) return false;
  if (format !== "other") return true;
  const digits = norm.replace(/[^0-9]/g, "").length;
  return (
    norm.length >= INDIAN_DL_OTHER_MIN_LENGTH &&
    norm.length <= INDIAN_DL_OTHER_MAX_LENGTH &&
    digits >= INDIAN_DL_OTHER_MIN_DIGITS
  );
}

const DL_FORMAT_MAX_LENGTH: Record<IndianDlFormat, number> = {
  standard: 16,
  rtoLetter: 16,
  other: INDIAN_DL_OTHER_MAX_LENGTH,
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
    if (matchesDlFormat(norm, f.id)) return f.id;
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
  if (format === "other") {
    return "Type it exactly as printed on the card. Letters, numbers and / are allowed.";
  }
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
    return `Enter ${need} more digit${need === 1 ? "" : "s"} (6, 7, or 8 in this block)`;
  }
  if (normalizedLen < INDIAN_DL_MAX_LENGTH) {
    const room = INDIAN_DL_MAX_LENGTH - normalizedLen;
    return room === 1
      ? "Done — add 1 more digit if your licence has 16"
      : "Done — add 1 or 2 more digits if your licence has 15 or 16";
  }
  return "Format: TN01 20200001234";
}

export function formatIndianDrivingLicenseInput(built: string): string {
  const norm = normalizeIndianDrivingLicense(built);
  // Space after the state + RTO block only; old / smart cards are kept as typed.
  if (norm.length <= 4 || norm.includes("/") || !/^[A-Z]{2}[0-9]{2}/.test(norm)) {
    return norm;
  }
  return `${norm.slice(0, 4)} ${norm.slice(4)}`;
}

/**
 * "other": free letters/digits plus any "/" the user types (kept, never doubled).
 * A card starting with a digit also gets its two slashes added at letter↔digit
 * switches (1043HW1997OD → 1043/HW/1997OD).
 */
function buildOtherDl(norm: string): string {
  const chars = norm.replace(/[^A-Z0-9/]/g, "");
  const max = DL_FORMAT_MAX_LENGTH.other;
  const legacy = /^[0-9]/.test(chars);
  let built = "";
  let slashes = 0;
  for (const ch of chars) {
    if (built.length >= max) break;
    if (ch === "/") {
      if (built.length > 0 && !built.endsWith("/")) {
        built += "/";
        slashes++;
      }
      continue;
    }
    if (legacy && built.length > 0 && !built.endsWith("/")) {
      const prevIsDigit = /[0-9]/.test(built[built.length - 1]!);
      const isDigit = /[0-9]/.test(ch);
      const switched =
        (slashes === 0 && prevIsDigit && !isDigit) ||
        (slashes === 1 && !prevIsDigit && isDigit);
      if (switched) {
        built += "/";
        slashes++;
      }
    }
    built += ch;
  }
  return built.slice(0, max);
}

export function applyIndianDlKeystroke(
  nextRaw: string,
  format: IndianDlFormat = "standard",
): string {
  const norm = normalizeIndianDrivingLicense(nextRaw);
  if (format === "other") return buildOtherDl(norm);
  const max = DL_FORMAT_MAX_LENGTH[format];
  let built = "";
  for (let i = 0; i < norm.length && built.length < max; i++) {
    const ch = norm[i]!;
    const wantLetter = isDlLetterPosition(built.length, format);
    if (wantLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch)) built += ch;
  }
  return formatIndianDrivingLicenseInput(built);
}

/**
 * Typing into a plain text field: keep the picked layout while the input fits it,
 * but if a character would be thrown away (e.g. a number-only card typed under Standard),
 * switch to "other" so the number is kept exactly as typed.
 */
export function applyIndianDlKeystrokeAutoFormat(
  nextRaw: string,
  format: IndianDlFormat,
): { value: string; format: IndianDlFormat } {
  if (format === "other") {
    return { value: applyIndianDlKeystroke(nextRaw, "other"), format };
  }
  const typed = normalizeIndianDrivingLicense(nextRaw).replace(/[^A-Z0-9/]/g, "");
  // Picked layout first, then the other strict one, then free "other".
  const order: IndianDlFormat[] =
    format === "standard" ? ["standard", "rtoLetter"] : ["rtoLetter", "standard"];
  for (const f of order) {
    const kept = applyIndianDlKeystroke(nextRaw, f);
    if (normalizeIndianDrivingLicense(kept) === typed.slice(0, DL_FORMAT_MAX_LENGTH[f])) {
      return { value: kept, format: f };
    }
  }
  return { value: applyIndianDlKeystroke(nextRaw, "other"), format: "other" };
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
