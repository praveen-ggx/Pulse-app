import {
  type PodChargeLines,
} from "@/features/debit-control/utils/debitControlPod.model";
import { POD_EXCEPTION_CNDN_KEYS } from "@/features/debit-control/utils/podExceptionCnDn.util";
import { readPodValidationPayload } from "@/features/debit-control/utils/podChargeTotals.util";

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function podChargeHasDebit(lines: PodChargeLines | null | undefined): boolean {
  if (!lines) return false;
  return POD_EXCEPTION_CNDN_KEYS.some((key) => money(lines[key]) > 0);
}

export function podDebitIdentified(
  client: PodChargeLines | null | undefined,
  vendor: PodChargeLines | null | undefined,
): boolean {
  return podChargeHasDebit(client) || podChargeHasDebit(vendor);
}

/** Latest validate/draft payload: debit only when an exception amount was captured. */
export function podDebitIdentifiedFromPayload(payload: unknown): boolean {
  const parsed = readPodValidationPayload(payload);
  return parsed ? podDebitIdentified(parsed.clientCharges, parsed.vendorCharges) : false;
}
