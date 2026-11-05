/**
 * Notifications panel — Metronic-style dropdown (bell popover + full-screen route).
 */
export type { RegistryFilterTab } from "@/lib/globalSync/registryFeed.util";
import { useCallback, useEffect, useMemo, useState } from "react";
import Theme from "@/constants/Theme";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import {
  opsAlertTagVariant,
  formatRegistryLabel,
  salaryRequestStatusTone,
  sharedNotificationStatusTone,
  type RegistryTag,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import { REGISTRY_PAGE_SIZE } from "@/lib/globalSync/registryFeed.constants";
import {
  filterRegistryFeed,
  registryFeedLifecycleTab,
  type RegistryFilterTab,
} from "@/lib/globalSync/registryFeed.util";
import { useRegistryFeed } from "@/lib/globalSync/useRegistryFeed";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import {
  buildOpsRegistryCardPresentation,
  opsRegistryActionLabel,
  type RegistryPartyLookup,
} from "@/lib/alertRegistry/registryOpsPresentation.util";
import {
  resolveNetworkRegistryAvatar,
  resolveSalaryRegistryAvatar,
} from "@/lib/alertRegistry/registryNotificationAvatar.util";
import { companyNameForInitials } from "@/lib/alertRegistry/networkNotificationParty.util";
import { useTripMoneyById } from "@/lib/alertRegistry/useTripMoneyById";
import {
  networkNotificationActionText,
  networkNotificationTagLabel,
} from "@/features/network/utils/networkNotificationLabels.util";
import { networkLaneDetail } from "@/lib/globalSync/networkLaneNotifications.util";
import { useMarkNetworkNotificationRead } from "@/lib/queries/useNetworkNotificationsQuery";
import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import {
  canOpenOpsAlert,
  entryAllowedByAccess,
  indentPrimaryAction,
  registryTabVisible,
  type RegistryNotificationAccess,
} from "@/lib/alertRegistry/registryNotificationAccess.util";
import {
  classifyPaymentAlert,
  paymentTagLabel,
} from "@/lib/globalSync/registryPaymentLane.util";
import { useRouter } from "expo-router";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { useCachedQueryRows } from "@/lib/queries/useCachedQueryRows";
import { queryKeys } from "@/lib/queryKeys";
import type { RegistryFeedEntry } from "@/lib/globalSync/registryFeed.util";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { AlertDetailMode } from "@/lib/alertRegistry/alertDetailRoute.util";
import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";
import { AlertDetailScreen } from "@/features/alertRegistry/components/AlertDetailScreen";
import { ChevronDown, ChevronLeft, Settings2, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

const FILTER_TABS: { id: RegistryFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "driver", label: "Driver" },
  { id: "trip", label: "Trip" },
  { id: "indent", label: "Indent" },
  { id: "payment", label: "Payment" },
  { id: "received", label: "Received" },
  { id: "archive", label: "Archive" },
];

const EMPTY_COPY: Record<
  RegistryFilterTab,
  { title: string; body: string }
> = {
  all: {
    title: "You're all caught up",
    body: "New operational and finance signals will appear here.",
  },
  driver: {
    title: "No driver requests",
    body: "Salary requests and trips waiting for driver assignment appear here.",
  },
  trip: {
    title: "No trip alerts",
    body: "Late logs, idle vehicles, and other active trip signals appear here.",
  },
  indent: {
    title: "No indent activity",
    body: "Indent bids, quotes, and awards appear here.",
  },
  payment: {
    title: "No payments initiated",
    body: "Advance and other payments you send appear here.",
  },
  received: {
    title: "No client receipts",
    body: "Payments captured from a client appear here.",
  },
  archive: {
    title: "No archived items",
    body: "Resolved and read notifications are kept in this archive.",
  },
};

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Just now";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatSalaryAmount(amount: number | null | undefined): string {
  return `₹${Number(amount ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSalaryHighlight(req: SalaryRequestWithDriverRow): string {
  return `₹${Number(req.amount ?? 0).toLocaleString("en-IN")}`;
}

function opsContextLabel(item: GlobalOperationAlert): string {
  if (item.category === "late_log") return "Operations";
  if (item.category === "unassigned_trip") return "Operations";
  if (item.category === "vehicle_idle") return "Fleet";
  if (item.category === "payment_received") return "Received";
  if (item.category === "payment_paid") return "Payment";
  return "Operations";
}

function opsTag(
  item: GlobalOperationAlert,
  trips: RegistryPartyLookup["activeTrips"],
): string {
  if (item.category === "late_log") return "late log";
  if (item.category === "unassigned_trip") return "unassigned";
  if (item.category === "vehicle_idle") return "idle";
  if (item.category === "payment_received" || item.category === "payment_paid") {
    return paymentTagLabel(classifyPaymentAlert(item, trips));
  }
  return item.category.replace(/_/g, " ");
}

function splitOpsDetailLines(
  ops: GlobalOperationAlert,
  presentationDetail?: string,
): { title?: string; subtitle?: string; body?: string } {
  const raw = (presentationDetail ?? ops.subtitle ?? "").trim();
  if (!raw) return {};
  const parts = raw.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], subtitle: parts.slice(1).join(" · ") };
  }
  return { body: raw };
}

export type AlertRegistryFinanceHandlers = {
  onOpenDetail: (
    kind: "salary" | "ops",
    id: string,
    mode?: "active" | "archive",
  ) => void;
  onRejectSalary: (requestId: string) => void;
  onPaySalary: (req: SalaryRequestWithDriverRow) => void;
  onViewSalaryArchive: (req: SalaryRequestWithDriverRow) => void;
  onDismissOps: (ops: GlobalOperationAlert) => void;
  onOpenOps: (ops: GlobalOperationAlert) => void;
  busySalaryId: string | null;
};

export type AlertRegistryPanelLayout = "popover" | "fullscreen" | "drawer";

export type AlertRegistryPanelProps = {
  filterTab: RegistryFilterTab;
  onFilterTabChange: (tab: RegistryFilterTab) => void;
  onClose: () => void;
  onSync?: () => void | Promise<void>;
  syncing?: boolean;
  finance: AlertRegistryFinanceHandlers;
  layout?: AlertRegistryPanelLayout;
  topInset?: number;
  bottomInset?: number;
  /** When false, clears any in-panel detail view (drawer closed). */
  isOpen?: boolean;
  /** Close the notifications shell when a detail action navigates away. */
  onDetailNavigateAway?: () => void;
};

type AlertDetailSelection = {
  kind: RegistryFeedKind;
  id: string;
  mode: AlertDetailMode;
};

function opsActionLabel(ops: GlobalOperationAlert): string {
  return opsRegistryActionLabel(ops);
}

function RegistryFeedList({
  filterTab,
  visibleCount,
  finance,
  feed,
  access,
}: {
  filterTab: RegistryFilterTab;
  visibleCount: number;
  finance: AlertRegistryFinanceHandlers;
  feed: RegistryFeedEntry[];
  access: RegistryNotificationAccess;
}) {
  const auth = useOptionalAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const partnerDisplayByOrgId = useGlobalSyncStore((s) => s.partnerDisplayByOrgId);
  const partnerAvatarUriByOrgId = useGlobalSyncStore((s) => s.partnerAvatarUriByOrgId);
  const drivers = useCachedQueryRows<DriverRow>(queryKeys.drivers.finite(orgId ?? ""));
  const clients = useCachedQueryRows<ClientRow>(queryKeys.clients.finite(orgId ?? ""));
  const suppliers = useCachedQueryRows<SupplierRow>(
    queryKeys.suppliers.finite(orgId ?? ""),
  );
  const router = useRouter();
  const markNetworkRead = useMarkNetworkNotificationRead(orgId);
  const driversById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const actorOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of feed) {
      const id = entry.network?.actor_org_id?.trim();
      if (id) ids.add(id);
    }
    return [...ids];
  }, [feed]);
  const linkedOrgs = useLinkedOrgDisplayMap(actorOrgIds);
  const tripMoneyById = useTripMoneyById(orgId);
  const partiesByLinkedOrg = useMemo(() => {
    const map = new Map<
      string,
      { name: string; entityType: "client" | "supplier"; avatarUrl?: string | null; avatarSeed?: string | null }
    >();
    for (const client of clients) {
      const id = client.linked_organization_id?.trim();
      const name = client.name?.trim();
      if (id && name) {
        map.set(id, {
          name,
          entityType: "client",
          avatarUrl: client.avatar_url,
          avatarSeed: client.avatar_seed,
        });
      }
    }
    for (const supplier of suppliers) {
      const id = supplier.linked_organization_id?.trim();
      const name = supplier.company_name?.trim() || supplier.name?.trim();
      if (id && name && !map.has(id)) {
        map.set(id, {
          name,
          entityType: "supplier",
          avatarUrl: supplier.avatar_url,
          avatarSeed: supplier.avatar_seed,
        });
      }
    }
    return map;
  }, [clients, suppliers]);
  const partyCtx = useMemo(
    (): RegistryPartyLookup => ({
      activeTrips,
      driversById,
      clientsById,
      suppliersById,
      org: org?.currentOrganization ?? null,
      partnerDisplay: partnerDisplayByOrgId,
      partnerAvatarUri: partnerAvatarUriByOrgId,
      tripMoneyById,
    }),
    [
      activeTrips,
      driversById,
      clientsById,
      suppliersById,
      org?.currentOrganization,
      partnerDisplayByOrgId,
      partnerAvatarUriByOrgId,
      tripMoneyById,
    ],
  );
  const isActiveView = filterTab !== "archive";

  const visible = feed.slice(0, visibleCount);
  const firstAttributionEntryId = useMemo(() => {
    const first = visible.find(
      (entry) =>
        entry.kind === "salary" &&
        !!entry.salary &&
        entry.salary.request_type === "trip_based" &&
        String(entry.salary.note ?? "").toLowerCase().includes("fleet trip"),
    );
    return first?.id ?? null;
  }, [visible]);

  if (auth?.profile?.role === "driver" || !orgId || bootstrapStatus !== "ready") {
    return null;
  }

  if (feed.length === 0) {
    const empty = EMPTY_COPY[filterTab];
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>{empty.title}</Text>
        <Text style={styles.emptyBody}>{empty.body}</Text>
      </View>
    );
  }

  return (
    <>
      {visible.map((entry) => {
        if (entry.kind === "ops" && entry.ops) {
          const ops = entry.ops;
          const opsTags: RegistryTag[] = [
            { label: opsTag(ops, activeTrips), variant: opsAlertTagVariant(ops.category) },
          ];
          const presentation = buildOpsRegistryCardPresentation(ops, partyCtx);
          const openOps = canOpenOpsAlert(ops.category, access);
          const openOpsPress = () => {
            if (!openOps) return;
            if (!access.tripDetail) {
              router.push(ROUTES.TABS.FINANCE as Parameters<typeof router.push>[0]);
              return;
            }
            finance.onOpenOps(ops);
          };
          const detailLines = splitOpsDetailLines(ops, presentation.detail);
          return (
            <AlertRegistrySignalCard
              key={entry.id}
              mode="active"
              onPress={openOps ? openOpsPress : undefined}
              avatar={presentation.avatar}
              actorName={presentation.actorName}
              actionText={presentation.actionText}
              highlightText={presentation.highlightText}
              trailingText={presentation.trailingText}
              detailTitle={detailLines.title}
              detailMeta={presentation.detailMeta}
              detailSubtitle={detailLines.subtitle}
              detail={detailLines.body}
              timeLabel={formatRelativeTime(ops.created_at)}
              contextLabel={opsContextLabel(ops)}
              tags={opsTags}
              isUnread={isActiveView}
              footer={
                <RegistryCardActions>
                  <RegistryGhostButton
                    label="Decline"
                    onPress={() => finance.onDismissOps(ops)}
                  />
                  {openOps ? (
                    <RegistryPrimaryButton
                      label={
                        ops.category === "unassigned_trip" && !access.tripAssign
                          ? "View trip"
                          : opsActionLabel(ops)
                      }
                      onPress={openOpsPress}
                    />
                  ) : null}
                </RegistryCardActions>
              }
            />
          );
        }

        if (entry.kind === "network" && entry.network) {
          const item = entry.network;
          const lane = entry.networkLane;
          const laneCopy = lane ? networkLaneDetail(lane) : null;
          const hasAmount =
            item.amount_meta != null && Number.isFinite(Number(item.amount_meta));
          const amountText = hasAmount
            ? `₹${Number(item.amount_meta).toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}`
            : null;
          const networkAvatar = resolveNetworkRegistryAvatar(item, {
            partnerDisplay: partyCtx.partnerDisplay,
            partnerAvatarUri: partyCtx.partnerAvatarUri,
            linkedOrgs,
            partiesByLinkedOrg,
          });
          const networkInitialsAvatar = {
            ...networkAvatar,
            name: companyNameForInitials(networkAvatar.name),
          };
          const indentAction = indentPrimaryAction(item.event_type, access);
          const dismissLane = () => {
            const ids = lane?.memberIds.length ? lane.memberIds : [item.id];
            for (const id of ids) {
              void markNetworkRead.mutateAsync(id).catch(() => {});
            }
          };
          const openIndent = () => {
            if (!access.indents || !item.indent_id) return;
            dismissLane();
            router.push(ROUTES.indentDetail(item.indent_id));
          };
          const laneTags: RegistryTag[] = [];
          if (isActiveView) {
            laneTags.push({
              label: lane?.critical ? "Allocate" : networkNotificationTagLabel(item.event_type),
              variant: lane?.critical
                ? "warning"
                : item.event_type === "awarded"
                  ? "success"
                  : item.event_type === "counter_offered"
                    ? "warning"
                    : "default",
            });
            if (lane && lane.loadCount > 1) {
              laneTags.push({
                label: `${lane.loadCount} loads`,
                variant: "neutral",
              });
            }
            if (lane && lane.bidCount > 1) {
              laneTags.push({
                label: `${lane.bidCount} bids`,
                variant: "default",
              });
            }
          }
          return (
            <AlertRegistrySignalCard
              key={entry.id}
              mode={isActiveView ? "active" : "completed"}
              onPress={openIndent}
              avatar={networkInitialsAvatar}
              actorName={networkAvatar.name}
              actionText={
                lane?.critical
                  ? "awarded, waiting for allocation"
                  : networkNotificationActionText(item.event_type)
              }
              highlightText={amountText ?? item.title}
              detailTitle={laneCopy?.title ?? item.title}
              detailSubtitle={laneCopy?.subtitle || item.subtitle || undefined}
              timeLabel={formatRelativeTime(item.created_at)}
              contextLabel={item.subtitle ?? undefined}
              tags={laneTags.length > 0 ? laneTags : undefined}
              isUnread={isActiveView && item.status === "open"}
              statusPill={
                !isActiveView
                  ? {
                      label: String(item.status ?? "read"),
                      tone: sharedNotificationStatusTone(item.status),
                    }
                  : undefined
              }
              footer={
                isActiveView ? (
                  <RegistryCardActions>
                    <RegistryGhostButton label="Dismiss" onPress={dismissLane} />
                    {indentAction.enabled ? (
                      <RegistryPrimaryButton
                        label={indentAction.label}
                        onPress={openIndent}
                      />
                    ) : null}
                  </RegistryCardActions>
                ) : undefined
              }
            />
          );
        }

        if (entry.kind === "salary" && entry.salary) {
          const req = entry.salary;
          const driverName = req.drivers?.name ?? "Driver";
          const isTripBasedAttribution =
            req.request_type === "trip_based" &&
            String(req.note ?? "").toLowerCase().includes("fleet trip");

          const salaryTags: RegistryTag[] = isTripBasedAttribution
            ? [
                { label: "attribution", variant: "default" },
                { label: "trip based", variant: "neutral" },
              ]
            : [
                { label: "salary", variant: "default" },
                { label: req.request_type.replace("_", " "), variant: "neutral" },
              ];
          const statusTone = salaryRequestStatusTone(req.status);

          return (
            <View key={entry.id}>
              {entry.id === firstAttributionEntryId ? (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>Attribution requests</Text>
                </View>
              ) : null}
              <AlertRegistrySignalCard
                mode={isActiveView ? "active" : "completed"}
                onPress={() =>
                  finance.onOpenDetail(
                    "salary",
                    req.id,
                    isActiveView ? "active" : "archive",
                  )
                }
                avatar={resolveSalaryRegistryAvatar(req, driversById)}
                actorName={driverName}
                actionText={
                  isTripBasedAttribution
                    ? "sent a trip for review on"
                    : "requested payment for"
                }
                highlightText={formatSalaryHighlight(req)}
                detailTitle={formatSalaryAmount(req.amount)}
                detailSubtitle={
                  isTripBasedAttribution
                    ? "Fleet trip attribution request"
                    : `${formatRegistryLabel(req.request_type)} salary request`
                }
                timeLabel={formatRelativeTime(req.created_at)}
                contextLabel={
                  isTripBasedAttribution ? "Fleet attribution" : "Salary request"
                }
                tags={isActiveView ? salaryTags : undefined}
                isUnread={isActiveView}
                statusPill={
                  !isActiveView
                    ? { label: String(req.status ?? ""), tone: statusTone }
                    : undefined
                }
                footer={
                  isActiveView ? (
                    <RegistryCardActions>
                      <RegistryGhostButton
                        label="Decline"
                        onPress={() => finance.onRejectSalary(req.id)}
                        disabled={finance.busySalaryId === req.id}
                      />
                      <RegistryPrimaryButton
                        label={isTripBasedAttribution ? "Accept" : "Pay now"}
                        onPress={() => finance.onPaySalary(req)}
                      />
                    </RegistryCardActions>
                  ) : (
                    <RegistryCardActions>
                      <RegistryGhostButton
                        label="View details"
                        onPress={() =>
                          finance.onOpenDetail("salary", req.id, "archive")
                        }
                      />
                    </RegistryCardActions>
                  )
                }
              />
            </View>
          );
        }

        return null;
      })}
    </>
  );
}

const TABS = FILTER_TABS;

/** Metronic demo2 dropdown + privacy-settings chrome. */
const METRONIC = {
  border: "#EFF2F5",
  muted: "#A1A5B7",
  primaryBtn: "#181C32",
  ghostBorder: "#DBDFE9",
  panelWidth: 480,
  /** Distance from viewport top to popover start (header + bell anchor). */
  popoverOffsetTop: 108,
  popoverBottomGap: 12,
} as const;

export function AlertRegistryPanel({
  filterTab,
  onFilterTabChange,
  onClose,
  onSync,
  syncing = false,
  finance,
  layout = "popover",
  topInset = 0,
  bottomInset = 0,
  isOpen = true,
  onDetailNavigateAway,
}: AlertRegistryPanelProps) {
  const isFullscreen = layout === "fullscreen";
  const isDrawer = layout === "drawer";
  const { height: windowHeight } = useWindowDimensions();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const [syncSpin, setSyncSpin] = useState(false);
  const [visibleCount, setVisibleCount] = useState(REGISTRY_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detail, setDetail] = useState<AlertDetailSelection | null>(null);

  const panelFinance = useMemo(
    (): AlertRegistryFinanceHandlers => ({
      ...finance,
      onOpenDetail: (kind, id, mode = "active") => {
        setDetail({ kind, id, mode });
      },
    }),
    [finance],
  );

  useEffect(() => {
    if (!isOpen) setDetail(null);
  }, [isOpen]);

  useEffect(() => {
    setDetail(null);
  }, [filterTab]);

  const memberAccess = useMemberAccess();
  const notificationAccess = useMemo((): RegistryNotificationAccess => {
    if (memberAccess.isLoading) return {
      trips: false,
      tripDetail: false,
      tripAssign: false,
      tripFinance: false,
      indents: false,
      indentBid: false,
      indentAward: false,
      received: false,
      paid: false,
      driverPay: false,
    };
    const can = memberAccess.can;
    const tripFinance = can("tripops.trips.finance") || can("finance.view");
    return {
      trips: can("tripops.trips.view"),
      tripDetail: can("tripops.trips.detail"),
      tripAssign: can("tripops.trips.assign"),
      tripFinance,
      indents: can("tripops.indents.view"),
      indentBid: can("tripops.indents.bid"),
      indentAward: can("tripops.indents.award"),
      received:
        can("finance.ledger.customers") ||
        can("finance.subtab.customers") ||
        tripFinance,
      paid:
        can("finance.ledger.suppliers") ||
        can("finance.subtab.suppliers") ||
        can("finance.ledger.driver") ||
        can("finance.subtab.drivers") ||
        tripFinance,
      driverPay:
        can("finance.ledger.driver") ||
        can("finance.subtab.drivers") ||
        tripFinance,
    };
  }, [memberAccess.isLoading, memberAccess.can]);
  const visibleTabs = useMemo(
    () => FILTER_TABS.filter((tab) => registryTabVisible(tab.id, notificationAccess)),
    [notificationAccess],
  );
  const salaryRequestsHasMore = useGlobalSyncStore((s) => s.salaryRequestsHasMore);
  const loadMoreSalaryRequests = useGlobalSyncStore((s) => s.loadMoreSalaryRequests);
  const { activeFeed, historyFeed } = useRegistryFeed(orgId);
  const accessibleActive = useMemo(
    () => activeFeed.filter((entry) => entryAllowedByAccess(entry, notificationAccess)),
    [activeFeed, notificationAccess],
  );
  const accessibleHistory = useMemo(
    () => historyFeed.filter((entry) => entryAllowedByAccess(entry, notificationAccess)),
    [historyFeed, notificationAccess],
  );
  const feed =
    registryFeedLifecycleTab(filterTab) === "history" ? accessibleHistory : accessibleActive;
  const filteredFeed = useMemo(
    () => filterRegistryFeed(feed, filterTab),
    [feed, filterTab],
  );
  const tabCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTER_TABS.map((t) => [
          t.id,
          t.id === "archive"
            ? accessibleHistory.length
            : filterRegistryFeed(accessibleActive, t.id).length,
        ]),
      ) as Record<RegistryFilterTab, number>,
    [accessibleActive, accessibleHistory],
  );

  useEffect(() => {
    if (!registryTabVisible(filterTab, notificationAccess)) onFilterTabChange("all");
  }, [filterTab, notificationAccess, onFilterTabChange]);
  const hasMoreInMemory = visibleCount < filteredFeed.length;
  const hasMoreInDb = filterTab !== "archive" && salaryRequestsHasMore;
  const showLoadMore = hasMoreInMemory || hasMoreInDb;
  useEffect(() => {
    setVisibleCount(REGISTRY_PAGE_SIZE);
  }, [filterTab]);

  const handleSync = async () => {
    if (!onSync) return;
    setSyncSpin(true);
    try {
      await onSync();
      setVisibleCount(REGISTRY_PAGE_SIZE);
    } finally {
      setSyncSpin(false);
    }
  };

  const handleLoadMore = useCallback(async () => {
    const nextVisible = visibleCount + REGISTRY_PAGE_SIZE;
    if (hasMoreInMemory) {
      setVisibleCount(nextVisible);
      return;
    }
    if (!hasMoreInDb || !orgId) return;
    setLoadingMore(true);
    try {
      await loadMoreSalaryRequests(orgId);
      setVisibleCount(nextVisible);
    } finally {
      setLoadingMore(false);
    }
  }, [
    visibleCount,
    hasMoreInMemory,
    hasMoreInDb,
    orgId,
    loadMoreSalaryRequests,
  ]);

  const fullscreenShell: ViewStyle | undefined = isFullscreen
    ? {
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        borderRadius: 0,
        borderWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
      }
    : undefined;

  const popoverShell: ViewStyle | undefined =
    layout === "popover"
      ? {
          height:
            windowHeight -
            METRONIC.popoverOffsetTop -
            METRONIC.popoverBottomGap,
          maxHeight:
            windowHeight -
            METRONIC.popoverOffsetTop -
            METRONIC.popoverBottomGap,
        }
      : undefined;

  const drawerShell: ViewStyle | undefined = isDrawer
    ? {
        flex: 1,
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        borderRadius: 0,
        borderWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
        ...Platform.select({
          web: { boxShadow: "none" as unknown as undefined },
        }),
      }
    : undefined;

  if (detail) {
    return (
      <View style={[styles.shell, fullscreenShell, popoverShell, drawerShell]}>
        <View style={[styles.header, isFullscreen && { paddingTop: 16 + topInset }]}>
          <Pressable
            onPress={() => setDetail(null)}
            style={styles.detailBackBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to notifications"
            hitSlop={8}
          >
            <ChevronLeft size={18} color={METRONIC.muted} strokeWidth={2.2} />
          </Pressable>
          <Text style={[styles.headerTitle, styles.headerTitleCentered]}>
            Notification
          </Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
            hitSlop={8}
          >
            <X size={16} color={METRONIC.muted} strokeWidth={2} />
          </Pressable>
        </View>
        <AlertDetailScreen
          variant="panel"
          kind={detail.kind}
          alertId={detail.id}
          mode={detail.mode}
          onBack={() => setDetail(null)}
          finance={panelFinance}
          bottomInset={isDrawer || isFullscreen ? bottomInset : 0}
          onNavigateAway={onDetailNavigateAway}
        />
      </View>
    );
  }

  return (
    <View style={[styles.shell, fullscreenShell, popoverShell, drawerShell]}>
      <View style={[styles.header, isFullscreen && { paddingTop: 16 + topInset }]}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close notifications"
          hitSlop={8}
        >
          <X size={16} color={METRONIC.muted} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollContent}
        >
          {visibleTabs.map((t) => {
            const selected = filterTab === t.id;
            const count = tabCounts[t.id] ?? 0;
            const showCount = count > 0;
            return (
              <Pressable
                key={t.id}
                onPress={() => onFilterTabChange(t.id)}
                style={styles.tabItem}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  showCount ? `${t.label}, ${count} items` : t.label
                }
              >
                <View style={styles.tabLabelRow}>
                  <Text style={[styles.tabText, selected && styles.tabTextActive]}>
                    {t.label}
                  </Text>
                  {showCount ? <View style={styles.tabUnreadDot} /> : null}
                </View>
                {selected ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={() => void handleSync()}
          style={styles.settingsBtn}
          disabled={syncing || syncSpin}
          accessibilityRole="button"
          accessibilityLabel="Refresh notifications"
        >
          {syncing || syncSpin ? (
            <ActivityIndicator size="small" color={Theme.textMuted} />
          ) : (
            <Settings2 size={16} color={METRONIC.muted} strokeWidth={2} />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={[
          styles.scroll,
          (isFullscreen || layout === "popover" || isDrawer) && {
            flex: 1,
            maxHeight: undefined,
          },
        ]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              (isDrawer || isFullscreen ? bottomInset + 28 : 24) +
              (showLoadMore ? 0 : 4),
          },
        ]}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        <RegistryFeedList
          filterTab={filterTab}
          visibleCount={visibleCount}
          finance={panelFinance}
          feed={filteredFeed}
          access={notificationAccess}
        />
        {showLoadMore ? (
          <Pressable
            onPress={() => void handleLoadMore()}
            style={styles.loadMoreBtn}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityLabel="Load more notifications"
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={Theme.textMuted} />
            ) : (
              <ChevronDown size={14} color={Theme.textMuted} />
            )}
            <Text style={styles.loadMoreText}>
              {loadingMore ? "Loading…" : `Load ${REGISTRY_PAGE_SIZE} more`}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: METRONIC.panelWidth,
    maxWidth: Platform.OS === "web" ? ("96vw" as unknown as number) : "100%",
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 24px rgba(24, 28, 50, 0.08)",
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 12,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0,
    backgroundColor: Theme.cardWhite,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
    letterSpacing: -0.2,
  },
  headerTitleCentered: {
    flex: 1,
    textAlign: "center",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  detailBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingLeft: 12,
    paddingRight: 10,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  tabScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabScrollContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
    paddingRight: 6,
  },
  tabList: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    flex: 1,
    minWidth: 0,
  },
  tabItem: {
    position: "relative",
    paddingBottom: 8,
    alignItems: "center",
    gap: 4,
    minWidth: 32,
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    position: "relative",
    paddingRight: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "400",
    color: METRONIC.muted,
  },
  tabTextActive: {
    color: Theme.primary,
    fontWeight: "500",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.buttonPrimary,
  },
  /** Metronic tab unread — small green dot, no solid count pill. */
  tabUnreadDot: {
    position: "absolute",
    top: -1,
    right: -5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#50CD89",
    borderWidth: 1,
    borderColor: Theme.cardWhite,
  },
  settingsBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: "center",
    gap: 5,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    color: METRONIC.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  groupHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  groupHeaderText: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.muted,
  },
});
