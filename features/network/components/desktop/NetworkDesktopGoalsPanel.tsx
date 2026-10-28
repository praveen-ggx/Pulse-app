/**
 * Goals tab — monthly sales targets, KAM assignments, regional targets,
 * annual/quarterly target hierarchy, Power BI-style cross-filtering.
 */
import Theme from "@/constants/Theme";
import { NetworkDesktopEntityGoalWizard } from "@/features/network/components/desktop/NetworkDesktopEntityGoalWizard";
import { NetworkDesktopGoalsBalanceChart } from "@/features/network/components/desktop/NetworkDesktopGoalsBalanceChart";
import { NetworkDesktopSidebarFeatureAd } from "@/features/network/components/desktop/NetworkDesktopSidebarFeatureAd";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import {
  carryForwardGoals,
  DEFAULT_NETWORK_GOALS_STORE,
  getMonthStore,
  getQuarterlyTarget,
  loadNetworkGoalsStore,
  monthLabelFromKey,
  patchAggregateTarget,
  patchClientRegion,
  patchEntityTarget,
  patchKamAssignment,
  patchQuarterlyTarget,
  previousMonthKey,
  saveNetworkGoalsStore,
  yearFromMonthKey,
  yearQuarterKeys,
  type GoalFocus,
  type NetworkGoalsStore,
  type SalesTargetMetrics,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  balancePeriodMonthKeys,
  buildBalanceTrendPoints,
  buildEntityGoalRows,
  buildGoalSummaryRows,
  buildPeriodSummary,
  computeGoalsActualsForRollup,
  computePayableReceivableSnapshot,
  getRecentMonthKeys,
  type EntityGoalRow,
  type GoalTargetRow,
  type GoalsRollup,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import type { SalesDateRange } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINR, formatINRChip } from "@/lib/format";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useOrgMembersData } from "@/lib/queries/useOrgMembersQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import type { OrgMember } from "@/types/organization";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Filter,
  MapPin,
  MoreVertical,
  Pencil,
  Target,
  TrendingUp,
  User,
  Wallet,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  orgId: string;
};

const ROLLUPS: { id: GoalsRollup; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const FOCUS_TABS: { id: GoalFocus; label: string }[] = [
  { id: "client", label: "Clients" },
  { id: "vehicle", label: "Vehicles" },
  { id: "driver", label: "Drivers" },
];

const BALANCE_PERIODS: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "Month" },
  { id: "6m", label: "Quarter" },
  { id: "12m", label: "Year" },
  { id: "all", label: "All" },
];

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatMetricValue(row: GoalTargetRow): string {
  if (row.unit === "trips") return String(Math.round(row.actual));
  if (row.unit === "pct") return `${row.actual.toFixed(1)}%`;
  return formatINRChip(row.actual);
}

function formatMetricTarget(row: GoalTargetRow): string {
  if (row.target <= 0) return "Not set";
  if (row.unit === "trips") return `${Math.round(row.target)} trips`;
  if (row.unit === "pct") return `${row.target.toFixed(1)}%`;
  return formatINRChip(row.target);
}

function BalanceWidget({
  title,
  label,
  amount,
  sub,
  progress,
  progressLabel,
  tone,
  icon,
  period,
  onPeriodChange,
}: {
  title: string;
  label: string;
  amount: string;
  sub: string;
  progress: number;
  progressLabel: string;
  tone: "receivable" | "payable";
  icon: ReactNode;
  period: SalesDateRange;
  onPeriodChange: (p: SalesDateRange) => void;
}) {
  const toneColor = tone === "receivable" ? "#3E97FF" : "#F1416C";
  return (
    <View style={styles.goalsBalanceCard}>
      <View style={styles.goalsBalanceHeader}>
        <Text style={styles.goalsBalanceTitle}>{title}</Text>
        <Pressable hitSlop={8}>
          <MoreVertical size={15} color={METRONIC.muted} />
        </Pressable>
      </View>
      <View style={styles.goalsBalanceIconRow}>{icon}</View>
      <Text style={styles.goalsBalanceLabel}>{label}</Text>
      <Text style={styles.goalsBalanceAmount}>{amount}</Text>
      <Text style={styles.goalsBalanceSub}>{sub}</Text>
      <View style={styles.goalsPeriodRow}>
        {BALANCE_PERIODS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onPeriodChange(p.id)}
            style={[
              styles.goalsPeriodBtn,
              period === p.id && styles.goalsPeriodBtnOn,
            ]}
          >
            <Text
              style={[
                styles.goalsPeriodBtnText,
                period === p.id && styles.goalsPeriodBtnTextOn,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.goalsProgressTrack}>
        <View
          style={[
            styles.goalsProgressFill,
            {
              width: `${Math.min(100, Math.max(0, progress))}%`,
              backgroundColor: toneColor,
            },
          ]}
        />
      </View>
      <Text style={styles.goalsProgressMeta}>{progressLabel}</Text>
    </View>
  );
}

function GoalTargetCard({
  row,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}: {
  row: GoalTargetRow;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const hasTarget = row.target > 0;
  const placeholder =
    row.unit === "trips" ? "Trips" : row.unit === "pct" ? "Margin %" : "INR";

  return (
    <View style={styles.goalsTargetCard}>
      <View style={styles.goalsTargetCardHeader}>
        <Text style={styles.goalsTargetCardTitle}>{row.label}</Text>
        <Pressable onPress={onStartEdit} hitSlop={8}>
          <Pencil size={14} color={METRONIC.muted} />
        </Pressable>
      </View>
      <Text style={styles.goalsTargetCardHint}>{row.subtitle}</Text>
      <View style={styles.goalsTargetInner}>
        <View style={styles.goalsTargetValueCol}>
          <Text style={styles.goalsTargetActual}>{formatMetricValue(row)}</Text>
          <Text style={styles.goalsTargetMeta} numberOfLines={2}>
            {hasTarget
              ? `${row.progressPct}% of ${formatMetricTarget(row)}`
              : "Set a monthly target for the selected month."}
          </Text>
        </View>
        {editing ? (
          <View style={styles.goalsTargetEditCol}>
            <TextInput
              style={styles.goalsTargetInput}
              value={draft}
              onChangeText={onDraftChange}
              keyboardType="numeric"
              placeholder={placeholder}
              placeholderTextColor={METRONIC.muted}
            />
            <View style={styles.goalsTargetEditActions}>
              <Pressable onPress={onCancel} style={styles.goalsTargetCancelBtn}>
                <Text style={styles.goalsTargetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.goalsTargetSaveBtn}>
                <Text style={styles.goalsTargetSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={onStartEdit} style={styles.goalsTargetActionBtn}>
            <Text style={styles.goalsTargetActionText}>
              {hasTarget ? "Edit goal" : "Add a goal"}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.goalsTargetSliderTrack}>
        <View
          style={[
            styles.goalsTargetSliderFill,
            { width: `${hasTarget ? Math.min(100, row.progressPct) : 8}%` },
          ]}
        />
        <View
          style={[
            styles.goalsTargetSliderThumb,
            {
              left: `${hasTarget ? Math.min(96, Math.max(4, row.progressPct)) : 4}%`,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.goalsStatusPill,
          row.status === "on_track"
            ? styles.goalsStatusOnTrack
            : row.status === "behind"
              ? styles.goalsStatusBehind
              : styles.goalsStatusUnset,
        ]}
      >
        <Text
          style={[
            styles.goalsStatusText,
            row.status === "on_track"
              ? styles.goalsStatusOnTrackText
              : row.status === "behind"
                ? styles.goalsStatusBehindText
                : styles.goalsStatusUnsetText,
          ]}
        >
          {row.status === "on_track"
            ? "On track"
            : row.status === "behind"
              ? "Behind target"
              : "No target"}
        </Text>
      </View>
    </View>
  );
}

// ─── Additional styles for KAM / region / hierarchy features ──────────────────
const goalsExtra = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  clearFilterText: {
    fontSize: 12,
    color: METRONIC.link,
    fontWeight: "600",
  },

  // ── Hierarchy targets ───────────────────────────────────────────────────────
  hierarchyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF0F8",
  },
  hierarchyLeft: {
    flex: 1,
    minWidth: 0,
  },
  hierarchyLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hierarchyValue: {
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
    marginTop: 2,
  },
  hierarchyEmpty: {
    fontSize: 13,
    color: METRONIC.muted,
    marginTop: 2,
  },
  hierarchyHelperText: {
    fontSize: 10,
    color: METRONIC.subtle,
    marginTop: 2,
    lineHeight: 13,
  },
  hierarchyEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hierarchyInput: {
    width: 110,
    height: 32,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.link,
    paddingHorizontal: 8,
    fontSize: 13,
    color: METRONIC.text,
    backgroundColor: "#fff",
  },
  hierarchySaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: METRONIC.link,
    alignItems: "center",
    justifyContent: "center",
  },
  hierarchySaveBtnText: {
    fontSize: 14,
    color: Theme.buttonPrimaryText,
    fontWeight: "700",
  },
  hierarchyCancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── KAM filter pills ────────────────────────────────────────────────────────
  kamFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EEF0F8",
    backgroundColor: "#fff",
    marginBottom: 4,
  },
  kamFilterChipOn: {
    borderColor: METRONIC.link,
    backgroundColor: "#EEF6FF",
  },
  kamFilterChipText: {
    fontSize: 13,
    color: METRONIC.muted,
    fontWeight: "500",
    maxWidth: 80,
  },
  kamFilterChipTextOn: {
    color: METRONIC.link,
    fontWeight: "600",
  },

  // ── KAM avatar ───────────────────────────────────────────────────────────────
  kamAvatar: {
    backgroundColor: METRONIC.link,
    alignItems: "center",
    justifyContent: "center",
  },
  kamAvatarText: {
    color: "#fff",
    fontWeight: "700",
  },
  kamAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF0F8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F8FF",
  },

  // ── Entity table with KAM column (grid columns live in networkDesktopHub.styles) ──
  entityNameSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  kamCellName: {
    fontSize: 11,
    color: METRONIC.link,
    fontWeight: "500",
    flexShrink: 1,
  },

  // ── Region chip ─────────────────────────────────────────────────────────────
  regionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#EEF6FF",
  },
  regionChipText: {
    fontSize: 10,
    color: METRONIC.link,
    fontWeight: "500",
    maxWidth: 60,
  },
  regionChipEmpty: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#B5BED5",
    borderStyle: "dashed",
  },
  regionChipEmptyText: {
    fontSize: 10,
    color: METRONIC.muted,
  },

  // ── Cross-filter bar ─────────────────────────────────────────────────────────
  crossFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EEF6FF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#C0D8FF",
  },
  crossFilterBarText: {
    flex: 1,
    fontSize: 12,
    color: METRONIC.link,
    fontWeight: "500",
  },

  // ── KAM modal ────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  kamModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  kamModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  kamModalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: METRONIC.text,
  },
  kamModalSub: {
    fontSize: 13,
    color: METRONIC.muted,
    marginBottom: 16,
  },
  kamMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  kamMemberRowActive: {
    backgroundColor: "#EEF6FF",
  },
  kamMemberName: {
    fontSize: 14,
    fontWeight: "600",
    color: METRONIC.text,
  },
  kamMemberRole: {
    fontSize: 12,
    color: METRONIC.muted,
    marginTop: 2,
    textTransform: "capitalize",
  },
  kamMemberCheck: {
    fontSize: 16,
    color: METRONIC.link,
    fontWeight: "700",
  },

  // ── Region modal ─────────────────────────────────────────────────────────────
  regionModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  regionInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.link,
    paddingHorizontal: 12,
    fontSize: 15,
    color: METRONIC.text,
    marginBottom: 16,
  },
  regionModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  regionClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EEF0F8",
  },
  regionClearText: {
    fontSize: 14,
    color: METRONIC.muted,
    fontWeight: "500",
  },
  regionSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: METRONIC.link,
  },
  regionSaveBtnDisabled: {
    opacity: 0.55,
  },
  regionSaveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
  },
});


// ─── KAM + period target sub-components ───────────────────────────────────────

function memberInitials(member: OrgMember): string {
  const name = member.full_name?.trim() ?? "";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (name.slice(0, 2) || "?").toUpperCase();
}

function KamAvatar({ member, size = 24 }: { member: OrgMember | null; size?: number }) {
  if (!member) {
    return (
      <View style={[goalsExtra.kamAvatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
        <User size={size * 0.55} color={METRONIC.muted} />
      </View>
    );
  }
  return (
    <View style={[goalsExtra.kamAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[goalsExtra.kamAvatarText, { fontSize: size * 0.38 }]}>
        {memberInitials(member)}
      </Text>
    </View>
  );
}

function HierarchyTargetRow({
  label,
  target,
  editing,
  draft,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
  readOnly = false,
  helperText,
}: {
  label: string;
  target: SalesTargetMetrics;
  editing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  helperText?: string;
}) {
  const hasTarget = target.revenueInr > 0;
  return (
    <View style={goalsExtra.hierarchyRow}>
      <View style={goalsExtra.hierarchyLeft}>
        <Text style={goalsExtra.hierarchyLabel}>{label}</Text>
        {hasTarget ? (
          <Text style={goalsExtra.hierarchyValue}>{formatINRChip(target.revenueInr)}</Text>
        ) : (
          <Text style={goalsExtra.hierarchyEmpty}>Not set</Text>
        )}
        {helperText ? (
          <Text style={goalsExtra.hierarchyHelperText}>{helperText}</Text>
        ) : null}
      </View>
      {readOnly ? null : editing ? (
        <View style={goalsExtra.hierarchyEditRow}>
          <TextInput
            style={goalsExtra.hierarchyInput}
            value={draft}
            onChangeText={onDraftChange}
            keyboardType="numeric"
            placeholder="Revenue INR"
            placeholderTextColor={METRONIC.muted}
            autoFocus
          />
          <Pressable onPress={onSave} style={goalsExtra.hierarchySaveBtn}>
            <Text style={goalsExtra.hierarchySaveBtnText}>✓</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={goalsExtra.hierarchyCancelBtn}>
            <X size={12} color={METRONIC.muted} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onStartEdit} hitSlop={8}>
          <Pencil size={13} color={METRONIC.muted} />
        </Pressable>
      )}
    </View>
  );
}

export function NetworkDesktopGoalsPanel({ orgId }: Props) {
  const layout = useProfileHubCompactLayout();
  const monthOptions = useMemo(() => getRecentMonthKeys(3), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    () => monthOptions[monthOptions.length - 1] ?? getRecentMonthKeys(1)[0],
  );
  const [rollup, setRollup] = useState<GoalsRollup>("month");
  const [activeFocus, setActiveFocus] = useState<GoalFocus>("client");
  const [balancePeriod, setBalancePeriod] = useState<SalesDateRange>("3m");
  const [goalsStore, setGoalsStore] = useState<NetworkGoalsStore>(
    DEFAULT_NETWORK_GOALS_STORE,
  );
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [editingMetric, setEditingMetric] = useState<
    GoalTargetRow["metric"] | null
  >(null);
  const [draftTarget, setDraftTarget] = useState("");
  const [goalWizardEntity, setGoalWizardEntity] = useState<EntityGoalRow | null>(
    null,
  );
  const [balanceChartWidth, setBalanceChartWidth] = useState(420);
  const [saving, setSaving] = useState(false);

  // ── Cross-filter state (Power BI-style) ──────────────────────────────────────
  const [selectedKamFilter, setSelectedKamFilter] = useState<string | null>(null);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string | null>(null);
  const [groupByRegion, setGroupByRegion] = useState(false);

  // ── KAM assignment modal ─────────────────────────────────────────────────────
  const [kamModalClientId, setKamModalClientId] = useState<string | null>(null);

  // ── Region assignment modal ───────────────────────────────────────────────────
  const [regionModalClientId, setRegionModalClientId] = useState<string | null>(null);
  const [regionDraft, setRegionDraft] = useState("");

  // ── Yearly / quarterly target editing ────────────────────────────────────────
  const [editingPeriodKey, setEditingPeriodKey] = useState<string | null>(null);
  const [periodTargetDraft, setPeriodTargetDraft] = useState("");

  const tripsQ = useTripsQuery(orgId);
  const txQ = useTransactionsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);
  const orgMembersQ = useOrgMembersData(orgId);

  const trips = tripsQ.data ?? [];
  const transactions = txQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  // Only include non-driver members as potential KAMs
  const teamMembers = useMemo(
    () => (orgMembersQ.data?.members ?? []).filter((m) => m.role !== "driver" && m.status === "active"),
    [orgMembersQ.data],
  );
  const memberById = useMemo(
    () => new Map(teamMembers.map((m) => [m.user_id, m])),
    [teamMembers],
  );

  useEffect(() => {
    let cancelled = false;
    setGoalsLoading(true);
    void loadNetworkGoalsStore(orgId).then((loaded) => {
      if (!cancelled) {
        setGoalsStore(loaded);
        setGoalsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const actuals = useMemo(
    () => computeGoalsActualsForRollup(trips, selectedMonthKey, rollup),
    [trips, selectedMonthKey, rollup],
  );

  const periodSummary = useMemo(
    () => buildPeriodSummary(goalsStore, selectedMonthKey, rollup),
    [goalsStore, selectedMonthKey, rollup],
  );

  const balanceSnapshot = useMemo(
    () =>
      computePayableReceivableSnapshot(
        clients,
        suppliers,
        drivers,
        trips,
        transactions,
        balancePeriodMonthKeys(balancePeriod, selectedMonthKey),
      ),
    [clients, suppliers, drivers, trips, transactions, balancePeriod, selectedMonthKey],
  );

  const balanceMonthKeys = useMemo(
    () => balancePeriodMonthKeys(balancePeriod, selectedMonthKey),
    [balancePeriod, selectedMonthKey],
  );
  const balanceTrend = useMemo(
    () => buildBalanceTrendPoints(trips, balanceMonthKeys),
    [trips, balanceMonthKeys],
  );

  const summaryRows = useMemo(
    () => buildGoalSummaryRows(goalsStore, actuals, selectedMonthKey, rollup),
    [goalsStore, actuals, selectedMonthKey, rollup],
  );

  const allEntityRows = useMemo(
    () =>
      buildEntityGoalRows(
        activeFocus,
        goalsStore,
        clients,
        drivers,
        vehicles,
        trips,
        selectedMonthKey,
        rollup,
        50,
      ),
    [
      activeFocus,
      goalsStore,
      clients,
      drivers,
      vehicles,
      trips,
      selectedMonthKey,
      rollup,
    ],
  );

  // Cross-filter: apply KAM + region filters
  const entityRows = useMemo(() => {
    let rows = allEntityRows;
    if (selectedKamFilter) {
      rows = rows.filter((r) => r.kamUserId === selectedKamFilter);
    }
    if (selectedRegionFilter) {
      rows = rows.filter((r) => r.region === selectedRegionFilter);
    }
    return rows;
  }, [allEntityRows, selectedKamFilter, selectedRegionFilter]);

  // Unique KAMs present in client rows (for sidebar filter pills)
  const activeKams = useMemo(() => {
    if (activeFocus !== "client") return [];
    const seen = new Set<string>();
    const result: OrgMember[] = [];
    for (const row of allEntityRows) {
      if (row.kamUserId && !seen.has(row.kamUserId)) {
        seen.add(row.kamUserId);
        const member = memberById.get(row.kamUserId);
        if (member) result.push(member);
      }
    }
    return result;
  }, [activeFocus, allEntityRows, memberById]);

  // Unique regions present in client rows (for sidebar filter pills)
  const activeRegions = useMemo(() => {
    if (activeFocus !== "client") return [];
    const seen = new Set<string>();
    for (const row of allEntityRows) {
      if (row.region) seen.add(row.region);
    }
    return [...seen].sort();
  }, [activeFocus, allEntityRows]);

  const hasActiveFilters = selectedKamFilter != null || selectedRegionFilter != null;

  const selectedMonthStore = useMemo(
    () => getMonthStore(goalsStore, selectedMonthKey),
    [goalsStore, selectedMonthKey],
  );

  // Yearly / quarterly computed values for hierarchy target section
  const selectedYear = yearFromMonthKey(selectedMonthKey);
  const quarterKeys = yearQuarterKeys(selectedYear);
  const quarterlyTargets = useMemo(
    () => Object.fromEntries(quarterKeys.map((qk) => [qk, getQuarterlyTarget(goalsStore, qk)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goalsStore, selectedYear],
  );
  const yearlyTargetFromQuarterly = useMemo<SalesTargetMetrics>(() => {
    const revenueInr = quarterKeys.reduce(
      (sum, qk) => sum + (quarterlyTargets[qk]?.revenueInr ?? 0),
      0,
    );
    return {
      revenueInr,
      tripCount: 0,
      marginPct: 0,
    };
  }, [quarterKeys, quarterlyTargets]);

  const prevMonthKey = previousMonthKey(selectedMonthKey);
  const monthHasTargets =
    selectedMonthStore.aggregate.revenueInr > 0 ||
    selectedMonthStore.aggregate.tripCount > 0 ||
    selectedMonthStore.aggregate.marginPct > 0 ||
    Object.keys(selectedMonthStore.clients).length > 0 ||
    Object.keys(selectedMonthStore.vehicles).length > 0 ||
    Object.keys(selectedMonthStore.drivers).length > 0;

  const receivableProgress =
    balanceSnapshot.receivableBilled > 0
      ? Math.round(
          (balanceSnapshot.receivableCollected /
            balanceSnapshot.receivableBilled) *
            100,
        )
      : 0;

  const payableTotal =
    balanceSnapshot.supplierPayable + balanceSnapshot.driverPayable;
  const payablePaid =
    balanceSnapshot.supplierPaid + balanceSnapshot.driverPaid;
  const payableProgress =
    payableTotal > 0 ? Math.round((payablePaid / payableTotal) * 100) : 0;

  const persistStore = useCallback(
    async (next: NetworkGoalsStore) => {
      setSaving(true);
      setGoalsStore(next);
      try {
        await saveNetworkGoalsStore(orgId, next);
      } finally {
        setSaving(false);
      }
    },
    [orgId],
  );

  const startAggregateEdit = (row: GoalTargetRow) => {
    setEditingMetric(row.metric);
    setDraftTarget(row.target > 0 ? String(row.target) : "");
  };

  const saveAggregateEdit = async (metric: GoalTargetRow["metric"]) => {
    const parsed = Number(draftTarget.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const patch =
      metric === "revenue"
        ? { revenueInr: parsed }
        : metric === "trips"
          ? { tripCount: Math.round(parsed) }
          : { marginPct: Math.min(100, parsed) };
    const next = patchAggregateTarget(goalsStore, selectedMonthKey, patch);
    await persistStore(next);
    setEditingMetric(null);
    setDraftTarget("");
  };

  const handleCarryForward = async () => {
    if (!prevMonthKey) return;
    const next = carryForwardGoals(
      goalsStore,
      prevMonthKey,
      selectedMonthKey,
      "all",
    );
    await persistStore(next);
  };

  const goalWizardClient = useMemo(() => {
    if (!goalWizardEntity || activeFocus !== "client") return null;
    return clients.find((c) => c.id === goalWizardEntity.id) ?? null;
  }, [activeFocus, clients, goalWizardEntity]);

  const saveGoalWizard = async (revenueInr: number, tripCount: number) => {
    if (!goalWizardEntity) return;
    setSaving(true);
    try {
      const next = patchEntityTarget(
        goalsStore,
        selectedMonthKey,
        activeFocus,
        goalWizardEntity.id,
        {
          revenueInr,
          tripCount,
        },
      );
      await persistStore(next);
      setGoalWizardEntity(null);
    } finally {
      setSaving(false);
    }
  };

  // ── KAM assignment ───────────────────────────────────────────────────────────
  const handleAssignKam = useCallback(
    async (clientId: string, userId: string | null) => {
      const next = patchKamAssignment(goalsStore, clientId, userId);
      await persistStore(next);
      setKamModalClientId(null);
    },
    [goalsStore, persistStore],
  );

  // ── Region assignment ────────────────────────────────────────────────────────
  const openRegionModal = useCallback((clientId: string, currentRegion: string | null) => {
    setRegionModalClientId(clientId);
    setRegionDraft(currentRegion ?? "");
  }, []);

  const saveRegion = useCallback(async () => {
    if (!regionModalClientId) return;
    const next = patchClientRegion(goalsStore, regionModalClientId, regionDraft);
    await persistStore(next);
    setRegionModalClientId(null);
    setRegionDraft("");
  }, [goalsStore, persistStore, regionDraft, regionModalClientId]);

  // ── Hierarchy targets (annual / quarterly) ───────────────────────────────────
  const startPeriodEdit = useCallback((key: string, current: SalesTargetMetrics) => {
    setEditingPeriodKey(key);
    setPeriodTargetDraft(current.revenueInr > 0 ? String(current.revenueInr) : "");
  }, []);

  const savePeriodTarget = useCallback(async () => {
    if (!editingPeriodKey) return;
    const parsed = Number(periodTargetDraft.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (/^\d{4}$/.test(editingPeriodKey)) return;
    const next = patchQuarterlyTarget(goalsStore, editingPeriodKey, { revenueInr: parsed });
    await persistStore(next);
    setEditingPeriodKey(null);
    setPeriodTargetDraft("");
  }, [editingPeriodKey, goalsStore, periodTargetDraft, persistStore]);

  const dataLoading =
    tripsQ.isLoading ||
    txQ.isLoading ||
    clientsQ.isLoading ||
    suppliersQ.isLoading;

  const targetsSetCount = summaryRows.filter((r) => r.target > 0).length;

  return (
    <View style={[styles.salesBody, layout.salesBody]}>
      <View style={[styles.splitRow, layout.splitRow]}>
        <View style={[styles.sidebar, layout.sidebar]}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Goal filters</Text>
            <Text style={styles.salesFilterHint}>
              Set targets per month · view month, quarter, or YTD
            </Text>

            <Text style={styles.salesFilterGroup}>Target month</Text>
            <View style={styles.tagWrap}>
              {monthOptions.map((key) => (
                <FilterChip
                  key={key}
                  label={monthLabelFromKey(key)}
                  active={selectedMonthKey === key}
                  onPress={() => setSelectedMonthKey(key)}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Rollup view</Text>
            <View style={styles.tagWrap}>
              {ROLLUPS.map((r) => (
                <FilterChip
                  key={r.id}
                  label={r.label}
                  active={rollup === r.id}
                  onPress={() => setRollup(r.id)}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Focus</Text>
            <View style={styles.tagWrap}>
              {FOCUS_TABS.map((tab) => (
                <FilterChip
                  key={tab.id}
                  label={tab.label}
                  active={activeFocus === tab.id}
                  onPress={() => setActiveFocus(tab.id)}
                />
              ))}
            </View>

            {!monthHasTargets && prevMonthKey ? (
              <Pressable
                style={styles.goalsCarryForwardBtn}
                onPress={() => void handleCarryForward()}
              >
                <Copy size={14} color={METRONIC.link} />
                <Text style={styles.goalsCarryForwardText}>
                  Carry forward from {monthLabelFromKey(prevMonthKey)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* ── Annual + quarterly target hierarchy ──────────────────────────── */}
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <View style={goalsExtra.sectionHeaderRow}>
              <Text style={styles.cardTitle}>Annual targets · {selectedYear}</Text>
            </View>
            <Text style={[styles.salesFilterHint, { marginBottom: 8 }]}>
              Set revenue goals for the full year and each quarter
            </Text>
            <HierarchyTargetRow
              label={`FY ${selectedYear}`}
              target={yearlyTargetFromQuarterly}
              editing={false}
              draft={periodTargetDraft}
              onStartEdit={() => {}}
              onDraftChange={setPeriodTargetDraft}
              onSave={() => void savePeriodTarget()}
              onCancel={() => { setEditingPeriodKey(null); setPeriodTargetDraft(""); }}
              readOnly
              helperText="Auto-calculated from Q1–Q4 targets"
            />
            {quarterKeys.map((qk) => (
              <HierarchyTargetRow
                key={qk}
                label={qk.split("-")[1] ?? qk}
                target={quarterlyTargets[qk] ?? { revenueInr: 0, tripCount: 0, marginPct: 0 }}
                editing={editingPeriodKey === qk}
                draft={periodTargetDraft}
                onStartEdit={() => startPeriodEdit(qk, quarterlyTargets[qk] ?? { revenueInr: 0, tripCount: 0, marginPct: 0 })}
                onDraftChange={setPeriodTargetDraft}
                onSave={() => void savePeriodTarget()}
                onCancel={() => { setEditingPeriodKey(null); setPeriodTargetDraft(""); }}
              />
            ))}
          </View>

          {/* ── KAM filter pills (client focus only) ─────────────────────────── */}
          {activeFocus === "client" && activeKams.length > 0 ? (
            <View style={[styles.salesCard, styles.salesCardPad]}>
              <View style={goalsExtra.sectionHeaderRow}>
                <Text style={styles.cardTitle}>KAM filter</Text>
                {selectedKamFilter && (
                  <Pressable onPress={() => setSelectedKamFilter(null)} hitSlop={8}>
                    <Text style={goalsExtra.clearFilterText}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <Text style={[styles.salesFilterHint, { marginBottom: 8 }]}>
                Click a KAM to filter the client table
              </Text>
              <View style={styles.tagWrap}>
                {activeKams.map((member) => (
                  <Pressable
                    key={member.user_id}
                    style={[
                      goalsExtra.kamFilterChip,
                      selectedKamFilter === member.user_id && goalsExtra.kamFilterChipOn,
                    ]}
                    onPress={() =>
                      setSelectedKamFilter(
                        selectedKamFilter === member.user_id ? null : member.user_id,
                      )
                    }
                  >
                    <KamAvatar member={member} size={20} />
                    <Text
                      style={[
                        goalsExtra.kamFilterChipText,
                        selectedKamFilter === member.user_id && goalsExtra.kamFilterChipTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {member.full_name?.split(" ")[0] ?? "Member"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* ── Region filter pills (client focus only) ──────────────────────── */}
          {activeFocus === "client" && activeRegions.length > 0 ? (
            <View style={[styles.salesCard, styles.salesCardPad]}>
              <View style={goalsExtra.sectionHeaderRow}>
                <View style={goalsExtra.sectionTitleRow}>
                  <MapPin size={13} color={METRONIC.muted} />
                  <Text style={styles.cardTitle}>Region filter</Text>
                </View>
                {selectedRegionFilter && (
                  <Pressable onPress={() => setSelectedRegionFilter(null)} hitSlop={8}>
                    <Text style={goalsExtra.clearFilterText}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.tagWrap, { marginTop: 8 }]}>
                <FilterChip
                  label="Group by region"
                  active={groupByRegion}
                  onPress={() => setGroupByRegion((v) => !v)}
                />
                {activeRegions.map((region) => (
                  <FilterChip
                    key={region}
                    label={region}
                    active={selectedRegionFilter === region}
                    onPress={() =>
                      setSelectedRegionFilter(
                        selectedRegionFilter === region ? null : region,
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>
              {periodSummary.rollupLabel} progress
            </Text>
            {summaryRows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.goalsSidebarRow,
                  idx === summaryRows.length - 1 && styles.goalsSidebarRowLast,
                ]}
              >
                <View style={styles.goalsSidebarRowTop}>
                  <Text style={styles.goalsSidebarLabel}>{row.label}</Text>
                  <Text style={styles.goalsSidebarPct}>
                    {row.target > 0 ? `${row.progressPct}%` : "—"}
                  </Text>
                </View>
                <View style={styles.goalsSidebarTrack}>
                  <View
                    style={[
                      styles.goalsSidebarFill,
                      {
                        width: `${row.target > 0 ? Math.min(100, row.progressPct) : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalsSidebarMeta}>
                  {formatMetricValue(row)}
                  {row.target > 0 ? ` / ${formatMetricTarget(row)}` : ""}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Entity targets (rollup)</Text>
            <Text style={styles.goalsNetSub}>
              Clients {formatINRChip(periodSummary.clientTargetSum.revenueInr)}
              {" · "}
              Vehicles {formatINRChip(periodSummary.vehicleTargetSum.revenueInr)}
              {" · "}
              Drivers {formatINRChip(periodSummary.driverTargetSum.revenueInr)}
            </Text>
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Net position</Text>
            <Text style={styles.goalsNetValue}>
              {formatINRChip(balanceSnapshot.netPosition)}
            </Text>
            <Text style={styles.goalsNetSub}>
              Receivable {formatINRChip(balanceSnapshot.receivableDue)} ·
              Payable {formatINRChip(balanceSnapshot.totalPayable)}
            </Text>
          </View>

          <NetworkDesktopSidebarFeatureAd layout="square" />
        </View>

        <View style={[styles.mainCol, layout.mainCol]}>
          {dataLoading || goalsLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={METRONIC.link} />
            </View>
          ) : (
            <>
              <View style={styles.goalsBalanceRow}>
                <BalanceWidget
                  title="Receivable"
                  label="Due from clients"
                  amount={formatINR(balanceSnapshot.receivableDue).replace(
                    /\s/g,
                    "",
                  )}
                  sub={`Collected ${formatINRChip(balanceSnapshot.receivableCollected)} of ${formatINRChip(balanceSnapshot.receivableBilled)} billed`}
                  progress={receivableProgress}
                  progressLabel={`${receivableProgress}% collected`}
                  tone="receivable"
                  period={balancePeriod}
                  onPeriodChange={setBalancePeriod}
                  icon={
                    <ArrowDownLeft size={18} color="#3E97FF" strokeWidth={2.2} />
                  }
                />
                <BalanceWidget
                  title="Payable"
                  label="Due to partners"
                  amount={formatINR(balanceSnapshot.totalPayable).replace(
                    /\s/g,
                    "",
                  )}
                  sub={`Supplier ${formatINRChip(balanceSnapshot.supplierPayable)} · Driver ${formatINRChip(balanceSnapshot.driverPayable)}`}
                  progress={payableProgress}
                  progressLabel={`${payableProgress}% settled`}
                  tone="payable"
                  period={balancePeriod}
                  onPeriodChange={setBalancePeriod}
                  icon={
                    <ArrowUpRight size={18} color="#F1416C" strokeWidth={2.2} />
                  }
                />
              </View>

              <View style={[styles.salesCard, styles.salesCardPadTight]}>
                <View style={styles.salesWidgetHeader}>
                  <Text style={styles.salesCardTitle}>Balance trend</Text>
                  <Text style={styles.goalsChartSub}>
                    Receivable vs payable ·{" "}
                    {balancePeriod === "3m"
                      ? monthLabelFromKey(selectedMonthKey)
                      : balancePeriod === "6m"
                        ? `quarter to ${monthLabelFromKey(selectedMonthKey)}`
                        : balancePeriod === "12m"
                          ? `YTD to ${monthLabelFromKey(selectedMonthKey)}`
                          : `last ${balanceMonthKeys.length} months`}
                  </Text>
                </View>
                <View
                  style={styles.salesWidgetChartBody}
                  onLayout={(e) => {
                    const w = Math.floor(e.nativeEvent.layout.width);
                    if (w > 0 && w !== balanceChartWidth) {
                      setBalanceChartWidth(w);
                    }
                  }}
                >
                  <NetworkDesktopGoalsBalanceChart
                    data={balanceTrend}
                    width={balanceChartWidth}
                    height={156}
                  />
                </View>
              </View>

              <View style={styles.goalsMonthBanner}>
                <Text style={styles.goalsMonthBannerTitle}>
                  Aggregate targets · {monthLabelFromKey(selectedMonthKey)}
                </Text>
                <Text style={styles.goalsMonthBannerSub}>
                  {rollup === "month"
                    ? "Editing this month only"
                    : `${periodSummary.rollupLabel} compares cumulative actuals vs summed monthly targets`}
                </Text>
              </View>

              <View style={styles.goalsTargetGridThree}>
                {summaryRows.map((row) => (
                  <GoalTargetCard
                    key={row.id}
                    row={row}
                    editing={editingMetric === row.metric}
                    draft={draftTarget}
                    onDraftChange={setDraftTarget}
                    onStartEdit={() => startAggregateEdit(row)}
                    onSave={() => void saveAggregateEdit(row.metric)}
                    onCancel={() => {
                      setEditingMetric(null);
                      setDraftTarget("");
                    }}
                  />
                ))}
              </View>

              <View style={[styles.salesCard, styles.salesTableCard]}>
                <View style={styles.salesTableTitleRow}>
                  <View style={styles.salesTripTableTitleCol}>
                    <Text style={styles.salesCardTitle}>
                      {FOCUS_TABS.find((t) => t.id === activeFocus)?.label}{" "}
                      targets
                    </Text>
                    <Text style={styles.salesTripTableSub}>
                      {activeFocus === "client"
                        ? "Revenue per client · set for "
                        : "Revenue & trips per asset · set for "}
                      {monthLabelFromKey(selectedMonthKey)}
                      {rollup !== "month"
                        ? ` · showing ${periodSummary.rollupLabel} actuals`
                        : ""}
                    </Text>
                  </View>
                  {saving ? (
                    <ActivityIndicator size="small" color={METRONIC.link} />
                  ) : (
                    <Pressable style={styles.salesCardMenu}>
                      <MoreVertical size={15} color={METRONIC.muted} />
                    </Pressable>
                  )}
                </View>

                {/* Cross-filter active bar */}
                {hasActiveFilters ? (
                  <View style={goalsExtra.crossFilterBar}>
                    <Filter size={12} color={METRONIC.link} />
                    <Text style={goalsExtra.crossFilterBarText}>
                      {[
                        selectedKamFilter
                          ? `KAM: ${memberById.get(selectedKamFilter)?.full_name?.split(" ")[0] ?? "—"}`
                          : null,
                        selectedRegionFilter ? `Region: ${selectedRegionFilter}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setSelectedKamFilter(null);
                        setSelectedRegionFilter(null);
                      }}
                      hitSlop={8}
                    >
                      <X size={13} color={METRONIC.muted} />
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.salesTableScroll}>
                  <View style={styles.goalsEntityTableHead}>
                    <View
                      style={
                        activeFocus === "client"
                          ? styles.goalsEntityTableGridKam
                          : styles.goalsEntityTableGrid
                      }
                    >
                      <Text style={[styles.goalsEntityHeadCell, styles.goalsEntityColName]}>
                        Name
                      </Text>
                      {activeFocus === "client" && (
                        <Text style={[styles.goalsEntityHeadCell, styles.goalsEntityColKam]}>
                          KAM
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.goalsEntityHeadCell,
                          styles.goalsEntityColActual,
                          styles.goalsEntityHeadNum,
                        ]}
                      >
                        Actual
                      </Text>
                      <Text
                        style={[
                          styles.goalsEntityHeadCell,
                          styles.goalsEntityColTarget,
                          styles.goalsEntityHeadNum,
                        ]}
                      >
                        Target
                      </Text>
                      <Text
                        style={[
                          styles.goalsEntityHeadCell,
                          styles.goalsEntityColProgress,
                          styles.goalsEntityHeadNum,
                        ]}
                      >
                        Progress
                      </Text>
                      <View style={styles.goalsEntityColAction} />
                    </View>
                  </View>

                {entityRows.length === 0 ? (
                  <View style={styles.salesTableEmpty}>
                    <Text style={styles.emptyText}>
                      {hasActiveFilters
                        ? "No clients match the active filters."
                        : `No ${activeFocus}s found. Add connections to set targets.`}
                    </Text>
                  </View>
                ) : (
                  entityRows.map((entity, idx) => {
                    const primaryActual =
                      activeFocus === "client"
                        ? formatINRChip(entity.actualRevenue)
                        : `${formatINRChip(entity.actualRevenue)} · ${entity.actualTrips} trips`;
                    const primaryTarget =
                      activeFocus === "client"
                        ? entity.targetRevenue > 0
                          ? formatINRChip(entity.targetRevenue)
                          : "—"
                        : entity.hasTarget
                          ? `${formatINRChip(entity.targetRevenue)} · ${entity.targetTrips} trips`
                          : "—";
                    const progressPct =
                      activeFocus === "client"
                        ? entity.revenueProgressPct
                        : Math.round(
                            (entity.revenueProgressPct + entity.tripProgressPct) / 2,
                          );
                    const kamMember = entity.kamUserId ? memberById.get(entity.kamUserId) : null;

                    return (
                      <Pressable
                        key={entity.id}
                        style={[
                          styles.goalsEntityRow,
                          idx === entityRows.length - 1 && styles.salesTableRowLast,
                        ]}
                        onPress={() => setGoalWizardEntity(entity)}
                        accessibilityRole="button"
                        accessibilityLabel={`Set goal for ${entity.name}`}
                      >
                        <View
                          style={
                            activeFocus === "client"
                              ? styles.goalsEntityTableGridKam
                              : styles.goalsEntityTableGrid
                          }
                        >
                          <View style={styles.goalsEntityColName}>
                            <Text style={styles.goalsEntityName} numberOfLines={1}>
                              {entity.name}
                            </Text>
                            <View style={goalsExtra.entityNameSubRow}>
                              <Text style={styles.goalsEntityMeta} numberOfLines={1}>
                                {entity.meta}
                              </Text>
                              {entity.region ? (
                                <Pressable
                                  style={goalsExtra.regionChip}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    openRegionModal(entity.id, entity.region);
                                  }}
                                  hitSlop={4}
                                >
                                  <MapPin size={9} color={METRONIC.link} />
                                  <Text style={goalsExtra.regionChipText} numberOfLines={1}>
                                    {entity.region}
                                  </Text>
                                </Pressable>
                              ) : activeFocus === "client" ? (
                                <Pressable
                                  style={goalsExtra.regionChipEmpty}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    openRegionModal(entity.id, null);
                                  }}
                                  hitSlop={4}
                                >
                                  <Text style={goalsExtra.regionChipEmptyText}>+ Region</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>

                          {activeFocus === "client" && (
                            <Pressable
                              style={styles.goalsEntityColKam}
                              onPress={(e) => {
                                e.stopPropagation();
                                setKamModalClientId(entity.id);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={kamMember ? `KAM: ${kamMember.full_name ?? ""}` : "Assign KAM"}
                            >
                              <KamAvatar member={kamMember ?? null} size={24} />
                              <Text style={goalsExtra.kamCellName} numberOfLines={1}>
                                {kamMember ? (kamMember.full_name?.split(" ")[0] ?? "KAM") : "Assign"}
                              </Text>
                            </Pressable>
                          )}

                          <View style={styles.goalsEntityColActual}>
                            <Text style={styles.goalsEntityValue} numberOfLines={1}>
                              {primaryActual}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColTarget}>
                            <Text style={styles.goalsEntityValue} numberOfLines={2}>
                              {primaryTarget}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColProgress}>
                            <Text style={styles.goalsEntityProgressText}>
                              {entity.hasTarget ? `${progressPct}%` : "—"}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColAction}>
                            <Target size={14} color={METRONIC.link} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
                </View>
              </View>

              <View style={styles.salesKpiRow}>
                <View
                  style={[
                    styles.salesKpiCard,
                    { flexDirection: "row", alignItems: "center", gap: 8 },
                  ]}
                >
                  <View style={[styles.salesKpiIcon, { marginBottom: 0 }]}>
                    <Wallet size={16} color={METRONIC.link} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salesKpiValue}>
                      {formatINRChip(balanceSnapshot.receivableDue)}
                    </Text>
                    <Text style={styles.salesKpiLabel}>Open receivable</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.salesKpiCard,
                    { flexDirection: "row", alignItems: "center", gap: 8 },
                  ]}
                >
                  <View style={[styles.salesKpiIcon, { marginBottom: 0 }]}>
                    <TrendingUp size={16} color="#50CD89" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salesKpiValue}>
                      {formatINRChip(actuals.revenueInr)}
                    </Text>
                    <Text style={styles.salesKpiLabel}>
                      {periodSummary.rollupLabel} sales
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.salesKpiCard,
                    { flexDirection: "row", alignItems: "center", gap: 8 },
                  ]}
                >
                  <View style={[styles.salesKpiIcon, { marginBottom: 0 }]}>
                    <Target size={16} color={Theme.driverGold} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salesKpiValue}>
                      {actuals.marginPct.toFixed(1)}%
                    </Text>
                    <Text style={styles.salesKpiLabel}>Actual margin</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.salesKpiCard,
                    { flexDirection: "row", alignItems: "center", gap: 8 },
                  ]}
                >
                  <View style={[styles.salesKpiIcon, { marginBottom: 0 }]}>
                    <ArrowUpRight size={16} color="#F1416C" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salesKpiValue}>
                      {targetsSetCount}/3
                    </Text>
                    <Text style={styles.salesKpiLabel}>Aggregate targets set</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      <NetworkDesktopEntityGoalWizard
        visible={goalWizardEntity != null}
        focus={activeFocus}
        entity={goalWizardEntity}
        client={goalWizardClient}
        selectedMonthKey={selectedMonthKey}
        goalsStore={goalsStore}
        trips={trips}
        saving={saving}
        onClose={() => setGoalWizardEntity(null)}
        onSave={saveGoalWizard}
      />

      {/* ── KAM assignment modal ─────────────────────────────────────────────── */}
      <Modal
        visible={kamModalClientId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setKamModalClientId(null)}
      >
        <Pressable
          style={goalsExtra.modalOverlay}
          onPress={() => setKamModalClientId(null)}
        >
          <Pressable style={goalsExtra.kamModalCard} onPress={() => {}}>
            <View style={goalsExtra.kamModalHeader}>
              <Text style={goalsExtra.kamModalTitle}>Assign Key Account Manager</Text>
              <Pressable onPress={() => setKamModalClientId(null)} hitSlop={8}>
                <X size={18} color={METRONIC.muted} />
              </Pressable>
            </View>
            <Text style={goalsExtra.kamModalSub}>
              Select a team member to own this client account
            </Text>

            {/* Remove / unassign option */}
            {kamModalClientId && goalsStore.kamAssignments[kamModalClientId] ? (
              <Pressable
                style={goalsExtra.kamMemberRow}
                onPress={() => void handleAssignKam(kamModalClientId!, null)}
              >
                <View style={goalsExtra.kamAvatarPlaceholder}>
                  <X size={14} color="#F1416C" />
                </View>
                <Text style={[goalsExtra.kamMemberName, { color: "#F1416C" }]}>
                  Remove assignment
                </Text>
              </Pressable>
            ) : null}

            <FlatList
              data={teamMembers}
              keyExtractor={(m) => m.user_id}
              scrollEnabled={teamMembers.length > 6}
              style={{ maxHeight: 300 }}
              renderItem={({ item: member }) => {
                const isAssigned =
                  kamModalClientId != null &&
                  goalsStore.kamAssignments[kamModalClientId] === member.user_id;
                return (
                  <Pressable
                    style={[
                      goalsExtra.kamMemberRow,
                      isAssigned && goalsExtra.kamMemberRowActive,
                    ]}
                    onPress={() => void handleAssignKam(kamModalClientId!, member.user_id)}
                  >
                    <KamAvatar member={member} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={goalsExtra.kamMemberName} numberOfLines={1}>
                        {member.full_name ?? "Team member"}
                      </Text>
                      <Text style={goalsExtra.kamMemberRole}>{member.role}</Text>
                    </View>
                    {isAssigned && (
                      <Text style={goalsExtra.kamMemberCheck}>✓</Text>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { padding: 16 }]}>
                  No active team members. Invite team members first.
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Region assignment modal ──────────────────────────────────────────── */}
      <Modal
        visible={regionModalClientId != null}
        transparent
        animationType="fade"
        onRequestClose={() => { setRegionModalClientId(null); setRegionDraft(""); }}
      >
        <Pressable
          style={goalsExtra.modalOverlay}
          onPress={() => { setRegionModalClientId(null); setRegionDraft(""); }}
        >
          <Pressable style={goalsExtra.regionModalCard} onPress={() => {}}>
            <View style={goalsExtra.kamModalHeader}>
              <Text style={goalsExtra.kamModalTitle}>Set client region</Text>
              <Pressable onPress={() => { setRegionModalClientId(null); setRegionDraft(""); }} hitSlop={8}>
                <X size={18} color={METRONIC.muted} />
              </Pressable>
            </View>
            <Text style={goalsExtra.kamModalSub}>
              Group clients by territory (e.g. "North", "Mumbai Zone")
            </Text>
            <TextInput
              style={goalsExtra.regionInput}
              value={regionDraft}
              onChangeText={setRegionDraft}
              placeholder="Enter region name…"
              placeholderTextColor={METRONIC.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void saveRegion()}
            />
            <View style={goalsExtra.regionModalActions}>
              {regionDraft.trim() ? (
                <Pressable
                  style={goalsExtra.regionClearBtn}
                  onPress={() => setRegionDraft("")}
                >
                  <Text style={goalsExtra.regionClearText}>Clear</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[goalsExtra.regionSaveBtn, !regionDraft.trim() && goalsExtra.regionSaveBtnDisabled]}
                onPress={() => void saveRegion()}
                disabled={saving}
              >
                <Text style={goalsExtra.regionSaveBtnText}>
                  {saving ? "Saving…" : regionDraft.trim() ? "Save region" : "Remove region"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
