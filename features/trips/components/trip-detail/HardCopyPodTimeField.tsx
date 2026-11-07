/**
 * Hard-copy POD time field — same shell as the date field.
 * Web uses an in-app hour/minute overlay; native uses DateTimePicker.
 * Stores 24-hour HH:MM.
 */
import Theme from "@/constants/Theme";
import {
  WebOverlayPortal,
  resolveWebOverlayHost,
  webFixedFill,
} from "@/lib/webOverlayPortal";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Clock } from "lucide-react-native";
import { useId, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const HOURS_24 = Array.from({ length: 24 }, (_, hour) => hour);
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const PERIODS = ["AM", "PM"] as const;
const MINUTES_5 = Array.from({ length: 12 }, (_, index) => index * 5);
const MINUTES_1 = Array.from({ length: 60 }, (_, index) => index);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function to12Hour(hour24: number): { hour: number; period: "AM" | "PM" } {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return { hour, period };
}

function to24Hour(hour12: number, period: "AM" | "PM"): number {
  const base = hour12 === 12 ? 0 : hour12;
  return period === "PM" ? base + 12 : base;
}

export function parseHm(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function formatHm(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

function formatDisplay(value: string, hour12: boolean): string {
  const parsed = parseHm(value);
  if (!parsed) return "";
  if (!hour12) {
    return formatHm(parsed.hour, parsed.minute);
  }
  const { hour, period } = to12Hour(parsed.hour);
  return `${pad(hour)}:${pad(parsed.minute)} ${period}`;
}

function toPickerDate(value: string): Date {
  const parsed = parseHm(value);
  const date = new Date();
  if (parsed) date.setHours(parsed.hour, parsed.minute, 0, 0);
  return date;
}

export function HardCopyPodTimeField({
  label,
  value,
  onChange,
  required,
  error,
  disabled = false,
  compact = false,
  quiet = false,
  placeholder,
  minTime,
  allowClear = true,
  /** When true, shell + picker use 12-hour AM/PM (still stores HH:MM 24h). */
  hour12 = false,
  /** Minute column step. Journey Log uses 1 (00–59); hard-copy POD stays on 5. */
  minuteStep = 5,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  compact?: boolean;
  quiet?: boolean;
  placeholder?: string;
  /** HH:MM — earlier slots are disabled (same-day floor). */
  minTime?: string;
  allowClear?: boolean;
  hour12?: boolean;
  minuteStep?: 1 | 5;
}) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const fieldAnchorRef = useRef<View>(null);
  const parsed = parseHm(value);
  const hasError = Boolean(error?.trim());
  const dense = compact || quiet;
  const webOverlayHost =
    Platform.OS === "web"
      ? resolveWebOverlayHost(
          fieldAnchorRef.current as unknown as HTMLElement | null,
        )
      : null;
  const hour = parsed?.hour ?? new Date().getHours();
  const minute = parsed?.minute ?? 0;
  const clock12 = to12Hour(hour);
  const displayPlaceholder = placeholder ?? (hour12 ? "hh:mm AM/PM" : "HH:MM");
  const baseMinutes = minuteStep === 1 ? MINUTES_1 : MINUTES_5;
  const minuteChoices = useMemo(() => {
    if (baseMinutes.includes(minute)) return baseMinutes;
    return [...baseMinutes, minute].sort((a, b) => a - b);
  }, [baseMinutes, minute]);

  const close = () => setOpen(false);
  const minParsed = parseHm(minTime ?? "");
  const isBeforeMin = (nextHour: number, nextMinute: number) => {
    if (!minParsed) return false;
    return (
      nextHour < minParsed.hour ||
      (nextHour === minParsed.hour && nextMinute < minParsed.minute)
    );
  };
  const pick = (nextHour: number, nextMinute: number) => {
    if (isBeforeMin(nextHour, nextMinute)) return;
    onChange(formatHm(nextHour, nextMinute));
  };
  const pick12 = (hour12Value: number, nextMinute: number, period: "AM" | "PM") => {
    pick(to24Hour(hour12Value, period), nextMinute);
  };

  return (
    <View ref={fieldAnchorRef} style={[styles.field, dense && styles.fieldCompact]}>
      <Text
        style={[styles.label, compact && styles.labelCompact, quiet && styles.labelQuiet]}
        nativeID={`${fieldId}-label`}
      >
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.shell,
          dense && styles.shellCompact,
          hasError ? styles.shellError : null,
          parsed ? styles.shellFilled : null,
          open && styles.shellOpen,
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={required ? "Required" : undefined}
        accessibilityState={{ expanded: open, disabled }}
      >
        <Text
          style={[
            styles.valueText,
            dense && styles.valueTextCompact,
            quiet && styles.valueTextQuiet,
            !parsed && styles.placeholder,
          ]}
        >
          {parsed ? formatDisplay(value, hour12) : displayPlaceholder}
        </Text>
        <Clock size={dense ? 14 : 16} color={Theme.textMuted} strokeWidth={2} />
      </Pressable>
      {hasError ? (
        <Text style={styles.errorText} nativeID={`${fieldId}-error`}>
          {error}
        </Text>
      ) : null}

      {open && Platform.OS === "web" ? (
        <WebOverlayPortal host={webOverlayHost}>
          <View style={[styles.overlay, webFixedFill]}>
            <Pressable style={styles.dismiss} onPress={close} accessibilityLabel="Close time picker" />
            <View
              style={[styles.popover, hour12 && styles.popoverWide]}
              accessibilityRole="none"
            >
              <View style={styles.popoverHead}>
                <Text style={styles.popoverKicker}>Time</Text>
                <Text style={styles.popoverTitle}>{label}</Text>
              </View>
              <View style={styles.columns}>
                {hour12 ? (
                  <>
                    <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                      {HOURS_12.map((item) => {
                        const selected = item === clock12.hour;
                        const candidate24 = to24Hour(item, clock12.period);
                        const hourDisabled =
                          !!minParsed &&
                          minuteChoices.every((m) => isBeforeMin(candidate24, m));
                        return (
                          <Pressable
                            key={`h12-${item}`}
                            onPress={() => {
                              if (hourDisabled) return;
                              const nextMinute = isBeforeMin(candidate24, minute)
                                ? minParsed!.minute
                                : minute;
                              pick12(item, nextMinute, clock12.period);
                            }}
                            disabled={hourDisabled}
                            style={[
                              styles.slot,
                              selected && styles.slotSelected,
                              hourDisabled && { opacity: 0.35 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: hourDisabled }}
                          >
                            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                              {pad(item)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                      {minuteChoices.map((item) => {
                        const selected = item === minute;
                        const minuteDisabled = isBeforeMin(hour, item);
                        return (
                          <Pressable
                            key={`m-${item}`}
                            onPress={() => pick(hour, item)}
                            disabled={minuteDisabled}
                            style={[
                              styles.slot,
                              selected && styles.slotSelected,
                              minuteDisabled && { opacity: 0.35 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: minuteDisabled }}
                          >
                            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                              {pad(item)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                      {PERIODS.map((period) => {
                        const selected = period === clock12.period;
                        const candidate24 = to24Hour(clock12.hour, period);
                        const periodDisabled =
                          !!minParsed &&
                          minuteChoices.every((m) => isBeforeMin(candidate24, m));
                        return (
                          <Pressable
                            key={period}
                            onPress={() => {
                              if (periodDisabled) return;
                              const nextMinute = isBeforeMin(candidate24, minute)
                                ? minParsed!.minute
                                : minute;
                              pick12(clock12.hour, nextMinute, period);
                            }}
                            disabled={periodDisabled}
                            style={[
                              styles.slot,
                              selected && styles.slotSelected,
                              periodDisabled && { opacity: 0.35 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: periodDisabled }}
                          >
                            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                              {period}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : (
                  <>
                    <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                      {HOURS_24.map((item) => {
                        const selected = item === hour;
                        const hourDisabled =
                          !!minParsed &&
                          (item < minParsed.hour ||
                            (item === minParsed.hour &&
                              minuteChoices.every((m) => isBeforeMin(item, m))));
                        return (
                          <Pressable
                            key={item}
                            onPress={() => {
                              if (hourDisabled) return;
                              const nextMinute = isBeforeMin(item, minute)
                                ? minParsed!.minute
                                : minute;
                              pick(item, nextMinute);
                            }}
                            disabled={hourDisabled}
                            style={[
                              styles.slot,
                              selected && styles.slotSelected,
                              hourDisabled && { opacity: 0.35 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: hourDisabled }}
                          >
                            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                              {pad(item)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                      {minuteChoices.map((item) => {
                        const selected = item === minute;
                        const minuteDisabled = isBeforeMin(hour, item);
                        return (
                          <Pressable
                            key={item}
                            onPress={() => pick(hour, item)}
                            disabled={minuteDisabled}
                            style={[
                              styles.slot,
                              selected && styles.slotSelected,
                              minuteDisabled && { opacity: 0.35 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: minuteDisabled }}
                          >
                            <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                              {pad(item)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
              </View>
              <View style={styles.footer}>
                {allowClear ? (
                  <Pressable
                    onPress={() => {
                      onChange("");
                      close();
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable onPress={close} hitSlop={8}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </WebOverlayPortal>
      ) : null}

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={toPickerDate(value)}
          mode="time"
          display="default"
          is24Hour={!hour12}
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === "set" && date) pick(date.getHours(), date.getMinutes());
          }}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
          <Pressable style={styles.sheetBackdrop} onPress={close}>
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHeader}>
                {allowClear ? (
                  <Pressable
                    onPress={() => {
                      onChange("");
                      close();
                    }}
                    hitSlop={10}
                  >
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 48 }} />
                )}
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable onPress={close} hitSlop={10}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={toPickerDate(value)}
                mode="time"
                display="spinner"
                is24Hour={!hour12}
                onChange={(_, date) => date && pick(date.getHours(), date.getMinutes())}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, width: "100%", alignSelf: "stretch" },
  fieldCompact: { gap: 4 },
  labelCompact: { fontSize: 10, letterSpacing: 0.4 },
  labelQuiet: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    letterSpacing: 0,
    textTransform: "none",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  req: { color: Theme.destructive, fontWeight: "800" },
  shell: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shellCompact: {
    minHeight: 36,
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  shellFilled: {
    borderColor: Theme.borderLight,
  },
  shellOpen: {
    borderColor: Theme.analyticsHeroBg,
  },
  shellError: {
    borderColor: Theme.destructive,
    backgroundColor: "rgba(232, 33, 39, 0.04)",
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  valueTextCompact: { fontSize: 13 },
  valueTextQuiet: { fontWeight: "400" },
  placeholder: {
    color: Theme.textMuted,
    fontWeight: "400",
  },
  errorText: {
    fontSize: 11,
    color: Theme.destructive,
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    ...Platform.select({
      web: { zIndex: 10050 } as object,
      default: {},
    }),
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  popover: {
    width: "100%",
    maxWidth: 280,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 32px rgba(15,23,42,0.16)" } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  popoverWide: {
    maxWidth: 320,
  },
  popoverHead: {
    gap: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  popoverKicker: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  popoverTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  columns: {
    flexDirection: "row",
    height: 220,
  },
  column: { flex: 1 },
  columnContent: { paddingVertical: 6 },
  slot: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  slotSelected: {
    backgroundColor: Theme.compliancePageBg,
  },
  slotText: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  slotTextSelected: { fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  clearText: { fontSize: 12, color: Theme.textMuted, fontWeight: "500" },
  doneText: { fontSize: 13, color: Theme.analyticsHeroBg, fontWeight: "600" },
});
