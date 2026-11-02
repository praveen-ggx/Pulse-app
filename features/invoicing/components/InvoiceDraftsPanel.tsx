import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { issuedInvoicesForClient } from "@/features/invoicing/utils/issuedInvoiceMatch.util";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatWhen(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function draftTitle(item: IssuedInvoiceListRow): string {
  return item.client_name?.trim() || "Draft invoice";
}

function tripCount(item: IssuedInvoiceListRow): number {
  return item.trip_ids?.length ?? 0;
}

export function InvoiceDraftsPanel({
  drafts,
  partnerClientId,
  partnerLabel,
  selectedId = null,
  onSelect,
  onResume,
  onCancel,
}: {
  drafts: IssuedInvoiceListRow[];
  partnerClientId?: string | null;
  partnerLabel?: string | null;
  selectedId?: string | null;
  onSelect?: (draft: IssuedInvoiceListRow) => void;
  onResume: (draft: IssuedInvoiceListRow) => void;
  onCancel: (draft: IssuedInvoiceListRow) => void;
}) {
  const rows =
    partnerClientId || partnerLabel
      ? issuedInvoicesForClient(drafts, {
          clientId: partnerClientId,
          clientName: partnerLabel,
        })
      : drafts;

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No drafts</Text>
        <Text style={styles.emptySub}>
          Save a draft from the invoice preview. It stays here until you issue or cancel it.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      {rows.map((item) => {
        const selected = item.id === selectedId;
        const trips = tripCount(item);
        return (
          <Pressable
            key={item.id}
            style={[styles.card, selected && styles.cardOn]}
            onPress={() => (onSelect ? onSelect(item) : onResume(item))}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Preview draft for ${draftTitle(item)}`}
          >
            <View style={styles.sheet}>
              <View style={[styles.sheetBand, selected && styles.sheetBandOn]}>
                <Text style={[styles.sheetKicker, selected && styles.sheetKickerOn]}>Draft</Text>
                <Text style={[styles.sheetAmount, selected && styles.sheetKickerOn]}>
                  {formatInr(item.total_amount)}
                </Text>
              </View>
              <Text style={styles.sheetName} numberOfLines={2}>{draftTitle(item)}</Text>
              <View style={styles.rule} />
              <View style={styles.fakeLine} />
              <View style={[styles.fakeLine, styles.fakeLineShort]} />
              <View style={styles.fakeLine} />
              <View style={styles.sheetTotal}>
                <Text style={styles.sheetTotalLabel}>Balance</Text>
                <Text style={styles.sheetTotalValue}>{formatInr(item.total_amount)}</Text>
              </View>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {trips} trip{trips === 1 ? "" : "s"} · {formatWhen(item.updated_at || item.created_at)}
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.primary}
                onPress={() => onResume(item)}
                accessibilityRole="button"
                accessibilityLabel="Open draft"
              >
                <Text style={styles.primaryText}>Open</Text>
              </Pressable>
              <Pressable
                style={styles.secondary}
                onPress={() => onCancel(item)}
                accessibilityRole="button"
                accessibilityLabel="Cancel draft"
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: Theme.screenBackground },
  content: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 32,
  },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  emptySub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
  },
  card: {
    width: 176,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 8,
  },
  cardOn: {
    borderColor: Theme.primary,
    borderWidth: 2,
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 6,
    overflow: "hidden",
    minHeight: 168,
  },
  sheetBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sheetBandOn: { backgroundColor: Theme.primary },
  sheetKicker: { fontSize: 9, fontWeight: "500", color: Theme.textSecondary, letterSpacing: 0.4 },
  sheetKickerOn: { color: Theme.buttonDarkText },
  sheetAmount: { fontSize: 10, fontWeight: "500", color: Theme.textPrimaryDark },
  sheetName: {
    marginTop: 8,
    marginHorizontal: 8,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    minHeight: 32,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
    marginHorizontal: 8,
    marginTop: 6,
  },
  fakeLine: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surface,
    marginHorizontal: 8,
    marginTop: 6,
  },
  fakeLineShort: { width: "62%" },
  sheetTotal: {
    marginTop: 8,
    marginHorizontal: 8,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetTotalLabel: { fontSize: 9, fontWeight: "400", color: Theme.textMuted },
  sheetTotalValue: { fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  meta: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  primary: {
    flex: 1,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: Theme.textPrimaryDark, fontWeight: "500", fontSize: 12 },
  secondary: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: Theme.textSecondary, fontWeight: "500", fontSize: 12 },
});
