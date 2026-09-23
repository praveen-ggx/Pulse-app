/**
 * useAwardQuote — owns all state and logic for the Award (Offer Hub) modal.
 * FSM-style: open(load) → select/award → auto-closes on success.
 *
 * Offers = org direct_quotes ∪ Pilot / FO driver_direct_bids on the linked story.
 */

import {
  updateDirectQuoteStatus,
  updateIndent,
  type DirectQuoteRow,
  type IndentRow,
} from "@/features/indents";
import { driverDirectBidToHubQuote } from "@/features/indents/utils/bidding/indentReviewHubOffers.util";
import {
  getIntegratedSupplierOrgIdsForShipper,
  useIndentDirectQuotesQuery,
  useInvalidateIndents,
} from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useDriverDirectBidsForPostQuery } from "@/lib/queries/useBidsQuery";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { showAppAlert } from "@/lib/appAlert";
import { confirmDialog } from "@/lib/confirmDialog";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Lazy: keeps the connections service out of the Load Center entry chunk. */
const loadConnectionRequestsService = () =>
  import("@/features/connections/services/connectionRequests.service");

const loadBidsService = () => import("@/features/network/services/bids.service");

function sortHubOffers(list: DirectQuoteRow[]): DirectQuoteRow[] {
  return [...list].sort((a, b) => {
    const sa = (a.status || "").toLowerCase();
    const sb = (b.status || "").toLowerCase();
    if (sa === "pending" && sb === "pending") {
      return Number(a.amount ?? 0) - Number(b.amount ?? 0);
    }
    if (sa === "pending") return -1;
    if (sb === "pending") return 1;
    if (sa === "rejected" && sb === "accepted") return -1;
    if (sa === "accepted" && sb === "rejected") return 1;
    return 0;
  });
}

interface UseAwardQuoteParams {
  orgId: string | null;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  onSuccess: (msg: string) => void;
  /** linked_organization_id values from the shipper's suppliers — used to badge connected bidders */
  connectedSupplierOrgIds?: Set<string>;
}

export interface AwardQuoteResult {
  isOpen: boolean;
  currentLoad: IndentRow | null;
  selectedQuoteId: string | null;
  awarding: boolean;
  sortedQuotes: DirectQuoteRow[];
  pendingCount: number;
  lowestPendingAmount: number | null;
  quotesLoading: boolean;
  connectedSupplierOrgIds: Set<string>;
  /** True when the selected bidder is not yet an integrated supplier. */
  selectedBidderNeedsInvite: boolean;
  /** Invite status for the selected bidder, when one has been sent. */
  selectedBidderInviteStatus: "none" | "pending" | "sending";
  /** Send the supplier invite that unblocks awarding an unconnected bidder. */
  inviteSelectedBidder: () => Promise<void>;
  open: (load: IndentRow) => void;
  close: () => void;
  selectQuote: (id: string | null) => void;
  /** Optional quote id awards that pending offer immediately (card Award button). */
  award: (quoteIdOverride?: string) => Promise<void>;
  /**
   * indentId -> winning bidder's org name, captured in memory the instant an
   * award succeeds. Used as an optimistic fallback until assigned_supplier_id
   * can be resolved from the supplier list / org display batch.
   */
  lastAwardedByIndentId: Record<string, string>;
}

export function useAwardQuote({
  orgId,
  queryClient,
  invalidateIndents,
  onSuccess,
  connectedSupplierOrgIds = new Set(),
}: UseAwardQuoteParams): AwardQuoteResult {
  const invalidatePosts = useInvalidatePosts(orgId);
  const [currentLoad, setCurrentLoad] = useState<IndentRow | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [lastAwardedByIndentId, setLastAwardedByIndentId] = useState<
    Record<string, string>
  >({});

  const {
    data: awardModalQuotes = [],
    isLoading: quotesLoading,
    refetch: refetchAwardModalQuotes,
  } = useIndentDirectQuotesQuery(currentLoad?.id ?? null);

  const liveConnectedQ = useQuery({
    queryKey: queryKeys.suppliers.connectedOrgIds(orgId ?? ""),
    queryFn: () => getIntegratedSupplierOrgIdsForShipper(orgId!),
    enabled: Boolean(orgId) && currentLoad != null,
    staleTime: STALE.frequent,
  });

  const effectiveConnectedSupplierOrgIds = useMemo(() => {
    const ids = new Set(connectedSupplierOrgIds);
    for (const id of liveConnectedQ.data ?? []) ids.add(id);
    return ids;
  }, [connectedSupplierOrgIds, liveConnectedQ.data]);

  const linkedPostQ = useQuery({
    queryKey: ["q", "posts", "latest-load-for-indent", currentLoad?.id ?? ""],
    queryFn: async () => {
      const { getLatestLoadPostIdForIndent } = await loadBidsService();
      const res = await getLatestLoadPostIdForIndent(currentLoad!.id);
      if (res.error) throw res.error;
      return res.postId;
    },
    enabled: Boolean(currentLoad?.id),
    staleTime: 30_000,
  });

  const driverDirectBidsQ = useDriverDirectBidsForPostQuery(
    linkedPostQ.data ?? null,
  );

  const pendingDriverUserIds = useMemo(
    () =>
      [
        ...new Set(
          (driverDirectBidsQ.data ?? [])
            .filter((b) => (b.status || "").toLowerCase() === "pending")
            .map((b) => b.driver_user_id)
            .filter(Boolean),
        ),
      ],
    [driverDirectBidsQ.data],
  );

  const driverAvailabilityQ = useQuery({
    queryKey: [
      "q",
      "review-hub",
      "driver-available",
      pendingDriverUserIds.join(","),
    ],
    queryFn: async () => {
      const { checkDriversAvailable } = await loadBidsService();
      const { availableByUserId } = await checkDriversAvailable(
        pendingDriverUserIds,
      );
      return Object.fromEntries(availableByUserId);
    },
    enabled: pendingDriverUserIds.length > 0 && currentLoad != null,
    staleTime: 15_000,
  });

  // Refetch quotes when a new load is opened
  useEffect(() => {
    if (currentLoad?.id) {
      refetchAwardModalQuotes();
    }
  }, [currentLoad?.id, refetchAwardModalQuotes]);

  const hubQuotes = useMemo(() => {
    const indentId = currentLoad?.id ?? "";
    const fromQuotes = awardModalQuotes.map((q) => ({
      ...q,
      offer_source: q.offer_source ?? ("direct_quote" as const),
    }));
    const fromDrivers = (driverDirectBidsQ.data ?? []).map((b) =>
      driverDirectBidToHubQuote(
        b,
        indentId,
        driverAvailabilityQ.data?.[b.driver_user_id],
      ),
    );
    return [...fromQuotes, ...fromDrivers];
  }, [
    awardModalQuotes,
    driverDirectBidsQ.data,
    driverAvailabilityQ.data,
    currentLoad?.id,
  ]);

  /** Sorted: pending by amount (lowest first), then rejected, then accepted. */
  const sortedQuotes = useMemo(() => sortHubOffers(hubQuotes), [hubQuotes]);

  const pendingCount = useMemo(
    () =>
      hubQuotes.filter((q) => (q.status || "").toLowerCase() === "pending")
        .length,
    [hubQuotes],
  );

  const lowestPendingAmount = useMemo(() => {
    const pending = hubQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    if (pending.length === 0) return null;
    return Math.min(...pending.map((q) => Number(q.amount ?? 0)));
  }, [hubQuotes]);

  /**
   * Single pending offer — preselect it. There is nothing to choose between, so
   * requiring a tap before "Award selected" becomes usable is a dead end the
   * user has to guess their way out of. Multi-bid loads still require an
   * explicit pick, which is the real point of the confirm step.
   *
   * Keyed on the load + quote identity (not selectedQuoteId) so deliberately
   * deselecting the only bid is not immediately undone by this effect.
   */
  const soloPendingQuoteId = useMemo(() => {
    const pending = hubQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    return pending.length === 1 ? pending[0]!.id : null;
  }, [hubQuotes]);

  useEffect(() => {
    if (soloPendingQuoteId) setSelectedQuoteId(soloPendingQuoteId);
  }, [currentLoad?.id, soloPendingQuoteId]);

  useEffect(() => {
    if (!selectedQuoteId) return;
    const selected = hubQuotes.find((q) => q.id === selectedQuoteId);
    if (!selected || (selected.status || "").toLowerCase() !== "pending") {
      setSelectedQuoteId(soloPendingQuoteId);
    }
  }, [hubQuotes, selectedQuoteId, soloPendingQuoteId]);

  /**
   * Reach-only bidders: a paid campaign lets any targeted org bid, but a load
   * may only be awarded to an integrated supplier. The winner must accept a
   * supplier invite first — approving it fires on_connection_request_approved,
   * which creates the organization_relations + suppliers rows, after which the
   * bidder counts as connected and the normal award path applies.
   * Pilot / FO driver_direct_bids skip this gate (award creates the driver link).
   */
  const selectedOffer = useMemo(() => {
    if (!selectedQuoteId) return null;
    return hubQuotes.find((x) => x.id === selectedQuoteId) ?? null;
  }, [selectedQuoteId, hubQuotes]);

  const selectedIsDriverDirect =
    selectedOffer?.offer_source === "driver_direct_bid";

  const selectedBidderOrgId = useMemo(() => {
    if (!selectedOffer || selectedIsDriverDirect) return null;
    return selectedOffer.bidder_organization_id || null;
  }, [selectedOffer, selectedIsDriverDirect]);

  const selectedBidderNeedsInvite = useMemo(
    () =>
      !!selectedBidderOrgId &&
      !liveConnectedQ.isPending &&
      !effectiveConnectedSupplierOrgIds.has(selectedBidderOrgId),
    [
      selectedBidderOrgId,
      liveConnectedQ.isPending,
      effectiveConnectedSupplierOrgIds,
    ],
  );

  const [inviteStatusByOrgId, setInviteStatusByOrgId] = useState<
    Record<string, "pending" | "sending">
  >({});

  const selectedBidderInviteStatus = selectedBidderOrgId
    ? (inviteStatusByOrgId[selectedBidderOrgId] ?? "none")
    : "none";

  // Reflect an invite sent in an earlier session, so the modal does not offer
  // to re-send one that is already awaiting the bidder's response.
  useEffect(() => {
    if (!orgId || !selectedBidderOrgId || !selectedBidderNeedsInvite) return;
    if (inviteStatusByOrgId[selectedBidderOrgId]) return;
    let cancelled = false;
    (async () => {
      const { getLatestConnectionRequestStatus } =
        await loadConnectionRequestsService();
      const { status } = await getLatestConnectionRequestStatus(
        orgId,
        selectedBidderOrgId,
      );
      if (cancelled || status !== "pending") return;
      setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "pending" }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orgId,
    selectedBidderOrgId,
    selectedBidderNeedsInvite,
    inviteStatusByOrgId,
  ]);

  const inviteSelectedBidder = useCallback(async () => {
    if (!orgId || !selectedBidderOrgId) return;
    const winner = hubQuotes.find((q) => q.id === selectedQuoteId);
    const name = winner?.bidder_organization_name ?? "this supplier";
    setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "sending" }));
    const { createConnectionRequest, looksLikeConnectionRateLimitError } =
      await loadConnectionRequestsService();
    // requestCarrierSupplier: I am the shipper adding them to my supplier book.
    const { error, alreadyInvited } = await createConnectionRequest(
      orgId,
      selectedBidderOrgId,
      { requestShipperClient: false, requestCarrierSupplier: true },
    );
    if (error) {
      setInviteStatusByOrgId((m) => {
        const next = { ...m };
        delete next[selectedBidderOrgId];
        return next;
      });
      showAppAlert(
        looksLikeConnectionRateLimitError(error.message)
          ? "Daily limit exceeded"
          : "Could not send invite",
        error.message,
      );
      return;
    }
    setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "pending" }));
    onSuccess(
      alreadyInvited
        ? `${name} already has a pending supplier invite.`
        : `Supplier invite sent to ${name}. You can award once they accept.`,
    );
  }, [orgId, selectedBidderOrgId, selectedQuoteId, hubQuotes, onSuccess]);

  const open = useCallback((load: IndentRow) => {
    setCurrentLoad(load);
    setSelectedQuoteId(null);
  }, []);

  const close = useCallback(() => {
    setCurrentLoad(null);
    setSelectedQuoteId(null);
  }, []);

  const selectQuote = useCallback((id: string | null) => {
    setSelectedQuoteId(id);
  }, []);

  const award = useCallback(
    async (quoteIdOverride?: string) => {
      if (!orgId || !currentLoad) return;
      const winnerId = quoteIdOverride ?? selectedQuoteId;
      if (!winnerId) return;
      if (quoteIdOverride) setSelectedQuoteId(quoteIdOverride);
      const load = currentLoad;
      const currentStatus = (load.status || "").toLowerCase();
      if (currentStatus === "awarded" || currentStatus === "completed") {
        showAppAlert(
          "Already awarded",
          "This load has already been awarded. Closing.",
        );
        setCurrentLoad(null);
        setSelectedQuoteId(null);
        invalidateIndents(orgId);
        return;
      }
      if (currentStatus === "cancelled" || currentStatus === "closed") {
        showAppAlert(
          "Load unavailable",
          "This load has been cancelled or closed.",
        );
        setCurrentLoad(null);
        setSelectedQuoteId(null);
        invalidateIndents(orgId);
        return;
      }
      const pendingQuotes = hubQuotes.filter(
        (q) => (q.status || "").toLowerCase() === "pending",
      );
      const winner = pendingQuotes.find((q) => q.id === winnerId);
      if (!winner) {
        showAppAlert(
          "Invalid selection",
          "Please select a pending offer to award.",
        );
        return;
      }

      const isDriverDirect = winner.offer_source === "driver_direct_bid";

      // Org quotes need a supplier link; Pilot / FO awards create the driver row.
      // Use live organization_relations, not the delta-cached CRM list — a
      // linked supplier whose suppliers.updated_at was backdated never arrives
      // in cache, which previously swapped Award → "Invite as supplier".
      if (!isDriverDirect && winner.bidder_organization_id && orgId) {
        const alreadyConnected = effectiveConnectedSupplierOrgIds.has(
          winner.bidder_organization_id,
        );
        if (!alreadyConnected) {
          const { canAward } = await import(
            "@/features/connections/services/relationshipService"
          );
          const { allowed } = await canAward(
            winner.bidder_organization_id,
            orgId,
          );
          if (!allowed) {
            showAppAlert(
              "Supplier not connected",
              `${winner.bidder_organization_name ?? "This bidder"} is not in your supplier network yet. Send a supplier invite and award once they accept.`,
            );
            return;
          }
        }
      }
      const confirmed = await confirmDialog({
        title: "Confirm Award",
        message: `Award this load to ${winner.bidder_organization_name ?? "this bidder"} for ₹${Number(winner.amount ?? 0).toLocaleString("en-IN")}?`,
        confirmLabel: "Award",
        destructive: true,
      });
      if (!confirmed) return;

      try {
        setAwarding(true);

        if (isDriverDirect) {
          const { acceptDriverDirectBid, rejectDriverDirectBid } =
            await loadBidsService();
          const { error: acceptErr } = await acceptDriverDirectBid(winner.id);
          if (acceptErr) {
            showAppAlert("Could not award", acceptErr.message);
            return;
          }
          // Reject competing org quotes; competing driver bids are closed by
          // the indent-terminal trigger after accept awards the indent.
          for (const q of pendingQuotes) {
            if (q.id === winner.id) continue;
            if (q.offer_source === "driver_direct_bid") {
              await rejectDriverDirectBid(q.id);
              continue;
            }
            await updateDirectQuoteStatus(q.id, "rejected");
          }
          if (winner.bidder_organization_name?.trim()) {
            setLastAwardedByIndentId((m) => ({
              ...m,
              [load.id]: winner.bidder_organization_name!.trim(),
            }));
          }
          setSelectedQuoteId(null);
          setCurrentLoad(null);
          invalidateIndents(orgId);
          invalidatePosts();
          queryClient.invalidateQueries({
            queryKey: ["indents", "offer-counts"],
          });
          onSuccess("Load awarded — trip created from Pilot bid.");
          return;
        }

        const { error: acceptErr } = await updateDirectQuoteStatus(
          winner.id,
          "accepted",
        );
        if (acceptErr) {
          showAppAlert("Could not award", acceptErr.message);
          return;
        }
        for (const q of pendingQuotes) {
          if (q.id === winner.id) continue;
          if (q.offer_source === "driver_direct_bid") {
            const { rejectDriverDirectBid } = await loadBidsService();
            await rejectDriverDirectBid(q.id);
            continue;
          }
          const { error: rejectErr } = await updateDirectQuoteStatus(
            q.id,
            "rejected",
          );
          if (rejectErr) {
            showAppAlert(
              "Award partially failed",
              "One or more quotes could not be updated. Winner was set.",
            );
            queryClient.invalidateQueries({
              queryKey: ["indents", load.id, "direct-quotes"],
            });
            invalidateIndents(orgId);
            break;
          }
        }
        const { error: indentErr } = await updateIndent(load.id, {
          status: "awarded",
        });
        if (indentErr) {
          const friendlyMessage =
            indentErr.message &&
            (indentErr.message.includes("check constraint") ||
              indentErr.message.includes("indents_status_check"))
              ? "Indent status could not be updated. Please refresh the app and try again."
              : indentErr.message;
          showAppAlert(
            "Award saved but indent status could not be updated",
            friendlyMessage,
          );
          queryClient.invalidateQueries({
            queryKey: ["indents", load.id, "direct-quotes"],
          });
        }
        if (winner.bidder_organization_name?.trim()) {
          setLastAwardedByIndentId((m) => ({
            ...m,
            [load.id]: winner.bidder_organization_name!.trim(),
          }));
        }
        setSelectedQuoteId(null);
        setCurrentLoad(null);
        invalidateIndents(orgId);
        invalidatePosts();
        queryClient.invalidateQueries({
          queryKey: ["indents", "offer-counts"],
        });
        onSuccess("Load awarded — supplier can allocate from Action required.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        showAppAlert("Could not award", msg);
        if (currentLoad?.id) {
          queryClient.invalidateQueries({
            queryKey: ["indents", currentLoad.id, "direct-quotes"],
          });
        }
        invalidateIndents(orgId);
      } finally {
        setAwarding(false);
      }
    },
    [
      orgId,
      currentLoad,
      selectedQuoteId,
      hubQuotes,
      connectedSupplierOrgIds,
      effectiveConnectedSupplierOrgIds,
      queryClient,
      invalidateIndents,
      invalidatePosts,
      onSuccess,
    ],
  );

  return {
    isOpen: currentLoad !== null,
    currentLoad,
    selectedQuoteId,
    awarding,
    sortedQuotes,
    pendingCount,
    lowestPendingAmount,
    quotesLoading: quotesLoading || linkedPostQ.isLoading || driverDirectBidsQ.isLoading,
    connectedSupplierOrgIds: effectiveConnectedSupplierOrgIds,
    selectedBidderNeedsInvite,
    selectedBidderInviteStatus,
    inviteSelectedBidder,
    open,
    close,
    selectQuote,
    award,
    lastAwardedByIndentId,
  };
}
