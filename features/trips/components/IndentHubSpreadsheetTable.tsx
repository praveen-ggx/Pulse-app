import Theme from "@/constants/Theme";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import { isIndentPickupPassed } from "@/features/indents/utils/indentWorkload.util";
import {
  indentHubLaneLabel,
  indentHubTableDate,
  indentHubTableMargin,
  indentHubTableMoney,
  indentHubTableStatus,
} from "@/features/trips/utils/indentHubTableTrip.util";
import { History, MoreVertical } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type IndentHubSpreadsheetTableProps = {
  indents: IndentRow[];
  bidCountById?: Record<string, number>;
  supplierNameById?: Record<string, string>;
  onOpenIndent: (indent: IndentRow) => void;
  onOpenActivity?: (indent: IndentRow) => void;
};

const COLUMNS = [
  "INDENT ID",
  "LANE",
  "CLIENT",
  "SUPPLIER",
  "SALES",
  "COST",
  "MARGIN",
  "DATE",
  "STATUS",
] as const;

export function IndentHubSpreadsheetTable({
  indents,
  bidCountById,
  supplierNameById,
  onOpenIndent,
  onOpenActivity,
}: IndentHubSpreadsheetTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <View style={styles.wrap} accessibilityLabel="Indent table">
      <View style={styles.header}>
        <View style={[styles.cell, styles.colCheck]} />
        {COLUMNS.map((label) => (
          <View
            key={label}
            style={[
              styles.cell,
              label === "INDENT ID" && styles.colId,
              label === "LANE" && styles.colLane,
              label === "CLIENT" && styles.colParty,
              label === "SUPPLIER" && styles.colParty,
              (label === "SALES" || label === "COST" || label === "MARGIN") &&
                styles.colMoney,
              label === "DATE" && styles.colDate,
              label === "STATUS" && styles.colStatus,
            ]}
          >
            <Text style={styles.headerText}>{label}</Text>
          </View>
        ))}
        <View style={[styles.cell, styles.colMore]} />
      </View>

      {indents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No indents in this filter.</Text>
        </View>
      ) : (
        indents.map((indent) => {
          const lane = indentHubLaneLabel(indent.pickup_area, indent.drop_location);
          const sales = Number(indent.client_price) || 0;
          const cost = Number(indent.assigned_supplier_rate ?? indent.supplier_target) || 0;
          const margin = indentHubTableMargin(sales, cost);
          const status = indentHubTableStatus(
            indent.status,
            bidCountById?.[indent.id] ?? 0,
          );
          const failed = status === "FAILED";
          const pickupPassed = isIndentPickupPassed(indent);
          const supplier =
            supplierNameById?.[indent.id] ||
            String((indent as { assigned_supplier_name?: string | null }).assigned_supplier_name ?? "").trim() ||
            "—";
          const hovered = hoveredId === indent.id;
          return (
            <Pressable
              key={indent.id}
              onPress={() => onOpenIndent(indent)}
              onHoverIn={() => setHoveredId(indent.id)}
              onHoverOut={() =>
                setHoveredId((current) => (current === indent.id ? null : current))
              }
              style={[styles.row, hovered && styles.rowHover]}
              accessibilityRole="button"
              accessibilityLabel={`${getIndentDisplayNumber(indent)}, ${status}`}
            >
              <View style={[styles.cell, styles.colCheck]}>
                <View style={styles.checkbox} />
              </View>
              <View style={[styles.cell, styles.colId]}>
                <Text style={styles.idText} numberOfLines={1}>
                  {getIndentDisplayNumber(indent)}
                </Text>
              </View>
              <View style={[styles.cell, styles.colLane]}>
                <Text style={styles.bodyText} numberOfLines={1}>
                  {lane.short}
                </Text>
                {hovered && lane.full !== lane.short ? (
                  <View style={styles.laneTip} pointerEvents="none">
                    <Text style={styles.laneTipText}>{lane.full}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.cell, styles.colParty]}>
                <Text style={styles.bodyText} numberOfLines={1}>
                  {indent.client_name?.trim() || "—"}
                </Text>
              </View>
              <View style={[styles.cell, styles.colParty]}>
                <Text style={styles.mutedText} numberOfLines={1}>
                  {supplier}
                </Text>
              </View>
              <View style={[styles.cell, styles.colMoney]}>
                <Text style={styles.moneyText}>{indentHubTableMoney(sales)}</Text>
              </View>
              <View style={[styles.cell, styles.colMoney]}>
                <Text style={styles.moneyText}>{indentHubTableMoney(cost)}</Text>
              </View>
              <View style={[styles.cell, styles.colMoney]}>
                <Text style={styles.moneyText}>{margin.amount}</Text>
                <Text style={styles.pctText}>{margin.ofSales}</Text>
              </View>
              <View style={[styles.cell, styles.colDate]}>
                <Text style={styles.bodyText}>{indentHubTableDate(indent.pickup_date)}</Text>
              </View>
              <View style={[styles.cell, styles.colStatus]}>
                <Text style={[styles.statusText, failed && styles.statusFailed]} numberOfLines={1}>
                  {status}
                </Text>
                {pickupPassed ? (
                  <Text style={styles.pickupPassedText} numberOfLines={1}>
                    PICKUP PASSED
                  </Text>
                ) : null}
              </View>
              <View style={[styles.cell, styles.colMore]}>
                {onOpenActivity ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onOpenActivity(indent);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Open indent activity log"
                  >
                    <History size={13} color={Theme.textMuted} strokeWidth={2.2} />
                  </Pressable>
                ) : (
                  <MoreVertical size={14} color={Theme.textMuted} strokeWidth={2} />
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  rowHover: {
    backgroundColor: Theme.tableRowHover,
  },
  cell: {
    paddingHorizontal: 8,
    justifyContent: "center",
    minWidth: 0,
  },
  colCheck: { width: 28, flexGrow: 0, flexShrink: 0 },
  colId: { flex: 1.4, minWidth: 150 },
  colLane: { flex: 1.8, minWidth: 160, position: "relative" },
  colParty: { flex: 1.2, minWidth: 110 },
  colMoney: { width: 88, flexGrow: 0, alignItems: "flex-end" },
  colDate: { width: 72, flexGrow: 0 },
  colStatus: { width: 132, flexGrow: 0 },
  colMore: { width: 28, flexGrow: 0, alignItems: "center" },
  headerText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  idText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  bodyText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  mutedText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  moneyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    textAlign: "right",
  },
  pctText: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "right",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.primary,
    textTransform: "uppercase",
  },
  statusFailed: {
    color: Theme.negative,
  },
  pickupPassedText: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.warning,
  },
  laneTip: {
    position: "absolute",
    left: 8,
    top: -30,
    zIndex: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  laneTipText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  empty: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
