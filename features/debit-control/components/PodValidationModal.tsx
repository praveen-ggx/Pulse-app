import Theme from "@/constants/Theme";
import {
  CHARGE_FIELDS,
  type ChargeDraft,
  type ChargeField,
  type ChargeFieldKey,
  type DebitControlReceivedTrip,
} from "@/features/debit-control/utils/debitControlPod.model";
import {
  chargeDraftFromLines,
  chargeLinesFromBase,
  chargeLinesFromDraft,
  formatInr,
  netChargeTotal,
} from "@/features/debit-control/utils/podChargeTotals.util";
import type { ValidatePodTripInput } from "@/features/debit-control/services/debitControlPod.service";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TripDraft = {
  client: ChargeDraft;
  vendor: ChargeDraft;
  remarks: string;
};

function draftFor(trip: DebitControlReceivedTrip): TripDraft {
  return {
    client: chargeDraftFromLines(trip.clientCharges ?? chargeLinesFromBase(trip.clientPrice)),
    vendor: chargeDraftFromLines(trip.vendorCharges ?? chargeLinesFromBase(trip.supplierRate)),
    remarks: "",
  };
}

export function PodValidationModal({
  visible,
  trips,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  trips: DebitControlReceivedTrip[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (rows: ValidatePodTripInput[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideBySide = width >= 860;
  const tripKey = trips.map((trip) => trip.id).join("|");
  const [drafts, setDrafts] = useState<Record<string, TripDraft>>({});

  useEffect(() => {
    if (!visible) return;
    const next: Record<string, TripDraft> = {};
    for (const trip of trips) next[trip.id] = draftFor(trip);
    setDrafts(next);
  }, [visible, tripKey, trips]);

  const parsed = useMemo(() => {
    return trips.map((trip) => {
      const draft = drafts[trip.id] ?? draftFor(trip);
      const client = chargeLinesFromDraft(draft.client);
      const vendor = chargeLinesFromDraft(draft.vendor);
      return { trip, draft, client, vendor };
    });
  }, [drafts, trips]);

  const ready =
    !submitting &&
    parsed.length > 0 &&
    parsed.every((row) => row.client.lines && row.vendor.lines);

  const updateLine = (
    tripId: string,
    side: "client" | "vendor",
    key: ChargeFieldKey,
    value: string,
  ) => {
    setDrafts((current) => {
      const trip = trips.find((row) => row.id === tripId);
      const base = current[tripId] ?? (trip ? draftFor(trip) : null);
      if (!base) return current;
      return {
        ...current,
        [tripId]: {
          ...base,
          [side]: { ...base[side], [key]: value },
        },
      };
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}>
          <Text style={styles.title}>POD Validation</Text>
          <Text style={styles.sub}>
            Review client and vendor charges for {trips.length === 1 ? "this trip" : `${trips.length} trips`}.
            Delay, damage, and product missing stay out of the totals.
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {parsed.map(({ trip, draft, client, vendor }) => {
              const clientTotal = client.lines ? netChargeTotal(client.lines) : null;
              const vendorTotal = vendor.lines ? netChargeTotal(vendor.lines) : null;
              const clientInvalid = new Set(client.lines ? [] : client.invalidKeys);
              const vendorInvalid = new Set(vendor.lines ? [] : vendor.invalidKeys);
              return (
                <View key={trip.id} style={styles.tripCard}>
                  <Text style={styles.tripTitle}>{trip.displayId}</Text>
                  <Text style={styles.tripMeta}>
                    {trip.clientName} · {trip.vendorName}
                    {trip.clientInvoiceNumber ? ` · Invoice ${trip.clientInvoiceNumber}` : ""}
                  </Text>
                  <View style={[styles.columns, sideBySide && styles.columnsRow]}>
                    <ChargeColumn
                      title="Client Charges"
                      fields={CHARGE_FIELDS.filter((field) => !field.vendorOnly)}
                      labelOf={(field) => field.clientLabel}
                      draft={draft.client}
                      invalid={clientInvalid}
                      totalLabel="Total Client Value"
                      total={clientTotal}
                      onChange={(key, value) => updateLine(trip.id, "client", key, value)}
                    />
                    <ChargeColumn
                      title="Vendor Charges"
                      fields={CHARGE_FIELDS.filter((field) => !field.fixed)}
                      labelOf={(field) => field.vendorLabel}
                      draft={draft.vendor}
                      invalid={vendorInvalid}
                      totalLabel="Total Vendor Value"
                      total={vendorTotal}
                      onChange={(key, value) => updateLine(trip.id, "vendor", key, value)}
                    />
                  </View>
                  <Text style={styles.remarksLabel}>Remarks</Text>
                  <TextInput
                    value={draft.remarks}
                    onChangeText={(remarks) =>
                      setDrafts((current) => ({
                        ...current,
                        [trip.id]: { ...(current[trip.id] ?? draft), remarks },
                      }))
                    }
                    placeholder="Optional note for this trip"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.remarks}
                    accessibilityLabel={`Remarks for ${trip.displayId}`}
                  />
                </View>
              );
            })}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onClose} disabled={submitting} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, !ready && styles.primaryDisabled]}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
              accessibilityLabel="Confirm validation"
              onPress={() => {
                const rows: ValidatePodTripInput[] = [];
                for (const row of parsed) {
                  if (!row.client.lines || !row.vendor.lines) return;
                  rows.push({
                    tripId: row.trip.id,
                    remarks: row.draft.remarks,
                    clientInvoiceNumber: row.trip.clientInvoiceNumber,
                    client: row.client.lines,
                    vendor: row.vendor.lines,
                  });
                }
                onConfirm(rows);
              }}
            >
              <Text style={styles.primaryText}>{submitting ? "Saving…" : "Confirm Validation"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChargeColumn({
  title,
  fields,
  labelOf,
  draft,
  invalid,
  totalLabel,
  total,
  onChange,
}: {
  title: string;
  fields: readonly ChargeField[];
  labelOf: (field: ChargeField) => string;
  draft: ChargeDraft;
  invalid: Set<ChargeFieldKey>;
  totalLabel: string;
  total: number | null;
  onChange: (key: ChargeFieldKey, value: string) => void;
}) {
  const included = fields.filter((field) => field.included);
  const excluded = fields.filter((field) => !field.included);
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      {included.map((field) => (
        <AmountField
          key={field.key}
          label={labelOf(field)}
          value={draft[field.key]}
          invalid={invalid.has(field.key)}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
      <Text style={styles.excludedTitle}>Not included in the total</Text>
      {excluded.map((field) => (
        <AmountField
          key={field.key}
          label={labelOf(field)}
          value={draft[field.key]}
          invalid={invalid.has(field.key)}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue}>{total == null ? "—" : formatInr(total)}</Text>
      </View>
    </View>
  );
}

function AmountField({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={Theme.textMuted}
        style={[styles.fieldInput, invalid && styles.fieldInputInvalid]}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  card: {
    flex: 1,
    maxWidth: 980,
    width: "100%",
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: "700", color: Theme.primaryText },
  sub: { fontSize: 13, color: Theme.textSecondary, marginTop: 4, marginBottom: 8 },
  scroll: { flex: 1 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  tripCard: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: Theme.surface,
  },
  tripTitle: { fontSize: 15, fontWeight: "700", color: Theme.primaryText },
  tripMeta: { fontSize: 12, color: Theme.textSecondary },
  columns: { gap: 12 },
  columnsRow: { flexDirection: "row" },
  column: { flex: 1, minWidth: 0, gap: 6 },
  columnTitle: { fontSize: 14, fontWeight: "700", color: Theme.primaryText },
  excludedTitle: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary, marginTop: 4 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, color: Theme.primaryText },
  fieldInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.cardWhite,
    color: Theme.primaryText,
  },
  fieldInputInvalid: { borderColor: Theme.buttonDestructive },
  totalBox: {
    marginTop: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    gap: 2,
  },
  totalLabel: { fontSize: 12, fontWeight: "600", color: Theme.primaryText },
  totalValue: { fontSize: 18, fontWeight: "800", color: Theme.primaryText },
  remarksLabel: { fontSize: 12, fontWeight: "600", color: Theme.primaryText },
  remarks: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.cardWhite,
    color: Theme.primaryText,
  },
  error: { color: Theme.buttonDestructive, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
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
