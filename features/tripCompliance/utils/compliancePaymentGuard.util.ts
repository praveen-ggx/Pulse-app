export type ComplianceLedgerCategory = "compliance_advance" | "compliance_balance";

export function evaluateCompliancePaymentGuard(
  category: ComplianceLedgerCategory,
  bucket: { advance: unknown[]; balance: unknown[] },
  opts?: { podReceived?: boolean },
): { ok: boolean; reason?: string; kind?: "already_paid" | "blocked" } {
  if (category === "compliance_advance" && bucket.advance.length > 0) {
    return {
      ok: false,
      kind: "already_paid",
      reason: "An advance payment has already been posted for this trip.",
    };
  }
  if (category === "compliance_balance") {
    if (bucket.balance.length > 0) {
      return {
        ok: false,
        kind: "already_paid",
        reason: "This trip is already settled — a balance payment already exists.",
      };
    }
    if (bucket.advance.length === 0 && !opts?.podReceived) {
      return {
        ok: false,
        kind: "blocked",
        reason: "Advance payment must be posted before the balance payment.",
      };
    }
  }
  return { ok: true };
}
