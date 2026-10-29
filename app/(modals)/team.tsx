/**
 * Team management screen — list active and invited members, invite new ones.
 */
import Theme from "@/constants/Theme";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ROUTES } from "@/lib/routes";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useViewerManagerDepartment } from "@/lib/queries/useOrgMembersQuery";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Users,
  UserPlus2,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const { can: canSurface } = useMemberAccess();
  const { isOwner, isAdmin } = useOrgRole();

  const orgId = currentOrganization?.id ?? null;
  const managerDepartment = useViewerManagerDepartment(orgId, user?.uid ?? null);

  // team_manage is not emitted by getCapabilitiesFromProfile (it comes from org membership role).
  // Show invite/manage controls to all non-driver org users; backend RLS handles authorization.
  const canManage = profile?.role !== "driver";
  // Invite RPCs accept owner/admin only — never show a button that fails.
  const canInvite = canManage && (isOwner || isAdmin) && canSurface("team.invite");

  const handleInvite = () => {
    router.push(ROUTES.MODALS.INVITE_MEMBER as Parameters<typeof router.push>[0]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(ROUTES.TABS.PROFILE as Parameters<typeof router.replace>[0]);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIconWrap}>
            <Users size={16} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <Text style={styles.headerTitle}>Team Members</Text>
          {currentOrganization?.name ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {currentOrganization.name}
            </Text>
          ) : null}
        </View>
        {canInvite ? (
          <Pressable
            onPress={handleInvite}
            style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.8 }]}
          >
            <UserPlus2 size={16} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </Pressable>
        ) : (
          <View style={styles.inviteBtnPlaceholder} />
        )}
      </View>

      {/* No org guard */}
      {!orgId ? (
        <View style={styles.centered}>
          <Users size={36} color={Theme.textSection} strokeWidth={1.5} />
          <Text style={styles.noOrgText}>No organization loaded</Text>
          <Text style={styles.noOrgSub}>Sign out and sign in again to refresh.</Text>
        </View>
      ) : (
        <TeamMembersView
          orgId={orgId}
          currentUserId={user?.uid ?? null}
          canManage={canManage}
          onInvite={canInvite ? handleInvite : undefined}
          managerDepartment={managerDepartment}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(79,70,229,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0.1,
  },
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
  inviteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  inviteBtnPlaceholder: { width: 38 },

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
  noOrgSub: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
  },
});
