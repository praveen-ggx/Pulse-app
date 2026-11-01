import {
  acknowledgeDcoSelfOutbox,
  rememberDcoSelfOutbox,
} from "@/features/dco-self/offline/dcoSelfOutbox";
import { supabase } from "@/lib/supabase";

export type DcoSelfParty = {
  id: string;
  name: string;
  phone?: string | null;
};

export type DcoSelfReceivable = {
  id: string;
  workspace_id: string;
  party_b_id: string;
  billed_amount: number;
  billed_version: number;
  status: "draft" | "issued" | "received" | "void";
  operational_trip_id: string | null;
  party_a_label: string | null;
  issued_at: string | null;
};

export type DcoSelfCollection = {
  id: string;
  receivable_id: string;
  amount: number;
  payment_mode: string;
  reference: string | null;
  paid_on: string | null;
  created_at: string;
};

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
}): Promise<{ error: Error | null; party: DcoSelfParty | null }> {
  const { data, error } = await supabase().rpc("upsert_dco_self_party" as never, {
    p_name: input.name,
    p_phone: input.phone ?? null,
  } as never);
  if (error) return { error: rpcError(error.message), party: null };
  const row = data as { id?: string; name?: string; phone?: string | null } | null;
  if (!row?.id) return { error: new Error("Could not save party."), party: null };
  return { error: null, party: { id: row.id, name: row.name || input.name, phone: row.phone } };
}

export async function listDcoSelfParties(): Promise<{
  error: Error | null;
  parties: DcoSelfParty[];
}> {
  const { data, error } = await supabase()
    .from("dco_self_parties" as never)
    .select("id, name, phone")
    .order("created_at", { ascending: false });
  if (error) return { error: rpcError(error.message), parties: [] };
  return {
    error: null,
    parties: ((data as DcoSelfParty[] | null) ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? "Party"),
      phone: row.phone ?? null,
    })),
  };
}

export async function issueDcoSelfReceivable(input: {
  partyBId: string;
  billed: number;
  idempotencyKey: string;
  tripId?: string | null;
  partyALabel?: string | null;
}): Promise<{ error: Error | null; receivableId: string | null; replayed: boolean }> {
  const remembered = await rememberDcoSelfOutbox({
    kind: "issue",
    idempotencyKey: input.idempotencyKey,
    payload: {
      partyBId: input.partyBId,
      billed: Math.round(input.billed),
      tripId: input.tripId ?? "",
    },
  });
  const { data, error } = await supabase().rpc("issue_dco_self_receivable" as never, {
    p_party_b_id: input.partyBId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: remembered.idempotencyKey,
    p_trip_id: input.tripId ?? null,
    p_party_a_label: input.partyALabel ?? null,
  } as never);
  if (error) return { error: rpcError(error.message), receivableId: null, replayed: false };
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
}): Promise<{ error: Error | null; replayed: boolean }> {
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
  const { data, error } = await supabase().rpc("collect_dco_self_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_amount: Math.round(input.amount),
    p_payment_mode: input.paymentMode,
    p_idempotency_key: remembered.idempotencyKey,
    p_reference: input.reference ?? null,
    p_paid_on: input.paidOn ?? null,
  } as never);
  if (error) return { error: rpcError(error.message), replayed: false };
  await acknowledgeDcoSelfOutbox(remembered.id);
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
}

export type DcoSelfReceivableVersion = {
  id: string;
  receivable_id: string;
  version: number;
  billed_amount: number;
  reason: string | null;
  created_at: string;
};

export type DcoSelfReceivableListRow = {
  receivable: DcoSelfReceivable;
  collected: number;
  outstanding: number;
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
}): Promise<{ error: Error | null; replayed: boolean }> {
  const { data, error } = await supabase().rpc("correct_dco_self_receivable" as never, {
    p_receivable_id: input.receivableId,
    p_billed: Math.round(input.billed),
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason ?? null,
  } as never);
  if (error) return { error: rpcError(error.message), replayed: false };
  const row = data as { replayed?: boolean } | null;
  return { error: null, replayed: row?.replayed === true };
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
