import {
  createDriverLedgerEntry,
  getDriverLedgerByTripId,
} from "@/features/drivers/services/drivers.service";
import { supabase } from "@/lib/supabase";
import {
  buildDriverCaptureDescription,
  toExchangePaymentMode,
  type DriverCaptureLane,
} from "@/features/drivers/utils/driverCapturePayment.util";
import {
  claimExchangePayment,
  newExchangeIdempotencyKey,
} from "@/features/marketplace/services/exchangePayments.service";
import type { TripRow } from "@/features/trips/services/trips.service";

export async function captureDriverTripPayment(input: {
  trip: Pick<TripRow, "id" | "organization_id">;
  amount: number;
  paymentModeId: string;
  reference?: string | null;
  paidOn?: string | null;
  lane: DriverCaptureLane;
  driverId: string;
  createdBy: string | null;
  tripDisplay: string;
}): Promise<{ error: Error | null }> {
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) return { error: new Error("Enter an amount to capture.") };

  if (input.lane === "marketplace") {
    const { error } = await claimExchangePayment({
      tripId: input.trip.id,
      amount,
      paymentMode: toExchangePaymentMode(input.paymentModeId),
      paymentReference: String(input.reference ?? "").trim() || null,
      paidOn: String(input.paidOn ?? "").trim().slice(0, 10) || null,
      idempotencyKey: newExchangeIdempotencyKey(),
    });
    return { error };
  }

  const orgId = String(input.trip.organization_id ?? "").trim();
  if (!orgId) return { error: new Error("Missing organization.") };
  if (!input.driverId) return { error: new Error("Missing driver.") };

  const description = buildDriverCaptureDescription({
    tripDisplay: input.tripDisplay,
    paymentModeId: input.paymentModeId,
    reference: input.reference,
    paidOn: input.paidOn,
  });

  let { error, row } = await createDriverLedgerEntry(
    orgId,
    input.driverId,
    amount,
    "settlement",
    {
      tripId: input.trip.id,
      createdBy: input.createdBy,
      description,
    },
  );
  if (error?.message?.includes("driver_ledger_created_by_fkey")) {
    const retry = await createDriverLedgerEntry(
      orgId,
      input.driverId,
      amount,
      "settlement",
      {
        tripId: input.trip.id,
        createdBy: null,
        description,
      },
    );
    error = retry.error;
    row = retry.row;
  }
  if (!error && row) {
    const saved = await getDriverLedgerByTripId(input.trip.id);
    const visible =
      !saved.error &&
      saved.entries.some(
        (entry) => entry.id === row?.id || (entry.type === "settlement" && Number(entry.amount) === amount),
      );
    if (visible) return { error: null };
  }

  const rpc = await supabase().rpc("driver_record_trip_settlement", {
    p_trip_id: input.trip.id,
    p_amount: amount,
    p_description: description,
  });
  const rpcMsg = String(rpc.error?.message ?? "").toLowerCase();
  const rpcUnavailable =
    !!rpc.error &&
    (rpc.error.code === "PGRST202" ||
      rpc.error.code === "42883" ||
      rpcMsg.includes("driver_record_trip_settlement") ||
      rpcMsg.includes("could not find the function"));
  if (!rpc.error) return { error: null };
  if (!rpcUnavailable) return { error: new Error(rpc.error.message) };
  return {
    error: error ?? new Error("Could not save this payment. The database did not keep it."),
  };
}
