/**
 * Compact Hard Copy POD status card for Manifest Assets sidebar.
 * Status-aware layout: received tiles, in-transit timeline, pending empty state.
 */
import Theme from "@/constants/Theme";
import type {
  HardCopyPodStatus,
  TripHardCopyPodState,
} from "@/features/trips/services/tripDocumentLrPod.service";
import Feather from "@expo/vector-icons/Feather";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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

function relativeFrom(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days < 0) {
    const ahead = Math.abs(days);
    if (ahead === 0) return "Today";
    if (ahead === 1) return "Tomorrow";
    return `In ${ahead}d`;
  }
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 45) return `${Math.floor(days / 7)}w ago`;
  return null;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function methodMeta(state: TripHardCopyPodState | null): {
  label: string;
  icon: keyof typeof Feather.glyphMap;
} {
  if (state?.receiptMethod === "courier") {
    return { label: "Courier handoff", icon: "truck" };
  }
  if (state?.receiptMethod === "person") {
    return { label: "In-person handoff", icon: "user" };
  }
  return { label: "Receipt method unknown", icon: "help-circle" };
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
  const method = methodMeta(state);
  const receivedWhen =
    formatDate(state?.receivedDate) !== "—"
      ? formatDate(state?.receivedDate)
      : formatDate(state?.receivedAt);
  const receivedRelative =
    relativeFrom(state?.receivedAt) ?? relativeFrom(state?.receivedDate);
  const receiver = (state?.receivedBy ?? "").trim();

  return (
    <View
      style={[
        styles.card,
        status === "RECEIVED" && styles.cardReceived,
        status === "IN_TRANSIT" && styles.cardTransit,
        style,
      ]}
    >
      <View style={[styles.accentRail, { backgroundColor: color }]} />

      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBadge, { backgroundColor: `${color}18` }]}>
              <Feather
                name={status === "RECEIVED" ? "check-circle" : "file-text"}
                size={13}
                color={color}
              />
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                Hard Copy POD
              </Text>
              {status === "RECEIVED" && receivedRelative ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  Logged {receivedRelative}
                </Text>
              ) : status === "IN_TRANSIT" ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  En route to office
                </Text>
              ) : (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {tripCompleted ? "Awaiting physical POD" : "Unlocks after completion"}
                </Text>
              )}
            </View>
          </View>
          <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.pillText, { color }]}>{statusLabel(status)}</Text>
          </View>
        </View>

        {status === "RECEIVED" ? (
          <View style={styles.body}>
            <View style={styles.methodChip}>
              <Feather name={method.icon} size={12} color={Theme.positive} />
              <Text style={styles.methodChipText} numberOfLines={1}>
                {method.label}
              </Text>
            </View>

            {receiver ? (
              <View style={styles.receiverRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsFrom(receiver)}</Text>
                </View>
                <View style={styles.receiverMeta}>
                  <Text style={styles.receiverLabel}>Received by</Text>
                  <Text style={styles.receiverName} numberOfLines={1}>
                    {receiver}
                  </Text>
                </View>
              </View>
            ) : null}

            {state?.receiptMethod === "courier" && (state.courier || state.awbNumber) ? (
              <View style={styles.courierStrip}>
                {state.courier ? (
                  <Text style={styles.courierText} numberOfLines={1}>
                    {state.courier}
                  </Text>
                ) : null}
                {state.awbNumber ? (
                  <Text style={styles.awbText} numberOfLines={1}>
                    AWB {state.awbNumber}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.tileGrid}>
              <Tile icon="calendar" label="Date" value={receivedWhen} />
              <Tile
                icon="clock"
                label="Time"
                value={state?.receivedTime?.trim() || "—"}
              />
            </View>

            {state?.remarks ? (
              <View style={styles.remarksBox}>
                <Feather name="message-circle" size={12} color={Theme.textMuted} />
                <Text style={styles.remarksText}>{state.remarks}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={onViewDetails}
              style={({ pressed }) => [
                styles.ctaRow,
                pressed && styles.ctaRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View POD details"
            >
              <Text style={styles.ctaText}>View details</Text>
              <Feather name="chevron-right" size={14} color={Theme.analyticsHeroBg} />
            </Pressable>
          </View>
        ) : null}

        {status === "IN_TRANSIT" ? (
          <View style={styles.body}>
            <View style={styles.timeline}>
              <TimelineStep label="Dispatched" done value={formatDate(state?.dispatchDate)} />
              <View style={styles.timelineLine} />
              <TimelineStep label="In transit" active value="Now" />
              <View style={styles.timelineLine} />
              <TimelineStep
                label="Expected"
                value={
                  formatDate(state?.expectedDeliveryDate) !== "—"
                    ? formatDate(state?.expectedDeliveryDate)
                    : "—"
                }
                hint={relativeFrom(state?.expectedDeliveryDate) ?? undefined}
              />
            </View>

            <View style={styles.tileGrid}>
              <Tile icon="truck" label="Courier" value={state?.courier ?? "—"} />
              <Tile icon="hash" label="AWB" value={state?.awbNumber ?? "—"} mono />
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                onPress={onViewDetails}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.ctaRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="View POD details"
              >
                <Text style={styles.secondaryBtnText}>Details</Text>
              </Pressable>
              {canManage ? (
                <Pressable
                  onPress={onUpdatePod}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.primaryBtnWarning,
                    pressed && styles.ctaRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Update POD"
                >
                  <Feather name="package" size={13} color={Theme.warning} />
                  <Text style={styles.primaryBtnWarningText}>Mark received</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {status === "PENDING" ? (
          <View style={styles.body}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name="inbox" size={18} color={Theme.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {tripCompleted ? "No hard-copy POD yet" : "POD logging locked"}
              </Text>
              <Text style={styles.emptyBody}>
                {tripCompleted
                  ? "Log the physical POD when it reaches the office — person or courier."
                  : "Complete the trip first, then log the hard-copy POD here."}
              </Text>
            </View>
            {canManage ? (
              <Pressable
                onPress={canLog ? onLogPod : undefined}
                disabled={!canLog}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  !canLog && styles.primaryBtnLocked,
                  pressed && canLog && styles.ctaRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canLog }}
                accessibilityLabel={
                  canLog
                    ? "Log Hard Copy POD"
                    : "Log Hard Copy POD locked until trip is completed"
                }
              >
                <Feather
                  name={canLog ? "plus-circle" : "lock"}
                  size={14}
                  color={canLog ? Theme.screenBackground : Theme.textMuted}
                />
                <Text
                  style={[
                    styles.primaryBtnText,
                    !canLog && styles.primaryBtnTextLocked,
                  ]}
                >
                  {canLog ? "Log hard copy POD" : "Available after completion"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
  mono,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <Feather name={icon} size={11} color={Theme.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.tileValue, mono && styles.tileValueMono]}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function TimelineStep({
  label,
  value,
  hint,
  done,
  active,
}: {
  label: string;
  value: string;
  hint?: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <View style={styles.timelineStep}>
      <View
        style={[
          styles.timelineDot,
          done && styles.timelineDotDone,
          active && styles.timelineDotActive,
        ]}
      />
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text
        style={[styles.timelineValue, active && styles.timelineValueActive]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {hint ? (
        <Text style={styles.timelineHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: Theme.tripDetailAssetCardBackgroundColor,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    width: "100%",
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    overflow: "hidden",
    flexDirection: "row",
  },
  cardReceived: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  cardTransit: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.tripDetailSimBtnBorderColor,
  },
  accentRail: {
    width: 4,
    alignSelf: "stretch",
  },
  inner: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  body: {
    width: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  methodChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  methodChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.positive,
  },
  receiverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.analyticsHeroBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.screenBackground,
    letterSpacing: 0.4,
  },
  receiverMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  receiverLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  receiverName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  courierStrip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 2,
  },
  courierText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  awbText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.analyticsHeroBg,
  },
  tileGrid: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 4,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tileValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tileValueMono: {
    letterSpacing: 0.3,
    fontVariant: ["tabular-nums"],
  },
  remarksBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  remarksText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    color: Theme.textSecondary,
  },
  ctaRow: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ctaRowPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },
  timeline: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  timelineStep: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.textMuted,
    marginBottom: 2,
  },
  timelineDotDone: {
    backgroundColor: Theme.positive,
  },
  timelineDotActive: {
    backgroundColor: Theme.warning,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLine: {
    width: 12,
    height: 2,
    backgroundColor: Theme.surfaceBorder,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  timelineValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  timelineValueActive: {
    color: Theme.warning,
  },
  timelineHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 40,
    minWidth: 140,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.analyticsHeroBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnWarning: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.warning,
  },
  primaryBtnLocked: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.screenBackground,
  },
  primaryBtnTextLocked: {
    color: Theme.textMuted,
  },
  primaryBtnWarningText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.warning,
  },
  emptyState: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
    color: Theme.textSecondary,
    textAlign: "center",
  },
});
