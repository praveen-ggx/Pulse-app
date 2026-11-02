import {
  acknowledgeDcoSelfOutbox,
  listPendingDcoSelfOutbox,
  markDcoSelfOutboxAttempted,
  rejectDcoSelfOutbox,
  type DcoSelfOutboxItem,
} from "@/features/dco-self/offline/dcoSelfOutbox";
import { isDcoSelfTransportError } from "@/features/dco-self/offline/dcoSelfOffline.util";
import {
  markLocalDcoSelfPartyRejected,
  markLocalDcoSelfPartySynced,
  markLocalDcoSelfTripTagRejected,
  markLocalDcoSelfTripTagSynced,
  resolveDcoSelfPartyBId,
} from "@/features/dco-self/offline/dcoSelfLocalBook";
import { claimExchangePayment } from "@/features/marketplace/services/exchangePayments.service";
import { supabase } from "@/lib/supabase";
import type { ExchangePaymentMode } from "@/features/marketplace/services/exchangePayments.service";

export type DcoSelfFlushResult = {
  flushed: number;
  pending: number;
  rejected: number;
  offline: boolean;
};

async function rpc(name: string, args: Record<string, unknown>) {
  return supabase().rpc(name as never, args as never);
}

async function flushParty(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const localId = String(item.payload.localPartyId ?? item.payload.partyBId ?? "");
  const { data, error } = await rpc("upsert_dco_self_party", {
    p_name: String(item.payload.name ?? ""),
    p_phone: item.payload.phone ?? null,
  });
  if (error) {
    if (isDcoSelfTransportError(error)) return "offline";
    await rejectDcoSelfOutbox(item.id, error.message);
    if (localId) await markLocalDcoSelfPartyRejected(localId, error.message);
    return "reject";
  }
  const party = data as { id?: string; name?: string; phone?: string | null } | null;
  if (party?.id && localId) {
    await markLocalDcoSelfPartySynced(localId, {
      id: party.id,
      name: party.name ?? String(item.payload.name ?? ""),
      phone: party.phone ?? null,
    });
  }
  await acknowledgeDcoSelfOutbox(item.id);
  return "ok";
}

async function flushTag(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const tripId = String(item.payload.tripId ?? "");
  const rawPartyId = String(item.payload.partyBId ?? "");
  const partyBId = await resolveDcoSelfPartyBId(rawPartyId);
  // Tag is local operational state until Party B has a server UUID. No tag RPC.
  if (partyBId.startsWith("local:") || !/^[0-9a-f-]{36}$/i.test(partyBId)) return "offline";
  await markLocalDcoSelfTripTagSynced(tripId, partyBId);
  await acknowledgeDcoSelfOutbox(item.id);
  return "ok";
}

async function flushIssue(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const partyBId = await resolveDcoSelfPartyBId(String(item.payload.partyBId ?? ""));
  if (partyBId.startsWith("local:")) return "offline";
  const { data, error } = await rpc("issue_dco_self_receivable", {
    p_party_b_id: partyBId,
    p_billed: item.payload.billed,
    p_idempotency_key: item.idempotencyKey,
    p_trip_id: String(item.payload.tripId ?? "").trim() || null,
    p_party_a_label: String(item.payload.partyALabel ?? "").trim() || null,
  });
  if (error) {
    if (isDcoSelfTransportError(error)) return "offline";
    await rejectDcoSelfOutbox(item.id, error.message);
    return "reject";
  }
  const row = data as { id?: string } | null;
  if (row?.id) {
    await acknowledgeDcoSelfOutbox(item.id);
    return "ok";
  }
  return "reject";
}

async function flushCorrect(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const { data, error } = await rpc("correct_dco_self_receivable", {
    p_receivable_id: item.payload.receivableId,
    p_billed: item.payload.billed,
    p_idempotency_key: item.idempotencyKey,
    p_reason: item.payload.reason ?? null,
  });
  if (error) {
    if (isDcoSelfTransportError(error)) return "offline";
    await rejectDcoSelfOutbox(item.id, error.message);
    return "reject";
  }
  if ((data as { id?: string } | null)?.id) {
    await acknowledgeDcoSelfOutbox(item.id);
    return "ok";
  }
  return "reject";
}

async function flushCollect(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const { data, error } = await rpc("collect_dco_self_receivable", {
    p_receivable_id: item.payload.receivableId,
    p_amount: item.payload.amount,
    p_payment_mode: item.payload.paymentMode,
    p_idempotency_key: item.idempotencyKey,
    p_reference: item.payload.reference ?? null,
    p_paid_on: String(item.payload.paidOn ?? "").trim().slice(0, 10) || null,
  });
  if (error) {
    if (isDcoSelfTransportError(error)) return "offline";
    await rejectDcoSelfOutbox(item.id, error.message);
    return "reject";
  }
  if ((data as { id?: string } | null)?.id || (data as { ok?: boolean } | null)?.ok) {
    await acknowledgeDcoSelfOutbox(item.id);
    return "ok";
  }
  return "reject";
}

async function flushExchange(item: DcoSelfOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const { error } = await claimExchangePayment({
    tripId: String(item.payload.tripId ?? ""),
    amount: Math.round(Number(item.payload.amount) || 0),
    paymentMode: (String(item.payload.paymentMode ?? "CASH") as ExchangePaymentMode) || "CASH",
    paymentReference: String(item.payload.reference ?? "").trim() || null,
    paidOn: String(item.payload.paidOn ?? "").trim().slice(0, 10) || null,
    idempotencyKey: item.idempotencyKey,
  });
  if (error) {
    if (isDcoSelfTransportError(error)) return "offline";
    await rejectDcoSelfOutbox(item.id, error.message);
    return "reject";
  }
  await acknowledgeDcoSelfOutbox(item.id);
  return "ok";
}

export async function flushDcoSelfOutbox(): Promise<DcoSelfFlushResult> {
  const pending = await listPendingDcoSelfOutbox();
  let flushed = 0;
  let rejected = 0;
  let offline = false;
  for (const item of pending) {
    await markDcoSelfOutboxAttempted(item.id);
    let result: "ok" | "offline" | "reject" = "ok";
    try {
      if (item.kind === "upsert_party") result = await flushParty(item);
      else if (item.kind === "tag") result = await flushTag(item);
      else if (item.kind === "issue") result = await flushIssue(item);
      else if (item.kind === "correct") result = await flushCorrect(item);
      else if (item.kind === "collect") result = await flushCollect(item);
      else result = await flushExchange(item);
    } catch (error) {
      if (isDcoSelfTransportError(error)) result = "offline";
      else {
        await rejectDcoSelfOutbox(
          item.id,
          error instanceof Error ? error.message : String(error),
        );
        if (item.kind === "tag") {
          await markLocalDcoSelfTripTagRejected(
            String(item.payload.tripId ?? ""),
            String(error),
          );
        }
        result = "reject";
      }
    }
    if (result === "ok") flushed += 1;
    else if (result === "reject") rejected += 1;
    else offline = true;
  }
  const still = await listPendingDcoSelfOutbox();
  return { flushed, pending: still.length, rejected, offline };
}
