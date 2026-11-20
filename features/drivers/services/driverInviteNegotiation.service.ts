/**
 * Fleet ↔ driver invite negotiation: request changes (driver), agree / revise
 * (fleet), decline with reason, fleet withdraw, and invite details (job
 * description, terms & conditions, round history).
 * Server: supabase/migrations/20271118120100_driver_invite_terms_and_revisions.sql
 */
import { supabase } from "@/lib/supabase";
import type { DriverInviteCompensation } from "@/features/drivers/utils/driverInviteCompensation.util";
import { normalizeDriverInviteCompensation } from "@/features/drivers/utils/driverInviteCompensation.util";

export type DriverInviteRound = {
  round_no: number;
  by_side: "fleet" | "driver";
  payable_amount: number | null;
  commission_percent: number | null;
  commission_per_km: number | null;
  note: string | null;
  created_at: string;
};

export type DriverInviteDetails = {
  invite_id: string;
  job_description: string | null;
  terms_text: string | null;
  decline_reason: string | null;
  last_action_by: "fleet" | "driver" | null;
  terms_accepted_at: string | null;
  rounds: DriverInviteRound[];
};

function rpcMissing(error: { code?: string; message?: string } | null, name: string): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    (msg.includes(name) && (msg.includes("could not find") || msg.includes("does not exist")))
  );
}

/** Strip the `code: ` prefix our RPCs raise so the driver sees a plain sentence. */
function friendly(message: string | undefined): Error {
  const raw = String(message ?? "Something went wrong. Try again.");
  const idx = raw.indexOf(": ");
  return new Error(/^[a-z_]+$/.test(raw.slice(0, idx)) ? raw.slice(idx + 2) : raw);
}

const SERVER_UPDATE_NEEDED = new Error(
  "This needs the latest server update. Please ask the admin to run the database migrations.",
);

function termsArgs(terms: DriverInviteCompensation) {
  const t = normalizeDriverInviteCompensation(terms);
  return {
    p_payable_amount: t.payableAmount,
    p_commission_percent: t.commissionPercent,
    p_commission_per_km: t.commissionPerKm,
  };
}

/** Driver: send changed pay terms back to the fleet (unlimited rounds). */
export async function requestDriverInviteChanges(
  inviteId: string,
  terms: DriverInviteCompensation,
  note?: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("driver_request_invite_changes" as never, {
    p_invite_id: inviteId,
    ...termsArgs(terms),
    p_note: (note ?? "").trim() || null,
  } as never);
  if (rpcMissing(error, "driver_request_invite_changes")) return { error: SERVER_UPDATE_NEEDED };
  return { error: error ? friendly(error.message) : null };
}

/**
 * Driver: ask for changes by MESSAGE only. The fleet's current offer is sent
 * back unchanged — the driver never edits pay; only the fleet can revise it.
 */
export async function requestDriverInviteChangesByMessage(
  invite: {
    id: string;
    payable_amount?: number | null;
    commission_percent?: number | null;
    commission_per_km?: number | null;
  },
  message: string,
): Promise<{ error: Error | null }> {
  const text = message.trim();
  if (!text) return { error: new Error("Write a message for the fleet.") };
  return requestDriverInviteChanges(
    invite.id,
    {
      payableAmount: invite.payable_amount ?? null,
      commissionPercent: invite.commission_percent ?? null,
      commissionPerKm: invite.commission_per_km ?? null,
    },
    text,
  );
}

/** Fleet: agree to the driver's asked terms, or send revised terms. */
export async function respondToDriverInviteChanges(
  inviteId: string,
  action: "agree" | "revise",
  terms?: DriverInviteCompensation | null,
  note?: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("fleet_respond_invite_changes" as never, {
    p_invite_id: inviteId,
    p_action: action,
    ...termsArgs(terms ?? { payableAmount: null, commissionPercent: null, commissionPerKm: null }),
    p_note: (note ?? "").trim() || null,
  } as never);
  if (rpcMissing(error, "fleet_respond_invite_changes")) return { error: SERVER_UPDATE_NEEDED };
  return { error: error ? friendly(error.message) : null };
}

/**
 * Driver: decline with an optional reason. Falls back to the old
 * reject_driver_invite (no reason) until the migration is applied.
 */
export async function declineDriverInviteWithReason(
  inviteId: string,
  reason?: string | null,
): Promise<{ error: Error | null }> {
  const db = supabase();
  const { error } = await db.rpc("driver_decline_invite" as never, {
    p_invite_id: inviteId,
    p_reason: (reason ?? "").trim() || null,
  } as never);
  if (!error) return { error: null };
  if (!rpcMissing(error, "driver_decline_invite")) return { error: friendly(error.message) };
  const legacy = await db.rpc("reject_driver_invite", { p_invite_id: inviteId });
  return { error: legacy.error ? friendly(legacy.error.message) : null };
}

/** Fleet: withdraw (recall) a pending or countered invite. */
export async function withdrawDriverInvite(
  inviteId: string,
): Promise<{ error: Error | null; withdrawn: boolean; missingRpc: boolean }> {
  const { data, error } = await supabase().rpc("fleet_withdraw_driver_invite" as never, {
    p_invite_id: inviteId,
  } as never);
  if (rpcMissing(error, "fleet_withdraw_driver_invite")) {
    return { error: null, withdrawn: false, missingRpc: true };
  }
  if (error) return { error: friendly(error.message), withdrawn: false, missingRpc: false };
  const ok = (data as { ok?: boolean } | null)?.ok === true;
  return {
    error: ok ? null : new Error("This invite was already answered."),
    withdrawn: ok,
    missingRpc: false,
  };
}

/** Fleet: attach job description and terms & conditions to its invite. */
export async function setDriverInviteDetails(
  inviteId: string,
  details: { jobDescription?: string | null; termsText?: string | null },
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("fleet_set_driver_invite_details" as never, {
    p_invite_id: inviteId,
    p_job_description: (details.jobDescription ?? "").trim() || null,
    p_terms_text: (details.termsText ?? "").trim() || null,
  } as never);
  if (rpcMissing(error, "fleet_set_driver_invite_details")) return { error: SERVER_UPDATE_NEEDED };
  return { error: error ? friendly(error.message) : null };
}

/** Both sides: job description, T&C, decline reason and round history. */
export async function getDriverInviteDetails(
  inviteIds: string[],
): Promise<Record<string, DriverInviteDetails>> {
  const ids = [...new Set(inviteIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase().rpc("get_driver_invite_details" as never, {
    p_invite_ids: ids,
  } as never);
  if (error) return {};
  const out: Record<string, DriverInviteDetails> = {};
  for (const row of (data ?? []) as DriverInviteDetails[]) {
    out[row.invite_id] = { ...row, rounds: Array.isArray(row.rounds) ? row.rounds : [] };
  }
  return out;
}

/** Latest driver ask (for the fleet's review card). */
export function latestDriverAsk(details: DriverInviteDetails | null | undefined): DriverInviteRound | null {
  const rounds = details?.rounds ?? [];
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    if (rounds[i]?.by_side === "driver") return rounds[i] ?? null;
  }
  return null;
}

/** "₹15,000/month + 3% + ₹10/km" — compact pay line for cards. */
export function formatInvitePayLine(terms: {
  payable_amount?: number | null;
  commission_percent?: number | null;
  commission_per_km?: number | null;
}): string {
  const parts: string[] = [];
  const salary = Number(terms.payable_amount ?? 0);
  const pct = Number(terms.commission_percent ?? 0);
  const perKm = Number(terms.commission_per_km ?? 0);
  if (salary > 0) parts.push(`₹${Math.round(salary).toLocaleString("en-IN")}/month`);
  if (pct > 0) parts.push(`${pct}% commission`);
  if (perKm > 0) parts.push(`₹${perKm}/km`);
  return parts.length ? parts.join(" + ") : "No pay terms";
}
