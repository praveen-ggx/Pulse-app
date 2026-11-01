import {
  collectDcoSelfReceivable,
  getDcoSelfReceivableForTrip,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import {
  createDriverLedgerEntry,
  findDriverLedgerByReference,
} from "@/features/drivers/services/drivers.service";
import {
  buildDriverCaptureDescription,
  stableDriverCaptureKey,
  toExchangePaymentMode,
  type DriverCaptureLane,
} from "@/features/drivers/utils/driverCapturePayment.util";
import { claimExchangePayment } from "@/features/marketplace/services/exchangePayments.service";
import type { TripRow } from "@/features/trips/services/trips.service";

const inFlight = new Map<string, Promise<{ error: Error | null }>>();

export async function captureDriverTripPayment(input: {
  trip: Pick<TripRow, "id" | "organization_id">;
  amount: number;
  paymentModeId: string;
  reference?: string | null;
  paidOn?: string | null;
  lane: DriverCaptureLane;
  book?: "dco_self" | "employer";
  driverId: string;
  createdBy: string | null;
  tripDisplay: string;
}): Promise<{ error: Error | null }> {
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) return { error: new Error("Enter an amount to capture.") };

  const key = stableDriverCaptureKey({
    lane: input.lane,
    tripId: input.trip.id,
    amount,
    paymentModeId: input.paymentModeId,
    reference: input.reference,
    paidOn: input.paidOn,
  });
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run =
    input.lane === "marketplace"
      ? claimMarketplaceOnce(input, amount, key)
      : input.book === "dco_self"
        ? collectSelfOnce(input, amount, key)
        : insertLedgerOnce(input, amount, key);
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (inFlight.get(key) === run) inFlight.delete(key);
  }
}

async function collectSelfOnce(
  input: {
    trip: Pick<TripRow, "id">;
    paymentModeId: string;
    reference?: string | null;
    paidOn?: string | null;
  },
  amount: number,
  key: string,
): Promise<{ error: Error | null }> {
  const found = await getDcoSelfReceivableForTrip(input.trip.id);
  if (found.error) return { error: found.error };
  if (!found.receivable?.id) {
    return { error: new Error("Issue the receivable before collecting.") };
  }
  const { error } = await collectDcoSelfReceivable({
    receivableId: found.receivable.id,
    amount,
    paymentMode: input.paymentModeId,
    idempotencyKey: key,
    reference: input.reference ?? null,
    paidOn: input.paidOn ?? null,
  });
  return { error };
}

async function claimMarketplaceOnce(
  input: {
    trip: Pick<TripRow, "id">;
    paymentModeId: string;
    reference?: string | null;
    paidOn?: string | null;
  },
  amount: number,
  key: string,
): Promise<{ error: Error | null }> {
  const { error } = await claimExchangePayment({
    tripId: input.trip.id,
    amount,
    paymentMode: toExchangePaymentMode(input.paymentModeId),
    paymentReference: String(input.reference ?? "").trim() || null,
    paidOn: String(input.paidOn ?? "").trim().slice(0, 10) || null,
    idempotencyKey: key,
  });
  return { error };
}

async function insertLedgerOnce(
  input: {
    trip: Pick<TripRow, "id" | "organization_id">;
    paymentModeId: string;
    reference?: string | null;
    paidOn?: string | null;
    driverId: string;
    createdBy: string | null;
    tripDisplay: string;
    lane?: DriverCaptureLane;
  },
  amount: number,
  key: string,
): Promise<{ error: Error | null }> {
  const orgId = String(input.trip.organization_id ?? "").trim();
  if (!orgId) return { error: new Error("Missing organization.") };
  if (!input.driverId) return { error: new Error("Missing driver.") };

  const existing = await findDriverLedgerByReference(orgId, "dco_capture", key);
  if (existing.row) return { error: null };
  if (existing.error) return { error: existing.error };

  const description = buildDriverCaptureDescription({
    tripDisplay: input.tripDisplay,
    paymentModeId: input.paymentModeId,
    reference: input.reference,
    paidOn: input.paidOn,
    lane: input.lane,
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
      referenceType: "dco_capture",
      referenceId: key,
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
        referenceType: "dco_capture",
        referenceId: key,
      },
    );
    error = retry.error;
  }
  return { error };
}
