import Theme from "@/constants/Theme";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { RECOMMENDED_INDIA_COURIERS } from "@/features/log-pods/utils/indiaCourierPartners";
import {
  canMarkPodInward,
  toggleTripId,
  type PodInwardDraft,
  type PodInwardTripOption,
} from "@/features/debit-control/utils/podInwardForm.util";
import { Check } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const EMPTY: PodInwardDraft = { receivedDate: "", courierName: "", docketNumber: "" };

export function PodInwardForm({
  resetKey,
  tripCount: fixedTripCount = 0,
  tripOptions,
  initialSelectedIds,
  submitting,
  error,
  onCancel,
  onSubmit,
  style,
}: {
  /** Clears the fields and re-seeds the trip selection whenever it changes. */
  resetKey: string | number;
  /** Trips already chosen by the caller. Ignored when `tripOptions` is given. */
  tripCount?: number;
  /** When set, the form shows a checklist and submits the ticked trip IDs. */
  tripOptions?: PodInwardTripOption[];
  initialSelectedIds?: string[];
  submitting: boolean;
  error: string | null;
  onCancel?: () => void;
  onSubmit: (draft: PodInwardDraft, tripIds: string[]) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [draft, setDraft] = useState<PodInwardDraft>(EMPTY);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const liveSelected = useMemo(
    () =>
      tripOptions ? selectedIds.filter((id) => tripOptions.some((option) => option.tripId === id)) : [],
    [selectedIds, tripOptions],
  );
  const tripCount = tripOptions ? liveSelected.length : fixedTripCount;
  const allSelected = Boolean(tripOptions?.length) && liveSelected.length === tripOptions?.length;
  const ready = canMarkPodInward(draft) && tripCount > 0 && !submitting;
  const suggestions = useMemo(() => {
    const q = draft.courierName.trim().toLowerCase();
    if (q.length < 1) return [];
    return RECOMMENDED_INDIA_COURIERS.filter((row) => row.label.toLowerCase().includes(q)).slice(0, 5);
  }, [draft.courierName]);

  const seedSelection = useRef<string[]>([]);
  seedSelection.current = initialSelectedIds ?? [];

  useEffect(() => {
    setDraft(EMPTY);
    setSelectedIds(seedSelection.current);
  }, [resetKey]);

  return (
    <View style={[styles.root, style]}>
      <Text style={styles.title}>Inward Details</Text>
      <Text style={styles.sub}>
        {tripCount === 0
          ? "Select the trips whose hard-copy POD arrived."
          : `These details are saved on ${tripCount === 1 ? "the selected trip" : `all ${tripCount} selected trips`}.`}
      </Text>
      {tripOptions ? (
        <View style={styles.tripList}>
          <Pressable
            style={[styles.tripRow, styles.tripRowHeader]}
            disabled={tripOptions.length === 0}
            onPress={() => setSelectedIds(allSelected ? [] : tripOptions.map((option) => option.tripId))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected, disabled: tripOptions.length === 0 }}
            accessibilityLabel="Select all trips"
          >
            <TickBox checked={allSelected} />
            <Text style={styles.tripHeaderText}>
              {liveSelected.length} of {tripOptions.length} trips selected
            </Text>
          </Pressable>
          <ScrollView style={styles.tripScroll} nestedScrollEnabled>
            {tripOptions.length === 0 ? (
              <Text style={styles.tripEmpty}>No trips are waiting for POD inward.</Text>
            ) : (
              tripOptions.map((option) => {
                const checked = liveSelected.includes(option.tripId);
                return (
                  <Pressable
                    key={option.tripId}
                    style={styles.tripRow}
                    onPress={() => setSelectedIds((current) => toggleTripId(current, option.tripId))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`Select ${option.label}`}
                  >
                    <TickBox checked={checked} />
                    <View style={styles.tripCopy}>
                      <Text style={styles.tripLabel} numberOfLines={1}>
                        {option.label}
                      </Text>
                      {option.detail ? (
                        <Text style={styles.tripDetail} numberOfLines={1}>
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
      <HardCopyPodDateField
        label="POD Received Date"
        required
        value={draft.receivedDate}
        onChange={(receivedDate) => setDraft((current) => ({ ...current, receivedDate }))}
      />
      <Text style={styles.label}>
        Courier Name<Text style={styles.req}> *</Text>
      </Text>
      <TextInput
        value={draft.courierName}
        onChangeText={(courierName) => setDraft((current) => ({ ...current, courierName }))}
        placeholder="Courier name"
        placeholderTextColor={Theme.textMuted}
        style={styles.input}
        accessibilityLabel="Courier Name"
      />
      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((row) => (
            <Pressable
              key={row.value}
              style={styles.suggestion}
              onPress={() => setDraft((current) => ({ ...current, courierName: row.label }))}
            >
              <Text style={styles.suggestionText}>{row.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.label}>
        Docket Number<Text style={styles.req}> *</Text>
      </Text>
      <TextInput
        value={draft.docketNumber}
        onChangeText={(docketNumber) => setDraft((current) => ({ ...current, docketNumber }))}
        placeholder="Docket / AWB number"
        placeholderTextColor={Theme.textMuted}
        style={styles.input}
        accessibilityLabel="Docket Number"
        autoCapitalize="characters"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        {ready ? "Ready to mark inward." : "Enter all three fields to enable Mark Inward."}
      </Text>
      <View style={styles.actions}>
        {onCancel ? (
          <Pressable style={styles.secondary} onPress={onCancel} disabled={submitting} accessibilityRole="button">
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.primary, !ready && styles.primaryDisabled]}
          disabled={!ready}
          onPress={() => onSubmit(draft, liveSelected)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessibilityLabel="Mark Inward"
        >
          <Text style={styles.primaryText}>{submitting ? "Marking…" : "Mark Inward"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TickBox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.tick, checked && styles.tickOn]}>
      {checked ? <Check size={12} color={Theme.buttonDarkText} strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  title: { fontSize: 18, fontWeight: "700", color: Theme.primaryText },
  sub: { fontSize: 13, color: Theme.textSecondary, marginBottom: 4 },
  tripList: { borderWidth: 1, borderColor: Theme.borderMedium, borderRadius: 10, overflow: "hidden" },
  tripScroll: { maxHeight: 220 },
  tripRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  tripRowHeader: { borderBottomWidth: 1, borderBottomColor: Theme.borderMedium },
  tripHeaderText: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  tripEmpty: { padding: 12, fontSize: 13, color: Theme.textSecondary },
  tripCopy: { flex: 1, minWidth: 0, paddingVertical: 6 },
  tripLabel: { fontSize: 14, fontWeight: "600", color: Theme.primaryText },
  tripDetail: { fontSize: 12, color: Theme.textSecondary },
  tick: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  label: { fontSize: 13, fontWeight: "600", color: Theme.primaryText, marginTop: 4 },
  req: { color: Theme.buttonDestructive },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: Theme.primaryText,
    backgroundColor: Theme.cardWhite,
  },
  suggestions: { borderWidth: 1, borderColor: Theme.borderMedium, borderRadius: 10, overflow: "hidden" },
  suggestion: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  suggestionText: { color: Theme.primaryText, fontSize: 14 },
  hint: { fontSize: 12, color: Theme.textSecondary },
  error: { color: Theme.buttonDestructive, fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  secondaryText: { color: Theme.primaryText, fontWeight: "600" },
  primary: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: Theme.buttonDark,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: Theme.buttonDarkText, fontWeight: "700" },
});
