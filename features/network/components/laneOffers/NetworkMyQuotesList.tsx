/**
 * Carrier My Bids: network quotes (direct_quotes) sit beside Marketplace bids.
 * A pending row is a quote waiting on the shipper. Award is a separate status.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Handshake } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { MyNetworkQuoteRow } from "@/features/network/services/laneOffers.service";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { useMyNetworkQuotesQuery } from "@/lib/queries/useLaneOffersQuery";
import { countSubmittedBids, loadsCaption } from "@/features/network/utils/bidLoadCount.util";
import { ScoreboardNumber } from "@/features/network/components/ScoreboardNumber";
import { formatINR } from "@/lib/format";

const COLLAPSED_ROWS = 5;

type QuoteTone = "pending" | "awarded" | "closed";

function quoteTone(status: string): QuoteTone {
  const value = status.trim().toLowerCase();
  if (value === "accepted") return "awarded";
  if (value === "rejected") return "closed";
  return "pending";
}

const TONE_LABEL: Record<QuoteTone, string> = {
  pending: "Pending",
  awarded: "Awarded",
  closed: "Not selected",
};

const TONE_ORDER: Record<QuoteTone, number> = { pending: 0, awarded: 1, closed: 2 };

function routeLabel(quote: MyNetworkQuoteRow): string {
  const from = quote.pickup_area?.trim();
  const to = quote.drop_location?.trim();
  if (from || to) return `${from || "—"} → ${to || "—"}`;
  return quote.indent_number?.trim() || "Network load";
}

function metaLabel(quote: MyNetworkQuoteRow): string {
  const hasRoute = Boolean(quote.pickup_area?.trim() || quote.drop_location?.trim());
  const indent = hasRoute ? quote.indent_number?.trim() : "";
  return ["Network", indent, formatStoryDate(quote.created_at)].filter(Boolean).join(" · ");
}

export function NetworkMyQuotesList() {
  const query = useMyNetworkQuotesQuery();
  const [expanded, setExpanded] = useState(false);
  const quotes = useMemo(
    () =>
      (query.data ?? [])
        .filter((quote) => {
          const status = quote.status.trim().toLowerCase();
          return status === "pending" || status === "accepted" || status === "rejected";
        })
        .sort(
          (a, b) =>
            TONE_ORDER[quoteTone(a.status)] - TONE_ORDER[quoteTone(b.status)] ||
            b.created_at.localeCompare(a.created_at),
        ),
    [query.data],
  );
  if (query.isLoading || quotes.length === 0) return null;

  const pendingCount = quotes.filter((quote) => quoteTone(quote.status) === "pending").length;
  const totals = countSubmittedBids(quotes);
  const visible = expanded ? quotes : quotes.slice(0, COLLAPSED_ROWS);
  const hidden = quotes.length - visible.length;

  return (
    <View style={styles.card} testID="network-my-quotes">
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Network quotes</Text>
          <ScoreboardNumber value={totals.bids} style={styles.count} />
        </View>
        <Text style={styles.loads}>{loadsCaption(totals.loads)}</Text>
        <Text style={styles.note}>
          {pendingCount > 0
            ? "Pending with shipper · accepting a rate request does not award the load"
            : "Awarded quotes were accepted by the shipper"}
        </Text>
      </View>
      {visible.map((quote) => {
        const tone = quoteTone(quote.status);
        return (
          <View key={quote.id} style={styles.row} testID={`network-quote-${quote.id}`}>
            <View style={styles.icon}>
              <Handshake size={15} color={Theme.textSecondary} strokeWidth={2} />
            </View>
            <View style={styles.body}>
              <Text style={styles.route} numberOfLines={1}>
                {routeLabel(quote)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {metaLabel(quote)}
              </Text>
            </View>
            <View style={styles.side}>
              <Text style={[styles.amount, tone === "closed" && styles.amountClosed]}>
                {formatINR(quote.amount)}
              </Text>
              <View
                style={[
                  styles.pill,
                  tone === "awarded" && styles.pillAwarded,
                  tone === "pending" && styles.pillPending,
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    tone === "awarded" && styles.pillTextAwarded,
                    tone === "pending" && styles.pillTextPending,
                  ]}
                >
                  {TONE_LABEL[tone]}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
      {quotes.length > COLLAPSED_ROWS ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show fewer network quotes" : `Show all ${quotes.length} network quotes`}
        >
          <Text style={styles.moreText}>{expanded ? "Show less" : `Show all · ${hidden} more`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  head: { gap: 4, paddingBottom: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: Theme.textPrimaryDark, letterSpacing: -0.2 },
  count: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  loads: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textMuted },
  note: { fontSize: 12, lineHeight: 16, color: Theme.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  route: { color: Theme.textPrimaryDark, fontSize: 14, fontWeight: "600" },
  meta: { color: Theme.textMuted, fontSize: 12 },
  side: { alignItems: "flex-end", gap: 4 },
  amount: {
    color: Theme.textPrimaryDark,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  amountClosed: { color: Theme.textMuted },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  pillAwarded: { backgroundColor: Theme.positiveMuted },
  pillPending: { backgroundColor: Theme.warningMuted },
  pillText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  pillTextAwarded: { color: Theme.positive },
  pillTextPending: { color: Theme.warning },
  more: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  morePressed: { opacity: 0.6 },
  moreText: { fontSize: 13, fontWeight: "700", color: Theme.textSecondary },
});
