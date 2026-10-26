import type { PodChargeLines } from "@/features/debit-control/utils/debitControlPod.model";
import {
  POD_EXCEPTION_CNDN_KEYS,
  type PodExceptionCnDnKey,
} from "@/features/debit-control/utils/podExceptionCnDn.util";
import { podDebitIdentified } from "@/features/debit-control/utils/podExceptionDebit.util";

export type PodChargeChangeAction = "saved" | "updated" | "removed";

export type PodChargeChangeSnapshot = {
  client: PodChargeLines | null;
  vendor: PodChargeLines | null;
  noDebit?: boolean;
};

const CHARGE_LABEL: Record<PodExceptionCnDnKey, string> = {
  loading: "Loading",
  unloading: "Unloading",
  damage: "Damages",
  productMissing: "Missing",
  delay: "Late delivery",
};

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function hasDebit(snapshot: PodChargeChangeSnapshot | null | undefined): boolean {
  if (!snapshot || snapshot.noDebit) return false;
  return podDebitIdentified(snapshot.client, snapshot.vendor);
}

function signature(snapshot: PodChargeChangeSnapshot | null | undefined): string {
  if (!snapshot) return "";
  const amounts = POD_EXCEPTION_CNDN_KEYS.map((key) => [
    key,
    money(snapshot.client?.[key]),
    money(snapshot.vendor?.[key]),
  ]);
  return JSON.stringify({ noDebit: !hasDebit(snapshot), amounts });
}

function listedAmounts(snapshot: PodChargeChangeSnapshot): string[] {
  const lines: string[] = [];
  for (const key of POD_EXCEPTION_CNDN_KEYS) {
    const client = money(snapshot.client?.[key]);
    const vendor = money(snapshot.vendor?.[key]);
    if (client) lines.push(`Client ${CHARGE_LABEL[key]} ₹${client.toLocaleString("en-IN")}`);
    if (vendor) lines.push(`Vendor ${CHARGE_LABEL[key]} ₹${vendor.toLocaleString("en-IN")}`);
  }
  return lines;
}

function removedLabels(previous: PodChargeChangeSnapshot, next: PodChargeChangeSnapshot): string[] {
  const labels: string[] = [];
  for (const key of POD_EXCEPTION_CNDN_KEYS) {
    const had =
      money(previous.client?.[key]) > 0 || money(previous.vendor?.[key]) > 0;
    const kept = money(next.client?.[key]) > 0 || money(next.vendor?.[key]) > 0;
    if (had && !kept) labels.push(CHARGE_LABEL[key]);
  }
  return labels;
}

export function describePodChargeChange(input: {
  previous: PodChargeChangeSnapshot | null;
  next: PodChargeChangeSnapshot;
}): { action: PodChargeChangeAction; detail: string; changed: boolean } {
  const { previous, next } = input;
  if (!previous) {
    const lines = listedAmounts(next);
    return {
      action: "saved",
      changed: true,
      detail: lines.length > 0 ? lines.join(" · ") : "No debit — CN/DN are not required.",
    };
  }
  if (signature(previous) === signature(next)) {
    return { action: "updated", changed: false, detail: "" };
  }
  if (hasDebit(previous) && !hasDebit(next)) {
    const removed = removedLabels(previous, next);
    return {
      action: "removed",
      changed: true,
      detail:
        removed.length > 0
          ? `Removed ${removed.join(", ")} — no debit.`
          : "Cleared POD charges — no debit.",
    };
  }
  const nextLines = listedAmounts(next);
  return {
    action: "updated",
    changed: true,
    detail:
      nextLines.length > 0 ? nextLines.join(" · ") : "Updated POD charges.",
  };
}

export function podChargeChangeTitle(action: string | null | undefined): string {
  if (action === "removed") return "removed POD charges";
  if (action === "updated") return "updated POD charges";
  return "saved POD charges";
}
