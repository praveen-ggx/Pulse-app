/**
 * Compliance advance commercial terms for Finance Hub Summary:
 * base freight, vendor advance %, documentation charges, TDS, computed payable,
 * and any posted `compliance_advance` amount.
 *
 * Same formula / vault sources as CompliancePaymentConfirmModal.
 */
import { getDocumentChargeConfig } from "@/features/organization/services/documentCharges.service";
import { formatSlabRange } from "@/features/organization/utils/documentChargeSlabs.util";
import { fetchTripAdvanceLedger } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
  computeCompliancePaymentAmount,
  computeComplianceTdsAmount,
  resolveComplianceDocumentationCharge,
  resolveComplianceTdsRate,
} from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import { mapWithConcurrency } from "@/features/tripCompliance/utils/mapWithConcurrency.util";
import {
  getVendorOnboardingProfile,
  listSupplierTdsRates,
  type SupplierTdsRate,
  type VendorOnboardingProfile,
} from "@/features/suppliers/services/supplierVendorOnboarding.service";

const TERMS_FETCH_CONCURRENCY = 4;

export type ComplianceAdvanceFinanceBreakdown = {
  baseFreight: number | null;
  advancePercent: number;
  advancePercentSource: "vendor" | "default";
  documentationCharges: number;
  documentationChargeNote: string;
  tdsRatePercent: number | null;
  tdsFinancialYear: string | null;
  tdsAmount: number;
  computedAdvancePayable: number;
  postedAdvanceAmount: number | null;
  postedPaymentMode: string | null;
  postedUtr: string | null;
};

function supplierBaseFreight(input: {
  supplierRate: number | null | undefined;
  supplierRateBasis: string | null | undefined;
  loadTons: number | null | undefined;
}): number | null {
  const rate = Number(input.supplierRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (input.supplierRateBasis === "per_mt") {
    const tons = Number(input.loadTons);
    if (Number.isFinite(tons) && tons > 0) return rate * tons;
    return null;
  }
  return rate;
}

function documentationChargeNote(
  reason: "slab" | "disabled" | "no_slab" | "no_freight",
  slab: { from: number; to: number | null } | null,
): string {
  if (reason === "slab" && slab) {
    return `Slab ₹${formatSlabRange(slab)} · on base freight`;
  }
  if (reason === "no_slab") return "No slab covers this base freight";
  if (reason === "no_freight") return "Base freight not set";
  return "Document charges are off for this org";
}

/**
 * Load Compliance advance math for one trip (Finance Hub Summary).
 * Returns null when there is no supplier to resolve vault terms against.
 */
export async function fetchComplianceAdvanceFinanceBreakdown(input: {
  orgId: string;
  tripId: string;
  supplierId: string | null | undefined;
  supplierRate: number | null | undefined;
  supplierRateBasis: string | null | undefined;
  loadTons: number | null | undefined;
}): Promise<ComplianceAdvanceFinanceBreakdown | null> {
  const orgId = input.orgId.trim();
  const tripId = input.tripId.trim();
  const supplierId = (input.supplierId ?? "").trim();
  if (!orgId || !tripId || !supplierId) return null;

  const baseFreight = supplierBaseFreight(input);

  const [tdsResult, profileResult, docChargeResult, ledger] = await Promise.all([
    listSupplierTdsRates(orgId, supplierId),
    getVendorOnboardingProfile(orgId, supplierId),
    getDocumentChargeConfig(orgId),
    fetchTripAdvanceLedger(tripId),
  ]);

  const resolvedTds = resolveComplianceTdsRate(tdsResult.rates);
  const tdsRatePercent = resolvedTds?.ratePercent ?? null;
  const tdsFinancialYear = resolvedTds?.financialYear ?? null;
  const tdsAmount = computeComplianceTdsAmount(baseFreight ?? 0, tdsRatePercent);

  const adv = profileResult.profile?.advance_percentage;
  const vendorPct =
    adv != null && Number.isFinite(Number(adv)) ? Number(adv) : null;
  const advancePercent =
    vendorPct != null
      ? Math.min(100, Math.max(0, vendorPct))
      : COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
  const advancePercentSource: "vendor" | "default" =
    vendorPct != null ? "vendor" : "default";

  const docResolved = resolveComplianceDocumentationCharge(
    docChargeResult.data,
    baseFreight,
  );
  const documentationCharges = docResolved.amount;
  const documentationChargeNoteText = documentationChargeNote(
    docResolved.reason,
    docResolved.slab,
  );

  const computedAdvancePayable = computeCompliancePaymentAmount({
    baseFreight: baseFreight ?? 0,
    advancePercent,
    documentationCharges,
    tdsAmount,
  });

  const posted = ledger.complianceAdvance;
  const postedAdvanceAmount =
    posted != null && Number.isFinite(Number(posted.amount))
      ? Number(posted.amount)
      : null;

  return {
    baseFreight,
    advancePercent,
    advancePercentSource,
    documentationCharges,
    documentationChargeNote: documentationChargeNoteText,
    tdsRatePercent,
    tdsFinancialYear,
    tdsAmount,
    computedAdvancePayable,
    postedAdvanceAmount,
    postedPaymentMode: posted?.paymentMode?.trim() || null,
    postedUtr: posted?.utr?.trim() || null,
  };
}

function payableFromVaultTerms(
  input: {
    supplierRate: number | null | undefined;
    supplierRateBasis: string | null | undefined;
    loadTons: number | null | undefined;
  },
  profile: VendorOnboardingProfile | null,
  rates: SupplierTdsRate[],
  docCharge: Awaited<ReturnType<typeof getDocumentChargeConfig>>["data"],
): number {
  const baseFreight = supplierBaseFreight(input);
  const resolvedTds = resolveComplianceTdsRate(rates);
  const tdsAmount = computeComplianceTdsAmount(baseFreight ?? 0, resolvedTds?.ratePercent ?? null);
  const adv = profile?.advance_percentage;
  const vendorPct = adv != null && Number.isFinite(Number(adv)) ? Number(adv) : null;
  const advancePercent =
    vendorPct != null
      ? Math.min(100, Math.max(0, vendorPct))
      : COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
  const documentationCharges = resolveComplianceDocumentationCharge(docCharge, baseFreight).amount;
  return computeCompliancePaymentAmount({
    baseFreight: baseFreight ?? 0,
    advancePercent,
    documentationCharges,
    tdsAmount,
  });
}

/**
 * Computed advance payable for many pending trips. One vault read per unique
 * supplier (not 4 requests per trip) and no ledger — export only needs the amount.
 */
export async function fetchComplianceAdvancePayablesForTrips(
  fallbackOrgId: string,
  summaries: ComplianceTripSummary[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (summaries.length === 0) return out;

  const orgIds = new Set<string>();
  const supplierKeys: { orgId: string; supplierId: string }[] = [];
  const seenSupplier = new Set<string>();
  for (const summary of summaries) {
    const orgId = (summary.trip.organization_id ?? fallbackOrgId).trim() || fallbackOrgId;
    const supplierId = summary.trip.supplier_id?.trim() || "";
    if (orgId) orgIds.add(orgId);
    if (!orgId || !supplierId) continue;
    const key = `${orgId}:${supplierId}`;
    if (seenSupplier.has(key)) continue;
    seenSupplier.add(key);
    supplierKeys.push({ orgId, supplierId });
  }

  const docByOrg = new Map<string, Awaited<ReturnType<typeof getDocumentChargeConfig>>["data"]>();
  await mapWithConcurrency([...orgIds], 2, async (orgId) => {
    const { data } = await getDocumentChargeConfig(orgId);
    docByOrg.set(orgId, data);
  });

  const terms = new Map<string, { profile: VendorOnboardingProfile | null; rates: SupplierTdsRate[] }>();
  await mapWithConcurrency(supplierKeys, TERMS_FETCH_CONCURRENCY, async ({ orgId, supplierId }) => {
    const [tdsResult, profileResult] = await Promise.all([
      listSupplierTdsRates(orgId, supplierId),
      getVendorOnboardingProfile(orgId, supplierId),
    ]);
    terms.set(`${orgId}:${supplierId}`, {
      profile: profileResult.profile,
      rates: tdsResult.rates,
    });
  });

  for (const summary of summaries) {
    const orgId = (summary.trip.organization_id ?? fallbackOrgId).trim() || fallbackOrgId;
    const supplierId = summary.trip.supplier_id?.trim() || "";
    if (!orgId || !supplierId) continue;
    const vault = terms.get(`${orgId}:${supplierId}`);
    if (!vault) continue;
    out[summary.trip.id] = payableFromVaultTerms(
      {
        supplierRate: summary.trip.supplier_rate,
        supplierRateBasis:
          (summary.trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null,
        loadTons: summary.trip.load_tons ?? null,
      },
      vault.profile,
      vault.rates,
      docByOrg.get(orgId) ?? null,
    );
  }
  return out;
}
