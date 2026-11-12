/**
 * Carrier side of "Invite at Rs X": a shipper asks this carrier to bid one more
 * load on a lane it already bid. Accept places a normal bid at that rate (the
 * shipper still decides); Decline closes the request. Hidden when empty.
 */
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  respondLaneBidInvite,
  type LaneBidInvite,
} from "@/features/network/services/laneOffers.service";
import { laneOfferErrorMessage } from "@/features/network/utils/laneOffers.util";
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
        if (result?.status === "expired") {
          showAppAlert("Load closed", "This load is no longer open for offers.");
          return;
        }
        if (accept) {
          showAppAlert("Bid placed", `Your bid of ${formatINR(invite.amount)} is with the shipper.`, {
            tone: "success",
          });
          onResponded?.();
        }
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
        <Text style={styles.title}>Rate requests</Text>
        <Text style={styles.count}>{total}</Text>
      </View>
      <Text style={styles.subtitle}>
        Shippers asked you to bid these loads at the rate you bid on the same lane.
      </Text>
      {invites.map((invite) => (
        <View key={invite.invite_id} style={styles.row}>
          <View style={styles.body}>
            <Text style={styles.route} numberOfLines={2}>
              {routeLabel(invite)}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[
                invite.vehicle_type,
                invite.shipper_name ?? (invite.channel === "marketplace" ? "Marketplace load" : null),
                invite.indent_number,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
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
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.gpayListTitle,
  },
  count: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    fontSize: 12,
    color: Theme.gpayListSubtitle,
  },
  row: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  body: {
    minWidth: 0,
    gap: 2,
  },
  route: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.gpayListTitle,
  },
  meta: {
    fontSize: 11,
    color: Theme.gpayListSubtitle,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: Theme.darkBackground,
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  btnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  moreBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
});
