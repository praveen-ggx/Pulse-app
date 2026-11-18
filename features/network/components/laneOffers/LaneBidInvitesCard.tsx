/**
 * Carrier side of "Invite at Rs X": a shipper asks this carrier to bid one more
 * load on a lane it already bid. Accept places a normal bid at that rate (the
 * shipper still decides); Decline closes the request. Hidden when empty.
 */
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Send } from "lucide-react-native";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  respondLaneBidInvite,
  type LaneBidInvite,
} from "@/features/network/services/laneOffers.service";
import {
  laneBidInviteMeta,
  laneInviteResponseNotice,
  laneOfferErrorMessage,
} from "@/features/network/utils/laneOffers.util";
import { showAppAlert } from "@/lib/appAlert";
import { confirmDialog } from "@/lib/confirmDialog";
import { formatINR } from "@/lib/format";
import {
  useInvalidateLaneOffers,
  useMyLaneBidInvitesQuery,
} from "@/lib/queries/useLaneOffersQuery";

export interface LaneBidInvitesCardProps {
  /** Refetch the caller's own bid lists after an accept. */
  onResponded?: () => void;
}

function routeLabel(invite: LaneBidInvite): string {
  const from = invite.pickup_area?.trim() || "—";
  const to = invite.drop_location?.trim() || "—";
  return `${from} → ${to}`;
}

export function LaneBidInvitesCard({ onResponded }: LaneBidInvitesCardProps) {
  const query = useMyLaneBidInvitesQuery();
  const invalidate = useInvalidateLaneOffers();
  const [busy, setBusy] = useState<string | null>(null);

  const invites = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total_count ?? 0;

  const respond = useCallback(
    async (invite: LaneBidInvite, accept: boolean) => {
      if (accept) {
        const ok = await confirmDialog({
          title: `Bid ${formatINR(invite.amount)}?`,
          message: `This places your bid of ${formatINR(invite.amount)} on ${routeLabel(invite)}. The shipper still decides whether to award it.`,
          confirmLabel: "Place bid",
        });
        if (!ok) return;
      }
      setBusy(`${invite.invite_id}:${accept ? "a" : "d"}`);
      try {
        const { error, result } = await respondLaneBidInvite(invite.invite_id, accept);
        invalidate();
        if (error) {
          showAppAlert(accept ? "Could not place bid" : "Could not decline", laneOfferErrorMessage(error));
          return;
        }
        const notice = laneInviteResponseNotice(result, accept, formatINR(invite.amount));
        if (notice) {
          showAppAlert(notice.title, notice.message, notice.tone ? { tone: notice.tone } : undefined);
        }
        if (accept && result?.status === "accepted") onResponded?.();
      } finally {
        setBusy(null);
      }
    },
    [invalidate, onResponded],
  );

  if (total === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Send size={14} color={Theme.textOnPrimary} strokeWidth={2.2} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Rate requests</Text>
            <View style={styles.countPill}>
              <Text style={styles.count}>{total}</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Shippers asked you to bid these loads at the rate you bid on the same lane.
          </Text>
        </View>
      </View>
      {invites.map((invite) => (
        <View key={invite.invite_id} style={styles.row}>
          <View style={styles.rowTop}>
            <View style={styles.body}>
              <Text style={styles.route} numberOfLines={2}>
                {routeLabel(invite)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {laneBidInviteMeta(invite)}
              </Text>
            </View>
            <View style={styles.rate}>
              <Text style={styles.rateKicker}>Your rate</Text>
              <Text style={styles.rateValue}>{formatINR(invite.amount)}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => void respond(invite, false)}
              disabled={busy != null}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Decline rate request for ${routeLabel(invite)}`}
            >
              {busy === `${invite.invite_id}:d` ? (
                <LoadingIndicator size="small" color={Theme.textSecondary} />
              ) : (
                <Text style={styles.btnSecondaryText}>Decline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => void respond(invite, true)}
              disabled={busy != null}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Bid ${formatINR(invite.amount)} on ${routeLabel(invite)}`}
            >
              {busy === `${invite.invite_id}:a` ? (
                <LoadingIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>Bid {formatINR(invite.amount)}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {query.hasNextPage ? (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          accessibilityRole="button"
          accessibilityLabel="Load more rate requests"
        >
          {query.isFetchingNextPage ? (
            <LoadingIndicator size="small" color={Theme.primary} />
          ) : (
            <Text style={styles.moreText}>Load more ({Math.max(total - invites.length, 0)} left)</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  countPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: Theme.warningMuted,
    alignItems: "center",
  },
  count: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.warning,
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  row: {
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  route: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  rate: { alignItems: "flex-end", gap: 1 },
  rateKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  rateValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: Theme.darkBackground,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  btnSecondary: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  moreBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
