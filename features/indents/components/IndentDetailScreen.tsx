/**
 * Indent detail — single indent view. Hero card aligns with Load Center cards
 * (pills, route row, indent id, specs slab); freight card, Live Bids, footer follow.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { IndentAwardCelebrationData } from "@/features/indents/components/bidding/IndentAwardCelebrationModal";
import { IndentAwardCelebrationModal } from "@/features/indents/components/bidding/IndentAwardCelebrationModal";
import { IndentBidAmountEntry } from "@/features/indents/components/bidding/IndentBidAmountEntry";
import { IndentCounterOfferEntry } from "@/features/indents/components/bidding/IndentCounterOfferEntry";
import { IndentGiveLoadPartiesStrip } from "@/features/indents/components/IndentGiveLoadPartiesStrip";
import { IndentLinkedTripCard } from "@/features/indents/components/IndentLinkedTripCard";
import { IndentReviewHubCard } from "@/features/indents/components/IndentReviewHubCard";
import {
    IndentReviewHubBidsBody,
    IndentReviewHubBidsHeader,
    IndentReviewHubSplitLayout,
} from "@/features/indents/components/IndentReviewHubSplitLayout";
import { IndentSupplierPartySummary } from "@/features/indents/components/IndentSupplierPartySummary";
import type { SupplierQuoteActionHint } from "@/features/indents/components/IndentSupplierQuoteCard";
import {
    createDirectQuote,
    submitDirectQuoteCounterOffer,
    updateDirectQuoteStatus,
} from "@/features/indents/services/direct-quotes.service";
import {
    cancelIndent,
    getIndentDisplayNumber,
    getVisibleIndentById,
    shareDraftIndent,
    updateIndent,
    type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  clearInitialIndentForDetail,
  getInitialIndentForDetail,
} from "@/features/indents/initialIndentForDetail";
import {
    indentReviewHubLayout,
    indentReviewHubSpecValue,
    indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import { buildIndentAwardedBidAlert } from "@/features/indents/utils/bidding/indentBidAlert.util";
import {
    bidMarginFromClient,
    buildSupplierQuoteFooterInsight,
} from "@/features/indents/utils/bidding/indentLiveBids.util";
import {
    resolveAwardedVendorName,
    resolveGiveLoadAwardedAmountInr,
    supplierNameByLinkedOrgId,
} from "@/features/network/utils/awardedVendorName.util";
import { shareIndentOnWhatsApp } from "@/features/indents/utils/indentShare.util";
import { resolveIndentClientEntityDisplayName } from "@/features/indents/utils/indentPartyDisplay.util";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { selectIntegratedSuppliersForLoadCenter } from "@/features/network/utils/loadCenterIntegratedParties.util";
import {
    resolveTripPartyLabels,
    type LoadCenterDriverProfile,
} from "@/features/network/utils/loadCenterTripAllocation.util";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { canAccessSuppliers } from "@/lib/capabilities";
import { formatINR } from "@/lib/format";
import {
    useClientsQuery,
    useDriversQuery,
    useSuppliersQuery,
    useTripsQuery,
    useVehiclesQuery,
} from "@/lib/queries";
import {
    useDriverDirectBidsForPostQuery,
    useMarketBidsForIndentQuery,
} from "@/lib/queries/useBidsQuery";
import {
    useIndentDirectQuotesQuery,
    useInvalidateIndents,
    useMyDirectQuotesQuery,
} from "@/lib/queries/useIndentsQuery";
import { mergeIndentReviewHubOffers } from "@/features/indents/utils/bidding/indentReviewHubOffers.util";
import { useInvalidatePosts, useIndentStoryStatesQuery } from "@/lib/queries/usePostsQuery";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useCapabilities } from "@/lib/useCapabilities";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { useMemberAccess } from "@/lib/useMemberAccess";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE, shouldRetryQuery } from "@/lib/queryClient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * First paint: the list IndentRow seed stashed by the Load Center / Load
 * Board before navigating here, if any. `getVisibleIndentById` remains the
 * authoritative hydration source — never written into any query cache.
 */
function peekIndentFirstPaint(indentId: string | null | undefined): IndentRow | null {
  if (!indentId) return null;
  return getInitialIndentForDetail(indentId);
}

export interface IndentDetailScreenProps {
  indentId: string;
  onBack: () => void;
  /** Optional: called when Edit or Edit All is pressed. */
  onEditPress?: (indent: IndentRow) => void;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getShareValidationErrors(indent: IndentRow): string[] {
  const issues: string[] = [];
  if (!(indent.pickup_area ?? "").trim()) issues.push("Origin is required");
  if (!(indent.drop_location ?? "").trim())
    issues.push("Destination is required");
  if (!(indent.client_name ?? "").trim()) issues.push("Client is required");
  if (
    !Number(indent.client_price ?? 0) ||
    Number(indent.client_price ?? 0) <= 0
  )
    issues.push("Budget must be greater than 0");
  if (Number(indent.supplier_target ?? 0) < 0)
    issues.push("Supplier target cannot be negative");
  if (!(indent.vehicle_type ?? "").trim()) issues.push("Vehicle is required");
  if (!(indent.load_type ?? "").trim()) issues.push("Load type is required");
  if (!Number(indent.weight ?? 0) || Number(indent.weight ?? 0) <= 0)
    issues.push("Weight must be greater than 0");
  return issues;
}

const LOCKED_INDENT_STATUSES = new Set([
  "awarded",
  "assigned",
  "deployed",
  "completed",
  "cancelled",
  "closed",
  "expired",
  "broadcast",
]);

const SUPPLIER_BID_ENABLED_STATUSES = new Set([
  "open",
  "pending",
  "broadcast",
  "draft",
  // Legacy compatibility only. No new indents enter 'quoted' after 20270128103100.
  "quoted",
]);

function formatIndentDate(
  pickupDate: string | null,
  createdAt: string,
): string {
  const source = pickupDate?.trim() || createdAt;
  try {
    const d = new Date(source);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return source.slice(0, 10) || "—";
  }
}

function formatPlacedOnDate(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function IndentDetailScreen({
  indentId,
  onBack,
  onEditPress,
}: IndentDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compactHub = windowHeight < 820;
  const useSplitHub = windowWidth >= 880 && windowHeight >= 560;
  const stackedHub = !useSplitHub;
  const hubDense = compactHub || stackedHub;
  const footerReserve = stackedHub ? 12 : compactHub ? 52 : 64;
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canViewIndent = canSurface("tripops.indents.view");
  const canAllocateIndent = canSurface("tripops.indents.allocate");
  const canUseSuppliers =
    canAccessSuppliers(capabilities) && canViewIndent;
  const orgId = currentOrganization?.id ?? null;
  const queryClient = useQueryClient();
  const invalidateIndents = useInvalidateIndents();
  const invalidatePosts = useInvalidatePosts(orgId);
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  const enrichmentOrgId = enrichmentOpen ? orgId : null;
  const { data: trips = [] } = useTripsQuery(enrichmentOrgId);
  const { data: drivers = [] } = useDriversQuery(enrichmentOrgId);
  const { data: vehicles = [] } = useVehiclesQuery(enrichmentOrgId);
  const { data: suppliers = [] } = useSuppliersQuery(
    canUseSuppliers ? enrichmentOrgId : null,
  );
  const { data: clients = [] } = useClientsQuery(enrichmentOrgId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const integratedSuppliers = useMemo(
    () =>
      selectIntegratedSuppliersForLoadCenter(suppliers, linkedOrgByOrganizationId),
    [suppliers, linkedOrgByOrganizationId],
  );
  const [indent, setIndent] = useState<IndentRow | null>(() =>
    peekIndentFirstPaint(indentId),
  );
  const indentStoryIds = useMemo(
    () => (indent?.id ? [indent.id] : []),
    [indent?.id],
  );
  const indentStoryStatesQ = useIndentStoryStatesQuery(orgId, indentStoryIds);
  const pulseStoryState = indent?.id
    ? indentStoryStatesQ.data?.[indent.id]
    : undefined;
  const pulseStoryLive = pulseStoryState?.isLive === true;
  const pulseStoryPostId = pulseStoryState?.postId ?? null;
  const [loading, setLoading] = useState(() => peekIndentFirstPaint(indentId) == null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [confirmShareVisible, setConfirmShareVisible] = useState(false);
  const [sharingDraft, setSharingDraft] = useState(false);
  const [shareStorySheetVisible, setShareStorySheetVisible] = useState(false);
  const [boostSheetVisible, setBoostSheetVisible] = useState(false);
  const [boostPostIdOverride, setBoostPostIdOverride] = useState<string | null>(
    null,
  );
  const boostPostId = boostPostIdOverride ?? pulseStoryPostId;
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [awardConfirmQuoteId, setAwardConfirmQuoteId] = useState<string | null>(
    null,
  );
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterQuoteId, setCounterQuoteId] = useState<string | null>(null);
  const [submittingCounter, setSubmittingCounter] = useState(false);
  const [awardCelebration, setAwardCelebration] =
    useState<IndentAwardCelebrationData | null>(null);
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [quoteEntryError, setQuoteEntryError] = useState<string | undefined>();
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  /** Whether we currently have seed data to show while `load()` is in flight — first mount only, reset per `indentId`. */
  const hasSeedDataRef = useRef(peekIndentFirstPaint(indentId) != null);
  /** Guards a resolving `load()` from writing state after the user has already switched to a different indent. */
  const activeIndentIdRef = useRef(indentId);

  const indentMountRef = useRef(true);
  useEffect(() => {
    activeIndentIdRef.current = indentId;
    initialLoadDoneRef.current = false;
    setError(null);
    if (indentMountRef.current) {
      // Initial mount already seeded `indent`/`loading` via useState initializers above.
      indentMountRef.current = false;
      return;
    }
    // Switching to a different indent on an already-mounted screen instance:
    // reset first so stale Indent A data never shows under Indent B's id,
    // then seed from the registry if available.
    const seed = peekIndentFirstPaint(indentId);
    hasSeedDataRef.current = seed != null;
    setIndent(seed);
    setLoading(seed == null);
  }, [indentId]);

  useEffect(() => {
    if (!indent?.id) {
      setEnrichmentOpen(false);
      return;
    }
    const t = setTimeout(() => setEnrichmentOpen(true), 1_600);
    return () => clearTimeout(t);
  }, [indent?.id]);

  const isLikelyOwner = !indent || indent.organization_id === orgId;
  const {
    data: directQuotes = [],
    refetch: refetchQuotes,
    isPending: directQuotesPending,
    isFetched: directQuotesFetched,
  } = useIndentDirectQuotesQuery(indentId);
  const linkedPostQ = useQuery({
    queryKey: ["q", "posts", "latest-load-for-indent", indentId ?? ""],
    queryFn: async () => {
      const { getLatestLoadPostIdForIndent } = await import(
        "@/features/network/services/bids.service"
      );
      const res = await getLatestLoadPostIdForIndent(indentId!);
      if (res.error) throw res.error;
      return res.postId;
    },
    enabled: Boolean(indentId && orgId && isLikelyOwner),
    staleTime: STALE.moderate,
    retry: shouldRetryQuery,
  });
  const driverDirectBidsQ = useDriverDirectBidsForPostQuery(
    isLikelyOwner ? (linkedPostQ.data ?? null) : null,
  );
  const marketBidsQ = useMarketBidsForIndentQuery(
    isLikelyOwner ? indentId : null,
  );
  const quotes = useMemo(
    () =>
      mergeIndentReviewHubOffers({
        indentId: indentId ?? "",
        directQuotes,
        driverBids: driverDirectBidsQ.data,
        marketBids: marketBidsQ.data,
      }),
    [indentId, directQuotes, driverDirectBidsQ.data, marketBidsQ.data],
  );
  const quotesLoading =
    (directQuotesPending && !directQuotesFetched) ||
    (Boolean(isLikelyOwner && indentId) &&
      marketBidsQ.isPending &&
      !marketBidsQ.isFetched);
  const { data: myQuotes = [], refetch: refetchMyQuotes } =
    useMyDirectQuotesQuery(orgId, { immediate: true });

  const load = useCallback(async () => {
    if (!indentId) {
      setLoading(false);
      return;
    }
    const requestIndentId = indentId;
    if (!isRefreshingRef.current && !initialLoadDoneRef.current && !hasSeedDataRef.current)
      setLoading(true);
    setError(null);
    const { error: err, indent: row } = await getVisibleIndentById(
      orgId,
      indentId,
    );
    // The user navigated to a different indent while this was in flight — a
    // newer load() for the new indentId owns state now, discard this one.
    if (activeIndentIdRef.current !== requestIndentId) return;
    setLoading(false);
    initialLoadDoneRef.current = true;
    hasSeedDataRef.current = false;
    isRefreshingRef.current = false;
    setRefreshing(false);
    clearInitialIndentForDetail(requestIndentId);
    if (err) {
      setError(err.message);
      setIndent(null);
      return;
    }
    setIndent(row);
  }, [indentId, orgId]);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
    refetchQuotes();
  }, [load, refetchQuotes]);

  const handleEditAll = useCallback(() => {
    if (indent && normalizeStatus(indent.status) === "broadcast") {
      Alert.alert(
        "Read-only indent",
        "This indent has been shared and cannot be edited",
      );
      return;
    }
    if (indent && onEditPress) onEditPress(indent);
    else Alert.alert("Edit", "Edit indent flow coming soon.");
  }, [indent, onEditPress]);

  const executeBroadcast = useCallback(async () => {
    if (!indent) return;
    setSharingDraft(true);
    setBroadcastError(null);
    const { error } = await shareDraftIndent(indent.id);
    setSharingDraft(false);
    if (error) {
      setBroadcastError(error.message);
      Alert.alert("Could not share", error.message);
      return;
    }
    setConfirmShareVisible(false);
    if (orgId) invalidateIndents(orgId, { bustPartnerSupplierMarket: true });
    await load();
    setIsBroadcasting(true);
    setTimeout(() => setIsBroadcasting(false), 1800);
  }, [indent, orgId, invalidateIndents, load]);

  const handleBroadcast = useCallback(() => {
    if (!indent) return;
    if (normalizeStatus(indent.status) !== "draft") {
      Alert.alert(
        "Already shared",
        "This indent has already been shared with the network.",
      );
      return;
    }
    const validationIssues = getShareValidationErrors(indent);
    if (validationIssues.length > 0) {
      Alert.alert(
        "Complete draft before sharing",
        `Please fix the following before sharing:\n\n• ${validationIssues.join("\n• ")}`,
        [
          { text: "Close", style: "cancel" },
          { text: "Edit Draft", onPress: handleEditAll },
        ],
      );
      return;
    }
    setBroadcastError(null);
    setConfirmShareVisible(true);
  }, [indent, handleEditAll]);

  const handleOpenShareStory = useCallback(() => {
    if (!indent) return;
    setShareStorySheetVisible(true);
  }, [indent]);

  const handleShareWhatsApp = useCallback(async () => {
    if (!indent) return;
    await shareIndentOnWhatsApp(indent);
  }, [indent]);

  const handleBoostReach = useCallback(() => {
    const postId = boostPostIdOverride ?? pulseStoryPostId;
    if (!postId) return;
    if (!pulseStoryLive && !boostPostIdOverride) return;
    setBoostSheetVisible(true);
  }, [pulseStoryLive, pulseStoryPostId, boostPostIdOverride]);

  const handleStoryShareSuccess = useCallback(() => {
    if (orgId) {
      invalidatePosts();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.posts.indentStories(orgId, indent?.id ?? ""),
      });
    }
  }, [orgId, invalidatePosts, queryClient, indent?.id]);

  const openIntegratedSuppliersNetwork = useCallback(() => {
    router.push(ROUTES.TABS.NETWORK as import("expo-router").Href);
  }, [router]);

  const handleIntegratedPartyPress = useCallback(
    (party: LoadCenterIntegratedParty) => {
      router.push(ROUTES.supplierDetail(party.id) as import("expo-router").Href);
    },
    [router],
  );

  const executeAwardQuote = useCallback(
    async (quoteIdOverride?: string) => {
      if (!indentId || !indent) return;
      const targetId = quoteIdOverride ?? selectedQuoteId;
      if (!targetId) return;
      const pendingQuotes = quotes.filter(
        (q) => (q.status || "").toLowerCase() === "pending",
      );
      const winner = pendingQuotes.find((q) => q.id === targetId);
      if (!winner) {
        Alert.alert(
          "Invalid selection",
          "Please select a pending offer to award.",
        );
        return;
      }
      const indentStatus = normalizeStatus(indent.status);
      if (indentStatus === "awarded" || indentStatus === "completed") {
        Alert.alert("Already awarded", "This load has already been awarded.");
        return;
      }
      try {
        setAwarding(true);
        setSelectedQuoteId(winner.id);
        const source = winner.offer_source ?? "direct_quote";
        if (source === "driver_direct_bid") {
          const { acceptDriverDirectBid } = await import(
            "@/features/network/services/bids.service"
          );
          const { error: acceptErr } = await acceptDriverDirectBid(winner.id);
          if (acceptErr) {
            Alert.alert("Could not award", acceptErr.message);
            return;
          }
        } else if (source === "market_bid") {
          const { awardMarketBid } = await import(
            "@/features/network/services/marketBids.service"
          );
          const { error: acceptErr } = await awardMarketBid(winner.id);
          if (acceptErr) {
            Alert.alert("Could not award", acceptErr.message);
            return;
          }
        } else {
          const { error: acceptErr } = await updateDirectQuoteStatus(
            winner.id,
            "accepted",
          );
          if (acceptErr) {
            Alert.alert("Could not award", acceptErr.message);
            return;
          }
          await Promise.allSettled(
            pendingQuotes
              .filter(
                (q) =>
                  q.id !== winner.id &&
                  (q.offer_source ?? "direct_quote") === "direct_quote",
              )
              .map((q) => updateDirectQuoteStatus(q.id, "rejected")),
          );
        }
        const awardedAmount = Number(winner.amount ?? 0);
        // Status only — bundling supplier_target here fails on broadcast indents
        // (enforce_indent_draft_broadcast_rules blocks commercial edits), which
        // used to leave awards stuck at broadcast after the quote was accepted.
        const { error: indentErr } = await updateIndent(indentId, {
          status: "awarded",
        });
        if (indentErr) {
          Alert.alert(
            "Quote accepted but status update failed",
            indentErr.message +
              "\n\nThe quote was accepted. The supplier can assign and deploy from Claimed.",
          );
        }
        const clientRate = Number(indent.client_price ?? 0);
        const margin = clientRate > 0 ? clientRate - awardedAmount : 0;
        const marginPercent =
          clientRate > 0
            ? (((clientRate - awardedAmount) / clientRate) * 100).toFixed(1)
            : "0";
        setAwardCelebration({
          carrier: winner.bidder_organization_name?.trim() || "Supplier",
          finalAmount: awardedAmount,
          margin,
          marginPercent,
        });
        setSelectedQuoteId(null);
        if (orgId) {
          invalidateIndents(orgId, { bustPartnerSupplierMarket: true });
          invalidatePosts();
        }
        queryClient.invalidateQueries({
          queryKey: ["indents", indentId, "direct-quotes"],
        });
        await load();
        refetchQuotes();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        Alert.alert("Could not award", msg);
      } finally {
        setAwarding(false);
      }
    },
    [
      indentId,
      indent,
      selectedQuoteId,
      quotes,
      orgId,
      invalidateIndents,
      invalidatePosts,
      queryClient,
      load,
      refetchQuotes,
    ],
  );

  const handleAwardQuote = useCallback(
    (quoteIdOverride?: string) => {
      if (!indentId || !indent || awarding) return;
      const targetId = quoteIdOverride ?? selectedQuoteId;
      if (!targetId) return;
      const winner = quotes.find(
        (q) =>
          q.id === targetId && (q.status || "").toLowerCase() === "pending",
      );
      if (!winner) {
        Alert.alert(
          "Invalid selection",
          "Please select a pending offer to award.",
        );
        return;
      }
      const indentStatus = normalizeStatus(indent.status);
      if (indentStatus === "awarded" || indentStatus === "completed") {
        Alert.alert("Already awarded", "This load has already been awarded.");
        return;
      }

      setSelectedQuoteId(winner.id);
      setAwardConfirmQuoteId(winner.id);
    },
    [indentId, indent, awarding, selectedQuoteId, quotes],
  );

  const awardConfirmQuote =
    awardConfirmQuoteId != null
      ? (quotes.find((q) => q.id === awardConfirmQuoteId) ?? null)
      : null;

  const closeAwardConfirm = useCallback(() => {
    if (awarding) return;
    setAwardConfirmQuoteId(null);
  }, [awarding]);

  const confirmAwardQuote = useCallback(() => {
    if (!awardConfirmQuoteId || awarding) return;
    const id = awardConfirmQuoteId;
    setAwardConfirmQuoteId(null);
    void executeAwardQuote(id);
  }, [awardConfirmQuoteId, awarding, executeAwardQuote]);

  const openCounterOffer = useCallback((quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setCounterQuoteId(quoteId);
    setCounterModalVisible(true);
  }, []);

  const handleSubmitCounter = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!counterQuoteId) return false;
      try {
        setSubmittingCounter(true);
        const { error } = await submitDirectQuoteCounterOffer(
          counterQuoteId,
          amount,
        );
        if (error) {
          Alert.alert("Could not send counter", error.message);
          return false;
        }
        setCounterModalVisible(false);
        setCounterQuoteId(null);
        queryClient.invalidateQueries({
          queryKey: ["indents", indentId, "direct-quotes"],
        });
        refetchQuotes();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        Alert.alert("Could not send counter", msg);
        return false;
      } finally {
        setSubmittingCounter(false);
      }
    },
    [counterQuoteId, indentId, queryClient, refetchQuotes],
  );
  const handleCancelLoad = useCallback(() => {
    if (!indent || cancelling) return;
    Alert.alert(
      "Cancel load",
      "Are you sure you want to cancel this load? Connected suppliers will no longer see it under Find Work.",
      [
        { text: "Keep load", style: "cancel" },
        {
          text: "Cancel load",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              const { error: cancelError } = await cancelIndent(indent.id);
              setCancelling(false);
              if (cancelError) {
                Alert.alert("Could not cancel", cancelError.message);
                return;
              }
              await load();
            } catch (e) {
              setCancelling(false);
              const msg = e instanceof Error ? e.message : "Unknown error";
              Alert.alert("Could not cancel", msg);
            }
          },
        },
      ],
    );
  }, [cancelling, indent, load]);

  useEffect(() => {
    load();
  }, [load]);

  const myQuote = useMemo(
    () =>
      indent ? (myQuotes.find((q) => q.indent_id === indent.id) ?? null) : null,
    [myQuotes, indent],
  );

  const linkedTrip = useMemo(() => {
    if (!indent) return null;
    return trips.find((t) => (t.indent_id ?? "") === indent.id) ?? null;
  }, [trips, indent]);

  const driverProfileById = useMemo(() => {
    const m = new Map<string, LoadCenterDriverProfile>();
    for (const d of drivers) {
      const name = String(
        (d as { full_name?: string; name?: string }).full_name ??
          (d as { name?: string }).name ??
          "",
      ).trim();
      if (!d.id) continue;
      m.set(d.id, {
        name: name || "Driver",
        avatarUrl: (d as { avatar_url?: string | null }).avatar_url ?? null,
        avatarSeed: (d as { avatar_seed?: string | null }).avatar_seed ?? null,
      });
    }
    return m;
  }, [drivers]);

  const vehicleById = useMemo(() => {
    const m = new Map<string, { vehicle_number?: string | null }>();
    for (const v of vehicles) {
      if (!v.id) continue;
      m.set(v.id, { vehicle_number: v.vehicle_number ?? null });
    }
    return m;
  }, [vehicles]);

  const linkedTripPartyLabels = useMemo(
    () =>
      resolveTripPartyLabels(linkedTrip, {
        quote: myQuote,
        driverById: driverProfileById,
        vehicleById,
      }),
    [linkedTrip, myQuote, driverProfileById, vehicleById],
  );

  const handleSupplierAllocate = useCallback(() => {
    if (!indent) return;
    if (linkedTrip?.id) {
      router.push(ROUTES.tripAssignment(linkedTrip.id, "vehicle") as never);
      return;
    }
    router.push(ROUTES.indentAllocation(indent.id) as never);
  }, [indent, linkedTrip, router]);

  const closeQuoteEntry = useCallback(() => {
    setQuoteModalVisible(false);
    setQuoteEntryError(undefined);
  }, []);

  const openQuoteEntry = useCallback(() => {
    setQuoteEntryError(undefined);
    setQuoteModalVisible(true);
  }, []);

  const submitQuoteAmount = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!indent || !orgId || submittingQuote) return false;
      try {
        setSubmittingQuote(true);
        const { error: quoteError } = await createDirectQuote(
          indent.id,
          orgId,
          amount,
        );
        if (quoteError) {
          setQuoteEntryError(quoteError.message);
          return false;
        }
        queryClient.invalidateQueries({
          queryKey: ["indents", indent.id, "direct-quotes"],
        });
        queryClient.invalidateQueries({
          queryKey: ["indents", "quote-counts"],
        });
        setQuoteEntryError(undefined);
        await Promise.allSettled([refetchMyQuotes(), refetchQuotes(), load()]);
        // Keep entry open — IndentBidAmountEntry shows BidConfirmModal success.
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        setQuoteEntryError(msg);
        return false;
      } finally {
        setSubmittingQuote(false);
      }
    },
    [
      indent,
      orgId,
      queryClient,
      refetchMyQuotes,
      refetchQuotes,
      load,
      submittingQuote,
    ],
  );

  const myQuoteStatus = normalizeStatus(myQuote?.status);
  const supplierQuoteAlert = useMemo(
    () =>
      myQuote && myQuoteStatus === "accepted"
        ? buildIndentAwardedBidAlert(myQuote, indent?.pickup_date ?? null)
        : null,
    [indent?.pickup_date, myQuote, myQuoteStatus],
  );

  const isOwnerBeforeRender = !!orgId && indent?.organization_id === orgId;
  const statusLowerBeforeRender = normalizeStatus(indent?.status);
  const canSupplierBidBeforeRender =
    !isOwnerBeforeRender &&
    SUPPLIER_BID_ENABLED_STATUSES.has(statusLowerBeforeRender);
  const canOpenQuoteModalBeforeRender =
    canSupplierBidBeforeRender &&
    statusLowerBeforeRender !== "awarded" &&
    statusLowerBeforeRender !== "completed";

  const supplierFooterInsight = useMemo(
    () =>
      !isOwnerBeforeRender && indent
        ? buildSupplierQuoteFooterInsight({
            amount: Number(myQuote?.amount ?? 0),
            targetRateInr: Number(indent.supplier_target ?? 0),
            status: myQuoteStatus,
            canUpdateBid: canOpenQuoteModalBeforeRender,
            hasQuote: !!myQuote,
          })
        : null,
    [
      isOwnerBeforeRender,
      indent,
      myQuote,
      myQuoteStatus,
      canOpenQuoteModalBeforeRender,
    ],
  );

  if (loading && !indent) {
    return <CenteredLoadingView message="Loading indent…" />;
  }

  if (!canViewIndent) {
    return (
      <View style={styles.errorStateBody}>
        <Text style={styles.errorText}>
          You don’t have access to this indent.
        </Text>
      </View>
    );
  }

  if (error || !indent) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Layout.headerPaddingBelowInset },
          ]}
        >
          <TouchableOpacity
            onPress={onBack}
            style={styles.headerIconBtn}
            activeOpacity={0.8}
            accessibilityLabel="Back"
          >
            <FontAwesome
              name="chevron-left"
              size={20}
              color={Theme.textOnDark}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerId} numberOfLines={1}>
              INDENT
            </Text>
            <Text style={styles.headerSubtitle}>Review Hub • Indent</Text>
          </View>
          <View style={styles.headerIconBtnPlaceholder} />
        </View>
        <View style={styles.errorStateBody}>
          <Text style={styles.errorText}>{error ?? "Indent not found."}</Text>
        </View>
      </View>
    );
  }

  const displayNumber = getIndentDisplayNumber(indent);
  const origin = indent.pickup_area || "—";
  const destination = indent.drop_location || "—";
  const status = (indent.status || "OPEN").toUpperCase();
  const statusLower = normalizeStatus(indent.status);
  const isDirect =
    (indent.circulation_target || "").toLowerCase() !== "marketplace";
  /** Originated from a Commerce (multi-order e-commerce) execution plan — no new column, existing FK. */
  const isCommerce = Boolean(indent.execution_plan_id);
  const isOwner = !!orgId && indent.organization_id === orgId;
  const clientEntityRawName = resolveIndentClientEntityDisplayName(indent, orgId);
  const awardedQuote =
    quotes.find((q) => normalizeStatus(q.status) === "accepted") ?? null;
  const tripSupplier = linkedTrip?.supplier_id
    ? suppliers.find((s) => s.id === linkedTrip.supplier_id)
    : undefined;
  const awardedVendorName = resolveAwardedVendorName({
    assignedSupplierOrgId: indent.assigned_supplier_id ?? null,
    sessionName: awardedQuote?.bidder_organization_name ?? null,
    supplierNameByOrgId: supplierNameByLinkedOrgId(suppliers),
    fallbackName:
      (tripSupplier?.name ||
        tripSupplier?.company_name ||
        linkedTrip?.supplier_name ||
        (linkedTrip?.driver_id
          ? driverProfileById.get(linkedTrip.driver_id)?.name
          : "") ||
        linkedTrip?.driver_display_name ||
        "") || null,
  });
  const awardedSupplierAmount = resolveGiveLoadAwardedAmountInr({
    assignedSupplierRate: indent.assigned_supplier_rate,
    awardedAmount: indent.awarded_amount,
    indentSupplierRate: indent.supplier_rate,
    acceptedQuoteAmount: awardedQuote?.amount,
    tripSupplierRate: linkedTrip?.supplier_rate,
    tripDriverCommission: linkedTrip?.driver_commission,
    tripClientPrice: linkedTrip?.client_price,
    supplierTarget: indent.supplier_target,
  });
  const showAwardedSupplierRate =
    statusLower === "awarded" ||
    statusLower === "completed" ||
    statusLower === "deployed";
  const effectiveSupplierAmount =
    showAwardedSupplierRate && awardedSupplierAmount != null
      ? awardedSupplierAmount
      : Number(indent.supplier_target ?? 0);
  const freight = formatINR(Number(indent.client_price ?? 0));
  const supplierTargetNum = Number(indent.supplier_target ?? 0);
  const supplierTarget = formatINR(supplierTargetNum);
  const vehicleType = indent.vehicle_type || "—";
  const material = indent.load_type || "—";
  const weightKg =
    indent.weight != null && Number(indent.weight) > 0
      ? `${Number(indent.weight)} KG`
      : "—";
  const dateLabel = formatIndentDate(
    indent.pickup_date ?? null,
    indent.created_at,
  );
  const createdAtLabel = formatPlacedOnDate(indent.created_at);

  const clientPriceNum = Number(indent.client_price ?? 0);
  const supplierNum = effectiveSupplierAmount;
  const marginPct =
    isOwner && clientPriceNum > 0 && supplierTargetNum > 0
      ? Math.round(((clientPriceNum - supplierTargetNum) / clientPriceNum) * 100)
      : null;
  const hasMyPendingQuote = myQuoteStatus === "pending";
  const isLockedStatus = LOCKED_INDENT_STATUSES.has(statusLower);
  const canCancelLoad =
    canUseSuppliers &&
    isOwner &&
    !isLockedStatus &&
    canSurface("tripops.indents.cancel");
  const canEditLoad =
    canUseSuppliers &&
    isOwner &&
    !isLockedStatus &&
    canSurface("tripops.indents.edit");
  const canBroadcast =
    canUseSuppliers &&
    isOwner &&
    statusLower === "draft" &&
    canSurface("tripops.indents.broadcast");
  const canAward =
    statusLower !== "awarded" &&
    statusLower !== "completed" &&
    statusLower !== "deployed" &&
    canSurface("tripops.indents.award");
  const canSupplierBid =
    !isOwner &&
    SUPPLIER_BID_ENABLED_STATUSES.has(statusLower) &&
    canSurface("tripops.indents.bid");
  const canOpenQuoteModal =
    canSupplierBid && statusLower !== "awarded" && statusLower !== "completed";
  const liveBidsCount = isOwner ? quotes.length : myQuote ? 1 : 0;
  const isListeningForBids =
    isOwner &&
    (statusLower === "broadcast" || statusLower === "open") &&
    liveBidsCount === 0;
  const isIndentCompleted = statusLower === "completed";
  const supplierFooterStatus =
    myQuoteStatus === "accepted"
      ? isIndentCompleted
        ? "COMPLETED"
        : "BIDS WON"
      : myQuoteStatus === "rejected"
        ? "BID REJECTED"
        : "BIDDING LOCKED";

  const showSupplierPartySummaries =
    !isOwner &&
    !!myQuote &&
    myQuoteStatus === "accepted" &&
    (isIndentCompleted || !!linkedTrip);
  const canSupplierAllocateVehicle =
    canAllocateIndent &&
    !isOwner &&
    myQuoteStatus === "accepted" &&
    !isIndentCompleted &&
    (statusLower === "awarded" || statusLower === "assigned" || statusLower === "deployed");

  const supplierQuoteActionHint: SupplierQuoteActionHint = canSupplierAllocateVehicle
    ? "allocate"
    : !canOpenQuoteModal && !showSupplierPartySummaries
      ? "locked"
      : isIndentCompleted && myQuoteStatus === "accepted"
        ? "completed"
        : null;

  const supplierAllocateLabel = "Allocate";

  const showGiveLoadPartiesStrip =
    canUseSuppliers &&
    isOwner &&
    !["awarded", "completed", "deployed", "cancelled", "closed", "expired"].includes(
      statusLower,
    );

  const selectedQuote =
    selectedQuoteId != null
      ? (quotes.find((q) => q.id === selectedQuoteId) ?? null)
      : null;
  const selectedPendingQuote =
    selectedQuote && normalizeStatus(selectedQuote.status) === "pending"
      ? selectedQuote
      : null;
  const selectedAwardMargin = selectedPendingQuote
    ? bidMarginFromClient(
        clientPriceNum,
        Number(selectedPendingQuote.amount ?? 0),
      )
    : null;
  const canAwardSelected =
    canAward &&
    !!selectedPendingQuote &&
    !awarding &&
    quotes.some((q) => normalizeStatus(q.status) === "pending");

  const counterQuote =
    counterQuoteId != null
      ? (quotes.find((q) => q.id === counterQuoteId) ?? null)
      : null;

  const showMobileAwardFooter =
    stackedHub &&
    isOwner &&
    canAward &&
    quotes.some((q) => normalizeStatus(q.status) === "pending");
  const hideStickyFooter = stackedHub && !showMobileAwardFooter;
  const contentFooterReserve = hideStickyFooter
    ? 8
    : showMobileAwardFooter
      ? 52
      : footerReserve;

  const myCounterAmount =
    myQuote?.counter_amount != null && Number(myQuote.counter_amount) > 0
      ? Number(myQuote.counter_amount)
      : null;
  const isCounteredPending =
    !isOwner &&
    hasMyPendingQuote &&
    myCounterAmount != null &&
    myCounterAmount > 0;

  const mobilePrimaryAction = (() => {
    if (linkedTrip?.id) {
      return {
        label: "View trip →",
        onPress: () => {
          router.push(ROUTES.tripDetail(linkedTrip.id) as never);
        },
      };
    }
    if (!isOwner && canOpenQuoteModal && isCounteredPending) {
      return {
        label: `Accept ${formatINR(myCounterAmount!)}`,
        onPress: () => {
          void submitQuoteAmount(myCounterAmount!);
        },
      };
    }
    if (!isOwner && canOpenQuoteModal) {
      return {
        label: hasMyPendingQuote ? "Update bid" : "Submit bid",
        onPress: openQuoteEntry,
      };
    }
    if (!isOwner && canSupplierAllocateVehicle) {
      return {
        label: supplierAllocateLabel,
        onPress: handleSupplierAllocate,
      };
    }
    if (isOwner && canBroadcast) {
      return {
        label: "Share load",
        onPress: () => setConfirmShareVisible(true),
      };
    }
    if (isOwner && liveBidsCount > 0) {
      const pendingQuotes = quotes.filter(
        (q) => normalizeStatus(q.status) === "pending",
      );
      const lowestPending = [...pendingQuotes].sort(
        (a, b) => Number(a.amount ?? 0) - Number(b.amount ?? 0),
      )[0];
      if (lowestPending && canAward) {
        const alreadySelected = selectedQuoteId === lowestPending.id;
        return {
          label: alreadySelected
            ? "Award selected"
            : pendingQuotes.length === 1
              ? "Select bid"
              : "Select lowest bid",
          onPress: () => {
            if (alreadySelected) {
              void handleAwardQuote(lowestPending.id);
            } else {
              setSelectedQuoteId(lowestPending.id);
            }
          },
        };
      }
      return {
        label: "Review bids",
        onPress: () => {
          if (lowestPending) setSelectedQuoteId(lowestPending.id);
        },
      };
    }
    if (isOwner && canEditLoad) {
      return { label: "Edit load", onPress: handleEditAll };
    }
    if (isOwner && canCancelLoad) {
      return { label: "Cancel load", onPress: handleCancelLoad };
    }
    return null;
  })();

  return (
    <View
      style={[
        styles.container,
        stackedHub && styles.containerMobile,
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          stackedHub && styles.headerMobile,
          compactHub && styles.headerCompact,
          { paddingTop: insets.top + (stackedHub ? 8 : Layout.headerPaddingBelowInset) },
        ]}
      >
        <TouchableOpacity
          onPress={onBack}
          style={[styles.headerIconBtn, stackedHub && styles.headerIconBtnMobile]}
          activeOpacity={0.8}
          accessibilityLabel="Back"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <FontAwesome
            name="chevron-left"
            size={stackedHub ? 18 : 20}
            color={stackedHub ? Theme.textPrimaryDark : Theme.textOnDark}
          />
        </TouchableOpacity>
        {stackedHub ? (
          <>
            <Text style={styles.headerMobileTitle} numberOfLines={1}>
              {isOwner ? "Loads" : "My bid"}
            </Text>
            <TouchableOpacity
              style={styles.headerHelpBtn}
              activeOpacity={0.8}
              accessibilityLabel="Help"
              hitSlop={Layout.touchTargetHitSlop}
              onPress={() =>
                Alert.alert(
                  isOwner ? "Load help" : "Bid help",
                  isOwner
                    ? "Track status, review bids, and manage rates from this page. Cancel is available until the load is awarded."
                    : "See your bid amount, status vs shipper target, and update while pending. Awarded bids unlock vehicle allocation.",
                )
              }
            >
              <View style={styles.headerHelpIcon}>
                <Text style={styles.headerHelpIconText}>?</Text>
              </View>
              <Text style={styles.headerHelpText}>Help</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.headerCenter}>
              <Text style={styles.headerId} numberOfLines={1}>
                {displayNumber}
              </Text>
              <View style={styles.headerSubtitleRow}>
                {(statusLower === "open" ||
                  statusLower === "broadcast" ||
                  // Legacy compatibility only — no new 'quoted' after 20270128103100.
                  statusLower === "quoted" ||
                  statusLower === "pending") &&
                !["awarded", "completed", "deployed", "cancelled"].includes(
                  statusLower,
                ) ? (
                  <View style={styles.headerLiveDot} />
                ) : (
                  <View style={styles.headerStatusDot} />
                )}
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {compactHub
                    ? `Review Hub · ${status === "OPEN" ? "Active" : status}`
                    : `Review Hub · ${status === "OPEN" ? "Active" : status}${
                        clientEntityRawName && clientEntityRawName !== "—"
                          ? ` · ${clientEntityRawName}`
                          : ""
                      }${
                        getTripOperationalDisplay({
                          trip_number: indent.trip_number ?? null,
                        }) !== "—"
                          ? ` · ${getTripOperationalDisplay({ trip_number: indent.trip_number ?? null })}`
                          : ""
                      }`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.headerIconBtn}
              activeOpacity={0.8}
              accessibilityLabel="More actions"
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome name="ellipsis-h" size={20} color={Theme.textOnDark} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Summary + bids (split on wide web, stacked on mobile) */}
      <IndentReviewHubSplitLayout
        useSplit={useSplitHub}
        compact={hubDense}
        stacked={stackedHub}
        hideStackedBids={stackedHub}
        footerReserve={contentFooterReserve}
        insetsBottom={insets.bottom}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        summary={
          <>
            {statusLower === "draft" ? (
              <View
                style={[
                  styles.draftBanner,
                  stackedHub && styles.draftBannerMobile,
                ]}
              >
                <FontAwesome
                  name="pencil-square-o"
                  size={12}
                  color={Theme.textPrimaryDark}
                />
                <Text style={styles.draftBannerText}>
                  Draft saved. You can edit this indent and share it with network
                  when ready.
                </Text>
              </View>
            ) : null}

            <IndentReviewHubCard
              compact={hubDense}
              stacked={stackedHub}
              isOwner={isOwner}
              typeLabel={
                isOwner
                  ? canUseSuppliers
                    ? "MY LOAD"
                    : "LOAD"
                  : "GET LOAD"
              }
              status={status}
              isDirect={isDirect}
              isCommerce={isCommerce}
              dateLabel={dateLabel}
              loadId={displayNumber}
              createdAtLabel={createdAtLabel}
              pickupDateIso={indent.pickup_date ?? null}
              liveBidsCount={liveBidsCount}
              clientPriceInr={clientPriceNum}
              supplierTargetInr={supplierTargetNum}
              vendorName={isOwner ? awardedVendorName : null}
              vendorRate={
                isOwner &&
                awardedVendorName &&
                awardedSupplierAmount != null &&
                awardedSupplierAmount > 0
                  ? formatINR(awardedSupplierAmount)
                  : null
              }
              primaryActionLabel={mobilePrimaryAction?.label}
              onPrimaryAction={mobilePrimaryAction?.onPress}
              secondaryActionLabel={
                isCounteredPending && canOpenQuoteModal ? "Update bid" : undefined
              }
              onSecondaryAction={
                isCounteredPending && canOpenQuoteModal ? openQuoteEntry : undefined
              }
              bidsSlot={
                stackedHub && isOwner ? (
                  <View style={styles.mobileLiveBidsShell}>
                    <IndentReviewHubBidsHeader
                      title={
                        liveBidsCount === 0 && isListeningForBids
                          ? "Listening"
                          : "Live bids"
                      }
                      liveBidsCount={liveBidsCount}
                      isListeningForBids={isListeningForBids}
                      showTrophy={
                        statusLower === "awarded" ||
                        statusLower === "completed" ||
                        statusLower === "deployed"
                      }
                      showHammer={false}
                    />
                    <IndentReviewHubBidsBody
                      isOwner={isOwner}
                      compact={hubDense}
                      stacked={stackedHub}
                      title="Live bids"
                      liveBidsCount={liveBidsCount}
                      isListeningForBids={isListeningForBids}
                      showTrophy={
                        statusLower === "awarded" ||
                        statusLower === "completed" ||
                        statusLower === "deployed"
                      }
                      showHammer={false}
                      quotes={quotes}
                      quotesLoading={quotesLoading}
                      clientPriceInr={clientPriceNum}
                      targetRateInr={effectiveSupplierAmount}
                      pickupDateIso={indent.pickup_date}
                      selectedQuoteId={selectedQuoteId}
                      onSelectQuote={setSelectedQuoteId}
                      canAward={canAward}
                      canBroadcast={canBroadcast}
                      isListening={
                        statusLower === "broadcast" || statusLower === "open"
                      }
                      isBroadcasting={isBroadcasting}
                      sharingDraft={sharingDraft}
                      broadcastError={broadcastError}
                      onBroadcast={handleBroadcast}
                      onShareStory={handleOpenShareStory}
                      onShareWhatsApp={handleShareWhatsApp}
                      onBoostReach={handleBoostReach}
                      pulseStoryLive={pulseStoryLive}
                      onCounterOffer={canAward ? openCounterOffer : undefined}
                      myQuote={myQuote}
                      supplierQuoteActionHint={supplierQuoteActionHint}
                      supplierQuoteAlert={supplierQuoteAlert}
                      canOpenQuoteModal={canOpenQuoteModal}
                      onQuotePress={openQuoteEntry}
                      showSupplierPartySummaries={false}
                      orgId={orgId}
                      shipperName={clientEntityRawName}
                      linkedTrip={linkedTrip ?? null}
                      driverLabel={linkedTripPartyLabels.driver}
                      vehicleLabel={linkedTripPartyLabels.vehicle}
                      allocationPending={!linkedTripPartyLabels.isAllocated}
                      targetRateInrSupplier={Number(indent.supplier_target ?? 0)}
                    />
                  </View>
                ) : undefined
              }
              origin={origin}
              destination={destination}
              vehicleType={vehicleType}
              weightKg={weightKg}
              material={material}
              canCancelLoad={canCancelLoad}
              cancelling={cancelling}
              onCancelLoad={handleCancelLoad}
              canEditLoad={canEditLoad}
              onEditAll={handleEditAll}
              suppressSupplierQuoteHero={useSplitHub && !isOwner}
              primaryAmount={
                isOwner
                  ? freight
                  : supplierNum > 0
                    ? formatINR(supplierNum)
                    : "—"
              }
              supplierRate={supplierTarget}
              marginPct={marginPct}
              client={{
                displayName: clientEntityRawName,
                avatarName: clientEntityRawName,
                clientId: indent.client_id,
                ownerOrgId: orgId,
                shipperOrgId: indent.organization_id,
                isOwner,
              }}
              quoteStatus={myQuote ? myQuoteStatus || "pending" : null}
              quoteAmountInr={myQuote ? Number(myQuote.amount ?? 0) : null}
              counterAmountInr={
                myQuote?.counter_amount != null &&
                Number(myQuote.counter_amount) > 0
                  ? Number(myQuote.counter_amount)
                  : null
              }
              targetRateInr={Number(indent.supplier_target ?? 0)}
              footerInsight={supplierFooterInsight}
              alertInfo={supplierQuoteAlert}
              onQuotePress={
                useSplitHub && !isOwner
                  ? undefined
                  : canOpenQuoteModal
                    ? openQuoteEntry
                    : undefined
              }
              partiesStrip={
                showGiveLoadPartiesStrip ? (
                  <IndentGiveLoadPartiesStrip
                    parties={integratedSuppliers}
                    quotes={quotes}
                    marginPct={marginPct}
                    compact={hubDense}
                    stacked={stackedHub}
                    onAddParties={openIntegratedSuppliersNetwork}
                    onPartyPress={handleIntegratedPartyPress}
                  />
                ) : undefined
              }
            >
              {!useSplitHub && showSupplierPartySummaries ? (
                <IndentSupplierPartySummary
                  orgId={orgId}
                  shipperName={clientEntityRawName}
                  awardedQuoteInr={Number(myQuote?.amount ?? 0)}
                  trip={linkedTrip}
                  driverLabel={linkedTripPartyLabels.driver}
                  vehicleLabel={linkedTripPartyLabels.vehicle}
                  allocationPending={!linkedTripPartyLabels.isAllocated}
                />
              ) : null}
            </IndentReviewHubCard>

            {linkedTrip ? (
              <IndentLinkedTripCard
                trip={linkedTrip}
                driverLabel={linkedTripPartyLabels.driver}
                vehicleLabel={linkedTripPartyLabels.vehicle}
                allocationPending={!linkedTripPartyLabels.isAllocated}
                compact={hubDense}
                stacked={stackedHub}
              />
            ) : null}
          </>
        }
        bidsHeader={
          <IndentReviewHubBidsHeader
            title={isOwner ? "LIVE BIDS" : "QUOTE STATUS"}
            liveBidsCount={liveBidsCount}
            isListeningForBids={isListeningForBids}
            showTrophy={
              statusLower === "awarded" ||
              statusLower === "completed" ||
              statusLower === "deployed"
            }
            showHammer={liveBidsCount > 0}
          />
        }
        bidsBody={
          <IndentReviewHubBidsBody
            isOwner={isOwner}
            compact={hubDense}
            stacked={stackedHub}
            title={isOwner ? "LIVE BIDS" : "QUOTE STATUS"}
            liveBidsCount={liveBidsCount}
            isListeningForBids={isListeningForBids}
            showTrophy={
              statusLower === "awarded" ||
              statusLower === "completed" ||
              statusLower === "deployed"
            }
            showHammer={liveBidsCount > 0}
            quotes={quotes}
            quotesLoading={quotesLoading}
            clientPriceInr={clientPriceNum}
            targetRateInr={effectiveSupplierAmount}
            pickupDateIso={indent.pickup_date}
            selectedQuoteId={selectedQuoteId}
            onSelectQuote={setSelectedQuoteId}
            canAward={canAward}
            canBroadcast={canBroadcast}
            isListening={statusLower === "broadcast" || statusLower === "open"}
            isBroadcasting={isBroadcasting}
            sharingDraft={sharingDraft}
            broadcastError={broadcastError}
            onBroadcast={handleBroadcast}
            onShareStory={isOwner ? handleOpenShareStory : undefined}
            onShareWhatsApp={isOwner ? handleShareWhatsApp : undefined}
            onBoostReach={isOwner ? handleBoostReach : undefined}
            pulseStoryLive={isOwner ? pulseStoryLive : false}
            onCounterOffer={isOwner && canAward ? openCounterOffer : undefined}
            myQuote={myQuote}
            supplierQuoteActionHint={supplierQuoteActionHint}
            supplierQuoteAlert={supplierQuoteAlert}
            canOpenQuoteModal={canOpenQuoteModal}
            onQuotePress={openQuoteEntry}
            showSupplierPartySummaries={showSupplierPartySummaries}
            orgId={orgId}
            shipperName={clientEntityRawName}
            linkedTrip={linkedTrip ?? null}
            driverLabel={linkedTripPartyLabels.driver}
            vehicleLabel={linkedTripPartyLabels.vehicle}
            allocationPending={!linkedTripPartyLabels.isAllocated}
            targetRateInrSupplier={Number(indent.supplier_target ?? 0)}
          />
        }
      />

      {/* Sticky award / action footer (hidden on mobile order-detail; CTAs live in scroll) */}
      {!hideStickyFooter && (
        <View
          style={[
            styles.footer,
            compactHub && styles.footerCompact,
            stackedHub && styles.footerMobile,
            {
              paddingBottom: (stackedHub ? 8 : compactHub ? 10 : 14) + insets.bottom,
            },
          ]}
        >
          {isOwner ? (
            <>
              <TouchableOpacity
                style={[styles.footerEditBtn, stackedHub && styles.footerEditBtnMobile]}
                onPress={canEditLoad ? handleEditAll : undefined}
                activeOpacity={0.85}
                accessibilityLabel="Edit indent"
                hitSlop={Layout.touchTargetHitSlop}
                disabled={!canEditLoad}
              >
                <FontAwesome
                  name="pencil"
                  size={stackedHub ? 14 : 16}
                  color={canEditLoad ? Theme.textSecondary : Theme.textMuted}
                />
              </TouchableOpacity>
              {canAward &&
              quotes.some((q) => normalizeStatus(q.status) === "pending") ? (
                <>
                  <View style={styles.footerSelectionMeta}>
                    <Text
                      style={[
                        styles.footerMetaKicker,
                        stackedHub && styles.footerMetaKickerMobile,
                      ]}
                    >
                      Selected carrier
                    </Text>
                    <Text
                      style={[
                        styles.footerMetaValue,
                        stackedHub && styles.footerMetaValueMobile,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedPendingQuote?.bidder_organization_name?.trim() ||
                        "Tap a bid to select"}
                    </Text>
                    {selectedAwardMargin ? (
                      <Text
                        style={[
                          styles.footerMetaMargin,
                          stackedHub && styles.footerMetaMarginMobile,
                        ]}
                        numberOfLines={1}
                      >
                        Margin {formatINR(selectedAwardMargin.marginInr)} (
                        {selectedAwardMargin.marginPct}%)
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.footerAwardBtn,
                      stackedHub && styles.footerAwardBtnMobile,
                      !canAwardSelected && styles.footerAwardBtnDisabled,
                    ]}
                    onPress={() => {
                      void handleAwardQuote();
                    }}
                    disabled={!canAwardSelected}
                    activeOpacity={0.9}
                    accessibilityLabel="Award selected bid"
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    {awarding ? (
                      <LoadingIndicator size="small" color={Theme.textOnDark} />
                    ) : (
                      <>
                        <FontAwesome
                          name="trophy"
                          size={stackedHub ? 11 : 12}
                          color={Theme.textOnDark}
                        />
                        <Text
                          style={[
                            styles.footerAwardBtnText,
                            stackedHub && styles.footerAwardBtnTextMobile,
                          ]}
                        >
                          Award selected
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : isListeningForBids ? (
                <View style={styles.footerListeningPill}>
                  <View style={styles.footerListeningDot} />
                  <Text style={styles.footerListeningText}>
                    Live bidding · awaiting quotes
                  </Text>
                </View>
              ) : !canCancelLoad ? (
                <View style={styles.footerLockedPill}>
                  <FontAwesome name="lock" size={14} color={Theme.textMuted} />
                  <Text style={styles.footerLockedText}>LOAD LOCKED</Text>
                </View>
              ) : (
                <View style={styles.footerSpacer} />
              )}
            </>
          ) : canOpenQuoteModal ? (
            <TouchableOpacity
              style={styles.footerBidBtn}
              onPress={openQuoteEntry}
              activeOpacity={0.9}
              accessibilityLabel="Submit bid"
              hitSlop={Layout.touchTargetHitSlop}
              disabled={submittingQuote}
            >
              <FontAwesome name="gavel" size={16} color={Theme.textOnDark} />
              <Text style={styles.footerCancelText}>
                {submittingQuote
                  ? "SUBMITTING…"
                  : hasMyPendingQuote
                    ? "UPDATE BID"
                    : "BID NOW"}
              </Text>
            </TouchableOpacity>
          ) : canSupplierAllocateVehicle ? (
            <TouchableOpacity
              style={styles.footerBidBtn}
              onPress={handleSupplierAllocate}
              activeOpacity={0.9}
              accessibilityLabel={supplierAllocateLabel}
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome name="truck" size={16} color={Theme.textOnDark} />
              <Text style={styles.footerCancelText}>{supplierAllocateLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerLockedPill}>
              <FontAwesome name="lock" size={14} color={Theme.textMuted} />
              <Text style={styles.footerLockedText}>{supplierFooterStatus}</Text>
            </View>
          )}
        </View>
      )}

      {/* Broadcast modal */}
      <Modal
        visible={confirmShareVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmShareVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setConfirmShareVisible(false)}
        >
          <Pressable
            style={styles.shareConfirmCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.shareConfirmTitle}>Share with Network?</Text>
            <Text style={styles.shareConfirmSubtitle}>
              Once shared, this indent becomes read-only and cannot be edited.
            </Text>
            <View style={styles.shareConfirmActions}>
              <TouchableOpacity
                style={styles.shareConfirmCancelBtn}
                onPress={() => setConfirmShareVisible(false)}
                activeOpacity={0.9}
                disabled={sharingDraft}
              >
                <Text style={styles.shareConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareConfirmShareBtn}
                onPress={executeBroadcast}
                activeOpacity={0.9}
                disabled={sharingDraft}
              >
                {sharingDraft ? (
                  <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
                ) : (
                  <Text style={styles.shareConfirmShareText}>Share now</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isBroadcasting}
        transparent
        animationType="slide"
        onRequestClose={() => setIsBroadcasting(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsBroadcasting(false)}
        >
          <Pressable
            style={[styles.modalContent, { paddingBottom: 24 + insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalBody}>
              <View style={styles.modalIconWrap}>
                <FontAwesome
                  name="bullhorn"
                  size={28}
                  color={Theme.darkBackground}
                />
              </View>
              <Text style={styles.modalTitle}>Broadcasting Live</Text>
              <Text style={styles.modalSubtitle}>
                Your indent {displayNumber} is now visible to verified
                transporters in your network.
              </Text>
              <TouchableOpacity
                style={styles.modalStoryBtn}
                onPress={() => {
                  setIsBroadcasting(false);
                  handleOpenShareStory();
                }}
                activeOpacity={0.9}
              >
                <FontAwesome name="bolt" size={14} color={Theme.brandBlueInk} />
                <Text style={styles.modalStoryBtnText}>Share as Pulse story</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setIsBroadcasting(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <IndentBidAmountEntry
        visible={quoteModalVisible}
        onClose={closeQuoteEntry}
        onSubmitAmount={submitQuoteAmount}
        indentDisplayNumber={displayNumber}
        origin={origin}
        destination={destination}
        vehicleType={vehicleType !== "—" ? vehicleType : undefined}
        weightLabel={weightKg !== "—" ? weightKg : undefined}
        material={
          indent?.load_type && indent.load_type !== "—"
            ? indent.load_type
            : undefined
        }
        ownerName={
          (indent?.client_name ?? "").trim() ||
          (indent?.creator_organization_name ?? "").trim() ||
          undefined
        }
        targetRateInr={supplierNum > 0 ? supplierNum : undefined}
        initialAmount={
          isCounteredPending
            ? myCounterAmount
            : myQuote?.amount != null
              ? Number(myQuote.amount)
              : null
        }
        isUpdate={hasMyPendingQuote}
        validationError={quoteEntryError}
        onClearValidationError={() => setQuoteEntryError(undefined)}
        onInvalidAmount={() =>
          setQuoteEntryError("Enter an amount greater than 0.")
        }
      />

      {canUseSuppliers && isOwner && orgId ? (
        <ShareLoadSheet
          visible={shareStorySheetVisible}
          indent={indent}
          orgId={orgId}
          onClose={() => setShareStorySheetVisible(false)}
          onSuccess={handleStoryShareSuccess}
          onBoostAfterBroadcast={(postId) => {
            setBoostPostIdOverride(postId);
            setShareStorySheetVisible(false);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.posts.indentStories(orgId, indent?.id ?? ""),
            });
            setBoostSheetVisible(true);
          }}
        />
      ) : null}

      {isOwner && orgId && boostPostId ? (
        <BoostSheet
          visible={boostSheetVisible}
          onClose={() => {
            setBoostSheetVisible(false);
            setBoostPostIdOverride(null);
          }}
          orgId={orgId}
          postId={boostPostId}
          onBoosted={() => {
            invalidatePosts();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.posts.indentStories(orgId, indent?.id ?? ""),
            });
          }}
        />
      ) : null}

      <IndentCounterOfferEntry
        visible={counterModalVisible && !!counterQuote}
        carrierName={
          counterQuote?.bidder_organization_name?.trim() || "Supplier"
        }
        currentBidAmount={Number(counterQuote?.amount ?? 0)}
        indentDisplayNumber={displayNumber}
        origin={origin}
        destination={destination}
        initialCounterAmount={
          counterQuote?.counter_amount != null &&
          Number(counterQuote.counter_amount) > 0
            ? Number(counterQuote.counter_amount)
            : Number(counterQuote?.amount ?? 0) > 0
              ? Number(counterQuote?.amount) - 1000
              : null
        }
        submitting={submittingCounter}
        onClose={() => {
          if (submittingCounter) return;
          setCounterModalVisible(false);
          setCounterQuoteId(null);
        }}
        onSubmitAmount={handleSubmitCounter}
      />

      <ThemedConfirmModal
        visible={awardConfirmQuote != null && !awardCelebration}
        title="Award this load?"
        message={
          awardConfirmQuote
            ? `Award to ${
                awardConfirmQuote.bidder_organization_name?.trim() || "supplier"
              } at ${formatINR(Number(awardConfirmQuote.amount ?? 0))}?\n\nOther pending bids will be rejected. The supplier can then assign and deploy.`
            : ""
        }
        cancelText="Cancel"
        confirmText={awarding ? "Awarding…" : "Award load"}
        variant="positive"
        confirmVariant="primary"
        onCancel={closeAwardConfirm}
        onConfirm={confirmAwardQuote}
        onRequestClose={closeAwardConfirm}
      />

      <IndentAwardCelebrationModal
        visible={awardCelebration != null}
        data={awardCelebration}
        onClose={() => setAwardCelebration(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.darkBackground,
  },
  containerMobile: {
    backgroundColor: "#F0F2F5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    backgroundColor: Theme.darkBackground,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderOnDark,
  },
  headerMobile: {
    backgroundColor: Theme.cardWhite,
    borderBottomColor: Theme.borderLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  headerCompact: {
    paddingBottom: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnMobile: {
    width: 40,
    height: 40,
    backgroundColor: "transparent",
  },
  headerMobileTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.gpayListTitle,
    marginLeft: 2,
  },
  headerHelpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 44,
  },
  headerHelpIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#2874F0",
    alignItems: "center",
    justifyContent: "center",
  },
  headerHelpIconText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2874F0",
    lineHeight: 12,
  },
  headerHelpText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2874F0",
  },
  headerIconBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerId: indentReviewHubText.headerId,
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  headerStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.accentGold,
  },
  headerLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.driverPrimary,
  },
  headerSubtitle: {
    ...indentReviewHubText.headerSubtitle,
    color: Theme.textOnDarkMuted,
  },
  errorStateBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.darkBackground,
  },
  errorText: {
    fontSize: 15,
    color: Theme.textOnDarkMuted,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    backgroundColor: Theme.surface,
  },
  scrollContentCompact: {
    paddingTop: 6,
  },
  draftBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.surfaceLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  draftBannerMobile: {
    marginHorizontal: 14,
    borderRadius: 10,
  },
  mobileLiveBidsShell: {
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  draftBannerText: {
    flex: 1,
    ...indentReviewHubText.bodyMuted,
    color: Theme.textPrimaryDark,
  },

  // Summary card (aligned with Load Center `loadCard`)
  summaryCancelLink: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  summaryCancelLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
    letterSpacing: 0.2,
  },
  indentSummaryCard: {
    position: "relative" as const,
    backgroundColor: Theme.cardWhite,
    padding: indentReviewHubLayout.summaryCardPadding,
    marginBottom: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    overflow: "hidden",
  },
  indentSummaryRoute: {
    marginBottom: 6,
  },
  indentSummaryOrb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  indentSummaryHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    zIndex: 1,
  },
  indentSummaryHeroRowWithCancel: {
    paddingRight: 76,
  },
  indentSummaryPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  indentSummaryTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
  },
  indentSummaryTypePillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textPrimaryDark,
  },
  indentSummaryStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.positiveMuted,
  },
  indentSummaryStatePillText: {
    ...indentReviewHubText.chipLabel,
    letterSpacing: 0.45,
    color: Theme.positive,
  },
  indentSummaryDirectPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
  },
  indentSummaryDirectPillText: {
    ...indentReviewHubText.chipLabel,
    letterSpacing: 0.45,
    color: Theme.textPrimaryDark,
  },
  indentSummaryDate: {
    ...indentReviewHubText.dateLine,
    marginTop: 2,
    zIndex: 1,
  },
  indentSummarySpecsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 1,
  },
  indentSummarySpecsTitle: indentReviewHubText.fieldLabel,
  indentSummarySpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 10,
    paddingHorizontal: 10,
    zIndex: 1,
  },
  indentSummarySpecsGrid: {
    gap: 6,
  },
  indentSummarySpecsLabelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  indentSummarySpecsValuesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  indentSummarySpecCell: {
    flex: 1,
    minWidth: 0,
  },
  indentSummarySpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 10,
    marginLeft: 4,
  },
  indentSummarySpecLabel: indentReviewHubText.specLabel,
  indentSummarySpecValue: indentReviewHubSpecValue,

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  sectionHeaderCompact: {
    marginBottom: 4,
  },
  sectionTitle: indentReviewHubText.sectionTitle,
  editAllText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 8,
    letterSpacing: 0.4,
    color: Theme.darkBackground,
  },
  editAllTextDisabled: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  supplierReadOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.surfaceLight,
    marginBottom: 8,
  },
  supplierReadOnlyText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  supplierQuoteSectionHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  // Live Bids
  liveBidsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bidsCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  bidsCountText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  bidsEmptyCard: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "stretch",
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  bidsEmptyCardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    gap: 8,
  },
  bidsEmptyTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  bidsEmptyTopCompact: {
    gap: 8,
  },
  bidsEmptyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  quoteStatusCard: {
    alignItems: "stretch",
    paddingVertical: 12,
  },
  quoteStatusCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    marginBottom: 10,
  },
  quoteStatusCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  quoteStatusLine: indentReviewHubText.bodyMuted,
  quoteStatusLineStrong: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  bidsEmptyBodyLeft: {
    ...indentReviewHubText.bodyMuted,
    textAlign: "left",
  },
  supplierQuoteSubtextLeft: {
    ...indentReviewHubText.bodyMuted,
    color: Theme.textSecondary,
    textAlign: "left",
  },
  bidsEmptyIconWrap: {
    width: 36,
    height: 36,
    backgroundColor: "rgba(99,102,241,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bidsEmptyIconWrapCompact: {
    width: 32,
    height: 32,
  },
  bidsEmptyTitle: {
    ...indentReviewHubText.partyTitle,
    textAlign: "left",
    marginBottom: 0,
  },
  bidsEmptyTitleCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  bidsEmptyBodyCompact: {
    fontSize: 8,
    lineHeight: 12,
  },
  bidsEmptyTitleCenter: {
    ...indentReviewHubText.partyTitle,
    textAlign: "center",
    marginBottom: 4,
  },
  bidsEmptyBody: {
    ...indentReviewHubText.bodyMuted,
    textAlign: "center",
    marginBottom: 12,
  },
  supplierQuoteSubtext: {
    ...indentReviewHubText.bodyMuted,
    color: Theme.textSecondary,
    textAlign: "center",
    marginTop: -4,
    marginBottom: 10,
  },
  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 38,
    alignSelf: "stretch",
  },
  broadcastBtnCompact: {
    minHeight: 34,
    paddingVertical: 7,
  },
  broadcastBtnIcon: {
    marginRight: 8,
  },
  broadcastBtnText: {
    ...indentReviewHubText.buttonLabel,
    color: Theme.buttonPrimaryText,
  },
  broadcastLockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.surfaceLight,
    alignSelf: "stretch",
  },
  broadcastLockedPillCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  broadcastLockedText: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 8,
    color: Theme.textMuted,
  },
  allocateHintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.pulseIndigoWash,
  },
  allocateHintText: {
    ...indentReviewHubText.bodyMuted,
    flex: 1,
    fontSize: 8,
    color: Theme.pulseIndigo,
    fontWeight: "600",
  },
  completedStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.positiveMuted,
  },
  completedStatusText: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 8,
    color: Theme.positive,
    fontWeight: "600",
  },
  broadcastErrorText: {
    marginTop: 10,
    ...indentReviewHubText.bodyMuted,
    color: Theme.negative,
    textAlign: "center",
  },

  // Quote rows
  offersListWrap: {
    marginBottom: 16,
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    marginBottom: 6,
  },
  quoteRowSelected: {
    borderLeftWidth: 4,
    borderLeftColor: Theme.darkGreen,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    ...indentReviewHubText.quoteRowName,
    marginRight: 8,
  },
  quoteRowAmount: {
    ...indentReviewHubText.quoteRowAmount,
    marginRight: 8,
  },
  quoteRowStatus: indentReviewHubText.quoteRowStatus,
  // Footer (light)
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 3,
  },
  footerCompact: {
    paddingTop: 6,
  },
  footerMobile: {
    paddingTop: 8,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  footerEditBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  footerEditBtnMobile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 8,
  },
  footerSelectionMeta: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
    justifyContent: "center",
  },
  footerMetaKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  footerMetaKickerMobile: {
    fontSize: 8,
    fontWeight: "600",
  },
  footerMetaValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  footerMetaValueMobile: {
    fontSize: 12,
    fontWeight: "600",
  },
  footerMetaMargin: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.positive,
  },
  footerMetaMarginMobile: {
    fontSize: 10,
    fontWeight: "600",
  },
  footerAwardBtn: {
    minWidth: 132,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Theme.driverPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  footerAwardBtnMobile: {
    minWidth: 112,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
    shadowOpacity: 0.04,
    elevation: 1,
  },
  footerAwardBtnDisabled: {
    opacity: 0.45,
  },
  footerAwardBtnText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 10,
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
  footerAwardBtnTextMobile: {
    fontSize: 9,
    fontWeight: "700",
  },
  footerSpacer: {
    flex: 1,
    height: 44,
  },
  footerBidBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.driverPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  footerCancelText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 10,
    color: Theme.textOnDark,
  },
  footerLockedPill: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerLockedText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 9,
    color: Theme.textMuted,
  },
  footerListeningPill: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.positiveMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerListeningDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.driverPrimary,
  },
  footerListeningText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 9,
    color: Theme.pulseIndigo,
    letterSpacing: 0.4,
  },

  // Broadcast modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  shareConfirmCard: {
    marginHorizontal: 16,
    backgroundColor: Theme.screenBackground,
    padding: 14,
  },
  shareConfirmTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  shareConfirmSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  shareConfirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  shareConfirmCancelBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  shareConfirmCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  shareConfirmShareBtn: {
    flex: 1,
    minHeight: 40,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  shareConfirmShareText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  modalContent: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 48,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  modalBody: {
    alignItems: "center",
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    backgroundColor: Theme.aggregatePillBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalStoryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: Theme.pulseIndigoWash,
  },
  modalStoryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.brandBlueInk,
  },
  modalDoneBtn: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDoneText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
