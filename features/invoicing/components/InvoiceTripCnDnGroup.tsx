import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  groupInvoiceRevenueCnDn,
  invoiceTripAdjustedAmount,
} from "@/features/invoicing/services/invoiceCnDn.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, StyleSheet, Text, View } from "react-native";

function formatMoney(val: number) {
  return (
    "₹" +
    val.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function NoteRow({
  adj,
  onEdit,
}: {
  adj: TripAdjustment;
  onEdit?: (adj: TripAdjustment) => void;
}) {
  const isCn = adj.impact === "minus";
  const signed = isCn ? -Math.abs(adj.amount) : Math.abs(adj.amount);
  return (
    <Pressable
      style={styles.noteRow}
      onPress={onEdit ? () => onEdit(adj) : undefined}
      disabled={!onEdit}
      accessibilityRole={onEdit ? "button" : undefined}
      accessibilityLabel={`${isCn ? "Credit note" : "Debit note"} ${adj.reason}`}
    >
      <View
        style={[styles.pill, isCn ? styles.pillCn : styles.pillDn]}
      >
        <Text style={[styles.pillText, isCn ? styles.pillTextCn : styles.pillTextDn]}>
          {isCn ? "CN" : "DN"}
        </Text>
      </View>
      <Text style={styles.reason} numberOfLines={2}>
        {(adj.reason ?? "").trim() || (isCn ? "Credit note" : "Debit note")}
        {String(adj.mission_key ?? "").toUpperCase().includes("PODCNDN")
          ? " · Compliance"
          : " · Finance"}
      </Text>
      <Text style={[styles.amount, isCn ? styles.amountCn : styles.amountDn]}>
        {isCn ? "−" : "+"}
        {formatMoney(Math.abs(signed))}
      </Text>
    </Pressable>
  );
}

export function InvoiceTripCnDnGroup({
  trip,
  adjustments,
  onAdd,
  onEdit,
  showBreakdown = true,
}: {
  trip: InvoicingTripView;
  adjustments: TripAdjustment[];
  onAdd: () => void;
  onEdit?: (adj: TripAdjustment) => void;
  showBreakdown?: boolean;
}) {
  const grouped = groupInvoiceRevenueCnDn(adjustments);
  const costNotes = adjustments.filter(
    (adj) => adj.type === "cost" && !String(adj.voided_at ?? "").trim(),
  );
  const revised = invoiceTripAdjustedAmount(trip.amount, adjustments);
  const hasNotes =
    grouped.creditNotes.length +
      grouped.debitNotes.length +
      grouped.voided.length +
      costNotes.length >
    0;

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Sale CN / DN</Text>
        <Pressable
          style={styles.addBtn}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add credit or debit note"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <FontAwesome name="plus" size={11} color={Theme.analyticsHeroBg} />
          <Text style={styles.addBtnText}>CN / DN</Text>
        </Pressable>
      </View>

      {showBreakdown ? (
        <>
          {!hasNotes ? (
            <Text style={styles.empty}>
              No credit or debit notes on this trip. A note added here is the
              same note in Trip Finance and Compliance.
            </Text>
          ) : (
            <>
              {grouped.creditNotes.length > 0 ? (
                <View style={styles.group}>
                  <Text style={styles.groupLabel}>Credit notes</Text>
                  {grouped.creditNotes.map((adj) => (
                    <NoteRow key={adj.id} adj={adj} onEdit={onEdit} />
                  ))}
                </View>
              ) : null}
              {grouped.debitNotes.length > 0 ? (
                <View style={styles.group}>
                  <Text style={styles.groupLabel}>Debit notes</Text>
                  {grouped.debitNotes.map((adj) => (
                    <NoteRow key={adj.id} adj={adj} onEdit={onEdit} />
                  ))}
                </View>
              ) : null}
              {costNotes.length > 0 ? (
                <View style={styles.group}>
                  <Text style={styles.groupLabel}>Cost notes</Text>
                  {costNotes.map((adj) => (
                    <NoteRow key={adj.id} adj={adj} onEdit={onEdit} />
                  ))}
                </View>
              ) : null}
            </>
          )}

          {Math.abs(grouped.delta) >= 0.005 ? (
            <View style={styles.revised}>
              <View>
                <Text style={styles.revisedLabel}>Invoice freight</Text>
                <Text style={styles.original}>Was {formatMoney(trip.amount)}</Text>
              </View>
              <Text style={styles.revisedVal}>{formatMoney(revised)}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  toolbarTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },
  empty: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 17,
    marginBottom: 4,
  },
  group: { marginBottom: 8 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 4,
  },
  pill: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: "center",
  },
  pillCn: { backgroundColor: Theme.brandBlueWashSubtle },
  pillDn: { backgroundColor: Theme.surfaceGray },
  pillText: { fontSize: 11, fontWeight: "600" },
  pillTextCn: { color: Theme.primary },
  pillTextDn: { color: Theme.positive },
  reason: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  amount: { fontSize: 13, fontWeight: "500" },
  amountCn: { color: Theme.negative },
  amountDn: { color: Theme.positive },
  revised: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  revisedLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  original: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },
  revisedVal: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
});
