import { tripAppearsInAwaitingPod } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

export type BulkPodPartyKind = "supplier" | "driver";

export type BulkPodParty = {
  kind: BulkPodPartyKind;
  id: string;
  name: string;
  tripCount: number;
};

export type BulkPodTripRow = {
  tripId: string;
  tripNumber: string;
  clientName: string;
  route: string;
  vehicle: string;
  lrLabel: string;
};

export function tripNeedsHardCopyPod(
  summary: Pick<ComplianceTripSummary, "trip" | "stage" | "documents" | "balance" | "hardCopyPod">,
): boolean {
  return tripAppearsInAwaitingPod(summary) && summary.hardCopyPod.received !== true;
}

export function bulkPodPartyFromTrip(
  kind: BulkPodPartyKind,
  trip: ComplianceTripSummary["trip"],
  supplierName?: string | null,
): { id: string; name: string } | null {
  if (kind === "supplier") {
    const id = String(trip.supplier_id ?? "").trim();
    const name =
      String(supplierName ?? "").trim() ||
      String(trip.supplier_name ?? "").trim();
    if (!id && !name) return null;
    return { id: id || name.toLowerCase(), name: name || "Supplier" };
  }
  const id = String(trip.driver_id ?? "").trim();
  const name = String(trip.driver_display_name ?? "").trim();
  if (!id && !name) return null;
  return { id: id || name.toLowerCase(), name: name || "Driver" };
}

export function listBulkPodParties(
  summaries: readonly ComplianceTripSummary[],
  kind: BulkPodPartyKind,
  supplierNameByTripId: Record<string, string> = {},
): BulkPodParty[] {
  const counts = new Map<string, BulkPodParty>();
  for (const summary of summaries) {
    if (!tripNeedsHardCopyPod(summary)) continue;
    const party = bulkPodPartyFromTrip(
      kind,
      summary.trip,
      supplierNameByTripId[summary.trip.id],
    );
    if (!party) continue;
    const current = counts.get(party.id);
    if (current) {
      current.tripCount += 1;
      continue;
    }
    counts.set(party.id, {
      kind,
      id: party.id,
      name: party.name,
      tripCount: 1,
    });
  }
  return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listBulkPodTripsForParty(
  summaries: readonly ComplianceTripSummary[],
  kind: BulkPodPartyKind,
  partyId: string,
  supplierNameByTripId: Record<string, string> = {},
  tripNumber: (summary: ComplianceTripSummary) => string,
): BulkPodTripRow[] {
  const wanted = partyId.trim();
  if (!wanted) return [];
  return summaries
    .filter((summary) => {
      if (!tripNeedsHardCopyPod(summary)) return false;
      const party = bulkPodPartyFromTrip(
        kind,
        summary.trip,
        supplierNameByTripId[summary.trip.id],
      );
      return party?.id === wanted;
    })
    .map((summary) => {
      const trip = summary.trip;
      const pickup = String(trip.pickup_area ?? "").trim() || "—";
      const drop = String(trip.drop_location ?? "").trim() || "—";
      const lrs = (summary.hardCopyPod.lrNumbers ?? []).filter(Boolean);
      return {
        tripId: trip.id,
        tripNumber: tripNumber(summary),
        clientName: String(trip.client_name ?? "").trim() || "—",
        route: `${pickup} → ${drop}`,
        vehicle: String(trip.vehicle_display_number ?? "").trim() || "Pending",
        lrLabel: lrs.length > 0 ? lrs.join(", ") : "—",
      };
    });
}
