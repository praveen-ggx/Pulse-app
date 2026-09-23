/**
 * Workspace hub — left pane of the master/detail workspace shell.
 *
 * IA: My Account (ME) · Organization · Workspace settings · Operations · Products.
 * Language / Region live on My Account. Verification opens the existing KYC flow.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  HUB_HEADER_GRADIENT,
  HUB_MENU_ICON,
  HUB_MENU_ICON_SIZE,
  HUB_MENU_ICON_STROKE,
  HUB_PURPLE,
  HUB_ROW_CHEVRON_SIZE,
  hubStyles,
} from "@/components/profile/workspaceHubMenu.styles";
import { LinearGradient } from "expo-linear-gradient";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { WorkspaceLanguagePanel } from "@/features/organization/components/workspace/WorkspaceLanguagePanel";
import { WorkspaceRegionPanel } from "@/features/organization/components/workspace/WorkspaceRegionPanel";
import type {
  OrgHubSection,
  WorkspaceHubInlinePanelId,
  WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { DEFAULT_DISPATCHER_ROUTE, ROUTES } from "@/lib/routes";
import { canAccessPartyKind } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import type { MemberSurfaceId } from "@/lib/memberSurfaces";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useActiveExpoProductShell } from "@/features/product-shell/PulseProductShell";
import {
  useSetWorkspaceProductStatusMutation,
  useWorkspaceProductsQuery,
} from "@/lib/queries/useWorkspaceProductsQuery";
import { confirmAction } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { useRouter } from "expo-router";
import {
  Building2,
  Car,
  ChevronRight,
  HelpCircle,
  Landmark,
  Lock,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  ScanLine,
  Truck,
  User,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function hubLucideIcon(Icon: typeof Shield) {
  return (
    <Icon
      size={HUB_MENU_ICON_SIZE}
      color={HUB_MENU_ICON}
      strokeWidth={HUB_MENU_ICON_STROKE}
    />
  );
}

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
  return ((words[0]![0] ?? "") + (words[words.length - 1]![0] ?? "")).toUpperCase();
}

type HubRow = {
  id: string;
  label: string;
  icon: React.ReactNode;
  panelId?: WorkspacePanelId;
  orgSection?: OrgHubSection;
  route?: string;
  valuePill?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  locked?: boolean;
  toggle?: {
    value: boolean;
    disabled?: boolean;
    onValueChange: (next: boolean) => void;
    accessibilityLabel: string;
  };
};

type Props = {
  activePanel: WorkspacePanelId | null;
  onSelectPanel: (panel: WorkspacePanelId) => void;
  onSelectOrgSection?: (section: OrgHubSection | null) => void;
  onExit?: () => void;
  inlinePanel?: WorkspaceHubInlinePanelId | null;
  onCloseInlinePanel?: () => void;
};

export function WorkspaceHubMenu({
  activePanel,
  onSelectPanel,
  onSelectOrgSection,
  onExit,
  inlinePanel = null,
  onCloseInlinePanel,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const { currentOrganization } = useOrganization();
  const { data: workspaceProducts = [] } = useWorkspaceProductsQuery();
  const { mutateAsync: setProductStatus, isPending: complianceSaving } =
    useSetWorkspaceProductStatusMutation();
  const complianceEnabled = workspaceProducts.some(
    (p) =>
      p.product_id === "pulse_compliance" &&
      (p.status === "active" || p.status === "trial"),
  );

  const handleComplianceToggle = useCallback(
    (next: boolean) => {
      void confirmAction(
        "Pulse Compliance",
        next
          ? "Enable the Compliance workflow for this workspace? This adds a Compliance tab for document verification and advance/balance settlement."
          : "Turn off the Compliance workflow for this workspace? The Compliance tab hides from nav — existing data stays intact.",
        next ? "Enable" : "Turn off",
      ).then((confirmed) => {
        if (!confirmed) return;
        void setProductStatus({
          productId: "pulse_compliance",
          status: next ? "active" : "inactive",
        });
      });
    },
    [setProductStatus],
  );

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const email = (user?.email ?? profile?.email ?? "").trim();
  const orgName = (currentOrganization?.name ?? profile?.company_name ?? "").trim();

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      if (!profile) {
        if (mounted) setAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted) setAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted) setAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolve();
    return () => {
      mounted = false;
    };
  }, [profile]);

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      const logoUrl = currentOrganization?.logo_url;
      if (!logoUrl?.trim()) {
        if (mounted) setOrgLogoUri(null);
        return;
      }
      if (logoUrl.startsWith("http")) {
        if (mounted) setOrgLogoUri(logoUrl);
        return;
      }
      const signed = await getSignedAvatarUrl(logoUrl.trim());
      if (mounted) setOrgLogoUri(signed);
    };
    void resolve();
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const openOrganization = () => {
    onSelectPanel("profile");
  };

  const openPulseCore = useCallback(() => {
    onExit?.();
    router.replace(DEFAULT_DISPATCHER_ROUTE as Parameters<typeof router.replace>[0]);
  }, [onExit, router]);

  /**
   * This drawer renders above every MemberDomainGate, so each row
   * needs its own surface check — otherwise a member with no access still
   * reaches org KYC, workspace settings and the Commerce app.
   * Operations rows below are already filtered via useCapabilities.
   */
  const organizationRows: HubRow[] = useMemo(() => {
    const rows: HubRow[] = [];
    if (canSurface("workspace.kyc")) {
      rows.push({
        id: "org-verification",
        label: "Verification",
        icon: hubLucideIcon(ShieldCheck),
        panelId: "kyc",
        orgSection: "verification",
      });
      rows.push({
        id: "org-identity",
        label: "Business identity",
        icon: hubLucideIcon(Shield),
        panelId: "kyc",
        orgSection: "details",
      });
    }
    if (canSurface("team.manage")) {
      rows.push({
        id: "org-team",
        label: "Team & access",
        icon: hubLucideIcon(Users),
        panelId: "team",
      });
    }
    return rows;
  }, [canSurface]);

  const workspaceRows: HubRow[] = useMemo(() => {
    if (!canSurface("workspace.settings")) return [];
    return [
      {
        id: "ws-settings",
        label: "Workspace settings",
        icon: hubLucideIcon(Settings),
        panelId: "settings",
      },
    ];
  }, [canSurface]);

  const activeShell = useActiveExpoProductShell();

  const productRows: HubRow[] = useMemo(() => {
    if (!canSurface("workspace.products")) return [];
    const rows: HubRow[] = [
      {
        id: "ws-scan",
        label: "Pulse Scan",
        icon: hubLucideIcon(ScanLine),
        locked: true,
        accessibilityLabel: "Pulse Scan, locked",
      },
    ];
    if (activeShell) {
      rows.push({
        id: "ws-core",
        label: "Pulse Core",
        icon: hubLucideIcon(Zap),
        onPress: openPulseCore,
        accessibilityLabel:
          "Pulse Core. Return to trips, customers, and day-to-day operations.",
      });
    }
    rows.push(
      {
        id: "ws-finance-pro",
        label: "Pulse Finance Pro",
        icon: hubLucideIcon(Landmark),
        locked: true,
        accessibilityLabel: "Pulse Finance Pro, locked",
      },
      {
        id: "ws-commerce",
        label: "Pulse Commerce",
        icon: hubLucideIcon(Store),
        locked: true,
        accessibilityLabel: "Pulse Commerce, locked",
      },
      {
        id: "ws-compliance",
        label: "Pulse Compliance",
        icon: hubLucideIcon(ShieldCheck),
        toggle: {
          value: complianceEnabled,
          disabled: complianceSaving,
          onValueChange: handleComplianceToggle,
          accessibilityLabel: complianceEnabled
            ? "Pulse Compliance, enabled. Double tap to turn off."
            : "Pulse Compliance, disabled. Double tap to enable.",
        },
      },
    );
    return rows;
  }, [
    activeShell,
    openPulseCore,
    canSurface,
    complianceEnabled,
    complianceSaving,
    handleComplianceToggle,
  ]);

  const partyRows: HubRow[] = useMemo(() => {
    const all: {
      kind: "customers" | "suppliers" | "drivers" | "vehicles";
      row: HubRow;
    }[] = [
      {
        kind: "customers",
        row: {
          id: "party-customers",
          label: "Customers",
          icon: hubLucideIcon(Building2),
          route: ROUTES.partyDirectory("customers"),
        },
      },
      {
        kind: "suppliers",
        row: {
          id: "party-suppliers",
          label: "Suppliers",
          icon: hubLucideIcon(Truck),
          route: ROUTES.partyDirectory("suppliers"),
        },
      },
      {
        kind: "drivers",
        row: {
          id: "party-drivers",
          label: "Drivers",
          icon: hubLucideIcon(User),
          route: ROUTES.partyDirectory("drivers"),
        },
      },
      {
        kind: "vehicles",
        row: {
          id: "party-vehicles",
          label: "Vehicles",
          icon: hubLucideIcon(Car),
          route: ROUTES.partyDirectory("vehicles"),
        },
      },
    ];
    const surfaceIdByKind: Record<typeof all[number]["kind"], MemberSurfaceId> = {
      customers: "sales.clients.view",
      suppliers: "sales.suppliers.view",
      drivers: "fleet.drivers.view",
      vehicles: "fleet.vehicles.view",
    };
    return all
      .filter(
        ({ kind }) =>
          canAccessPartyKind(capabilities, kind) &&
          canSurface(surfaceIdByKind[kind]),
      )
      .map(({ row }) => row);
  }, [capabilities, canSurface]);

  const navigate = (path: string) => {
    router.replace(path as Parameters<typeof router.replace>[0]);
  };

  const renderHubSection = (
    title: string,
    sectionRows: HubRow[],
    accentColor: string = HUB_PURPLE,
  ) =>
    // No permitted rows → drop the whole card, not an empty titled section.
    sectionRows.length === 0 ? null : (
    <View style={hubStyles.sectionCard}>
      <View style={hubStyles.sectionHeader}>
        <View style={[hubStyles.sectionAccent, { backgroundColor: accentColor }]} />
        <Text style={hubStyles.sectionTitle}>{title}</Text>
      </View>
      {sectionRows.map((row, idx) => {
        const selected = !!row.panelId && activePanel === row.panelId;
        const isFirst = idx === 0;
        const rowBody = (
          <>
            <View style={hubStyles.menuRowIconWell}>{row.icon}</View>
            <Text style={hubStyles.menuRowLabel} numberOfLines={1}>
              {row.label}
            </Text>
            {row.toggle ? (
              <Switch
                value={row.toggle.value}
                disabled={row.toggle.disabled}
                onValueChange={row.toggle.onValueChange}
                trackColor={{
                  false: Theme.borderMedium,
                  true: Theme.primary,
                }}
                thumbColor={Theme.surface}
                accessibilityLabel={row.toggle.accessibilityLabel}
              />
            ) : row.locked ? (
              <View style={hubStyles.menuRowChevronSlot}>
                <Lock
                  size={HUB_ROW_CHEVRON_SIZE}
                  color={Theme.textMuted}
                  strokeWidth={HUB_MENU_ICON_STROKE}
                />
              </View>
            ) : row.valuePill ? (
              <View style={hubStyles.valuePill}>
                <Text style={hubStyles.valuePillText} numberOfLines={1}>
                  {row.valuePill}
                </Text>
              </View>
            ) : (
              <View style={hubStyles.menuRowChevronSlot}>
                <ChevronRight
                  size={HUB_ROW_CHEVRON_SIZE}
                  color={selected ? HUB_PURPLE : HUB_MENU_ICON}
                  strokeWidth={HUB_MENU_ICON_STROKE}
                />
              </View>
            )}
          </>
        );
        if (row.locked) {
          return (
            <View
              key={row.id}
              style={[hubStyles.menuRow, isFirst && hubStyles.menuRowFirst, { opacity: 0.62 }]}
              accessibilityLabel={row.accessibilityLabel ?? row.label}
              accessibilityState={{ disabled: true }}
            >
              {rowBody}
            </View>
          );
        }
        if (row.toggle) {
          return (
            <View
              key={row.id}
              style={[hubStyles.menuRow, isFirst && hubStyles.menuRowFirst]}
              accessibilityLabel={row.toggle.accessibilityLabel}
              accessibilityRole="adjustable"
            >
              {rowBody}
            </View>
          );
        }
        return (
          <Pressable
            key={row.id}
            onPress={() => {
              if (row.onPress) {
                row.onPress();
                return;
              }
              if (row.orgSection && onSelectOrgSection) {
                onSelectOrgSection(row.orgSection);
                return;
              }
              if (row.panelId) {
                onSelectPanel(row.panelId);
                return;
              }
              if (row.route) {
                onExit?.();
                navigate(row.route);
              }
            }}
            style={({ pressed }) => [
              hubStyles.menuRow,
              isFirst && hubStyles.menuRowFirst,
              selected && hubStyles.menuRowSelected,
              pressed && !selected && hubStyles.menuRowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={row.accessibilityLabel ?? row.label}
            accessibilityState={{ selected }}
          >
            {rowBody}
          </Pressable>
        );
      })}
    </View>
  );

  const renderPartyGridSection = (
    title: string,
    sectionRows: HubRow[],
    accentColor: string = HUB_PURPLE,
  ) =>
    // No permitted rows → drop the whole card, not an empty titled section.
    sectionRows.length === 0 ? null : (
    <View style={hubStyles.sectionCard}>
      <View style={hubStyles.sectionHeader}>
        <View style={[hubStyles.sectionAccent, { backgroundColor: accentColor }]} />
        <Text style={hubStyles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={hubStyles.partyRowScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {sectionRows.map((row) => (
          <View key={row.id} style={hubStyles.partyRowCell}>
            <Pressable
              onPress={() => {
                if (row.panelId) {
                  onSelectPanel(row.panelId);
                  return;
                }
                if (row.route) {
                  onExit?.();
                  navigate(row.route);
                }
              }}
              style={({ pressed }) => [
                hubStyles.partyRowChip,
                pressed && hubStyles.partyRowChipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <View style={hubStyles.partyRowIconSlot}>{row.icon}</View>
              <Text style={hubStyles.partyGridLabel} numberOfLines={1}>
                {row.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <>
      <View style={hubStyles.root}>
        <View style={[hubStyles.headerBand, { paddingTop: insets.top + 14 }]}>
          <LinearGradient
            colors={[...HUB_HEADER_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={hubStyles.headerGradientFill}
          />
          <View style={hubStyles.headerSheen} pointerEvents="none" />
          <View style={hubStyles.headerVignette} pointerEvents="none" />
          <View style={hubStyles.headerBottomFade} pointerEvents="none" />
          <View style={hubStyles.headerBandRow}>
            <Pressable
              onPress={openOrganization}
              style={({ pressed }) => [
                hubStyles.headerLogoWrap,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View organization"
            >
              {orgLogoUri ? (
                <Image source={{ uri: orgLogoUri }} style={hubStyles.headerLogoImage} />
              ) : (
                <View style={hubStyles.headerLogoFallback}>
                  <Text style={hubStyles.headerLogoInitials}>
                    {orgInitials(orgName || "PULSE")}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={hubStyles.headerBandText}>
              <Text style={hubStyles.headerEyebrow}>WORKSPACE</Text>
              <Text style={hubStyles.headerTitle} numberOfLines={1}>
                {(orgName || "My Organisation").toUpperCase()}
              </Text>
            </View>
            {onExit ? (
              <Pressable
                onPress={onExit}
                style={({ pressed }) => [
                  hubStyles.closeBtn,
                  pressed && hubStyles.closeBtnPressed,
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close workspace"
              >
                <X size={14} color="#fff" strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={hubStyles.scroll}
          contentContainerStyle={hubStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={hubStyles.quickRow}>
            <Pressable
              style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => onSelectPanel("account")}
              accessibilityRole="button"
              accessibilityLabel="My account"
            >
              <View style={hubStyles.quickCircle}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={hubStyles.quickAvatar} />
                ) : (
                  <Text style={hubStyles.quickAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={hubStyles.quickLabel}>My Account</Text>
            </Pressable>
            {canSurface("workspace.settings") || canSurface("workspace.kyc") ? (
              <Pressable
                style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
                onPress={openOrganization}
                accessibilityRole="button"
                accessibilityLabel="Open organization"
              >
                <View style={hubStyles.quickCircle}>
                  {orgLogoUri ? (
                    <Image source={{ uri: orgLogoUri }} style={hubStyles.quickAvatar} />
                  ) : (
                    <Text style={hubStyles.quickAvatarInitials}>
                      {orgInitials(orgName || "PULSE")}
                    </Text>
                  )}
                </View>
                <Text style={hubStyles.quickLabel}>Organization</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => {
                onExit?.();
                navigate(ROUTES.support({ sourceScreen: "workspace_hub" }));
              }}
              accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <View style={hubStyles.quickCircle}>
                <HelpCircle
                  size={HUB_MENU_ICON_SIZE}
                  color={HUB_MENU_ICON}
                  strokeWidth={HUB_MENU_ICON_STROKE}
                />
              </View>
              <Text style={hubStyles.quickLabel}>Support</Text>
            </Pressable>
          </View>

          <View style={hubStyles.insightBanner}>
            <View style={hubStyles.insightIconWrap}>
              <Sparkles
                size={HUB_MENU_ICON_SIZE}
                color={HUB_MENU_ICON}
                strokeWidth={HUB_MENU_ICON_STROKE}
              />
            </View>
            <View style={hubStyles.insightTextWrap}>
              <Text style={hubStyles.insightTitle}>Pulse Business OS</Text>
              <Text style={hubStyles.insightBody} numberOfLines={2}>
                Activate finance, POD, fleet & AI modules — synced to your workspace.
              </Text>
            </View>
          </View>

          {renderHubSection("Organization", organizationRows, "#0f766e")}
          {renderHubSection("Workspace", workspaceRows, HUB_PURPLE)}
          {renderHubSection("Products", productRows, "#7c3aed")}
          {renderPartyGridSection("Operations", partyRows, Theme.driverEmerald)}
        </ScrollView>

        <View style={[hubStyles.footerWrap, { paddingBottom: insets.bottom + 10 }]}>
          <View style={hubStyles.footerDivider} />
          <View style={hubStyles.footerRow}>
            <Pressable
              onPress={() => onSelectPanel("account")}
              style={({ pressed }) => [hubStyles.footerIdentity, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Open my account"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={hubStyles.footerAvatar} />
              ) : (
                <View style={hubStyles.footerAvatarFallback}>
                  <Text style={hubStyles.footerAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={hubStyles.footerText}>
                <Text style={hubStyles.footerName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={hubStyles.footerEmail} numberOfLines={1}>
                  {email || "—"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setShowSignOutConfirm(true)}
              disabled={signingOut}
              style={({ pressed }) => [
                hubStyles.signOutBtn,
                pressed && hubStyles.signOutBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              hitSlop={8}
            >
              {signingOut ? (
                <LoadingIndicator size="small" color={Theme.textMuted} />
              ) : (
                <LogOut size={14} color={Theme.textMuted} strokeWidth={2.2} />
              )}
            </Pressable>
          </View>
        </View>

        {inlinePanel === "language" && onCloseInlinePanel ? (
          <WorkspaceLanguagePanel variant="inline" onBack={onCloseInlinePanel} />
        ) : null}
        {inlinePanel === "region" && onCloseInlinePanel ? (
          <WorkspaceRegionPanel
            variant="inline"
            onBack={onCloseInlinePanel}
          />
        ) : null}
      </View>

      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={hubStyles.confirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowSignOutConfirm(false)}
          />
          <View style={hubStyles.confirmCard}>
            <Text style={hubStyles.confirmTitle}>Sign out</Text>
            <Text style={hubStyles.confirmBody}>
              Are you sure you want to sign out of {orgName || "Pulse"}?
            </Text>
            <View style={hubStyles.confirmActions}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                style={hubStyles.confirmCancelBtn}
              >
                <Text style={hubStyles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    setShowSignOutConfirm(false);
                    router.replace(
                      ROUTES.SIGN_IN_DIRECT as Parameters<typeof router.replace>[0],
                    );
                    await signOut();
                  } catch {
                    Alert.alert("Sign out failed", "Please try again.");
                  } finally {
                    setSigningOut(false);
                  }
                }}
                style={hubStyles.confirmCtaBtn}
              >
                <Text style={hubStyles.confirmCtaText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
