/**
 * Map POD exception charges onto trip CN/DN (trip_finance_adjustments).
 * Client extras/deductions hit revenue (AR).
 * Aggregate cost extras/deductions hit supplier AP.
 * Asset (own vehicle) cost extras/deductions hit driver payable — never AP to "Own fleet".
 * Loading/unloading increase the side (DN). Damage/missing/late reduce it (CN).
 */
import type { PodChargeLines } from "@/features/debit-control/utils/debitControlPod.model";
import type { TripAdjustment, TripAdjustmentImpact, TripAdjustmentType } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

export const POD_EXCEPTION_CNDN_KEYS = [
  "loading",
  "unloading",
  "damage",
  "productMissing",
  "delay",
] as const;

export type PodExceptionCnDnKey = (typeof POD_EXCEPTION_CNDN_KEYS)[number];
export type PodCnDnParty = "client" | "vendor" | "driver";
export type PodCostParty = "vendor" | "driver";
export type PodNoteKind = "CN" | "DN";

export type PodCnDnDraft = {
  missionKey: string;
  party: PodCnDnParty;
  partyLabel: string;
  chargeKey: PodExceptionCnDnKey;
  label: string;
  amount: number;
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  noteKind: PodNoteKind;
  reason: string;
};

const CHARGE_META: Record<
  PodExceptionCnDnKey,
  { label: string; reason: string; impact: TripAdjustmentImpact; noteKind: PodNoteKind }
> = {
  loading: { label: "Loading", reason: "Loading Charges", impact: "plus", noteKind: "DN" },
  unloading: { label: "Unloading", reason: "Unloading Charges", impact: "plus", noteKind: "DN" },
  damage: { label: "Damages", reason: "Damages / Missing", impact: "minus", noteKind: "CN" },
  productMissing: { label: "Missing", reason: "Damages / Missing", impact: "minus", noteKind: "CN" },
  delay: { label: "Late delivery", reason: "Late Delivery", impact: "minus", noteKind: "CN" },
};

const ASSET_DRIVER_REASON: Record<PodExceptionCnDnKey, string> = {
  loading: "Loading / unloading help",
  unloading: "Loading / unloading help",
  damage: "Damage to cargo",
  productMissing: "Missing / shortage",
  delay: "Late delivery",
};

export function podCnDnMissionKey(party: PodCnDnParty, chargeKey: PodExceptionCnDnKey): string {
  return `PODCNDN-${party.toUpperCase()}-${chargeKey.toUpperCase()}`;
}

export function isPodCostParty(party: PodCnDnParty): boolean {
  return party === "vendor" || party === "driver";
}

/** Driver notes alias legacy vendor keys so an own-fleet remap does not double-post. */
export function podCnDnRelatedKeys(missionKey: string): string[] {
  const key = String(missionKey ?? "").trim().toUpperCase();
  if (!key) return [];
  if (key.includes("-VENDOR-")) return [key, key.replace("-VENDOR-", "-DRIVER-")];
  if (key.includes("-DRIVER-")) return [key, key.replace("-DRIVER-", "-VENDOR-")];
  return [key];
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function draftsForParty(
  party: PodCnDnParty,
  lines: PodChargeLines | null | undefined,
): PodCnDnDraft[] {
  if (!lines) return [];
  const type: TripAdjustmentType = party === "client" ? "revenue" : "cost";
  const partyLabel = party === "client" ? "Client" : party === "driver" ? "Driver" : "Vendor";
  const out: PodCnDnDraft[] = [];
  for (const chargeKey of POD_EXCEPTION_CNDN_KEYS) {
    const amount = money(lines[chargeKey]);
    if (amount <= 0) continue;
    const meta = CHARGE_META[chargeKey];
    const reason =
      party === "driver"
        ? ASSET_DRIVER_REASON[chargeKey]
        : chargeKey === "delay" && party === "vendor"
          ? "Detention"
          : meta.reason;
    out.push({
      missionKey: podCnDnMissionKey(party, chargeKey),
      party,
      partyLabel,
      chargeKey,
      label: meta.label,
      amount,
      type,
      impact: meta.impact,
      noteKind: meta.noteKind,
      reason,
    });
  }
  return out;
}

export function podExceptionCnDnDrafts(input: {
  client: PodChargeLines | null | undefined;
  vendor: PodChargeLines | null | undefined;
  /** Own-fleet trips post cost extras to the driver, not a vendor AP. */
  costParty?: PodCostParty;
}): PodCnDnDraft[] {
  const costParty = input.costParty === "driver" ? "driver" : "vendor";
  return [...draftsForParty("client", input.client), ...draftsForParty(costParty, input.vendor)];
}

export function existingPodCnDnKeys(adjustments: readonly TripAdjustment[]): Set<string> {
  const keys = new Set<string>();
  for (const row of adjustments) {
    if (isAdjustmentVoided(row)) continue;
    const key = String(row.mission_key ?? "").trim().toUpperCase();
    if (key.startsWith("PODCNDN-")) keys.add(key);
  }
  return keys;
}

function draftAlreadyPosted(draft: PodCnDnDraft, existing: Set<string>): boolean {
  return podCnDnRelatedKeys(draft.missionKey).some((key) => existing.has(key));
}

export function pendingPodCnDnDrafts(
  drafts: readonly PodCnDnDraft[],
  adjustments: readonly TripAdjustment[],
): PodCnDnDraft[] {
  const existing = existingPodCnDnKeys(adjustments);
  return drafts.filter((draft) => !draftAlreadyPosted(draft, existing));
}

export function createdPodCnDnDrafts(
  drafts: readonly PodCnDnDraft[],
  adjustments: readonly TripAdjustment[],
): PodCnDnDraft[] {
  const existing = existingPodCnDnKeys(adjustments);
  return drafts.filter((draft) => draftAlreadyPosted(draft, existing));
}

export function summarizePodCnDn(drafts: readonly PodCnDnDraft[]): string {
  if (drafts.length === 0) return "No CN or DN to create.";
  return drafts
    .map((draft) => `${draft.noteKind} · ${draft.partyLabel} · ${draft.label}`)
    .join("; ");
}

export function pendingPodCnDnAlertMessage(pending: readonly PodCnDnDraft[]): string {
  if (pending.length === 0) {
    return "Move this trip to Final Settlement? All CN / DN from the POD charges are created.";
  }
  const lines = pending.map(
    (draft) => `• ${draft.noteKind} · ${draft.partyLabel} · ${draft.label}`,
  );
  return [
    "These CN / DN are not created yet:",
    ...lines,
    "",
    "Create them first, or proceed to Final Settlement anyway.",
  ].join("\n");
}

export function podCnDnProvisionPreset(draft: Pick<
  PodCnDnDraft,
  "type" | "impact" | "reason" | "amount"
>): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
  amountSeed: number;
} {
  return {
    type: draft.type,
    impact: draft.impact,
    reasonSeed: draft.reason,
    amountSeed: draft.amount,
  };
}

export function podCnDnAdjustmentFor(
  adjustments: readonly TripAdjustment[],
  missionKey: string,
): TripAdjustment | null {
  const aliases = new Set(podCnDnRelatedKeys(missionKey));
  for (const row of adjustments) {
    if (isAdjustmentVoided(row)) continue;
    if (aliases.has(String(row.mission_key ?? "").trim().toUpperCase())) return row;
  }
  return null;
}
