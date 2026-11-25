import { getTripOperationalDisplay } from "@/features/operations/display";
import { listOperationsOutbox } from "@/features/trips/operations/offline/outbox";
import { supabase } from "@/lib/supabase";
import { buildQueueSections, compareQueueItems } from "../selectors/buildQueueSections";
import type {
  OperationalQueueItem,
  OperationalQueueKind,
  QueueSectionPage,
} from "../types";

interface FuelRow {
  id: string;
  trip_id: string;
  amount_inr: number | null;
  approval_state: string | null;
  payment_owner: string | null;
  posting_state: string | null;
  retry_count: number | null;
  reimbursement_state: string | null;
  entered_at: string;
  posting_error: string | null;
  trips: Array<{
    id: string;
    organization_id: string;
    trip_operational_code: string | null;
    trip_code: string | null;
    display_trip_id: string | null;
    trip_number: string | null;
    status: string | null;
    trip_payout_mode: string | null;
    supplier_id: string | null;
    vehicle_id: string | null;
  }> | null;
}

type TollRow = FuelRow;

function toQueueKinds(input: {
  sourceType: "fuel" | "toll" | "sync";
  approvalState: string | null;
  postingState: string | null;
  reimbursementState: string | null;
  paymentOwner: string | null;
  retryCount: number;
  postingError: string | null;
  isAssetTrip: boolean;
}): OperationalQueueItem["queueKinds"] {
  if (input.sourceType === "sync") return ["offline_sync_failure"];
  const kinds: OperationalQueueItem["queueKinds"] = [];
  const approval = String(input.approvalState ?? "").toLowerCase();
  const posting = String(input.postingState ?? "").toLowerCase();
  const reimbursement = String(input.reimbursementState ?? "").toLowerCase();
  const owner = String(input.paymentOwner ?? "").toLowerCase();
  const postingError = String(input.postingError ?? "").toLowerCase();
  if (approval === "reported" || approval === "review_pending") {
    kinds.push("pending_approval");
  }
  if (
    owner === "driver" &&
    (reimbursement === "reported" ||
      reimbursement === "approved" ||
      reimbursement === "reimbursement_pending")
  ) {
    kinds.push("reimbursement_required");
  }
  if (posting === "failed" || input.retryCount > 0) {
    kinds.push("posting_retry_failure");
  }
  if (
    input.isAssetTrip &&
    (posting === "approved" ||
      (approval === "approved" && posting !== "posted") ||
      postingError.includes("duplicate"))
  ) {
    kinds.push("reconciliation_mismatch");
  }
  return kinds;
}

function mapOperationalRow(
  row: FuelRow | TollRow,
  sourceType: "fuel" | "toll",
): OperationalQueueItem {
  const trip = row.trips;
  const activeTrip = Array.isArray(trip) ? (trip[0] ?? null) : trip;
  const isAssetTrip =
    activeTrip != null &&
    (String(activeTrip.trip_payout_mode ?? "").toLowerCase() === "asset" ||
      (!activeTrip.trip_payout_mode && !activeTrip.supplier_id));
  return {
    id: `${sourceType}:${row.id}`,
    sourceType,
    sourceId: row.id,
    trip:
      activeTrip == null
        ? null
        : {
            tripId: activeTrip.id,
            organizationId: activeTrip.organization_id,
            tripLabel: getTripOperationalDisplay({
              trip_operational_code: activeTrip.trip_operational_code,
              trip_code: activeTrip.trip_code,
              display_trip_id: activeTrip["display_trip_id"],
              trip_number: activeTrip["trip_number"],
            }),
            tripStatus: activeTrip.status,
            tripPayoutMode: activeTrip.trip_payout_mode,
            supplierId: activeTrip.supplier_id,
            vehicleId: activeTrip.vehicle_id,
          },
    amountInr: Number(row.amount_inr ?? 0),
    enteredAt: row.entered_at,
    approvalState: row.approval_state,
    postingState: row.posting_state,
    reimbursementState: (row.reimbursement_state as OperationalQueueItem["reimbursementState"]) ?? null,
    retryCount: Math.max(0, Number(row.retry_count ?? 0) || 0),
    paymentOwner: row.payment_owner,
    postingError: row.posting_error,
    queueKinds: toQueueKinds({
      sourceType,
      approvalState: row.approval_state,
      postingState: row.posting_state,
      reimbursementState: row.reimbursement_state,
      paymentOwner: row.payment_owner,
      retryCount: Math.max(0, Number(row.retry_count ?? 0) || 0),
      postingError: row.posting_error,
      isAssetTrip,
    }),
  };
}

/**
 * Latest driver "Remind" per expense (20271125125057). Fail-soft: without the
 * table (migration not applied) the queue keeps its entered-time order.
 */
async function attachDriverReminders(
  organizationId: string,
  items: OperationalQueueItem[],
): Promise<void> {
  const ids = items.map((item) => item.sourceId);
  if (ids.length === 0) return;
  try {
    const { data, error } = await supabase()
      .from("driver_expense_reminders" as never)
      .select("expense_kind,entry_id,reminded_at")
      .eq("organization_id", organizationId)
      .in("entry_id", ids);
    if (error || !data) return;
    const latest = new Map<string, string>();
    for (const row of data as Array<{ expense_kind: string; entry_id: string; reminded_at: string }>) {
      const key = `${row.expense_kind}:${row.entry_id}`;
      const prev = latest.get(key);
      if (!prev || +new Date(row.reminded_at) > +new Date(prev)) latest.set(key, row.reminded_at);
    }
    for (const item of items) item.remindedAt = latest.get(item.id) ?? null;
  } catch {
    // Ordering hint only; never block the queue.
  }
}

export async function getOperationsControlCenterPage(input: {
  organizationId: string;
  offset?: number;
  limit?: number;
}): Promise<{ error: Error | null; page: QueueSectionPage | null }> {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(20, input.limit ?? 40));
  const to = offset + limit - 1;
  const selectFields =
    "id,trip_id,amount_inr,approval_state,payment_owner,posting_state,retry_count,reimbursement_state,entered_at,posting_error,trips!inner(id,organization_id,trip_operational_code,trip_code,display_trip_id,trip_number,status,trip_payout_mode,supplier_id,vehicle_id)";
  const [fuelRes, tollRes, outbox] = await Promise.all([
    supabase()
      .from("trip_fuel_entries")
      .select(selectFields)
      .eq("expense_context", "employer")
      .eq("employer_org_id", input.organizationId)
      .order("entered_at", { ascending: false })
      .range(offset, to),
    supabase()
      .from("trip_toll_entries")
      .select(selectFields)
      .eq("expense_context", "employer")
      .eq("employer_org_id", input.organizationId)
      .order("entered_at", { ascending: false })
      .range(offset, to),
    listOperationsOutbox(),
  ]);
  if (fuelRes.error) return { error: new Error(fuelRes.error.message), page: null };
  if (tollRes.error) return { error: new Error(tollRes.error.message), page: null };
  const fuelItems = (fuelRes.data ?? []).map((row) =>
    mapOperationalRow(row as FuelRow, "fuel"),
  );
  const tollItems = (tollRes.data ?? []).map((row) =>
    mapOperationalRow(row as TollRow, "toll"),
  );
  await attachDriverReminders(input.organizationId, [...fuelItems, ...tollItems]);
  const syncFailures = outbox
    .filter((entry) => entry.status === "failed")
    .map((entry): OperationalQueueItem => ({
      id: `sync:${entry.id}`,
      sourceType: "sync" as const,
      sourceId: entry.id,
      trip: null,
      amountInr: 0,
      enteredAt: entry.createdAt,
      approvalState: null,
      postingState: null,
      reimbursementState: null,
      retryCount: Math.max(0, Number(entry.retryCount ?? 0) || 0),
      paymentOwner: null,
      postingError: entry.lastError ?? null,
      queueKinds: ["offline_sync_failure"] as OperationalQueueKind[],
    }));
  const merged = [...fuelItems, ...tollItems, ...syncFailures]
    .filter((row) => row.queueKinds.length > 0)
    .sort(compareQueueItems);
  const sections = buildQueueSections(merged);
  const hasMore = (fuelRes.data?.length ?? 0) === limit || (tollRes.data?.length ?? 0) === limit;
  return {
    error: null,
    page: {
      sections,
      flatItems: merged,
      hasMore,
      nextOffset: offset + limit,
    },
  };
}
