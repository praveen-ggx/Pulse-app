/**
 * Hard-copy POD date field — same picker as profile / vault:
 * Pressable + calendar icon, in-app calendar overlay on web,
 * DateTimePicker on iOS/Android. Stores ISO YYYY-MM-DD.
 */
import Theme from "@/constants/Theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { useId, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  return new Date();
}

function formatDisplay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return parseISO(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function HardCopyPodDateField({
  label,
  value,
  onChange,
  required,
  error,
  disabled = false,
  compact = false,
  quiet = false,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Shorter shell for dense forms. Behavior is unchanged. */
  compact?: boolean;
  /** Notification-scale type: sentence-case 12px label, 13px value. */
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const hasError = Boolean(error?.trim());
  const dense = compact || quiet;

  const close = () => setOpen(false);

  return (
    <View style={[styles.field, dense && styles.fieldCompact]}>
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
          isoValue ? styles.shellFilled : null,
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
            !isoValue && styles.placeholder,
          ]}
        >
          {isoValue ? formatDisplay(isoValue) : "dd/mm/yyyy"}
        </Text>
        <CalendarIcon size={dense ? 14 : 16} color={Theme.textMuted} strokeWidth={2} />
      </Pressable>
      {hasError ? (
        <Text style={styles.errorText} nativeID={`${fieldId}-error`}>
          {error}
        </Text>
      ) : null}

      {Platform.OS === "web" ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
          <View style={styles.overlay}>
            <Pressable style={styles.dismiss} onPress={close} accessibilityLabel="Close date picker" />
            <View style={styles.popover} accessibilityRole="none">
              <View style={styles.popoverHead}>
                <Text style={styles.popoverKicker}>Date</Text>
                <Text style={styles.popoverTitle}>{label}</Text>
              </View>
              <Calendar
                current={isoValue || undefined}
                onDayPress={(day: { dateString: string }) => {
                  onChange(day.dateString);
                  close();
                }}
                markedDates={
                  isoValue
                    ? {
                        [isoValue]: {
                          selected: true,
                          selectedColor: Theme.primary,
                          selectedTextColor: Theme.textOnPrimary,
                        },
                      }
                    : undefined
                }
                theme={{
                  backgroundColor: Theme.cardWhite,
                  calendarBackground: Theme.cardWhite,
                  textSectionTitleColor: Theme.textMuted,
                  monthTextColor: Theme.textPrimaryDark,
                  dayTextColor: Theme.textPrimaryDark,
                  todayTextColor: Theme.primary,
                  arrowColor: Theme.primary,
                  selectedDayBackgroundColor: Theme.primary,
                  selectedDayTextColor: Theme.textOnPrimary,
                  textDayFontWeight: "500",
                  textMonthFontWeight: "600",
                  textDayHeaderFontWeight: "500",
                  textDayFontSize: 13,
                  textMonthFontSize: 13,
                  textDayHeaderFontSize: 11,
                }}
              />
              <Pressable
                onPress={() => {
                  onChange("");
                  close();
                }}
                hitSlop={8}
                style={styles.clearRow}
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={parseISO(isoValue)}
          mode="date"
          display="default"
          onChange={(e, date) => {
            setOpen(false);
            if (e.type === "set" && date) onChange(toISODate(date));
          }}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
          <Pressable style={styles.sheetBackdrop} onPress={close}>
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHeader}>
                <Pressable
                  onPress={() => {
                    onChange("");
                    close();
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable onPress={close} hitSlop={10}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={parseISO(isoValue)}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && onChange(toISODate(date))}
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
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  popover: {
    width: "100%",
    maxWidth: 360,
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
  clearRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
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
