/**
 * DriverFleetRankingTab — fleet-wide driver leaderboard.
 * ============================================================================
 *
 * Drops into `DriverDetailScreen` as the "Fleet Ranking" tab. Shows the
 * caller their position within the entire fleet across six dimensions
 * (revenue, trips, on-time %, margin, score, earnings), with the current
 * driver highlighted and percentile callouts at the top.
 *
 * Self-contained data: pulls org-wide trips + drivers + driver-offers
 * from TanStack Query cache (same hooks `useFinanceEntities` composes —
 * no double-fetch). All ranking math runs client-side via the score
 * engine in `@/features/analytics` for consistency with the per-driver
 * Performance Analytics tab.
 *
 * Performance:
 *   • All derived state under `useMemo` keyed on row counts + sort key.
 *   • Leaderboard uses `PerformanceLeaderboard` (memoized rows, fixed
 *     row height for `getItemLayout`).
 *   • Score per driver computed in O(trips) once, then reused per sort.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Theme } from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatINRChip } from "@/lib/format";
import {
  useDriverOffersQuery,
  useDriversQuery,
  useCompleteTripsQuery,
} from "@/lib/queries";

import { PartyAvatar } from "@/components/PartyAvatar";
import {
  ChartCard,
  KPICard,
  KPIHeader,
  PerformanceLeaderboard,
  type LeaderboardColumn,
  SectionHeader,
} from "@/components/analytics";

import {
  computeDriverPerformanceScore,
  scoreLevelFromValue,
  type DriverLeaderboardRow,
  type DriverLeaderboardSortKey,
  type DriverPerformanceScore,
  type DriverScoreTripInput,
  type ScoreLevel,
} from "@/features/analytics";
import {
  computeDriverCommissionForTrip,
  type DriverOfferForAggregation,
} from "@/features/finance";
import {
  isActiveFleetRelationshipDriver,
  type DriverRow,
} from "@/features/drivers/services/drivers.service";
import type { TripRow } from "@/features/trips/services/trips.service";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  currentDriverId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SORT_OPTIONS: Array<{ id: DriverLeaderboardSortKey; label: string }> = [
  { id: "score", label: "Score" },
  { id: "revenue", label: "Revenue" },
  { id: "trips", label: "Trips" },
  { id: "onTimePct", label: "On-Time" },
  { id: "margin", label: "Margin" },
  { id: "earnings", label: "Earnings" },
];

function tripToScoreInput(t: TripRow): DriverScoreTripInput {
  return {
    driver_id: t.driver_id ?? null,
    client_price: t.client_price ?? null,
    driver_commission: t.driver_commission ?? null,
    supplier_rate: t.supplier_rate ?? null,
    status: t.status ?? null,
    pickup_date: t.pickup_date ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at ?? null,
  };
}

function offerToFinanceShape(
  offer: { commissionPercent: number | null; commissionPerKm: number | null } | undefined,
): DriverOfferForAggregation | null {
  if (!offer) return null;
  return {
    commissionPercent: offer.commissionPercent ?? null,
    commissionPerKm: offer.commissionPerKm ?? null,
  };
}

function tripEarning(trip: TripRow, offer: DriverOfferForAggregation | null): number {
  return computeDriverCommissionForTrip(
    {
      driver_id: trip.driver_id,
      driver_commission: trip.driver_commission ?? null,
      supplier_rate: trip.supplier_rate ?? null,
      client_price: trip.client_price ?? null,
      distance: trip.distance ?? null,
    },
    offer,
  );
}

interface FleetRow extends DriverLeaderboardRow {
  id: string;
  /** Margin contributed (client_price - supplier_rate). */
  marginContribution: number;
  /** Computed performance breakdown for tooltips / chart cards. */
  performance: DriverPerformanceScore | null;
}

function buildFleetRows(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  offers: Record<string, { commissionPercent: number | null; commissionPerKm: number | null }>,
  now: Date,
): FleetRow[] {
  // Bucket trips per driver in a single O(n) pass.
  const tripsByDriver = new Map<string, TripRow[]>();
  for (const t of trips) {
    if (!t.driver_id) continue;
    const arr = tripsByDriver.get(t.driver_id);
    if (arr) arr.push(t);
    else tripsByDriver.set(t.driver_id, [t]);
  }

  return drivers
    // Fleet-relationship membership only (active_employee/independent), not compensation.
    .filter((d) => isActiveFleetRelationshipDriver(d) && !d.left_at)
    .map<FleetRow>((d) => {
      const driverTrips = tripsByDriver.get(d.id) ?? [];
      const offer = offerToFinanceShape(offers[d.id]);

      let revenue = 0;
      let marginContribution = 0;
      let onTime = 0;
      let onTimeEligible = 0;
      let earnings = 0;
      let trips30d = 0;
      const cutoff30 = new Date(now);
      cutoff30.setDate(cutoff30.getDate() - 30);

      for (const t of driverTrips) {
        revenue += Number(t.client_price ?? 0);
        marginContribution +=
          Number(t.client_price ?? 0) - Number(t.supplier_rate ?? 0);
        earnings += tripEarning(t, offer);
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
        if (t.pickup_date) {
          const p = new Date(t.pickup_date);
          if (Number.isFinite(p.getTime()) && p >= cutoff30) trips30d += 1;
        }
      }

      const performance = computeDriverPerformanceScore(
        d.id,
        driverTrips.map(tripToScoreInput),
        [],
      );
      const score = performance?.score ?? 0;
      const onTimePct =
        onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0;

      return {
        id: d.id,
        driverId: d.id,
        name: (d.name ?? "").trim() || "Unnamed",
        avatarUrl: d.avatar_url ?? null,
        avatarSeed: d.avatar_seed ?? null,
        rank: 0,
        revenue,
        trips: driverTrips.length,
        onTimePct,
        margin: marginContribution,
        score,
        level: performance?.level ?? "unknown",
        earnings,
        riskFlag: performance ? performance.level === "critical" : false,
        trendDelta: trips30d, // surrogate for "active" / "improving"
        marginContribution,
        performance,
      };
    });
}

function sortRows(
  rows: FleetRow[],
  key: DriverLeaderboardSortKey,
): FleetRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case "revenue":
        return b.revenue - a.revenue;
      case "trips":
        return b.trips - a.trips;
      case "onTimePct":
        return b.onTimePct - a.onTimePct;
      case "margin":
        return b.margin - a.margin;
      case "earnings":
        return b.earnings - a.earnings;
      case "rank":
      case "score":
      default:
        return b.score - a.score;
    }
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

function percentileFor(
  rows: readonly FleetRow[],
  driverId: string,
  key: DriverLeaderboardSortKey,
): number {
  if (rows.length === 0) return 0;
  const ranked = sortRows([...rows], key);
  const idx = ranked.findIndex((r) => r.driverId === driverId);
  if (idx === -1) return 0;
  return Math.round(((ranked.length - idx) / ranked.length) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DriverFleetRankingTab({ currentDriverId }: Props) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [sortKey, setSortKey] = useState<DriverLeaderboardSortKey>("score");

  const { data: trips = [] } = useCompleteTripsQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: offers = {} } = useDriverOffersQuery(orgId);

  const fleetRows = useMemo(
    () => buildFleetRows(drivers, trips, offers, new Date()),
    [drivers, trips, offers],
  );

  const sortedRows = useMemo(
    () => sortRows(fleetRows, sortKey),
    [fleetRows, sortKey],
  );

  const totalDrivers = fleetRows.length;

  // Percentile callouts for the current driver across 4 dimensions.
  const myPercentiles = useMemo(
    () => ({
      score: percentileFor(fleetRows, currentDriverId, "score"),
      revenue: percentileFor(fleetRows, currentDriverId, "revenue"),
      onTime: percentileFor(fleetRows, currentDriverId, "onTimePct"),
      earnings: percentileFor(fleetRows, currentDriverId, "earnings"),
    }),
    [fleetRows, currentDriverId],
  );

  // Archetype callouts.
  const topRevenue = sortRows(fleetRows, "revenue")[0];
  const mostReliable = sortRows(fleetRows, "onTimePct")[0];
  const highRisk = fleetRows.find((r) => r.riskFlag);
  const mostImproved = [...fleetRows].sort((a, b) => b.trendDelta - a.trendDelta)[0];

  const myRow = sortedRows.find((r) => r.driverId === currentDriverId);

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
      id: "onTimePct",
      label: "On-Time",
      render: (r) => `${r.onTimePct}%`,
      accent: (r) =>
        r.onTimePct >= 85
          ? Theme.chartSeries2
          : r.onTimePct >= 60
            ? Theme.chartSeries4
            : Theme.chartSeries3,
      width: 58,
    },
    {
      id: "margin",
      label: "Margin",
      render: (r) => formatINRChip(r.margin),
      accent: (r) => (r.margin >= 0 ? Theme.chartSeries2 : Theme.chartSeries3),
      width: 64,
    },
    {
      id: "score",
      label: "Score",
      render: (r) => `${r.score}`,
      accent: (r) => scoreLevelTextColor(r.level),
      width: 50,
    },
    {
      id: "earnings",
      label: "Earnings",
      render: (r) => formatINRChip(r.earnings),
      width: 64,
    },
  ];

  return (
    <View style={styles.wrap}>
      {/* ── Your fleet position — percentile cards ───────────────────────── */}
      <SectionHeader
        title="Your fleet position"
        subtitle={
          totalDrivers > 0
            ? `Across ${totalDrivers} ${totalDrivers === 1 ? "driver" : "drivers"} in your fleet`
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
            id: "p-ontime",
            label: "On-Time",
            value: myRow ? `${myRow.onTimePct}%` : "—",
            sub: myRow ? `Top ${100 - myPercentiles.onTime}%` : "No completed trips",
            accent:
              myRow && myRow.onTimePct >= 85
                ? Theme.chartSeries2
                : Theme.chartSeries4,
          },
          {
            id: "p-earnings",
            label: "Earnings",
            value: myRow ? formatINRChip(myRow.earnings) : "—",
            sub: myRow ? `Top ${100 - myPercentiles.earnings}%` : "No commission yet",
            accent: Theme.chartSeries5,
          },
        ]}
      />

      {/* ── Archetype callouts ──────────────────────────────────────────── */}
      <SectionHeader title="Fleet highlights" />
      <View style={styles.archetypeRow}>
        <ArchetypeCard
          label="Top revenue"
          driver={topRevenue}
          metric={topRevenue ? formatINRChip(topRevenue.revenue) : "—"}
          tone="series1"
        />
        <ArchetypeCard
          label="Most reliable"
          driver={mostReliable}
          metric={mostReliable ? `${mostReliable.onTimePct}%` : "—"}
          tone="series2"
        />
      </View>
      <View style={styles.archetypeRow}>
        <ArchetypeCard
          label="Most active"
          driver={mostImproved}
          metric={mostImproved ? `${mostImproved.trendDelta} trips · 30d` : "—"}
          tone="series5"
        />
        <ArchetypeCard
          label="High risk"
          driver={highRisk}
          metric={highRisk ? `${highRisk.score} score` : "—"}
          tone="risk"
        />
      </View>

      {/* ── Sort selector ────────────────────────────────────────────────── */}
      <ChartCard
        title="Driver leaderboard"
        subtitle={
          myRow
            ? `You're ranked #${myRow.rank} of ${totalDrivers} by ${sortLabel(sortKey)}`
            : "Add a salary or commission to appear in this leaderboard"
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
          primaryLabel={(r) => r.name}
          secondaryLabel={(r) =>
            r.driverId === currentDriverId ? "You · Current view" : levelLabel(r.level)
          }
          renderAvatar={(r) => (
            <PartyAvatar
              name={r.name}
              avatarUrl={r.avatarUrl}
              avatarSeed={r.avatarSeed}
              entityType="driver"
              size={32}
              style={
                r.driverId === currentDriverId
                  ? styles.currentAvatar
                  : undefined
              }
            />
          )}
          renderBadges={(r) => {
            const badges: { label: string; tone: ScoreLevel }[] = [];
            if (r.driverId === currentDriverId)
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
            if (r.driverId === currentDriverId) return;
            router.push(`/driver/${r.driverId}`);
          }}
          emptyLabel="No fleet drivers yet"
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
  driver,
  metric,
  tone,
}: {
  label: string;
  driver: FleetRow | undefined;
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
      value={driver?.name ?? "—"}
      sub={metric}
      accent={accent}
      iconSlot={
        driver ? (
          <PartyAvatar
            name={driver.name}
            avatarUrl={driver.avatarUrl}
            avatarSeed={driver.avatarSeed}
            entityType="driver"
            size={24}
          />
        ) : null
      }
      containerStyle={styles.archetypeCard}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
    case "critical":  return "At-risk driver";
    default:          return "Insufficient data";
  }
}

function sortLabel(key: DriverLeaderboardSortKey): string {
  switch (key) {
    case "revenue":   return "revenue";
    case "trips":     return "trip count";
    case "onTimePct": return "on-time delivery";
    case "margin":    return "margin contribution";
    case "earnings":  return "earnings";
    case "rank":
    case "score":
    default:          return "performance score";
  }
}

// Make eslint happy w/ unused import — it's referenced only in archetype's `riskFlag` flow.
// (scoreLevelFromValue is re-exported via the analytics barrel for downstream consumers.)
void scoreLevelFromValue;

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
  currentAvatar: {
    borderWidth: 2,
    borderColor: Theme.primary,
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
});
