/**
 * Log hard copy POD for one compliance trip — full screen (or the inline
 * pane) built from a ComplianceTripSummary. Single place that maps a
 * compliance trip onto LogHardCopyPodModal's manifest summary, so every entry
 * point (workspace pane, workspace popup, Debit control table) shows the same.
 */
import type { ComplianceListTripFacts } from "@/features/tripCompliance/services/complianceListFacts.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  LogHardCopyPodModal,
  type HardCopyPodLrOption,
} from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import type { ReactNode } from "react";

type Props = {
  summary: ComplianceTripSummary;
  visible: boolean;
  onClose: () => void;
  organizationId: string | null;
  canManage: boolean;
  lrOptions: HardCopyPodLrOption[];
  tripFacts: Pick<ComplianceListTripFacts, "truckTypeByVehicleId" | "supplierNameByTripId">;
  /** Called with every trip the save touched (one courier docket can cover several). */
  onChanged: (tripIds: string[]) => void | Promise<void>;
  /** Render inside a pane instead of as the drawer. */
  inline?: boolean;
  headerEnd?: ReactNode;
};

export function ComplianceHardCopyPodSheet({
  summary,
  visible,
  onClose,
  organizationId,
  canManage,
  lrOptions,
  tripFacts,
  onChanged,
  inline = false,
  headerEnd,
}: Props) {
  const trip = summary.trip;
  const orgId = organizationId || trip.organization_id;
  return (
    <LogHardCopyPodModal
      inline={inline}
      fullScreen={!inline}
      visible={visible}
      onClose={onClose}
      tripId={trip.id}
      organizationId={orgId}
      canManage={canManage}
      initialMode="create"
      onUpdated={async (tripIds) => {
        await onChanged(tripIds?.length ? tripIds : [trip.id]);
      }}
      tripScoped
      headerEnd={headerEnd}
      lrOptions={lrOptions.filter((option) => option.tripId.trim() === trip.id.trim())}
      summary={{
        manifestId: getTripDisplayNumber(trip, orgId || null),
        clientName: trip.client_name?.trim() || "—",
        pickup: trip.pickup_area?.trim() || "—",
        delivery: trip.drop_location?.trim() || "—",
        driverName: trip.driver_display_name?.trim() || "Unassigned",
        vehicleLabel: trip.vehicle_display_number?.trim() || "Pending",
        vehicleType:
          (trip.vehicle_id ? tripFacts.truckTypeByVehicleId[trip.vehicle_id] : null)?.trim() || "—",
        vendorName:
          (tripFacts.supplierNameByTripId[trip.id] ?? trip.supplier_name)?.trim() || "—",
      }}
    />
  );
}
