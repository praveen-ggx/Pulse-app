/**
 * Shared validation layer — O(1) per validator per field; single pass per form.
 * Use: run validators in sequence; first error wins. Reuse across forms and services.
 */

import {
  INDIAN_VEHICLE_TOTAL_LENGTH,
  isIndianVehiclePlateValid,
} from "@/lib/indianVehicleInput.util";

// ——— Constants (single source of truth) ———

export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  COMPANY_NAME_MAX_LENGTH: 200,
  /** Profile quote/status (WhatsApp-style). */
  STATUS_TEXT_MAX_LENGTH: 150,
  EMAIL_MAX_LENGTH: 255,
  PHONE_DIGITS: 10,
  CLIENT_SUPPLIER_NAME_MAX_LENGTH: 200,
  ADDRESS_MAX_LENGTH: 500,
  STREET_ADDRESS_MIN_LENGTH: 5,
  STREET_ADDRESS_MAX_LENGTH: 200,
  LOCALITY_MAX_LENGTH: 100,
  PINCODE_LENGTH: 6,
  NOTES_MAX_LENGTH: 1000,
  DESCRIPTION_MAX_LENGTH: 500,
  PARTY_NAME_MAX_LENGTH: 255,
  /** Indian plate after normalize: 9 chars (1-letter series) or 10 (2-letter). */
  VEHICLE_NUMBER_MAX_LENGTH: INDIAN_VEHICLE_TOTAL_LENGTH,
  LICENSE_NUMBER_MIN_LENGTH: 5,
  LICENSE_NUMBER_MAX_LENGTH: 20,
  AMOUNT_MAX: 99_999_999,
  AMOUNT_MIN: 0,
  PERCENT_MAX: 100,
  PERCENT_MIN: 0,
  COMMISSION_PER_KM_MAX: 9999,
  DATE_FORMAT: /^\d{4}-\d{2}-\d{2}$/,
} as const;

export type Validator<T = string> = (value: T) => string | null;

/** Run validators in order; return first error or null. O(k) for k validators. */
export function runValidators(value: string, validators: Validator<string>[]): string | null {
  for (let i = 0; i < validators.length; i++) {
    const err = validators[i](value);
    if (err) return err;
  }
  return null;
}

/** Required (non-empty after trim). */
export function required(msg = 'Required'): Validator<string> {
  return (v) => ((v ?? '').trim().length === 0 ? msg : null);
}

/** Max length (after trim). */
export function maxLength(n: number, msg?: string): Validator<string> {
  return (v) => {
    const t = (v ?? '').trim();
    if (t.length > n) return msg ?? `Must be at most ${n} characters.`;
    return null;
  };
}

/** Number in range (inclusive). Value can be string or number; parses float. */
export function numberInRange(
  min: number,
  max: number,
  opts?: { msg?: string; allowEmpty?: boolean }
): Validator<string | number> {
  return (v) => {
    if (v === '' || v === null || v === undefined) {
      return opts?.allowEmpty ? null : (opts?.msg ?? 'Required');
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (Number.isNaN(n)) return opts?.msg ?? 'Enter a valid number.';
    if (n < min || n > max) return opts?.msg ?? `Must be between ${min} and ${max}.`;
    return null;
  };
}

/** Positive number with optional max (e.g. amount). */
export function positiveAmount(max = VALIDATION.AMOUNT_MAX, msg?: string): Validator<string | number> {
  return (v) => {
    if (v === '' || v === null || v === undefined) return msg ?? 'Required';
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (Number.isNaN(n)) return 'Enter a valid number.';
    if (n < VALIDATION.AMOUNT_MIN) return msg ?? 'Must be ≥ 0.';
    if (n > max) return `Must be at most ${max.toLocaleString()}.`;
    return null;
  };
}

/** Non-negative number (e.g. supplier target). */
export function nonNegativeAmount(max = VALIDATION.AMOUNT_MAX): Validator<string | number> {
  return numberInRange(VALIDATION.AMOUNT_MIN, max, {
    allowEmpty: false,
    msg: 'Enter a value ≥ 0.',
  });
}

/** YYYY-MM-DD and valid calendar date. */
export function dateISO(msg = 'Enter a valid date (YYYY-MM-DD).'): Validator<string> {
  return (v) => {
    const t = (v ?? '').trim();
    if (t.length === 0) return null;
    if (!VALIDATION.DATE_FORMAT.test(t)) return msg;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return msg;
    const [y, m, day] = t.split('-').map(Number);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return msg;
    return null;
  };
}

/**
 * Indian vehicle registration — AA 00 A 0000 or AA 00 AA 0000
 * (`isIndianVehiclePlateValid`), e.g. TN 18 D 2522 or TN 17 AS 2202.
 */
export function validateIndianVehicleNumber(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return 'Required';
  if (!isIndianVehiclePlateValid(raw)) {
    return 'Enter a valid vehicle number (e.g. TN 18 D 2522 or TN 17 AS 2202).';
  }
  return null;
}

/** Optional Indian vehicle number (empty allowed). */
export function optionalIndianVehicleNumber(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return null;
  return validateIndianVehicleNumber(value);
}

/** Password: length only (format/strength can be added). */
export function validatePassword(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (t.length === 0) return 'Required';
  if (t.length < VALIDATION.PASSWORD_MIN_LENGTH)
    return `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters.`;
  if (t.length > VALIDATION.PASSWORD_MAX_LENGTH)
    return `Password must be at most ${VALIDATION.PASSWORD_MAX_LENGTH} characters.`;
  return null;
}

/** Disallow NUL bytes in auth fields (defense in depth; never valid in email/password). */
export function containsNullByte(value: string | null | undefined): boolean {
  return (value ?? '').includes('\0');
}

/**
 * Sign-in only: do not trim password for length rules (spaces may be part of the secret).
 * Rejects empty / whitespace-only, over max length, and NUL.
 */
export function validatePasswordForSignIn(value: string | null | undefined): string | null {
  const raw = value ?? '';
  if (containsNullByte(raw)) {
    return 'Password contains invalid characters.';
  }
  if (raw.length > VALIDATION.PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${VALIDATION.PASSWORD_MAX_LENGTH} characters.`;
  }
  if (raw.trim().length === 0) {
    return 'Enter your password.';
  }
  return null;
}

/** Indian postal PIN: 6 digits, first digit 1–9. */
export function validateIndianPincode(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return 'PIN code is required.';
  if (!/^[1-9]\d{5}$/.test(digits)) return 'Enter a valid 6-digit PIN code.';
  return null;
}

/** Optional Indian PIN (empty allowed). */
export function optionalIndianPincode(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;
  return validateIndianPincode(digits);
}

/** Street / building line for office address. */
export function validateStreetAddress(value: string | null | undefined): string | null {
  return runValidators(value ?? '', [
    required('Street address is required.'),
    maxLength(
      VALIDATION.STREET_ADDRESS_MAX_LENGTH,
      `Street address must be at most ${VALIDATION.STREET_ADDRESS_MAX_LENGTH} characters.`,
    ),
    (v) => {
      const t = v.trim();
      if (t.length > 0 && t.length < VALIDATION.STREET_ADDRESS_MIN_LENGTH) {
        return `Street address must be at least ${VALIDATION.STREET_ADDRESS_MIN_LENGTH} characters.`;
      }
      return null;
    },
  ]);
}

/** Area / locality (optional). */
export function validateAddressLocality(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (t.length === 0) return null;
  return maxLength(
    VALIDATION.LOCALITY_MAX_LENGTH,
    `Locality must be at most ${VALIDATION.LOCALITY_MAX_LENGTH} characters.`,
  )(t);
}

/** Full name: 2–100 chars when non-empty. */
export function validateFullName(required: boolean): Validator<string> {
  return (v) => {
    const t = (v ?? '').trim();
    if (t.length === 0) return required ? 'Required' : null;
    if (t.length < VALIDATION.NAME_MIN_LENGTH)
      return `Must be at least ${VALIDATION.NAME_MIN_LENGTH} characters.`;
    if (t.length > VALIDATION.NAME_MAX_LENGTH)
      return `Must be at most ${VALIDATION.NAME_MAX_LENGTH} characters.`;
    return null;
  };
}

/** Single validation pass for an object: returns record of field -> error or null. O(n) in number of fields. */
export function validateFields<T extends Record<string, unknown>>(
  data: T,
  rules: { [K in keyof T]?: Validator<unknown>[] }
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const validators = rules[key];
    if (!validators?.length) continue;
    const value = data[key];
    for (let i = 0; i < validators.length; i++) {
      const err = (validators[i] as Validator<unknown>)(value);
      if (err) {
        errors[key] = err;
        break;
      }
    }
  }
  return errors;
}
