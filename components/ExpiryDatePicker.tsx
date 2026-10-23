/**
 * Expiry date picker for documents (Insurance, Fitness, Driving licence, …).
 * Expiry dates sit months or years ahead, so it leads with one-tap presets
 * (+6 months … +5 years), jumps a whole year with « », and keeps a large day
 * grid (44pt targets) for an exact date. Value is ISO `YYYY-MM-DD`.
 *
 * `ExpiryDatePicker` renders inline; `ExpiryDatePickerModal` wraps it in a
 * bottom sheet on phones and a centred card on wider screens.
 */
import Feather from "@expo/vector-icons/Feather";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PRESETS: { label: string; months: number }[] = [
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
  { label: "5 years", months: 60 },
];
const HIT = {
  top: Layout.touchTargetHitSlop,
  bottom: Layout.touchTargetHitSlop,
  left: Layout.touchTargetHitSlop,
  right: Layout.touchTargetHitSlop,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "15 Mar 2027" */
export function formatExpiryLabel(iso: string): string {
  const date = dateFromIso(iso);
  if (!date) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Same day `months` from `from`, clamped to the month's last day (31 Jan + 1m → 28/29 Feb). */
export function addMonthsIso(from: Date, months: number): string {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(from.getDate(), lastDay));
  return isoFromDate(target);
}

function monthCells(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: ({ iso: string; day: number } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: isoFromDate(new Date(year, month, day)), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function ExpiryDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const todayIso = isoFromDate(today);
  // Open on the chosen date, else one year out (the usual policy length).
  const initial = dateFromIso(value) ?? dateFromIso(addMonthsIso(today, 12)) ?? today;
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const isPast = !!value && value < todayIso;

  const show = (iso: string) => {
    const date = dateFromIso(iso);
    if (!date) return;
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  };
  const pick = (iso: string) => {
    onChange(iso);
    show(iso);
  };
  const shift = (months: number) => {
    const next = new Date(year, month + months, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <View style={styles.root}>
      <View style={styles.selectedRow}>
        <Feather name="calendar" size={18} color={value ? Theme.primary : Theme.textMuted} />
        <Text style={[styles.selectedText, !value && styles.selectedPlaceholder]}>
          {value ? formatExpiryLabel(value) : "Pick the expiry date"}
        </Text>
      </View>
      {isPast ? (
        <Text style={styles.pastWarning}>
          This date has passed — the document will show as expired.
        </Text>
      ) : null}

      <Text style={styles.presetsLabel}>Valid for</Text>
      <View style={styles.presets}>
        {PRESETS.map((preset) => {
          const iso = addMonthsIso(today, preset.months);
          const active = iso === value;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.preset, active && styles.presetActive]}
              onPress={() => pick(iso)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Valid for ${preset.label}, until ${formatExpiryLabel(iso)}`}
            >
              <Text style={[styles.presetText, active && styles.presetTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => shift(-12)}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Previous year"
        >
          <Feather name="chevrons-left" size={18} color={Theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => shift(-1)}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Feather name="chevron-left" size={18} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle} accessibilityRole="header">
          {MONTHS[month]} {year}
        </Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => shift(1)}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Feather name="chevron-right" size={18} color={Theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => shift(12)}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Next year"
        >
          <Feather name="chevrons-right" size={18} color={Theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekText}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (!cell) return <View key={`blank-${index}`} style={styles.cell} />;
          const selected = cell.iso === value;
          const isToday = cell.iso === todayIso;
          const past = cell.iso < todayIso;
          return (
            <TouchableOpacity
              key={cell.iso}
              style={styles.cell}
              onPress={() => pick(cell.iso)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={formatExpiryLabel(cell.iso)}
            >
              <View
                style={[
                  styles.day,
                  isToday && !selected && styles.dayToday,
                  selected && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    past && !selected && styles.dayTextPast,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function ExpiryDatePickerModal({
  visible,
  title,
  initialValue = "",
  confirmLabel = "Save",
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sheet = width < 600;
  const [value, setValue] = useState(initialValue);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // Reset the draft each time the modal opens for a new prompt.
  const key = visible ? `${title}|${initialValue}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    setValue(initialValue);
  }

  return (
    <Modal visible={visible} transparent animationType={sheet ? "slide" : "fade"} onRequestClose={onCancel}>
      <Pressable
        style={[styles.backdrop, sheet ? styles.backdropSheet : styles.backdropCentered]}
        onPress={onCancel}
        accessibilityLabel="Close"
      >
        <Pressable
          style={[
            styles.card,
            sheet ? [styles.cardSheet, { paddingBottom: 16 + insets.bottom }] : styles.cardCentered,
          ]}
          onPress={() => undefined}
        >
          {sheet ? <View style={styles.grabber} /> : null}
          <Text style={styles.title}>{title}</Text>
          <ExpiryDatePicker value={value} onChange={setValue} />
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.confirmBtn, !value && styles.confirmDisabled]}
              onPress={() => value && onConfirm(value)}
              disabled={!value}
              accessibilityRole="button"
              accessibilityState={{ disabled: !value }}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = Layout.minTouchTargetSize;

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: CELL,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  selectedText: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  selectedPlaceholder: {
    fontWeight: "500",
    color: Theme.textMuted,
  },
  pastWarning: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.warning,
  },
  presetsLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  preset: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  presetActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  presetTextActive: {
    color: Theme.textOnPrimary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: 2,
  },
  monthTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  week: {
    flexDirection: "row",
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL,
    alignItems: "center",
    justifyContent: "center",
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: {
    borderWidth: 1,
    borderColor: Theme.primary,
  },
  daySelected: {
    backgroundColor: Theme.primary,
  },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  dayTextPast: {
    color: Theme.textMuted,
  },
  dayTextSelected: {
    color: Theme.textOnPrimary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  backdropSheet: {
    justifyContent: "flex-end",
  },
  backdropCentered: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    padding: 20,
    gap: 14,
  },
  cardSheet: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardCentered: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: CELL + 4,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: Theme.surfaceGray,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  confirmBtn: {
    backgroundColor: Theme.buttonDark,
  },
  confirmDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
