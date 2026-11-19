import type { DocumentChargeSlab } from "@/features/organization/utils/documentChargeSlabs.util";
import { financialYearOf } from "@/features/suppliers/utils/supplierVendorOnboarding.util";

/**
 * Compliance Confirm payment amount:
 * (Base freight × Advance %) − documentation charges − TDS
 *
 * TDS amount = Base freight × supplier TDS rate % for the current financial year
 * (vendor vault → supplier_tds_rates). Documentation charges come from the org's
 * Document Charge Slabs on base freight (see resolveComplianceDocumentationCharge).
 */
export function computeCompliancePaymentAmount(input: {
  baseFreight: number;
  advancePercent: number;
  documentationCharges?: number | null;
  tdsAmount?: number | null;
}): number {
  const base = Number(input.baseFreight);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const pctRaw = Number(input.advancePercent);
  const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;
  const doc = Math.max(0, Number(input.documentationCharges) || 0);
  const tds = Math.max(0, Number(input.tdsAmount) || 0);
  const raw = base * (pct / 100) - doc - tds;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw * 100) / 100;
}

/** TDS rupees from base freight × rate % (Section 194C-style). */
export function computeComplianceTdsAmount(
  baseFreight: number,
  tdsRatePercent: number | null | undefined,
): number {
  const base = Number(baseFreight);
  const rate = Number(tdsRatePercent);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const clamped = Math.min(100, Math.max(0, rate));
  return Math.round(base * (clamped / 100) * 100) / 100;
}

export type ComplianceTdsRateRow = {
  financial_year: string;
  rate_percent: number;
};

/**
 * Prefer the rate saved for the Indian FY of `asOf` (Apr–Mar).
 * Falls back to the newest prior FY when the current year has no row.
 */
export function resolveComplianceTdsRate(
  rates: ComplianceTdsRateRow[],
  asOf: Date = new Date(),
): { financialYear: string; ratePercent: number } | null {
  if (!rates.length) return null;
  const fy = financialYearOf(asOf);
  const exact = rates.find((r) => r.financial_year === fy);
  if (exact && Number.isFinite(Number(exact.rate_percent))) {
    return { financialYear: exact.financial_year, ratePercent: Number(exact.rate_percent) };
  }
  const prior = [...rates]
    .filter((r) => r.financial_year < fy && Number.isFinite(Number(r.rate_percent)))
    .sort((a, b) => b.financial_year.localeCompare(a.financial_year));
  const best = prior[0];
  if (!best) return null;
  return { financialYear: best.financial_year, ratePercent: Number(best.rate_percent) };
}

/** Placeholder until Compliance wires real documentation-charge source. */
export const COMPLIANCE_PAYMENT_DOC_CHARGES_PLACEHOLDER = 0;

export type ComplianceDocumentChargeConfig = {
  enabled: boolean;
  slabs: readonly DocumentChargeSlab[];
};

export type ComplianceDocumentationCharge = {
  amount: number;
  /** Why the amount is what it is — drives the hint under "Documentation charges". */
  reason: "slab" | "disabled" | "no_slab" | "no_freight";
  slab: Pick<DocumentChargeSlab, "from" | "to"> | null;
};

/**
 * Documentation charge from the org's Document Charge Slabs, looked up on base
 * freight only (never on advance %, TDS or any derived amount). Inclusive range:
 * from ≤ freight ≤ to, `to: null` = and above. Off / no match → ₹0.
 */
export function resolveComplianceDocumentationCharge(
  config: ComplianceDocumentChargeConfig | null | undefined,
  baseFreight: number | null | undefined,
): ComplianceDocumentationCharge {
  const freight = Number(baseFreight);
  if (!config?.enabled) return { amount: 0, reason: "disabled", slab: null };
  if (!Number.isFinite(freight) || freight <= 0) return { amount: 0, reason: "no_freight", slab: null };
  const hit = config.slabs.find((s) => freight >= s.from && (s.to === null || freight <= s.to));
  if (!hit) return { amount: 0, reason: "no_slab", slab: null };
  const amount = Math.max(0, Number(hit.charge) || 0);
  return { amount, reason: "slab", slab: { from: hit.from, to: hit.to } };
}

export const COMPLIANCE_DEFAULT_ADVANCE_PERCENT = 90;

function rupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function percentLabel(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
}

/**
 * Percent that makes the advance payable equal the file amount.
 * Returns null when the amount cannot be reached between 0% and 100%.
 */
export function percentForAdvancePayable(input: {
  baseFreight: number | null;
  documentationCharges: number;
  tdsAmount: number;
  targetPayable: number;
}): number | null {
  const base = Number(input.baseFreight);
  const target = Math.round(Number(input.targetPayable) * 100) / 100;
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(target) || target <= 0) return null;
  const doc = Math.max(0, Number(input.documentationCharges) || 0);
  const tds = Math.max(0, Number(input.tdsAmount) || 0);
  const percent = ((target + doc + tds) / base) * 100;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const payable = computeCompliancePaymentAmount({
    baseFreight: base,
    advancePercent: percent,
    documentationCharges: doc,
    tdsAmount: tds,
  });
  if (Math.round(payable * 100) !== Math.round(target * 100)) return null;
  return percent;
}

/**
 * A file amount is never replaced. When it differs from the current advance,
 * the percent is updated so the payable matches the file. A blank amount uses
 * the current payable.
 */
export function advancePostAmount(input: {
  fileAmount: number | null;
  payable: number | null;
  advancePercent: number | null;
  baseFreight?: number | null;
  documentationCharges?: number;
  tdsAmount?: number;
}): { amount: number | null; advancePercent: number | null; notice: string | null; tone: "preview" | "alert" | null; error: string | null } {
  const payable = input.payable;
  const currentPercent = input.advancePercent;
  const file = input.fileAmount;
  if (file == null || !Number.isFinite(file)) {
    if (payable == null || !Number.isFinite(payable) || payable <= 0) {
      return { amount: null, advancePercent: currentPercent, notice: null, tone: null, error: null };
    }
    const label = currentPercent != null && Number.isFinite(currentPercent) ? `${percentLabel(currentPercent)} · ` : "";
    return {
      amount: payable,
      advancePercent: currentPercent,
      notice: `Advance ${label}${rupees(payable)} will be posted.`,
      tone: "preview",
      error: null,
    };
  }
  if (payable != null && Number.isFinite(payable) && Math.round(file * 100) === Math.round(payable * 100)) {
    const label = currentPercent != null && Number.isFinite(currentPercent) ? `${percentLabel(currentPercent)} · ` : "";
    return { amount: file, advancePercent: currentPercent, notice: `Advance ${label}${rupees(file)}`, tone: "preview", error: null };
  }
  const nextPercent = percentForAdvancePayable({
    baseFreight: input.baseFreight ?? null,
    documentationCharges: input.documentationCharges ?? 0,
    tdsAmount: input.tdsAmount ?? 0,
    targetPayable: file,
  });
  if (nextPercent == null) {
    return {
      amount: file,
      advancePercent: null,
      notice: null,
      tone: null,
      error: `${rupees(file)} cannot be reached by changing the advance percent. The amount was not changed.`,
    };
  }
  const from = currentPercent != null && Number.isFinite(currentPercent) ? ` from ${percentLabel(currentPercent)}` : "";
  return {
    amount: file,
    advancePercent: nextPercent,
    notice: `Advance percent updated${from} to ${percentLabel(nextPercent)}. ${rupees(file)} will be posted.`,
    tone: "alert",
    error: null,
  };
}

/**
 * `per_mt` and `per_trip` only. A blank basis is the legacy untagged rate and
 * is read as per_trip (the indent column contract). Unknown values stay invalid.
 */
export function canonicalSupplierRateBasis(
  basis: string | null | undefined,
): "per_mt" | "per_trip" | null {
  const value = (basis ?? "").trim().toLowerCase();
  if (value === "per_mt") return "per_mt";
  if (value === "per_trip" || value === "") return "per_trip";
  return null;
}

/**
 * Same payable as `compliance_advance_calculation`: unrounded base freight,
 * TDS rounded to paise, slab charge, payable rounded to paise.
 * Percent outside 0–100 and a non-positive payable are rejected.
 */
export function quoteComplianceAdvance(input: {
  supplierRate: number | null | undefined;
  supplierRateBasis: string | null | undefined;
  loadTons: number | null | undefined;
  advancePercent: number;
  tdsRatePercent: number | null | undefined;
  documentation?: ComplianceDocumentChargeConfig | null;
}): {
  basis: "per_mt" | "per_trip";
  baseFreight: number;
  tdsAmount: number;
  documentationCharges: number;
  payable: number;
} {
  const basis = canonicalSupplierRateBasis(input.supplierRateBasis);
  if (!basis) throw new Error("supplier rate basis is not valid");
  const percent = Number(input.advancePercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("advance percent must be between 0 and 100");
  }
  const rate = Number(input.supplierRate);
  const tons = Number(input.loadTons);
  let baseFreight: number | null = null;
  if (basis === "per_mt") {
    if (Number.isFinite(rate) && rate > 0 && Number.isFinite(tons) && tons > 0) baseFreight = rate * tons;
  } else if (Number.isFinite(rate) && rate > 0) {
    baseFreight = rate;
  }
  if (baseFreight == null || baseFreight <= 0) {
    throw new Error("trip freight is not set; the advance cannot be approved");
  }
  const tdsAmount = computeComplianceTdsAmount(baseFreight, input.tdsRatePercent);
  const documentationCharges = resolveComplianceDocumentationCharge(
    input.documentation,
    baseFreight,
  ).amount;
  const payable = computeCompliancePaymentAmount({
    baseFreight,
    advancePercent: percent,
    documentationCharges,
    tdsAmount,
  });
  if (payable <= 0) throw new Error("calculated advance is not positive");
  return { basis, baseFreight, tdsAmount, documentationCharges, payable };
}
