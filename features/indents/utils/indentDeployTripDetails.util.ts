import type { IndentRow } from "@/features/indents/services/indents.service";
import { getTodayIso, isValidIsoDateString } from "@/lib/dateIso.util";

/**
 * Indent `weight` is stored in kg; deploy / add-trip UI uses metric tons.
 * Keep kg÷1000 exactly (1 kg = 0.001 MT) — do not round to 2dp, which used to
 * turn 29.877 MT into 29.88 and inflate per-MT client_price.
 */
export function indentWeightKgToTonsInput(kg: number | null | undefined): string {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return "";
  const tons = n / 1000;
  // Up to 3 decimal MT matches whole-kilogram indent weight; strip float noise.
  return String(Number(tons.toFixed(6)));
}

export function parseTonsInputToWeightKg(tonsInput: string): number | null {
  const raw = tonsInput.trim().replace(/,/g, "");
  if (!raw) return null;
  const tons = parseFloat(raw);
  if (!Number.isFinite(tons) || tons <= 0 || tons > 999) return null;
  const kg = tons * 1000;
  if (kg > 999_999) return null;
  return kg;
}

export function seedDeployPickupDateFromIndent(indent: { pickup_date?: string | null | undefined }): string {
  const raw = indent.pickup_date;
  if (raw != null && String(raw).trim()) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return getTodayIso();
}

export function seedDeployWeightTonsFromIndent(indent: IndentRow): string {
  return indentWeightKgToTonsInput(indent.weight);
}

/**
 * Final allocation step only collects arrival date (type / product / tons
 * come from the indent). Ready = valid date only so Convert to trip is not
 * blocked when indent weight or commodity fields are empty.
 */
export function isDeployTripDetailsReady(
  pickupDate: string,
  _weightTons?: string,
  _vehicleType?: string,
  _loadType?: string,
): boolean {
  return isValidIsoDateString(pickupDate);
}

export function seedDeployVehicleTypeFromIndent(indent: {
  vehicle_type?: string | null;
}): string {
  return (indent.vehicle_type ?? "").trim();
}

export function seedDeployLoadTypeFromIndent(indent: {
  load_type?: string | null;
}): string {
  return (indent.load_type ?? "").trim();
}
