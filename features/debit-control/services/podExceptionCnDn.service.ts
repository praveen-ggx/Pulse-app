import {
  pendingPodCnDnDrafts,
  podCnDnAdjustmentFor,
  podExceptionCnDnDrafts,
  type PodCnDnDraft,
} from "@/features/debit-control/utils/podExceptionCnDn.util";
import type { PodChargeLines } from "@/features/debit-control/utils/debitControlPod.model";
import {
  addTripAdjustment,
  getTripAdjustments,
  updateTripAdjustment,
  voidTripAdjustment,
} from "@/features/trips/services/tripAdjustments";

export async function applyPodExceptionCnDn(input: {
  tripId: string;
  organizationId: string;
  client: PodChargeLines | null | undefined;
  vendor: PodChargeLines | null | undefined;
  costParty?: "vendor" | "driver";
}): Promise<{ error: Error | null; created: PodCnDnDraft[]; skipped: PodCnDnDraft[] }> {
  const orgId = input.organizationId.trim();
  const tripId = input.tripId.trim();
  if (!orgId) return { error: new Error("Organization is missing."), created: [], skipped: [] };
  if (!tripId) return { error: new Error("Trip is missing."), created: [], skipped: [] };

  const drafts = podExceptionCnDnDrafts({
    client: input.client,
    vendor: input.vendor,
    costParty: input.costParty,
  });
  if (drafts.length === 0) {
    return { error: new Error("No POD exception charges to turn into CN or DN."), created: [], skipped: [] };
  }

  const existing = await getTripAdjustments(tripId);
  const pending = pendingPodCnDnDrafts(drafts, existing);
  const skipped = drafts.filter((draft) => !pending.some((item) => item.missionKey === draft.missionKey));
  const created: PodCnDnDraft[] = [];

  for (const draft of pending) {
    await addTripAdjustment(
      tripId,
      {
        type: draft.type,
        impact: draft.impact,
        amount: draft.amount,
        reason: draft.reason,
        mission_key: draft.missionKey,
      },
      { organizationId: orgId, missionKey: draft.missionKey },
    );
    created.push(draft);
  }

  return { error: null, created, skipped };
}

export async function editPodExceptionCnDn(input: {
  tripId: string;
  draft: PodCnDnDraft;
  amount: number;
  reason: string;
  type?: PodCnDnDraft["type"];
  impact?: PodCnDnDraft["impact"];
}): Promise<{ error: Error | null }> {
  const reason = input.reason.trim();
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!reason) return { error: new Error("Enter a reason to edit this note.") };
  if (amount <= 0) return { error: new Error("Enter an amount greater than 0.") };
  const existing = await getTripAdjustments(input.tripId);
  const row = podCnDnAdjustmentFor(existing, input.draft.missionKey);
  if (!row) return { error: new Error("This CN / DN is not on the trip.") };
  await updateTripAdjustment(input.tripId, row.id, {
    type: input.type ?? input.draft.type,
    impact: input.impact ?? input.draft.impact,
    amount,
    reason,
  });
  return { error: null };
}

export async function savePodProvisionNote(input: {
  tripId: string;
  organizationId: string;
  actorId?: string | null;
  params: {
    type: PodCnDnDraft["type"];
    impact: PodCnDnDraft["impact"];
    amount: number;
    reason: string;
  };
  missionKey?: string | null;
}): Promise<{ error: Error | null }> {
  const orgId = input.organizationId.trim();
  const tripId = input.tripId.trim();
  const reason = input.params.reason.trim();
  const amount = Math.round((Number(input.params.amount) || 0) * 100) / 100;
  if (!orgId) return { error: new Error("Organization is missing.") };
  if (!tripId) return { error: new Error("Trip is missing.") };
  if (!reason) return { error: new Error("Enter a reason.") };
  if (amount <= 0) return { error: new Error("Enter an amount greater than 0.") };
  await addTripAdjustment(
    tripId,
    {
      type: input.params.type,
      impact: input.params.impact,
      amount,
      reason,
      mission_key: input.missionKey ?? undefined,
      created_by: input.actorId ?? null,
    },
    { organizationId: orgId, missionKey: input.missionKey ?? null },
  );
  return { error: null };
}

export async function revokePodExceptionCnDn(input: {
  tripId: string;
  draft: PodCnDnDraft;
  reason: string;
}): Promise<{ error: Error | null }> {
  const reason = input.reason.trim();
  if (!reason) return { error: new Error("Enter a reason to revoke this note.") };
  const existing = await getTripAdjustments(input.tripId);
  const row = podCnDnAdjustmentFor(existing, input.draft.missionKey);
  if (!row) return { error: new Error("This CN / DN is not on the trip.") };
  await voidTripAdjustment(input.tripId, row.id, reason);
  return { error: null };
}
