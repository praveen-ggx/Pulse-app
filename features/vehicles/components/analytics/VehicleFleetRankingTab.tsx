/**
 * VehicleFleetRankingTab — fleet-wide vehicle leaderboard.
 * ============================================================================
 *
 * Drops into `VehicleDetailScreen` as the "Ranking" tab. Shows the current
 * vehicle's position within the entire fleet across six dimensions
 * (score, revenue, trips, profit, margin %, utilization), with the current
 * vehicle highlighted and percentile callouts at the top.
 *
 * Self-contained data — pulls org-wide vehicles + trips via TanStack
 * Query (cached by other screens). All ranking math runs client-side
 * via the score engine in `@/features/analytics` for consistency with
 * the per-vehicle Intelligence section.
 */

import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { Theme } from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatINRChip } from "@/lib/format";
import {
  useCompleteTripsQuery,
  useVehiclesQuery,
} from "@/lib/queries";

import {
  ChartCard,
  KPICard,
  KPIHeader,
  PerformanceLeaderboard,
  type LeaderboardColumn,
  SectionHeader,
} from "@/components/analytics";

import {
  computeVehiclePerformanceScore,
  type ScoreLevel,
  type VehicleLeaderboardRow,
  type VehicleLeaderboardSortKey,
  type VehiclePerformanceScore,
  type VehicleScoreTripInput,
} from "@/features/analytics";

import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "../../services/vehicles.service";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  currentVehicleId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SORT_OPTIONS: Array<{
  id: VehicleLeaderboardSortKey;
  label: string;
}> = [
  { id: "score", label: "Score" },
  { id: "revenue", label: "Revenue" },
  { id: "trips", label: "Trips" },
  { id: "profit", label: "Profit" },
  { id: "marginPct", label: "Margin %" },
  { id: "utilizationPct", label: "Utilization" },
  { id: "kmDriven", label: "Distance" },
];

function tripToScoreInput(t: TripRow): VehicleScoreTripInput {
  const distance =
    t.distance == null
      ? null
      : typeof t.distance === "number"
        ? t.distance
        : Number.parseFloat(String(t.distance).replace(/[^0-9.]/g, ""));
  return {
    id: t.id,
    vehicle_id: t.vehicle_id ?? null,
    client_price: t.client_price ?? null,
    status: t.status ?? null,
    distance: Number.isFinite(distance) ? distance : null,
    pickup_date: t.pickup_date ?? null,
    created_at: t.created_at ?? null,
  };
}

interface FleetRow extends VehicleLeaderboardRow {
  id: string;
  /** Full performance breakdown — kept around for tooltips / archetype callouts. */
  performance: VehiclePerformanceScore | null;
}

function buildFleetRows(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  now: Date,
): FleetRow[] {
  // Bucket trips per vehicle in a single O(n) pass for performance.
  const tripsByVehicle = new Map<string, TripRow[]>();
  for (const t of trips) {
    if (!t.vehicle_id) continue;
    const arr = tripsByVehicle.get(t.vehicle_id);
    if (arr) arr.push(t);
    else tripsByVehicle.set(t.vehicle_id, [t]);
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 6);

  return vehicles.map<FleetRow>((v) => {
    const vehicleTrips = tripsByVehicle.get(v.id) ?? [];
    const performance = computeVehiclePerformanceScore(
      v.id,
      vehicleTrips.map(tripToScoreInput),
      [],
    );

    // Active-days calc (last 6 months) for utilization %.
    const activeDays = new Set<string>();
    let revenue = 0;
    let kmDriven = 0;
    for (const t of vehicleTrips) {
      const raw = t.pickup_date ?? t.created_at;
      if (!raw) continue;
      const d = new Date(raw);
      if (!Number.isFinite(d.getTime()) || d < cutoff) continue;
      activeDays.add(d.toISOString().slice(0, 10));
      revenue += Number(t.client_price ?? 0);
      kmDriven += Number(t.distance ?? 0);
    }
    const windowDays = Math.max(
      1,
      Math.round((now.getTime() - cutoff.getTime()) / MS_PER_DAY),
    );
    const utilizationPct = Math.min(
      100,
      Math.round((activeDays.size / windowDays) * 100),
    );

    const profit = performance?.breakdown.profit ?? 0;
    const score = performance?.score ?? 0;
    const marginPct = performance?.breakdown.marginPct ?? 0;
    const trips_ = performance?.breakdown.tripsTotal ?? 0;

    return {
      id: v.id,
      vehicleId: v.id,
      vehicleNumber: v.vehicle_number || "—",
      vehicleType: v.vehicle_type ?? null,
      rank: 0,
      trips: trips_,
      revenue: Math.round(revenue),
      profit: Math.round(profit),
      marginPct: Math.round(marginPct * 10) / 10,
      utilizationPct,
      kmDriven: Math.round(kmDriven),
      score,
      level: performance?.level ?? "unknown",
      riskFlag: performance ? performance.level === "critical" : false,
      performance,
    };
  });
}

function sortRows(
  rows: FleetRow[],
  key: VehicleLeaderboardSortKey,
): FleetRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case "revenue":         return b.revenue - a.revenue;
      case "trips":           return b.trips - a.trips;
      case "profit":          return b.profit - a.profit;
      case "marginPct":       return b.marginPct - a.marginPct;
      case "utilizationPct":  return b.utilizationPct - a.utilizationPct;
      case "kmDriven":        return b.kmDriven - a.kmDriven;
      case "rank":
      case "score":
      default:                return b.score - a.score;
    }
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

function percentileFor(
  rows: readonly FleetRow[],
  vehicleId: string,
  key: VehicleLeaderboardSortKey,
): number {
  if (rows.length === 0) return 0;
  const ranked = sortRows([...rows], key);
  const idx = ranked.findIndex((r) => r.vehicleId === vehicleId);
  if (idx === -1) return 0;
  return Math.round(((ranked.length - idx) / ranked.length) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle "plate" avatar — used as the leaderboard avatar slot.
// ─────────────────────────────────────────────────────────────────────────────

function VehiclePlate({
  number,
  highlighted,
}: {
  number: string;
  highlighted: boolean;
}) {
  // Shorten long plate numbers to the last 4 chars (e.g. "TN09TH8765" → "8765")
  // so the avatar tile stays readable at 32px.
  const short = number.replace(/\s/g, "").slice(-4) || "—";
  return (
    <View
      style={[styles.plate, highlighted && styles.plateHighlight]}
      accessibilityLabel={`Vehicle ${number}`}
    >
      <Text style={styles.plateText}>{short}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function VehicleFleetRankingTab({ currentVehicleId }: Props) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [sortKey, setSortKey] = useState<VehicleLeaderboardSortKey>("score");

  const { data: trips = [] } = useCompleteTripsQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);

  const fleetRows = useMemo(
    () => buildFleetRows(vehicles, trips, new Date()),
    [vehicles, trips],
  );

  const sortedRows = useMemo(
    () => sortRows(fleetRows, sortKey),
    [fleetRows, sortKey],
  );

  const totalVehicles = fleetRows.length;

  const myPercentiles = useMemo(
    () => ({
      score: percentileFor(fleetRows, currentVehicleId, "score"),
      revenue: percentileFor(fleetRows, currentVehicleId, "revenue"),
      utilization: percentileFor(fleetRows, currentVehicleId, "utilizationPct"),
      profit: percentileFor(fleetRows, currentVehicleId, "profit"),
    }),
    [fleetRows, currentVehicleId],
  );

  // Archetype callouts.
  const topRevenue = sortRows(fleetRows, "revenue")[0];
  const mostUtilized = sortRows(fleetRows, "utilizationPct")[0];
  const mostEfficient = sortRows(fleetRows, "marginPct")[0];
  const highRisk = fleetRows.find((r) => r.riskFlag);

  const myRow = sortedRows.find((r) => r.vehicleId === currentVehicleId);

  // Leaderboard column config.
  const columns: ReadonlyArray<LeaderboardColumn<FleetRow>> = [
    {
      id: "revenue",
      label: "Revenue",
      render: (r) => formatINRChip(r.revenue),
      accent: () => Theme.chartSeries1,
      width: 64,
    },
    {
      id: "trips",
      label: "Trips",
      render: (r) => String(r.trips),
      width: 44,
    },
    {
      id: "profit",
      label: "Profit",
      render: (r) => formatINRChip(r.profit),
      accent: (r) =>
        r.profit >= 0 ? Theme.chartSeries2 : Theme.chartSeries4,
      width: 64,
    },
    {
      id: "marginPct",
      label: "Margin",
      render: (r) => `${r.marginPct.toFixed(1)}%`,
      accent: (r) =>
        r.marginPct >= 15
          ? Theme.chartSeries2
          : r.marginPct >= 5
            ? Theme.chartSeries3
            : Theme.chartSeries4,
      width: 56,
    },
    {
      id: "utilizationPct",
      label: "Util",
      render: (r) => `${r.utilizationPct}%`,
      accent: (r) =>
        r.utilizationPct >= 70
          ? Theme.chartSeries2
          : r.utilizationPct >= 40
            ? Theme.chartSeries3
            : Theme.chartSeries4,
      width: 54,
    },
    {
      id: "score",
      label: "Score",
      render: (r) => `${r.score}`,
      accent: (r) => scoreLevelTextColor(r.level),
      width: 50,
    },
  ];

  return (
    <View style={styles.wrap}>
      {/* ── Your fleet position ──────────────────────────────────────────── */}
      <SectionHeader
        title="Your fleet position"
        subtitle={
          totalVehicles > 0
            ? `Across ${totalVehicles} ${totalVehicles === 1 ? "vehicle" : "vehicles"} in your fleet`
            : "Not enough fleet data yet"
        }
      />
      <KPIHeader
        columns={2}
        cards={[
          {
            id: "p-score",
            label: "Performance",
            value: myRow ? `Top ${100 - myPercentiles.score}%` : "—",
            sub: myRow ? `Score ${myRow.score}/100` : "Insufficient data",
            accent: scoreLevelTextColor(myRow?.level ?? "unknown"),
            delta: myRow
              ? {
                  label: `Rank #${myRow.rank}`,
                  direction:
                    myPercentiles.score >= 80
                      ? "up"
                      : myPercentiles.score >= 40
                        ? "flat"
                        : "down",
                }
              : undefined,
          },
          {
            id: "p-revenue",
            label: "Revenue",
            value: myRow ? `Top ${100 - myPercentiles.revenue}%` : "—",
            sub: myRow ? formatINRChip(myRow.revenue) : "No trips yet",
            accent: Theme.chartSeries1,
          },
          {
            id: "p-util",
            label: "Utilization",
            value: myRow ? `${myRow.utilizationPct}%` : "—",
            sub: myRow ? `Top ${100 - myPercentiles.utilization}%` : "—",
            accent:
              myRow && myRow.utilizationPct >= 70
                ? Theme.chartSeries2
                : Theme.chartSeries4,
          },
          {
            id: "p-profit",
            label: "Profit",
            value: myRow ? formatINRChip(myRow.profit) : "—",
            sub: myRow ? `Top ${100 - myPercentiles.profit}%` : "No profit yet",
            accent:
              myRow && myRow.profit >= 0
                ? Theme.chartSeries2
                : Theme.chartSeries4,
          },
        ]}
      />

      {/* ── Archetype callouts ──────────────────────────────────────────── */}
      <SectionHeader title="Fleet highlights" />
      <View style={styles.archetypeRow}>
        <ArchetypeCard
          label="Top revenue"
          vehicle={topRevenue}
          metric={topRevenue ? formatINRChip(topRevenue.revenue) : "—"}
          tone="series1"
        />
        <ArchetypeCard
          label="Most utilized"
          vehicle={mostUtilized}
          metric={mostUtilized ? `${mostUtilized.utilizationPct}%` : "—"}
          tone="series2"
        />
      </View>
      <View style={styles.archetypeRow}>
        <ArchetypeCard
          label="Most efficient"
          vehicle={mostEfficient}
          metric={
            mostEfficient ? `${mostEfficient.marginPct.toFixed(1)}% margin` : "—"
          }
          tone="series5"
        />
        <ArchetypeCard
          label="High risk"
          vehicle={highRisk}
          metric={highRisk ? `${highRisk.score} score` : "—"}
          tone="risk"
        />
      </View>

      {/* ── Sort selector + leaderboard ──────────────────────────────────── */}
      <ChartCard
        title="Vehicle leaderboard"
        subtitle={
          myRow
            ? `You're ranked #${myRow.rank} of ${totalVehicles} by ${sortLabel(sortKey)}`
            : "Run trips on this vehicle to appear in the leaderboard"
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = opt.id === sortKey;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSortKey(opt.id)}
                style={({ pressed }) => [
                  styles.sortPill,
                  active && styles.sortPillActive,
                  pressed && styles.sortPillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.sortPillText,
                    active && styles.sortPillTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <PerformanceLeaderboard<FleetRow>
          rows={sortedRows}
          columns={columns}
          primaryLabel={(r) => r.vehicleNumber}
          secondaryLabel={(r) =>
            r.vehicleId === currentVehicleId
              ? "You · Current view"
              : (r.vehicleType ?? levelLabel(r.level))
          }
          renderAvatar={(r) => (
            <VehiclePlate
              number={r.vehicleNumber}
              highlighted={r.vehicleId === currentVehicleId}
            />
          )}
          renderBadges={(r) => {
            const badges: { label: string; tone: ScoreLevel }[] = [];
            if (r.vehicleId === currentVehicleId)
              badges.push({ label: "You", tone: "good" });
            if (r.rank === 1) badges.push({ label: "Fleet leader", tone: "excellent" });
            if (r.riskFlag) badges.push({ label: "Risk", tone: "critical" });
            return (
              <View style={styles.badgeRow}>
                {badges.map((b, i) => (
                  <View
                    key={`${b.label}-${i}`}
                    style={[
                      styles.badge,
                      { backgroundColor: scoreLevelBg(b.tone) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: scoreLevelTextColor(b.tone) },
                      ]}
                    >
                      {b.label}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }}
          onPressRow={(r) => {
            if (r.vehicleId === currentVehicleId) return;
            router.push(`/vehicle/${r.vehicleId}`);
          }}
          emptyLabel="No fleet vehicles yet"
        />
      </ChartCard>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ArchetypeCard — local helper
// ─────────────────────────────────────────────────────────────────────────────

function ArchetypeCard({
  label,
  vehicle,
  metric,
  tone,
}: {
  label: string;
  vehicle: FleetRow | undefined;
  metric: string;
  tone: "series1" | "series2" | "series5" | "risk";
}) {
  const accent =
    tone === "series1"
      ? Theme.chartSeries1
      : tone === "series2"
        ? Theme.chartSeries2
        : tone === "series5"
          ? Theme.chartSeries5
          : Theme.chartSeries3;
  return (
    <KPICard
      label={label}
      value={vehicle?.vehicleNumber ?? "—"}
      sub={metric}
      accent={accent}
      iconSlot={
        vehicle ? (
          <VehiclePlate number={vehicle.vehicleNumber} highlighted={false} />
        ) : null
      }
      containerStyle={styles.archetypeCard}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreLevelTextColor(level: ScoreLevel): string {
  switch (level) {
    case "excellent": return Theme.scoreExcellentFg;
    case "good":      return Theme.scoreGoodFg;
    case "warning":   return Theme.scoreWarningFg;
    case "critical":  return Theme.scoreCriticalFg;
    default:          return Theme.textMuted;
  }
}

function scoreLevelBg(level: ScoreLevel): string {
  switch (level) {
    case "excellent": return Theme.scoreExcellentBg;
    case "good":      return Theme.scoreGoodBg;
    case "warning":   return Theme.scoreWarningBg;
    case "critical":  return Theme.scoreCriticalBg;
    default:          return Theme.surface;
  }
}

function levelLabel(level: ScoreLevel): string {
  switch (level) {
    case "excellent": return "Excellent performance";
    case "good":      return "Solid performance";
    case "warning":   return "Needs attention";
    case "critical":  return "At-risk vehicle";
    default:          return "Insufficient data";
  }
}

function sortLabel(key: VehicleLeaderboardSortKey): string {
  switch (key) {
    case "revenue":         return "revenue";
    case "trips":           return "trip count";
    case "profit":          return "profit";
    case "marginPct":       return "margin %";
    case "utilizationPct":  return "utilization";
    case "kmDriven":        return "kilometres driven";
    case "rank":
    case "score":
    default:                return "performance score";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  archetypeRow: {
    flexDirection: "row",
    gap: 10,
  },
  archetypeCard: {
    minHeight: 86,
  },
  sortRow: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  sortPillActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  sortPillPressed: {
    opacity: 0.85,
  },
  sortPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textRouteCard,
    letterSpacing: 0.2,
  },
  sortPillTextActive: {
    color: Theme.cardWhite,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  plate: {
    width: 36,
    height: 32,
    borderRadius: 6,
    backgroundColor: Theme.chartSeries1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  plateHighlight: {
    borderWidth: 2,
    borderColor: Theme.primary,
  },
  plateText: {
    color: Theme.cardWhite,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.4,
  },
});

export default VehicleFleetRankingTab;
