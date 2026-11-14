export type TripMoneySnapshot = {
  clientTotal: number;
  clientPaid: number;
  supplierTotal: number;
  supplierPaid: number;
};

export function formatInrAmount(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

/** Turn a bare ledger token such as ₹0036000 into ₹36,000. Leave ₹36,000 alone. */
export function formatBareRupeeTokens(text: string): string {
  return text.replace(/₹\s*(\d+(?:\.\d+)?)(?![\d,])/g, (full, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return full;
    return formatInrAmount(n);
  });
}

export type TripPaymentProgress = { ratio: number; caption: string };

/**
 * How much of the trip's payable/receivable is covered, counting this payment.
 * The money snapshot can lag the event, so this payment is a floor for "paid".
 */
export function tripPaymentProgress(
  lane: "received" | "paid",
  money: TripMoneySnapshot | null | undefined,
  paymentAmount: number | null | undefined,
): TripPaymentProgress | null {
  if (!money) return null;
  const total = lane === "received" ? money.clientTotal : money.supplierTotal;
  if (!(total > 0)) return null;
  const snapshotPaid = lane === "received" ? money.clientPaid : money.supplierPaid;
  const thisPayment = Number.isFinite(Number(paymentAmount)) ? Math.abs(Number(paymentAmount)) : 0;
  const paid = Math.min(total, Math.max(snapshotPaid, thisPayment));
  const left = total - paid;
  return {
    ratio: paid / total,
    caption:
      left <= 0.5
        ? `${formatInrAmount(total)} settled`
        : `${formatInrAmount(left)} left of ${formatInrAmount(total)}`,
  };
}

/**
 * Short balance when the trip has a total.
 * Paid progress when we know it; otherwise just the trip total.
 */
export function tripBalanceHint(
  lane: "received" | "paid",
  money: TripMoneySnapshot | null | undefined,
): string | null {
  if (!money) return null;
  const total = lane === "received" ? money.clientTotal : money.supplierTotal;
  const paid = lane === "received" ? money.clientPaid : money.supplierPaid;
  if (!(total > 0)) return null;
  if (paid > 0 && paid < total - 0.5) {
    return `${formatInrAmount(total - paid)} left of ${formatInrAmount(total)}`;
  }
  if (paid >= total - 0.5) return `${formatInrAmount(total)} settled`;
  return `Trip total ${formatInrAmount(total)}`;
}
