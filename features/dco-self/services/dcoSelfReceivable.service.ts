import {
  acknowledgeDcoSelfOutbox,
  cancelDcoSelfOutbox,
  listPendingDcoSelfOutbox,
  markDcoSelfOutboxAttempted,
  rejectDcoSelfOutbox,
  rememberDcoSelfOutbox,
} from "@/features/dco-self/offline/dcoSelfOutbox";
import { isDcoSelfTransportError } from "@/features/dco-self/offline/dcoSelfOffline.util";
import {
  cancelLocalDcoSelfTripTag,
  listLocalDcoSelfTripTags,
  mergeDcoSelfParties,
  rememberLocalDcoSelfParty,
  rememberLocalDcoSelfTripTag,
} from "@/features/dco-self/offline/dcoSelfLocalBook";
import { flushDcoSelfOutbox } from "@/features/dco-self/offline/dcoSelfSync";
import type {
  DcoSelfCollection,
  DcoSelfParty,
  DcoSelfReceivable,
  DcoSelfReceivableListRow,
} from "@/features/dco-self/types/dcoSelfReceivable.types";
import { supabase } from "@/lib/supabase";

export type {
  DcoSelfCollection,
  DcoSelfParty,
  DcoSelfReceivable,
  DcoSelfReceivableListRow,
} from "@/features/dco-self/types/dcoSelfReceivable.types";

function rpcError(message: string): Error {
  const raw = message.toLowerCase();
  if (raw.includes("dco_self_denied") || raw.includes("dco_self_workspace_missing")) {
    return new Error("DCO Self is available only to an approved DCO who is not on an active fleet seat.");
  }
  if (raw.includes("dco_self_marketplace_denied")) {
    return new Error("Marketplace trips stay on Pulse Exchange.");
  }
  if (raw.includes("dco_self_party_denied")) {
    return new Error("That party is not in your Self book.");
  }
  if (raw.includes("dco_self_fleet_trip_denied")) {
    return new Error("Fleet trips stay on your employer's ledger. Only DCO trips go on your Self book.");
  }
  if (raw.includes("dco_self_trip_already_issued")) {
    return new Error("This trip already has a receivable. Correct that one instead of issuing another.");
  }
  if (raw.includes("dco_self_trip_denied")) {
    return new Error("That trip is not one of your DCO trips.");
  }
  if (raw.includes("dco_self_not_due")) {
    return new Error("Issue the receivable before collecting.");
  }
  if (raw.includes("dco_self_billed_required") || raw.includes("dco_self_amount_required")) {
    return new Error("Enter an amount greater than zero.");
  }
  return new Error(message);
}

export async function upsertDcoSelfParty(input: {
  name: string;
  phone?: string | null;
}): Promise<{ error: Error | null; party: DcoSelfParty | null; pending?: boolean }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { error: new Error("Enter a party name."), party: null };
  const local = await rememberLocalDcoSelfParty(input);
  const queued = await rememberDcoSelfOutbox({
    kind: "upsert_party",
    payload: {
      localPartyId: local.localId,
      partyBId: local.id,
      name,
      phone: input.phone ?? "",
    },
  });
  await markDcoSelfOutboxAttempted(queued.id);
  const { data, error } = await supabase().rpc("upsert_dco_self_party" as never, {
    p_name: name,
    p_phone: input.phone ?? null,
  } as never);
  if (error) {
    if (isDcoSelfTransportError(error)) {
      return { error: null, party: local, pending: true };
    }
    await rejectDcoSelfOutbox(queued.id, error.message);
    return { error: rpcError(error.message), party: local, pending: true };
  }
  const row = data as { id?: string; name?: string; phone?: string | null } | null;
  if (row?.id) await acknowledgeDcoSelfOutbox(queued.id);
  return {
    error: row?.id ? null : new Error("Could not save party."),
    party: row?.id
      ? { id: row.id, name: row.name || name, phone: row.phone }
      : local,
    pending: !row?.id,
  };
}

export async function listDcoSelfParties(): Promise<{
  error: Error | null;
  parties: DcoSelfParty[];
}> {
  const { data, error } = await supabase()
    .from("dco_self_parties" as never)
    .select("id, name, phone")
    .order("created_at", { ascending: false });
  if (error) {
    if (isDcoSelfTransportError(error)) {
      return { error: null, parties: await mergeDcoSelfParties([]) };
    }
    return { error: rpcError(error.message), parties: await mergeDcoSelfParties([]) };
  }
  const server = ((data as DcoSelfParty[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Party"),
    phone: row.phone ?? null,
  }));
  return { error: null, parties: await mergeDcoSelfParties(server) };
}

/** Tag Party B on a trip without issuing Due. Local until Party B syncs. */
export async function tagDcoSelfTrip(input: {
  tripId: string;
  partyBId: string;
  partyName: string;
}): Promise<{ error: Error | null; pending: boolean }> {
  const tripId = String(input.tripId ?? "").trim();
  const partyBId = String(input.partyBId ?? "").trim();
  if (!tripId) return { error: new Error("Missing trip."), pending: false };
  if (!partyBId) return { error: new Error("Select Party B."), pending: false };
  await rememberLocalDcoSelfTripTag({
    tripId,
    partyBId,
    partyName: input.partyName,
  });
  await rememberDcoSelfOutbox({
    kind: "tag",
    payload: { tripId, partyBId, name: input.partyName },
  });
  const flushed = await flushDcoSelfOutbox();
  const tag = (await listLocalDcoSelfTripTags()).find((row) => row.tripId === tripId);
  if (tag?.syncStatus === "rejected") {
    return { error: new Error(tag.lastError || "Could not sync tag."), pending: true };
  }
  return { error: null, pending: flushed.offline || tag?.syncStatus !== "synced" };
}

export async function cancelDcoSelfTripTag(tripId: string): Promise<void> {
  const pending = await listPendingDcoSelfOutbox();
  await Promise.all(
    pending
      .filter((item) => item.kind === "tag" && String(item.payload.tripId ?? "") === tripId)
      .map((item) => cancelDcoSelfOutbox(item.id)),
  );
  await cancelLocalDcoSelfTripTag(tripId);
}

export async function issueDcoSelfReceivable(input: {
  partyBId: string;
  billed: number;
  idempotencyKey: string;
  tripId?: string | null;
  partyALabel?: string | null;
}): Promise<{
  error: Error | null;
  receivableId: string | null;
  replayed: boolean;
  pending?: boolean;
}> {
  const remembered = await rememberDcoSelfOutbox({
    kind: "issue",
    idempotencyKey: input.idempotencyKey,
    payload: {
      partyBId: input.partyBId,
      billed: Math.round(input.billed),
      tripId: input.tripId ?? "",
      partyALabel: input.partyALabel ?? "",
    },
  });
  await markDcoSelfOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("issue_dco_self_receivable" as never, {
    p_party_b_id: input.partyBId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: remembered.idempotencyKey,
    p_trip_id: input.tripId ?? null,
    p_party_a_label: input.partyALabel ?? null,
  } as never);
  if (error) {
    if (isDcoSelfTransportError(error)) {
      return { error: null, receivableId: null, replayed: false, pending: true };
    }
    await rejectDcoSelfOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), receivableId: null, replayed: false, pending: true };
  }
  await acknowledgeDcoSelfOutbox(remembered.id);
  const row = data as { id?: string; replayed?: boolean } | null;
  return { error: null, receivableId: row?.id ?? null, replayed: row?.replayed === true };
}

export async function collectDcoSelfReceivable(input: {
  receivableId: string;
  amount: number;
  paymentMode: string;
  idempotencyKey: string;
  reference?: string | null;
  paidOn?: string | null;
}): Promise<{ error: Error | null; replayed: boolean; pending?: boolean }> {
  const remembered = await rememberDcoSelfOutbox({
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
  await markDcoSelfOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("collect_dco_self_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_amount: Math.round(input.amount),
    p_payment_mode: input.paymentMode,
    p_idempotency_key: remembered.idempotencyKey,
    p_reference: input.reference ?? null,
    p_paid_on: input.paidOn ?? null,
  } as never);
  if (error) {
    if (isDcoSelfTransportError(error)) {
      return { error: null, replayed: false, pending: true };
    }
    await rejectDcoSelfOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), replayed: false, pending: true };
  }
  await acknowledgeDcoSelfOutbox(remembered.id);
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
}

export async function listPendingDcoSelfCollections(receivableId?: string | null) {
  const pending = await listPendingDcoSelfOutbox();
  return pending.filter((item) => {
    if (item.kind !== "collect") return false;
    if (!receivableId) return true;
    return String(item.payload.receivableId ?? "") === receivableId;
  });
}

export type DcoSelfReceivableVersion = {
  id: string;
  receivable_id: string;
  version: number;
  billed_amount: number;
  reason: string | null;
  created_at: string;
};

export async function listDcoSelfReceivables(): Promise<{
  error: Error | null;
  rows: DcoSelfReceivable[];
}> {
  const { data, error } = await supabase()
    .from("dco_self_receivables" as never)
    .select(
      "id, workspace_id, party_b_id, billed_amount, billed_version, status, operational_trip_id, party_a_label, issued_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { error: rpcError(error.message), rows: [] };
  return { error: null, rows: (data as DcoSelfReceivable[] | null) ?? [] };
}

export async function listDcoSelfReceivableBook(): Promise<{
  error: Error | null;
  rows: DcoSelfReceivableListRow[];
}> {
  const listed = await listDcoSelfReceivables();
  if (listed.error) return { error: listed.error, rows: [] };
  const { data, error } = await supabase()
    .from("dco_self_collections" as never)
    .select("receivable_id, amount");
  if (error) return { error: rpcError(error.message), rows: [] };
  const collectedById = new Map<string, number>();
  for (const row of (data as Array<{ receivable_id: string; amount: number }> | null) ?? []) {
    const id = String(row.receivable_id);
    collectedById.set(id, (collectedById.get(id) ?? 0) + Math.max(0, Math.round(Number(row.amount) || 0)));
  }
  return {
    error: null,
    rows: listed.rows
      .filter((row) => row.status !== "void")
      .map((receivable) => {
        const collected = collectedById.get(receivable.id) ?? 0;
        return {
          receivable,
          collected,
          outstanding: outstandingForReceivable(receivable.billed_amount, [{ amount: collected }]),
        };
      }),
  };
}

export async function listDcoSelfReceivableVersions(receivableId: string): Promise<{
  error: Error | null;
  versions: DcoSelfReceivableVersion[];
}> {
  const { data, error } = await supabase()
    .from("dco_self_receivable_versions" as never)
    .select("id, receivable_id, version, billed_amount, reason, created_at")
    .eq("receivable_id", receivableId)
    .order("version", { ascending: true });
  if (error) return { error: rpcError(error.message), versions: [] };
  return { error: null, versions: (data as DcoSelfReceivableVersion[] | null) ?? [] };
}

export async function correctDcoSelfReceivable(input: {
  receivableId: string;
  billed: number;
  idempotencyKey: string;
  reason?: string | null;
}): Promise<{ error: Error | null; replayed: boolean; pending?: boolean }> {
  const remembered = await rememberDcoSelfOutbox({
    kind: "correct",
    idempotencyKey: input.idempotencyKey,
    payload: {
      receivableId: input.receivableId,
      billed: Math.round(input.billed),
      reason: input.reason ?? "",
    },
  });
  await markDcoSelfOutboxAttempted(remembered.id);
  const { data, error } = await supabase().rpc("correct_dco_self_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: remembered.idempotencyKey,
    p_reason: input.reason ?? null,
  } as never);
  if (error) {
    if (isDcoSelfTransportError(error)) {
      return { error: null, replayed: false, pending: true };
    }
    await rejectDcoSelfOutbox(remembered.id, error.message);
    return { error: rpcError(error.message), replayed: false, pending: true };
  }
  await acknowledgeDcoSelfOutbox(remembered.id);
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
}

export async function updateDcoSelfParty(input: {
  partyBId: string;
  name: string;
  phone?: string | null;
}): Promise<{ error: Error | null; party: DcoSelfParty | null; pending?: boolean }> {
  // Same upsert RPC; server matches by name/phone within workspace.
  return upsertDcoSelfParty({ name: input.name, phone: input.phone });
}

export async function listDcoSelfCollections(receivableId: string): Promise<{
  error: Error | null;
  rows: DcoSelfCollection[];
}> {
  const { data, error } = await supabase()
    .from("dco_self_collections" as never)
    .select("id, receivable_id, amount, payment_mode, reference, paid_on, created_at")
    .eq("receivable_id", receivableId)
    .order("created_at", { ascending: true });
  if (error) return { error: rpcError(error.message), rows: [] };
  return { error: null, rows: (data as DcoSelfCollection[] | null) ?? [] };
}

export function outstandingForReceivable(
  billed: number,
  collections: Array<{ amount: number }>,
): number {
  const collected = collections.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)), 0);
  return Math.max(0, Math.round(Number(billed) || 0) - collected);
}

export function dcoSelfIssueKey(tripId: string): string {
  return `dco-self-issue:${tripId.trim()}`;
}

export type DcoSelfFinanceReceivableRow = {
  receivable_id: string;
  party_b_id: string;
  party_name: string;
  billed_amount: number;
  collected: number;
  outstanding: number;
  status: string;
  operational_trip_id: string | null;
  party_a_label: string | null;
  issued_at: string | null;
  billed_version: number;
};

/** Finance read helper — caller Self workspace only; empty when not eligible. */
export async function listDcoSelfFinanceReceivables(): Promise<{
  error: Error | null;
  rows: DcoSelfFinanceReceivableRow[];
}> {
  const { data, error } = await supabase().rpc(
    "list_dco_self_finance_receivables" as never,
  );
  if (error) return { error: rpcError(error.message), rows: [] };
  return {
    error: null,
    rows: ((data as DcoSelfFinanceReceivableRow[] | null) ?? []).map((row) => ({
      ...row,
      billed_amount: Math.round(Number(row.billed_amount) || 0),
      collected: Math.round(Number(row.collected) || 0),
      outstanding: Math.round(Number(row.outstanding) || 0),
      billed_version: Math.round(Number(row.billed_version) || 0),
    })),
  };
}

export async function getDcoSelfReceivableForTrip(tripId: string): Promise<{
  error: Error | null;
  receivable: DcoSelfReceivable | null;
}> {
  const id = tripId.trim();
  if (!id) return { error: null, receivable: null };
  const { data, error } = await supabase()
    .from("dco_self_receivables" as never)
    .select(
      "id, workspace_id, party_b_id, billed_amount, billed_version, status, operational_trip_id, party_a_label, issued_at",
    )
    .eq("operational_trip_id", id)
    .neq("status", "void")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: rpcError(error.message), receivable: null };
  return { error: null, receivable: (data as DcoSelfReceivable | null) ?? null };
}
