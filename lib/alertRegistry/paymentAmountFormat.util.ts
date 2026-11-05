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
