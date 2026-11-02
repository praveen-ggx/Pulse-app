import {
  acknowledgeDriverIndieOutbox,
  listPendingDriverIndieOutbox,
  markDriverIndieOutboxAttempted,
  rejectDriverIndieOutbox,
  type DriverIndieOutboxItem,
} from "@/features/driver-indie/offline/driverIndieOutbox";
import { isDriverIndieTransportError } from "@/features/driver-indie/offline/driverIndieOffline.util";
import {
  markLocalDriverIndiePartyRejected,
  markLocalDriverIndiePartySynced,
  markLocalDriverIndieTripTagRejected,
  markLocalDriverIndieTripTagSynced,
  resolveDriverIndiePartyId,
} from "@/features/driver-indie/offline/driverIndieLocalBook";
import { supabase } from "@/lib/supabase";

export type DriverIndieFlushResult = {
  flushed: number;
  pending: number;
  rejected: number;
  offline: boolean;
};

async function rpc(name: string, args: Record<string, unknown>) {
  return supabase().rpc(name as never, args as never);
}

async function flushParty(item: DriverIndieOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const localId = String(item.payload.localPartyId ?? item.payload.partyId ?? "");
  const { data, error } = await rpc("upsert_driver_indie_party", {
    p_name: String(item.payload.name ?? ""),
    p_phone: item.payload.phone ?? null,
  });
  if (error) {
    if (isDriverIndieTransportError(error)) return "offline";
    await rejectDriverIndieOutbox(item.id, error.message);
    if (localId) await markLocalDriverIndiePartyRejected(localId, error.message);
    return "reject";
  }
  const party = data as { id?: string; name?: string; phone?: string | null } | null;
  if (party?.id && localId) {
    await markLocalDriverIndiePartySynced(localId, {
      id: party.id,
      name: party.name ?? String(item.payload.name ?? ""),
      phone: party.phone ?? null,
    });
  }
  await acknowledgeDriverIndieOutbox(item.id);
  return "ok";
}

async function flushTag(item: DriverIndieOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const tripId = String(item.payload.tripId ?? "");
  const partyId = await resolveDriverIndiePartyId(String(item.payload.partyId ?? ""));
  if (partyId.startsWith("local:") || !/^[0-9a-f-]{36}$/i.test(partyId)) return "offline";
  await markLocalDriverIndieTripTagSynced(tripId, partyId);
  await acknowledgeDriverIndieOutbox(item.id);
  return "ok";
}

async function flushIssue(item: DriverIndieOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const partyId = await resolveDriverIndiePartyId(String(item.payload.partyId ?? ""));
  if (partyId.startsWith("local:")) return "offline";
  const { data, error } = await rpc("issue_driver_indie_receivable", {
    p_party_id: partyId,
    p_billed: item.payload.billed,
    p_idempotency_key: item.idempotencyKey,
    p_trip_id: String(item.payload.tripId ?? "").trim() || null,
    p_party_label: String(item.payload.partyLabel ?? "").trim() || null,
  });
  if (error) {
    if (isDriverIndieTransportError(error)) return "offline";
    await rejectDriverIndieOutbox(item.id, error.message);
    return "reject";
  }
  if ((data as { id?: string } | null)?.id) {
    await acknowledgeDriverIndieOutbox(item.id);
    return "ok";
  }
  return "reject";
}

async function flushCorrect(item: DriverIndieOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const { data, error } = await rpc("correct_driver_indie_receivable", {
    p_receivable_id: item.payload.receivableId,
    p_billed: item.payload.billed,
    p_idempotency_key: item.idempotencyKey,
    p_reason: item.payload.reason ?? null,
  });
  if (error) {
    if (isDriverIndieTransportError(error)) return "offline";
    await rejectDriverIndieOutbox(item.id, error.message);
    return "reject";
  }
  if ((data as { id?: string } | null)?.id) {
    await acknowledgeDriverIndieOutbox(item.id);
    return "ok";
  }
  return "reject";
}

async function flushCollect(item: DriverIndieOutboxItem): Promise<"ok" | "offline" | "reject"> {
  const { data, error } = await rpc("collect_driver_indie_receivable", {
    p_receivable_id: item.payload.receivableId,
    p_amount: item.payload.amount,
    p_payment_mode: item.payload.paymentMode,
    p_idempotency_key: item.idempotencyKey,
    p_reference: item.payload.reference ?? null,
    p_paid_on: String(item.payload.paidOn ?? "").trim().slice(0, 10) || null,
  });
  if (error) {
    if (isDriverIndieTransportError(error)) return "offline";
    await rejectDriverIndieOutbox(item.id, error.message);
    return "reject";
  }
  if ((data as { id?: string } | null)?.id || (data as { ok?: boolean } | null)?.ok) {
    await acknowledgeDriverIndieOutbox(item.id);
    return "ok";
  }
  return "reject";
}

export async function flushDriverIndieOutbox(): Promise<DriverIndieFlushResult> {
  const pending = await listPendingDriverIndieOutbox();
  let flushed = 0;
  let rejected = 0;
  let offline = false;
  for (const item of pending) {
    await markDriverIndieOutboxAttempted(item.id);
    let result: "ok" | "offline" | "reject" = "ok";
    try {
      if (item.kind === "upsert_party") result = await flushParty(item);
      else if (item.kind === "tag") result = await flushTag(item);
      else if (item.kind === "issue") result = await flushIssue(item);
      else if (item.kind === "correct") result = await flushCorrect(item);
      else result = await flushCollect(item);
    } catch (error) {
      if (isDriverIndieTransportError(error)) result = "offline";
      else {
        await rejectDriverIndieOutbox(
          item.id,
          error instanceof Error ? error.message : String(error),
        );
        if (item.kind === "tag") {
          await markLocalDriverIndieTripTagRejected(
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
  const still = await listPendingDriverIndieOutbox();
  return { flushed, pending: still.length, rejected, offline };
}
