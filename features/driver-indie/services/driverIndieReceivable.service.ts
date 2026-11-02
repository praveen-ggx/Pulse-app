import {
  acknowledgeDriverIndieOutbox,
  cancelDriverIndieOutbox,
  listPendingDriverIndieOutbox,
  markDriverIndieOutboxAttempted,
  rejectDriverIndieOutbox,
  rememberDriverIndieOutbox,
} from "@/features/driver-indie/offline/driverIndieOutbox";
import { isDriverIndieTransportError } from "@/features/driver-indie/offline/driverIndieOffline.util";
import {
  cancelLocalDriverIndieTripTag,
  listLocalDriverIndieTripTags,
  mergeDriverIndieParties,
  rememberLocalDriverIndieParty,
  rememberLocalDriverIndieTripTag,
} from "@/features/driver-indie/offline/driverIndieLocalBook";
import { flushDriverIndieOutbox } from "@/features/driver-indie/offline/driverIndieSync";
import type {
  DriverIndieCollection,
  DriverIndieParty,
  DriverIndieReceivable,
  DriverIndieReceivableListRow,
} from "@/features/driver-indie/types/driverIndieReceivable.types";
import { supabase } from "@/lib/supabase";

export type {
  DriverIndieCollection,
  DriverIndieParty,
  DriverIndieReceivable,
  DriverIndieReceivableListRow,
} from "@/features/driver-indie/types/driverIndieReceivable.types";

function rpcError(message: string): Error {
  const raw = message.toLowerCase();
  if (raw.includes("driver_indie_denied")) {
    return new Error("Independent DRIVER book is available only to a non-employee driver.");
  }
  if (raw.includes("driver_indie_marketplace_denied")) {
    return new Error("Marketplace trips stay on Pulse Exchange.");
  }
  if (raw.includes("driver_indie_party_denied")) {
    return new Error("That customer is not in your independent book.");
  }
  if (raw.includes("driver_indie_not_due")) {
    return new Error("Issue the receivable before collecting.");
  }
  if (raw.includes("driver_indie_billed_required") || raw.includes("driver_indie_amount_required")) {
    return new Error("Enter an amount greater than zero.");
  }
  return new Error(message);
}

export async function upsertDriverIndieParty(input: {
  name: string;
  phone?: string | null;
}): Promise<{ error: Error | null; party: DriverIndieParty | null; pending?: boolean }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { error: new Error("Enter a customer name."), party: null };
  const local = await rememberLocalDriverIndieParty(input);
  const queued = await rememberDriverIndieOutbox({
    kind: "upsert_party",
    payload: {
      localPartyId: local.localId,
      partyId: local.id,
      name,
      phone: input.phone ?? "",
    },
  });
  await markDriverIndieOutboxAttempted(queued.id);
  const { data, error } = await supabase().rpc("upsert_driver_indie_party" as never, {
    p_name: name,
    p_phone: input.phone ?? null,
  } as never);
  if (error) {
    if (isDriverIndieTransportError(error)) {
      return { error: null, party: local, pending: true };
    }
    await rejectDriverIndieOutbox(queued.id, error.message);
    return { error: rpcError(error.message), party: local, pending: true };
  }
  const row = data as { id?: string; name?: string; phone?: string | null } | null;
  if (row?.id) await acknowledgeDriverIndieOutbox(queued.id);
  return {
    error: row?.id ? null : new Error("Could not save customer."),
    party: row?.id
      ? { id: row.id, name: row.name || name, phone: row.phone }
      : local,
    pending: !row?.id,
  };
}

export async function listDriverIndieParties(): Promise<{
  error: Error | null;
  parties: DriverIndieParty[];
}> {
  const { data, error } = await supabase()
    .from("driver_indie_parties" as never)
    .select("id, name, phone")
    .order("created_at", { ascending: false });
  if (error) {
    if (isDriverIndieTransportError(error)) {
      return { error: null, parties: await mergeDriverIndieParties([]) };
    }
    return { error: rpcError(error.message), parties: await mergeDriverIndieParties([]) };
  }
  const server = ((data as DriverIndieParty[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Customer"),
    phone: row.phone ?? null,
  }));
  return { error: null, parties: await mergeDriverIndieParties(server) };
}

export async function tagDriverIndieTrip(input: {
  tripId: string;
  partyId: string;
  partyName: string;
}): Promise<{ error: Error | null; pending: boolean }> {
  const tripId = String(input.tripId ?? "").trim();
  const partyId = String(input.partyId ?? "").trim();
  if (!tripId) return { error: new Error("Missing trip."), pending: false };
  if (!partyId) return { error: new Error("Select a customer."), pending: false };
  await rememberLocalDriverIndieTripTag({ tripId, partyId, partyName: input.partyName });
  await rememberDriverIndieOutbox({
    kind: "tag",
    payload: { tripId, partyId, name: input.partyName },
  });
  const flushed = await flushDriverIndieOutbox();
  const tag = (await listLocalDriverIndieTripTags()).find((row) => row.tripId === tripId);
  if (tag?.syncStatus === "rejected") {
    return { error: new Error(tag.lastError || "Could not sync tag."), pending: true };
  }
  return { error: null, pending: flushed.offline || tag?.syncStatus !== "synced" };
}

export async function cancelDriverIndieTripTag(tripId: string): Promise<void> {
  const pending = await listPendingDriverIndieOutbox();
  await Promise.all(
    pending
      .filter((item) => item.kind === "tag" && String(item.payload.tripId ?? "") === tripId)
      .map((item) => cancelDriverIndieOutbox(item.id)),
  );
  await cancelLocalDriverIndieTripTag(tripId);
}

export async function issueDriverIndieReceivable(input: {
  partyId: string;
  billed: number;
  idempotencyKey: string;
  tripId?: string | null;
  partyLabel?: string | null;
}): Promise<{
  error: Error | null;
  receivableId: string | null;
  replayed: boolean;
  pending?: boolean;
}> {
  const remembered = await rememberDriverIndieOutbox({
    kind: "issue",
    idempotencyKey: input.idempotencyKey,
    payload: {
      partyId: input.partyId,
      billed: Math.round(input.billed),
      tripId: input.tripId ?? "",
      partyLabel: input.partyLabel ?? "",
    },
  });
  await markDriverIndieOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("issue_driver_indie_receivable" as never, {
    p_party_id: input.partyId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: remembered.idempotencyKey,
    p_trip_id: input.tripId ?? null,
    p_party_label: input.partyLabel ?? null,
  } as never);
  if (error) {
    if (isDriverIndieTransportError(error)) {
      return { error: null, receivableId: null, replayed: false, pending: true };
    }
    await rejectDriverIndieOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), receivableId: null, replayed: false, pending: true };
  }
  await acknowledgeDriverIndieOutbox(remembered.id);
  const row = data as { id?: string; replayed?: boolean } | null;
  return { error: null, receivableId: row?.id ?? null, replayed: row?.replayed === true };
}

export async function collectDriverIndieReceivable(input: {
  receivableId: string;
  amount: number;
  paymentMode: string;
  idempotencyKey: string;
  reference?: string | null;
  paidOn?: string | null;
}): Promise<{ error: Error | null; replayed: boolean; pending?: boolean }> {
  const remembered = await rememberDriverIndieOutbox({
    kind: "collect",
    idempotencyKey: input.idempotencyKey,
    payload: {
      receivableId: input.receivableId,
      amount: Math.round(input.amount),
      paymentMode: input.paymentMode,
      reference: input.reference ?? "",
      paidOn: input.paidOn ?? "",
    },
  });
  await markDriverIndieOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("collect_driver_indie_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_amount: Math.round(input.amount),
    p_payment_mode: input.paymentMode,
    p_idempotency_key: remembered.idempotencyKey,
    p_reference: input.reference ?? null,
    p_paid_on: input.paidOn ?? null,
  } as never);
  if (error) {
    if (isDriverIndieTransportError(error)) {
      return { error: null, replayed: false, pending: true };
    }
    await rejectDriverIndieOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), replayed: false, pending: true };
  }
  await acknowledgeDriverIndieOutbox(remembered.id);
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
}

export async function listDriverIndieReceivableBook(): Promise<{
  error: Error | null;
  rows: DriverIndieReceivableListRow[];
}> {
  const { data, error } = await supabase()
    .from("driver_indie_receivables" as never)
    .select(
      "id, owner_user_id, party_id, billed_amount, billed_version, status, operational_trip_id, party_label, issued_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (isDriverIndieTransportError(error)) return { error: null, rows: [] };
    return { error: rpcError(error.message), rows: [] };
  }
  const { data: cols, error: colErr } = await supabase()
    .from("driver_indie_collections" as never)
    .select("receivable_id, amount");
  if (colErr && !isDriverIndieTransportError(colErr)) {
    return { error: rpcError(colErr.message), rows: [] };
  }
  const collectedById = new Map<string, number>();
  for (const row of (cols as Array<{ receivable_id: string; amount: number }> | null) ?? []) {
    const id = String(row.receivable_id);
    collectedById.set(id, (collectedById.get(id) ?? 0) + Math.max(0, Math.round(Number(row.amount) || 0)));
  }
  return {
    error: null,
    rows: ((data as DriverIndieReceivable[] | null) ?? [])
      .filter((row) => row.status !== "void")
      .map((receivable) => {
        const collected = collectedById.get(receivable.id) ?? 0;
        return {
          receivable,
          collected,
          outstanding: Math.max(0, Math.round(Number(receivable.billed_amount) || 0) - collected),
        };
      }),
  };
}

export async function getDriverIndieReceivableForTrip(tripId: string): Promise<{
  error: Error | null;
  receivable: DriverIndieReceivable | null;
}> {
  const id = tripId.trim();
  if (!id) return { error: null, receivable: null };
  const { data, error } = await supabase()
    .from("driver_indie_receivables" as never)
    .select(
      "id, owner_user_id, party_id, billed_amount, billed_version, status, operational_trip_id, party_label, issued_at",
    )
    .eq("operational_trip_id", id)
    .neq("status", "void")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isDriverIndieTransportError(error)) return { error: null, receivable: null };
    return { error: rpcError(error.message), receivable: null };
  }
  return { error: null, receivable: (data as DriverIndieReceivable | null) ?? null };
}

export function driverIndieIssueKey(tripId: string): string {
  return `driver-indie-issue:${tripId.trim()}`;
}

export async function correctDriverIndieReceivable(input: {
  receivableId: string;
  billed: number;
  idempotencyKey: string;
  reason?: string | null;
}): Promise<{ error: Error | null; replayed: boolean; pending?: boolean }> {
  const remembered = await rememberDriverIndieOutbox({
    kind: "correct",
    idempotencyKey: input.idempotencyKey,
    payload: {
      receivableId: input.receivableId,
      billed: Math.round(input.billed),
      reason: input.reason ?? "",
    },
  });
  await markDriverIndieOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("correct_driver_indie_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: remembered.idempotencyKey,
    p_reason: input.reason ?? null,
  } as never);
  if (error) {
    if (isDriverIndieTransportError(error)) {
      return { error: null, replayed: false, pending: true };
    }
    await rejectDriverIndieOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), replayed: false, pending: true };
  }
  await acknowledgeDriverIndieOutbox(remembered.id);
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
}

export async function listDriverIndieReceivableVersions(receivableId: string): Promise<{
  error: Error | null;
  versions: Array<{
    id: string;
    receivable_id: string;
    version: number;
    billed_amount: number;
    reason: string | null;
    created_at: string;
  }>;
}> {
  const { data, error } = await supabase()
    .from("driver_indie_receivable_versions" as never)
    .select("id, receivable_id, version, billed_amount, reason, created_at")
    .eq("receivable_id", receivableId)
    .order("version", { ascending: true });
  if (error) {
    if (isDriverIndieTransportError(error)) return { error: null, versions: [] };
    return { error: rpcError(error.message), versions: [] };
  }
  return { error: null, versions: (data as Array<{
    id: string;
    receivable_id: string;
    version: number;
    billed_amount: number;
    reason: string | null;
    created_at: string;
  }> | null) ?? [] };
}

export async function listDriverIndieCollections(receivableId: string): Promise<{
  error: Error | null;
  rows: DriverIndieCollection[];
}> {
  const { data, error } = await supabase()
    .from("driver_indie_collections" as never)
    .select("id, receivable_id, amount, payment_mode, reference, paid_on, created_at")
    .eq("receivable_id", receivableId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isDriverIndieTransportError(error)) return { error: null, rows: [] };
    return { error: rpcError(error.message), rows: [] };
  }
  return { error: null, rows: (data as DriverIndieCollection[] | null) ?? [] };
}

export async function listPendingDriverIndieCollections(receivableId?: string | null) {
  const pending = await listPendingDriverIndieOutbox();
  return pending.filter((item) => {
    if (item.kind !== "collect") return false;
    if (!receivableId) return true;
    return String(item.payload.receivableId ?? "") === receivableId;
  });
}
