/**
 * Shown right after a load is shared. Adds live Network lane rates to the new
 * load, then shows what is already on offer for this lane. When the load went
 * to Network only and the Network has nothing, recommends Marketplace and says
 * how many Marketplace bids the lane already has.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LaneOffersSection } from "@/features/network/components/laneOffers/LaneOffersSection";
import { attachLaneCommitmentsForIndent } from "@/features/network/services/laneOffers.service";
import { laneOffersDialogMode } from "@/features/network/utils/laneOffers.util";
import { formatINR } from "@/lib/format";
import {
  useInvalidateLaneOffers,
  useLaneOffersForIndentQuery,
} from "@/lib/queries/useLaneOffersQuery";

export type LaneOffersDialogResult = "review" | "close";

export interface LaneOffersAfterCreateDialogProps {
  indentId: string | null;
  onDone: (result: LaneOffersDialogResult) => void;
  /** Switches the load to Network + Marketplace. Resolves true on success. */
  onPostToMarketplace: (indentId: string) => Promise<boolean>;
}

export function LaneOffersAfterCreateDialog({
  indentId,
  onDone,
  onPostToMarketplace,
}: LaneOffersAfterCreateDialogProps) {
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLaneOffers();
  const [attached, setAttached] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    setAttached(null);
    setPosted(false);
    if (!indentId) return;
    let cancelled = false;
    void attachLaneCommitmentsForIndent(indentId).then(({ attached: n }) => {
      if (!cancelled) setAttached(n);
    });
    return () => {
      cancelled = true;
    };
  }, [indentId]);

  const query = useLaneOffersForIndentQuery(indentId, { enabled: attached != null });
  const page = query.data?.pages[0] ?? null;
  const ready = attached != null && (query.isFetched || query.isError);
  const mode = laneOffersDialogMode(query.isError ? null : page, attached ?? 0);

  const finish = useCallback(
    (result: LaneOffersDialogResult) => {
      if (closedRef.current) return;
      closedRef.current = true;
      onDone(result);
    },
    [onDone],
  );

  useEffect(() => {
    if (indentId && ready && mode === "none" && !posted) finish("close");
  }, [indentId, ready, mode, posted, finish]);

  const postToMarketplace = useCallback(async (): Promise<boolean> => {
    if (!indentId) return false;
    setPosting(true);
    try {
      const ok = await onPostToMarketplace(indentId);
      if (ok) {
        setPosted(true);
        invalidate(indentId);
      }
      return ok;
    } finally {
      setPosting(false);
    }
  }, [indentId, invalidate, onPostToMarketplace]);

  const heading = useMemo(() => {
    if (!page) return { title: "Offers on this lane", body: "" };
    if (mode === "recommend_marketplace") {
      const mkt = page.marketplace_count;
      return {
        title: "No Network offers yet",
        body:
          "None of your Network carriers has a rate on this lane yet. Post this load to Marketplace to reach verified drivers and fleet owners." +
          (mkt > 0
            ? ` ${mkt} Marketplace ${mkt === 1 ? "bidder has" : "bidders have"} already bid on this lane, from ${formatINR(page.min_marketplace_amount ?? 0)}.`
            : ""),
      };
    }
    if (mode === "none" && posted) {
      return {
        title: "Shared to Marketplace",
        body: "Marketplace bids will appear in Live bids as they come in.",
      };
    }
    const added = attached ?? 0;
    const parts: string[] = [];
    if (added > 0) {
      parts.push(
        `${added} Network lane ${added === 1 ? "rate was" : "rates were"} added to this load as ${added === 1 ? "an offer" : "offers"}.`,
      );
    }
    if (page.total_count > 0) {
      parts.push(
        `${page.total_count} ${page.total_count === 1 ? "carrier has" : "carriers have"} bid on your other loads on this lane. Invite them to bid this load at the same rate.`,
      );
    }
    return { title: "Offers on this lane", body: parts.join(" ") };
  }, [attached, mode, page, posted]);

  const visible = !!indentId && !closedRef.current && (!ready || mode !== "none" || posted);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish("close")}>
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.card}>
          {!ready ? (
            <View style={styles.loading}>
              <LoadingIndicator size="small" color={Theme.primary} />
              <Text style={styles.body}>Checking offers on this lane…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{heading.title}</Text>
              {heading.body ? <Text style={styles.body}>{heading.body}</Text> : null}
              {indentId && mode === "offers" && (page?.total_count ?? 0) > 0 ? (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                  <LaneOffersSection
                    indentId={indentId}
                    onPostToMarketplace={postToMarketplace}
                    title="Bids on this lane"
                  />
                </ScrollView>
              ) : null}
              <View style={styles.actions}>
                {mode === "recommend_marketplace" ? (
                  <>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => finish("close")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSecondaryText}>Not now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary, posting && styles.btnBusy]}
                      onPress={() => void postToMarketplace()}
                      disabled={posting}
                      accessibilityRole="button"
                    >
                      {posting ? (
                        <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                      ) : (
                        <Text style={styles.btnPrimaryText}>Post to Marketplace</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => finish("close")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSecondaryText}>Done</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={() => finish("review")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnPrimaryText}>Review offers</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "100%",
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    padding: 20,
    gap: 12,
  },
  loading: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.gpayListTitle,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  btn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: Theme.darkBackground,
  },
  btnBusy: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  btnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
