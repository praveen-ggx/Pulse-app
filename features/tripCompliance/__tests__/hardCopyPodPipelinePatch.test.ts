/**
 * Regression: a hard-copy POD logged OUTSIDE Compliance (Trip Detail, Log
 * Incoming PODs) publishes via `publishHardCopyPodState`. Since Phase 2 the
 * pipeline cache holds `ComplianceTripInputs` (no `hardCopyPod` field), so the
 * patch must update `flags` for the summary to derive received + the next stage.
 */
jest.mock("@/lib/supabase", () => ({
  supabase: () => {
    throw new Error("no network in this test");
  },
}));

import { summarizeComplianceTrip } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripInputs } from "@/features/tripCompliance/tripCompliance.types";
import {
  applyComplianceVerified,
  reconcilePipelineTrips,
} from "@/features/tripCompliance/utils/compliancePipelinePatch.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { publishHardCopyPodState } from "@/lib/queries/invalidateHardCopyPodCaches";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClient } from "@tanstack/react-query";

const ORG = "org-1";

function inputsFor(tripId: string): ComplianceTripInputs {
  return {
    trip: { id: tripId, organization_id: ORG, status: "delivered", pod_received_at: null } as unknown as TripRow,
    documents: [],
    flags: {
      compliance_verified_at: "2026-09-20",
      compliance_verified_by: "u1",
      compliance_decision: "approved",
      compliance_exception_reason: null,
      compliance_outstanding_summary: null,
      compliance_declined_at: null,
      compliance_declined_by: null,
      compliance_decline_reason: null,
      pod_hard_copy_courier: null,
      pod_hard_copy_awb_number: null,
      pod_hard_copy_received_by: null,
      pod_received_at: null,
    },
    // postedAt at/after compliance_verified_at ("2026-09-20") — a genuinely
    // posted advance, per Change 1's postedAt gate.
    taggedAdvance: {
      amount: 1000,
      paymentMode: null,
      utr: null,
      paidAt: "2026-09-20",
      actorId: null,
      transactionId: "tx1",
      postedAt: "2026-09-20",
    },
    balance: null,
    vehicleDocuments: [],
    driverDocuments: [],
    vaultVehicleId: null,
  };
}

it("summary.trip carries the live verified / POD flags so payment prerequisites match the stage", () => {
  const base = inputsFor("t1");
  const inputs: ComplianceTripInputs = {
    ...base,
    trip: { ...base.trip, compliance_verified_at: null } as TripRow,
    taggedAdvance: null,
  };
  const summary = summarizeComplianceTrip(inputs);
  expect(summary.stage).toBe("compliance_verified");
  expect(summary.trip.compliance_verified_at).toBe("2026-09-20");
  expect(summary.trip.pod_received_at).toBeNull();

  const patched = applyComplianceVerified([{ ...inputs, flags: { ...inputs.flags!, compliance_verified_at: null } }], {
    tripId: "t1",
    actorId: "u2",
    at: "2026-10-01T11:00:00.000Z",
  });
  expect(summarizeComplianceTrip(patched[0]).trip.compliance_verified_at).toBe("2026-10-01T11:00:00.000Z");
});

it("POD logged outside Compliance → pipeline row derives received=true and Balance Pending", () => {
  const qc = new QueryClient();
  const inputs = [inputsFor("t1"), inputsFor("t2")];
  qc.setQueryData(queryKeys.tripCompliance.pipeline(ORG), inputs);
  qc.setQueryData(queryKeys.trips.finite(ORG), inputs.map((row) => row.trip));
  expect(summarizeComplianceTrip(inputs[0]).stage).toBe("hard_copy_pod_received");

  publishHardCopyPodState(qc, "t1", {
    status: "RECEIVED",
    receivedAt: "2026-09-29T10:00:00.000Z",
    courier: "BlueDart",
    awbNumber: "AWB1",
    receivedBy: "Ravi",
  } as never);

  const pipeline = qc.getQueryData<ComplianceTripInputs[]>(queryKeys.tripCompliance.pipeline(ORG))!;
  const patched = summarizeComplianceTrip(pipeline[0]);
  expect(patched.hardCopyPod).toEqual({
    received: true,
    receivedAt: "2026-09-29T10:00:00.000Z",
    courier: "BlueDart",
    awbNumber: "AWB1",
    receivedBy: "Ravi",
    ibond: false,
    lrNumbers: [],
    receivedLrNumbers: [],
  });
  expect(patched.stage).toBe("balance_pending");
  expect(pipeline[1]).toBe(inputs[1]);

  // The follow-up trips-list reconcile keeps the patched flags.
  const trips = qc.getQueryData<TripRow[]>(queryKeys.trips.finite(ORG))!;
  const reconciled = reconcilePipelineTrips(pipeline, trips).next;
  expect(summarizeComplianceTrip(reconciled[0]).stage).toBe("balance_pending");
});
