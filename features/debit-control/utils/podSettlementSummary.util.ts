import { isPodCostParty, type PodCnDnDraft } from "@/features/debit-control/utils/podExceptionCnDn.util";

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function signedPodNoteAmount(
  draft: Pick<PodCnDnDraft, "amount" | "impact">,
  posted?: { amount?: number | null; impact?: string | null } | null,
): number {
  const amount = money(posted?.amount ?? draft.amount);
  const impact = posted?.impact === "plus" || posted?.impact === "minus" ? posted.impact : draft.impact;
  return impact === "plus" ? amount : -amount;
}

export function podSettlementPayable(input: {
  revisedCost: number;
  pending: readonly PodCnDnDraft[];
  tdsAmount: number;
  documentationCharges: number;
  advancePaid: number;
  balancePaid: number;
}): {
  revisedPayable: number;
  unadjustedCost: number;
  tdsAmount: number;
  documentationCharges: number;
  actualPayable: number;
  remaining: number;
} {
  const unadjustedCost = input.pending
    .filter((draft) => isPodCostParty(draft.party))
    .reduce((sum, draft) => sum + signedPodNoteAmount(draft), 0);
  const tdsAmount = Math.max(0, money(input.tdsAmount));
  const documentationCharges = Math.max(0, money(input.documentationCharges));
  const revisedPayable = Math.max(0, money(input.revisedCost));
  const actualPayable = Math.max(
    0,
    money(revisedPayable + unadjustedCost - tdsAmount - documentationCharges),
  );
  const remaining = Math.max(0, money(actualPayable - money(input.advancePaid) - money(input.balancePaid)));
  return {
    revisedPayable,
    unadjustedCost,
    tdsAmount,
    documentationCharges,
    actualPayable,
    remaining,
  };
}

/** Same ledger rows Finance uses: tagged compliance payouts plus other cost-side cash out. */
export function alignPodSettlementLedger(input: {
  actualPayable: number;
  taggedAdvance: number;
  taggedBalance: number;
  ledgerCostPaid: number;
}): {
  advancePaid: number;
  balancePaid: number;
  ledgerPaid: number;
  remaining: number;
  balancePosted: boolean;
} {
  const taggedAdvance = Math.max(0, money(input.taggedAdvance));
  const taggedBalance = Math.max(0, money(input.taggedBalance));
  const ledgerPaid = Math.max(money(input.ledgerCostPaid), taggedAdvance + taggedBalance);
  const unmarked = Math.max(0, money(ledgerPaid - taggedAdvance - taggedBalance));
  return {
    advancePaid: taggedAdvance > 0 ? taggedAdvance : unmarked,
    balancePaid: taggedBalance,
    ledgerPaid,
    remaining: Math.max(0, money(input.actualPayable - ledgerPaid)),
    balancePosted: taggedBalance > 0,
  };
}
