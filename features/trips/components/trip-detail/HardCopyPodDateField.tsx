/**
 * Compact date field for hard-copy POD forms — native calendar on web,
 * DateTimePicker on iOS/Android. Stores ISO YYYY-MM-DD.
 */
import Theme from "@/constants/Theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { createElement, useId, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Shorter shell for dense forms. Behavior is unchanged. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const hasError = Boolean(error?.trim());

  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]} nativeID={`${fieldId}-label`}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      {Platform.OS === "web" ? (
        <View
          style={[
            styles.shell,
            compact && styles.shellCompact,
            hasError ? styles.shellError : null,
            isoValue ? styles.shellFilled : null,
          ]}
        >
          {createElement("input", {
            id: fieldId,
            type: "date",
            value: isoValue,
            disabled,
            required: Boolean(required),
            "aria-label": label,
            "aria-required": required ? true : undefined,
            "aria-invalid": hasError ? true : undefined,
            "aria-describedby": hasError ? `${fieldId}-error` : undefined,
            onChange: (e: { target?: { value?: string } }) => {
              onChange(String(e?.target?.value ?? ""));
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: compact ? 13 : 14,
              fontWeight: 600,
              lineHeight: compact ? "18px" : "20px",
              color: Theme.textPrimaryDark,
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              padding: 0,
              margin: 0,
              minHeight: 22,
              cursor: "pointer",
            },
          })}
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => {
              if (!disabled) setOpen(true);
            }}
            disabled={disabled}
            style={({ pressed }) => [
              styles.shell,
              compact && styles.shellCompact,
              hasError ? styles.shellError : null,
              isoValue ? styles.shellFilled : null,
              pressed && { opacity: 0.9 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={required ? "Required" : undefined}
          >
            <Text style={[styles.valueText, compact && styles.valueTextCompact, !isoValue && styles.placeholder]}>
              {isoValue ? formatDisplay(isoValue) : "dd/mm/yyyy"}
            </Text>
            <Calendar size={compact ? 14 : 16} color={Theme.textMuted} strokeWidth={2} />
          </Pressable>
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
            <Modal visible={open} transparent animationType="slide">
              <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.sheetHeader}>
                    <Pressable
                      onPress={() => {
                        onChange("");
                        setOpen(false);
                      }}
                      hitSlop={10}
                    >
                      <Text style={styles.clearText}>Clear</Text>
                    </Pressable>
                    <Text style={styles.sheetTitle}>{label}</Text>
                    <Pressable onPress={() => setOpen(false)} hitSlop={10}>
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
        </>
      )}
      {hasError ? (
        <Text style={styles.errorText} nativeID={`${fieldId}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, width: "100%", alignSelf: "stretch" },
  fieldCompact: { gap: 4 },
  labelCompact: { fontSize: 10, letterSpacing: 0.4 },
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
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  shellFilled: {
    borderColor: Theme.borderInput,
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
  placeholder: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 11,
    color: Theme.destructive,
    fontWeight: "600",
  },
  backdrop: {
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
  clearText: { fontSize: 14, color: Theme.textMuted, fontWeight: "600" },
  doneText: { fontSize: 14, color: Theme.analyticsHeroBg, fontWeight: "700" },
});
