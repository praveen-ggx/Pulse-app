/**
 * Calendar expiry picker for vault docs (DL, insurance, FC).
 * Writes ISO YYYY-MM-DD. Quick spans jump the month view.
 */
import { DocumentDateCalendar } from "@/components/DocumentDateCalendar";
import Theme from "@/constants/Theme";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  docLabel: string;
  /** Prefill when replacing a file that already has an expiry. */
  initialValue?: string | null;
  onCancel: () => void;
  onSubmit: (isoDate: string) => void;
};

export function formatExpiryLabel(iso: string): string {
  return formatPretty(iso);
}

type SpanId = "6m" | "1y" | "2y" | "5y";

const SPANS: { id: SpanId; label: string; months: number }[] = [
  { id: "6m", label: "6 months", months: 6 },
  { id: "1y", label: "1 year", months: 12 },
  { id: "2y", label: "2 years", months: 24 },
  { id: "5y", label: "5 years", months: 60 },
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  return next;
}

function formatPretty(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export function ComplianceExpiryDateModal({
  visible,
  docLabel,
  initialValue,
  onCancel,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const todayIso = useMemo(() => toISODate(new Date()), [visible]);
  const [selected, setSelected] = useState(toISODate(addMonths(new Date(), 12)));
  const [span, setSpan] = useState<SpanId | null>("1y");

  useEffect(() => {
    if (!visible) return;
    const seed = initialValue?.trim() ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(seed)) {
      setSelected(seed);
      setSpan(null);
      return;
    }
    setSelected(toISODate(addMonths(new Date(), 12)));
    setSpan("1y");
  }, [initialValue, visible]);

  const applySpan = (id: SpanId, months: number) => {
    setSpan(id);
    setSelected(toISODate(addMonths(new Date(), months)));
  };

  const remaining = daysUntil(selected);
  const remainingLabel =
    remaining < 0
      ? "Already expired"
      : remaining === 0
        ? "Expires today"
        : remaining < 60
          ? `Valid for ${remaining} days`
          : remaining < 365
            ? `Valid for ${Math.round(remaining / 30)} months`
            : `Valid for ${Math.round((remaining / 365) * 10) / 10} years`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      {...(Platform.OS === "web" ? { style: { zIndex: 40000 } } : {})}
    >
      <View style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityLabel="Dismiss expiry date picker"
        />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <CalendarIcon size={18} color={Theme.brandBlueInk} strokeWidth={2} />
            </View>
            <View style={styles.headCopy}>
              <Text style={styles.kicker}>Expiry date</Text>
              <Text style={styles.title} numberOfLines={1}>
                {docLabel}
              </Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroDate}>{formatPretty(selected)}</Text>
            <Text style={styles.heroMeta}>{remainingLabel}</Text>
          </View>

          <View style={styles.spanRow}>
            {SPANS.map((item) => {
              const active = span === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => applySpan(item.id, item.months)}
                  style={[styles.spanChip, active && styles.spanChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Set expiry in ${item.label}`}
                >
                  <Text style={[styles.spanText, active && styles.spanTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <DocumentDateCalendar
            selectedIso={selected}
            minDate={todayIso}
            onSelect={(iso) => {
              setSelected(iso);
              setSpan(null);
            }}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(selected)}
              style={styles.confirmBtn}
              accessibilityRole="button"
              accessibilityLabel="Continue with expiry date"
            >
              <Text style={styles.confirmText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    zIndex: 40000,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: "0 18px 40px rgba(15,23,42,0.18)" } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  headCopy: { flex: 1, minWidth: 0, gap: 1 },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  hero: {
    backgroundColor: Theme.brandBlueSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    gap: 2,
  },
  heroDate: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.brandBlueInk,
    letterSpacing: -0.3,
  },
  heroMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  spanRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  spanChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  spanChipActive: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGold,
  },
  spanText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  spanTextActive: {
    color: Theme.brandBlueInk,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  cancelBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  confirmBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueInk,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.cardWhite,
  },
});
