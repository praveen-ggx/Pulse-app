import { supabase } from "@/lib/supabase";
import { appendTripOperationalTimelineEventSafe } from "../timeline/timelineEvents.service";

export type DriverExpenseEntryKind = "fuel" | "toll" | "other";

type ExpenseRow = {
  id: string;
  trip_id: string;
  status: string | null;
  payment_owner: string | null;
  approval_state: string | null;
  posting_state: string | null;
  entered_by: string | null;
  amount_inr: number | null;
};

function tableForKind(kind: DriverExpenseEntryKind): string {
  switch (kind) {
    case "fuel":
      return "trip_fuel_entries";
    case "toll":
      return "trip_toll_entries";
    case "other":
      return "trip_other_expenses";
  }
}

function sourceTypeForKind(kind: DriverExpenseEntryKind): string {
  switch (kind) {
    case "fuel":
      return "fuel";
    case "toll":
      return "toll";
    case "other":
      return "trip_expense";
  }
}

export function parseDriverExpenseEventId(
  eventId: string,
): { kind: DriverExpenseEntryKind; entryId: string } | null {
  const [kind, entryId] = eventId.split(":");
  if (!entryId?.trim()) return null;
  if (kind !== "fuel" && kind !== "toll" && kind !== "other") return null;
  return { kind, entryId };
}

function isPendingDriverReimbursement(row: ExpenseRow): boolean {
  if (String(row.status ?? "").toLowerCase() === "voided") return false;
  if (String(row.payment_owner ?? "").toLowerCase() !== "driver") return false;
  const approval = String(row.approval_state ?? "").toLowerCase();
  if (approval === "approved" || approval === "settled" || approval === "rejected") {
    return false;
  }
  const posting = String(row.posting_state ?? "").toLowerCase();
  if (posting === "posted") return false;
  return true;
}

async function loadExpenseRow(
  kind: DriverExpenseEntryKind,
  entryId: string,
): Promise<{ error: Error | null; row: ExpenseRow | null }> {
  const { data, error } = await supabase()
    .from(tableForKind(kind))
    .select("id,trip_id,status,payment_owner,approval_state,posting_state,entered_by,amount_inr")
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), row: null };
  if (!data) return { error: new Error("Expense request not found"), row: null };
  return { error: null, row: data as ExpenseRow };
}

export async function cancelDriverExpenseRequest(input: {
  kind: DriverExpenseEntryKind;
  entryId: string;
  tripId: string;
  actorUserId: string | null;
  organizationId?: string | null;
}): Promise<{ error: Error | null }> {
  const loaded = await loadExpenseRow(input.kind, input.entryId);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? new Error("Not found") };
  const row = loaded.row;
  if (String(row.trip_id) !== input.tripId) {
    return { error: new Error("Expense belongs to a different trip") };
  }
  if (input.actorUserId && row.entered_by && row.entered_by !== input.actorUserId) {
    return { error: new Error("You can only cancel your own expense requests") };
  }
  if (!isPendingDriverReimbursement(row)) {
    return { error: new Error("This request can no longer be cancelled") };
  }

  const { error } = await supabase().rpc("cancel_my_trip_expense", {
    p_kind: input.kind,
    p_id: input.entryId,
  });

  if (error) return { error: new Error(error.message) };

  await appendTripOperationalTimelineEventSafe({
    organizationId: input.organizationId ?? null,
    tripId: input.tripId,
    eventType: "approval_changed",
    sourceType: sourceTypeForKind(input.kind),
    sourceId: input.entryId,
    actorUserId: input.actorUserId,
    payload: {
      action: "driver_cancelled",
      amountInr: Number(row.amount_inr ?? 0),
    },
  });

  return { error: null };
}

function friendlyRemindError(message: string): string {
  const tooSoon = /reminder_too_soon:\s*(.+)$/i.exec(message);
  if (tooSoon) return `You already reminded the fleet. Try again after ${tooSoon[1].trim()}.`;
  const coded = /^(?:not_your_expense|not_awaiting_fleet|expense_not_found|no_fleet):\s*(.+)$/i.exec(message);
  if (coded) return coded[1].trim();
  return message;
}

export async function remindDriverExpenseRequest(input: {
  kind: DriverExpenseEntryKind;
  entryId: string;
  tripId: string;
  actorUserId: string | null;
  organizationId?: string | null;
}): Promise<{ error: Error | null }> {
  const loaded = await loadExpenseRow(input.kind, input.entryId);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? new Error("Not found") };
  const row = loaded.row;
  if (String(row.trip_id) !== input.tripId) {
    return { error: new Error("Expense belongs to a different trip") };
  }
  if (input.actorUserId && row.entered_by && row.entered_by !== input.actorUserId) {
    return { error: new Error("You can only remind on your own expense requests") };
  }
  if (!isPendingDriverReimbursement(row)) {
    return { error: new Error("This request is no longer awaiting fleet approval") };
  }

  // Server checks ownership + pending state again, limits to one reminder per
  // 6 hours, and sends the fleet a bell notification
  // (20271125125057_driver_expense_reminder_notify.sql).
  const { error } = await supabase().rpc("remind_driver_expense" as never, {
    p_expense_kind: input.kind,
    p_entry_id: input.entryId,
  } as never);

  if (error) return { error: new Error(friendlyRemindError(error.message)) };
  const now = new Date().toISOString();

  await appendTripOperationalTimelineEventSafe({
    organizationId: input.organizationId ?? null,
    tripId: input.tripId,
    eventType: "reimbursement_flagged",
    sourceType: sourceTypeForKind(input.kind),
    sourceId: input.entryId,
    actorUserId: input.actorUserId,
    payload: {
      action: "driver_reminded",
      amountInr: Number(row.amount_inr ?? 0),
      remindedAt: now,
    },
  });

  return { error: null };
}
