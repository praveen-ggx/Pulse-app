/**
 * Client sale snapshot: persist ₹/MT (or trip total) so indent → trip and
 * after-load weight can recompute client_price.
 */
export type SaleRateBasis = "per_mt" | "per_trip";

export type SaleRateSnapshot = {
  sale_rate_basis: SaleRateBasis;
  sale_unit_rate: number | null;
  lane_id: string | null;
};

export function parsePositiveTons(
  tonsInput: string | number | null | undefined,
): number | null {
  const tons =
    typeof tonsInput === "number"
      ? tonsInput
      : parseFloat(String(tonsInput ?? "").replace(/,/g, ""));
  if (!Number.isFinite(tons) || tons <= 0) return null;
  return tons;
}

export function parsePositiveAmount(
  raw: string | number | null | undefined,
): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Total billed to the client. Per-MT with no tons yet → 0 (not billable).
 * Per-MT keeps the exact rate × weight product (no rupee rounding) so the
 * saved client_price matches the commercial formula (e.g. 2520 × 29.877 =
 * 75290.04). Per-trip stays a whole-rupee flat total.
 */
export function computeClientPrice(opts: {
  basis: SaleRateBasis;
  unitRate: number | null | undefined;
  tons: number | null | undefined;
  flatPrice?: number | null | undefined;
}): number {
  if (opts.basis === "per_mt") {
    const unit = opts.unitRate != null && opts.unitRate > 0 ? opts.unitRate : null;
    const tons = opts.tons != null && opts.tons > 0 ? opts.tons : null;
    if (unit == null || tons == null) return 0;
    return unit * tons;
  }
  const flat = opts.flatPrice;
  return flat != null && Number.isFinite(flat) && flat > 0 ? Math.round(flat) : 0;
}

/** Persist/display the sale total without re-rounding per-MT decimals away. */
export function formatSaleAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (Number.isInteger(n)) return String(n);
  // Trim binary float tails; keep real paise (e.g. 75290.04).
  return String(Number(n.toFixed(6)));
}

export function hasConvertibleSale(opts: {
  basis: SaleRateBasis | null | undefined;
  unitRate: number | null | undefined;
  clientPrice: number | null | undefined;
}): boolean {
  if (opts.clientPrice != null && opts.clientPrice > 0) return true;
  return opts.basis === "per_mt" && (opts.unitRate ?? 0) > 0;
}
