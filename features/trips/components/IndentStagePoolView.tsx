/**
 * Indent stage: [Card View] [Indent Pool] toggle and the Network projection
 * of one pool (pickup + drop + vehicle) of the shipper's own indents, with
 * full indent identity. Marketplace shows the same pool anonymously in its
 * own components; nothing here is reused there. Pool membership and
 * selection rules live in shipperPoolIndents.util; award, vehicle and driver
 * stay on each indent's existing Review flow.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  getIndentDisplayNumber,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import { titleCaseWord } from "@/features/network/components/MarketplaceLoadCardChrome";
import { MarketplaceLaneFilters } from "@/features/network/components/MarketplaceLaneFilters";
import type {
  ShipperIndentStageView,
  useShipperPoolIndentView,
} from "@/features/network/hooks/useShipperPoolIndentView";
import type { IndentBidSnapshot } from "@/features/network/services/bids.service";
import type { MarketplaceLoadSearch } from "@/features/network/utils/marketplaceSearch.util";
import { poolMembers, type PoolLane } from "@/features/network/utils/pooledOpportunity.util";
import {
  shipperPoolLanes,
  shipperPoolSummaryRows,
  type ShipperPoolModel,
  type ShipperPoolSummaryRow,
} from "@/features/network/utils/shipperPoolIndents.util";
import { formatStoryDate, formatStoryDateTime } from "@/features/network/utils/storyDisplay";
import {
  indentHasAwardRevokedTag,
  indentHubLifecycleStatus,
  indentHubLoadSpecLine,
  indentHubSourceTags,
  indentHubTargetRateInr,
} from "@/features/trips/utils/indentHubCardPresentation";
import {
  parsePositiveInr,
  resolveGiveLoadAwardedAmountInr,
} from "@/features/network/utils/awardedVendorName.util";
import { formatINR } from "@/lib/format";
import { ArrowRight, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Layers, Search, X } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const QUICK_POOL_LIMIT = 6;
const INDENT_PAGE_SIZE = 10;
const NO_SNAPSHOTS: Record<string, IndentBidSnapshot> = {};
const EMPTY_POOL_SEARCH = { pickup: "", drop: "", vehicleType: "" };

function indentClientKey(indent: IndentRow): string {
  const id = (indent.client_id ?? "").trim();
  if (id) return `id:${id}`;
  const name = (indent.client_name ?? "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function indentClientLabel(indent: IndentRow): string {
  return (indent.client_name ?? "").trim() || "Unnamed client";
}

function poolClientOptions(indents: readonly IndentRow[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const indent of indents) {
    const key = indentClientKey(indent);
    if (!key) continue;
    const current = byKey.get(key);
    if (current) current.count += 1;
    else byKey.set(key, { label: indentClientLabel(indent), count: 1 });
  }
  return [...byKey.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function IndentStageViewToggle({
  value,
  onChange,
}: {
  value: ShipperIndentStageView;
  onChange: (next: ShipperIndentStageView) => void;
}) {
  const options: { id: ShipperIndentStageView; label: string }[] = [
    { id: "cards", label: "Card View" },
    { id: "indents", label: "Indent Pool" },
  ];
  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.toggleOption, on && styles.toggleOptionOn]}
            hitSlop={Layout.touchTargetHitSlop}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Indent stage body. Card View (the existing cards) is the default; the
 * toggle needs `tripops.indents.view`, row selection `tripops.indents.allocate`.
 */
export function IndentStageViews({
  state,
  canView,
  canSelect,
  bidCountById,
  bidSnapshotById = NO_SNAPSHOTS,
  listCapped,
  compact,
  onOpenIndent,
  cards,
}: {
  state: ReturnType<typeof useShipperPoolIndentView<IndentRow>>;
  canView: boolean;
  canSelect: boolean;
  bidCountById: Record<string, number>;
  /** Lowest and latest pending bid per indent, when loaded. */
  bidSnapshotById?: Record<string, IndentBidSnapshot>;
  listCapped: boolean;
  compact: boolean;
  onOpenIndent: (indent: IndentRow) => void;
  cards: ReactNode;
}) {
  const showIndents = canView && state.view === "indents";
  return (
    <>
      {canView ? (
        <IndentStageViewToggle value={state.view} onChange={state.setView} />
      ) : null}
      {showIndents ? (
        <IndentStagePoolView
          lanes={state.lanes}
          poolIndents={state.poolIndents}
          allocatedIndents={state.allocatedIndents}
          poolSearch={state.poolSearch}
          onPoolSearchChange={state.setPoolSearch}
          model={state.model}
          canSelect={canSelect}
          bidCountById={bidCountById}
          bidSnapshotById={bidSnapshotById}
          listCapped={listCapped}
          compact={compact}
          onToggle={state.toggle}
          onSelectAllShown={state.selectAllShown}
          onClear={state.clearSelection}
          onShowMore={state.showMore}
          onOpenIndent={onOpenIndent}
        />
      ) : (
        cards
      )}
    </>
  );
}

type Props = {
  lanes: PoolLane[];
  /** Every loaded unallocated indent — the pool universe. */
  poolIndents?: readonly IndentRow[];
  allocatedIndents?: readonly IndentRow[];
  poolSearch: MarketplaceLoadSearch | null;
  onPoolSearchChange: (next: MarketplaceLoadSearch) => void;
  model: ShipperPoolModel<IndentRow>;
  canSelect: boolean;
  bidCountById: Record<string, number>;
  bidSnapshotById?: Record<string, IndentBidSnapshot>;
  /** The indent list hit the finite fetch cap, so a pool may be incomplete. */
  listCapped: boolean;
  compact: boolean;
  onToggle: (indentId: string) => void;
  onSelectAllShown: () => void;
  onClear: () => void;
  onShowMore: () => void;
  onOpenIndent: (indent: IndentRow) => void;
};

function laneTitle(lane: { pickup_area: string; drop_location: string }) {
  return `${titleCaseWord(lane.pickup_area)} → ${titleCaseWord(lane.drop_location)}`;
}

/** "Bengaluru, Bangalore" → city "Bengaluru", region "Bangalore". */
function splitPlace(raw: string): { city: string; region: string | null } {
  const [city, ...rest] = raw.split(",");
  const region = rest.join(",").trim();
  return { city: titleCaseWord((city ?? "").trim()), region: region ? titleCaseWord(region) : null };
}

/** City-only route plus the regions, for one-line rows. */
function compactLane(lane: { pickup_area: string | null; drop_location: string | null }) {
  const from = splitPlace(lane.pickup_area ?? "");
  const to = splitPlace(lane.drop_location ?? "");
  const regions =
    from.region || to.region
      ? `${from.region ?? from.city} → ${to.region ?? to.city}`
      : null;
  return { route: `${from.city} → ${to.city}`, regions };
}

type Lifecycle = "waiting" | "bids" | "awarded";
type StageFilter = Lifecycle | "onTrip";

function lifecycleOf(indent: IndentRow, bids: number): Lifecycle {
  const life = indentHubLifecycleStatus(indent.status, bids);
  if (life === "AWARDED") return "awarded";
  if (life === "RECEIVING BIDS") return "bids";
  return "waiting";
}

function lifecycleLabel(life: Lifecycle, bids: number): string {
  if (life === "awarded") return "Awarded";
  if (life === "bids") return `${bids} bid${bids === 1 ? "" : "s"}`;
  return "Waiting for bid";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function poolStageCounts(
  members: readonly IndentRow[],
  bidCountById: Record<string, number>,
) {
  let waiting = 0;
  let bids = 0;
  let awarded = 0;
  for (const indent of members) {
    const life = lifecycleOf(indent, bidCountById[indent.id] ?? 0);
    if (life === "awarded") awarded += 1;
    else if (life === "bids") bids += 1;
    else waiting += 1;
  }
  return { waiting, bids, awarded };
}

function lowestBidOf(
  members: readonly IndentRow[],
  snapshots: Record<string, IndentBidSnapshot>,
): number | null {
  let lowest: number | null = null;
  for (const indent of members) {
    const amount = snapshots[indent.id]?.lowestAmount ?? null;
    if (amount != null && (lowest == null || amount < lowest)) lowest = amount;
  }
  return lowest;
}

function highestBidOf(
  members: readonly IndentRow[],
  snapshots: Record<string, IndentBidSnapshot>,
): number | null {
  let highest: number | null = null;
  for (const indent of members) {
    const amount = snapshots[indent.id]?.highestAmount ?? snapshots[indent.id]?.lowestAmount ?? null;
    if (amount != null && (highest == null || amount > highest)) highest = amount;
  }
  return highest;
}

/** Live pending bids first; if none, the awarded price(s) so a single rate still shows. */
function bidRangeOf(
  members: readonly IndentRow[],
  snapshots: Record<string, IndentBidSnapshot>,
  bidCountById: Record<string, number>,
): { lowest: number | null; highest: number | null } {
  const lowest = lowestBidOf(members, snapshots);
  const highest = highestBidOf(members, snapshots);
  if (lowest != null || highest != null) return { lowest, highest };
  const awarded = awardedPricesOf(members, bidCountById);
  if (awarded.length === 0) return { lowest: null, highest: null };
  return { lowest: Math.min(...awarded), highest: Math.max(...awarded) };
}

function formatBidRange(lowest: number | null, highest: number | null): string {
  if (lowest == null && highest == null) return "—";
  if (lowest != null && highest != null && lowest !== highest) {
    return `${formatINR(lowest)}–${formatINR(highest)}`;
  }
  return formatINR((lowest ?? highest) as number);
}

function awardedPriceOf(indent: IndentRow): number | null {
  return (
    parsePositiveInr(indent.assigned_supplier_rate) ??
    parsePositiveInr(indent.awarded_amount) ??
    parsePositiveInr(indent["supplier_rate"])
  );
}

/** Same fallbacks as the Home Give Load ticket (includes target when no award stamp). */
function homeBidAmountOf(indent: IndentRow): number | null {
  return resolveGiveLoadAwardedAmountInr({
    assignedSupplierRate: indent.assigned_supplier_rate,
    awardedAmount: indent.awarded_amount,
    indentSupplierRate: indent["supplier_rate"],
    supplierTarget: indent.supplier_target,
  });
}

function awardedPricesOf(
  members: readonly IndentRow[],
  bidCountById: Record<string, number>,
): number[] {
  const amounts: number[] = [];
  for (const indent of members) {
    if (lifecycleOf(indent, bidCountById[indent.id] ?? 0) !== "awarded") continue;
    const amount = awardedPriceOf(indent);
    if (amount != null) amounts.push(amount);
  }
  return amounts;
}

function averageAmount(amounts: readonly number[]): number | null {
  if (amounts.length === 0) return null;
  return Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length);
}

function awardedPriceGroups(amounts: readonly number[]): { amount: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const amount of amounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([amount, count]) => ({ amount, count }));
}


function nextPickupOf(members: readonly IndentRow[]): string | null {
  let next: string | null = null;
  for (const indent of members) {
    const d = (indent.pickup_date ?? "").trim();
    if (d && (next == null || d < next)) next = d;
  }
  return next;
}

const STAGE_STEPS: { id: "posted" | Lifecycle; label: string }[] = [
  { id: "posted", label: "Posted" },
  { id: "bids", label: "Bids" },
  { id: "awarded", label: "Awarded" },
];

/** Posted → Bids → Awarded, filled up to the indent's current stage. */
function StageStepper({ life }: { life: Lifecycle }) {
  const reached = life === "awarded" ? 2 : life === "bids" ? 1 : 0;
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={`Stage ${STAGE_STEPS[reached]!.label}`}
    >
      {STAGE_STEPS.map((step, i) => {
        const done = i <= reached;
        return (
          <View key={step.id} style={styles.step}>
            {i > 0 ? (
              <View style={[styles.stepLine, done && styles.stepLineDone]} />
            ) : null}
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  i === reached && styles.stepDotCurrent,
                ]}
              />
              <Text
                style={[styles.stepLabel, i === reached && styles.stepLabelCurrent]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Segmented bar of a pool's indents by stage. */
function StageBar({
  waiting,
  bids,
  awarded,
  onTrip,
  onSelect,
}: {
  waiting: number;
  bids: number;
  awarded: number;
  onTrip: number;
  onSelect?: (filter: StageFilter) => void;
}) {
  const allParts: { key: StageFilter; value: number; style: object }[] = [
    { key: "waiting", value: waiting, style: styles.barWaiting },
    { key: "bids", value: bids, style: styles.barBids },
    { key: "awarded", value: awarded, style: styles.barAwarded },
    { key: "onTrip", value: onTrip, style: styles.barTrip },
  ];
  const parts = allParts.filter((p) => p.value > 0);
  return (
    <View style={styles.bar}>
      {parts.map((p) => (
        <Pressable
          key={p.key}
          disabled={!onSelect}
          onPress={() => onSelect?.(p.key)}
          style={[styles.barPart, p.style, { flex: p.value }]}
          accessibilityRole={onSelect ? "button" : undefined}
          accessibilityLabel={onSelect ? `Filter ${p.key}` : undefined}
        />
      ))}
    </View>
  );
}

function StageLegend() {
  const items = [
    { label: "Waiting", style: styles.barWaiting },
    { label: "Bids", style: styles.barBids },
    { label: "Awarded", style: styles.barAwarded },
    { label: "On trip", style: styles.barTrip },
  ];
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={[styles.legendDot, it.style]} />
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function StageFilterStrip({
  items,
  active,
  onToggle,
  testID,
}: {
  items: { filter: StageFilter; label: string; short: string; value: number }[];
  active: StageFilter | null;
  onToggle: (filter: StageFilter) => void;
  testID: string;
}) {
  return (
    <View style={styles.stats} testID={testID}>
      {items.map((s, i) => {
        const on = active === s.filter;
        return (
          <Pressable
            key={s.filter}
            onPress={() => onToggle(s.filter)}
            style={[styles.stat, i > 0 && styles.statDivider, on && styles.statOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${s.label}: ${s.value}`}
          >
            <Text style={[styles.statValue, on && styles.statValueOn]}>{s.value}</Text>
            <Text style={[styles.statLabel, on && styles.statLabelOn]} numberOfLines={1}>
              {s.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BidStatus({
  life,
  bids,
  snapshot,
  revoked,
  onTrip = false,
  indent,
}: {
  life: Lifecycle;
  bids: number;
  snapshot: IndentBidSnapshot | undefined;
  revoked: boolean;
  onTrip?: boolean;
  indent?: IndentRow;
}) {
  const lowest = snapshot?.lowestAmount ?? null;
  const highest = snapshot?.highestAmount ?? null;
  const latest = snapshot?.latestAt ? formatStoryDateTime(snapshot.latestAt) : "";
  const awarded = indent ? awardedPriceOf(indent) ?? homeBidAmountOf(indent) : null;
  const target = indent ? indentHubTargetRateInr(indent) : null;
  const client = parsePositiveInr(indent?.client_price);
  const liveRange =
    lowest != null && highest != null && lowest !== highest
      ? `${formatINR(lowest)}–${formatINR(highest)}`
      : lowest != null || highest != null
        ? formatINR((lowest ?? highest) as number)
        : null;
  const isAwarded = onTrip || life === "awarded";
  let amountLine: string | null = null;
  let amountHint: string | null = null;
  if (liveRange) {
    amountLine = liveRange;
    amountHint = lowest != null && highest != null && lowest !== highest ? null : "Lowest";
  } else if (isAwarded && awarded != null) {
    amountLine = formatINR(awarded);
    amountHint = "Awarded";
  } else if (target != null) {
    amountLine = formatINR(target);
    amountHint = "Target";
  } else if (awarded != null) {
    amountLine = formatINR(awarded);
    amountHint = "Awarded";
  }
  const amountText =
    amountLine && amountHint ? `${amountHint} ${amountLine}` : amountLine;
  const statusLabel = onTrip
    ? "On trip"
    : `${revoked ? "Award revoked · " : ""}${lifecycleLabel(life, bids)}`;
  return (
    <View
      style={styles.bidStatus}
      accessibilityLabel={[statusLabel, amountText].filter(Boolean).join(", ")}
    >
      <View
        style={[
          styles.status,
          onTrip
            ? styles.statusOnTrip
            : life === "awarded"
              ? styles.statusAwarded
              : life === "bids"
                ? styles.statusBids
                : styles.statusWaiting,
        ]}
      >
        <Text
          style={[
            styles.statusText,
            onTrip
              ? styles.statusTextOnTrip
              : life === "awarded"
                ? styles.statusTextAwarded
                : life === "bids"
                  ? styles.statusTextBids
                  : styles.statusTextWaiting,
          ]}
          numberOfLines={1}
        >
          {statusLabel}
        </Text>
      </View>
      {amountText ? (
        <Text style={styles.bidAmount} numberOfLines={1}>
          {amountText}
        </Text>
      ) : null}
      {client != null && client !== awarded && client !== target ? (
        <Text style={styles.bidMeta} numberOfLines={1}>
          Client {formatINR(client)}
        </Text>
      ) : null}
      {latest ? (
        <Text style={styles.bidMeta} numberOfLines={1}>
          Last bid · {latest}
        </Text>
      ) : null}
    </View>
  );
}

function BidRangeCell({
  lowest,
  highest,
}: {
  lowest: number | null;
  highest: number | null;
}) {
  if (lowest == null && highest == null) {
    return (
      <View style={styles.colMoney}>
        <Text style={[styles.cellMuted, styles.moneyAlign]}>—</Text>
      </View>
    );
  }
  if (lowest != null && highest != null && lowest !== highest) {
    return (
      <View style={styles.colMoney}>
        <Text style={[styles.cellText, styles.moneyAlign]} numberOfLines={1}>
          {formatINR(lowest)}
        </Text>
        <Text style={[styles.cellMuted, styles.moneyAlign]} numberOfLines={1}>
          to {formatINR(highest)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.colMoney}>
      <Text style={[styles.cellText, styles.moneyAlign]} numberOfLines={1}>
        {formatINR((lowest ?? highest) as number)}
      </Text>
    </View>
  );
}

function AwardedAvgCell({
  amounts,
  testID,
}: {
  amounts: readonly number[];
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const avg = averageAmount(amounts);
  const groups = awardedPriceGroups(amounts);
  const shown = groups.slice(0, 5);
  const hidden = groups.length - shown.length;
  const a11y =
    avg == null
      ? "No awarded price"
      : amounts.length === 1
        ? `Awarded average ${formatINR(avg)}`
        : `Awarded average ${formatINR(avg)} from ${amounts.length} awards`;

  return (
    <View
      style={[styles.hoverMoney, open && styles.hoverMoneyOpen]}
      accessibilityLabel={a11y}
      {...(Platform.OS === "web"
        ? {
            onMouseEnter: () => setOpen(true),
            onMouseLeave: () => setOpen(false),
          }
        : null)}
    >
      <Text style={[styles.cellText, styles.moneyAlign]} numberOfLines={1} testID={testID}>
        {avg != null ? formatINR(avg) : "—"}
      </Text>
      {amounts.length > 1 ? (
        <Text style={[styles.cellMuted, styles.moneyAlign]} numberOfLines={1}>
          {amounts.length} awards
        </Text>
      ) : null}
      {open && avg != null ? (
        <View style={styles.hoverCard} pointerEvents="none">
          <Text style={styles.hoverCardKicker}>Awarded prices</Text>
          <Text style={styles.hoverCardAvg}>{formatINR(avg)}</Text>
          <Text style={styles.hoverCardMeta}>
            {amounts.length === 1 ? "1 award" : `${amounts.length} awards`}
            {groups.length > 1
              ? ` · ${formatINR(groups[0].amount)}–${formatINR(groups[groups.length - 1].amount)}`
              : ""}
          </Text>
          {shown.map((group) => (
            <View key={group.amount} style={styles.hoverCardRow}>
              <Text style={styles.hoverCardPrice}>{formatINR(group.amount)}</Text>
              <Text style={styles.hoverCardCount}>×{group.count}</Text>
            </View>
          ))}
          {hidden > 0 ? (
            <Text style={styles.hoverCardMore}>+{hidden} more rates</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type PoolSortKey =
  | "pool"
  | "stages"
  | "indents"
  | "waiting"
  | "bids"
  | "awarded"
  | "onTrip"
  | "bidRange"
  | "awardedAvg"
  | "nextPickup";

type PoolSortDir = "asc" | "desc";

function poolSortValue(
  row: ShipperPoolSummaryRow<IndentRow>,
  key: PoolSortKey,
  snapshots: Record<string, IndentBidSnapshot>,
  bidCountById: Record<string, number>,
): string | number | null {
  if (key === "pool") return laneTitle(row.lane).toLowerCase();
  if (key === "stages") return row.awarded * 10000 + row.bids * 100 + row.onTrip + row.waiting * 0.01;
  if (key === "indents") return row.lane.load_count;
  if (key === "waiting") return row.waiting;
  if (key === "bids") return row.bids;
  if (key === "awarded") return row.awarded;
  if (key === "onTrip") return row.onTrip;
  if (key === "bidRange") return bidRangeOf(row.members, snapshots, bidCountById).lowest;
  if (key === "awardedAvg") return averageAmount(awardedPricesOf(row.members, bidCountById));
  return nextPickupOf(row.members);
}

type IndentSortKey = "indent" | "pickup" | "stage" | "bids";

function indentSortValue(
  indent: IndentRow,
  key: IndentSortKey,
  bidCountById: Record<string, number>,
  snapshots: Record<string, IndentBidSnapshot>,
): string | number | null {
  const bids = bidCountById[indent.id] ?? snapshots[indent.id]?.count ?? 0;
  if (key === "indent") return getIndentDisplayNumber(indent).toLowerCase();
  if (key === "pickup") return (indent.pickup_date ?? "").trim() || null;
  if (key === "stage") {
    const life = lifecycleOf(indent, bids);
    return life === "awarded" ? 2 : life === "bids" ? 1 : 0;
  }
  return bids;
}

function comparePoolSort(a: string | number | null, b: string | number | null, dir: PoolSortDir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp =
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b)
      : Number(a) - Number(b);
  return dir === "asc" ? cmp : -cmp;
}

function SortHead({
  label,
  col,
  active,
  dir,
  align = "center",
  onPress,
}: {
  label: string;
  col: object;
  active: boolean;
  dir: PoolSortDir;
  align?: "left" | "center" | "right";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.sortHead,
        col,
        align === "right" && styles.sortHeadRight,
        align === "left" && styles.sortHeadLeft,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}${active ? `, ${dir === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      <Text
        style={[styles.tableHeadText, active && styles.tableHeadTextOn]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {active ? (
        dir === "asc" ? (
          <ChevronUp size={10} color={Theme.textPrimaryDark} strokeWidth={2.6} />
        ) : (
          <ChevronDown size={10} color={Theme.textPrimaryDark} strokeWidth={2.6} />
        )
      ) : null}
    </Pressable>
  );
}

function PoolsSummaryTable({
  rows,
  compact,
  snapshots,
  bidCountById,
  onOpen,
}: {
  rows: ShipperPoolSummaryRow<IndentRow>[];
  compact: boolean;
  snapshots: Record<string, IndentBidSnapshot>;
  bidCountById: Record<string, number>;
  onOpen: (lane: PoolLane) => void;
}) {
  const [sortKey, setSortKey] = useState<PoolSortKey | null>(null);
  const [sortDir, setSortDir] = useState<PoolSortDir>("desc");

  const toggleSort = (key: PoolSortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "pool" || key === "nextPickup" ? "asc" : "desc");
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((left, right) =>
      comparePoolSort(
        poolSortValue(left, sortKey, snapshots, bidCountById),
        poolSortValue(right, sortKey, snapshots, bidCountById),
        sortDir,
      ),
    );
  }, [bidCountById, rows, snapshots, sortDir, sortKey]);

  return (
    <View style={styles.table} testID="indent-pool-summary-table">
      {!compact ? (
        <View style={[styles.tableHead, styles.sumRowLayout]}>
          <SortHead label="Pool" col={styles.colPool} align="left" active={sortKey === "pool"} dir={sortDir} onPress={() => toggleSort("pool")} />
          <SortHead label="Stages" col={styles.colStages} align="left" active={sortKey === "stages"} dir={sortDir} onPress={() => toggleSort("stages")} />
          <SortHead label="Indents" col={styles.colNum} active={sortKey === "indents"} dir={sortDir} onPress={() => toggleSort("indents")} />
          <SortHead label="Waiting" col={styles.colNum} active={sortKey === "waiting"} dir={sortDir} onPress={() => toggleSort("waiting")} />
          <SortHead label="Bids" col={styles.colNum} active={sortKey === "bids"} dir={sortDir} onPress={() => toggleSort("bids")} />
          <SortHead label="Awarded" col={styles.colNum} active={sortKey === "awarded"} dir={sortDir} onPress={() => toggleSort("awarded")} />
          <SortHead label="On trip" col={styles.colNum} active={sortKey === "onTrip"} dir={sortDir} onPress={() => toggleSort("onTrip")} />
          <SortHead label="Bid range" col={styles.colMoney} align="right" active={sortKey === "bidRange"} dir={sortDir} onPress={() => toggleSort("bidRange")} />
          <SortHead label="Awarded avg" col={styles.colMoney} align="right" active={sortKey === "awardedAvg"} dir={sortDir} onPress={() => toggleSort("awardedAvg")} />
          <SortHead label="Next pickup" col={styles.colDate} align="right" active={sortKey === "nextPickup"} dir={sortDir} onPress={() => toggleSort("nextPickup")} />
          <View style={styles.colChevron} />
        </View>
      ) : null}
      {sortedRows.map((row, i) => {
        const { lane } = row;
        const { lowest, highest } = bidRangeOf(row.members, snapshots, bidCountById);
        const awardedPrices = awardedPricesOf(row.members, bidCountById);
        const awardedAvg = averageAmount(awardedPrices);
        const nextPickup = nextPickupOf(row.members);
        const parts = compactLane(lane);
        const stageText = `${row.waiting} waiting, ${row.bids} with bids, ${row.awarded} awarded, ${row.onTrip} on trip`;
        return (
          <Pressable
            key={lane.poolId}
            onPress={() => onOpen(lane)}
            style={({ pressed }) => [
              compact ? styles.sumRowCompact : [styles.sumRow, styles.sumRowLayout],
              i > 0 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Open indent pool ${laneTitle(lane)}, ${lane.vehicle_type}, ${plural(lane.load_count, "indent")}`}
            accessibilityHint={stageText}
            testID={`indent-pool-summary-${lane.poolId}`}
          >
            {compact ? (
              <>
                <View style={styles.sumCompactTop}>
                  <View style={styles.quickBody}>
                    <Text style={styles.quickRoute} numberOfLines={1}>
                      {parts.route}
                    </Text>
                    <Text style={styles.quickMeta} numberOfLines={1}>
                      {[lane.vehicle_type, parts.regions].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{lane.load_count}</Text>
                  </View>
                  <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
                </View>
                <StageBar
                  waiting={row.waiting}
                  bids={row.bids}
                  awarded={row.awarded}
                  onTrip={row.onTrip}
                />
                <Text style={styles.sumCompactStages} numberOfLines={1}>
                  {[
                    `${row.waiting} waiting`,
                    `${row.bids} bids`,
                    `${row.awarded} awarded`,
                    row.onTrip > 0 ? `${row.onTrip} on trip` : null,
                    lowest != null || highest != null
                      ? `Bids ${formatBidRange(lowest, highest)}`
                      : null,
                    awardedAvg != null ? `Awarded avg ${formatINR(awardedAvg)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </>
            ) : (
              <>
                <View style={styles.colPool}>
                  <Text style={styles.quickRoute} numberOfLines={1}>
                    {parts.route}
                  </Text>
                  <Text style={styles.quickMeta} numberOfLines={1}>
                    {[lane.vehicle_type, parts.regions].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View style={styles.colStages}>
                  <StageBar
                    waiting={row.waiting}
                    bids={row.bids}
                    awarded={row.awarded}
                    onTrip={row.onTrip}
                  />
                </View>
                <Text style={[styles.cellNum, styles.colNum]}>{lane.load_count}</Text>
                <Text style={[styles.cellNum, styles.colNum, row.waiting > 0 && styles.cellWaiting]}>
                  {row.waiting}
                </Text>
                <Text style={[styles.cellNum, styles.colNum, row.bids > 0 && styles.cellBids]}>
                  {row.bids}
                </Text>
                <Text style={[styles.cellNum, styles.colNum, row.awarded > 0 && styles.cellAwarded]}>
                  {row.awarded}
                </Text>
                <Text style={[styles.cellNum, styles.colNum]}>{row.onTrip}</Text>
                <BidRangeCell lowest={lowest} highest={highest} />
                <AwardedAvgCell
                  amounts={awardedPrices}
                  testID={`indent-pool-awarded-avg-${lane.poolId}`}
                />
                <Text style={[styles.cellText, styles.colDate]} numberOfLines={1}>
                  {nextPickup ? formatStoryDate(nextPickup) : "—"}
                </Text>
                <View style={styles.colChevron}>
                  <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
                </View>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function PoolClientFilter({
  options,
  value,
  onChange,
  compact,
}: {
  options: { key: string; label: string; count: number }[];
  value: string | null;
  onChange: (next: string | null) => void;
  compact: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === value) ?? null;
  return (
    <View style={[styles.clientFilter, compact && styles.clientFilterStacked]}>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.clientChip, selected && styles.clientChipOn]}
        accessibilityRole="button"
        accessibilityLabel="Client"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.clientIcon}>
          <Building2 size={14} color={Theme.primary} strokeWidth={2.3} />
        </View>
        <View style={styles.clientCopy}>
          <Text style={styles.clientLabel}>Client</Text>
          <Text
            style={[styles.clientValue, !selected && styles.clientPlaceholder]}
            numberOfLines={1}
          >
            {selected ? selected.label : "All clients"}
          </Text>
        </View>
        <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />
      </Pressable>
      {selected ? (
        <Pressable
          onPress={() => onChange(null)}
          style={styles.clientClear}
          accessibilityRole="button"
          accessibilityLabel="Clear client"
          hitSlop={6}
        >
          <X size={12} color={Theme.textSecondary} strokeWidth={2.4} />
        </Pressable>
      ) : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.clientBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.clientSheet,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            <View style={styles.clientSheetHead}>
              <Text style={styles.clientSheetTitle}>Filter by client</Text>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.clientSheetClose}
                accessibilityRole="button"
                accessibilityLabel="Close client list"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <X size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.clientList}>
              <Pressable
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={[styles.clientOption, !value && styles.clientOptionOn]}
                accessibilityRole="button"
                accessibilityLabel="All clients"
              >
                <Text style={styles.clientOptionLabel}>All clients</Text>
                <Text style={styles.clientOptionCount}>
                  {options.reduce((sum, option) => sum + option.count, 0)}
                </Text>
              </Pressable>
              {options.map((option) => {
                const on = option.key === value;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      onChange(option.key);
                      setOpen(false);
                    }}
                    style={[styles.clientOption, on && styles.clientOptionOn]}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label}, ${option.count} available`}
                  >
                    <Text style={[styles.clientOptionLabel, on && styles.clientOptionLabelOn]} numberOfLines={1}>
                      {option.label}
                    </Text>
                    <Text style={styles.clientOptionCount}>{option.count}</Text>
                    {on ? <Check size={14} color={Theme.primary} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function IndentStagePoolView({
  lanes: _lanes,
  poolIndents,
  allocatedIndents,
  poolSearch,
  onPoolSearchChange,
  model,
  canSelect,
  bidCountById,
  bidSnapshotById = NO_SNAPSHOTS,
  listCapped,
  compact,
  onToggle,
  onSelectAllShown,
  onClear,
  onOpenIndent,
}: Props) {
  const [showAllPools, setShowAllPools] = useState(false);
  const [indentSortKey, setIndentSortKey] = useState<IndentSortKey | null>(null);
  const [indentSortDir, setIndentSortDir] = useState<PoolSortDir>("asc");
  const [stageFilter, setStageFilter] = useState<StageFilter | null>(null);
  const [showAllIndents, setShowAllIndents] = useState(false);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const clientOptions = useMemo(
    () => poolClientOptions([...(poolIndents ?? []), ...(allocatedIndents ?? [])]),
    [allocatedIndents, poolIndents],
  );
  const matchesClient = (indent: IndentRow) =>
    !clientFilter || indentClientKey(indent) === clientFilter;
  const scopedIndents = useMemo(
    () => (poolIndents ?? []).filter(matchesClient),
    [clientFilter, poolIndents],
  );
  const scopedAllocated = useMemo(
    () => (allocatedIndents ?? []).filter(matchesClient),
    [allocatedIndents, clientFilter],
  );
  const scopedLanes = useMemo(() => shipperPoolLanes(scopedIndents), [scopedIndents]);
  const selected = new Set(model.selectedIds);
  const clientMembers = useMemo(
    () => model.members.filter((indent) => !clientFilter || indentClientKey(indent) === clientFilter),
    [clientFilter, model.members],
  );
  const stage = poolStageCounts(clientMembers, bidCountById);
  const summary: { filter: StageFilter; label: string; short: string; value: number }[] = [
    { filter: "waiting", label: "Waiting for bid", short: "Waiting", value: stage.waiting },
    { filter: "bids", label: "Bids received", short: "Bids", value: stage.bids },
    { filter: "awarded", label: "Awarded", short: "Awarded", value: stage.awarded },
    { filter: "onTrip", label: "On a trip", short: "On trip", value: model.onTripCount },
  ];
  const { lowest: poolLowest, highest: poolHighest } = bidRangeOf(
    clientMembers,
    bidSnapshotById,
    bidCountById,
  );
  const poolAwardedPrices = awardedPricesOf(clientMembers, bidCountById);
  const poolAwardedAvg = averageAmount(poolAwardedPrices);

  const summaryRows = useMemo(
    () =>
      shipperPoolSummaryRows({
        lanes: scopedLanes,
        poolIndents: scopedIndents,
        allocatedIndents: scopedAllocated,
        stageOf: (indent) => lifecycleOf(indent, bidCountById[indent.id] ?? 0),
      }),
    [scopedLanes, scopedIndents, scopedAllocated, bidCountById],
  );
  const visibleRows = showAllPools ? summaryRows : summaryRows.slice(0, QUICK_POOL_LIMIT);
  const totals = summaryRows.reduce(
    (acc, r) => ({
      indents: acc.indents + r.lane.load_count,
      waiting: acc.waiting + r.waiting,
      bids: acc.bids + r.bids,
      awarded: acc.awarded + r.awarded,
      onTrip: acc.onTrip + r.onTrip,
    }),
    { indents: 0, waiting: 0, bids: 0, awarded: 0, onTrip: 0 },
  );
  const totalsStrip: { label: string; value: number }[] = [
    { label: "Pools", value: summaryRows.length },
    { label: "Indents", value: totals.indents },
    { label: "Waiting", value: totals.waiting },
    { label: "Bids", value: totals.bids },
    { label: "Awarded", value: totals.awarded },
    { label: "On trip", value: totals.onTrip },
  ];

  const openLane = (lane: PoolLane) => {
    setStageFilter(null);
    setShowAllIndents(false);
    onPoolSearchChange({
      pickup: lane.pickup_area,
      drop: lane.drop_location,
      vehicleType: lane.vehicle_type,
    });
  };

  const closeLane = () => {
    setStageFilter(null);
    setShowAllIndents(false);
    onPoolSearchChange(EMPTY_POOL_SEARCH);
  };

  const toggleStageFilter = (next: StageFilter) => {
    setShowAllIndents(false);
    setStageFilter((current) => (current === next ? null : next));
  };

  const toggleIndentSort = (key: IndentSortKey) => {
    if (indentSortKey === key) {
      setIndentSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setIndentSortKey(key);
    setIndentSortDir(key === "indent" || key === "pickup" ? "asc" : "desc");
  };

  const onTripMembers = useMemo(() => {
    if (!model.poolId) return [];
    return poolMembers(scopedAllocated, model.key).filter(
      (indent) => !model.memberIds.has(indent.id),
    );
  }, [scopedAllocated, model.key, model.memberIds, model.poolId]);

  const filteredMembers = useMemo(() => {
    if (stageFilter === "onTrip") return onTripMembers;
    if (!stageFilter) return clientMembers;
    return clientMembers.filter(
      (indent) => lifecycleOf(indent, bidCountById[indent.id] ?? 0) === stageFilter,
    );
  }, [bidCountById, clientMembers, onTripMembers, stageFilter]);

  const sortedShown = useMemo(() => {
    const source = indentSortKey
      ? [...filteredMembers].sort((left, right) =>
          comparePoolSort(
            indentSortValue(left, indentSortKey, bidCountById, bidSnapshotById),
            indentSortValue(right, indentSortKey, bidCountById, bidSnapshotById),
            indentSortDir,
          ),
        )
      : filteredMembers;
    const limit = showAllIndents ? source.length : INDENT_PAGE_SIZE;
    return source.slice(0, limit);
  }, [
    bidCountById,
    bidSnapshotById,
    filteredMembers,
    indentSortDir,
    indentSortKey,
    showAllIndents,
  ]);
  const filteredHasMore = !showAllIndents && filteredMembers.length > INDENT_PAGE_SIZE;
  const selectableShown = sortedShown.filter((indent) => model.memberIds.has(indent.id));
  const shownUnselectedFiltered = selectableShown.filter((indent) => !selected.has(indent.id)).length;

  return (
    <View style={styles.wrap} testID="indent-pool-view">
      <View style={styles.card}>
        <View style={styles.finderHead}>
          <View style={styles.finderIcon}>
            <Search size={15} color={Theme.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.finderCopy}>
            <Text style={styles.finderTitle}>Find a pool</Text>
            <Text style={styles.finderSub}>
              Match pickup, drop and vehicle to open a lane
            </Text>
          </View>
          <PoolClientFilter
            options={clientOptions}
            value={clientFilter}
            onChange={setClientFilter}
            compact={compact}
          />
        </View>
        <MarketplaceLaneFilters
          lanes={scopedLanes}
          value={poolSearch}
          onChange={onPoolSearchChange}
          stacked={compact}
          density={compact ? "compact" : "comfortable"}
        />
        {!model.poolId ? (
          scopedLanes.length === 0 ? (
            <Text style={styles.note}>
              None of your open indents has a pickup, drop and vehicle yet, so
              there is no pool to show.
            </Text>
          ) : (
            <View style={styles.quick}>
              <View style={styles.cardHead}>
                <Text style={styles.sectionLabel}>Your pools</Text>
                <Text style={styles.sectionHint}>
                  {visibleRows.length < summaryRows.length
                    ? `Top ${visibleRows.length} of ${summaryRows.length}`
                    : plural(summaryRows.length, "pool")}
                </Text>
              </View>

              <View style={styles.stats} testID="indent-pools-totals">
                {totalsStrip.map((s, i) => (
                  <View
                    key={s.label}
                    style={[styles.stat, i > 0 && styles.statDivider]}
                    accessible
                    accessibilityLabel={`All pools ${s.label}: ${s.value}`}
                  >
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
              <StageLegend />

              <PoolsSummaryTable
                rows={visibleRows}
                compact={compact}
                snapshots={bidSnapshotById}
                bidCountById={bidCountById}
                onOpen={openLane}
              />
              {summaryRows.length > QUICK_POOL_LIMIT ? (
                <Pressable
                  onPress={() => setShowAllPools((v) => !v)}
                  style={styles.more}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showAllPools ? "Show top pools only" : `Show all ${summaryRows.length} pools`
                  }
                >
                  <Text style={styles.moreText}>
                    {showAllPools ? "Show fewer" : `Show all ${summaryRows.length} pools`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}
      </View>

      {model.poolId ? (
        <View style={styles.card}>
          <Pressable
            onPress={closeLane}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={Layout.touchTargetHitSlop}
            accessibilityRole="button"
            accessibilityLabel="Back to all pools"
          >
            <ChevronLeft size={14} color={Theme.primary} strokeWidth={2.4} />
            <Text style={styles.backBtnText}>All pools</Text>
          </Pressable>
          <View style={styles.cardHead}>
            <View style={styles.eyebrowRow}>
              <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
              <Text style={styles.eyebrow}>INDENT POOL</Text>
            </View>
            <View style={styles.vehicleBadge}>
              <Text style={styles.vehicleBadgeText} numberOfLines={1}>
                {model.key.vehicleType}
              </Text>
            </View>
          </View>

          <View style={styles.routeCard}>
            <RoutePlace raw={model.key.pickup} align="left" />
            <View style={styles.routeArrow}>
              <ArrowRight size={14} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <RoutePlace raw={model.key.drop} align="right" />
          </View>
          <Text style={styles.countLine} testID="indent-pool-count">
            {plural(model.poolTotal, "indent")} in pool
            {model.hiddenByFilters > 0
              ? ` · ${model.members.length} match current filters`
              : ""}
            {stageFilter
              ? ` · ${plural(filteredMembers.length, "indent")} ${
                  stageFilter === "onTrip"
                    ? "on trip"
                    : stageFilter === "bids"
                      ? "with bids"
                      : stageFilter
                }`
              : ""}
          </Text>

          <StageFilterStrip
            items={summary}
            active={stageFilter}
            onToggle={toggleStageFilter}
            testID="indent-pool-summary"
          />
          <StageBar
            waiting={stage.waiting}
            bids={stage.bids}
            awarded={stage.awarded}
            onTrip={model.onTripCount}
            onSelect={toggleStageFilter}
          />
          {poolLowest != null || poolHighest != null || poolAwardedAvg != null ? (
            <Text style={styles.countLine} testID="indent-pool-lowest">
              {[
                poolLowest != null || poolHighest != null
                  ? `Bids in pool · ${formatBidRange(poolLowest, poolHighest)}`
                  : null,
                poolAwardedAvg != null
                  ? `Awarded avg · ${formatINR(poolAwardedAvg)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}

          <View style={styles.toolbar}>
            <View style={styles.toolbarText}>
              <Text style={styles.selectedCount} testID="indent-pool-selected-count">
                {model.selectedIds.length} selected for bulk actions
              </Text>
              <Text style={styles.note}>
                {canSelect
                  ? "Selecting indents does not change the pool."
                  : "View only. Selecting indents needs indent allocation access."}
              </Text>
            </View>
            {canSelect ? (
              <View style={styles.toolbarActions}>
                <Pressable
                  onPress={() => {
                    if (sortedShown.length === model.shown.length && !stageFilter) {
                      onSelectAllShown();
                      return;
                    }
                    for (const indent of selectableShown) {
                      if (!selected.has(indent.id)) onToggle(indent.id);
                    }
                  }}
                  disabled={shownUnselectedFiltered === 0}
                  hitSlop={8}
                  style={[styles.toolBtn, shownUnselectedFiltered === 0 && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select all ${selectableShown.length} shown indents`}
                >
                  <Text style={styles.toolBtnText}>
                    Select all ({selectableShown.length})
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onClear}
                  disabled={model.selectedIds.length === 0}
                  hitSlop={8}
                  style={[
                    styles.toolBtn,
                    model.selectedIds.length === 0 && styles.disabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear selection"
                >
                  <Text style={styles.toolBtnText}>Clear</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {model.selectedHiddenCount > 0 ? (
            <Text style={styles.note}>
              {model.selectedHiddenCount} selected indent
              {model.selectedHiddenCount === 1 ? " is" : "s are"} hidden by the
              current filters.
            </Text>
          ) : null}

          <View style={styles.cardHead}>
            <Text style={styles.sectionLabel}>Indents</Text>
            <Text style={styles.sectionHint}>
              {sortedShown.length < filteredMembers.length
                ? `Top ${sortedShown.length} of ${filteredMembers.length}`
                : plural(filteredMembers.length, "indent")}
            </Text>
          </View>
          <View style={styles.table}>
            {compact ? (
              <View style={styles.tableHead}>
                <SortHead
                  label="Indent"
                  col={styles.colIndent}
                  align="left"
                  active={indentSortKey === "indent"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("indent")}
                />
                <SortHead
                  label="Bid status"
                  col={styles.colBid}
                  align="right"
                  active={indentSortKey === "bids"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("bids")}
                />
              </View>
            ) : (
              <View style={[styles.tableHead, styles.detailHead]}>
                {canSelect ? <View style={styles.colCheck} /> : null}
                <SortHead
                  label="Indent"
                  col={styles.colIndent}
                  align="left"
                  active={indentSortKey === "indent"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("indent")}
                />
                <SortHead
                  label="Pickup"
                  col={styles.colPickup}
                  align="left"
                  active={indentSortKey === "pickup"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("pickup")}
                />
                <SortHead
                  label="Stage"
                  col={styles.colStage}
                  align="left"
                  active={indentSortKey === "stage"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("stage")}
                />
                <SortHead
                  label="Bid status"
                  col={styles.colBid}
                  align="left"
                  active={indentSortKey === "bids"}
                  dir={indentSortDir}
                  onPress={() => toggleIndentSort("bids")}
                />
                <View style={styles.colAction} />
              </View>
            )}

            {filteredMembers.length === 0 ? (
              <Text style={[styles.note, styles.empty]}>
                {stageFilter
                  ? "No indents in this pool match the selected stage."
                  : "No indents in this pool match the current filters."}
              </Text>
            ) : null}

            {sortedShown.map((indent) => {
              const ref = getIndentDisplayNumber(indent);
              const bids = bidCountById[indent.id] ?? 0;
              const onTrip = stageFilter === "onTrip" || !model.memberIds.has(indent.id);
              const on = selected.has(indent.id);
              const life = onTrip ? "awarded" : lifecycleOf(indent, bids);
              const revoked = indentHasAwardRevokedTag(
                indent.status,
                (indent.award_revoked_at as string | null | undefined) ?? null,
              );
              const pickupLabel = indent.pickup_date ? formatStoryDate(indent.pickup_date) : null;
              const meta = [
                indent.client_name?.trim() || null,
                indentHubLoadSpecLine(indent),
                compact ? pickupLabel : null,
                ...indentHubSourceTags(indent.circulation_target).map(titleCaseWord),
              ].filter(Boolean);
              const bidStatus = (
                <BidStatus
                  life={life}
                  bids={bids}
                  snapshot={bidSnapshotById[indent.id]}
                  revoked={revoked}
                  onTrip={onTrip}
                  indent={indent}
                />
              );
              return (
                <View
                  key={indent.id}
                  style={[styles.row, on && styles.rowOn]}
                  testID={`indent-pool-row-${indent.id}`}
                >
                  {canSelect ? (
                    <Pressable
                      onPress={() => onToggle(indent.id)}
                      {...(onTrip ? { disabled: true } : null)}
                      hitSlop={Layout.touchTargetHitSlop}
                      style={[styles.check, on && styles.checkOn, onTrip && styles.disabled]}
                      accessibilityRole="checkbox"
                      accessibilityState={onTrip ? { checked: on, disabled: true } : { checked: on }}
                      accessibilityLabel={`Select indent ${ref}`}
                    >
                      {on ? (
                        <Check size={11} color={Theme.textOnPrimary} strokeWidth={3} />
                      ) : null}
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => onOpenIndent(indent)}
                    style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Review indent ${ref}`}
                  >
                    <View style={compact ? styles.rowBody : [styles.rowBody, styles.colIndent]}>
                      <Text style={styles.ref} numberOfLines={1}>
                        {ref}
                      </Text>
                      <Text style={styles.route} numberOfLines={1}>
                        {compactLane(indent).route}
                      </Text>
                      {meta.length > 0 ? (
                        <Text style={styles.meta} numberOfLines={1}>
                          {meta.join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    {compact ? (
                      <View style={styles.rowSide}>
                        {bidStatus}
                        <View style={styles.review}>
                          <Text style={styles.reviewText}>Review</Text>
                          <ChevronRight size={12} color={Theme.primary} strokeWidth={2.4} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.cellText, styles.colPickup]} numberOfLines={1}>
                          {pickupLabel ?? "—"}
                        </Text>
                        <View style={styles.colStage}>
                          <StageStepper life={life} />
                        </View>
                        <View style={styles.colBid}>{bidStatus}</View>
                        <View style={[styles.review, styles.colAction]}>
                          <Text style={styles.reviewText}>Review</Text>
                          <ChevronRight size={12} color={Theme.primary} strokeWidth={2.4} />
                        </View>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {filteredMembers.length > 0 ? (
            <Text style={styles.footer} testID="indent-pool-shown">
              {sortedShown.length < filteredMembers.length
                ? `Top ${sortedShown.length} of ${filteredMembers.length}`
                : `Showing ${sortedShown.length} of ${filteredMembers.length}`}
              {stageFilter ? ` ${stageFilter === "onTrip" ? "on trip" : stageFilter}` : ""}
              {filteredMembers.length < model.poolTotal && !stageFilter
                ? ` matching (${model.poolTotal} in pool)`
                : ""}
              {filteredHasMore ? " · Select all only adds the rows shown" : ""}
            </Text>
          ) : null}
          {filteredMembers.length > INDENT_PAGE_SIZE ? (
            <Pressable
              onPress={() => setShowAllIndents((current) => !current)}
              style={styles.more}
              accessibilityRole="button"
              accessibilityLabel={
                showAllIndents
                  ? "Show first 10 indents only"
                  : `Show all ${filteredMembers.length} indents`
              }
            >
              <Text style={styles.moreText}>
                {showAllIndents ? "Show fewer" : `Show all ${filteredMembers.length} indents`}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>
            Award, vehicle and driver stay per indent in Review.
          </Text>
          {listCapped ? (
            <Text style={styles.note}>
              Only your most recent indents are loaded, so this pool may have
              more indents than shown.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RoutePlace({ raw, align }: { raw: string; align: "left" | "right" }) {
  const { city, region } = splitPlace(raw);
  const right = align === "right";
  return (
    <View style={[styles.place, right && styles.placeRight]}>
      <Text style={[styles.placeLabel, right && styles.textRight]}>
        {right ? "DROP" : "PICKUP"}
      </Text>
      <Text style={[styles.placeCity, right && styles.textRight]} numberOfLines={1}>
        {city}
      </Text>
      {region ? (
        <Text style={[styles.placeRegion, right && styles.textRight]} numberOfLines={1}>
          {region}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    marginBottom: 10,
  },
  toggleOption: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: "center",
  },
  toggleOptionOn: { backgroundColor: Theme.primaryLight },
  toggleText: { fontSize: 12, fontWeight: "600", color: Theme.textRouteCard },
  toggleTextOn: { color: Theme.primary, fontWeight: "700" },

  wrap: { gap: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 12,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  finderHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  finderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  finderCopy: { flex: 1, minWidth: 160, gap: 2 },
  clientFilter: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 220,
    maxWidth: 280,
    marginLeft: "auto",
  },
  clientFilterStacked: {
    minWidth: "100%",
    maxWidth: "100%",
    marginLeft: 0,
  },
  clientChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  clientChipOn: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.primary,
  },
  clientIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  clientCopy: { flex: 1, minWidth: 0, gap: 2 },
  clientLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  clientValue: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  clientPlaceholder: { fontWeight: "500", color: Theme.textMuted },
  clientClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clientBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  clientSheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    overflow: "hidden",
  },
  clientSheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  clientSheetTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark },
  clientSheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  clientList: { maxHeight: 360 },
  clientOption: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clientOptionOn: { backgroundColor: Theme.brandBlueSoft },
  clientOptionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  clientOptionLabelOn: { color: Theme.primary },
  clientOptionCount: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  finderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  finderSub: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  sectionHint: { fontSize: 10.5, fontWeight: "500", color: Theme.textMuted },
  note: { fontSize: 10.5, lineHeight: 14, color: Theme.textMuted },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },

  quick: { gap: 6 },
  quickList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  quickBody: { flex: 1, minWidth: 0, gap: 1 },
  quickRoute: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  quickMeta: { fontSize: 10.5, color: Theme.textRouteCard },
  countBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { fontSize: 10.5, fontWeight: "700", color: Theme.primary },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    minHeight: Layout.minTouchTargetSize,
    marginTop: -4,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  backBtnText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.primary,
  },
  vehicleBadge: {
    maxWidth: "50%",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.whiteMuted,
  },
  vehicleBadgeText: { fontSize: 10.5, fontWeight: "700", color: Theme.textPrimaryDark },

  routeGrid: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  routeArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  place: { flex: 1, minWidth: 0, gap: 1 },
  placeRight: { alignItems: "flex-end" },
  textRight: { textAlign: "right" },
  placeLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: Theme.textMuted,
  },
  placeCity: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  placeRegion: { fontSize: 11, color: Theme.textRouteCard },
  countLine: { fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },

  stats: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 1,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  statOn: { backgroundColor: Theme.primaryLight },
  statDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderInput,
  },
  statValue: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  statValueOn: { color: Theme.primary },
  statLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  statLabelOn: { color: Theme.primary },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolbarText: { flex: 1, minWidth: 0, gap: 1 },
  selectedCount: { fontSize: 11.5, fontWeight: "700", color: Theme.textPrimaryDark },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    justifyContent: "center",
  },
  toolBtnText: { fontSize: 11, fontWeight: "700", color: Theme.primary },

  table: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "visible",
  },
  tableHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.whiteMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  tableHeadText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tableHeadTextOn: {
    color: Theme.textPrimaryDark,
  },
  sortHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 20,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  sortHeadLeft: { justifyContent: "flex-start" },
  sortHeadRight: { justifyContent: "flex-end" },
  empty: { paddingHorizontal: 10, paddingVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  rowOn: { backgroundColor: Theme.brandBlueWashSubtle },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingRight: 10,
    minHeight: Layout.minTouchTargetSize,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowSide: { flexShrink: 0, alignItems: "flex-end", gap: 6, maxWidth: "45%" },
  ref: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
  },
  status: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusWaiting: { backgroundColor: Theme.warningMuted },
  statusBids: { backgroundColor: Theme.brandBlueSoft },
  statusAwarded: { backgroundColor: Theme.positiveMuted },
  statusOnTrip: { backgroundColor: Theme.whiteMuted },
  statusText: { fontSize: 10, fontWeight: "700" },
  statusTextWaiting: { color: Theme.warning },
  statusTextBids: { color: Theme.primary },
  statusTextAwarded: { color: Theme.positive },
  statusTextOnTrip: { color: Theme.textRouteCard },
  route: { fontSize: 11.5, fontWeight: "500", color: Theme.textRouteCard },
  meta: { fontSize: 10.5, color: Theme.textMuted },
  review: { flexDirection: "row", alignItems: "center", gap: 1 },
  reviewText: { fontSize: 11, fontWeight: "700", color: Theme.primary },

  footer: { fontSize: 10.5, color: Theme.textMuted },
  more: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  moreText: { fontSize: 11.5, fontWeight: "700", color: Theme.primary },
  sumRowLayout: { flexDirection: "row", alignItems: "center", gap: 8 },
  sumRow: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: "visible",
    zIndex: 1,
  },
  hoverMoney: {
    flex: 1.1,
    minWidth: 88,
    position: "relative",
    zIndex: 2,
    alignItems: "flex-end",
  },
  hoverMoneyOpen: {
    zIndex: 30,
  },
  hoverCard: {
    position: "absolute",
    right: 0,
    bottom: "100%",
    marginBottom: 8,
    zIndex: 40,
    width: 196,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    backgroundColor: Theme.textPrimaryDark,
    gap: 4,
    ...Platform.select({
      web: { boxShadow: "0 10px 28px rgba(15, 23, 42, 0.22)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },
  hoverCardKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.accentGold,
  },
  hoverCardAvg: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: Theme.cardWhite,
    fontVariant: ["tabular-nums"],
  },
  hoverCardMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.62)",
    marginBottom: 4,
  },
  hoverCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hoverCardPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.cardWhite,
    fontVariant: ["tabular-nums"],
  },
  hoverCardCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.accentGold,
    fontVariant: ["tabular-nums"],
  },
  hoverCardMore: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
  },
  cellMuted: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  moneyAlign: {
    textAlign: "right",
    width: "100%",
  },
  sumRowCompact: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  sumCompactTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  sumCompactStages: { fontSize: 10.5, fontWeight: "600", color: Theme.textRouteCard },
  colPool: { flex: 2.4, minWidth: 0, gap: 1 },
  colStages: { flex: 1.4, minWidth: 0 },
  colNum: { flex: 0.7, minWidth: 0, textAlign: "center" },
  colMoney: { flex: 1.15, minWidth: 88, alignItems: "flex-end" },
  colDate: { flex: 1, minWidth: 0, textAlign: "right" },
  colChevron: { width: 14, alignItems: "flex-end" },
  cellNum: { fontSize: 12.5, fontWeight: "700", color: Theme.textPrimaryDark },
  cellText: { fontSize: 11.5, fontWeight: "600", color: Theme.textPrimaryDark },
  cellWaiting: { color: Theme.warning },
  cellBids: { color: Theme.primary },
  cellAwarded: { color: Theme.positive },

  bar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Theme.borderInput,
    gap: 1,
  },
  barPart: { height: "100%" },
  barWaiting: { backgroundColor: Theme.warning },
  barBids: { backgroundColor: Theme.primary },
  barAwarded: { backgroundColor: Theme.positive },
  barTrip: { backgroundColor: Theme.textMuted },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: "600", color: Theme.textRouteCard },

  stepper: { flexDirection: "row", alignItems: "flex-start" },
  step: { flexDirection: "row", alignItems: "flex-start" },
  stepLine: {
    width: 16,
    height: 2,
    marginTop: 4,
    backgroundColor: Theme.borderInput,
  },
  stepLineDone: { backgroundColor: Theme.positive },
  stepNode: { alignItems: "center", gap: 3, minWidth: 40 },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  stepDotDone: { backgroundColor: Theme.positive, borderColor: Theme.positive },
  stepDotCurrent: { borderColor: Theme.positiveMuted, borderWidth: 2 },
  stepLabel: { fontSize: 9.5, fontWeight: "600", color: Theme.textMuted },
  stepLabelCurrent: { color: Theme.textPrimaryDark, fontWeight: "800" },

  bidStatus: { alignItems: "flex-start", gap: 2, minWidth: 0 },
  bidAmount: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  bidMeta: { fontSize: 10, color: Theme.textMuted },

  detailHead: { justifyContent: "flex-start", alignItems: "center", gap: 8 },
  colCheck: { width: 18, marginRight: 2 },
  colIndent: { flex: 2.2, minWidth: 0 },
  colPickup: { flex: 1, minWidth: 0 },
  colStage: { flex: 1.6, minWidth: 0 },
  colBid: { flex: 2, minWidth: 0 },
  colAction: { width: 64, justifyContent: "flex-end" },
});
