/**
 * Give Load indent card mutations + sheets.
 * Same handlers as LoadCenterView — no second marketplace/award/story machine.
 */
import { GiveLoadIndentActionSheets } from "@/features/network/components/GiveLoadIndentActionSheets";
import { useAwardQuote } from "@/features/network/hooks/useAwardQuote";
import { useSuccessToast } from "@/features/network/hooks/useSuccessToast";
import { previewStandingLaneBids } from "@/features/network/services/standingLaneBids.service";
import { standingLaneShareMessage } from "@/features/network/utils/standingLaneBids.util";
import { isIndentStageDone } from "@/features/network/utils/loadCenter.model";
import {
  getIndentDisplayNumber,
  shareDraftIndent,
  updateIndent,
  type IndentRow,
} from "@/features/indents";
import { confirmDialog } from "@/lib/confirmDialog";
import { formatINR } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useInvalidatePosts, useIndentStoryStatesQuery } from "@/lib/queries/usePostsQuery";
import {
  useConnectedSupplierOrgIdsQuery,
  useInvalidateIndents,
  useSuppliersQuery,
} from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { createElement, useCallback, useMemo, useState } from "react";
import { Alert, Share } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

export function useGiveLoadIndentActions(opts: {
  orgId: string | null;
  indentIds: string[];
  onOpenIndent: (indent: IndentRow) => void;
  insets: EdgeInsets;
}) {
  const { orgId, indentIds, onOpenIndent, insets } = opts;
  const queryClient = useQueryClient();
  const invalidateIndents = useInvalidateIndents();
  const invalidatePosts = useInvalidatePosts(orgId);
  const { trigger: triggerSuccess, showSuccess, successMsg } = useSuccessToast();
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const { data: liveConnectedSupplierOrgIds = [] } =
    useConnectedSupplierOrgIdsQuery(orgId);

  const connectedSupplierOrgIds = useMemo(() => {
    const ids = new Set(
      suppliers
        .map((s) => s.linked_organization_id)
        .filter(Boolean) as string[],
    );
    for (const id of liveConnectedSupplierOrgIds) ids.add(id);
    return ids;
  }, [suppliers, liveConnectedSupplierOrgIds]);

  const awardModal = useAwardQuote({
    orgId,
    queryClient,
    invalidateIndents,
    onSuccess: triggerSuccess,
    connectedSupplierOrgIds,
  });

  const { data: indentStoryStates = {}, refetch: refetchIndentStories } =
    useIndentStoryStatesQuery(orgId, indentIds);

  const [pulseShareIndent, setPulseShareIndent] = useState<IndentRow | null>(
    null,
  );
  const [boostSheetVisible, setBoostSheetVisible] = useState(false);
  const [boostPostId, setBoostPostId] = useState<string | null>(null);
  const [marketplaceToggleBusyId, setMarketplaceToggleBusyId] = useState<
    string | null
  >(null);

  const handleBroadcastDraft = useCallback(
    async (load: IndentRow) => {
      if (!orgId) return;
      const { error } = await shareDraftIndent(load.id);
      if (error) {
        Alert.alert("Could not broadcast", error.message);
        return;
      }
      invalidateIndents(orgId);
      invalidatePosts();
      triggerSuccess("Load broadcasted to network");
    },
    [orgId, invalidateIndents, invalidatePosts, triggerSuccess],
  );

  const handlePulseStory = useCallback(
    (load: IndentRow) => {
      if (!orgId) return;
      const story = indentStoryStates[load.id];
      if (story?.isLive && story.postId) {
        setBoostPostId(story.postId);
        setBoostSheetVisible(true);
        return;
      }
      setPulseShareIndent(load);
    },
    [orgId, indentStoryStates],
  );

  const handlePulseStoryShareSuccess = useCallback(() => {
    invalidatePosts();
    void refetchIndentStories();
  }, [invalidatePosts, refetchIndentStories]);

  const handleBoostAfterBroadcast = useCallback((postId: string) => {
    setBoostPostId(postId);
    setPulseShareIndent(null);
    setBoostSheetVisible(true);
  }, []);

  const handleToggleMarketplace = useCallback(
    async (load: IndentRow) => {
      if (!orgId) return;
      const target = load.circulation_target ?? "integrated_supplier";
      const isShared = target === "marketplace" || target === "both";
      let shareMessage =
        "This load will also become visible to verified fleet owners in the open Marketplace, alongside your supplier network.";
      if (!isShared) {
        const preview = await previewStandingLaneBids(
          load.pickup_area ?? "",
          load.drop_location ?? "",
          load.vehicle_type ?? "",
          load.id,
        );
        if (!preview.error) shareMessage = standingLaneShareMessage(preview.bids);
      }
      const confirmed = await confirmDialog({
        title: isShared ? "Stop sharing to Marketplace?" : "Share to Marketplace?",
        message: isShared
          ? "This load will stop appearing to fleet owners in the open Marketplace. Your supplier network is unaffected."
          : shareMessage,
        confirmLabel: isShared ? "Stop sharing" : "Share",
        destructive: isShared,
      });
      if (!confirmed) return;
      try {
        setMarketplaceToggleBusyId(load.id);
        const { error } = await updateIndent(load.id, {
          circulation_target: isShared ? "integrated_supplier" : "both",
        });
        if (error) {
          Alert.alert("Could not update distribution", error.message);
          return;
        }
        invalidateIndents(orgId);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bids.marketForIndent(load.id),
        });
        triggerSuccess(
          isShared
            ? "Stopped sharing to Marketplace."
            : "Shared to Marketplace.",
        );
      } finally {
        setMarketplaceToggleBusyId(null);
      }
    },
    [orgId, invalidateIndents, queryClient, triggerSuccess],
  );

  const handleShareIndent = useCallback(async (load: IndentRow) => {
    const routeLabel = `${(load.pickup_area || "—").toUpperCase()} → ${(load.drop_location || "—").toUpperCase()}`;
    const dateLabel = load.pickup_date
      ? new Date(load.pickup_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
    const budget = formatINR(Number(load.client_price || 0));
    const indentDisplay = getIndentDisplayNumber(load);
    const webBase =
      process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
    const deepLink =
      webBase !== ""
        ? `${webBase}/indent/${load.id}`
        : Linking.createURL(`/indent/${load.id}`);
    const message =
      `Load Indent ${indentDisplay}\n` +
      `${routeLabel}\n` +
      `Pickup: ${dateLabel} · Budget: ${budget}\n\n` +
      `Update your bid:\n${deepLink}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  }, []);

  const showPulseToNetwork = useCallback(
    (load: IndentRow) => {
      const status = (load.status || "").toLowerCase();
      const isDraft = status === "draft";
      const isDone = isIndentStageDone(status);
      return (
        !isDone &&
        !isDraft &&
        (indentCanBroadcastToPulseNetwork(load) ||
          indentStoryStates[load.id]?.isLive === true)
      );
    },
    [indentStoryStates],
  );

  const sheets = createElement(GiveLoadIndentActionSheets, {
    showSuccess,
    successMsg,
    orgId,
    pulseShareIndent,
    onClosePulseShare: () => setPulseShareIndent(null),
    onPulseShareSuccess: handlePulseStoryShareSuccess,
    onBoostAfterBroadcast: handleBoostAfterBroadcast,
    boostSheetVisible,
    boostPostId,
    onCloseBoost: () => {
      setBoostSheetVisible(false);
      setBoostPostId(null);
    },
    onBoosted: () => {
      invalidatePosts();
      void refetchIndentStories();
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.reach.campaignsForOrg(orgId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.reach.wallet(orgId),
        });
      }
    },
    awardModal,
    onOpenIndent,
    insets,
  });

  return {
    awardModal,
    indentStoryStates,
    marketplaceToggleBusyId,
    handleBroadcastDraft,
    handlePulseStory,
    handleShareIndent,
    handleToggleMarketplace,
    showPulseToNetwork,
    showSuccess,
    successMsg,
    sheets,
  };
}
