/**
 * Second step after a Network pool rate: how many vehicles stay on the bid,
 * and until when shippers may award it.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import {
  clampPoolVehicleCommit,
  defaultPoolBidValidUntilIso,
  MAX_POOL_VEHICLE_COMMIT,
} from "@/features/network/utils/networkPoolBidCommit.util";
import { Calendar as CalendarIcon, Minus, Plus, Truck, X } from "lucide-react-native";
import { Calendar } from "react-native-calendars";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type PoolBidCommitValue = {
  vehicleLimit: number;
  validUntilDate: string;
};

export function PoolBidCommitSheet({
  visible,
  onClose,
  onSubmit,
  amount,
  poolSize,
  fleetVehicleCount,
  routeLabel,
  submitting = false,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (value: PoolBidCommitValue) => void;
  amount: number;
  poolSize: number;
  fleetVehicleCount?: number | null;
  routeLabel?: string;
  submitting?: boolean;
  error?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= Layout.webDesktopMinWidth;
  const maxCommit = MAX_POOL_VEHICLE_COMMIT;
  const [count, setCount] = useState(1);
  const [countDraft, setCountDraft] = useState("1");
  const [validUntil, setValidUntil] = useState(defaultPoolBidValidUntilIso());
  const [calOpen, setCalOpen] = useState(false);

  const applyCount = (next: number) => {
    const clamped = clampPoolVehicleCommit(next);
    setCount(clamped);
    setCountDraft(String(clamped));
    return clamped;
  };

  useEffect(() => {
    if (!visible) return;
    applyCount(1);
    setValidUntil(defaultPoolBidValidUntilIso());
    setCalOpen(false);
  }, [visible, maxCommit]);

  const commitCount = () => {
    const parsed = Number.parseInt(countDraft.replace(/[^\d]/g, ""), 10);
    return applyCount(Number.isFinite(parsed) ? parsed : count);
  };

  const scrollMax = isDesktop
    ? Math.min(height * 0.7, 560)
    : undefined;

  const sheet = (
    <View
      style={[
        styles.sheet,
        isDesktop
          ? styles.sheetDesktop
          : [
              styles.sheetMobile,
              {
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 12,
              },
            ],
      ]}
    >
      <View style={styles.top}>
        <Pressable
          onPress={onClose}
          disabled={submitting}
          hitSlop={Layout.touchTargetHitSlop}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close vehicle commit"
        >
          <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Keep this bid active
        </Text>
        <View style={styles.close} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={[
          styles.scroll,
          isDesktop ? { maxHeight: scrollMax } : styles.scrollMobile,
        ]}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sub}>
          {routeLabel ? `${routeLabel} · ` : ""}
          {formatINR(amount)} on this pool
        </Text>

        <View style={styles.fleet}>
          <View style={styles.fleetIcon}>
            <Truck size={16} color={Theme.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.fleetCopy}>
            <Text style={styles.fleetLabel}>Vehicles on your roster</Text>
            <Text style={styles.fleetValue}>
              {fleetVehicleCount != null && fleetVehicleCount > 0
                ? `${fleetVehicleCount} owned — use as a guide, not a cap`
                : "No owned vehicles listed — type how many you can cover"}
            </Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>How many stay committed</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => applyCount(count - 1)}
            disabled={count <= 1 || submitting}
            activeOpacity={0.75}
            style={[styles.stepBtn, count <= 1 && styles.stepBtnOff]}
            accessibilityRole="button"
            accessibilityLabel="Fewer vehicles"
          >
            <Minus size={16} color={Theme.primary} strokeWidth={2.4} />
          </TouchableOpacity>
          <TextInput
            value={countDraft}
            onChangeText={(raw) => {
              const digits = raw.replace(/[^\d]/g, "");
              setCountDraft(digits);
              const parsed = Number.parseInt(digits, 10);
              if (Number.isFinite(parsed) && parsed > 0) {
                setCount(clampPoolVehicleCommit(parsed));
              }
            }}
            onBlur={commitCount}
            onSubmitEditing={commitCount}
            editable={!submitting}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            maxLength={3}
            style={styles.countInput}
            accessibilityLabel="Vehicles committed"
          />
          <TouchableOpacity
            onPress={() => applyCount(count + 1)}
            disabled={count >= maxCommit || submitting}
            activeOpacity={0.75}
            style={[styles.stepBtn, count >= maxCommit && styles.stepBtnOff]}
            accessibilityRole="button"
            accessibilityLabel="More vehicles"
          >
            <Plus size={16} color={Theme.primary} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Shippers see this bid until {count} load{count === 1 ? "" : "s"} from
          this pool are awarded to you. Then they will not see it until you bid
          again. You can commit up to {maxCommit}.
        </Text>

        <Text style={styles.fieldLabel}>Accept awards until</Text>
        <Pressable
          onPress={() => setCalOpen((open) => !open)}
          style={styles.dateBtn}
          accessibilityRole="button"
          accessibilityLabel={`Valid until ${validUntil}`}
        >
          <CalendarIcon size={16} color={Theme.primary} strokeWidth={2.2} />
          <Text style={styles.dateValue}>{validUntil}</Text>
        </Pressable>
        {calOpen ? (
          <View style={styles.calendarWrap}>
            <Calendar
              current={validUntil}
              minDate={defaultPoolBidValidUntilIso(new Date(), 0)}
              markedDates={{ [validUntil]: { selected: true } }}
              onDayPress={(day) => {
                if (day.dateString) setValidUntil(day.dateString);
                setCalOpen(false);
              }}
              theme={{
                todayTextColor: Theme.primary,
                selectedDayBackgroundColor: Theme.primary,
                selectedDayTextColor: Theme.textOnPrimary,
                arrowColor: Theme.primary,
              }}
            />
          </View>
        ) : null}
        <Text style={styles.hint}>
          After this date the bid is hidden and a shipper cannot award it.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Pressable
        onPress={() => {
          const limit = commitCount();
          onSubmit({ vehicleLimit: limit, validUntilDate: validUntil });
        }}
        disabled={submitting}
        style={[styles.submit, submitting && styles.submitOff]}
        accessibilityRole="button"
        accessibilityLabel="Commit vehicles and send pool bid"
      >
        <Text style={styles.submitText}>
          {submitting ? "Sending…" : `Commit ${count} and send bid`}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType={isDesktop ? "fade" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          !isDesktop && styles.backdropMobile,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : onClose}
          accessibilityLabel="Dismiss"
        />
        {sheet}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  backdropMobile: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    zIndex: 2,
  },
  sheetDesktop: {
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    ...Platform.select({
      web: { boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 8,
      },
    }),
  },
  sheetMobile: {
    flex: 1,
    maxWidth: "100%",
    paddingHorizontal: 20,
  },
  scroll: {
    width: "100%",
    flexGrow: 0,
  },
  scrollMobile: {
    flex: 1,
    flexGrow: 1,
  },
  scrollInner: {
    paddingTop: 4,
    paddingBottom: 16,
    gap: 14,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  sub: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 18,
    color: Theme.textMuted,
    textAlign: "center",
  },
  fleet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  fleetIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fleetCopy: { flex: 1, minWidth: 0, gap: 2 },
  fleetLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  fleetValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 18,
    color: Theme.textPrimaryDark,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 2,
    ...Platform.select({ web: { cursor: "pointer" } as object, default: {} }),
  },
  stepBtnOff: { opacity: 0.35 },
  countInput: {
    width: 96,
    minWidth: 96,
    minHeight: 52,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  dateBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateValue: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  calendarWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
    color: Theme.textMuted,
  },
  error: { fontSize: 13, fontWeight: "600", color: Theme.destructive },
  submit: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitOff: { opacity: 0.5 },
  submitText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
    color: Theme.textOnPrimary,
  },
});
