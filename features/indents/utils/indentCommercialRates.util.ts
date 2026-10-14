/**
 * Show a quoted rate as both ₹/MT and a trip total when weight makes the
 * conversion possible. `indents.weight` is kilograms; rates are per metric tonne.
 */
import { formatINR } from "@/lib/format";

export type CommercialRateBasis = "per_mt" | "per_trip";

export type CommercialRatePair = {
  /** ₹ per metric tonne, when that figure is known. */
  perMt: number | null;
  /** Trip total in ₹, when that figure is known. */
  overall: number | null;
};

export type CommercialLines = {
  perMt: string | null;
  overall: string | null;
};

function positiveAmount(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function tonnesFromKg(weightKg: number | null | undefined): number | null {
  const kg = positiveAmount(weightKg);
  return kg == null ? null : kg / 1000;
}

function pairFromQuotedAmount(opts: {
  basis: CommercialRateBasis | string | null | undefined;
  amount: number | null | undefined;
  unitRate: number | null | undefined;
  weightKg: number | null | undefined;
}): CommercialRatePair {
  const amount = positiveAmount(opts.amount);
  const unitRate = positiveAmount(opts.unitRate);
  const tonnes = tonnesFromKg(opts.weightKg);

  if (opts.basis === "per_mt") {
    const perMt =
      unitRate ??
      (amount != null && tonnes != null ? Math.round(amount / tonnes) : null);
    if (perMt == null) return { perMt: null, overall: amount };
    // When the stored amount is the unit rate itself, it is not a trip total.
    const storedTotal =
      amount != null && amount !== perMt ? amount : null;
    const overall =
      storedTotal ??
      (tonnes != null ? Math.round(perMt * tonnes) : null);
    return { perMt, overall: positiveAmount(overall) };
  }

  if (amount == null && unitRate == null) return { perMt: null, overall: null };
  const overall = amount;
  const perMt =
    unitRate ??
    (overall != null && tonnes != null ? Math.round(overall / tonnes) : null);
  return { perMt, overall };
}

/** Supplier target: the stored number is ₹/MT on a per-MT load, otherwise a trip total. */
export function supplierCommercialRates(opts: {
  basis: CommercialRateBasis | string | null | undefined;
  supplierTarget: number | null | undefined;
  weightKg: number | null | undefined;
}): CommercialRatePair {
  return pairFromQuotedAmount({
    basis: opts.basis,
    amount: opts.supplierTarget,
    unitRate: opts.basis === "per_mt" ? opts.supplierTarget : null,
    weightKg: opts.weightKg,
  });
}

/**
 * Client sale: `client_price` is the trip total when it has been computed.
 * `sale_unit_rate` is the ₹/MT figure on a per-MT load.
 */
export function clientCommercialRates(opts: {
  basis: CommercialRateBasis | string | null | undefined;
  clientPrice: number | null | undefined;
  saleUnitRate: number | null | undefined;
  weightKg: number | null | undefined;
}): CommercialRatePair {
  return pairFromQuotedAmount({
    basis: opts.basis,
    amount: opts.clientPrice,
    unitRate: opts.saleUnitRate,
    weightKg: opts.weightKg,
  });
}

export function formatCommercialLines(pair: CommercialRatePair): CommercialLines {
  return {
    perMt: pair.perMt != null ? `${formatINR(pair.perMt)}/MT` : null,
    overall: pair.overall != null ? formatINR(pair.overall) : null,
  };
}

/**
 * Margin on comparable units. Prefer ₹/MT when both sides have it, otherwise
 * trip totals. Mixed units (one side only ₹/MT, the other only a total) are
 * left blank rather than compared.
 */
export function commercialMarginPct(
  client: CommercialRatePair,
  supplier: CommercialRatePair,
): number | null {
  if (client.perMt != null && supplier.perMt != null && client.perMt > 0) {
    return Math.round(((client.perMt - supplier.perMt) / client.perMt) * 100);
  }
  if (client.overall != null && supplier.overall != null && client.overall > 0) {
    return Math.round(((client.overall - supplier.overall) / client.overall) * 100);
  }
  return null;
}
