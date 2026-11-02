/**
 * Finance → Customers top panel: caller DCO Self book outstanding lines.
 * Empty when the signed-in user has no Self workspace / is not eligible.
 * Does not mix into org clients ledger — Self book only.
 */
import Theme from "@/constants/Theme";
import { listDcoSelfFinanceReceivables } from "@/features/dco-self/services/dcoSelfReceivable.service";
import { ROUTES } from "@/lib/routes";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function DcoSelfFinanceReceivablesPanel() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["q", "finance", "dco-self-receivables"],
    queryFn: async () => {
      const { error, rows } = await listDcoSelfFinanceReceivables();
      if (error) throw error;
      return rows;
    },
    staleTime: 30_000,
  });

  const rows = query.data ?? [];
  if (query.isLoading || rows.length === 0) return null;

  const byParty = new Map<
    string,
    { name: string; outstanding: number; billed: number; collected: number; count: number }
  >();
  for (const row of rows) {
    const key = row.party_b_id || row.receivable_id;
    const prev = byParty.get(key) ?? {
      name: row.party_name || row.party_a_label || "Party",
      outstanding: 0,
      billed: 0,
      collected: 0,
      count: 0,
    };
    prev.outstanding += row.outstanding;
    prev.billed += row.billed_amount;
    prev.collected += row.collected;
    prev.count += 1;
    byParty.set(key, prev);
  }
  const parties = Array.from(byParty.entries());

  return (
    <View style={styles.wrap} testID="dco-self-finance-receivables">
      <Text style={styles.title}>DCO Self receivables</Text>
      <Text style={styles.sub}>
        Your personal Self book — separate from organisation customers.
      </Text>
      {parties.map(([partyId, party]) => (
        <TouchableOpacity
          key={partyId}
          style={styles.row}
          onPress={() =>
            router.push(ROUTES.driverPartyReceivable(partyId) as Parameters<typeof router.push>[0])
          }
          accessibilityRole="button"
          accessibilityLabel={`${party.name}, ${inr(party.outstanding)} outstanding`}
        >
          <View style={styles.mid}>
            <Text style={styles.name} numberOfLines={1}>
              {party.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {party.count} line{party.count === 1 ? "" : "s"} · Sales {inr(party.billed)}
            </Text>
          </View>
          <View style={styles.amtCol}>
            <Text
              style={[
                styles.due,
                { color: party.outstanding > 0 ? Theme.negative : Theme.positive },
              ]}
            >
              {inr(party.outstanding)}
            </Text>
            <Text style={styles.received}>Received {inr(party.collected)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
    paddingHorizontal: 4,
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sub: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: -4,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    minHeight: 52,
  },
  mid: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  amtCol: { alignItems: "flex-end" },
  due: {
    fontSize: 14,
    fontWeight: "700",
  },
  received: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
});
