/**
 * Hard-copy POD time field — same shell as the date field.
 * Web uses an in-app hour/minute overlay; native uses DateTimePicker.
 * Stores 24-hour HH:MM.
 */
import Theme from "@/constants/Theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Clock } from "lucide-react-native";
import { useId, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

function pad(value: number): string {
  return String(value).padStart(2, "0");
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

function formatDisplay(value: string): string {
  const parsed = parseHm(value);
  if (!parsed) return "";
  const date = new Date();
  date.setHours(parsed.hour, parsed.minute, 0, 0);
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  placeholder = "HH:MM",
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
}) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const parsed = parseHm(value);
  const hasError = Boolean(error?.trim());
  const dense = compact || quiet;
  const hour = parsed?.hour ?? new Date().getHours();
  const minute = parsed?.minute ?? 0;
  const minuteChoices = useMemo(() => {
    if (MINUTES.includes(minute)) return MINUTES;
    return [...MINUTES, minute].sort((a, b) => a - b);
  }, [minute]);

  const close = () => setOpen(false);
  const pick = (nextHour: number, nextMinute: number) => onChange(formatHm(nextHour, nextMinute));

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
          {parsed ? formatDisplay(value) : placeholder}
        </Text>
        <Clock size={dense ? 14 : 16} color={Theme.textMuted} strokeWidth={2} />
      </Pressable>
      {hasError ? (
        <Text style={styles.errorText} nativeID={`${fieldId}-error`}>
          {error}
        </Text>
      ) : null}

      {Platform.OS === "web" ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
          <View style={styles.overlay}>
            <Pressable style={styles.dismiss} onPress={close} accessibilityLabel="Close time picker" />
            <View style={styles.popover} accessibilityRole="none">
              <View style={styles.popoverHead}>
                <Text style={styles.popoverKicker}>Time</Text>
                <Text style={styles.popoverTitle}>{label}</Text>
              </View>
              <View style={styles.columns}>
                <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                  {HOURS.map((item) => {
                    const selected = item === hour;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => pick(item, minute)}
                        style={[styles.slot, selected && styles.slotSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{pad(item)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
                  {minuteChoices.map((item) => {
                    const selected = item === minute;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => pick(hour, item)}
                        style={[styles.slot, selected && styles.slotSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{pad(item)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.footer}>
                <Pressable
                  onPress={() => {
                    onChange("");
                    close();
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
                <Pressable onPress={close} hitSlop={8}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={toPickerDate(value)}
          mode="time"
          display="default"
          is24Hour
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
                value={toPickerDate(value)}
                mode="time"
                display="spinner"
                is24Hour
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
