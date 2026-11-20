/**
 * Inbound Protocol — invitation popover aligned with AlertRegistryPanel (Metronic feed).
 */
import { AlertRegistrySignalCard, RegistryStatusPill } from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { PartyAvatar } from "@/components/PartyAvatar";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Theme from "@/constants/Theme";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import {
  DriverInviteSentReview,
  driverInviteSentStatusLabel,
} from "@/features/drivers/components/DriverInviteSentReview";
import { resolveInboundInviteAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { inviteHeadlineParts } from "@/lib/globalSync/inboundProtocol.util";
import { UserCheck, X } from "lucide-react-native";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

export type { InboundProtocolInviteItem };

export type InboundProtocolPanelLayout = "popover" | "fullscreen" | "drawer" | "embedded";

export type InboundProtocolPanelProps = {
  tab: "received" | "sent";
  onTabChange: (tab: "received" | "sent") => void;
  onClose: () => void;
  pendingCount: number;
  receivedItems: InboundProtocolInviteItem[];
  sentItems: InboundProtocolInviteItem[];
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
  onManageAll: () => void;
  layout?: InboundProtocolPanelLayout;
  topInset?: number;
  bottomInset?: number;
  showFooter?: boolean;
  /** Hide title row (embedded hub panel supplies its own chrome). */
  showHeader?: boolean;
};

const METRONIC = {
  border: "#EFF2F5",
  muted: "#A1A5B7",
  primaryBtn: "#181C32",
  ghostBorder: "#DBDFE9",
  panelWidth: 480,
  popoverOffsetTop: 108,
  popoverBottomGap: 12,
} as const;

const TABS = [
  { id: "received" as const, label: "Received" },
  { id: "sent" as const, label: "Sent" },
];

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

function inviteContextLabel(item: InboundProtocolInviteItem): string {
  if (item.kind === "driver") return "Driver";
  return "Network";
}

/** Desktop manage-all page — 4 cards per row (matches trips / loads grid). */
function inviteGridColumns(contentWidth: number): number {
  if (contentWidth >= 960) return 4;
  if (contentWidth >= 560) return 2;
  return 1;
}

const GRID_AVATAR_SIZE = 34;

function EmptyInvitationsState({ tab }: { tab: "received" | "sent" }) {
  return (
    <View style={styles.emptyWrap}>
      <TinyEmptyLottie
        source={
          tab === "received"
            ? EMPTY_STATE_LOTTIE.inviteReceived
            : EMPTY_STATE_LOTTIE.inviteSent
        }
      />
      <Text style={styles.emptyTitle}>
        {tab === "received" ? "No pending invitations" : "No sent invitations"}
      </Text>
      <Text style={styles.emptyBody}>
        {tab === "received"
          ? "Connection and driver requests from other organisations will appear here."
          : "Invitations you send will appear here until they are accepted or recalled."}
      </Text>
    </View>
  );
}

function InviteSignalRow({
  item,
  tab,
  busyId,
  onApprove,
  onReject,
  onCancel,
  onOpenInviteDetail,
}: {
  item: InboundProtocolInviteItem;
  tab: "received" | "sent";
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
}) {
  const busy =
    busyId === item.id ||
    (item.linkedRequestIds?.includes(busyId ?? "") ?? false);
  const canOpenDetail =
    tab === "received" &&
    item.kind !== "driver" &&
    Boolean(onOpenInviteDetail);

  const avatar = resolveInboundInviteAvatar(item);
  const { actionText, highlightText, trailingText } = inviteHeadlineParts(tab, item);

  // Driver change request / decline: shown full width UNDER the card (the
  // card footer is a right-aligned button row and would clip it).
  const listDriverReview =
    tab === "sent" &&
    item.kind === "driver" &&
    (item.driverInviteStatus === "countered" || item.driverInviteStatus === "rejected")
      ? item.driverInviteStatus
      : null;

  return (
    <View>
      <AlertRegistrySignalCard
        avatar={avatar}
        actorName={item.name}
        actionText={actionText}
        highlightText={highlightText}
        trailingText={trailingText}
        detailTitle={item.type}
        detailSubtitle={item.subtitle}
        timeLabel={formatRelativeTime(item.createdAt)}
        contextLabel={inviteContextLabel(item)}
        statusPill={{
          label:
            tab === "sent"
              ? item.kind === "driver"
                ? driverInviteSentStatusLabel(item.driverInviteStatus)
                : "Pending"
              : item.kind === "driver"
                ? "Driver"
                : "Invite",
          tone: tab === "sent" ? "warning" : "neutral",
        }}
        isUnread={tab === "received"}
        onPress={canOpenDetail ? () => onOpenInviteDetail?.(item) : undefined}
        headerEnd={
          item.kind !== "driver" ? (
            <OrgVerificationBadges
              verification={{ verificationStatus: item.verificationStatus }}
              compact
              style={{ justifyContent: "flex-end" }}
            />
          ) : undefined
        }
        footer={
          tab === "received" ? (
            <RegistryCardActions>
              <RegistryGhostButton
                label="Decline"
                onPress={() => onReject(item)}
                disabled={busy}
              />
              <RegistryPrimaryButton
                label="Accept"
                onPress={() => onApprove(item)}
                disabled={busy}
              />
            </RegistryCardActions>
          ) : listDriverReview ? undefined : (
            <RegistryCardActions>
              <RegistryGhostButton
                label="Recall"
                onPress={() => onCancel(item)}
                disabled={busy}
              />
            </RegistryCardActions>
          )
        }
      />
      {listDriverReview ? (
        <View style={styles.driverReviewBelow}>
          <DriverInviteSentReview
            inviteId={item.id}
            driverName={item.name}
            status={listDriverReview}
            orgId={item.fromOrgId}
          />
        </View>
      ) : null}
    </View>
  );
}

function InviteGridCard({
  item,
  tab,
  busyId,
  onApprove,
  onReject,
  onCancel,
  onOpenInviteDetail,
}: {
  item: InboundProtocolInviteItem;
  tab: "received" | "sent";
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
}) {
  const busy =
    busyId === item.id ||
    (item.linkedRequestIds?.includes(busyId ?? "") ?? false);
  const canOpenDetail =
    tab === "received" &&
    item.kind !== "driver" &&
    Boolean(onOpenInviteDetail);
  const avatar = resolveInboundInviteAvatar(item);
  const statusLabel =
    tab === "sent"
      ? item.kind === "driver"
        ? driverInviteSentStatusLabel(item.driverInviteStatus)
        : "Pending"
      : item.kind === "driver"
        ? "Driver"
        : "Invite";
  const driverReview =
    tab === "sent" &&
    item.kind === "driver" &&
    (item.driverInviteStatus === "countered" || item.driverInviteStatus === "rejected")
      ? item.driverInviteStatus
      : null;
  const statusTone = tab === "sent" ? "warning" : ("neutral" as const);
  const { actionText, highlightText, trailingText } = inviteHeadlineParts(tab, item);

  return (
    <Pressable
      onPress={canOpenDetail ? () => onOpenInviteDetail?.(item) : undefined}
      disabled={!canOpenDetail}
      style={({ pressed }) => [
        styles.gridCard,
        canOpenDetail && pressed && styles.gridCardPressed,
      ]}
    >
      <View style={styles.gridCardTop}>
        <View style={styles.gridAvatarWrap}>
          <PartyAvatar
            name={avatar.name}
            entityType={avatar.entityType ?? "client"}
            avatarUrl={avatar.avatarUrl}
            avatarSeed={avatar.avatarSeed}
            organizationImageUrl={avatar.organizationImageUrl}
            organizationAvatarSeed={avatar.organizationAvatarSeed}
            initialsColorSeed={avatar.initialsColorSeed}
            size={GRID_AVATAR_SIZE}
            shape="circle"
          />
          {tab === "received" ? (
            <View style={[styles.gridStatusDot, styles.gridStatusDotUnread]} />
          ) : null}
        </View>
        <View style={styles.gridTextCol}>
          <View style={styles.gridHeadlineRow}>
            <Text style={styles.gridHeadline} numberOfLines={3}>
              <Text style={styles.gridActor}>{item.name}</Text>
              <Text style={styles.gridAction}> {actionText}</Text>
              {highlightText ? (
                <Text style={styles.gridHighlight}> {highlightText}</Text>
              ) : null}
              {trailingText ? (
                <Text style={styles.gridAction}> {trailingText}</Text>
              ) : null}
            </Text>
            {item.kind !== "driver" ? (
              <OrgVerificationBadges
                verification={{ verificationStatus: item.verificationStatus }}
                compact
                style={styles.gridBadges}
              />
            ) : null}
          </View>
          <Text style={styles.gridMeta} numberOfLines={1}>
            {formatRelativeTime(item.createdAt)}
            <Text style={styles.gridMetaContext}> · {inviteContextLabel(item)}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.gridDetailBox}>
        <Text style={styles.gridDetailTitle} numberOfLines={2}>
          {item.type}
        </Text>
        {item.subtitle ? (
          <Text style={styles.gridDetailSub} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.gridFooter}>
        <View style={styles.gridFooterLeft}>
          <RegistryStatusPill label={statusLabel} tone={statusTone} />
        </View>
        <View style={styles.gridActions}>
          {tab === "received" ? (
            <>
              <RegistryGhostButton
                label="Decline"
                onPress={() => onReject(item)}
                disabled={busy}
              />
              <RegistryPrimaryButton
                label="Accept"
                onPress={() => onApprove(item)}
                disabled={busy}
              />
            </>
          ) : driverReview ? null : (
            <RegistryGhostButton
              label="Recall"
              onPress={() => onCancel(item)}
              disabled={busy}
            />
          )}
        </View>
      </View>
      {driverReview ? (
        <DriverInviteSentReview
          inviteId={item.id}
          driverName={item.name}
          status={driverReview}
          orgId={item.fromOrgId}
        />
      ) : null}
    </Pressable>
  );
}

function InviteGrid({
  items,
  tab,
  columns,
  busyId,
  onApprove,
  onReject,
  onCancel,
  onOpenInviteDetail,
}: {
  items: InboundProtocolInviteItem[];
  tab: "received" | "sent";
  columns: number;
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
}) {
  const cellPct = `${100 / columns}%` as const;
  const cellStyle = [
    styles.gridCell,
    {
      width: cellPct,
      maxWidth: cellPct,
      flexBasis: cellPct,
    },
  ];

  return (
    <View style={styles.gridList}>
      {items.map((item) => (
        <View key={item.id} style={cellStyle}>
          <InviteGridCard
            item={item}
            tab={tab}
            busyId={busyId}
            onApprove={onApprove}
            onReject={onReject}
            onCancel={onCancel}
            onOpenInviteDetail={onOpenInviteDetail}
          />
        </View>
      ))}
    </View>
  );
}

export function InboundProtocolPanel({
  tab,
  onTabChange,
  onClose,
  pendingCount,
  receivedItems,
  sentItems,
  busyId,
  onApprove,
  onReject,
  onCancel,
  onOpenInviteDetail,
  onManageAll,
  layout = "popover",
  topInset = 0,
  bottomInset = 0,
  showFooter = true,
  showHeader = true,
}: InboundProtocolPanelProps) {
  const isFullscreen = layout === "fullscreen";
  const isDrawer = layout === "drawer";
  const isEmbedded = layout === "embedded";
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const list = tab === "received" ? receivedItems : sentItems;
  const gridColumns = inviteGridColumns(windowWidth);

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

  const embeddedShell: ViewStyle | undefined = isEmbedded
    ? {
        width: "100%",
        maxWidth: "100%",
        borderRadius: 0,
        borderWidth: 0,
        backgroundColor: "transparent",
        ...Platform.select({
          web: { boxShadow: "none" as unknown as undefined },
        }),
      }
    : undefined;

  const useGrid = isFullscreen || isEmbedded;

  const listBody =
    list.length === 0 ? (
      <EmptyInvitationsState tab={tab} />
    ) : useGrid ? (
      <InviteGrid
        items={list}
        tab={tab}
        columns={gridColumns}
        busyId={busyId}
        onApprove={onApprove}
        onReject={onReject}
        onCancel={onCancel}
        onOpenInviteDetail={onOpenInviteDetail}
      />
    ) : (
      list.map((item) => (
        <InviteSignalRow
          key={item.id}
          item={item}
          tab={tab}
          busyId={busyId}
          onApprove={onApprove}
          onReject={onReject}
          onCancel={onCancel}
          onOpenInviteDetail={onOpenInviteDetail}
        />
      ))
    );

  return (
    <View style={[styles.shell, fullscreenShell, popoverShell, drawerShell, embeddedShell]}>
      {showHeader ? (
        <View style={[styles.header, isFullscreen && { paddingTop: 16 + topInset }]}>
          <Text style={styles.headerTitle}>Invitations</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close invitations"
            hitSlop={8}
          >
            <X size={16} color={METRONIC.muted} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.tabBar, isEmbedded && styles.tabBarEmbedded]}>
        <View style={styles.tabList}>
          {TABS.map((t) => {
            const selected = tab === t.id;
            const showDot =
              t.id === "received" ? pendingCount > 0 : sentItems.length > 0;
            return (
              <Pressable
                key={t.id}
                onPress={() => onTabChange(t.id)}
                style={styles.tabItem}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <View style={styles.tabLabelRow}>
                  <Text style={[styles.tabText, selected && styles.tabTextActive]}>
                    {t.label}
                  </Text>
                  {showDot ? <View style={styles.tabUnreadDot} /> : null}
                </View>
                {selected ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {isEmbedded ? (
        <View style={[styles.scrollContent, styles.scrollContentEmbedded]}>
          {listBody}
        </View>
      ) : (
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
            isFullscreen && styles.scrollContentFullscreen,
            isFullscreen && { paddingBottom: bottomInset + 16 },
          ]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {listBody}
        </ScrollView>
      )}

      {showFooter && !isEmbedded ? (
        <View
          style={[
            styles.footer,
            isFullscreen && { paddingBottom: 12 + bottomInset },
          ]}
        >
          <Pressable
            onPress={onManageAll}
            style={styles.footerBtn}
            accessibilityRole="button"
            accessibilityLabel="Manage all requests"
          >
            <UserCheck size={13} color={METRONIC.primaryBtn} strokeWidth={2.2} />
            <Text style={styles.footerBtnText}>Manage all requests</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  driverReviewBelow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  shell: {
    width: METRONIC.panelWidth,
    maxWidth: Platform.OS === "web" ? ("96vw" as unknown as number) : "100%",
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
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.primaryBtn,
    letterSpacing: -0.1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  tabBarEmbedded: {
    paddingHorizontal: 20,
    backgroundColor: "transparent",
  },
  tabList: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    flex: 1,
  },
  tabItem: {
    position: "relative",
    paddingBottom: 8,
    alignItems: "center",
    minWidth: 48,
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    position: "relative",
    paddingRight: 2,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  tabTextActive: {
    color: Theme.primary,
    fontWeight: "600",
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
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: Theme.cardWhite,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  scrollContentFullscreen: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  scrollContentEmbedded: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    width: "100%",
  },
  gridList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -10,
    alignItems: "stretch",
    width: "100%",
  },
  gridCell: {
    minWidth: 0,
    paddingHorizontal: 10,
    marginBottom: 20,
    alignSelf: "stretch",
  },
  gridCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 10,
    ...Platform.select({
      web: {
        boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.06)",
      },
    }),
  },
  gridCardPressed: {
    opacity: 0.92,
  },
  gridCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  gridAvatarWrap: {
    width: GRID_AVATAR_SIZE,
    height: GRID_AVATAR_SIZE,
    position: "relative",
    flexShrink: 0,
  },
  gridStatusDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  gridStatusDotUnread: {
    backgroundColor: "#50CD89",
  },
  gridTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  gridHeadlineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    width: "100%",
  },
  gridHeadline: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: METRONIC.primaryBtn,
  },
  gridBadges: {
    flexShrink: 0,
    justifyContent: "flex-end" as const,
    maxWidth: "48%",
  },
  gridActor: {
    fontWeight: "600",
    color: METRONIC.primaryBtn,
  },
  gridAction: {
    fontWeight: "400",
    color: METRONIC.primaryBtn,
  },
  gridHighlight: {
    fontWeight: "600",
    color: Theme.primary,
  },
  gridMeta: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  gridMetaContext: {
    color: "#78829D",
    fontWeight: "500",
  },
  gridDetailBox: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#F5F8FA",
    gap: 2,
    minHeight: 44,
  },
  gridDetailTitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: METRONIC.primaryBtn,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  gridDetailSub: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    color: "#78829D",
  },
  gridFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: "auto",
  },
  gridFooterLeft: {
    flexShrink: 0,
  },
  gridActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 8,
    flexShrink: 0,
    marginLeft: "auto",
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.primaryBtn,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "400",
    color: METRONIC.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  footerBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.primaryBtn,
  },
});
