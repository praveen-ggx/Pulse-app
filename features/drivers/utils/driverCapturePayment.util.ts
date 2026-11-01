import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";
import type { TripRow } from "@/features/trips/services/trips.service";

export type DriverCaptureLane = "fleet" | "shipper" | "marketplace";

const EXCHANGE_MODES = new Set(["CASH", "UPI", "BANK", "CHEQUE"]);

export function driverCaptureLaneForTrip(
  trip: Pick<TripRow, "source" | "operating_mode">,
  isFleetLinked: boolean,
): DriverCaptureLane {
  if (isDcoOperatingTrip(trip) && String(trip.source ?? "") === "market_bid") {
    return "marketplace";
  }
  return isFleetLinked ? "fleet" : "shipper";
}

export function parseDriverCaptureLane(raw: string | null | undefined): DriverCaptureLane | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "fleet" || value === "shipper" || value === "marketplace") return value;
  return null;
}

export function driverCaptureModeLabel(modeId: string): string {
  const id = modeId.trim().toUpperCase();
  if (id === "UPI") return "UPI";
  if (id === "BANK") return "BANK TRANSFER";
  if (id === "CHEQUE") return "CHEQUE";
  if (id === "CASH") return "CASH";
  return id || "CASH";
}

export function toExchangePaymentMode(modeId: string): "CASH" | "UPI" | "BANK" | "CHEQUE" {
  const id = modeId.trim().toUpperCase();
  return EXCHANGE_MODES.has(id) ? (id as "CASH" | "UPI" | "BANK" | "CHEQUE") : "CASH";
}

export function buildDriverCaptureDescription(input: {
  tripDisplay: string;
  paymentModeId: string;
  reference?: string | null;
  paidOn?: string | null;
}): string {
  const parts = [`Trip ${input.tripDisplay}`.trim()];
  const mode = driverCaptureModeLabel(input.paymentModeId);
  if (mode) parts.push(`Mode: ${mode}`);
  const utr = String(input.reference ?? "").trim();
  if (utr) parts.push(`UTR ${utr}`);
  const paidOn = String(input.paidOn ?? "").trim().slice(0, 10);
  if (paidOn) parts.push(`Paid: ${paidOn}`);
  return parts.join(" · ");
}
