/**
 * Compact Hard Copy POD status card for Manifest Assets sidebar.
 */
import Theme from "@/constants/Theme";
import type {
  HardCopyPodStatus,
  TripHardCopyPodState,
} from "@/features/trips/services/tripDocumentLrPod.service";
import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

function statusColor(status: HardCopyPodStatus): string {
  if (status === "RECEIVED") return Theme.positive;
  if (status === "IN_TRANSIT") return Theme.warning;
  return Theme.textMuted;
}

function statusLabel(status: HardCopyPodStatus): string {
  if (status === "IN_TRANSIT") return "IN TRANSIT";
  return status;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const raw = String(iso).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function HardCopyPodStatusCard({
  state,
  canManage,
  tripCompleted,
  onViewDetails,
  onUpdatePod,
  onLogPod,
  style,
}: {
  state: TripHardCopyPodState | null;
  canManage: boolean;
  tripCompleted: boolean;
  onViewDetails: () => void;
  onUpdatePod: () => void;
  onLogPod: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const status = state?.status ?? "PENDING";
  const color = statusColor(status);
  const canLog = canManage && tripCompleted;

  return (
    <View style={[styles.card, status === "RECEIVED" && styles.cardReceived, style]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Feather name="file-text" size={13} color={Theme.textMuted} />
          <Text style={styles.title} numberOfLines={1}>
            Hard Copy POD
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.pillText, { color }]}>{statusLabel(status)}</Text>
        </View>
      </View>

      {status === "RECEIVED" ? (
        <View style={styles.body}>
          <Fact
            label="Method"
            value={
              state?.receiptMethod === "courier"
                ? "Received by Courier"
                : state?.receiptMethod === "person"
                  ? "Received by Person"
                  : "—"
            }
          />
          {state?.receiptMethod === "courier" && state.courier ? (
            <Fact label="Courier" value={state.courier} />
          ) : null}
          {state?.receiptMethod === "courier" && state.awbNumber ? (
            <Fact label="AWB" value={state.awbNumber} />
          ) : null}
          {state?.receivedBy ? <Fact label="Received" value={state.receivedBy} /> : null}
          <Fact
            label="Date"
            value={
              formatDate(state?.receivedDate) !== "—"
                ? formatDate(state?.receivedDate)
                : formatDate(state?.receivedAt)
            }
          />
          {state?.receivedTime ? <Fact label="Time" value={state.receivedTime} /> : null}
          {state?.remarks ? <Fact label="Remarks" value={state.remarks} /> : null}
          <Pressable
            onPress={onViewDetails}
            style={styles.linkBtn}
            accessibilityRole="button"
            accessibilityLabel="View POD details"
          >
            <Text style={styles.linkText}>View Details</Text>
          </Pressable>
        </View>
      ) : null}

      {status === "IN_TRANSIT" ? (
        <View style={styles.body}>
          <Fact label="Courier" value={state?.courier ?? "—"} />
          <Fact label="AWB" value={state?.awbNumber ?? "—"} />
          {state?.dispatchDate ? (
            <Fact label="Dispatch" value={formatDate(state.dispatchDate)} />
          ) : null}
          {state?.expectedDeliveryDate ? (
            <Fact label="Delivery" value={formatDate(state.expectedDeliveryDate)} />
          ) : null}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={onViewDetails}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="View POD details"
            >
              <Text style={styles.linkText}>View Details</Text>
            </Pressable>
            {canManage ? (
              <Pressable
                onPress={onUpdatePod}
                style={styles.updateBtn}
                accessibilityRole="button"
                accessibilityLabel="Update POD"
              >
                <Text style={styles.updateBtnText}>Update POD</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {status === "PENDING" ? (
        <View style={styles.body}>
          <Text style={styles.meta}>
            {tripCompleted
              ? "No hard-copy POD logged yet."
              : "Available after the trip is completed."}
          </Text>
          {canManage ? (
            <Pressable
              onPress={canLog ? onLogPod : undefined}
              disabled={!canLog}
              style={[styles.linkBtn, !canLog && styles.linkBtnLocked]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canLog }}
              accessibilityLabel={
                canLog
                  ? "Log Hard Copy POD"
                  : "Log Hard Copy POD locked until trip is completed"
              }
            >
              <Text style={[styles.linkText, !canLog && styles.linkTextLocked]}>
                Log Hard Copy POD
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factLabelCol}>
        <Text style={styles.factLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.factValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: Theme.tripDetailAssetCardBackgroundColor,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
  },
  cardReceived: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  title: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  body: {
    width: "100%",
    alignSelf: "stretch",
    gap: 5,
  },
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minWidth: 0,
  },
  factLabelCol: {
    width: 76,
    flexGrow: 0,
    flexShrink: 0,
    marginRight: 8,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    lineHeight: 16,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  factValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "500",
  },
  metaStrong: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  awb: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
    letterSpacing: 0.3,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    flexWrap: "wrap",
  },
  linkBtn: {
    minHeight: 28,
    marginTop: 2,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  linkBtnLocked: {
    opacity: 0.45,
  },
  linkText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },
  linkTextLocked: {
    color: Theme.textMuted,
  },
  updateBtn: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: Theme.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  updateBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.warning,
    letterSpacing: 0.3,
  },
});
