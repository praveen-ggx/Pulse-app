import { useOptionalChangeDriverPopup } from "@/contexts/ChangeDriverPopupContext";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import {
  isDriverDeclineAuditRow,
  shouldOpenChangeDriverAfterUnassign,
} from "@/features/trips/utils/driverDeclineAlert.util";
import { useEffect, useRef } from "react";

type Options = {
  tripId: string | null | undefined;
  driverId: string | null | undefined;
  canAssign: boolean;
  assignmentAuditRows: TripAssignmentAuditRow[];
  /** Show the existing Driver Rejected themed modal. */
  onShowRejectedModal: () => void;
};

/**
 * When a driver drops off an open trip (reject / decline), prompt the business
 * via the Driver Rejected modal and open Change-driver when they can assign.
 */
export function useDriverDeclineBusinessAlert({
  tripId,
  driverId,
  canAssign,
  assignmentAuditRows,
  onShowRejectedModal,
}: Options): void {
  const changeDriver = useOptionalChangeDriverPopup();
  const prevDriverIdRef = useRef<string | null | undefined>(undefined);
  const promptedForUnassignKeyRef = useRef<string | null>(null);
  const canAssignRef = useRef(canAssign);
  canAssignRef.current = canAssign;
  const onShowRef = useRef(onShowRejectedModal);
  onShowRef.current = onShowRejectedModal;
  const changeDriverRef = useRef(changeDriver);
  changeDriverRef.current = changeDriver;

  const promptIfNeeded = (id: string) => {
    const key = `${id}:null`;
    if (promptedForUnassignKeyRef.current === key) return;
    promptedForUnassignKeyRef.current = key;
    onShowRef.current();
    if (canAssignRef.current) {
      changeDriverRef.current?.openChangeDriver(id);
    }
  };

  // Live transition: had a driver → none while this trip is open.
  useEffect(() => {
    const id = String(tripId ?? "").trim();
    if (!id) return;
    const next = (driverId ?? "").trim() || null;
    const prev = prevDriverIdRef.current;

    if (prev === undefined) {
      prevDriverIdRef.current = next;
      return;
    }

    if (
      shouldOpenChangeDriverAfterUnassign({
        previousDriverId: prev,
        nextDriverId: next,
        // Alert all viewers; Change-driver is gated inside promptIfNeeded.
        canAssign: true,
      })
    ) {
      promptIfNeeded(id);
    }

    if (next != null) {
      promptedForUnassignKeyRef.current = null;
    }
    prevDriverIdRef.current = next;
  }, [driverId, tripId]);

  // Cold open: trip already unassigned after a decline audit → force update.
  useEffect(() => {
    const id = String(tripId ?? "").trim();
    if (!id) return;
    if ((driverId ?? "").trim()) return;
    const latest = assignmentAuditRows[0];
    if (!isDriverDeclineAuditRow(latest)) return;
    promptIfNeeded(id);
  }, [assignmentAuditRows, driverId, tripId]);
}
