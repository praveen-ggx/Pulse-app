import {
  collectDcoSelfReceivable,
  dcoSelfIssueKey,
  getDcoSelfReceivableForTrip,
  issueDcoSelfReceivable,
  listDcoSelfReceivableBook,
  upsertDcoSelfParty,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import {
  collectDriverIndieReceivable,
  driverIndieIssueKey,
  getDriverIndieReceivableForTrip,
  issueDriverIndieReceivable,
  listDriverIndieReceivableBook,
  upsertDriverIndieParty,
} from "@/features/driver-indie/services/driverIndieReceivable.service";
import {
  createDriverLedgerEntry,
  findDriverLedgerByReference,
} from "@/features/drivers/services/drivers.service";
import { supabase } from "@/lib/supabase";
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
  book?: "dco_self" | "driver_indie" | "employer";
  /** Prefer the receivable already resolved on the capture screen (offline-safe). */
  receivableId?: string | null;
  /** Tagged party name. Used to open the book receivable when collect is the first write. */
  partyName?: string | null;
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
        : input.book === "driver_indie"
          ? collectIndieOnce(input, amount, key)
          : insertLedgerOnce(input, amount, key);
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (inFlight.get(key) === run) inFlight.delete(key);
  }
}

function bookCallMissing(error: { code?: string; message?: string } | Error | null | undefined): boolean {
  if (!error) return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
}

function isServerPartyId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

type BookEnsure = { receivableId: string | null; unavailable: boolean; error: Error | null };

async function ensureSelfReceivable(
  tripId: string,
  partyName: string,
  amount: number,
): Promise<BookEnsure> {
  const found = await getDcoSelfReceivableForTrip(tripId);
  if (found.receivable?.id) {
    return { receivableId: found.receivable.id, unavailable: false, error: null };
  }
  if (found.error) {
    return {
      receivableId: null,
      unavailable: bookCallMissing(found.error),
      error: bookCallMissing(found.error) ? null : found.error,
    };
  }
  const name = partyName.trim();
  if (!name) {
    return { receivableId: null, unavailable: false, error: new Error("Tag the party before collecting.") };
  }
  const upserted = await upsertDcoSelfParty({ name });
  const partyId = String(upserted.party?.id ?? "").trim();
  if (!isServerPartyId(partyId) || upserted.pending) {
    if (upserted.error && !bookCallMissing(upserted.error)) {
      return { receivableId: null, unavailable: false, error: upserted.error };
    }
    return { receivableId: null, unavailable: true, error: null };
  }
  const issued = await issueDcoSelfReceivable({
    partyBId: partyId,
    billed: amount,
    idempotencyKey: dcoSelfIssueKey(tripId),
    tripId,
    partyALabel: name,
  });
  if (issued.receivableId) {
    return { receivableId: issued.receivableId, unavailable: false, error: null };
  }
  const again = await getDcoSelfReceivableForTrip(tripId);
  if (again.receivable?.id) {
    return { receivableId: again.receivable.id, unavailable: false, error: null };
  }
  if (issued.pending || (issued.error && bookCallMissing(issued.error))) {
    return { receivableId: null, unavailable: true, error: null };
  }
  return { receivableId: null, unavailable: false, error: issued.error };
}

async function ensureIndieReceivable(
  tripId: string,
  partyName: string,
  amount: number,
): Promise<BookEnsure> {
  const found = await getDriverIndieReceivableForTrip(tripId);
  if (found.receivable?.id) {
    return { receivableId: found.receivable.id, unavailable: false, error: null };
  }
  if (found.error) {
    return {
      receivableId: null,
      unavailable: bookCallMissing(found.error),
      error: bookCallMissing(found.error) ? null : found.error,
    };
  }
  const name = partyName.trim();
  if (!name) {
    return { receivableId: null, unavailable: false, error: new Error("Tag the party before collecting.") };
  }
  const upserted = await upsertDriverIndieParty({ name });
  const partyId = String(upserted.party?.id ?? "").trim();
  if (!isServerPartyId(partyId) || upserted.pending) {
    if (upserted.error && !bookCallMissing(upserted.error)) {
      return { receivableId: null, unavailable: false, error: upserted.error };
    }
    return { receivableId: null, unavailable: true, error: null };
  }
  const issued = await issueDriverIndieReceivable({
    partyId,
    billed: amount,
    idempotencyKey: driverIndieIssueKey(tripId),
    tripId,
    partyLabel: name,
  });
  if (issued.receivableId) {
    return { receivableId: issued.receivableId, unavailable: false, error: null };
  }
  const again = await getDriverIndieReceivableForTrip(tripId);
  if (again.receivable?.id) {
    return { receivableId: again.receivable.id, unavailable: false, error: null };
  }
  if (issued.pending || (issued.error && bookCallMissing(issued.error))) {
    return { receivableId: null, unavailable: true, error: null };
  }
  return { receivableId: null, unavailable: false, error: issued.error };
}

async function collectIndieOnce(
  input: {
    trip: Pick<TripRow, "id" | "organization_id">;
    paymentModeId: string;
    reference?: string | null;
    paidOn?: string | null;
    receivableId?: string | null;
    partyName?: string | null;
    driverId: string;
    createdBy: string | null;
    tripDisplay: string;
    lane?: DriverCaptureLane;
  },
  amount: number,
  key: string,
): Promise<{ error: Error | null }> {
  let receivableId = String(input.receivableId ?? "").trim();
  if (!receivableId) {
    const ensured = await ensureIndieReceivable(input.trip.id, String(input.partyName ?? ""), amount);
    if (ensured.unavailable) return insertLedgerOnce(input, amount, key);
    if (ensured.error) return { error: ensured.error };
    receivableId = String(ensured.receivableId ?? "").trim();
  }
  if (!receivableId) {
    return { error: new Error("Tag the party before collecting.") };
  }
  const collected = await collectDriverIndieReceivable({
    receivableId,
    amount,
    paymentMode: input.paymentModeId,
    idempotencyKey: key,
    reference: input.reference ?? null,
    paidOn: input.paidOn ?? null,
  });
  if (collected.error && bookCallMissing(collected.error)) return insertLedgerOnce(input, amount, key);
  return { error: collected.error };
}

async function collectSelfOnce(
  input: {
    trip: Pick<TripRow, "id" | "organization_id">;
    paymentModeId: string;
    reference?: string | null;
    paidOn?: string | null;
    receivableId?: string | null;
    partyName?: string | null;
    driverId: string;
    createdBy: string | null;
    tripDisplay: string;
    lane?: DriverCaptureLane;
  },
  amount: number,
  key: string,
): Promise<{ error: Error | null }> {
  let receivableId = String(input.receivableId ?? "").trim();
  if (!receivableId) {
    const ensured = await ensureSelfReceivable(input.trip.id, String(input.partyName ?? ""), amount);
    if (ensured.unavailable) return insertLedgerOnce(input, amount, key);
    if (ensured.error) return { error: ensured.error };
    receivableId = String(ensured.receivableId ?? "").trim();
  }
  if (!receivableId) {
    return { error: new Error("Tag the party before collecting.") };
  }
  const collected = await collectDcoSelfReceivable({
    receivableId,
    amount,
    paymentMode: input.paymentModeId,
    idempotencyKey: key,
    reference: input.reference ?? null,
    paidOn: input.paidOn ?? null,
  });
  if (collected.error && bookCallMissing(collected.error)) return insertLedgerOnce(input, amount, key);
  return { error: collected.error };
}

/** Collected amounts on the DCO Self and independent books, keyed by trip. */
export async function receivedByTripFromDriverBooks(): Promise<Record<string, number>> {
  const [selfBook, indieBook] = await Promise.all([
    listDcoSelfReceivableBook().catch(() => ({ error: new Error("unavailable"), rows: [] })),
    listDriverIndieReceivableBook().catch(() => ({ error: new Error("unavailable"), rows: [] })),
  ]);
  const out: Record<string, number> = {};
  const add = (tripId: string | null | undefined, amount: number) => {
    const id = String(tripId ?? "").trim();
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!id || n <= 0) return;
    out[id] = (out[id] ?? 0) + n;
  };
  for (const row of selfBook.rows) add(row.receivable.operational_trip_id, row.collected);
  for (const row of indieBook.rows) add(row.receivable.operational_trip_id, row.collected);
  return out;
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

  let { error, row } = await createDriverLedgerEntry(
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
    row = retry.row;
  }
  // The insert returned the row, so the payment is already stored.
  if (!error && row) return { error: null };

  const rpc = await supabase().rpc("driver_record_trip_settlement" as never, {
    p_trip_id: input.trip.id,
    p_amount: amount,
    p_description: description,
  } as never);
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
