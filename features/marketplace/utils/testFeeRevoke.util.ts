import { formatINR } from "@/lib/format";

export const TEST_FEE_REVOKE_REASON =
  "Shipper reversed the test marketplace fee and revoked the award.";

type FeeBid = {
  status: string;
  fee_payment_status: string;
  platform_fee_amount: number | null;
};

export type AwardRevokePresentation = {
  mode: "revoke" | "refund_test";
  buttonLabel: string;
  busyLabel: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
};

/** Paid accepted market bid uses the test-fee RPC. Anything else keeps revoke. */
export function awardRevokePresentation(
  bids: readonly FeeBid[],
): AwardRevokePresentation {
  const accepted = bids.find(
    (bid) => bid.status === "accepted" && bid.fee_payment_status === "paid",
  );
  if (!accepted) {
    return {
      mode: "revoke",
      buttonLabel: "Revoke award",
      busyLabel: "Revoking…",
      confirmTitle: "Revoke award",
      confirmMessage:
        "Move this load back to open bidding? The previous winner is tagged Award revoked. You can award the same offer or another one.",
      confirmLabel: "Revoke award",
    };
  }
  const amountLabel = formatINR(Number(accepted.platform_fee_amount ?? 0));
  return {
    mode: "refund_test",
    buttonLabel: "Refund test fee and revoke",
    busyLabel: "Revoking…",
    confirmTitle: "Refund test fee and revoke",
    confirmMessage:
      `Reverse the test marketplace fee of ${amountLabel} and revoke this award? The original payment record stays. Razorpay and cash payments are not reversed.`,
    confirmLabel: "Refund test fee and revoke",
  };
}
