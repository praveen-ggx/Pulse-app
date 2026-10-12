/**
 * Team tab — org members & invites (moved from workspace).
 */
import Theme from "@/constants/Theme";
import { InviteMemberFlow } from "@/features/organization/components/InviteMemberModal";
import { MemberPermissionsPanel } from "@/features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import { useMemberAccess } from "@/lib/useMemberAccess";
import type { OrgMember } from "@/types/organization";
import { ShieldCheck, UserPlus2, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type Props = {
  orgId: string;
  orgName: string;
  currentUserId: string | null;
  canManage: boolean;
};

export function NetworkDesktopTeamPanel({
  orgId,
  orgName,
  currentUserId,
  canManage,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const { isOwner, isAdmin } = useOrgRole();
  const { can: canSurface } = useMemberAccess();
  // Invite RPCs accept owner/admin only — never show a button that fails.
  const canInvite = canManage && (isOwner || isAdmin) && canSurface("team.invite");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [focusPending, setFocusPending] = useState(false);
  const invalidate = useInvalidateOrgMembers(orgId);

  const openAccessControl = () => {
    setInviteOpen(false);
    setAccessOpen(true);
  };

  const openInvite = () => {
    setFocusPending(false);
    setAccessOpen(false);
    setInviteOpen(true);
  };
  const closeInvite = () => setInviteOpen(false);
  const closeAccess = () => setAccessOpen(false);

  const handleInvited = () => {
    invalidate();
    setFocusPending(true);
    setInviteOpen(false);
  };

  if (editMemberId) {
    return (
      <View style={[styles.panel, layout.panel]}>
        <MemberPermissionsPanel
          memberId={editMemberId}
          onBack={() => setEditMemberId(null)}
          embedded
        />
      </View>
    );
  }

  return (
    <View style={[styles.panel, layout.panel]}>
      <View style={[styles.sectionToolbar, layout.sectionToolbar]}>
        <View style={styles.teamPanelTitleCol}>
          <Text style={[styles.sectionTitle, layout.sectionTitle]}>
            {accessOpen ? "Access control" : "Team members"}
          </Text>
          <Text style={[styles.sectionSub, layout.sectionSub]}>
            {inviteOpen
              ? "Add employees by name and phone — they can join even without a Pulse account yet"
              : `Manage who can access ${orgName || "your organization"}`}
          </Text>
        </View>
        {canManage ? (
          inviteOpen || accessOpen ? (
            <Pressable
              onPress={inviteOpen ? closeInvite : closeAccess}
              style={({ pressed }) => [
                styles.teamInviteCancelBtn,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={inviteOpen ? "Cancel invite" : "Back to team members"}
            >
              <X size={15} color={METRONIC.text} strokeWidth={2.3} />
              <Text style={styles.teamInviteCancelBtnText}>
                {inviteOpen ? "Cancel" : "Done"}
              </Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isOwner ? (
                <Pressable
                  onPress={openAccessControl}
                  style={({ pressed }) => [
                    styles.teamInviteCancelBtn,
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open access control"
                >
                  <ShieldCheck size={15} color={METRONIC.text} strokeWidth={2.3} />
                  <Text style={styles.teamInviteCancelBtnText}>Access</Text>
                </Pressable>
              ) : null}
              {canInvite ? (
                <Pressable
                  onPress={openInvite}
                  style={({ pressed }) => [
                    styles.teamInviteBtn,
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Invite team member"
                >
                  <UserPlus2 size={15} color={Theme.textOnPrimary} strokeWidth={2.3} />
                  <Text style={styles.teamInviteBtnText}>Invite member</Text>
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}
      </View>

      <View style={[styles.salesCard, styles.teamPanelCard]}>
        {inviteOpen && canInvite ? (
          <InviteMemberFlow
            orgId={orgId}
            layout="embedded"
            onClose={closeInvite}
            onInvited={handleInvited}
          />
        ) : (
          <TeamMembersView
            orgId={orgId}
            currentUserId={currentUserId}
            canManage={accessOpen ? isOwner : canManage}
            onInvite={canInvite ? openInvite : undefined}
            onEditMember={(member: OrgMember) => setEditMemberId(member.id)}
            initialSubTab={focusPending ? "pending" : undefined}
            embedded
            desktopMetronic
          />
        )}
      </View>
    </View>
  );
}
