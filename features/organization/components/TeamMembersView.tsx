/**
 * Team members list: active members and pending invites.
 * Matches InvitationsView / ConnectionsView hub styling.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import { DomainJoinRequestsPanel } from "@/features/organization/components/DomainJoinRequestsPanel";
import { useOrgMembersQuery, useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import {
  cancelTeamInvite,
  updateBulkMemberPermissions,
} from "@/features/organization/services/members.service";
import type { OrgMember, PendingPhoneTeamInvite } from "@/types/organization";
import { managerCanEditMember } from "@/lib/memberSurfaces";
import {
  buildTeamInvitePermissions,
  memberDisplayRoleLabel,
  TEAM_INVITE_ROLE_OPTIONS,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";
import { useOrgCapabilities } from "@/lib/useCapabilities";
import { LinearGradient } from "expo-linear-gradient";
import {
  Check,
  CheckSquare,
  Clock,
  Mail,
  Pencil,
  Phone,
  Search,
  Shield,
  Square,
  Trash2,
  UserCheck,
  UserPlus2,
  Users,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { confirmDialog } from "@/lib/confirmDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(member: OrgMember): string {
  return memberDisplayRoleLabel(member);
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${Math.max(1, m)}m ago`;
}

const COVER_HEIGHT = 34;
const AVATAR_SIZE = 46;
const AVATAR_RING = 50;
/** How far the avatar hangs below the cover into the body. */
const AVATAR_HANG = 24;
const FOOTER_HEIGHT = 36;

function StatusPill({
  tone,
  label,
  accessibilityLabel,
}: {
  tone: "active" | "pending" | "warning";
  label: string;
  accessibilityLabel?: string;
}) {
  const toneStyle =
    tone === "active"
      ? cardStyles.statusActive
      : tone === "warning"
        ? cardStyles.statusWarning
        : cardStyles.statusPending;
  const textStyle =
    tone === "active"
      ? cardStyles.statusActiveText
      : tone === "warning"
        ? cardStyles.statusWarningText
        : cardStyles.statusPendingText;
  return (
    <View
      style={[cardStyles.pill, cardStyles.statusPill, toneStyle]}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {tone === "active" ? (
        <Check size={9} color={Theme.darkGreen} strokeWidth={2.8} />
      ) : null}
      <Text style={[cardStyles.pillText, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ContactLine({
  icon: Icon,
  value,
  muted = false,
}: {
  icon: typeof Phone;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={cardStyles.contactLine}>
      <View style={cardStyles.contactIcon}>
        <Icon size={11} color={Theme.textMuted} strokeWidth={2.1} />
      </View>
      <Text
        style={[cardStyles.contactText, muted && cardStyles.emailMuted]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function TeamRosterCardShell({
  selected = false,
  checkbox,
  leftBadges,
  rightBadge,
  avatarName,
  avatarSeed,
  avatarUrl,
  children,
  footer,
  onPress,
}: {
  selected?: boolean;
  checkbox?: React.ReactNode;
  leftBadges: React.ReactNode;
  rightBadge: React.ReactNode;
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode | null;
  onPress?: () => void;
}) {
  const inner = (
    <>
      {checkbox}
      <LinearGradient
        colors={[Theme.brandBlue, Theme.brandBlueSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cardStyles.cardCover}
      >
        <View style={cardStyles.coverOrb} pointerEvents="none" />
        <View style={cardStyles.badgeRow}>
          <View style={cardStyles.badgeCluster}>{leftBadges}</View>
          <View style={cardStyles.badgeClusterEnd}>{rightBadge}</View>
        </View>
      </LinearGradient>

      <View style={cardStyles.avatarAnchor} pointerEvents="none">
        <View style={cardStyles.avatarRing}>
          <PartyAvatar
            name={avatarName}
            initialsColorSeed={avatarSeed}
            avatarUrl={avatarUrl ?? null}
            size={AVATAR_SIZE}
            shape="circle"
            style={cardStyles.avatarInner}
          />
        </View>
      </View>

      <View style={cardStyles.cardBody}>{children}</View>

      <View style={cardStyles.footerSlot}>
        {footer ?? <View style={cardStyles.footerPlaceholder} />}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyles.card,
          selected && cardStyles.cardSelected,
          pressed && cardStyles.cardPressed,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={[cardStyles.card, selected && cardStyles.cardSelected]}>
      {inner}
    </View>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  isCurrentUser,
  canManage,
  onEdit,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  member: OrgMember;
  isCurrentUser: boolean;
  canManage: boolean;
  onEdit: (member: OrgMember) => void;
  /** Bulk mode — show a checkbox instead of routing to the detail panel. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (member: OrgMember) => void;
}) {
  const displayName = member.full_name || member.phone || member.email || "Unknown";
  const isOwner = member.role === "owner";
  const isPending = member.status === "pending";
  const canEdit = canManage && !isOwner && !isCurrentUser;
  // Owner rows and your own row are never bulk-editable (RLS rejects them too).
  const canSelect = selectable && canEdit;

  return (
    <TeamRosterCardShell
      selected={selected}
      onPress={canEdit && !selectable ? () => onEdit(member) : undefined}
      avatarName={displayName}
      avatarSeed={member.id}
      avatarUrl={member.avatar_url}
      checkbox={
        canSelect ? (
          <Pressable
            onPress={() => onToggleSelect?.(member)}
            hitSlop={8}
            style={cardStyles.checkboxWrap}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Select ${displayName}`}
          >
            {selected ? (
              <CheckSquare size={18} color={Theme.accentBrown} strokeWidth={2.4} />
            ) : (
              <Square size={18} color={Theme.textSecondary} strokeWidth={2.2} />
            )}
          </Pressable>
        ) : null
      }
      leftBadges={
        isCurrentUser ? (
          <View style={[cardStyles.pill, cardStyles.youPill]}>
            <Text style={[cardStyles.pillText, cardStyles.youPillText]}>YOU</Text>
          </View>
        ) : (
          <View />
        )
      }
      rightBadge={
        isPending ? (
          <StatusPill tone="pending" label="PENDING" />
        ) : (
          <StatusPill tone="active" label="ACTIVE" />
        )
      }
      footer={
        canSelect ? (
          <Pressable
            onPress={() => onToggleSelect?.(member)}
            style={({ pressed }) => [cardStyles.footerBtn, pressed && { opacity: 0.82 }]}
          >
            <Text style={cardStyles.footerBtnText}>
              {selected ? "Selected" : "Select"}
            </Text>
          </Pressable>
        ) : canEdit ? (
          <Pressable
            onPress={() => onEdit(member)}
            style={({ pressed }) => [cardStyles.footerBtn, pressed && { opacity: 0.82 }]}
          >
            <Pencil size={11} color={Theme.brandBlueInk} strokeWidth={2.2} />
            <Text style={cardStyles.footerBtnText}>Edit</Text>
          </Pressable>
        ) : null
      }
    >
      <View style={cardStyles.identityBlock}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={cardStyles.roleLine} numberOfLines={1}>
          {roleLabel(member)}
        </Text>
        <View style={cardStyles.contactBlock}>
          <ContactLine icon={Phone} value={member.phone?.trim() || "No phone on their account"} muted={!member.phone?.trim()} />
          <ContactLine icon={Mail} value={member.email?.trim() || "No email"} muted={!member.email?.trim()} />
          <ContactLine icon={Clock} value={`Joined ${formatRelative(member.joined_at)}`} />
        </View>
      </View>
    </TeamRosterCardShell>
  );
}

// ─── Pending phone invite (no Pulse account yet) ───────────────────────────────

function PendingPhoneInviteCard({
  invite,
  canManage,
  onCancel,
}: {
  invite: PendingPhoneTeamInvite;
  canManage: boolean;
  onCancel: (invite: PendingPhoneTeamInvite) => void;
}) {
  const roleText = memberDisplayRoleLabel({
    role: invite.role,
    permissions: invite.permissions,
  });
  const statusLabel = invite.email_conflict ? "EXISTS" : "SIGNUP";
  const statusA11y = invite.email_conflict
    ? "Account already exists"
    : "Awaiting signup";

  return (
    <TeamRosterCardShell
      avatarName={invite.invitee_name}
      avatarSeed={invite.id}
      leftBadges={<View />}
      rightBadge={
        <StatusPill
          tone={invite.email_conflict ? "warning" : "pending"}
          label={statusLabel}
          accessibilityLabel={statusA11y}
        />
      }
      footer={
        canManage ? (
          <Pressable
            onPress={() => onCancel(invite)}
            style={({ pressed }) => [
              cardStyles.footerBtn,
              cardStyles.footerBtnDanger,
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Cancel invite for ${invite.invitee_name}`}
          >
            <Trash2 size={13} color={Theme.destructive} strokeWidth={2.2} />
            <Text style={[cardStyles.footerBtnText, cardStyles.footerBtnTextDanger]}>
              Cancel invite
            </Text>
          </Pressable>
        ) : null
      }
    >
      <View style={cardStyles.identityBlock}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {invite.invitee_name}
        </Text>
        <Text style={cardStyles.roleLine} numberOfLines={1}>
          {roleText}
        </Text>
        <View style={cardStyles.contactBlock}>
          <ContactLine icon={Phone} value={invite.invitee_phone} />
          <ContactLine
            icon={Mail}
            value={invite.invitee_email?.trim() || "No email on invite"}
            muted={!invite.invitee_email?.trim()}
          />
          <ContactLine icon={Clock} value={`Invited ${formatRelative(invite.created_at)}`} />
        </View>
        {invite.email_conflict ? (
          <View style={cardStyles.conflictBox}>
            <Text style={cardStyles.conflictTitle}>Pulse account found</Text>
            <Text style={cardStyles.conflictText} numberOfLines={3}>
              {invite.conflict_org_names?.length
                ? `Linked to ${invite.conflict_org_names.join(", ")}. Sign in — don’t sign up again.`
                : "Email already registered. Ask them to sign in to accept."}
            </Text>
          </View>
        ) : (
          <Text style={cardStyles.phoneHint} numberOfLines={2}>
            Joins when they sign up with this phone number.
          </Text>
        )}
      </View>
    </TeamRosterCardShell>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "column",
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 20,
    shadowColor: Theme.brandBlueInk,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.992 }],
  },
  cardSelected: {
    borderColor: Theme.accentGold,
    borderWidth: 1.5,
  },
  checkboxWrap: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 5,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  cardCover: {
    height: COVER_HEIGHT,
    overflow: "hidden",
    zIndex: 1,
  },
  coverOrb: {
    position: "absolute",
    top: -22,
    right: -18,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.screenBackground,
    opacity: 0.28,
  },
  badgeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  badgeCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  badgeClusterEnd: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  pill: {
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.screenBackground,
    backgroundColor: Theme.cardWhite,
  },
  rolePill: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  statusPill: {
    flexShrink: 0,
  },
  pillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.25,
    textTransform: "uppercase",
    lineHeight: 10,
    flexShrink: 1,
  },
  statusActive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21, 128, 61, 0.28)",
  },
  statusActiveText: {
    color: Theme.darkGreen,
  },
  statusPending: {
    backgroundColor: Theme.accentBrownMuted,
    borderColor: Theme.accentBrownBorder,
  },
  statusPendingText: {
    color: Theme.accentBrownDeep,
  },
  statusWarning: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.28)",
  },
  statusWarningText: {
    color: Theme.warning,
  },
  youPill: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
    flexShrink: 0,
  },
  youPillText: {
    color: Theme.aggregatePillText,
  },
  avatarAnchor: {
    position: "absolute",
    top: COVER_HEIGHT - AVATAR_HANG,
    left: 0,
    right: 0,
    height: AVATAR_RING,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  avatarRing: {
    width: AVATAR_RING,
    height: AVATAR_RING,
    borderRadius: AVATAR_RING / 2,
    borderWidth: 3,
    borderColor: Theme.cardWhite,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: Theme.brandBlueInk,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarInner: {
    borderWidth: 0,
  },
  cardBody: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingTop: AVATAR_HANG + 8,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  identityBlock: {
    width: "100%",
    alignItems: "center",
    gap: 3,
  },
  name: {
    width: "100%",
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
    lineHeight: 17,
    minHeight: 17,
  },
  roleLine: {
    width: "100%",
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  contactBlock: {
    width: "100%",
    marginTop: 6,
    gap: 4,
    paddingHorizontal: 2,
  },
  contactLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 15,
  },
  contactIcon: {
    width: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
  },
  emailMuted: {
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  conflictBox: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownWash,
    width: "100%",
    gap: 2,
  },
  conflictTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentBrownDeep,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  conflictText: {
    fontSize: 10,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 13,
  },
  phoneHint: {
    marginTop: 4,
    fontSize: 10,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 13,
    paddingHorizontal: 2,
    minHeight: 26,
  },
  footerSlot: {
    flexShrink: 0,
    height: FOOTER_HEIGHT,
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.brandBlueSoft,
  },
  footerPlaceholder: {
    flex: 1,
    height: FOOTER_HEIGHT,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: FOOTER_HEIGHT,
    width: "100%",
  },
  footerBtnDanger: {
    backgroundColor: "rgba(232, 33, 39, 0.04)",
  },
  footerBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.brandBlueInk,
    letterSpacing: -0.1,
  },
  footerBtnTextDanger: {
    color: Theme.destructive,
  },
});

// ─── Empty States ──────────────────────────────────────────────────────────────

function EmptyMembers({ onInvite }: { onInvite?: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Users size={26} color={Theme.brandBlueInk} strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyTitle}>No people in this workspace yet</Text>
      <Text style={styles.emptySub}>Invite colleagues to share trips, finance, and operations.</Text>
      {onInvite && (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.emptyInviteBtn, pressed && { opacity: 0.8 }]}
        >
          <UserPlus2 size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.emptyInviteBtnText}>Invite Member</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyPending({ onInvite }: { onInvite?: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <UserCheck size={26} color={Theme.brandBlueInk} strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyTitle}>Inbox is clear</Text>
      <Text style={styles.emptySub}>
        Sent invitations appear here. New employees without a Pulse account show as
        awaiting signup until they register with the invited phone number.
      </Text>
      {onInvite ? (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.emptyInviteBtn, pressed && { opacity: 0.8 }]}
        >
          <UserPlus2 size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.emptyInviteBtnText}>Invite member</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TeamMembersView({
  orgId,
  currentUserId,
  canManage,
  onInvite,
  onEditMember,
  embedded = false,
  desktopMetronic = false,
  initialSubTab,
  managerDepartment = null,
}: {
  orgId: string;
  currentUserId: string | null;
  canManage: boolean;
  onInvite?: () => void;
  /** When set, Edit stays in the current layout instead of opening the full-page permissions modal. */
  onEditMember?: (member: OrgMember) => void;
  /** When true, omit outer ScrollView (parent scrolls). */
  embedded?: boolean;
  /** Metronic desktop hub — underline sub-tabs, tighter padding. */
  desktopMetronic?: boolean;
  /** After inline invite, open on pending tab. */
  initialSubTab?: "members" | "pending";
  /**
   * Viewer is a Department manager (not owner / admin): show only active
   * teammates of this department — no pending invites, join requests or bulk
   * role changes. App-side; the manager RPCs re-check every write.
   */
  managerDepartment?: string | null;
}) {
  const [tab, setTab] = useState<"members" | "pending">(
    () => initialSubTab ?? "members",
  );
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Bulk role assignment ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const orgCaps = useOrgCapabilities();

  React.useEffect(() => {
    if (initialSubTab) setTab(initialSubTab);
  }, [initialSubTab]);

  const query = useOrgMembersQuery(orgId);
  const invalidate = useInvalidateOrgMembers(orgId);
  const router = useRouter();

  const handleEditMember = (member: OrgMember) => {
    if (onEditMember) {
      onEditMember(member);
      return;
    }
    router.push(
      (`/(modals)/member-permissions?memberId=${encodeURIComponent(member.id)}`) as Parameters<
        typeof router.push
      >[0],
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
    setRolePickerOpen(false);
  };

  const handleToggleSelect = (member: OrgMember) => {
    setSelectedIds((prev) =>
      prev.includes(member.id)
        ? prev.filter((id) => id !== member.id)
        : [...prev, member.id],
    );
  };

  const handleBulkAssignRole = async (platformRole: PlatformTeamRole) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label =
      TEAM_INVITE_ROLE_OPTIONS.find((o) => o.value === platformRole)?.label ??
      platformRole;

    const confirmed = await confirmDialog({
      title: "Change role?",
      message: `Set ${ids.length} member${ids.length === 1 ? "" : "s"} to ${label}? This replaces their current permissions.`,
      confirmLabel: "Apply",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setBulkBusy(true);
    try {
      const permissions = buildTeamInvitePermissions(platformRole, undefined, orgCaps);
      const { error, updated } = await updateBulkMemberPermissions(
        ids,
        platformRole,
        permissions,
      );
      if (error) {
        Alert.alert("Could not change roles", error.message);
        return;
      }
      invalidate();
      await query.refetch();
      exitSelectMode();
      Alert.alert("Roles updated", `${updated} member${updated === 1 ? "" : "s"} set to ${label}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const roster = query.data;
  const all = useMemo(() => {
    const members = roster?.members ?? [];
    if (!managerDepartment) return members;
    return members.filter((m) => managerCanEditMember(managerDepartment, currentUserId, m));
  }, [roster?.members, managerDepartment, currentUserId]);
  const pendingPhoneInvites = managerDepartment ? [] : (roster?.pendingPhoneInvites ?? []);
  const activeMembers = useMemo(() => all.filter((m) => m.status === "active"), [all]);
  const pendingMembers = useMemo(() => all.filter((m) => m.status === "pending"), [all]);
  const pendingCount = pendingMembers.length + pendingPhoneInvites.length;

  type PendingGridItem =
    | { kind: "member"; member: OrgMember }
    | { kind: "phone"; invite: PendingPhoneTeamInvite };

  const applySearch = (list: OrgMember[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  };

  const pendingItems = useMemo<PendingGridItem[]>(() => {
    const q = search.trim().toLowerCase();
    const phoneItems: PendingGridItem[] = pendingPhoneInvites
      .filter((invite) => {
        if (!q) return true;
        return (
          invite.invitee_name.toLowerCase().includes(q) ||
          invite.invitee_phone.toLowerCase().includes(q) ||
          (invite.invitee_email ?? "").toLowerCase().includes(q)
        );
      })
      .map((invite) => ({ kind: "phone" as const, invite }));
    const memberItems: PendingGridItem[] = applySearch(pendingMembers).map(
      (member) => ({ kind: "member" as const, member }),
    );
    return [...phoneItems, ...memberItems];
  }, [pendingPhoneInvites, pendingMembers, search]);

  const displayList = applySearch(tab === "members" ? activeMembers : pendingMembers);

  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const handleCancelPhoneInvite = async (invite: PendingPhoneTeamInvite) => {
    const confirmed = await confirmDialog({
      title: "Cancel invitation?",
      message: `Remove the invite for ${invite.invitee_name}? They will not be added when they sign up.`,
      confirmLabel: "Cancel invite",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!confirmed) return;

    setActionId(invite.id);
    try {
      const { error } = await cancelTeamInvite(invite.id, "phone_pending");
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      invalidate();
      await query.refetch();
    } finally {
      setActionId(null);
    }
  };

  if (query.isLoading && !query.data) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator color={Theme.loaderAccent} />
      </View>
    );
  }

  const numColumns = desktopMetronic ? 3 : 2;
  const memberRows: OrgMember[][] = [];
  for (let i = 0; i < displayList.length; i += numColumns) {
    memberRows.push(displayList.slice(i, i + numColumns));
  }

  const pendingRows: PendingGridItem[][] = [];
  for (let i = 0; i < pendingItems.length; i += numColumns) {
    pendingRows.push(pendingItems.slice(i, i + numColumns));
  }

  const body = (
    <>
      {managerDepartment ? null : (
        <DomainJoinRequestsPanel orgId={orgId} canManage={canManage} />
      )}

      <LinearGradient
        colors={[Theme.brandBlueSoft, Theme.cardWhite]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, embedded && styles.heroEmbedded]}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>Directory</Text>
          <Text style={styles.heroTitle}>People in this workspace</Text>
          <Text style={styles.heroSub}>
            Roles, access, and invites — one place to manage who can operate.
          </Text>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{activeMembers.length}</Text>
            <Text style={styles.heroStatLabel}>Active</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{pendingCount}</Text>
            <Text style={styles.heroStatLabel}>Pending</Text>
          </View>
        </View>
      </LinearGradient>

      <View
        style={[
          styles.segRow,
          desktopMetronic && styles.tabRowMetronic,
          embedded && styles.tabRowEmbedded,
        ]}
      >
        <View style={styles.segTrack}>
          {(["members", "pending"] as const).map((k) => {
            const on = tab === k;
            const count = k === "members" ? activeMembers.length : pendingCount;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                style={[styles.segTab, on && styles.segTabOn]}
              >
                <Text style={[styles.segTabText, on && styles.segTabTextOn]}>
                  {k === "members" ? "People" : "Invites"}
                </Text>
                <View style={[styles.tabBadge, on && styles.tabBadgeOn]}>
                  <Text style={[styles.tabBadgeText, on && styles.tabBadgeTextOn]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.searchRow,
          desktopMetronic && styles.searchRowMetronic,
          embedded && styles.searchRowEmbedded,
        ]}
      >
        <Search size={15} color={Theme.textSecondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, phone, or email…"
          placeholderTextColor={Theme.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {canManage && !managerDepartment && tab === "members" && activeMembers.length > 1 ? (
          <Pressable
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            style={({ pressed }) => [
              styles.bulkToggleBtn,
              selectMode && styles.bulkToggleBtnOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={selectMode ? "Exit multi-select" : "Select multiple members"}
          >
            {selectMode ? (
              <X size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
            ) : (
              <CheckSquare size={12} color={Theme.primary} strokeWidth={2.2} />
            )}
            <Text
              style={[
                styles.bulkToggleText,
                selectMode && styles.bulkToggleTextOn,
              ]}
            >
              {selectMode ? "Done" : "Select"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {tab === "members" ? (
        displayList.length === 0 ? (
          <EmptyMembers onInvite={canManage ? onInvite : undefined} />
        ) : (
          <View style={[styles.grid, embedded && styles.gridEmbedded]}>
            {memberRows.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.gridRow}>
                {row.map((m) => (
                  <View key={m.id} style={styles.gridCell}>
                    {actionId === m.id ? (
                      <View style={[styles.gridCell, styles.busyCard]}>
                        <LoadingIndicator color={Theme.loaderAccent} />
                      </View>
                    ) : (
                      <MemberCard
                        member={m}
                        isCurrentUser={m.user_id === currentUserId}
                        canManage={canManage}
                        onEdit={handleEditMember}
                        selectable={selectMode}
                        selected={selectedIds.includes(m.id)}
                        onToggleSelect={handleToggleSelect}
                      />
                    )}
                  </View>
                ))}
                {row.length < numColumns
                  ? Array.from({ length: numColumns - row.length }).map((_, i) => (
                      <View key={`spacer-${ri}-${i}`} style={styles.gridCell} />
                    ))
                  : null}
              </View>
            ))}
          </View>
        )
      ) : pendingItems.length === 0 ? (
        <EmptyPending onInvite={canManage ? onInvite : undefined} />
      ) : (
        <View style={[styles.grid, embedded && styles.gridEmbedded]}>
          {pendingRows.map((row, ri) => (
            <View key={`pending-row-${ri}`} style={styles.gridRow}>
              {row.map((item) => (
                <View
                  key={item.kind === "phone" ? item.invite.id : item.member.id}
                  style={styles.gridCell}
                >
                  {actionId === (item.kind === "phone" ? item.invite.id : item.member.id) ? (
                    <View style={[styles.gridCell, styles.busyCard]}>
                      <LoadingIndicator color={Theme.loaderAccent} />
                    </View>
                  ) : item.kind === "phone" ? (
                    <PendingPhoneInviteCard
                      invite={item.invite}
                      canManage={canManage}
                      onCancel={handleCancelPhoneInvite}
                    />
                  ) : (
                    <MemberCard
                      member={item.member}
                      isCurrentUser={item.member.user_id === currentUserId}
                      canManage={canManage}
                      onEdit={handleEditMember}
                    />
                  )}
                </View>
              ))}
              {row.length < numColumns
                ? Array.from({ length: numColumns - row.length }).map((_, i) => (
                    <View key={`pending-spacer-${ri}-${i}`} style={styles.gridCell} />
                  ))
                : null}
            </View>
          ))}
        </View>
      )}

    </>
  );

  const bulkBar =
    selectMode && selectedIds.length > 1 ? (
      <View style={styles.bulkBar}>
        {rolePickerOpen ? (
          <View style={styles.rolePicker}>
            <Text style={styles.rolePickerTitle}>
              Apply to {selectedIds.length} members
            </Text>
            <View style={styles.rolePickerRow}>
              {TEAM_INVITE_ROLE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleBulkAssignRole(option.value)}
                  disabled={bulkBusy}
                  style={({ pressed }) => [
                    styles.rolePickerChip,
                    pressed && { opacity: 0.85 },
                    bulkBusy && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.rolePickerChipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.bulkBarMain}>
          <Text style={styles.bulkBarCount}>
            {selectedIds.length} selected
          </Text>
          <View style={styles.bulkBarActions}>
            <Pressable
              onPress={exitSelectMode}
              disabled={bulkBusy}
              style={({ pressed }) => [
                styles.bulkClearBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
            >
              <Text style={styles.bulkClearBtnText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => setRolePickerOpen((o) => !o)}
              disabled={bulkBusy}
              style={({ pressed }) => [
                styles.bulkPrimaryBtn,
                pressed && { opacity: 0.88 },
                bulkBusy && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Change role for selected members"
            >
              {bulkBusy ? (
                <LoadingIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <>
                  <Shield size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  <Text style={styles.bulkPrimaryBtnText}>Change role</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    ) : null;

  if (embedded) {
    return (
      <View style={styles.embeddedRoot}>
        {body}
        {bulkBar}
      </View>
    );
  }

  return (
    <View style={styles.scroll}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          bulkBar ? styles.contentWithBulkBar : null,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.loaderAccent} />
        }
      >
        {body}
      </ScrollView>
      {bulkBar}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  hero: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  heroEmbedded: {
    marginHorizontal: 20,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  heroKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.brandBlueInk,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: Theme.textPrimaryDark,
  },
  heroSub: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
    fontWeight: "500",
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  heroStat: {
    alignItems: "center",
    minWidth: 44,
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.brandBlueInk,
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Theme.brandBlue,
  },
  segRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  segTrack: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
  },
  segTabOn: {
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.brandBlueInk,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  segTabTextOn: {
    color: Theme.textPrimaryDark,
    fontWeight: "800",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeOn: { backgroundColor: Theme.accentGold },
  tabBadgeText: { fontSize: 9, fontWeight: "700", color: Theme.textSecondary },
  tabBadgeTextOn: { color: Theme.textOnPrimary },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
  },

  grid: { paddingHorizontal: 14, gap: 10 },
  gridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
    ...Platform.select({
      web: {
        display: "flex" as const,
        flexDirection: "column" as const,
        alignSelf: "stretch" as const,
      },
    }),
  },
  busyCard: {
    backgroundColor: Theme.surface,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textSecondary, marginTop: 4 },
  emptySub: { fontSize: 12, color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
  emptyInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  emptyInviteBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    paddingBottom: 4,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  statText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },

  embeddedRoot: {
    width: "100%",
  },
  contentWithBulkBar: { paddingBottom: 120 },

  bulkToggleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  bulkToggleRowEmbedded: { paddingHorizontal: 20 },
  bulkToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  bulkToggleBtnOn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  bulkToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  bulkToggleTextOn: { color: Theme.textOnPrimary },

  bulkBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: "hidden",
  },
  bulkBarMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bulkBarCount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  bulkBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  bulkClearBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  bulkPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 112,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
  },
  bulkPrimaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  rolePicker: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  rolePickerTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  rolePickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 8,
  },
  rolePickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  rolePickerChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tabRowMetronic: {
    gap: 24,
    paddingHorizontal: 20,
    borderBottomColor: "#EFF2F5",
  },
  tabRowEmbedded: {
    marginBottom: 10,
  },
  tabMetronic: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  tabOnMetronic: {
    borderBottomColor: Theme.primary,
  },
  tabTextMetronic: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A1A5B7",
    letterSpacing: 0,
  },
  tabTextOnMetronic: {
    color: "#181C32",
    fontWeight: "600",
  },
  searchRowMetronic: {
    marginHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: "#FAFBFC",
  },
  searchRowEmbedded: {
    marginBottom: 16,
  },
  gridEmbedded: {
    paddingHorizontal: 20,
  },
  statsRowEmbedded: {
    paddingHorizontal: 20,
    marginTop: 16,
    paddingBottom: 16,
  },
});
