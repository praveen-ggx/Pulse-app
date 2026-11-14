/**
 * Load Center. Pulse on each indent card publishes / reboosts the 24h story.
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { LOADS_HUB_PAGE_BG } from "@/features/network/components/LoadCenterHubMobileShell";
import { setInitialIndentForDetail } from "@/features/indents/initialIndentForDetail";
import { ROUTES } from "@/lib/routes";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import Theme from "@/constants/Theme";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function PulseLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const openedFromTrips = (Array.isArray(params.from) ? params.from[0] : params.from) === "trips";
  // PublicAuthTree can paint this route for one frame with no org provider.
  const orgCtx = useOptionalOrganization();
  const organization = orgCtx?.currentOrganization ?? null;
  const orgLoading = orgCtx?.isLoading ?? orgCtx == null;
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canViewLoadsHub = canSurface("tripops.pulse_loads");
  // Gate the org id too: no orgId means LoadCenterView fetches nothing.
  const orgId = canViewLoadsHub ? organization?.id ?? null : null;

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  // The network load board belongs to the trips-page button only.
  // The top-nav Load item opens Marketplace.
  if (!openedFromTrips) {
    return <Redirect href={ROUTES.FIND_LOADS} />;
  }

  // Surfaces hydrate async — deciding before they land bounces permitted members.
  if (accessLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  if (!canViewLoadsHub) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>You don't have access to Pulse loads.</Text>
      </View>
    );
  }

  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant={orgLoading ? "preparing" : "generic"} />;
  }

  return (
    <View style={[styles.root, { paddingTop: contentTopInset }]}>
      <LoadCenterView
        onCreateIndentPress={() => {
          if (!canSurface("tripops.indents.create")) return;
          router.push(ROUTES.CREATE_INDENT as import("expo-router").Href);
        }}
        onIndentPress={(indent, options) => {
          setInitialIndentForDetail(indent);
          router.push(
            (options?.anonymous
              ? ROUTES.indentDetailAnonymous(indent.id)
              : `/indent/${indent.id}`) as import("expo-router").Href,
          );
        }}
        onMyNetworkPress={() =>
          router.push(ROUTES.TABS.NETWORK as import("expo-router").Href)
        }
        contentTopPadding={0}
        initialSubTab="GET_LOAD"
        hiddenSubTabs={["GIVE_LOAD"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LOADS_HUB_PAGE_BG },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: LOADS_HUB_PAGE_BG,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
});
