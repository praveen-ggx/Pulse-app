/**
 * Client Performance Analytics — pure compute utilities.
 * ============================================================================
 *
 * Powers `<ClientAnalyticsTab>`. All functions side-effect-free and
 * memoizable. Consumes the already-loaded `trips` + `transactions` arrays
 * scoped to a single client by `ClientDetailScreen`, so no new fetches.
 *
 * Sections covered:
 *   • Header KPIs (revenue, margin, trips, outstanding, growth, …)
 *   • Monthly trend (revenue + margin + collected per month)
 *   • Lane breakdown (top routes by revenue)
 *   • Load-type breakdown (sub for "vehicle-type revenue" — TripRow has
 *     no vehicle_type column without a vehicles join)
 *   • Profitability metrics (revenue/trip, profit/km, etc.)
 *   • Payment aging buckets (0-30 / 31-60 / 61-90 / 90+)
 *   • Payment delay heatmap (rows=months, cols=aging buckets)
 *   • Operational metrics (on-time %, cancellation, disputes)
 *   • Auto insights derivation
 *
 * Window: last 12 months by default (override via `windowMonths`).
 */

import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatCityStateLabel, formatLaneRouteLabel } from "@/lib/placeCityState.util";

import type {
  AnalyticsInsight,
  ClientKpiHeader,
  HeatmapCell,
} from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function tripDate(t: TripRow): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function txnDate(tx: LedgerRow): Date | null {
  const raw = tx.transaction_date ?? tx.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelShort(key: string): string {
  const idx = parseInt(key.slice(5, 7), 10) - 1;
  return MONTH_SHORT[idx] ?? key.slice(5, 7);
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Asset-operated (own fleet) vs supplier/market-operated. */
export type ClientOpModelKind = "asset" | "supplier";

export function tripLaneLabel(t: TripRow): string {
  const pickup = formatCityStateLabel(t.pickup_area);
  const drop = formatCityStateLabel(t.drop_location);
  return formatLaneRouteLabel(pickup, drop) || "Unspecified lane";
}

function laneLabel(t: TripRow): string {
  return tripLaneLabel(t);
}

export function tripLoadTypeLabel(t: TripRow): string {
  return (t.load_type ?? "").trim() || "Unspecified";
}

export type AgingBucketKey =
  | "bucket0_30"
  | "bucket31_60"
  | "bucket61_90"
  | "bucket90Plus";

export const AGING_BUCKET_LABEL: Record<AgingBucketKey, string> = {
  bucket0_30: "0-30d",
  bucket31_60: "31-60d",
  bucket61_90: "61-90d",
  bucket90Plus: "90+d",
};

export function agingLabelToBucket(label: string): AgingBucketKey | null {
  const found = (Object.entries(AGING_BUCKET_LABEL) as [AgingBucketKey, string][]).find(
    ([, value]) => value === label,
  );
  return found?.[0] ?? null;
}

export type PartyChartFilterSkip =
  | "lane"
  | "month"
  | "load"
  | "aging"
  | "client"
  | "party"
  | null;

export function applyPartyChartFilters(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  filters: {
    lane?: string | null;
    monthKey?: string | null;
    loadType?: string | null;
    agingLabel?: string | null;
    clientLabel?: string | null;
    otherClientLabels?: ReadonlySet<string>;
    partyLabel?: string | null;
    partyLabelFor?: (t: TripRow) => string;
    otherPartyLabels?: ReadonlySet<string>;
    agingMode?: "receivable" | "payable";
  },
  skip?: PartyChartFilterSkip,
): TripRow[] {
  let next = [...trips];
  if (filters.lane && skip !== "lane") {
    next = next.filter((t) => tripLaneLabel(t) === filters.lane);
  }
  if (filters.monthKey && skip !== "month") {
    next = next.filter((t) => {
      const d = tripDate(t);
      if (!d) return false;
      return monthKey(d) === filters.monthKey;
    });
  }
  if (filters.loadType && skip !== "load") {
    next = next.filter((t) => tripLoadTypeLabel(t) === filters.loadType);
  }
  if (filters.agingLabel && skip !== "aging") {
    const bucket = agingLabelToBucket(filters.agingLabel);
    if (bucket) {
      const open =
        filters.agingMode === "payable"
          ? listOpenPayableTrips(next, txns, { bucket })
          : listOpenReceivableTrips(next, txns, { bucket });
      const ids = new Set(open.map((row) => row.trip.id));
      next = next.filter((t) => ids.has(t.id));
    }
  }
  if (filters.clientLabel && skip !== "client") {
    next = next.filter((t) => {
      const label = (t.client_name ?? "").trim() || "Unassigned";
      if (filters.clientLabel === "Others") {
        return !filters.otherClientLabels?.has(label);
      }
      return label === filters.clientLabel;
    });
  }
  if (filters.partyLabel && skip !== "party" && filters.partyLabelFor) {
    next = next.filter((t) => {
      const label = filters.partyLabelFor?.(t) ?? "Unassigned";
      if (filters.partyLabel === "Others") {
        return !filters.otherPartyLabels?.has(label);
      }
      return label === filters.partyLabel;
    });
  }
  return next;
}

function tripRevenueAmount(t: TripRow): number {
  return Math.max(0, asNumber(t.client_price));
}

function tripCostAmount(t: TripRow): number {
  return Math.max(0, asNumber(t.supplier_rate));
}

/** Prefer stored margin; fall back to revenue − supplier rate. */
function tripMarginAmount(t: TripRow): number {
  const stored = Number(t.margin);
  if (Number.isFinite(stored)) return stored;
  return tripRevenueAmount(t) - tripCostAmount(t);
}

/**
 * Asset = own fleet execution; supplier = market / aggregate operated.
 * Uses the same canonical model as trip detail / accounting.
 */
export function tripOpModelKind(t: TripRow): ClientOpModelKind {
  const source = String(t.source ?? "").trim().toLowerCase();
  if (source === "mover_asset") return "asset";
  const mode = String(t.trip_payout_mode ?? "").trim().toLowerCase();
  if (mode === "asset") return "asset";
  if (mode === "market") return "supplier";
  const hasOwnDriver = String(t.driver_id ?? "").trim().length > 0;
  const hasOwnVehicle = String(t.vehicle_id ?? "").trim().length > 0;
  if (hasOwnDriver && hasOwnVehicle) return "asset";
  if (String(t.supplier_id ?? "").trim()) return "supplier";
  return "asset";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientMonthlyTrendPoint {
  monthKey: string;
  label: string;
  revenue: number;
  margin: number;
  marginPct: number;
  trips: number;
  collected: number;
  outstanding: number;
  avgDelayDays: number;
  onTimePct: number;
  cancellationPct: number;
}

export interface ClientLaneBreakdown {
  id: string;
  label: string;
  revenue: number;
  trips: number;
  margin: number;
  marginPct: number;
}

export interface ClientContributionRow {
  id: string;
  label: string;
  revenue: number;
  trips: number;
  contributionPct: number;
}

export interface ClientLoadTypeBreakdown {
  id: string;
  label: string;
  revenue: number;
  trips: number;
}

export interface ClientOpModelMargin {
  id: ClientOpModelKind;
  label: string;
  trips: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Share of total margin (can be >100 or negative when mix has losses). */
  contributionPct: number;
}

export interface ClientLaneMarginContribution {
  id: string;
  label: string;
  trips: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  assetMargin: number;
  supplierMargin: number;
  assetTrips: number;
  supplierTrips: number;
  /** Share of total period margin. */
  contributionPct: number;
}

export interface ClientProfitabilityMetrics {
  revenue: number;
  cost: number;
  netMargin: number;
  marginPct: number;
  profitPerKm: number;
  revenuePerTrip: number;
  totalKm: number;
  tripsCount: number;
}

export interface ClientPaymentAging {
  outstanding: number;
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalOverdueTrips: number;
}

export interface ClientOperationalMetrics {
  tripsTotal: number;
  tripsCompleted: number;
  tripsCancelled: number;
  tripsInProgress: number;
  onTimePct: number;
  onTimeEligible: number;
  onTime: number;
  cancellationPct: number;
  completionPct: number;
  disputedCount: number;
  averageTurnaroundDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-trip payment attribution
// ─────────────────────────────────────────────────────────────────────────────

/** Map trip id → collected receipts for this client. Inbound txns
 *  (`amount_in > 0`) attached to a trip are treated as client payment
 *  receipts. Used by aging + collection-efficiency math. */
function buildPaymentByTripMap(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
): Map<string, { paid: number; lastTxDate: Date | null }> {
  const map = new Map<string, { paid: number; lastTxDate: Date | null }>();
  const tripIds = new Set(trips.map((t) => t.id));
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    const amt = asNumber(tx.amount_in);
    if (amt <= 0) continue;
    const txDate = txnDate(tx);
    const entry = map.get(tx.trip_id) ?? { paid: 0, lastTxDate: null };
    entry.paid += amt;
    if (txDate && (!entry.lastTxDate || txDate > entry.lastTxDate)) {
      entry.lastTxDate = txDate;
    }
    map.set(tx.trip_id, entry);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Header
// ─────────────────────────────────────────────────────────────────────────────

export function computeClientKpiHeader(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; windowMonths?: number } = {},
): ClientKpiHeader {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const halfStart = new Date(now);
  halfStart.setMonth(halfStart.getMonth() - Math.floor(windowMonths / 2));

  let revenue = 0;
  let margin = 0;
  let tripCount = 0;
  let recentRevenue = 0;
  let priorRevenue = 0;
  const lanes = new Set<string>();
  const paymentByTrip = buildPaymentByTripMap(trips, txns);
  let collected = 0;
  const delays: number[] = [];

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < windowStart) continue;
    revenue += asNumber(t.client_price);
    margin += asNumber(t.margin);
    tripCount += 1;
    const lane = laneLabel(t);
    if (lane !== "Unspecified lane") lanes.add(lane);
    if (d >= halfStart) recentRevenue += asNumber(t.client_price);
    else priorRevenue += asNumber(t.client_price);

    const pay = paymentByTrip.get(t.id);
    if (pay) {
      collected += pay.paid;
      if (t.pickup_date && pay.lastTxDate) {
        const pickup = new Date(t.pickup_date);
        if (Number.isFinite(pickup.getTime())) {
          const days = Math.round(
            (pay.lastTxDate.getTime() - pickup.getTime()) / MS_PER_DAY,
          );
          if (days > 0) delays.push(days);
        }
      }
    }
  }

  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const profitabilityPct = marginPct; // alias for spec wording
  const outstanding = Math.max(revenue - collected, 0);
  const avgPaymentDelayDays =
    delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
  const businessGrowthPct =
    priorRevenue > 0
      ? ((recentRevenue - priorRevenue) / priorRevenue) * 100
      : recentRevenue > 0
        ? 100
        : 0;

  return {
    totalRevenue: revenue,
    netMargin: margin,
    marginPct: Math.round(marginPct * 100) / 100,
    tripCount,
    outstanding,
    avgPaymentDelayDays: Math.round(avgPaymentDelayDays * 10) / 10,
    profitabilityPct: Math.round(profitabilityPct * 100) / 100,
    activeRoutes: lanes.size,
    businessGrowthPct: Math.round(businessGrowthPct * 10) / 10,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly trend
// ─────────────────────────────────────────────────────────────────────────────

export function computeClientMonthlyTrend(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; monthsBack?: number } = {},
): ClientMonthlyTrendPoint[] {
  const now = options.now ?? new Date();
  const monthsBack = options.monthsBack ?? 12;

  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  const paymentByTrip = buildPaymentByTripMap(trips, txns);

  return keys.map((key) => {
    let revenue = 0;
    let margin = 0;
    let tripsInMonth = 0;
    let collected = 0;
    let outstanding = 0;
    let onTime = 0;
    let onTimeEligible = 0;
    let cancelled = 0;
    const delays: number[] = [];

    for (const t of trips) {
      const d = tripDate(t);
      if (!d || monthKey(d) !== key) continue;
      const price = asNumber(t.client_price);
      revenue += price;
      margin += asNumber(t.margin);
      tripsInMonth += 1;
      if (t.status === "cancelled") cancelled += 1;
      const pay = paymentByTrip.get(t.id);
      const paid = pay?.paid ?? 0;
      collected += Math.min(paid, price);
      outstanding += Math.max(price - paid, 0);
      if (pay?.lastTxDate && t.pickup_date) {
        const pickup = new Date(t.pickup_date);
        if (Number.isFinite(pickup.getTime())) {
          const days = Math.round(
            (pay.lastTxDate.getTime() - pickup.getTime()) / MS_PER_DAY,
          );
          if (days > 0) delays.push(days);
        }
      }
      if (t.completed_at && t.pickup_date) {
        onTimeEligible += 1;
        const completed = new Date(t.completed_at);
        const pickup = new Date(t.pickup_date);
        if (
          Number.isFinite(completed.getTime()) &&
          Number.isFinite(pickup.getTime())
        ) {
          if (completed <= new Date(pickup.getTime() + MS_PER_DAY)) onTime += 1;
        }
      }
    }

    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
    return {
      monthKey: key,
      label: monthLabelShort(key),
      revenue,
      margin,
      marginPct: Math.round(marginPct * 100) / 100,
      trips: tripsInMonth,
      collected,
      outstanding,
      avgDelayDays:
        delays.length > 0
          ? Math.round(
              (delays.reduce((a, b) => a + b, 0) / delays.length) * 10,
            ) / 10
          : 0,
      onTimePct:
        onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
      cancellationPct:
        tripsInMonth > 0 ? Math.round((cancelled / tripsInMonth) * 100) : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane / load-type breakdowns
// ─────────────────────────────────────────────────────────────────────────────

export function computeLaneBreakdown(
  trips: readonly TripRow[],
  options: {
    topN?: number;
    now?: Date;
    windowMonths?: number;
    /** Use supplier_rate instead of client_price (partner spend view). */
    valueMode?: "revenue" | "spend";
  } = {},
): ClientLaneBreakdown[] {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const asSpend = options.valueMode === "spend";

  const map = new Map<
    string,
    { revenue: number; trips: number; margin: number }
  >();
  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    const lane = laneLabel(t);
    const entry = map.get(lane) ?? { revenue: 0, trips: 0, margin: 0 };
    entry.revenue += asSpend ? asNumber(t.supplier_rate) : asNumber(t.client_price);
    entry.margin += tripMarginAmount(t);
    entry.trips += 1;
    map.set(lane, entry);
  }

  const rows: ClientLaneBreakdown[] = Array.from(map.entries()).map(
    ([label, agg]) => ({
      id: label,
      label,
      revenue: agg.revenue,
      trips: agg.trips,
      margin: agg.margin,
      marginPct:
        agg.revenue > 0
          ? Math.round((agg.margin / agg.revenue) * 1000) / 10
          : 0,
    }),
  );
  rows.sort((a, b) => b.revenue - a.revenue);
  return rows.slice(0, options.topN ?? 5);
}

export function tripSupplierLabel(t: TripRow): string {
  return (t.supplier_name ?? "").trim() || "Unassigned";
}

export function tripDriverLabel(t: TripRow): string {
  const raw = (t.driver_display_name ?? "").trim();
  if (!raw || /^driver$/i.test(raw)) return "Unassigned";
  return raw;
}

export function tripVehicleLabel(t: TripRow): string {
  return (t.vehicle_display_number ?? "").trim() || "Unassigned";
}

/** Fleet view — share of billed / paid amount by party name. */
export function computePartyContribution(
  trips: readonly TripRow[],
  options: {
    topN?: number;
    labelFor: (t: TripRow) => string;
    valueFor?: (t: TripRow) => number;
  },
): ClientContributionRow[] {
  const valueFor = options.valueFor ?? tripRevenueAmount;
  const map = new Map<string, { id: string; label: string; revenue: number; trips: number }>();
  for (const t of trips) {
    const label = options.labelFor(t).trim() || "Unassigned";
    const key = label.toLowerCase();
    const entry = map.get(key) ?? { id: key, label, revenue: 0, trips: 0 };
    entry.revenue += valueFor(t);
    entry.trips += 1;
    if (label !== "Unassigned") entry.label = label;
    map.set(key, entry);
  }

  const ranked = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  const total = ranked.reduce((sum, row) => sum + row.revenue, 0);
  const topN = options.topN ?? 6;
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  if (rest.length > 0) {
    top.push({
      id: "others",
      label: "Others",
      revenue: rest.reduce((sum, row) => sum + row.revenue, 0),
      trips: rest.reduce((sum, row) => sum + row.trips, 0),
    });
  }

  return top.map((row) => ({
    ...row,
    contributionPct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
  }));
}

export function computeCustomerContribution(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
): ClientContributionRow[] {
  return computePartyContribution(trips, {
    topN: options.topN,
    labelFor: (t) => (t.client_name ?? "").trim() || "Unassigned",
    valueFor: tripRevenueAmount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Margin analysis — lane contribution + asset vs supplier operation
// ─────────────────────────────────────────────────────────────────────────────

export function computeOpModelMarginContribution(
  trips: readonly TripRow[],
): ClientOpModelMargin[] {
  const buckets: Record<
    ClientOpModelKind,
    { trips: number; revenue: number; cost: number; margin: number }
  > = {
    asset: { trips: 0, revenue: 0, cost: 0, margin: 0 },
    supplier: { trips: 0, revenue: 0, cost: 0, margin: 0 },
  };

  for (const t of trips) {
    const kind = tripOpModelKind(t);
    const b = buckets[kind];
    b.trips += 1;
    b.revenue += tripRevenueAmount(t);
    b.cost += tripCostAmount(t);
    b.margin += tripMarginAmount(t);
  }

  const totalMargin = buckets.asset.margin + buckets.supplier.margin;
  const absTotal = Math.abs(totalMargin);

  const labelFor = (id: ClientOpModelKind) =>
    id === "asset" ? "Asset operated" : "Supplier operated";

  return (["asset", "supplier"] as const).map((id) => {
    const b = buckets[id];
    return {
      id,
      label: labelFor(id),
      trips: b.trips,
      revenue: b.revenue,
      cost: b.cost,
      margin: b.margin,
      marginPct:
        b.revenue > 0 ? Math.round((b.margin / b.revenue) * 1000) / 10 : 0,
      contributionPct:
        absTotal > 0
          ? Math.round((b.margin / totalMargin) * 1000) / 10
          : b.trips > 0
            ? 50
            : 0,
    };
  });
}

export function computeLaneMarginContribution(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
): ClientLaneMarginContribution[] {
  const map = new Map<
    string,
    {
      trips: number;
      revenue: number;
      cost: number;
      margin: number;
      assetMargin: number;
      supplierMargin: number;
      assetTrips: number;
      supplierTrips: number;
    }
  >();

  for (const t of trips) {
    const lane = laneLabel(t);
    const entry = map.get(lane) ?? {
      trips: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      assetMargin: 0,
      supplierMargin: 0,
      assetTrips: 0,
      supplierTrips: 0,
    };
    const rev = tripRevenueAmount(t);
    const cost = tripCostAmount(t);
    const margin = tripMarginAmount(t);
    const kind = tripOpModelKind(t);
    entry.trips += 1;
    entry.revenue += rev;
    entry.cost += cost;
    entry.margin += margin;
    if (kind === "asset") {
      entry.assetMargin += margin;
      entry.assetTrips += 1;
    } else {
      entry.supplierMargin += margin;
      entry.supplierTrips += 1;
    }
    map.set(lane, entry);
  }

  const totalMargin = Array.from(map.values()).reduce((s, e) => s + e.margin, 0);
  const absTotal = Math.abs(totalMargin);

  const rows: ClientLaneMarginContribution[] = Array.from(map.entries()).map(
    ([label, agg]) => ({
      id: label,
      label,
      trips: agg.trips,
      revenue: agg.revenue,
      cost: agg.cost,
      margin: agg.margin,
      marginPct:
        agg.revenue > 0
          ? Math.round((agg.margin / agg.revenue) * 1000) / 10
          : 0,
      assetMargin: agg.assetMargin,
      supplierMargin: agg.supplierMargin,
      assetTrips: agg.assetTrips,
      supplierTrips: agg.supplierTrips,
      contributionPct:
        absTotal > 0
          ? Math.round((agg.margin / totalMargin) * 1000) / 10
          : 0,
    }),
  );

  rows.sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin));
  return rows.slice(0, options.topN ?? 12);
}

export function computeLoadTypeBreakdown(
  trips: readonly TripRow[],
  options: {
    topN?: number;
    now?: Date;
    windowMonths?: number;
    valueMode?: "revenue" | "spend";
  } = {},
): ClientLoadTypeBreakdown[] {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const asSpend = options.valueMode === "spend";

  const map = new Map<string, { revenue: number; trips: number }>();
  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    const loadType = (t.load_type ?? "").trim() || "Unspecified";
    const entry = map.get(loadType) ?? { revenue: 0, trips: 0 };
    entry.revenue += asSpend ? asNumber(t.supplier_rate) : asNumber(t.client_price);
    entry.trips += 1;
    map.set(loadType, entry);
  }

  const rows = Array.from(map.entries()).map(([label, agg]) => ({
    id: label,
    label,
    revenue: agg.revenue,
    trips: agg.trips,
  }));
  rows.sort((a, b) => b.revenue - a.revenue);
  return rows.slice(0, options.topN ?? 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Profitability metrics
// ─────────────────────────────────────────────────────────────────────────────

export function computeProfitabilityMetrics(
  trips: readonly TripRow[],
  options: { now?: Date; windowMonths?: number } = {},
): ClientProfitabilityMetrics {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  let revenue = 0;
  let cost = 0;
  let totalKm = 0;
  let tripsCount = 0;

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    revenue += asNumber(t.client_price);
    cost += asNumber(t.supplier_rate);
    totalKm += asNumber(t.distance);
    tripsCount += 1;
  }
  const netMargin = revenue - cost;
  return {
    revenue,
    cost,
    netMargin,
    marginPct:
      revenue > 0 ? Math.round((netMargin / revenue) * 1000) / 10 : 0,
    profitPerKm: totalKm > 0 ? Math.round((netMargin / totalKm) * 100) / 100 : 0,
    revenuePerTrip: tripsCount > 0 ? Math.round(revenue / tripsCount) : 0,
    totalKm,
    tripsCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment aging
// ─────────────────────────────────────────────────────────────────────────────

export function computePaymentAging(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date } = {},
): ClientPaymentAging {
  const now = options.now ?? new Date();
  const paymentByTrip = buildPaymentByTripMap(trips, txns);

  let bucket0_30 = 0;
  let bucket31_60 = 0;
  let bucket61_90 = 0;
  let bucket90Plus = 0;
  let overdueTrips = 0;

  for (const t of trips) {
    const price = asNumber(t.client_price);
    if (price <= 0) continue;
    const paid = paymentByTrip.get(t.id)?.paid ?? 0;
    const outstanding = price - paid;
    if (outstanding <= 0) continue;
    const dateAnchor = t.pickup_date ? new Date(t.pickup_date) : tripDate(t);
    if (!dateAnchor || !Number.isFinite(dateAnchor.getTime())) continue;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - dateAnchor.getTime()) / MS_PER_DAY),
    );
    overdueTrips += 1;
    if (daysOld <= 30) bucket0_30 += outstanding;
    else if (daysOld <= 60) bucket31_60 += outstanding;
    else if (daysOld <= 90) bucket61_90 += outstanding;
    else bucket90Plus += outstanding;
  }

  return {
    outstanding: bucket0_30 + bucket31_60 + bucket61_90 + bucket90Plus,
    bucket0_30,
    bucket31_60,
    bucket61_90,
    bucket90Plus,
    totalOverdueTrips: overdueTrips,
  };
}

export type AgingTripRow = {
  trip: TripRow;
  outstanding: number;
  daysOld: number;
  bucket: AgingBucketKey;
};

function agingBucketForDays(daysOld: number): AgingBucketKey {
  if (daysOld <= 30) return "bucket0_30";
  if (daysOld <= 60) return "bucket31_60";
  if (daysOld <= 90) return "bucket61_90";
  return "bucket90Plus";
}

/** Open AR trips, optionally scoped to one aging bucket. */
export function listOpenReceivableTrips(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; bucket?: AgingBucketKey | null } = {},
): AgingTripRow[] {
  const now = options.now ?? new Date();
  const paymentByTrip = buildPaymentByTripMap(trips, txns);
  const rows: AgingTripRow[] = [];

  for (const t of trips) {
    const price = asNumber(t.client_price);
    if (price <= 0) continue;
    const paid = paymentByTrip.get(t.id)?.paid ?? 0;
    const outstanding = price - paid;
    if (outstanding <= 0) continue;
    const dateAnchor = t.pickup_date ? new Date(t.pickup_date) : tripDate(t);
    if (!dateAnchor || !Number.isFinite(dateAnchor.getTime())) continue;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - dateAnchor.getTime()) / MS_PER_DAY),
    );
    const bucket = agingBucketForDays(daysOld);
    if (options.bucket && bucket !== options.bucket) continue;
    rows.push({ trip: t, outstanding, daysOld, bucket });
  }

  rows.sort((a, b) => b.daysOld - a.daysOld || b.outstanding - a.outstanding);
  return rows;
}

/** Ledger rows linked to open-AR trips in a bucket (or all open-AR trips). */
export function filterLedgerByAgingBucket(
  txs: readonly LedgerRow[],
  openRows: readonly AgingTripRow[],
): LedgerRow[] {
  if (openRows.length === 0) return [];
  const ids = new Set(openRows.map((r) => r.trip.id));
  return txs.filter((tx) => {
    const id = tx.trip_id?.trim();
    return Boolean(id && ids.has(id));
  });
}

/** Map trip id → supplier payouts (`amount_out`) for payable aging. */
function buildPayableByTripMap(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
): Map<string, { paid: number; lastTxDate: Date | null }> {
  const map = new Map<string, { paid: number; lastTxDate: Date | null }>();
  const tripIds = new Set(trips.map((t) => t.id));
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    const amt = asNumber(tx.amount_out);
    if (amt <= 0) continue;
    const txDate = txnDate(tx);
    const entry = map.get(tx.trip_id) ?? { paid: 0, lastTxDate: null };
    entry.paid += amt;
    if (txDate && (!entry.lastTxDate || txDate > entry.lastTxDate)) {
      entry.lastTxDate = txDate;
    }
    map.set(tx.trip_id, entry);
  }
  return map;
}

/** Payable aging buckets for supplier / partner trips (mirrors receivable shape). */
export function computePayableAging(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date } = {},
): ClientPaymentAging {
  const now = options.now ?? new Date();
  const payableByTrip = buildPayableByTripMap(trips, txns);

  let bucket0_30 = 0;
  let bucket31_60 = 0;
  let bucket61_90 = 0;
  let bucket90Plus = 0;
  let overdueTrips = 0;

  for (const t of trips) {
    const rate = asNumber(t.supplier_rate);
    if (rate <= 0) continue;
    const paid = payableByTrip.get(t.id)?.paid ?? 0;
    const outstanding = rate - paid;
    if (outstanding <= 0) continue;
    const dateAnchor = t.pickup_date ? new Date(t.pickup_date) : tripDate(t);
    if (!dateAnchor || !Number.isFinite(dateAnchor.getTime())) continue;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - dateAnchor.getTime()) / MS_PER_DAY),
    );
    overdueTrips += 1;
    if (daysOld <= 30) bucket0_30 += outstanding;
    else if (daysOld <= 60) bucket31_60 += outstanding;
    else if (daysOld <= 90) bucket61_90 += outstanding;
    else bucket90Plus += outstanding;
  }

  return {
    outstanding: bucket0_30 + bucket31_60 + bucket61_90 + bucket90Plus,
    bucket0_30,
    bucket31_60,
    bucket61_90,
    bucket90Plus,
    totalOverdueTrips: overdueTrips,
  };
}

/** Open AP trips, optionally scoped to one aging bucket. */
export function listOpenPayableTrips(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; bucket?: AgingBucketKey | null } = {},
): AgingTripRow[] {
  const now = options.now ?? new Date();
  const payableByTrip = buildPayableByTripMap(trips, txns);
  const rows: AgingTripRow[] = [];

  for (const t of trips) {
    const rate = asNumber(t.supplier_rate);
    if (rate <= 0) continue;
    const paid = payableByTrip.get(t.id)?.paid ?? 0;
    const outstanding = rate - paid;
    if (outstanding <= 0) continue;
    const dateAnchor = t.pickup_date ? new Date(t.pickup_date) : tripDate(t);
    if (!dateAnchor || !Number.isFinite(dateAnchor.getTime())) continue;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - dateAnchor.getTime()) / MS_PER_DAY),
    );
    const bucket = agingBucketForDays(daysOld);
    if (options.bucket && bucket !== options.bucket) continue;
    rows.push({ trip: t, outstanding, daysOld, bucket });
  }

  rows.sort((a, b) => b.daysOld - a.daysOld || b.outstanding - a.outstanding);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment delay heatmap (rows = months, cols = aging buckets)
// ─────────────────────────────────────────────────────────────────────────────

export const AGING_BUCKETS = [
  { id: "0_30", label: "0-30d", maxDays: 30 },
  { id: "31_60", label: "31-60d", maxDays: 60 },
  { id: "61_90", label: "61-90d", maxDays: 90 },
  { id: "90_plus", label: "90+ d", maxDays: Number.POSITIVE_INFINITY },
] as const;

export function computePaymentDelayHeatmap(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; monthsBack?: number } = {},
): HeatmapCell[] {
  const now = options.now ?? new Date();
  const monthsBack = options.monthsBack ?? 6;

  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  const paymentByTrip = buildPaymentByTripMap(trips, txns);

  // For each (month, bucket) compute aggregate outstanding ₹.
  const cellMap = new Map<string, number>();
  for (const t of trips) {
    const d = tripDate(t);
    if (!d) continue;
    const key = monthKey(d);
    if (!keys.includes(key)) continue;
    const price = asNumber(t.client_price);
    if (price <= 0) continue;
    const pay = paymentByTrip.get(t.id);
    const outstanding = price - (pay?.paid ?? 0);
    if (outstanding <= 0) continue;
    const anchor = t.pickup_date ? new Date(t.pickup_date) : d;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - anchor.getTime()) / MS_PER_DAY),
    );
    const bucket =
      daysOld <= 30 ? "0_30" : daysOld <= 60 ? "31_60" : daysOld <= 90 ? "61_90" : "90_plus";
    const cellKey = `${key}|${bucket}`;
    cellMap.set(cellKey, (cellMap.get(cellKey) ?? 0) + outstanding);
  }

  // Resolve max value for intensity scaling.
  const allValues = Array.from(cellMap.values());
  const max = allValues.length > 0 ? Math.max(...allValues) : 0;

  const cells: HeatmapCell[] = [];
  for (const key of keys) {
    for (const bucket of AGING_BUCKETS) {
      const cellKey = `${key}|${bucket.id}`;
      const value = cellMap.get(cellKey) ?? 0;
      const intensity = max > 0 ? Math.min(value / max, 1) : 0;
      const tone =
        value === 0
          ? "empty"
          : bucket.id === "0_30"
            ? "notice"
            : bucket.id === "31_60"
              ? "warning"
              : "critical";
      const compactLabel =
        value === 0
          ? "—"
          : value >= 100000
            ? `${Math.round(value / 1000)}k`
            : value >= 1000
              ? `${Math.round(value / 100) / 10}k`
              : `${Math.round(value)}`;
      cells.push({
        rowId: key,
        colId: bucket.id,
        intensity,
        tone,
        label: compactLabel,
      });
    }
  }
  return cells;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operational metrics
// ─────────────────────────────────────────────────────────────────────────────

export function computeClientOperationalMetrics(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; windowMonths?: number } = {},
): ClientOperationalMetrics {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  let tripsTotal = 0;
  let tripsCompleted = 0;
  let tripsCancelled = 0;
  let tripsInProgress = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  const turnaroundDays: number[] = [];

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    tripsTotal += 1;
    if (t.status === "completed") tripsCompleted += 1;
    if (t.status === "cancelled") tripsCancelled += 1;
    if (
      t.status === "assigned" ||
      t.status === "in_progress" ||
      t.status === "started"
    ) {
      tripsInProgress += 1;
    }
    if (t.completed_at && t.pickup_date) {
      onTimeEligible += 1;
      const completed = new Date(t.completed_at);
      const pickup = new Date(t.pickup_date);
      if (
        Number.isFinite(completed.getTime()) &&
        Number.isFinite(pickup.getTime())
      ) {
        if (completed <= new Date(pickup.getTime() + MS_PER_DAY)) onTime += 1;
        const days =
          (completed.getTime() - pickup.getTime()) / MS_PER_DAY;
        if (days > 0) turnaroundDays.push(days);
      }
    }
  }

  // Disputed = trips with any txn description mentioning DISPUTE / DEDUCTION.
  const tripIds = new Set(trips.map((t) => t.id));
  let disputedCount = 0;
  const disputedSet = new Set<string>();
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    const desc = (tx.description ?? "").toUpperCase();
    if (desc.includes("DISPUTE")) disputedSet.add(tx.trip_id);
  }
  disputedCount = disputedSet.size;

  return {
    tripsTotal,
    tripsCompleted,
    tripsCancelled,
    tripsInProgress,
    onTime,
    onTimeEligible,
    onTimePct:
      onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
    cancellationPct:
      tripsTotal > 0
        ? Math.round((tripsCancelled / tripsTotal) * 1000) / 10
        : 0,
    completionPct:
      tripsTotal > 0
        ? Math.round((tripsCompleted / tripsTotal) * 1000) / 10
        : 0,
    disputedCount,
    averageTurnaroundDays:
      turnaroundDays.length > 0
        ? Math.round(
            (turnaroundDays.reduce((a, b) => a + b, 0) /
              turnaroundDays.length) *
              10,
          ) / 10
        : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto insights
// ─────────────────────────────────────────────────────────────────────────────

export function deriveClientInsights(
  monthly: readonly ClientMonthlyTrendPoint[],
  kpis: ClientKpiHeader,
  ops: ClientOperationalMetrics,
  aging: ClientPaymentAging,
): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  if (monthly.length === 0) return out;

  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];

  // Revenue trend
  if (last && prev && prev.revenue > 0) {
    const pct = ((last.revenue - prev.revenue) / prev.revenue) * 100;
    if (pct >= 20) {
      out.push({
        id: "rev-up",
        tone: "positive",
        message: `Revenue jumped ${Math.round(pct)}% vs last month — strong growth signal`,
      });
    } else if (pct <= -20) {
      out.push({
        id: "rev-down",
        tone: "warning",
        message: `Revenue dropped ${Math.round(Math.abs(pct))}% vs last month — investigate trip volume`,
      });
    }
  }

  // Outstanding 90+
  if (aging.bucket90Plus > 0) {
    out.push({
      id: "aging-critical",
      tone: "negative",
      message: `₹${Math.round(aging.bucket90Plus).toLocaleString("en-IN")} outstanding for 90+ days across ${aging.totalOverdueTrips} trip${aging.totalOverdueTrips === 1 ? "" : "s"}`,
    });
  }

  // High delay
  if (kpis.avgPaymentDelayDays >= 45) {
    out.push({
      id: "delay-high",
      tone: "warning",
      message: `Average payment delay is ${kpis.avgPaymentDelayDays} days — consider tighter credit terms`,
    });
  } else if (kpis.avgPaymentDelayDays > 0 && kpis.avgPaymentDelayDays <= 10) {
    out.push({
      id: "delay-low",
      tone: "positive",
      message: `Payments arrive in ${kpis.avgPaymentDelayDays} days on average — premium payment behaviour`,
    });
  }

  // Margin health
  if (kpis.marginPct >= 20) {
    out.push({
      id: "margin-strong",
      tone: "positive",
      message: `${kpis.marginPct.toFixed(1)}% margin — this is a high-yield account`,
    });
  } else if (kpis.marginPct < 5 && kpis.totalRevenue > 0) {
    out.push({
      id: "margin-thin",
      tone: "warning",
      message: `Margin is ${kpis.marginPct.toFixed(1)}% — review pricing or cost-to-serve`,
    });
  }

  // On-time
  if (ops.onTimeEligible >= 5 && ops.onTimePct < 60) {
    out.push({
      id: "ontime-low",
      tone: "warning",
      message: `Only ${ops.onTimePct}% on-time delivery — SLA risk`,
    });
  } else if (ops.onTimeEligible >= 5 && ops.onTimePct >= 90) {
    out.push({
      id: "ontime-high",
      tone: "positive",
      message: `${ops.onTimePct}% on-time delivery — operational excellence`,
    });
  }

  // Cancellations
  if (ops.cancellationPct >= 15) {
    out.push({
      id: "cancel-high",
      tone: "warning",
      message: `Cancellation rate is ${ops.cancellationPct}% — review intake quality`,
    });
  }

  // Disputes
  if (ops.disputedCount > 0) {
    out.push({
      id: "disputes",
      tone: "warning",
      message: `${ops.disputedCount} trip${ops.disputedCount === 1 ? "" : "s"} flagged with disputes/deductions`,
    });
  }

  // Growth
  if (kpis.businessGrowthPct >= 30) {
    out.push({
      id: "growth-strong",
      tone: "positive",
      message: `Business volume up ${kpis.businessGrowthPct.toFixed(0)}% YoY — strategic account candidate`,
    });
  } else if (kpis.businessGrowthPct <= -30) {
    out.push({
      id: "growth-decline",
      tone: "negative",
      message: `Business volume down ${Math.abs(kpis.businessGrowthPct).toFixed(0)}% YoY — schedule a check-in`,
    });
  }

  return out;
}
