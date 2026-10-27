/**
 * Per-member access editor — two-column Webild-inspired layout.
 * Left: member identity + remove / transfer. Right: role presets + domains.
 * Opens directly from team Edit (replaces MemberEditModal).
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { confirmDialog } from "@/lib/confirmDialog";
import { MemberAccessEditor } from "@/features/organization/components/MemberPermissionsPanel/MemberAccessEditor";
import {
  accessSnapshotFromMember,
  accessSnapshotFromRole,
  accessSnapshotsEqual,
  useMemberAccessDraft,
  type MemberAccessSnapshot,
} from "@/features/organization/hooks/useMemberAccessDraft";
import {
  cancelTeamInvite,
  looksLikeNotDepartmentManagerError,
  looksLikeNotOwnerError,
  looksLikeTransferTargetError,
  removeMember,
  transferOwnership,
  updateMemberPermissions,
  updateMemberSurfacesAsManager,
} from "@/features/organization/services/members.service";
import {
  getMemberWarehouseIds,
  setMemberWarehouseIds,
} from "@/features/organization/services/memberWarehouses.service";
import {
  buildMemberPermissions,
  memberDisplayRoleLabel,
  platformRoleFromMember,
  type TeamInvitePermissions,
} from "@/features/organization/utils/teamInviteRoles.util";
import { normalizeSurfaces } from "@/lib/memberSurfaces";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateOrgMembers, useOrgMembersQuery } from "@/lib/queries/useOrgMembersQuery";
import { useOrgCapabilities } from "@/lib/useCapabilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRightLeft, ChevronLeft, Lock, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  memberId: string;
  onBack: () => void;
  /** Skip extra safe-area padding when nested in the workspace sidebar. */
  embedded?: boolean;
};

function formatJoined(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function MemberPermissionsPanel({ memberId, onBack, embedded = false }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const twoCol = !embedded && width >= 900;
  const widePresets = !embedded && width >= 1100;
  const { currentOrganization } = useOrganization();
  const { refresh: refreshWorkspace } = useActiveWorkspace();
  const { isOwner } = useOrgRole();
  const { user } = useAuth();
  const orgCaps = useOrgCapabilities();
  const orgId = currentOrganization?.id ?? null;
  const { data: roster, isLoading, refetch } = useOrgMembersQuery(orgId);
  const invalidate = useInvalidateOrgMembers(orgId);

  const member = useMemo(() => {
    return (roster?.members ?? []).find((m) => m.id === memberId) ?? null;
  }, [roster, memberId]);

  const viewer = useMemo(() => {
    if (!user?.uid) return null;
    return (roster?.members ?? []).find((m) => m.user_id === user.uid) ?? null;
  }, [roster, user?.uid]);

  const viewerIsDepartmentManager = useMemo(() => {
    const perms = viewer?.permissions as TeamInvitePermissions | null | undefined;
    return perms?.isDepartmentManager === true;
  }, [viewer]);

  const viewerDepartment = useMemo(() => {
    const perms = viewer?.permissions as TeamInvitePermissions | null | undefined;
    return perms?.platformRole ?? null;
  }, [viewer]);

  const targetDepartment = member ? platformRoleFromMember(member) : null;

  // A department manager can only edit surfaces for a member in their own
  // department, never role/domains/the manager flag, and never an owner/admin.
  // The owner keeps full edit rights regardless of department.
  const canEditAsManager =
    !isOwner &&
    viewerIsDepartmentManager &&
    !!member &&
    member.id !== viewer?.id &&
    member.role !== "owner" &&
    member.role !== "admin" &&
    viewerDepartment !== null &&
    targetDepartment === viewerDepartment;

  const draft = useMemberAccessDraft(accessSnapshotFromRole("tripops", orgCaps), orgCaps);
  const { reset: resetDraft } = draft;
  const [baseline, setBaseline] = useState<MemberAccessSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const memberWarehouses = useQuery({
    queryKey: ["member-warehouses", member?.id ?? null],
    enabled: !!member,
    queryFn: async () => {
      const { error: whError, warehouseIds } = await getMemberWarehouseIds(member!.id);
      if (whError) throw whError;
      return warehouseIds;
    },
  });

  useEffect(() => {
    if (!member || memberWarehouses.isLoading) return;
    const next = accessSnapshotFromMember(member, orgCaps, memberWarehouses.data ?? []);
    resetDraft(next);
    setBaseline(next);
    setError(null);
  }, [member, orgCaps, resetDraft, memberWarehouses.data, memberWarehouses.isLoading]);

  const canEdit = (isOwner && member?.role !== "owner") || canEditAsManager;
  // A manager may only ever change surface toggles, never the role/domain preset.
  const canEditRolePreset = isOwner && member?.role !== "owner";
  const canTransfer =
    isOwner && !!member && member.status === "active" && member.role !== "owner";
  const dirty = !!baseline && !accessSnapshotsEqual(draft.snapshot, baseline);
  const busy = saving || actionBusy;

  const handleSave = useCallback(async () => {
    if (!member || !canEdit || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      if (canEditAsManager) {
        // Manager path: surfaces only, via the department-scoped RPC.
        const { error: saveError } = await updateMemberSurfacesAsManager(
          member.id,
          normalizeSurfaces(draft.surfaces, orgCaps),
        );
        if (saveError) {
          setError(
            looksLikeNotDepartmentManagerError(saveError.message)
              ? "You can only edit permissions for members in your own department."
              : saveError.message,
          );
          return;
        }
      } else {
        const { error: saveError } = await updateMemberPermissions(
          member.id,
          buildMemberPermissions({
            platformRole: draft.platformRole,
            surfaces: draft.surfaces,
            isDepartmentManager: draft.isDepartmentManager,
            orgCaps,
          }),
        );
        if (saveError) {
          setError(
            looksLikeNotOwnerError(saveError.message)
              ? "Only the organization owner can change member access."
              : saveError.message,
          );
          return;
        }
        // Warehouses only scope Ground Ops; any other role keeps none.
        const { error: whError } = await setMemberWarehouseIds(
          member.id,
          draft.platformRole === "ground_ops" ? draft.warehouseIds : [],
        );
        if (whError) {
          setError(`Access saved, but warehouses didn't: ${whError.message}`);
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["member-warehouses", member.id] });
        void queryClient.invalidateQueries({ queryKey: ["member-warehouse-count"] });
      }
      invalidate();
      await Promise.all([refetch(), refreshWorkspace()]);
      onBack();
    } finally {
      setSaving(false);
    }
  }, [
    member,
    canEdit,
    canEditAsManager,
    dirty,
    draft.surfaces,
    draft.platformRole,
    draft.isDepartmentManager,
    draft.warehouseIds,
    orgCaps,
    queryClient,
    invalidate,
    refetch,
    refreshWorkspace,
    onBack,
  ]);

  const handleRemove = useCallback(() => {
    if (!member || !canEdit) return;
    const displayName =
      member.full_name || member.phone || member.email || "this member";
    const isPending = member.status === "pending";
    void (async () => {
      const confirmed = await confirmDialog({
        title: isPending ? "Cancel invitation?" : "Remove from team?",
        message: isPending
          ? `Cancel the invite sent to ${displayName}?`
          : `Remove ${displayName} from your team? They will lose access immediately.`,
        confirmLabel: isPending ? "Cancel invite" : "Remove",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) return;
      setActionBusy(true);
      try {
        const { error: remErr } = isPending
          ? await cancelTeamInvite(member.id)
          : await removeMember(member.id);
        if (remErr) {
          setError(remErr.message);
          return;
        }
        invalidate();
        await refetch();
        onBack();
      } finally {
        setActionBusy(false);
      }
    })();
  }, [member, canEdit, invalidate, refetch, onBack]);

  const handleTransfer = useCallback(() => {
    if (!member || !canTransfer || !orgId) return;
    const name =
      member.full_name || member.phone || member.email || "this member";
    void (async () => {
      const confirmed = await confirmDialog({
        title: "Transfer ownership?",
        message: `${name} will become the owner and you'll become an admin. You can't undo this yourself.`,
        confirmLabel: "Transfer",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) return;
      setActionBusy(true);
      try {
        const { error: xferErr } = await transferOwnership(orgId, member.user_id);
        if (xferErr) {
          setError(
            looksLikeTransferTargetError(xferErr.message)
              ? "The chosen person must be an active member of this workspace."
              : xferErr.message,
          );
          return;
        }
        await refreshWorkspace();
        invalidate();
        await refetch();
        onBack();
      } finally {
        setActionBusy(false);
      }
    })();
  }, [member, canTransfer, orgId, refreshWorkspace, invalidate, refetch, onBack]);

  if (isLoading && !member) {
    return <CenteredLoadingView />;
  }

  if (!member) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={onBack} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Member not found</Text>
          <Text style={styles.emptyBody}>
            They may have been removed. Go back and refresh the roster.
          </Text>
        </View>
      </View>
    );
  }

  const displayName =
    member.full_name || member.phone || member.email || "Team member";

  const leftPane = (
    <View style={[styles.leftPane, twoCol && styles.leftPaneFixed]}>
      <View style={styles.identityCard}>
        <LinearGradient
          colors={["#0894FF", "#C959DD", "#FF2E54", "#FF9004"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.heroStripe}
        />
        <View style={styles.identityBody}>
          <PartyAvatar
            name={displayName}
            avatarUrl={member.avatar_url ?? null}
            entityType="client"
            size={52}
          />
          <Text style={styles.identityName} numberOfLines={2}>
            {displayName}
          </Text>
          {member.email ? (
            <Text style={styles.identityLine} numberOfLines={1}>
              {member.email}
            </Text>
          ) : null}
          <Text style={styles.identityLine} numberOfLines={1}>
            {member.phone?.trim() || "No phone on their account"}
          </Text>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {memberDisplayRoleLabel(member)}
              </Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {member.status === "pending" ? "Pending" : "Active"}
              </Text>
            </View>
          </View>
          {member.joined_at ? (
            <Text style={styles.joinedText}>
              Joined {formatJoined(member.joined_at)}
            </Text>
          ) : null}
        </View>
      </View>

      {!canEdit ? (
        <View style={styles.lockNote}>
          <Lock size={13} color="#737373" strokeWidth={2} />
          <Text style={styles.lockText}>
            {member.role === "owner"
              ? "Owner access can’t be narrowed here — transfer ownership first."
              : "Only the organization owner can edit member access."}
          </Text>
        </View>
      ) : (
        <View style={styles.actionsStack}>
          {canTransfer ? (
            <Pressable
              onPress={handleTransfer}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionRow,
                styles.transferRow,
                pressed && !busy && { opacity: 0.88 },
                busy && { opacity: 0.5 },
              ]}
            >
              <View style={styles.actionIcon}>
                <ArrowRightLeft size={14} color="#B45309" strokeWidth={2.2} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.transferTitle}>Transfer ownership</Text>
                <Text style={styles.actionDesc}>
                  Make them owner — you become admin.
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleRemove}
            disabled={busy}
            style={({ pressed }) => [
              styles.actionRow,
              styles.removeRow,
              pressed && !busy && { opacity: 0.88 },
              busy && { opacity: 0.5 },
            ]}
          >
            <View style={styles.actionIcon}>
              <Trash2 size={14} color="#FF2E54" strokeWidth={2.2} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.removeTitle}>
                {member.status === "pending" ? "Cancel invite" : "Remove member"}
              </Text>
              <Text style={styles.actionDesc}>
                {member.status === "pending"
                  ? "Withdraw this invitation."
                  : "They lose workspace access immediately."}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  const rightPane = (
    <View style={styles.rightPane}>
      <MemberAccessEditor
        draft={draft}
        orgId={orgId}
        orgCaps={orgCaps}
        canEditRole={canEditRolePreset}
        canEditSurfaces={canEdit}
        canAssignManager={canEditRolePreset}
        busy={busy}
        wide={widePresets}
        onError={setError}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: embedded ? 0 : insets.top }}>
        <Header onBack={onBack} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (canEdit ? 88 : 24) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.columns, twoCol && styles.columnsWide]}>
          {leftPane}
          {rightPane}
        </View>
      </ScrollView>

      {canEdit ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.footerInner}>
            <Pressable
              onPress={onBack}
              disabled={busy}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={busy || !dirty}
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && dirty && { opacity: 0.9 },
                (busy || !dirty) && styles.saveBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save access changes"
            >
              {saving ? (
                <LoadingIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ChevronLeft size={18} color="#171717" strokeWidth={2.4} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Member access</Text>
        <Text style={styles.headerSub}>Permissions & domains</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: "#F3F3F3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "flex-start",
    gap: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A3A3A3",
    letterSpacing: -0.1,
  },
  headerSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  columns: {
    flexDirection: "column",
    gap: 16,
    alignItems: "stretch",
    width: "100%",
  },
  columnsWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },

  leftPane: {
    gap: 10,
    width: "100%",
  },
  leftPaneFixed: {
    width: 260,
    flexShrink: 0,
    ...(Platform.OS === "web" ? ({ position: "sticky", top: 8 } as object) : null),
  },
  rightPane: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    gap: 8,
  },

  identityCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
  },
  heroStripe: {
    height: 3,
    width: "100%",
  },
  identityBody: {
    padding: 14,
    alignItems: "flex-start",
    gap: 4,
  },
  identityName: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.5,
  },
  identityLine: {
    fontSize: 13,
    color: "#737373",
    letterSpacing: -0.1,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tag: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#525252",
    letterSpacing: -0.1,
  },
  joinedText: {
    marginTop: 8,
    fontSize: 11,
    color: "#A3A3A3",
    letterSpacing: -0.1,
  },

  lockNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F3F3F3",
    borderRadius: 14,
    padding: 12,
  },
  lockText: {
    flex: 1,
    fontSize: 12,
    color: "#737373",
    lineHeight: 17,
    letterSpacing: -0.1,
  },

  actionsStack: { gap: 8 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  transferRow: {
    borderColor: "#F5D0A9",
    backgroundColor: "#FFF7ED",
  },
  removeRow: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCopy: { flex: 1, minWidth: 0, gap: 2 },
  transferTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B45309",
    letterSpacing: -0.2,
  },
  removeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF2E54",
    letterSpacing: -0.2,
  },
  actionDesc: {
    fontSize: 11,
    color: "#737373",
    lineHeight: 15,
  },





  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0F0F0",
  },
  footerInner: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F3F3F3",
    minHeight: 44,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.2,
  },
  saveBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#171717",
    minHeight: 44,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontSize: 13,
    color: "#737373",
    textAlign: "center",
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: "rgba(255,46,84,0.08)",
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#FF2E54",
    fontWeight: "600",
  },
});
