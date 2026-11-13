/**
 * Carrier My Bids: network quotes (direct_quotes) sit beside Marketplace bids.
 * A pending row is a quote waiting on the shipper. Award is a separate status.
 */
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import type { MyNetworkQuoteRow } from "@/features/network/services/laneOffers.service";
import { useMyNetworkQuotesQuery } from "@/lib/queries/useLaneOffersQuery";
import { formatINR } from "@/lib/format";

function statusWord(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "accepted") return "Awarded";
  if (value === "pending") return "Pending";
  if (value === "rejected") return "Not selected";
  return status || "Pending";
}

function routeLabel(quote: MyNetworkQuoteRow): string {
  const from = quote.pickup_area?.trim();
  const to = quote.drop_location?.trim();
  if (from || to) return `${from || "—"} → ${to || "—"}`;
  return quote.indent_number?.trim() || "Network quote";
}

export function NetworkMyQuotesList() {
  const query = useMyNetworkQuotesQuery();
  const quotes = (query.data ?? []).filter((quote) => {
    const status = quote.status.trim().toLowerCase();
    return status === "pending" || status === "accepted" || status === "rejected";
  });
  if (query.isLoading || quotes.length === 0) return null;

  const pending = quotes.filter((quote) => quote.status.trim().toLowerCase() === "pending");

  return (
    <View style={styles.wrap} testID="network-my-quotes">
      <Text style={styles.heading}>NETWORK · {quotes.length}</Text>
      <Text style={styles.note}>
        {pending.length > 0
          ? "Pending quotes are with the shipper. Accepting a rate request does not award the load."
          : "Awarded quotes were accepted by the shipper."}
      </Text>
      {quotes.map((quote) => {
        const status = statusWord(quote.status);
        return (
          <View key={quote.id} style={styles.row} testID={`network-quote-${quote.id}`}>
            <View style={styles.body}>
              <Text style={styles.route} numberOfLines={2}>
                {routeLabel(quote)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                Network
                {quote.indent_number ? ` · ${quote.indent_number}` : ""}
              </Text>
            </View>
            <View style={styles.side}>
              <Text style={styles.amount}>{formatINR(quote.amount)}</Text>
              <Text style={styles.status}>{status}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  heading: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  note: {
    color: Theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  route: { color: Theme.textPrimary, fontSize: 15, fontWeight: "600" },
  meta: { color: Theme.textSecondary, fontSize: 13 },
  side: { alignItems: "flex-end", gap: 2 },
  amount: { color: Theme.textPrimary, fontSize: 15, fontWeight: "700" },
  status: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
});
