import { createDriverLedgerEntry } from "@/features/drivers/services/drivers.service";
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

  let { error } = await createDriverLedgerEntry(
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
  }
  return { error };
}
