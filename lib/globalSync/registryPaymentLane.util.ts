import type { ActiveTripSummary } from "@/lib/globalSync/types";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

export type PaymentLane = "received" | "paid";
export type PaymentKind = "advance" | "other";

export type ClassifiedPayment = {
  lane: PaymentLane;
  kind: PaymentKind;
  categoryLabel: string;
};

function readMeta(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

/**
 * Client captures are inbound (`flow: in`, or a receipt line).
 * Everything else initiated on the trip is a payable, including advances.
 */
export function classifyPayment(input: {
  content?: string | null;
  metadata?: unknown;
}): ClassifiedPayment {
  const meta = readMeta(input.metadata);
  const category = String(meta?.category ?? meta?.ledger_category ?? "").trim();
  const content = String(input.content ?? "");
  const blob = `${category} ${content}`.toLowerCase();
  const kind: PaymentKind = /\badvance\b/.test(blob) ? "advance" : "other";
  const flow = String(meta?.flow ?? "").toLowerCase();
  const contact = String(meta?.contact_type ?? meta?.party_type ?? "").toLowerCase();

  let lane: PaymentLane = "paid";
  if (flow === "in" || contact === "client") lane = "received";
  else if (flow === "out" || contact === "supplier" || contact === "driver") lane = "paid";
  else if (/\bpaid\b/.test(content) && /\bto\b/.test(content)) lane = "paid";
  else if (/\breceived\b/.test(content) && !/\bpaid\b/.test(content)) lane = "received";

  return {
    lane,
    kind,
    categoryLabel: category || (kind === "advance" ? "Advance" : "Payment"),
  };
}

export function classifyPaymentAlert(
  alert: GlobalOperationAlert,
  trips: ActiveTripSummary[],
): ClassifiedPayment {
  const event = findEvent(alert, trips);
  return classifyPayment({
    content: event?.content ?? alert.subtitle,
    metadata: event?.metadata,
  });
}

function findEvent(alert: GlobalOperationAlert, trips: ActiveTripSummary[]) {
  if (!alert.trip_id || !alert.id.startsWith(`ev:${alert.trip_id}:`)) return null;
  const eventId = alert.id.slice(`ev:${alert.trip_id}:`.length);
  const trip = trips.find((row) => row.trip_id === alert.trip_id);
  return trip?.recent_events?.find((event) => event.id === eventId) ?? null;
}

export function paymentCategoryForLane(lane: PaymentLane): "payment_received" | "payment_paid" {
  return lane === "received" ? "payment_received" : "payment_paid";
}

export function paymentTagLabel(classified: ClassifiedPayment): string {
  if (classified.lane === "received") {
    return classified.kind === "advance" ? "Advance received" : "Payment received";
  }
  return classified.kind === "advance" ? "Advance paid" : "Payment paid";
}

export function reclassifyPaymentAlert(
  alert: GlobalOperationAlert,
  trips: ActiveTripSummary[],
): GlobalOperationAlert {
  if (alert.category !== "payment_received" && alert.category !== "payment_paid") return alert;
  const classified = classifyPaymentAlert(alert, trips);
  const category = paymentCategoryForLane(classified.lane);
  if (alert.category === category) return alert;
  return { ...alert, category };
}
