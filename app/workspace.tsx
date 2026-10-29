/**
 * Workspace overlay — right-anchored flex card with backdrop on desktop;
 * full-screen on mobile. Always single-pane (hub or a detail panel).
 *
 * Core tabs open the hub. Product chrome (Finance Pro / Invoice / POD) opens
 * My Account as the root — same page and stack as Commerce: edit, workspace
 * (Organization), language, and region stay on the account stack; back from
 * My Account returns to the product.
 */
import { WorkspaceFlexCardShell } from "@/components/layout/WorkspaceFlexCardShell";
import { WorkspaceHubMenu } from "@/components/profile/WorkspaceHubMenu";
import { WorkspaceAccountPanel } from "@/features/organization/components/workspace/WorkspaceAccountPanel";
import { WorkspaceEditAccountPanel } from "@/features/organization/components/workspace/WorkspaceEditAccountPanel";
import { WorkspaceFeedbackProvider } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WorkspaceLanguagePanel } from "@/features/organization/components/workspace/WorkspaceLanguagePanel";
import { WorkspaceOrgKycPanel } from "@/features/organization/components/workspace/WorkspaceOrgKycPanel";
import { WorkspaceOcrUsagePanel } from "@/features/organization/components/workspace/WorkspaceOcrUsagePanel";
import { WorkspaceProductsPanel } from "@/features/organization/components/workspace/WorkspaceProductsPanel";
import { WorkspaceProfilePanel } from "@/features/organization/components/workspace/WorkspaceProfilePanel";
import { WorkspaceRegionPanel } from "@/features/organization/components/workspace/WorkspaceRegionPanel";
import { WorkspaceSettingsPanel } from "@/features/organization/components/workspace/WorkspaceSettingsPanel";
import { WorkspaceTeamPanel } from "@/features/organization/components/workspace/WorkspaceTeamPanel";
import {
  parseOrgHubSection,
  parseWorkspacePanelId,
  type OrgHubSection,
  type WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { shouldMountAuthenticatedDataPlane } from "@/lib/bootGate";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { useViewerManagerDepartment } from "@/lib/queries/useOrgMembersQuery";
import type { ExpoProductShellId } from "@/lib/suite/suiteProducts";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { MemberSurfaceId } from "@/lib/memberSurfaces";

function parseFromProduct(
  raw: string | string[] | undefined,
): ExpoProductShellId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "finance-pro" || value === "invoice" || value === "pod") {
    return value;
  }
  return null;
}

export default function WorkspaceScreen() {
  const { sessionAttached } = useAuth();
  if (!shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }
  return <AuthenticatedWorkspaceScreen />;
}

function AuthenticatedWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    panel?: string | string[];
    section?: string | string[];
    fromProduct?: string | string[];
  }>();

  const activePanel = useMemo(
    () => parseWorkspacePanelId(params.panel),
    [params.panel],
  );
  const orgSection = useMemo(
    () => parseOrgHubSection(params.section),
    [params.section],
  );
  const fromProduct = useMemo(
    () => parseFromProduct(params.fromProduct),
    [params.fromProduct],
  );
  /** Product chrome (Finance Pro / Invoice / POD) opens My Account as the root, same as Commerce. */
  const accountIsRoot = !!fromProduct;

  const previousPanelRef = useRef<WorkspacePanelId | null>(null);

  /**
   * WorkspaceHubMenu already gates each menu row on the matching surface
   * (see its own comment: "this drawer renders above every MemberDomainGate,
   * so each row needs its own surface check") — but that only stops a member
   * from tapping into a panel via the menu. The panel components themselves
   * (WorkspaceProfilePanel, WorkspaceOrgKycPanel, WorkspaceTeamPanel,
   * WorkspaceProductsPanel) had no check of their own, so a direct URL
   * (?panel=kyc, ?panel=team, ?panel=profile, ?panel=products) bypassed the
   * menu-level gating entirely. Enforce the identical surface requirement
   * here, at the one place every entry point (menu tap or direct URL) must
   * pass through. "account"/"account-edit"/"language"/"region" stay open —
   * personal identity and preferences, not org-business data.
   */
  const { can: canSurface, isLoading: memberAccessLoading } = useMemberAccess();
  const panelRequiredSurface: Partial<Record<WorkspacePanelId, MemberSurfaceId>> = {
    profile: "sales.tab",
    kyc: "workspace.kyc",
    team: "team.manage",
    settings: "workspace.settings",
    products: "workspace.products",
    "ocr-usage": "workspace.products",
  };
  const requiredSurface = activePanel ? panelRequiredSurface[activePanel] : undefined;
  // A Department manager opens Team for their own department (no invite /
  // remove / role change — the roster is filtered and the server re-checks).
  const { user } = useAuth();
  const managerDepartment = useViewerManagerDepartment(
    useOptionalOrganization()?.currentOrganization?.id ?? null,
    user?.uid ?? null,
  );
  const panelDenied =
    !memberAccessLoading &&
    !!requiredSurface &&
    !canSurface(requiredSurface) &&
    !(activePanel === "team" && managerDepartment);

  const closeOverlay = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.TABS.NETWORK as Parameters<typeof router.replace>[0]);
  }, [router]);

  const setWorkspaceParams = useCallback(
    (next: { panel?: string; section?: string }) => {
      router.setParams({
        panel: next.panel ?? "",
        section: next.section ?? "",
        ...(fromProduct ? { fromProduct } : {}),
      });
    },
    [fromProduct, router],
  );

  const openPanel = useCallback(
    (panel: WorkspacePanelId) => {
      previousPanelRef.current = activePanel;
      setWorkspaceParams({ panel, section: "" });
    },
    [activePanel, setWorkspaceParams],
  );

  const closePanel = useCallback(() => {
    setWorkspaceParams({ panel: "", section: "" });
  }, [setWorkspaceParams]);

  const popPanel = useCallback(() => {
    const previous = previousPanelRef.current;
    previousPanelRef.current = null;
    if (previous && previous !== activePanel) {
      setWorkspaceParams({ panel: previous, section: "" });
      return;
    }
    if (accountIsRoot) {
      setWorkspaceParams({ panel: "account", section: "" });
      return;
    }
    closePanel();
  }, [accountIsRoot, activePanel, closePanel, setWorkspaceParams]);

  const closeAccount = useCallback(() => {
    if (accountIsRoot) {
      closeOverlay();
      return;
    }
    closePanel();
  }, [accountIsRoot, closeOverlay, closePanel]);

  // Bounce a denied panel back to the hub — or My Account when a product opened us.
  useEffect(() => {
    if (!panelDenied) return;
    if (accountIsRoot) {
      setWorkspaceParams({ panel: "account", section: "" });
      return;
    }
    closePanel();
  }, [accountIsRoot, closePanel, panelDenied, setWorkspaceParams]);

  useEffect(() => {
    if (!accountIsRoot || activePanel || memberAccessLoading || panelDenied) return;
    setWorkspaceParams({ panel: "account", section: "" });
  }, [
    accountIsRoot,
    activePanel,
    memberAccessLoading,
    panelDenied,
    setWorkspaceParams,
  ]);

  const openOrgSection = useCallback(
    (section: OrgHubSection | null) => {
      if (section) {
        previousPanelRef.current = activePanel;
        setWorkspaceParams({ panel: "kyc", section });
        return;
      }
      const previous = previousPanelRef.current;
      if (previous && previous !== "kyc") {
        previousPanelRef.current = null;
        openPanel(previous);
        return;
      }
      setWorkspaceParams({ panel: "kyc", section: "" });
    },
    [activePanel, openPanel, setWorkspaceParams],
  );

  const panelContent = useMemo(() => {
    if (panelDenied) return null;
    if (activePanel === "account") {
      return (
        <WorkspaceAccountPanel
          onBack={closeAccount}
          onEdit={() => openPanel("account-edit")}
          onOpenPanel={openPanel}
          onOpenRoute={(path) => {
            closeOverlay();
            router.push(path as Parameters<typeof router.push>[0]);
          }}
        />
      );
    }
    if (activePanel === "account-edit") {
      return <WorkspaceEditAccountPanel onBack={() => openPanel("account")} />;
    }
    if (activePanel === "language") {
      return <WorkspaceLanguagePanel onBack={() => openPanel("account")} />;
    }
    if (activePanel === "region") {
      return <WorkspaceRegionPanel onBack={() => openPanel("account")} />;
    }
    if (activePanel === "profile") {
      return (
        <WorkspaceProfilePanel
          onBack={popPanel}
          onOpenPanel={openPanel}
          onOpenOrgSection={openOrgSection}
          onOpenRoute={(path) => {
            closeOverlay();
            router.push(path as Parameters<typeof router.push>[0]);
          }}
        />
      );
    }
    if (activePanel === "settings") {
      return <WorkspaceSettingsPanel onBack={popPanel} />;
    }
    if (activePanel === "team") {
      return <WorkspaceTeamPanel onBack={popPanel} />;
    }
    if (activePanel === "kyc") {
      return (
        <WorkspaceOrgKycPanel
          onBack={popPanel}
          section={orgSection}
          onOpenSection={openOrgSection}
          onOpenPanel={openPanel}
        />
      );
    }
    if (activePanel === "products") {
      return <WorkspaceProductsPanel onBack={popPanel} />;
    }
    if (activePanel === "ocr-usage") {
      return <WorkspaceOcrUsagePanel onBack={popPanel} />;
    }
    return null;
  }, [
    activePanel,
    closeAccount,
    closeOverlay,
    openOrgSection,
    openPanel,
    orgSection,
    panelDenied,
    popPanel,
    router,
  ]);

  const shellPanelOpen = !!activePanel;

  const hub = accountIsRoot ? (
    <WorkspaceAccountPanel
      onBack={closeAccount}
      onEdit={() => openPanel("account-edit")}
      onOpenPanel={openPanel}
      onOpenRoute={(path) => {
        closeOverlay();
        router.push(path as Parameters<typeof router.push>[0]);
      }}
    />
  ) : (
    <WorkspaceHubMenu
      activePanel={activePanel}
      onSelectPanel={openPanel}
      onSelectOrgSection={openOrgSection}
      onExit={closeOverlay}
    />
  );

  return (
    <View style={styles.root}>
      <WorkspaceFeedbackProvider>
        <WorkspaceFlexCardShell
          hub={hub}
          panel={panelContent}
          panelOpen={shellPanelOpen}
          onDismiss={closeOverlay}
        />
      </WorkspaceFeedbackProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
