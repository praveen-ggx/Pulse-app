/**
 * Trip activity — Metronic journey timeline (who did what, when, with people).
 */
import { DriverAvatar, UserAvatar } from "@/components/Avatar";
import { PartyAvatar } from "@/components/PartyAvatar";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { TripActivityTimelineIcon } from "@/features/trips/components/trip-detail/TripActivityTimelineIcon";
import {
  formatTripActivityRelativeTime,
  tripActivityMonthYearLabel,
  tripActivityYearFromIso,
} from "@/lib/trips/formatTripActivityTime.util";
import { TRIP_ACTIVITY_LOTTIE } from "@/lib/trips/tripActivityLottieAssets";
import type { TripAuditFilterTab } from "@/lib/trips/tripAuditLog.types";
import type {
  TripAuditLogEntry,
  TripAuditLogPerson,
} from "@/lib/trips/tripAuditLog.types";
import Feather from "@expo/vector-icons/Feather";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const METRONIC = {
  ink: "#181C32",
  muted: "#A1A5B7",
  sub: "#78829D",
  border: "#EFF2F5",
  quoteBg: "#F5F8FA",
  link: "#3E97FF",
  yearActive: "#3E97FF",
  unreadDot: "#50CD89",
} as const;

const TABS: { id: TripAuditFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
  { id: "payment", label: "Payment" },
  { id: "updates", label: "Updates" },
  { id: "assignment", label: "Assignment" },
];

const CATEGORY_TONE: Record<
  TripAuditLogEntry["category"],
  { bg: string; text: string; border: string }
> = {
  payment: {
    bg: "rgba(16,185,129,0.1)",
    text: "#047857",
    border: "rgba(16,185,129,0.22)",
  },
  assignment: {
    bg: "rgba(59,130,246,0.1)",
    text: "#1d4ed8",
    border: "rgba(59,130,246,0.22)",
  },
  status: {
    bg: "rgba(148,163,184,0.12)",
    text: "#475569",
    border: "rgba(148,163,184,0.22)",
  },
  trip: {
    bg: "rgba(99,102,241,0.1)",
    text: "#4f46e5",
    border: "rgba(99,102,241,0.22)",
  },
  document: {
    bg: "rgba(14,165,233,0.1)",
    text: "#0369a1",
    border: "rgba(14,165,233,0.22)",
  },
};

export type TripAuditLogContentProps = {
  title?: string;
  subtitle?: string;
  entries: TripAuditLogEntry[];
  matchesTab: (entry: TripAuditLogEntry, tabId: TripAuditFilterTab) => boolean;
  loading?: boolean;
  onClose: () => void;
  shellStyle?: ViewStyle;
  tabs?: TripAuditFilterTab[];
  emptyBody?: string;
};

type TimelineRow =
  | { kind: "month"; key: string; label: string }
  | { kind: "entry"; key: string; entry: TripAuditLogEntry; isLast: boolean };

function buildTimelineRows(entries: TripAuditLogEntry[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastMonth = "";

  entries.forEach((entry, index) => {
    const monthLabel = tripActivityMonthYearLabel(entry.at);
    if (monthLabel && monthLabel !== lastMonth) {
      lastMonth = monthLabel;
      rows.push({ kind: "month", key: `month-${monthLabel}`, label: monthLabel });
    }
    rows.push({
      kind: "entry",
      key: entry.id,
      entry,
      isLast: index === entries.length - 1,
    });
  });

  return rows;
}

function actionPhrase(entry: TripAuditLogEntry): string {
  const title = entry.title.trim();
  if (!title) return "updated this trip";
  return title;
}

function JourneyHero({
  subtitle,
  eventCount,
}: {
  subtitle?: string;
  eventCount: number;
}) {
  if (!subtitle) return null;
  const [tripRef, ...routeParts] = subtitle.split(" · ");
  const route = routeParts.join(" · ").trim();

  return (
    <View style={styles.journeyHero}>
      <View style={styles.journeyHeroIcon}>
        <TinyEmptyLottie
          source={TRIP_ACTIVITY_LOTTIE.trip}
          size={28}
          speed={0.8}
          renderScale={1.4}
        />
      </View>
      <View style={styles.journeyHeroBody}>
        <Text style={styles.journeyHeroRef} numberOfLines={1}>
          {tripRef}
        </Text>
        {route ? (
          <Text style={styles.journeyHeroRoute} numberOfLines={2}>
            {route}
          </Text>
        ) : null}
        <Text style={styles.journeyHeroMeta}>
          {eventCount} {eventCount === 1 ? "event" : "events"} on this journey
        </Text>
      </View>
    </View>
  );
}

function ActivityUserAvatar({
  avatar,
  size,
}: {
  avatar: TripAuditLogEntry["actorAvatar"];
  size: number;
}) {
  if (avatar.entityType === "driver") {
    return (
      <DriverAvatar
        name={avatar.name}
        avatarUrl={avatar.avatarUrl}
        avatarSeed={avatar.avatarSeed}
        size={size}
        showBorder={false}
      />
    );
  }
  if (avatar.entityType === "vehicle") {
    return (
      <PartyAvatar
        name={avatar.name}
        entityType="vehicle"
        avatarUrl={avatar.avatarUrl}
        avatarSeed={avatar.avatarSeed}
        initialsColorSeed={avatar.initialsColorSeed}
        size={size}
        shape="circle"
      />
    );
  }
  return (
    <UserAvatar
      name={avatar.name}
      avatarUrl={avatar.avatarUrl}
      avatarSeed={avatar.avatarSeed}
      context="personal"
      size={size}
      showBorder={false}
    />
  );
}

function PeopleRow({ people }: { people: TripAuditLogPerson[] }) {
  if (people.length === 0) return null;
  const person = people[0];

  return (
    <View style={styles.peopleRow}>
      <ActivityUserAvatar avatar={person.avatar} size={18} />
      <Text style={styles.peopleLabel} numberOfLines={1}>
        {person.role ? (
          <Text style={styles.peopleRole}>{person.role}: </Text>
        ) : null}
        {person.name}
      </Text>
    </View>
  );
}

function ActivityDetailCard({ entry }: { entry: TripAuditLogEntry }) {
  const tone = CATEGORY_TONE[entry.category];
  const isPayment = entry.category === "payment";
  const showCard =
    isPayment ||
    entry.category === "assignment" ||
    Boolean(entry.detailLines?.length) ||
    Boolean(entry.people?.length);

  if (!showCard) return null;

  return (
    <View style={styles.detailCard}>
      {isPayment ? (
        <>
          <View style={styles.detailCardHead}>
            <View
              style={[
                styles.categoryChip,
                { backgroundColor: tone.bg, borderColor: tone.border },
              ]}
            >
              <Text style={[styles.categoryChipText, { color: tone.text }]}>
                {entry.categoryLabel}
              </Text>
            </View>
            {entry.amountLabel ? (
              <Text
                style={[
                  styles.amountPill,
                  entry.amountLabel.startsWith("+")
                    ? styles.amountIn
                    : styles.amountOut,
                ]}
              >
                {entry.amountLabel}
              </Text>
            ) : null}
          </View>
          {entry.detail ? (
            <Text style={styles.detailSecondary} numberOfLines={2}>
              {entry.detail}
            </Text>
          ) : null}
          {entry.detailLines?.map((line) => (
            <Text key={line} style={styles.detailSecondary} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </>
      ) : (
        <>
          {entry.detailLines?.map((line) => (
            <Text key={line} style={styles.detailSecondary} numberOfLines={2}>
              {line}
            </Text>
          ))}
          {!entry.detailLines?.length && entry.detail ? (
            <Text style={styles.detailSecondary} numberOfLines={3}>
              {entry.detail}
            </Text>
          ) : null}
        </>
      )}

      {entry.people && entry.people.length > 0 ? (
        <PeopleRow people={entry.people} />
      ) : null}
    </View>
  );
}

function ActivityActorHeadline({ entry }: { entry: TripAuditLogEntry }) {
  const phrase = actionPhrase(entry);

  return (
    <View style={styles.headlineRow}>
      <ActivityUserAvatar avatar={entry.actorAvatar} size={22} />
      <Text style={styles.headline} numberOfLines={4}>
        <Text style={styles.actorName}>{entry.recordedBy}</Text>
        <Text style={styles.actionText}> {phrase}</Text>
        {entry.headlineTarget ? (
          <Text style={styles.targetName}> {entry.headlineTarget}</Text>
        ) : null}
      </Text>
    </View>
  );
}

function TimelineEntryRow({
  entry,
  showLine,
  index,
}: {
  entry: TripAuditLogEntry;
  showLine: boolean;
  index: number;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const relativeTime = formatTripActivityRelativeTime(entry.at);
  const showDetailCard =
    entry.category === "payment" ||
    entry.category === "assignment" ||
    Boolean(entry.detailLines?.length) ||
    Boolean(entry.people?.length);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      delay: Math.min(index * 30, 120),
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  return (
    <Animated.View
      style={[
        styles.entryRow,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.trackCol}>
        <TripActivityTimelineIcon
          category={entry.category}
          title={entry.title}
          amountLabel={entry.amountLabel}
          size={28}
        />
        {showLine ? <View style={styles.trackLine} /> : null}
      </View>

      <View style={styles.entryBody}>
        <ActivityActorHeadline entry={entry} />

        <View style={styles.metaRow}>
          <View style={styles.metaDot} />
          <Text style={styles.metaLine} numberOfLines={2}>
            {relativeTime}
            {entry.contextLabel ? (
              <Text style={styles.metaContext}> · {entry.contextLabel}</Text>
            ) : null}
          </Text>
        </View>

        {showDetailCard ? <ActivityDetailCard entry={entry} /> : null}

        {!showDetailCard && entry.detail ? (
          <Text style={styles.plainDetail} numberOfLines={3}>
            {entry.detail}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function YearRail({
  years,
  activeYear,
  onSelectYear,
}: {
  years: number[];
  activeYear: number | null;
  onSelectYear: (year: number | null) => void;
}) {
  if (years.length <= 1) return null;

  return (
    <View style={styles.yearRail}>
      <Pressable
        onPress={() => onSelectYear(null)}
        style={[styles.yearItem, activeYear == null && styles.yearItemActive]}
      >
        <Text style={[styles.yearText, activeYear == null && styles.yearTextActive]}>
          All
        </Text>
      </Pressable>
      {years.map((year) => {
        const selected = activeYear === year;
        return (
          <Pressable
            key={year}
            onPress={() => onSelectYear(selected ? null : year)}
            style={[styles.yearItem, selected && styles.yearItemActive]}
          >
            <Text style={[styles.yearText, selected && styles.yearTextActive]}>
              {year}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TripAuditLogContent({
  title = "Activity",
  subtitle,
  entries,
  matchesTab,
  loading = false,
  onClose,
  shellStyle,
  tabs,
  emptyBody,
}: TripAuditLogContentProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 768;
  const scrollRef = useRef<ScrollView>(null);
  const visibleTabs = useMemo(
    () => (tabs?.length ? TABS.filter((tab) => tabs.includes(tab.id)) : TABS),
    [tabs],
  );
  const [filterTab, setFilterTab] = useState<TripAuditFilterTab>("all");
  const [activeYear, setActiveYear] = useState<number | null>(null);
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === filterTab)) setFilterTab("all");
  }, [filterTab, visibleTabs]);

  const tabbedEntries = useMemo(
    () => entries.filter((entry) => matchesTab(entry, filterTab)),
    [entries, filterTab, matchesTab],
  );

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const entry of tabbedEntries) {
      const y = tripActivityYearFromIso(entry.at);
      if (y != null) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [tabbedEntries]);

  const filteredEntries = useMemo(() => {
    if (activeYear == null) return tabbedEntries;
    return tabbedEntries.filter(
      (entry) => tripActivityYearFromIso(entry.at) === activeYear,
    );
  }, [tabbedEntries, activeYear]);

  const timelineRows = useMemo(
    () => buildTimelineRows(filteredEntries),
    [filteredEntries],
  );

  const showYearRail = width >= 400 && years.length > 1;
  const showYearChips = !showYearRail && years.length > 1;

  return (
    <View style={[styles.shell, shellStyle]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, compact && styles.closeBtnCompact]}
          accessibilityRole="button"
          accessibilityLabel="Close activity"
          hitSlop={8}
        >
          <X size={compact ? 18 : 14} color={METRONIC.muted} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
          style={styles.tabScroll}
        >
          {visibleTabs.map((tab) => {
            const selected = filterTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setFilterTab(tab.id)}
                style={[styles.tabItem, compact && styles.tabItemCompact]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {selected ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {showYearChips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.yearChipRow}
          >
            <Pressable
              onPress={() => setActiveYear(null)}
              style={[styles.yearChip, activeYear == null && styles.yearChipActive]}
            >
              <Text
                style={[
                  styles.yearChipText,
                  activeYear == null && styles.yearChipTextActive,
                ]}
              >
                All years
              </Text>
            </Pressable>
            {years.map((year) => {
              const selected = activeYear === year;
              return (
                <Pressable
                  key={year}
                  onPress={() => setActiveYear(selected ? null : year)}
                  style={[styles.yearChip, selected && styles.yearChipActive]}
                >
                  <Text
                    style={[
                      styles.yearChipText,
                      selected && styles.yearChipTextActive,
                    ]}
                  >
                    {year}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.bodyRow}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            showYearRail && styles.scrollContentWithRail,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator
        >
          <JourneyHero subtitle={subtitle} eventCount={filteredEntries.length} />

          {loading && entries.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Theme.primary} />
              <Text style={styles.loadingText}>Loading journey…</Text>
            </View>
          ) : null}

          {timelineRows.length > 0 ? (
            <View style={styles.timeline}>
              {timelineRows.map((row, index) => {
                if (row.kind === "month") {
                  return (
                    <View key={row.key} style={styles.monthHeader}>
                      <View style={styles.monthPill}>
                        <Text style={styles.monthHeaderText}>{row.label}</Text>
                      </View>
                    </View>
                  );
                }
                const entryIndex = timelineRows
                  .slice(0, index)
                  .filter((r) => r.kind === "entry").length;
                return (
                  <TimelineEntryRow
                    key={row.key}
                    entry={row.entry}
                    showLine={!row.isLast}
                    index={entryIndex}
                  />
                );
              })}
            </View>
          ) : !loading ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={22} color={METRONIC.sub} />
              </View>
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyBody}>
                {emptyBody ??
                  "Payments, assignments, and trip updates by your team will appear on this journey timeline."}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {showYearRail ? (
          <YearRail
            years={years}
            activeYear={activeYear}
            onSelectYear={setActiveYear}
          />
        ) : null}
      </View>
    </View>
  );
}

const TRACK_WIDTH = 36;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: "#F9F9F9",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  headerCompact: {
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: "center",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: METRONIC.ink,
    letterSpacing: -0.15,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "400",
    color: METRONIC.muted,
    lineHeight: 17,
  },
  closeBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: METRONIC.quoteBg,
    flexShrink: 0,
  },
  closeBtnCompact: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
  },
  toolbar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    paddingHorizontal: 6,
    backgroundColor: Theme.cardWhite,
  },
  tabScroll: {
    flexGrow: 0,
  },
  tabScrollContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 0,
    paddingHorizontal: 2,
  },
  tabItem: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 9,
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemCompact: {
    paddingHorizontal: 14,
    minWidth: 56,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  tabTextActive: {
    fontWeight: "500",
    color: METRONIC.ink,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: METRONIC.ink,
  },
  yearChipRow: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  yearChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  yearChipActive: {
    borderColor: METRONIC.yearActive,
    backgroundColor: "rgba(62, 151, 255, 0.06)",
  },
  yearChipText: {
    fontSize: 10,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  yearChipTextActive: {
    color: METRONIC.yearActive,
    fontWeight: "500",
  },
  bodyRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 24,
  },
  scrollContentCompact: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  scrollContentWithRail: {
    paddingRight: 4,
  },
  journeyHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  journeyHeroIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 8,
    backgroundColor: METRONIC.quoteBg,
  },
  journeyHeroBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  journeyHeroRef: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.ink,
  },
  journeyHeroRoute: {
    fontSize: 11,
    fontWeight: "400",
    color: METRONIC.sub,
    lineHeight: 15,
  },
  journeyHeroMeta: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  timeline: {
    gap: 0,
  },
  monthHeader: {
    marginTop: 4,
    marginBottom: 10,
    paddingLeft: TRACK_WIDTH + 8,
  },
  monthPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
  },
  monthHeaderText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: METRONIC.muted,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 14,
    minHeight: 44,
  },
  trackCol: {
    width: TRACK_WIDTH,
    alignItems: "center",
  },
  trackLine: {
    flex: 1,
    width: 1,
    marginTop: 3,
    marginBottom: -4,
    backgroundColor: "#E4E6EF",
  },
  entryBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 10,
    paddingTop: 1,
    paddingBottom: 2,
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  headline: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 19,
    color: METRONIC.ink,
    fontWeight: "500",
  },
  actorName: {
    fontWeight: "600",
    color: METRONIC.ink,
  },
  actionText: {
    fontWeight: "500",
    color: METRONIC.ink,
  },
  targetName: {
    fontWeight: "600",
    color: METRONIC.ink,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: METRONIC.unreadDot,
    flexShrink: 0,
  },
  metaLine: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  metaContext: {
    color: METRONIC.sub,
    fontWeight: "400",
  },
  plainDetail: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "400",
    color: METRONIC.sub,
    lineHeight: 15,
  },
  detailCard: {
    marginTop: 8,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    gap: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  detailCardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  },
  categoryChip: {
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  amountPill: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  amountIn: {
    color: Theme.positive,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  detailSecondary: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: METRONIC.sub,
  },
  peopleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
  },
  peopleLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "400",
    color: METRONIC.ink,
    lineHeight: 13,
  },
  peopleRole: {
    fontWeight: "500",
    color: METRONIC.muted,
  },
  yearRail: {
    width: 44,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: METRONIC.border,
    alignItems: "center",
    gap: 2,
    backgroundColor: Theme.cardWhite,
  },
  yearItem: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 4,
    minWidth: 36,
    alignItems: "center",
  },
  yearItemActive: {
    backgroundColor: "rgba(62, 151, 255, 0.08)",
  },
  yearText: {
    fontSize: 11,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  yearTextActive: {
    color: METRONIC.yearActive,
    fontWeight: "500",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 11,
    color: METRONIC.muted,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: METRONIC.ink,
  },
  emptyBody: {
    fontSize: 11,
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 15,
  },
});
