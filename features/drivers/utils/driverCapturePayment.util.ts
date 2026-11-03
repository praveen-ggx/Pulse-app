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

export function stableDriverCaptureKey(input: {
  lane: DriverCaptureLane | string;
  tripId: string;
  amount: number;
  paymentModeId: string;
  reference?: string | null;
  paidOn?: string | null;
}): string {
  return [
    "dco-capture",
    String(input.lane ?? "").trim().toLowerCase(),
    String(input.tripId ?? "").trim(),
    String(Math.round(Number(input.amount) || 0)),
    String(input.paymentModeId ?? "").trim().toUpperCase(),
    String(input.reference ?? "").trim().toLowerCase(),
    String(input.paidOn ?? "").trim().slice(0, 10),
  ].join(":");
}

/** Namespace for ledger reference ids. driver_ledger.reference_id is uuid. */
const DRIVER_CAPTURE_REFERENCE_NAMESPACE = "8c1e5b2a-7d44-4f0e-9a31-6b0c4d8e2f17";

function rotl32(n: number, s: number): number {
  return ((n << s) | (n >>> (32 - s))) >>> 0;
}

function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length;
  const pad = (56 - ((ml + 1) % 64) + 64) % 64;
  const total = ml + 1 + pad + 8;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[ml] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, ml * 8, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < total; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4, false);
    for (let t = 16; t < 80; t += 1) {
      w[t] = rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t += 1) {
      let f = 0;
      let k = 0;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl32(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 UUID v5. Same name and namespace always return the same id. */
export function uuidV5(name: string, namespace: string): string {
  const ns = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + nameBytes.length);
  data.set(ns);
  data.set(nameBytes, ns.length);
  const hash = sha1(data).subarray(0, 16);
  const bytes = new Uint8Array(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/** UUID stored in driver_ledger.reference_id for one capture attempt. */
export function driverLedgerCaptureReferenceId(stableKey: string): string {
  return uuidV5(stableKey, DRIVER_CAPTURE_REFERENCE_NAMESPACE);
}

export function buildDriverCaptureDescription(input: {
  tripDisplay: string;
  paymentModeId: string;
  reference?: string | null;
  paidOn?: string | null;
  lane?: DriverCaptureLane | string;
}): string {
  const lane = String(input.lane ?? "").trim().toLowerCase();
  const parts = [
    lane === "fleet"
      ? `Commission ${input.tripDisplay}`.trim()
      : `Trip ${input.tripDisplay}`.trim(),
  ];
  const mode = driverCaptureModeLabel(input.paymentModeId);
  if (mode) parts.push(`Mode: ${mode}`);
  const utr = String(input.reference ?? "").trim();
  if (utr) parts.push(`UTR ${utr}`);
  const paidOn = String(input.paidOn ?? "").trim().slice(0, 10);
  if (paidOn) parts.push(`Paid: ${paidOn}`);
  return parts.join(" · ");
}
