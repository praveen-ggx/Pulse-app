/**
 * Compliance advance commercial terms for Finance Hub Summary:
 * base freight, vendor advance %, documentation charges, TDS, computed payable,
 * and any posted `compliance_advance` amount.
 *
 * Same formula / vault sources as CompliancePaymentConfirmModal.
 */
import { getDocumentChargeConfig } from "@/features/organization/services/documentCharges.service";
import { supabase } from "@/lib/supabase";
import { formatSlabRange } from "@/features/organization/utils/documentChargeSlabs.util";
import { fetchTripAdvanceLedger } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
  canonicalSupplierRateBasis,
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
  advancePercentSource: "vendor" | "default" | "approved";
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

export type TripSupplierFreight = {
  supplierRate: number | null;
  supplierRateBasis: string | null;
  loadTons: number | null;
};

/**
 * The compliance trip list comes from get_trips_for_org, which returns
 * supplier_rate but not supplier_rate_basis. Without the basis the amount
 * panel treats freight as unset. Read the stored terms for these trips.
 */
export async function readTripSupplierFreightByIds(
  tripIds: readonly string[],
): Promise<Map<string, TripSupplierFreight>> {
  const out = new Map<string, TripSupplierFreight>();
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase()
      .from("trips")
      .select("id, supplier_rate, supplier_rate_basis, load_tons, indent_id, source_indent_id")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const indentIds = [
      ...new Set(
        rows
          .filter((row) => !(row.supplier_rate_basis ?? "").trim())
          .map((row) => (row.indent_id ?? row.source_indent_id ?? "").trim())
          .filter((id) => id.length > 0),
      ),
    ];
    const indentBasis = new Map<string, string | null>();
    if (indentIds.length > 0) {
      const indentRead = await supabase()
        .from("indents")
        .select("id, supplier_rate_basis")
        .in("id", indentIds);
      if (!indentRead.error) {
        for (const indent of indentRead.data ?? []) {
          indentBasis.set(indent.id, indent.supplier_rate_basis ?? null);
        }
      }
    }
    for (const row of rows) {
      const indentId = (row.indent_id ?? row.source_indent_id ?? "").trim();
      const basis =
        (row.supplier_rate_basis ?? "").trim() ||
        (indentId ? indentBasis.get(indentId) : null) ||
        null;
      out.set(row.id, {
        supplierRate: row.supplier_rate == null ? null : Number(row.supplier_rate),
        supplierRateBasis: basis,
        loadTons: row.load_tons == null ? null : Number(row.load_tons),
      });
    }
  }
  return out;
}

export async function readTripSupplierFreight(tripId: string): Promise<TripSupplierFreight | null> {
  const map = await readTripSupplierFreightByIds([tripId]);
  return map.get(tripId.trim()) ?? null;
}

export function mergeSupplierFreight<
  T extends {
    supplier_rate?: number | null;
    supplier_rate_basis?: string | null;
    load_tons?: number | null;
  },
>(trip: T, freight: TripSupplierFreight | null): T {
  if (!freight) return trip;
  return {
    ...trip,
    supplier_rate: freight.supplierRate == null ? trip.supplier_rate : freight.supplierRate,
    supplier_rate_basis: freight.supplierRateBasis,
    load_tons: freight.loadTons == null ? trip.load_tons : freight.loadTons,
  };
}

function supplierBaseFreight(input: {
  supplierRate: number | null | undefined;
  supplierRateBasis: string | null | undefined;
  loadTons: number | null | undefined;
}): number | null {
  const basis = canonicalSupplierRateBasis(input.supplierRateBasis);
  if (!basis) return null;
  const rate = Number(input.supplierRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (basis === "per_mt") {
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
async function readApprovedAdvancePercent(tripId: string): Promise<number | null> {
  const { data, error } = await supabase()
    .from("payment_requests")
    .select("terms_snapshot")
    .eq("trip_id", tripId)
    .eq("payment_type", "advance")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const snapshot = data[0].terms_snapshot as { advance_percent?: number | string } | null;
  const percent = Number(snapshot?.advance_percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent;
}

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

  const [tdsResult, profileResult, docChargeResult, ledger, freight, approved] = await Promise.all([
    listSupplierTdsRates(orgId, supplierId),
    getVendorOnboardingProfile(orgId, supplierId),
    getDocumentChargeConfig(orgId),
    fetchTripAdvanceLedger(tripId),
    readTripSupplierFreight(tripId).catch(() => null),
    readApprovedAdvancePercent(tripId),
  ]);

  const baseFreight = supplierBaseFreight(
    freight
      ? {
          supplierRate: freight.supplierRate,
          supplierRateBasis: freight.supplierRateBasis,
          loadTons: freight.loadTons,
        }
      : input,
  );

  const resolvedTds = resolveComplianceTdsRate(tdsResult.rates);
  const tdsRatePercent = resolvedTds?.ratePercent ?? null;
  const tdsFinancialYear = resolvedTds?.financialYear ?? null;
  const tdsAmount = computeComplianceTdsAmount(baseFreight ?? 0, tdsRatePercent);

  const adv = profileResult.profile?.advance_percentage;
  const vendorPct =
    adv != null && Number.isFinite(Number(adv)) ? Number(adv) : null;
  const advancePercent =
    approved != null
      ? approved
      : vendorPct != null
        ? Math.min(100, Math.max(0, vendorPct))
        : COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
  const advancePercentSource: "vendor" | "default" | "approved" =
    approved != null ? "approved" : vendorPct != null ? "vendor" : "default";

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

function quoteFromVaultTerms(
  input: {
    supplierRate: number | null | undefined;
    supplierRateBasis: string | null | undefined;
    loadTons: number | null | undefined;
  },
  profile: VendorOnboardingProfile | null,
  rates: SupplierTdsRate[],
  docCharge: Awaited<ReturnType<typeof getDocumentChargeConfig>>["data"],
): { payable: number; percent: number } | null {
  const baseFreight = supplierBaseFreight(input);
  if (baseFreight == null || baseFreight <= 0) return null;
  const resolvedTds = resolveComplianceTdsRate(rates);
  const tdsAmount = computeComplianceTdsAmount(baseFreight, resolvedTds?.ratePercent ?? null);
  const adv = profile?.advance_percentage;
  const vendorPct = adv != null && Number.isFinite(Number(adv)) ? Number(adv) : null;
  const percent =
    vendorPct != null
      ? Math.min(100, Math.max(0, vendorPct))
      : COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
  const documentationCharges = resolveComplianceDocumentationCharge(docCharge, baseFreight).amount;
  const payable = computeCompliancePaymentAmount({
    baseFreight,
    advancePercent: percent,
    documentationCharges,
    tdsAmount,
  });
  if (payable <= 0) return null;
  return { payable, percent, baseFreight, tdsAmount, documentationCharges };
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
  return quoteFromVaultTerms(input, profile, rates, docCharge)?.payable ?? 0;
}

/** Supplier advance percent, or 90 when the supplier has none, with the payable it produces. */
export async function quoteAdvancePayablesForTrips(
  organizationId: string,
  trips: Array<{ id: string; supplierId: string | null }>,
): Promise<Map<string, { payable: number; percent: number; baseFreight: number; tdsAmount: number; documentationCharges: number }>> {
  const out = new Map<string, { payable: number; percent: number; baseFreight: number; tdsAmount: number; documentationCharges: number }>();
  const rows = trips.filter((trip) => trip.id.trim());
  if (!organizationId.trim() || rows.length === 0) return out;
  const freightByTrip = await readTripSupplierFreightByIds(rows.map((trip) => trip.id));
  const doc = await getDocumentChargeConfig(organizationId);
  const supplierIds = [...new Set(rows.map((trip) => (trip.supplierId ?? "").trim()).filter(Boolean))];
  const terms = new Map<string, { profile: VendorOnboardingProfile | null; rates: SupplierTdsRate[] }>();
  await mapWithConcurrency(supplierIds, TERMS_FETCH_CONCURRENCY, async (supplierId) => {
    const [tdsResult, profileResult] = await Promise.all([
      listSupplierTdsRates(organizationId, supplierId),
      getVendorOnboardingProfile(organizationId, supplierId),
    ]);
    terms.set(supplierId, { profile: profileResult.profile, rates: tdsResult.rates });
  });
  for (const trip of rows) {
    const freight = freightByTrip.get(trip.id);
    if (!freight) continue;
    const supplierId = (trip.supplierId ?? "").trim();
    const vault = supplierId ? terms.get(supplierId) : undefined;
    const quote = quoteFromVaultTerms(
      freight,
      vault?.profile ?? null,
      vault?.rates ?? [],
      doc.data,
    );
    if (quote) out.set(trip.id, quote);
  }
  return out;
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

  const freightByTrip = await readTripSupplierFreightByIds(summaries.map((summary) => summary.trip.id)).catch(
    () => new Map<string, TripSupplierFreight>(),
  );

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
    const freight = freightByTrip.get(summary.trip.id);
    out[summary.trip.id] = payableFromVaultTerms(
      freight
        ? {
            supplierRate: freight.supplierRate,
            supplierRateBasis: freight.supplierRateBasis,
            loadTons: freight.loadTons,
          }
        : {
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
