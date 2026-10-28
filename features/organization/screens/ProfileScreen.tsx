import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import {
    DEFAULT_USER_2D_AVATAR_SEED,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  computeExperienceProgress,
  countFiveStarRatings,
  formatExperienceMilestoneTitle,
  formatExperienceTierSubtitle,
  formatMilestoneProgressLabel,
  formatMilestoneStatusLine,
  getMilestoneCount,
  isMilestoneCompleted,
  isMilestoneInProgress,
  type ExperienceLevelConfig,
  type ExperienceProgress,
  type MilestoneGuideActionKind,
} from "@/features/experience/experienceProgress";
import { MilestoneHowToModal } from "@/features/experience/components/MilestoneHowToModal";
import {
  averageScore,
  getRatingsForClients,
  getRatingsReceivedAsLinkedOrganization,
} from "@/features/ratings/services/ratings.service";
import { getSignedAvatarUrl, pickAndUploadOrgLogo, updateOrganizationLogo } from "@/lib/avatarUpload";
import { showAppAlert } from "@/lib/appAlert";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import { PartyAvatar } from "@/components/PartyAvatar";
import { canAccessPartyKind } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { getOrgVerificationBannerFields } from "@/features/organization/services/organization.service";
import { orgHubStatusCopy } from "@/features/organization/components/workspace/org/organizationHub.util";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useOrgHubMetricsQuery } from "@/lib/queries/useTripsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    BarChart3,
    Camera,
    ChevronLeft,
    ChevronRight,
    Crown,
    MapPin,
    Star,
    Trophy,
    Truck,
    Users,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SLATE_900 = "#0f172a";
const AMBER_400 = "#fbbf24";
const AMBER_500 = "#f59e0b";

type ProfileViewMode = "main" | "roadmap";

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
  return (
    (words[0]![0] ?? "").toUpperCase() +
    (words[words.length - 1]![0] ?? "").toUpperCase()
  );
}

type ProfileItemRowProps = {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value: string;
  onPress?: () => void;
  showChevron?: boolean;
};

const ORG_PARTY_TILES: {
  kind: "customers" | "suppliers" | "drivers" | "vehicles";
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
}[] = [
  { kind: "customers", icon: "building", label: "Customers" },
  { kind: "suppliers", icon: "truck", label: "Suppliers" },
  { kind: "drivers", icon: "user", label: "Drivers" },
  { kind: "vehicles", icon: "car", label: "Vehicles" },
];

function ProfileItemRow({
  icon,
  label,
  value,
  onPress,
  showChevron,
}: ProfileItemRowProps) {
  const inner = (
    <View style={styles.profileItemRowInner}>
      <View style={styles.profileItemIconBox}>
        <FontAwesome name={icon} size={14} color={Theme.primary} />
      </View>
      <View style={styles.profileItemTextWrap}>
        <Text style={styles.profileItemLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.profileItemValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {showChevron ? (
        <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      {inner}
    </Pressable>
  );
}

function FleetStars({ value }: { value: number }) {
  const v = Math.round(value * 2) / 2;
  return (
    <View style={styles.fleetStarRow} accessibilityLabel={`${value.toFixed(1)} stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const full = v >= i + 1;
        const half = !full && v >= i + 0.5;
        return (
          <View key={i} style={styles.starSlot}>
            {full || half ? (
              <Star
                size={14}
                color={AMBER_400}
                fill={full ? AMBER_400 : "transparent"}
                strokeWidth={2}
              />
            ) : (
              <Star size={14} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
            )}
          </View>
        );
      })}
    </View>
  );
}

type RoadmapPanelProps = {
  experience: ExperienceProgress;
  onBack: () => void;
  embedded?: boolean;
  topInset?: number;
  onOpenVerification?: () => void;
  onOpenTrips?: () => void;
};

function BusinessRoadmapPanel({
  experience,
  onBack,
  embedded = false,
  topInset = 0,
  onOpenVerification,
  onOpenTrips,
}: RoadmapPanelProps) {
  const {
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
    currentCount,
  } = experience;
  const [guideLevel, setGuideLevel] = useState<ExperienceLevelConfig | null>(null);
  const progressLabel = formatMilestoneProgressLabel(experience);
  const statusLine = formatMilestoneStatusLine(
    currentLevelConfig,
    currentCount,
    experience.metrics,
    { audience: "business" },
  );
  const maxLevel = experience.levels[experience.levels.length - 1]?.level ?? 1;
  const allMilestonesComplete = experience.highestCompletedLevel >= maxLevel;

  return (
    <View
      style={[
        styles.roadmapWrap,
        embedded ? styles.roadmapWrapEmbedded : { paddingTop: topInset + 8 },
      ]}
    >
      <View style={styles.roadmapHeader}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.roadmapBack, pressed && { opacity: 0.85 }]}
          hitSlop={Layout.touchTargetHitSlop}
          accessibilityRole="button"
          accessibilityLabel="Back to organization profile"
        >
          <ChevronLeft size={22} color={Theme.textPrimary} />
        </Pressable>
        <View style={styles.roadmapHeaderTitleWrap}>
          <Text style={styles.roadmapTitle} numberOfLines={1}>
            Experience roadmap
          </Text>
        </View>
        <View style={styles.roadmapHeaderSpacer} />
      </View>
      <LinearGradient
        colors={[Theme.accentBrownDeep, "#3f2c2c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.roadmapHero, embedded && styles.roadmapHeroEmbedded]}
      >
        <View style={styles.roadmapWatermark} pointerEvents="none">
          <MapPin size={88} color="rgba(255,255,255,0.05)" />
        </View>
        <View style={styles.rankRow}>
          <LinearGradient colors={[AMBER_500, "#d97706"]} style={styles.crownBox}>
            <Crown size={24} color="#fff" />
          </LinearGradient>
          <View style={styles.rankCopy}>
            <Text style={styles.roadmapEyebrow}>CURRENT MILESTONE</Text>
            <Text style={styles.roadmapTierName} numberOfLines={1}>
              {formatExperienceMilestoneTitle(currentLevelConfig)}
            </Text>
            <Text style={styles.roadmapTierSub} numberOfLines={2}>
              {formatExperienceTierSubtitle(currentLevelConfig)}
            </Text>
          </View>
        </View>
        <View style={styles.roadmapProgBlock}>
          <View style={styles.roadmapProgLabels}>
            <Text style={styles.roadmapProgLeft} numberOfLines={2}>
              {progressLabel}
            </Text>
            <Text style={styles.roadmapProgPct}>
              {allMilestonesComplete ? "100%" : `${experiencePct}%`}
            </Text>
          </View>
          <View style={styles.roadmapTrack}>
            <View
              style={[
                styles.roadmapFill,
                {
                  width: `${allMilestonesComplete ? 100 : Math.max(experiencePct, experiencePct > 0 ? 4 : 0)}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.roadmapSmall}>{statusLine}</Text>
          {nextLevelConfig && !allMilestonesComplete ? (
            <Text style={styles.roadmapNextHint} numberOfLines={2}>
              Next up: L{nextLevelConfig.level} {nextLevelConfig.name} ·{" "}
              {nextLevelConfig.goalText}
            </Text>
          ) : null}
        </View>
        <View style={styles.roadmapDivider} />
        <View style={styles.roadmapSteps}>
          {experience.levels.map((step, index) => {
            const past = isMilestoneCompleted(step.level, experience);
            const active = isMilestoneInProgress(step.level, experience);
            const count = getMilestoneCount(step, experience.metrics);
            const isLast = index === experience.levels.length - 1;
            return (
              <Pressable
                key={step.level}
                style={styles.roadmapStepRow}
                onPress={() => setGuideLevel(step)}
                accessibilityRole="button"
                accessibilityLabel={`L${step.level} ${step.name}. ${step.goalText}`}
                accessibilityHint="Shows what to do to complete this level"
              >
                <View style={styles.roadmapDotColumn}>
                  <View
                    style={[
                      styles.roadmapDot,
                      past && styles.roadmapDotDone,
                      active && styles.roadmapDotActive,
                      !past && !active && styles.roadmapDotUpcoming,
                    ]}
                  />
                  {!isLast ? <View style={styles.roadmapStepLine} /> : null}
                </View>
                <View style={styles.roadmapStepText}>
                  <View style={styles.roadmapStepTitleRow}>
                    <Text
                      style={[
                        styles.roadmapStepTitle,
                        active && styles.roadmapStepTitleActive,
                        past && styles.roadmapStepTitleDone,
                      ]}
                      numberOfLines={1}
                    >
                      L{step.level} {step.name}
                    </Text>
                    {active ? (
                      <Text style={styles.roadmapStepCount}>
                        {count.done}/{count.target}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.roadmapStepSub} numberOfLines={2}>
                    {step.goalText}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>
      <MilestoneHowToModal
        visible={guideLevel != null}
        level={guideLevel}
        progress={experience}
        audience="business"
        onClose={() => setGuideLevel(null)}
        onAction={(kind: MilestoneGuideActionKind) => {
          setGuideLevel(null);
          if (kind === "org_verification") onOpenVerification?.();
          if (kind === "org_trips") onOpenTrips?.();
        }}
      />
    </View>
  );
}

export type ProfileScreenProps = {
  /** Render inside the workspace flex-card (no full-screen header / tab insets). */
  embedded?: boolean;
  /**
   * `page` — trip/indent mobile layout: light header + one full-page scroll.
   * `embedded` — desktop workspace card.
   * Omit to keep `embedded` behavior.
   */
  presentation?: "page" | "embedded";
  onClose?: () => void;
  onOpenAccount?: () => void;
  /** When embedded, opens the workspace team panel (members & access). */
  onOpenTeam?: () => void;
  onOpenVerification?: () => void;
  onOpenBusinessIdentity?: () => void;
  onOpenWorkspaceSettings?: () => void;
  onOpenScanUsage?: () => void;
  onOpenRoute?: (path: string) => void;
};

export default function ProfileScreen({
  embedded = false,
  presentation,
  onClose,
  onOpenAccount,
  onOpenTeam,
  onOpenVerification,
  onOpenBusinessIdentity,
  onOpenWorkspaceSettings,
  onOpenScanUsage,
  onOpenRoute,
}: ProfileScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const { width: windowWidth } = useWindowDimensions();
  const pageLayout = presentation === "page";
  const compactPage = pageLayout && windowWidth < Layout.workspaceSplitMinWidth;
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization, refreshOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { user, profile, refreshSession } = useAuth();
  const { role, canEdit } = useOrgRole();
  const { can: canSurface } = useMemberAccess();

  const { data: hubMetrics, isLoading: tripsLoading } = useOrgHubMetricsQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);

  const clientIds = useMemo(() => clients.map((c) => c.id).filter(Boolean), [clients]);
  const clientIdsKey = clientIds.length ? clientIds.sort().join(",") : "";

  /** Supplier/org ratings of your CRM customer records (rated_type client) — not driver scores. */
  const { data: partnerClientRatingData, isLoading: partnerRatingsLoading } = useQuery({
    queryKey: ["q", "profile", "partnerClientRatings", orgId ?? "", clientIdsKey],
    queryFn: async () => {
      if (!orgId || clientIds.length === 0) {
        return { avg: null as number | null, count: 0 };
      }
      const { error, byClientId } = await getRatingsForClients(clientIds);
      if (error) throw error;
      const all = Object.values(byClientId).flat();
      return {
        avg: averageScore(all),
        count: all.length,
      };
    },
    enabled: !!orgId && clientIds.length > 0,
    staleTime: 60_000,
    refetchOnMount: false,
  });

  /** Partner orgs rated your linked customer identity (integrated client row → your org). */
  const { data: receivedCustomerRatingData, isLoading: receivedCustomerRatingsLoading } = useQuery({
    queryKey: ["q", "profile", "receivedCustomerRatings", orgId ?? ""],
    queryFn: async () => {
      if (!orgId) {
        return { avg: null as number | null, count: 0, fiveStarCount: 0 };
      }
      const { error, ratings } = await getRatingsReceivedAsLinkedOrganization(orgId);
      if (error) throw error;
      return {
        avg: averageScore(ratings),
        count: ratings.length,
        fiveStarCount: countFiveStarRatings(ratings),
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
    refetchOnMount: false,
  });

  const completedTrips = hubMetrics?.tripsCompleted ?? 0;
  const totalTrips = (hubMetrics?.tripsActive ?? 0) + (hubMetrics?.tripsCompleted ?? 0);

  const { data: verificationStatus } = useQuery({
    queryKey: queryKeys.workspace.verificationBanner(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return "unverified" as const;
      const { fields, error } = await getOrgVerificationBannerFields(orgId);
      if (error) throw error;
      return fields?.verification_status ?? "unverified";
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const orgKycVerified = verificationStatus === "verified";

  const experience = useMemo(
    () =>
      computeExperienceProgress({
        hasSignedUp: Boolean(user?.uid || profile?.uid),
        completedTrips,
        isVerified: orgKycVerified,
        fiveStarCount: receivedCustomerRatingData?.fiveStarCount ?? 0,
      }),
    [
      user?.uid,
      profile?.uid,
      completedTrips,
      orgKycVerified,
      receivedCustomerRatingData?.fiveStarCount,
    ],
  );
  const {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
  } = experience;

  const [viewMode, setViewMode] = useState<ProfileViewMode>("main");
  const [avatarSeed, setAvatarSeed] = useState(
    profile?.avatar_seed || DEFAULT_USER_2D_AVATAR_SEED,
  );

  useEffect(() => {
    if (profile?.avatar_seed) {
      setAvatarSeed(profile.avatar_seed);
    }
  }, [profile?.avatar_seed]);

  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [orgLogoUploading, setOrgLogoUploading] = useState(false);

  const capabilities = useCapabilities();
  const visiblePartyTiles = useMemo(
    () => ORG_PARTY_TILES.filter((p) => canAccessPartyKind(capabilities, p.kind)),
    [capabilities],
  );
  const hasDispatcherOrFleetAccess =
    capabilities.includes("finance_view") ||
    capabilities.includes("finance_manage") ||
    capabilities.includes("dispatch") ||
    capabilities.includes("dispatch_for_own_fleet");

  const verificationCopy = orgHubStatusCopy(verificationStatus ?? "unverified");

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSession();
      if (orgId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
        await queryClient.invalidateQueries({
          queryKey: ["q", "profile", "partnerClientRatings", orgId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["q", "profile", "receivedCustomerRatings", orgId],
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [orgId, queryClient, refreshSession]);

  useFocusEffect(
    useCallback(() => {
      if (!orgId) return;
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "q" &&
          q.queryKey[1] === "profile",
      });
    }, [orgId, queryClient]),
  );

  const displayName =
    profile?.full_name ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    "User";
  const membershipLabel =
    role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";

  const operatingModelLabel = useMemo(() => {
    switch (currentOrganization?.operatingModel) {
      case "ASSET_BASED": return "Asset Fleet";
      case "NON_ASSET": return "Broker / 3PL";
      case "HYBRID": return "Hybrid Ops";
      default: return null;
    }
  }, [currentOrganization?.operatingModel]);

  const accessLabel = useMemo(
    () =>
      hasDispatcherOrFleetAccess
        ? "Operational Access Enabled"
        : "Limited Access",
    [hasDispatcherOrFleetAccess],
  );

  const openMembersAndAccess = () => {
    if (onOpenTeam) {
      onOpenTeam();
      return;
    }
    router.push(ROUTES.WORKSPACE_TEAM as Parameters<typeof router.push>[0]);
  };

  const openPath = (path: string) => {
    if (onOpenRoute) {
      onOpenRoute(path);
      return;
    }
    if (embedded && onClose) onClose();
    router.push(path as Parameters<typeof router.push>[0]);
  };

  const openVerification = () => {
    if (onOpenVerification) {
      onOpenVerification();
      return;
    }
    openPath(ROUTES.WORKSPACE_KYC_VERIFICATION);
  };

  const openBusinessIdentity = () => {
    if (onOpenBusinessIdentity) {
      onOpenBusinessIdentity();
      return;
    }
    openPath(ROUTES.WORKSPACE_KYC);
  };

  const openWorkspaceSettings = () => {
    if (onOpenWorkspaceSettings) {
      onOpenWorkspaceSettings();
      return;
    }
    openPath(`${ROUTES.WORKSPACE}?panel=settings`);
  };

  const openScanUsage = () => {
    if (onOpenScanUsage) {
      onOpenScanUsage();
      return;
    }
    openPath(ROUTES.WORKSPACE_OCR_USAGE);
  };

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    "—";

  const partnerClientAvg = partnerClientRatingData?.avg ?? null;
  const partnerClientCount = partnerClientRatingData?.count ?? 0;

  const receivedCustomerAvg = receivedCustomerRatingData?.avg ?? null;
  const receivedCustomerCount = receivedCustomerRatingData?.count ?? 0;

  /** Weighted average of partner ratings: you as customer + your customers (CRM). */
  const combinedPartnerStats = useMemo(() => {
    let sumScore = 0;
    let total = 0;
    if (receivedCustomerCount > 0 && receivedCustomerAvg != null) {
      sumScore += receivedCustomerAvg * receivedCustomerCount;
      total += receivedCustomerCount;
    }
    if (partnerClientCount > 0 && partnerClientAvg != null) {
      sumScore += partnerClientAvg * partnerClientCount;
      total += partnerClientCount;
    }
    if (total === 0) return { avg: null as number | null, count: 0 };
    return { avg: sumScore / total, count: total };
  }, [
    receivedCustomerAvg,
    receivedCustomerCount,
    partnerClientAvg,
    partnerClientCount,
  ]);

  const showCombinedPartnerStars =
    combinedPartnerStats.avg != null &&
    combinedPartnerStats.avg > 0 &&
    combinedPartnerStats.count > 0;

  const statMiddleAvg = combinedPartnerStats.avg;
  const statMiddleLabel = "Partner avg";
  const statMiddleLoading =
    !!orgId &&
    (receivedCustomerRatingsLoading ||
      (clientIds.length > 0 && partnerRatingsLoading));
  const showStatMiddleStars =
    statMiddleAvg != null && statMiddleAvg > 0;

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) {
      setOrgLogoUri(null);
      return;
    }
    (async () => {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        if (mounted) setOrgLogoUri(raw);
        return;
      }
      const signed = await getSignedAvatarUrl(raw);
      if (mounted) setOrgLogoUri(signed ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const handleUploadOrgLogo = async () => {
    if (!orgId || orgLogoUploading) return;
    if (!canEdit) {
      showAppAlert(
        "Workspace logo",
        "Only workspace owners and admins can update the organisation logo.",
      );
      return;
    }
    setOrgLogoUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        showAppAlert("Upload failed", result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        showAppAlert("Save failed", error.message);
        return;
      }
      if (result.previewUri) setOrgLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, currentOrganization?.name?.trim() || displayName, result.path);
      showAppAlert("Profile picture updated", undefined, { tone: "success" });
    } finally {
      setOrgLogoUploading(false);
    }
  };

  return (
    <View style={[styles.outer, pageLayout && styles.outerPage, embedded && styles.outerEmbedded]}>
      {pageLayout && viewMode === "main" ? (
        <View style={[styles.pageNav, { paddingTop: insets.top + 6 }]}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.pageNavBack, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={Layout.touchTargetHitSlop}
          >
            <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.pageNavCopy}>
            <Text style={styles.pageNavTitle} numberOfLines={1}>
              Organization
            </Text>
            {currentOrganization?.name?.trim() ? (
              <Text style={styles.pageNavSub} numberOfLines={1}>
                {currentOrganization.name.trim()}
              </Text>
            ) : null}
          </View>
          <View style={styles.pageNavSpacer} />
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          pageLayout && styles.scrollContentPage,
          {
            paddingBottom: pageLayout || embedded
              ? insets.bottom + Layout.sectionSpacing + 20
              : Layout.sectionSpacing + layout.scrollBottomPadding(),
          },
        ]}
        showsVerticalScrollIndicator={false}
        {...(embedded || pageLayout ? {} : tabBarScrollProps)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={Theme.primary}
          />
        }
      >
        {viewMode === "roadmap" ? (
          <BusinessRoadmapPanel
            experience={experience}
            embedded={embedded}
            topInset={pageLayout ? 8 : insets.top}
            onBack={() => setViewMode("main")}
            onOpenVerification={onOpenVerification}
            onOpenTrips={() => {
              if (onOpenRoute) onOpenRoute(ROUTES.TABS.TRIPS);
              else router.push(ROUTES.TABS.TRIPS);
            }}
          />
        ) : null}

        {viewMode === "main" ? (
          <>
            {!embedded && !pageLayout ? (
            <View style={[styles.driverLikeTopBar, { paddingTop: insets.top + 8 }]}>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [styles.driverLikeTopBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <ChevronLeft size={20} color={Theme.textOnDark} />
              </Pressable>
              <Text style={styles.driverLikeTopTitle}>ORGANIZATION</Text>
              <View style={styles.driverLikeTopBtn} />
            </View>
            ) : null}

            <View
              style={[
                styles.contentWrapDriverLike,
                embedded && styles.contentWrapEmbedded,
                compactPage && styles.contentWrapPage,
              ]}
            >
              {/* Hero bleeds to screen edges via negative margins — sits flush under the dark top bar */}
              <LinearGradient
                colors={[Theme.accentBrown, Theme.accentBrownDeep, "#3f2c2c"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.driverLikeHero,
                  embedded && styles.driverLikeHeroEmbedded,
                  compactPage && styles.driverLikeHeroPage,
                ]}
              >
                <View style={[styles.avatarGlow, embedded && styles.avatarGlowEmbedded]} />

                <View style={[styles.heroDpWrap, embedded && styles.heroDpWrapEmbedded]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.orgDpTouch,
                      pressed && styles.orgDpTouchPressed,
                    ]}
                    onPress={() => void handleUploadOrgLogo()}
                    disabled={orgLogoUploading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canEdit ? "Change organisation logo" : "Organisation logo"
                    }
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    <View style={[styles.orgDpRing, embedded && styles.orgDpRingEmbedded]}>
                      {orgLogoUri ? (
                        <Image
                          source={{ uri: orgLogoUri }}
                          style={[styles.orgDpImage, embedded && styles.orgDpImageEmbedded]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.orgDpPlaceholder,
                            embedded && styles.orgDpImageEmbedded,
                          ]}
                        >
                          <Text
                            style={[
                              styles.orgDpInitialsText,
                              embedded && styles.orgDpInitialsEmbedded,
                            ]}
                          >
                            {orgInitials(currentOrganization?.name || "Org")}
                          </Text>
                        </View>
                      )}
                    </View>
                    {canEdit ? (
                      <View
                        style={[
                          styles.orgDpCameraBadge,
                          embedded && styles.orgDpCameraBadgeEmbedded,
                        ]}
                        pointerEvents="none"
                      >
                        {orgLogoUploading ? (
                          <LoadingIndicator size="small" color={Theme.accentBrownDeep} />
                        ) : (
                          <Camera
                            size={embedded ? 13 : 15}
                            color={Theme.accentBrownDeep}
                            strokeWidth={2.2}
                          />
                        )}
                      </View>
                    ) : null}
                  </Pressable>
                  {canEdit ? (
                    <Text style={styles.orgDpHint}>
                      {orgLogoUploading ? "Updating…" : "Tap to update logo"}
                    </Text>
                  ) : null}
                </View>

                <Text
                  numberOfLines={compactPage ? 2 : 1}
                  style={[styles.nameText, embedded && styles.nameTextEmbedded]}
                >
                  {currentOrganization?.name || displayName}
                </Text>

                {/* Operating model + tier badge row */}
                <View style={styles.heroBadgeRow}>
                  {operatingModelLabel ? (
                    <View style={styles.modelBadge}>
                      <Text style={styles.modelBadgeText}>{operatingModelLabel}</Text>
                    </View>
                  ) : null}
                  <View style={styles.tierBadge}>
                    <Trophy size={9} color={AMBER_400} />
                    <Text style={styles.tierBadgeText}>
                      {formatExperienceMilestoneTitle(currentLevelConfig)}
                    </Text>
                  </View>
                </View>

                <View style={styles.ratingPillsStack}>
                  {showCombinedPartnerStars ? (
                    <View style={[styles.ratingPill, styles.ratingPillPartner]}>
                      <FleetStars value={combinedPartnerStats.avg!} />
                      <Text style={styles.ratingNum}>
                        {combinedPartnerStats.avg!.toFixed(1)} · {combinedPartnerStats.count}{" "}
                        review{combinedPartnerStats.count === 1 ? "" : "s"} (partners · you as
                        customer and your customers)
                      </Text>
                    </View>
                  ) : statMiddleLoading ? (
                    <View style={[styles.ratingPillMuted, styles.ratingPillPartner]}>
                      <LoadingIndicator size="small" color="rgba(255,255,255,0.6)" />
                    </View>
                  ) : (
                    <View style={[styles.ratingPillMuted, styles.ratingPillPartner]}>
                      <Text style={styles.ratingPillMutedText}>
                        No partner ratings yet
                      </Text>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => setViewMode("roadmap")}
                  style={({ pressed }) => [styles.xpCard, pressed && { opacity: 0.92 }]}
                  accessibilityRole="button"
                  accessibilityLabel="View experience roadmap"
                >
                  <View style={styles.xpTop}>
                    <Text style={styles.xpEyebrow}>EXPERIENCE</Text>
                    <Text style={styles.xpPct}>{experiencePct}%</Text>
                  </View>
                  <View style={[styles.xpTrack, embedded && styles.xpTrackEmbedded]}>
                    <LinearGradient
                      colors={[Theme.accentBrownLight, Theme.accentGold]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.xpFill, { width: `${experiencePct}%` }]}
                    />
                  </View>
                  <View style={styles.xpFooter}>
                    <Text style={styles.xpFooterTxt}>
                      {tripsLoading
                        ? "…"
                        : `L${currentLevel} ${currentLevelConfig.name}`}
                    </Text>
                    <Text style={styles.xpFooterTxt}>
                      {nextLevelConfig
                        ? `${formatExperienceMilestoneTitle(nextLevelConfig)} next`
                        : "Max tier"}{" "}
                      · tap roadmap
                    </Text>
                  </View>
                </Pressable>
              </LinearGradient>

              <View style={[styles.statsGrid, embedded && styles.statsGridEmbedded]}>
                <View style={[styles.statTile, embedded && styles.statTileEmbedded]}>
                  <View style={styles.statIconWell}>
                    <Truck size={15} color={Theme.accentBrownDeep} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.statTileNum} numberOfLines={1}>
                    {tripsLoading ? "—" : totalTrips}
                  </Text>
                  <Text style={styles.statTileLbl}>Trips</Text>
                </View>
                <View style={[styles.statTile, embedded && styles.statTileEmbedded]}>
                  <View style={[styles.statIconWell, styles.statIconWellGold]}>
                    <Star
                      size={15}
                      color={AMBER_500}
                      fill={showStatMiddleStars ? AMBER_500 : "transparent"}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={styles.statTileNum} numberOfLines={1}>
                    {statMiddleLoading
                      ? "…"
                      : showStatMiddleStars
                        ? statMiddleAvg!.toFixed(1)
                        : "—"}
                  </Text>
                  <Text style={styles.statTileLbl}>{statMiddleLabel}</Text>
                </View>
                <View style={[styles.statTile, embedded && styles.statTileEmbedded]}>
                  <View style={styles.statIconWell}>
                    <Users size={15} color={Theme.accentBrownDeep} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.statTileNum} numberOfLines={1}>{drivers.length}</Text>
                  <Text style={styles.statTileLbl}>Drivers</Text>
                </View>
              </View>

              {/* Managed By — link to personal account only */}
              <Pressable
                style={({ pressed }) => [styles.managedByCard, pressed && { opacity: 0.9 }]}
                onPress={() => {
                  if (onOpenAccount) onOpenAccount();
                  else router.push(ROUTES.MY_ACCOUNT as Parameters<typeof router.push>[0]);
                }}
                accessibilityRole="button"
                accessibilityLabel="View personal account"
              >
                <View style={styles.managedByHeader}>
                  <View style={styles.managedByAccent} />
                  <Text style={styles.managedByEyebrow}>Managed by</Text>
                </View>
                <View style={styles.managedByRow}>
                  <View style={styles.managedByAvatarWrap}>
                    <PartyAvatar
                      name={displayName}
                      avatarUrl={profile?.avatar_url ?? null}
                      avatarSeed={avatarSeed}
                      size={34}
                    />
                  </View>
                  <View style={styles.managedByInfo}>
                    <View style={styles.managedByNameRow}>
                      <Text style={styles.managedByName} numberOfLines={1}>{displayName}</Text>
                      <View style={styles.managedByRoleBadge}>
                        <Text style={styles.managedByRoleText}>{membershipLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.managedByMeta} numberOfLines={1}>
                      Personal account
                    </Text>
                  </View>
                  <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.premiumCard, pressed && { opacity: 0.92 }]}
                onPress={() => openPath(ROUTES.networkOrgHub("profile"))}
                accessibilityRole="button"
                accessibilityLabel="Open business dashboard"
              >
                <View style={styles.premiumCardInner}>
                  <View style={styles.interactiveRow}>
                    <View style={styles.interactiveRowLeft}>
                      <View style={styles.dashIcon}>
                        <BarChart3 size={16} color={Theme.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.interactiveCopy}>
                        <Text style={styles.interactiveEyebrow}>Overview</Text>
                        <Text style={styles.interactiveTitle}>Business dashboard</Text>
                        <Text style={styles.interactiveSub}>
                          Open the Network hub for trips, fleet reputation, and tier progress.
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
                  </View>
                </View>
              </Pressable>

              {canSurface("workspace.kyc") ? (
                <View style={styles.premiumCard}>
                  <View style={styles.premiumCardInner}>
                    <ProfileItemRow
                      icon="shield"
                      label="Verification & Trust"
                      value={verificationCopy.body || verificationCopy.kicker}
                      onPress={openVerification}
                      showChevron
                    />
                    <View style={styles.premiumDivider} />
                    <ProfileItemRow
                      icon="building"
                      label="Business Identity"
                      value="Legal name, tax details, documents"
                      onPress={openBusinessIdentity}
                      showChevron
                    />
                  </View>
                </View>
              ) : null}

              {visiblePartyTiles.length > 0 ? (
                <View style={styles.premiumCard}>
                  <View style={styles.premiumCardInner}>
                    <View style={styles.managedByHeader}>
                      <View style={styles.managedByAccent} />
                      <Text style={styles.managedByEyebrow}>Operations</Text>
                    </View>
                    <View style={styles.premiumDivider} />
                    <View style={styles.opsPartyRow}>
                      {visiblePartyTiles.map((party) => (
                        <Pressable
                          key={party.kind}
                          style={({ pressed }) => [
                            styles.opsPartyCell,
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={() => openPath(ROUTES.partyDirectory(party.kind))}
                          accessibilityRole="button"
                          accessibilityLabel={`${party.label} directory`}
                        >
                          <View style={styles.profileItemIconBox}>
                            <FontAwesome name={party.icon} size={14} color={Theme.primary} />
                          </View>
                          <Text style={styles.opsPartyLabel} numberOfLines={1}>
                            {party.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {canSurface("team.manage") ? (
                <View style={styles.premiumCard}>
                  <View style={styles.premiumCardInner}>
                    <ProfileItemRow
                      icon="users"
                      label="Team & Access"
                      value={`${membershipLabel} · ${accessLabel}`}
                      onPress={openMembersAndAccess}
                      showChevron
                    />
                  </View>
                </View>
              ) : null}

              {canSurface("workspace.settings") ? (
                <View style={styles.premiumCard}>
                  <View style={styles.premiumCardInner}>
                    <ProfileItemRow
                      icon="cog"
                      label="Workspace"
                      value="Settings, branding, operating model"
                      onPress={openWorkspaceSettings}
                      showChevron
                    />
                    {canSurface("workspace.products") ? (
                      <>
                        <View style={styles.premiumDivider} />
                        <ProfileItemRow
                          icon="barcode"
                          label="Pulse Scan"
                          value={`Scan usage for ${currentOrganization?.name?.trim() || "this organization"}`}
                          onPress={openScanUsage}
                          showChevron
                        />
                      </>
                    ) : null}
                    <View style={styles.premiumDivider} />
                    <ProfileItemRow
                      icon="info-circle"
                      label="Version"
                      value={`Version ${appVersion} (${buildNumber})`}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.premiumCard}>
                  <View style={styles.premiumCardInner}>
                    <ProfileItemRow
                      icon="info-circle"
                      label="Version"
                      value={`Version ${appVersion} (${buildNumber})`}
                    />
                  </View>
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  outerPage: { backgroundColor: Theme.screenBackground },
  outerEmbedded: { backgroundColor: "#f5f7fb" },
  pageNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 4,
  },
  pageNavBack: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  pageNavCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pageNavTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  pageNavSub: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  pageNavSpacer: {
    width: 40,
    height: 40,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
    gap: 0,
  },
  scrollContentPage: {
    paddingTop: 0,
  },
  contentWrapPage: {
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 14,
  },
  driverLikeHeroPage: {
    marginHorizontal: -16,
    marginBottom: 2,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  driverLikeTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    backgroundColor: Theme.cinematicHeaderBg,
  },
  driverLikeTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cinematicHeaderChipBg,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  driverLikeTopTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
    letterSpacing: 2.2,
  },
  contentWrapDriverLike: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 0,
    gap: 12,
  },
  contentWrapEmbedded: {
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 12,
  },
  driverLikeHero: {
    borderRadius: 24,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    overflow: "hidden",
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  driverLikeHeroEmbedded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginHorizontal: -16,
    marginBottom: 2,
    paddingTop: 16,
    paddingBottom: 14,
  },

  cinematicHeader: {
    backgroundColor: Theme.cinematicHeaderBg,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 0,
    overflow: "hidden",
  },
  cinematicHeaderBg: {
    ...StyleSheet.absoluteFillObject,
  },
  cinematicHeaderGlow: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: Theme.cinematicGlowRed,
    opacity: 0.5,
  },
  cinematicHeaderMesh: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cinematicHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 4,
  },
  cinematicHeaderTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
    letterSpacing: 3,
  },
  headerChip: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Theme.cinematicHeaderChipBg,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  headerChipPressed: {
    backgroundColor: Theme.cinematicHeaderChipBgPressed,
  },

  heroGradient: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 4,
    paddingBottom: 20,
  },
  profileHero: {
    alignItems: "center",
    paddingTop: 8,
  },
  avatarGlow: {
    position: "absolute",
    top: 4,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: Theme.accentGoldMuted,
  },
  avatarGlowEmbedded: {
    width: 128,
    height: 128,
    borderRadius: 64,
    top: 0,
  },
  heroAvatarGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: Layout.spacingMedium,
  },
  orgLogoTouch: {
    position: "relative",
  },
  orgLogoHero: {
    width: 100,
    height: 100,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.surfaceGray,
  },
  avatarTouchSmall: {
    marginBottom: 0,
  },
  avatarFrameSmall: {
    width: 60,
    height: 60,
    borderRadius: 14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  avatarSmall: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surfaceGray,
  },
  avatarEditBadgeSmall: {
    width: 26,
    height: 26,
    borderRadius: 9,
    right: -4,
    bottom: -4,
  },
  orgLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  orgLogoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  orgLogoPreviewWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  orgLogoPreview: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  orgLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: "hidden",
  },
  avatarTouch: { marginBottom: Layout.spacingMedium },
  avatarTouchPressed: { transform: [{ scale: 0.98 }] },
  levelBadgeOnAvatar: {
    position: "absolute",
    left: -4,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0d9488",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  levelBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  avatarFrame: {
    width: 112,
    height: 112,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  avatar: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surfaceGray,
  },
  avatarEditBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  nameText: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 8,
    letterSpacing: -0.3,
  },
  nameTextEmbedded: {
    fontSize: 20,
    marginBottom: 4,
  },
  tierKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.driverPrimary,
    letterSpacing: 2.4,
    marginBottom: 8,
  },
  ratingPillsStack: {
    width: "100%",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingPill: {
    alignItems: "center",
    marginBottom: 6,
  },
  ratingPillPartner: {
    marginTop: 2,
    marginBottom: 0,
  },
  ratingNum: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  ratingPillMuted: {
    minHeight: 32,
    justifyContent: "center",
    marginBottom: 4,
  },
  ratingPillMutedText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  fleetStarRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  starSlot: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  aboutText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 16,
    marginBottom: 12,
  },
  xpCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  xpTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  xpEyebrow: { fontSize: 9, fontWeight: "900", color: "rgba(239,228,216,0.72)", letterSpacing: 2 },
  xpPct: { fontSize: 11, fontWeight: "900", color: Theme.accentGold },
  xpTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.9)",
    overflow: "hidden",
  },
  xpTrackEmbedded: {
    height: 10,
  },
  xpFill: { height: "100%", borderRadius: 999 },
  xpFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  xpFooterTxt: { fontSize: 8, fontWeight: "700", color: "rgba(239,228,216,0.7)", letterSpacing: 0.6 },

  contentWrap: {
    marginTop: -18,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    gap: 14,
  },
  statsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  statsGridEmbedded: {
    flexWrap: "nowrap",
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statIconWell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.accentBrownWash,
    alignItems: "center",
    justifyContent: "center",
  },
  statIconWellGold: {
    backgroundColor: Theme.accentGoldMuted,
  },
  statTileEmbedded: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingVertical: 12,
    borderRadius: 18,
  },
  statTileNum: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  statTileLbl: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  interactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  interactiveRowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  interactiveCopy: { flex: 1, minWidth: 0 },
  interactiveEyebrow: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  interactiveTitle: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  interactiveSub: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  dashIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  premiumCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  premiumCardInner: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  premiumDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginLeft: 60,
  },
  opsPartyRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 6,
    paddingBottom: 8,
    gap: 2,
  },
  opsPartyCell: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  opsPartyLabel: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textPrimary,
    letterSpacing: 0.2,
    textAlign: "center",
  },

  profileItemRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profileItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  profileItemTextWrap: { flex: 1, minWidth: 0, justifyContent: "center" },
  profileItemLabel: {
    fontSize: 9,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: Theme.textMuted,
    marginBottom: 2,
  },
  profileItemValue: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimary,
    lineHeight: 16,
  },

  suiteActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  switchCommerceBtn: {
    flex: 1,
    minWidth: 140,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  switchCommerceBtnPressed: {
    opacity: 0.88,
    backgroundColor: Theme.surfaceGray,
  },
  switchCommerceText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },

  signOutBtn: {
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.cinematicHeaderBg,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  signOutBtnInline: {
    flex: 1,
    minWidth: 120,
    backgroundColor: Theme.negative,
    borderColor: Theme.negative,
  },
  signOutBtnPressed: {
    backgroundColor: Theme.teslaRed,
    transform: [{ scale: 0.985 }],
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 2.4,
  },
  signOutConfirmBackdrop: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  signOutConfirmCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  signOutConfirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  signOutConfirmBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  signOutConfirmActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  signOutConfirmCancelBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 16,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.backgroundInput,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  signOutConfirmCancelBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  signOutConfirmCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  signOutConfirmCtaBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.teslaRed,
  },
  signOutConfirmCtaBtnPressed: {
    opacity: 0.9,
  },
  signOutConfirmCtaBtnDisabled: {
    opacity: 0.7,
  },
  signOutConfirmCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
  },

  roadmapWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Layout.sectionSpacing,
    gap: 12,
  },
  roadmapWrapEmbedded: {
    paddingTop: 10,
    paddingBottom: Layout.sectionSpacing + 8,
  },
  roadmapHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: Layout.minTouchTargetSize,
  },
  roadmapHeaderTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  roadmapHeaderSpacer: {
    width: 40,
    height: 40,
  },
  roadmapBack: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    flexShrink: 0,
  },
  roadmapTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.6,
    textAlign: "center",
  },
  roadmapHero: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    overflow: "hidden",
  },
  roadmapHeroEmbedded: {
    borderRadius: 20,
    marginHorizontal: 0,
  },
  roadmapWatermark: {
    position: "absolute",
    right: 12,
    top: 52,
    opacity: 0.35,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 18,
    zIndex: 1,
  },
  rankCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  crownBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roadmapEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: "rgba(148,163,184,0.95)",
    letterSpacing: 2,
  },
  roadmapTierName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    marginTop: 4,
    lineHeight: 26,
  },
  roadmapTierSub: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(251,191,36,0.85)",
    marginTop: 4,
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  roadmapNextHint: {
    fontSize: 9,
    color: "rgba(148,163,184,0.85)",
    marginTop: 6,
    lineHeight: 13,
  },
  roadmapProgBlock: {
    marginBottom: 14,
    zIndex: 1,
  },
  roadmapProgLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  roadmapProgLeft: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
    lineHeight: 14,
  },
  roadmapProgPct: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "900",
    color: AMBER_400,
    minWidth: 34,
    textAlign: "right",
  },
  roadmapTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  roadmapFill: { height: "100%", backgroundColor: AMBER_400, borderRadius: 999 },
  roadmapSmall: {
    fontSize: 10,
    color: "rgba(255,255,255,0.58)",
    marginTop: 8,
    lineHeight: 14,
  },
  roadmapDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 12,
  },
  roadmapSteps: { gap: 0 },
  roadmapStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 52,
  },
  roadmapDotColumn: {
    width: 20,
    alignItems: "center",
    alignSelf: "stretch",
  },
  roadmapDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  roadmapDotDone: { backgroundColor: "#10b981" },
  roadmapDotActive: { backgroundColor: AMBER_400 },
  roadmapDotUpcoming: { backgroundColor: "#475569" },
  roadmapStepLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    marginTop: 4,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  roadmapStepText: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 12,
  },
  roadmapStepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  roadmapStepTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(226,232,240,0.72)",
    lineHeight: 16,
  },
  roadmapStepTitleActive: { color: "#fff" },
  roadmapStepTitleDone: { color: "#e2e8f0" },
  roadmapStepCount: {
    fontSize: 10,
    fontWeight: "800",
    color: AMBER_400,
    flexShrink: 0,
  },
  roadmapStepSub: {
    fontSize: 9,
    color: "rgba(148,163,184,0.9)",
    marginTop: 3,
    lineHeight: 13,
  },

  // ── Org DP (hero) ──────────────────────────────────────────────
  heroDpWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  heroDpWrapEmbedded: {
    marginBottom: 10,
  },
  orgDpTouch: {
    position: "relative",
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
  },
  orgDpTouchPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  orgDpRing: {
    padding: 3,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Theme.accentGoldBorder,
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  orgDpRingEmbedded: {
    padding: 2,
    borderRadius: 22,
  },
  orgDpImage: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: Theme.cardWhite,
  },
  orgDpImageEmbedded: {
    width: 76,
    height: 76,
    borderRadius: 18,
  },
  orgDpPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Theme.accentBrownDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  orgDpInitialsText: {
    fontSize: 30,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.5,
  },
  orgDpInitialsEmbedded: {
    fontSize: 22,
    letterSpacing: 1,
  },
  orgDpCameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.accentGold,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
  },
  orgDpCameraBadgeEmbedded: {
    width: 32,
    height: 32,
    borderRadius: 16,
    right: -1,
    bottom: -1,
  },
  orgDpHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.2,
  },

  // ── Hero badge row ─────────────────────────────────────────────
  heroBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  modelBadge: {
    backgroundColor: "rgba(239, 228, 216, 0.16)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(239, 228, 216, 0.38)",
  },
  modelBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentBrownSoft,
    letterSpacing: 1.5,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(251,191,36,0.18)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.3)",
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: AMBER_400,
    letterSpacing: 1.5,
  },

  // ── Managed By card ────────────────────────────────────────────
  managedByCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  managedByHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  managedByAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  managedByEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  managedByRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  managedByAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    overflow: "hidden",
    flexShrink: 0,
  },
  managedByInfo: {
    flex: 1,
    minWidth: 0,
  },
  managedByNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  managedByName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  managedByRoleBadge: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    flexShrink: 0,
  },
  managedByRoleText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  managedByMeta: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  managedByCaption: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
});
