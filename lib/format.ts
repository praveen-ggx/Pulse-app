/** Format number as INR. */
export function formatINR(value: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
  // Intl emits "₹78,000" with no gap — add a space after the symbol for readability.
  return formatted.replace(/₹(?=\d)/g, '₹ ');
}

/** Positive finite money for Target ₹ chips — never treat 0/null as a displayable target. */
export function positiveMoneyOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Compact INR for tight UI chips (e.g. ₹1.2L, ₹50K). */
export function formatINRChip(value: number): string {
  const n = Math.abs(Number(value));
  if (!Number.isFinite(n) || n === 0) return "₹0";
  if (n >= 1_00_00_000) {
    const cr = n / 1_00_00_000;
    return `₹${cr >= 10 ? Math.round(cr) : cr.toFixed(1)}Cr`;
  }
  if (n >= 1_00_000) {
    const L = n / 1_00_000;
    return `₹${L >= 10 ? Math.round(L) : L.toFixed(1)}L`;
  }
  if (n >= 1_000) {
    const K = n / 1_000;
    return `₹${K >= 100 ? Math.round(K) : K.toFixed(K >= 10 ? 0 : 1)}K`;
  }
  return formatINR(n).replace(/\s/g, "");
}

/** Indian grouping + 2 decimals for ledger amount inputs and quick-set chips. */
export function formatLedgerAmountInput(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Short date for ledger e.g. "26 FEB". */
export function formatLedgerDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
  return `${day} ${month}`;
}

/** Entity trip table date beside mission id — e.g. "17 APR 2026". */
export function formatTripTableDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return "—";
  }
}

/** Date + time for ledger PARTY/ITEM e.g. "5 Mar 26, 5:30 PM". */
export function formatLedgerDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const day = d.getDate();
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${day} ${month} ${year}, ${time}`;
  } catch {
    return '—';
  }
}

/** Number only for ledger table cells (no ₹), e.g. "6,000" — matches client ledger. */
export function formatLedgerAmount(value: number): string {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/** Time only e.g. "10:30 AM" for mission log. */
export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Relative time e.g. "1 month ago". */
export function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week(s) ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month(s) ago`;
  return `${Math.floor(diffDays / 365)} year(s) ago`;
}
/**
 * Indian vehicle registration — civilian layouts used for entry:
 * AA 00 A 0000 (e.g. TN 18 D 2522) and AA 00 AA 0000 (e.g. TN 17 AS 2202).
 * Display of legacy / BH plates still uses a flexible fallback below.
 */
const INDIAN_VEHICLE_STANDARD =
  /^[A-Z]{2}[0-9]{2}[A-Z]{0,2}[0-9]{0,4}$/;

/**
 * Legacy / Bharat layouts for display of stored values only
 * (district 1–3, series 0–3, or BH series).
 */
const INDIAN_VEHICLE_PARTIAL = /^([A-Z]{2})([0-9]*)([A-Z]{0,3})([0-9]{0,4})$/;
const BH_VEHICLE_PARTIAL = /^([0-9]{1,2})(BH?)?([0-9]{0,4})([A-Z]{0,2})$/;

/** Split a normalized plate into display segments, or null if it is not an Indian layout. */
function splitIndianVehicleSegments(normalized: string): string[] | null {
  if (INDIAN_VEHICLE_STANDARD.test(normalized) && normalized.length <= 10) {
    const p = parsePlate(normalized);
    const parts = [p.state, p.district, p.series, p.number].filter(
      (seg) => seg.length > 0,
    );
    if (parts.length > 0) return parts;
  }
  if (/^[0-9]/.test(normalized)) {
    const bh = normalized.match(BH_VEHICLE_PARTIAL);
    return bh ? ([bh[1], bh[2], bh[3], bh[4]].filter(Boolean) as string[]) : null;
  }
  const m = normalized.match(INDIAN_VEHICLE_PARTIAL);
  if (!m) return null;
  let district = m[2];
  let number = m[4];
  if (!m[3] && !number && district.length > 3) {
    number = district.slice(-4);
    district = district.slice(0, -4);
  }
  return [m[1], district, m[3], number].filter(Boolean) as string[];
}

/** Normalize vehicle number for matching (alphanumeric, uppercase, no spaces). Use when comparing trip.vehicle_display_number to vehicle.vehicle_number. */
export function normalizeVehicleNumberForMatch(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeRawVehicleInput(s: string): string {
  return normalizeVehicleNumberForMatch(s);
}

/**
 * Format for display: e.g. "TN 25 CM 7892" → "TN25CM7892" (no spaces).
 * Non-Indian values (e.g. "TRK-SEED-001") are returned trimmed, unchanged.
 */
export function formatIndianVehicleNumber(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = normalizeRawVehicleInput(trimmed);
  if (!normalized) return trimmed;
  const parts = splitIndianVehicleSegments(normalized);
  if (!parts) return trimmed;
  return parts.join('');
}

/**
 * Format mobile number to exactly 10 digits when fully typed.
 * Strips non-digits and handles common +91 or 0 prefixes when pasted.
 */
export function formatMobileNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10) {
    if (digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
  }
  return digits.slice(0, 10);
}

export type PlateShape = {
  state: string;
  district: string;
  series: string;
  number: string;
};

/**
 * Parse progressive input, letting the series segment run 1 or 2 letters.
 */
export function parsePlate(normalized: string): PlateShape {
  const state = normalized.slice(0, 2);
  const district = normalized.slice(2, 4);
  const afterDistrict = normalized.slice(4);
  const seriesMatch = afterDistrict.match(/^[A-Z]{0,2}/);
  const series = seriesMatch ? seriesMatch[0] : "";
  const number = afterDistrict.slice(series.length);
  return { state, district, series, number };
}

/**
 * Format as user types in vehicle number input (no spaces).
 *   "TN 17 AS 2202" → "TN17AS2202"
 *   "TN 05 C 9811"  → "TN05C9811"
 */
export function formatIndianVehicleNumberInput(next: string): string {
  const raw = normalizeRawVehicleInput(next);
  return raw.slice(0, 10);
}

/**
 * Indent `weight` is stored in kg; operators think in metric tons.
 * Returns e.g. "12 TONS" for offer cards and deploy prompts.
 */
export function formatIndentTonsToCarry(
  weightKg: number | null | undefined,
): string {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  const tons = kg / 1000;
  if (tons >= 100) {
    return `${Math.round(tons).toLocaleString("en-IN")} TONS`;
  }
  if (Math.abs(tons - Math.round(tons)) < 0.05) {
    return `${Math.round(tons).toLocaleString("en-IN")} TONS`;
  }
  const rounded = Math.round(tons * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return `${text} TONS`;
}
