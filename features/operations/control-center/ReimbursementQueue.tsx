import { Pressable, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { OperationalListRow, Surface } from "@/components/operational";
import type { OperationalQueueItem } from "./types";

export function ReimbursementQueue({
  items,
  selectedIds,
  onToggle,
}: {
  items: OperationalQueueItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <Surface style={styles.surface} elevation={1}>
      <Text style={styles.title}>Reimbursement queue</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>No reimbursement backlog.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.rowWrap}>
            <OperationalListRow
              title={`${item.trip?.tripLabel ?? "Unlinked"} · ${item.sourceType.toUpperCase()}`}
              subtitle={`${item.reimbursementState ?? "reported"} · paid by ${item.paymentOwner ?? "driver"}${item.remindedAt ? " · Reminded by driver" : ""}`}
              trailing={
                <Pressable
                  onPress={() => onToggle(item.id)}
                  style={[
                    styles.check,
                    selectedIds.has(item.id) && styles.checkActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.checkText,
                      selectedIds.has(item.id) && styles.checkTextActive,
                    ]}
                  >
                    {selectedIds.has(item.id) ? "Selected" : "Select"}
                  </Text>
                </Pressable>
              }
            />
          </View>
        ))
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  empty: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  rowWrap: {
    borderRadius: 10,
    overflow: "hidden",
  },
  check: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 68,
    alignItems: "center",
  },
  checkActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  checkText: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  checkTextActive: {
    color: Theme.primary,
  },
});
