import type { TextInputProps } from "react-native";

import {
  formatIndianVehicleNumberInput,
  normalizeVehicleNumberForMatch,
  parsePlate,
} from "@/lib/format";

/**
 * Standard Indian civilian plate — series letters may be 1 or 2 characters:
 *   AA 00 A 0000   (e.g. TN 05 C 9811)
 *   AA 00 AA 0000  (e.g. TN 17 AS 2202)
 * The 5th character (index 4) is always a series letter; the 6th (index 5)
 * may be a 2nd series letter OR the first digit of the number segment — the
 * keypad accepts either and the rest of the plate shifts accordingly.
 */
export const INDIAN_VEHICLE_SEGMENT_LENGTHS = [2, 2, 2, 4] as const;

/** Plate length after normalize (no spaces) — 9 with a 1-letter series, 10 with 2. */
export const INDIAN_VEHICLE_MIN_TOTAL_LENGTH = 9;
export const INDIAN_VEHICLE_TOTAL_LENGTH = 10;

const VALID_PLATE = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;
const NO_SERIES_PLATE = /^[A-Z]{2}[0-9]{2}[0-9]{4}$/;

/**
 * Plate layouts the user can pick. "standard" is the default and the only one
 * typed unless the user picks another format explicitly.
 *   standard — AA 00 A(A) 0000 (TN 17 AS 2202)
 *   noSeries — AA 00 0000, no series letter (KA 56 6088)
 */
export type IndianVehicleFormat = "standard" | "noSeries";

export const INDIAN_VEHICLE_FORMATS: readonly {
  id: IndianVehicleFormat;
  label: string;
  example: string;
}[] = [
  { id: "standard", label: "Standard", example: "TN 17 AS 2202" },
  { id: "noSeries", label: "No series letter", example: "KA 56 6088" },
];

/** Which supported format a complete plate matches, or null. */
export function detectIndianVehicleFormat(display: string): IndianVehicleFormat | null {
  const norm = normalizeVehicleNumberForMatch(display);
  if (VALID_PLATE.test(norm)) return "standard";
  if (NO_SERIES_PLATE.test(norm)) return "noSeries";
  return null;
}

export function getIndianVehicleNormalizedLength(display: string): number {
  return normalizeVehicleNumberForMatch(display).length;
}

/** True when the value is a complete plate in one of the supported formats. */
export function isIndianVehiclePlateValid(display: string): boolean {
  return detectIndianVehicleFormat(display) !== null;
}

/** Continue-gate used by the wizards. */
export function isIndianVehiclePlateComplete(display: string): boolean {
  return isIndianVehiclePlateValid(display);
}

export type IndianVehicleKeyboardKind = "letters" | "numbers";

/** Segment chips under the field (AA · 00 · A(A) · 0000). */
export function getIndianVehicleSegmentGuide(
  display: string,
  format: IndianVehicleFormat = "standard",
): { label: string; done: boolean }[] {
  const norm = normalizeVehicleNumberForMatch(display);
  if (format === "noSeries") {
    return [
      { label: "AA", done: norm.length >= 2 },
      { label: "00", done: norm.length >= 4 },
      { label: "0000", done: norm.length >= 8 },
    ];
  }
  const p = parsePlate(norm);
  return [
    { label: "AA", done: p.state.length === 2 },
    { label: "00", done: p.district.length === 2 },
    { label: "A(A)", done: p.series.length >= 1 && p.number.length > 0 },
    { label: "0000", done: p.number.length === 4 },
  ];
}

/** Which character classes are legal as the next keystroke. */
export function getIndianVehicleAllowedNext(
  display: string,
  format: IndianVehicleFormat = "standard",
): {
  letters: boolean;
  digits: boolean;
} {
  return allowedNext(normalizeVehicleNumberForMatch(display), format);
}

function allowedNext(
  normalized: string,
  format: IndianVehicleFormat = "standard",
): { letters: boolean; digits: boolean } {
  if (format === "noSeries") {
    const len = normalized.length;
    if (len < 2) return { letters: true, digits: false };
    if (len < 8) return { letters: false, digits: true };
    return { letters: false, digits: false };
  }
  const p = parsePlate(normalized);
  const n = normalized.length;
  if (n >= 4 + p.series.length + 4) {
    return { letters: false, digits: false };
  }
  // 0–1: state letters · 2–3: district digits
  if (n < 2) return { letters: true, digits: false };
  if (n < 4) return { letters: false, digits: true };
  // index 4: series must start with a letter.
  if (n === 4) return { letters: true, digits: false };
  // index 5: either the 2nd series letter, or the number segment starting
  // early with a 1-letter series — accept both, resolved by what's typed.
  if (n === 5) return { letters: true, digits: true };
  // Series is settled (1 or 2 letters) — remaining 4 chars are the number.
  return { letters: false, digits: true };
}

/**
 * Which keypad to show — exclusive per segment (no ABC/123 toggle needed).
 * A bare length can't tell "2nd series letter vs 1st number digit" apart at
 * index 5 (both are legal there) — callers passing a number get a
 * best-effort guess (letters, since a 2-letter series is the common case);
 * pass the actual string value when precision at that position matters.
 */
export function getIndianVehicleKeyboardKind(
  normalizedLenOrValue: number | string,
  format: IndianVehicleFormat = "standard",
): IndianVehicleKeyboardKind {
  if (format === "noSeries") {
    const n =
      typeof normalizedLenOrValue === "number"
        ? normalizedLenOrValue
        : normalizeVehicleNumberForMatch(normalizedLenOrValue).length;
    return n < 2 ? "letters" : "numbers";
  }
  if (typeof normalizedLenOrValue === "number") {
    const n = normalizedLenOrValue;
    if (n < 2) return "letters";
    if (n < 4) return "numbers";
    if (n < 6) return "letters";
    return "numbers";
  }
  const { letters } = allowedNext(
    normalizeVehicleNumberForMatch(normalizedLenOrValue),
  );
  return letters ? "letters" : "numbers";
}

/**
 * System TextInput keyboard. When letters and digits are both legal (1- vs
 * 2-letter series), stay on `default` so a plate like TN18D2522 can accept
 * digits without remounting into number-pad (which drops the letters).
 */
export function getIndianVehicleTextInputKeyboardType(
  display: string,
  format: IndianVehicleFormat = "standard",
): TextInputProps["keyboardType"] {
  const { letters, digits } = allowedNext(
    normalizeVehicleNumberForMatch(display),
    format,
  );
  if (letters) return "default";
  if (digits) return "number-pad";
  return "default";
}

export function getIndianVehicleKeyboardType(
  normalizedLenOrValue: number | string,
): TextInputProps["keyboardType"] {
  if (typeof normalizedLenOrValue === "string") {
    return getIndianVehicleTextInputKeyboardType(normalizedLenOrValue);
  }
  return getIndianVehicleKeyboardKind(normalizedLenOrValue) === "numbers"
    ? "number-pad"
    : "default";
}

export function getIndianVehicleFormatHint(
  normalizedLenOrValue: number | string,
  format: IndianVehicleFormat = "standard",
): string {
  if (format === "noSeries") {
    const n =
      typeof normalizedLenOrValue === "number"
        ? normalizedLenOrValue
        : normalizeVehicleNumberForMatch(normalizedLenOrValue).length;
    if (n < 2) return "Enter 2 letters (state code, e.g. KA)";
    if (n < 4) return "Enter 2 digits (district, e.g. 56)";
    if (n < 8) return "Enter 4 digits (number, e.g. 6088)";
    return "Format: AA 00 0000 (e.g. KA 56 6088)";
  }
  if (typeof normalizedLenOrValue === "number") {
    const n = normalizedLenOrValue;
    if (n < 2) return "Enter 2 letters (state code, e.g. TN)";
    if (n < 4) return "Enter 2 digits (district, e.g. 17)";
    if (n < 6) return "Enter 1 or 2 letters (series, e.g. C or AS)";
    return "Enter 4 digits (number, e.g. 2202)";
  }

  const normalized = normalizeVehicleNumberForMatch(normalizedLenOrValue);
  const n = normalized.length;
  const p = parsePlate(normalized);
  const seriesSettled = p.series.length >= 1 && p.number.length > 0;

  if (n < 2) return "Enter 2 letters (state code, e.g. TN)";
  if (n < 4) return "Enter 2 digits (district, e.g. 17)";
  if (n === 4) return "Enter 1 or 2 letters (series, e.g. C or AS)";
  if (n === 5 && !seriesSettled) {
    return "Add a 2nd series letter, or continue with digits (e.g. C 9811 or CB 9811)";
  }
  if (!seriesSettled || p.number.length < 4) {
    return "Enter 4 digits (number, e.g. 2202)";
  }
  return p.series.length === 1
    ? "Format: AA 00 A 0000 (e.g. TN 05 C 9811)"
    : "Format: AA 00 AA 0000 (e.g. TN 17 AS 2202)";
}

/** Remove the last plate character (display spacing preserved). */
export function deleteIndianVehicleLastChar(display: string): string {
  const norm = normalizeVehicleNumberForMatch(display);
  if (norm.length === 0) return "";
  return formatIndianVehicleNumberInput(norm.slice(0, -1));
}

/** Append one character if it matches the current segment rules. */
export function appendIndianVehicleChar(
  display: string,
  char: string,
  format: IndianVehicleFormat = "standard",
): string {
  const upper = char.toUpperCase();
  return applyIndianVehicleKeystroke(display + upper, format);
}

export function applyIndianVehicleKeystroke(
  nextRaw: string,
  format: IndianVehicleFormat = "standard",
): string {
  const norm = normalizeVehicleNumberForMatch(nextRaw);
  let built = "";
  for (
    let i = 0;
    i < norm.length && built.length < INDIAN_VEHICLE_TOTAL_LENGTH;
    i++
  ) {
    const ch = norm[i];
    const { letters, digits } = allowedNext(built, format);
    if (/[A-Z]/.test(ch)) {
      if (letters) built += ch;
    } else if (/[0-9]/.test(ch)) {
      if (digits) built += ch;
    }
  }
  return formatIndianVehicleNumberInput(built);
}
