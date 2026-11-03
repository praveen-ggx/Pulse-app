/**
 * DateRangePickerModal — compact bottom-sheet style modal for picking a from/to
 * date range. Used by list screens (e.g. Trips) to filter by a custom date range.
 *
 * Uses `@react-native-community/datetimepicker` on native and a plain
 * `<input type="date">` fallback on web. Apply/Clear buttons at the bottom.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface DateRangePickerModalProps {
  visible: boolean;
  initialFrom?: string | null;
  initialTo?: string | null;
  onDismiss: () => void;
  onApply: (from: string, to: string) => void;
  onClear?: () => void;
  /** Override the modal title (default: "DATE RANGE"). */
  title?: string;
  /** Override the subtitle (default: "Pick a custom window"). */
  subtitle?: string;
  /** Override the apply button label (default: "APPLY"). */
  applyLabel?: string;
  /** Maximum span in days; 0 = unlimited. */
  maxSpanDays?: number;
}

function toIsoDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function monthMatrix(year: number, month: number): Array<{
  iso: string;
  day: number;
  inMonth: boolean;
}> {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i,
    );
    return {
      iso: toIsoDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    };
  });
}

function formatDisplay(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB");
}

export function DateRangePickerModal({
  visible,
  initialFrom,
  initialTo,
  onDismiss,
  onApply,
  onClear,
  title: titleProp,
  subtitle: subtitleProp,
  applyLabel: applyLabelProp,
  maxSpanDays = 0,
}: DateRangePickerModalProps) {
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState<string>(initialFrom ?? "");
  const [to, setTo] = useState<string>(initialTo ?? "");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [calendarYear, setCalendarYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [calendarMonth, setCalendarMonth] = useState<number>(
    new Date().getMonth(),
  );

  useEffect(() => {
    if (visible) {
      setFrom(initialFrom ?? "");
      setTo(initialTo ?? "");
      setActiveField(null);
      const pivot = parseIso(initialTo ?? initialFrom ?? null) ?? new Date();
      setCalendarYear(pivot.getFullYear());
      setCalendarMonth(pivot.getMonth());
    }
  }, [visible, initialFrom, initialTo]);

  const spanDays =
    from && to
      ? Math.round(
          (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
        ) + 1
      : 0;
  const spanExceeded = maxSpanDays > 0 && spanDays > maxSpanDays;
  const canApply = Boolean(from && to) && new Date(from) <= new Date(to) && !spanExceeded;
  const days = monthMatrix(calendarYear, calendarMonth);
  const fromIso = from.slice(0, 10);
  const toIso = to.slice(0, 10);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.card,
                {
                  marginTop: Math.max(insets.top + 10, 22),
                  marginBottom: Math.max(insets.bottom + 16, 20),
                },
              ]}
            >
              <View style={styles.header}>
                <View style={styles.headerIconChip}>
                  <FontAwesome
                    name="calendar"
                    size={12}
                    color={Theme.textPrimaryDark}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{titleProp ?? "DATE RANGE"}</Text>
                  <Text style={styles.subtitle}>{subtitleProp ?? "Pick a custom window"}</Text>
                </View>
                <TouchableOpacity
                  onPress={onDismiss}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="times" size={14} color={Theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>FROM</Text>
                  <TouchableOpacity
                    style={[
                      styles.fieldBtn,
                      activeField === "from" && styles.fieldBtnActive,
                    ]}
                    onPress={() =>
                      setActiveField(activeField === "from" ? null : "from")
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.fieldValue,
                        !from && styles.fieldValuePlaceholder,
                      ]}
                    >
                      {from ? formatDisplay(from) : "Select"}
                    </Text>
                    <FontAwesome
                      name="calendar"
                      size={10}
                      color={Theme.textOnDarkMuted}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.fieldDivider}>
                  <FontAwesome
                    name="arrow-right"
                    size={10}
                    color={Theme.textMuted}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>TO</Text>
                  <TouchableOpacity
                    style={[
                      styles.fieldBtn,
                      activeField === "to" && styles.fieldBtnActive,
                    ]}
                    onPress={() =>
                      setActiveField(activeField === "to" ? null : "to")
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.fieldValue,
                        !to && styles.fieldValuePlaceholder,
                      ]}
                    >
                      {to ? formatDisplay(to) : "Select"}
                    </Text>
                    <FontAwesome
                      name="calendar"
                      size={10}
                      color={Theme.textOnDarkMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {activeField ? (
                <View style={styles.calendarWrap}>
                  <View style={styles.calendarHeader}>
                    <TouchableOpacity
                      onPress={() => {
                        const prev = new Date(calendarYear, calendarMonth - 1, 1);
                        setCalendarYear(prev.getFullYear());
                        setCalendarMonth(prev.getMonth());
                      }}
                      style={styles.navBtn}
                      activeOpacity={0.8}
                    >
                      <FontAwesome name="chevron-left" size={11} color={Theme.textSecondary} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthText}>
                      {toMonthLabel(calendarYear, calendarMonth)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const next = new Date(calendarYear, calendarMonth + 1, 1);
                        setCalendarYear(next.getFullYear());
                        setCalendarMonth(next.getMonth());
                      }}
                      style={styles.navBtn}
                      activeOpacity={0.8}
                    >
                      <FontAwesome name="chevron-right" size={11} color={Theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.weekRow}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <Text key={d} style={styles.weekText}>{d}</Text>
                    ))}
                  </View>
                  <View style={styles.daysGrid}>
                    {days.map((d) => {
                      const selected = d.iso === fromIso || d.iso === toIso;
                      const inRange =
                        fromIso &&
                        toIso &&
                        d.iso > fromIso &&
                        d.iso < toIso;
                      return (
                        <TouchableOpacity
                          key={d.iso}
                          style={[
                            styles.dayCell,
                            selected && styles.dayCellSelected,
                            inRange && styles.dayCellRange,
                          ]}
                          onPress={() => {
                            if (activeField === "from") {
                              if (toIso && d.iso > toIso) {
                                setFrom(toIso);
                                setTo(d.iso);
                                setActiveField(null);
                                return;
                              }
                              setFrom(d.iso);
                              // Smart flow: immediately continue with end-date selection.
                              setActiveField("to");
                              return;
                            }

                            const nextTo = d.iso;
                            if (fromIso && nextTo < fromIso) {
                              setTo(fromIso);
                              setFrom(nextTo);
                            } else {
                              setTo(nextTo);
                            }
                            setActiveField(null);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              !d.inMonth && styles.dayTextMuted,
                              selected && styles.dayTextSelected,
                              inRange && styles.dayTextRange,
                            ]}
                          >
                            {d.day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.analysisCard}>
                <View style={styles.analysisGlow} />
                <View style={styles.analysisRow}>
                  <View>
                    <Text style={styles.analysisLabel}>SELECTED RANGE</Text>
                    <Text style={styles.analysisValue}>
                      {from && to ? `${formatDisplay(from)} – ${formatDisplay(to)}` : "Select dates"}
                    </Text>
                  </View>
                  {from && to ? (
                    <View style={styles.analysisRight}>
                      <Text style={styles.analysisPct}>{spanDays}</Text>
                      <Text style={styles.analysisSub}>{spanDays === 1 ? "Day" : "Days"}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {spanExceeded ? (
                <Text style={styles.spanWarning}>
                  Maximum range is {maxSpanDays} days
                </Text>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
                  onPress={() => {
                    if (!canApply) return;
                    onApply(from, to);
                  }}
                  disabled={!canApply}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.applyBtnText,
                      !canApply && styles.applyBtnTextDisabled,
                    ]}
                  >
                    {applyLabelProp ?? "APPLY"}
                  </Text>
                </TouchableOpacity>
                {onClear ? (
                  <TouchableOpacity
                    style={styles.clearBtnLink}
                    onPress={() => {
                      setFrom("");
                      setTo("");
                      onClear();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  headerIconChip: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  fieldBlock: {
    flex: 1,
  },
  fieldDivider: {
    paddingBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  fieldBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
  },
  fieldBtnActive: {
    backgroundColor: Theme.screenBackground,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  fieldValuePlaceholder: {
    color: Theme.textSecondary,
    fontWeight: "700",
  },
  calendarWrap: {
    marginTop: 10,
    backgroundColor: Theme.screenBackground,
    padding: 14,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  navBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  calendarMonthText: {
    color: Theme.textPrimaryDark,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  dayCellSelected: {
    backgroundColor: Theme.textPrimaryDark,
  },
  dayCellRange: {
    backgroundColor: "rgba(99,102,241,0.10)",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  dayTextMuted: {
    color: Theme.textSecondary,
  },
  dayTextSelected: {
    color: Theme.textOnPrimary,
    fontWeight: "900",
  },
  dayTextRange: {
    color: Theme.textPrimaryDark,
  },
  analysisCard: {
    marginTop: 12,
    backgroundColor: Theme.textPrimaryDark,
    padding: 14,
    overflow: "hidden",
  },
  analysisGlow: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 74,
    height: 74,
    backgroundColor: "rgba(79,70,229,0.35)",
  },
  analysisRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  analysisLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  analysisValue: {
    color: Theme.textOnPrimary,
    marginTop: 3,
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
  },
  analysisRight: {
    alignItems: "flex-end",
  },
  analysisPct: {
    color: "#818cf8",
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
  },
  analysisSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  spanWarning: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ef4444",
    textAlign: "center",
    marginTop: 6,
  },
  actions: {
    marginTop: 12,
  },
  applyBtn: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  applyBtnDisabled: {
    backgroundColor: Theme.borderMedium,
  },
  applyBtnText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 3,
  },
  applyBtnTextDisabled: {
    color: Theme.textMuted,
  },
  clearBtnLink: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
