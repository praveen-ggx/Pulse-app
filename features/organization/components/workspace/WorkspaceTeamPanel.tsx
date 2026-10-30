import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InviteMemberFlow } from "@/features/organization/components/InviteMemberModal";
import { MemberPermissionsPanel } from "@/features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import {
  useInvalidateOrgMembers,
  useViewerManagerDepartment,
} from "@/lib/queries/useOrgMembersQuery";
import { useMemberAccess } from "@/lib/useMemberAccess";
import type { OrgMember } from "@/types/organization";
import { ShieldCheck, UserPlus2, Users } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type RosterView = "roster" | "access";
type TeamView = RosterView | "invite";

type Props = {
  onBack: () => void;
};

export function WorkspaceTeamPanel({ onBack }: Props) {
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const { isOwner, isAdmin } = useOrgRole();
  const { can: canSurface } = useMemberAccess();
  const orgId = currentOrganization?.id ?? null;
  const canManage = profile?.role !== "driver";
  // Invite RPCs accept owner/admin only — never show a button that fails.
  const canInvite = canManage && (isOwner || isAdmin) && canSurface("team.invite");
  const invalidate = useInvalidateOrgMembers(orgId);
  const managerDepartment = useViewerManagerDepartment(orgId, user?.uid ?? null);

  const [view, setView] = useState<TeamView>("roster");
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [focusPending, setFocusPending] = useState(false);
  const rosterBeforeInvite = useRef<RosterView>("roster");

  const openInvite = () => {
    rosterBeforeInvite.current = view === "access" ? "access" : "roster";
    setFocusPending(false);
    setView("invite");
  };

  const closeInvite = () => setView(rosterBeforeInvite.current);

  const handleInvited = () => {
    invalidate();
    setFocusPending(true);
    closeInvite();
  };

  const handleChromeBack = () => {
    if (view === "invite") {
      closeInvite();
      return;
    }
    if (view === "access") {
      setView("roster");
      return;
    }
    onBack();
  };

  if (editMemberId) {
    return (
      <MemberPermissionsPanel
        memberId={editMemberId}
        onBack={() => setEditMemberId(null)}
        embedded
      />
    );
  }

  const title =
    view === "invite"
      ? "Invite member"
      : view === "access"
        ? "Access control"
        : WORKSPACE_PANEL_TITLES.team;

  const subtitle =
    view === "invite"
      ? "Add by name and phone"
      : currentOrganization?.name ?? "Organisation";

  return (
    <WorkspaceDetailLayout
      title={title}
      subtitle={subtitle}
      onBack={handleChromeBack}
      fillBody
      contentMaxWidth={1080}
      rightSlot={
        view === "invite" || !canManage ? (
          <View style={styles.invitePlaceholder} />
        ) : (
          <View style={styles.rightSlot}>
            {isOwner && view === "roster" ? (
              <Pressable
                onPress={() => setView("access")}
                style={({ pressed }) => [styles.accessBtn, pressed && { opacity: 0.85 }]}
              >
                <ShieldCheck size={16} color={Theme.primary} strokeWidth={2.4} />
                <Text style={styles.accessBtnText}>Access</Text>
              </Pressable>
            ) : null}
            {canInvite ? (
              <Pressable
                onPress={openInvite}
                style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.85 }]}
              >
                <UserPlus2 size={16} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
                <Text style={styles.inviteBtnText}>Invite</Text>
              </Pressable>
            ) : null}
          </View>
        )
      }
    >
      {!orgId ? (
        <View style={styles.centered}>
          <Users size={36} color={Theme.textSection} strokeWidth={1.5} />
          <Text style={styles.noOrgText}>No organization loaded</Text>
        </View>
      ) : view === "invite" && canInvite ? (
        <InviteMemberFlow
          orgId={orgId}
          layout="embedded"
          onClose={closeInvite}
          onInvited={handleInvited}
        />
      ) : (
        <TeamMembersView
          orgId={orgId}
          currentUserId={user?.uid ?? null}
          canManage={view === "access" ? isOwner : canManage}
          onInvite={canInvite ? openInvite : undefined}
          onEditMember={(member: OrgMember) => setEditMemberId(member.id)}
          initialSubTab={focusPending ? "pending" : undefined}
          managerDepartment={managerDepartment}
        />
      )}
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  inviteBtnText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
  invitePlaceholder: { width: 72 },
  rightSlot: { flexDirection: "row", alignItems: "center", gap: 8 },
  accessBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  accessBtnText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  noOrgText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 8,
  },
});
