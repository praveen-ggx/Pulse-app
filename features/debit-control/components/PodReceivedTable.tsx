import Theme from "@/constants/Theme";
import type { DebitControlReceivedTrip } from "@/features/debit-control/utils/debitControlPod.model";
import {
  displayedClientValue,
  displayedVendorValue,
  formatInr,
  isTripOpenForValidation,
  selectableReceivedTripIds,
} from "@/features/debit-control/utils/podChargeTotals.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const COL = {
  select: 48,
  tripId: 118,
  date: 108,
  lr: 140,
  from: 150,
  to: 150,
  indent: 96,
  client: 170,
  hub: 150,
  clientValue: 132,
  vendor: 160,
  vehicleType: 120,
  vehicleNo: 132,
  vendorValue: 132,
  invoice: 140,
  remarks: 160,
  validated: 118,
  action: 108,
} as const;

const TRIP_WIDTH = COL.tripId + COL.date + COL.lr + COL.from + COL.to + COL.indent;
const CLIENT_WIDTH = COL.client + COL.hub + COL.clientValue;
const VENDOR_WIDTH = COL.vendor + COL.vehicleType + COL.vehicleNo + COL.vendorValue;
const OTHER_WIDTH = COL.invoice + COL.remarks + COL.validated;

function formatListDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function PodReceivedTable({
  trips,
  selectedIds,
  onToggle,
  onToggleAll,
  onValidateOne,
}: {
  trips: DebitControlReceivedTrip[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onValidateOne: (trip: DebitControlReceivedTrip) => void;
}) {
  const selectable = selectableReceivedTripIds(trips);
  const allSelected = selectable.length > 0 && selectable.every((id) => selectedIds.has(id));
  const someSelected = selectable.some((id) => selectedIds.has(id));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={styles.groupRow}>
          <View style={{ width: COL.select }} />
          <Group label="Trip Details" width={TRIP_WIDTH} />
          <Group label="Client Details" width={CLIENT_WIDTH} />
          <Group label="Vendor Details" width={VENDOR_WIDTH} />
          <Group label="Other Details" width={OTHER_WIDTH} />
          <Group label="Action" width={COL.action} />
        </View>
        <View style={styles.headRow}>
          <View style={[styles.cell, { width: COL.select }]}>
            <CheckBox
              checked={allSelected}
              mixed={!allSelected && someSelected}
              disabled={selectable.length === 0}
              label="Select all trips"
              onPress={onToggleAll}
            />
          </View>
          <Head width={COL.tripId} label="Trip ID" />
          <Head width={COL.date} label="Trip Date" />
          <Head width={COL.lr} label="LR No." />
          <Head width={COL.from} label="From" />
          <Head width={COL.to} label="To" />
          <Head width={COL.indent} label="Indent Type" />
          <Head width={COL.client} label="Client Name" />
          <Head width={COL.hub} label="Client Operations Hub" />
          <Head width={COL.clientValue} label="Total Client Value" align="right" />
          <Head width={COL.vendor} label="Vendor Name" />
          <Head width={COL.vehicleType} label="Vehicle Type" />
          <Head width={COL.vehicleNo} label="Vehicle Number" />
          <Head width={COL.vendorValue} label="Total Vendor Value" align="right" />
          <Head width={COL.invoice} label="Client Invoice Number" />
          <Head width={COL.remarks} label="Remarks" />
          <Head width={COL.validated} label="Validated Date" />
          <Head width={COL.action} label="Validate" />
        </View>
        {trips.map((trip, index) => {
          const open = isTripOpenForValidation(trip);
          return (
            <View
              key={trip.id}
              style={[styles.row, index % 2 === 0 ? styles.rowEven : styles.rowOdd, !open && styles.rowDone]}
            >
              <View style={[styles.cell, { width: COL.select }]}>
                <CheckBox
                  checked={selectedIds.has(trip.id)}
                  disabled={!open}
                  label={`Select ${trip.displayId}`}
                  onPress={() => onToggle(trip.id)}
                />
              </View>
              <Cell width={COL.tripId} text={trip.displayId} strong />
              <Cell width={COL.date} text={formatListDate(trip.tripDate)} />
              <Cell width={COL.lr} text={trip.lrNumbers.join(", ") || "—"} />
              <Cell width={COL.from} text={trip.from} />
              <Cell width={COL.to} text={trip.to} />
              <Cell width={COL.indent} text={trip.indentType} />
              <Cell width={COL.client} text={trip.clientName} />
              <Cell width={COL.hub} text={trip.clientHub} />
              <Cell width={COL.clientValue} text={formatInr(displayedClientValue(trip))} align="right" strong />
              <Cell width={COL.vendor} text={trip.vendorName} />
              <Cell width={COL.vehicleType} text={trip.vehicleType} />
              <Cell width={COL.vehicleNo} text={trip.vehicleNumber} />
              <Cell width={COL.vendorValue} text={formatInr(displayedVendorValue(trip))} align="right" strong />
              <Cell width={COL.invoice} text={trip.clientInvoiceNumber || "—"} />
              <Cell width={COL.remarks} text={trip.remarks || "—"} />
              <Cell width={COL.validated} text={formatListDate(trip.validatedAt)} />
              <View style={[styles.cell, { width: COL.action }]}>
                {open ? (
                  <Pressable
                    style={styles.validateBtn}
                    onPress={() => onValidateOne(trip)}
                    accessibilityRole="button"
                    accessibilityLabel={`Validate ${trip.displayId}`}
                  >
                    <Text style={styles.validateText}>Validate</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.validatedText}>Validated</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Group({ label, width }: { label: string; width: number }) {
  return (
    <View style={[styles.group, { width }]}>
      <Text style={styles.groupText}>{label}</Text>
    </View>
  );
}

function Head({
  width,
  label,
  align = "left",
}: {
  width: number;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text style={[styles.headText, align === "right" && styles.alignRight]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function Cell({
  width,
  text,
  align = "left",
  strong = false,
}: {
  width: number;
  text: string;
  align?: "left" | "right";
  strong?: boolean;
}) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text
        style={[styles.cellText, strong && styles.cellStrong, align === "right" && styles.alignRight]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
}

function CheckBox({
  checked,
  mixed = false,
  disabled,
  label,
  onPress,
}: {
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.checkHit, disabled && styles.checkDisabled]}
    >
      <View style={[styles.box, (checked || mixed) && styles.boxOn]}>
        {checked ? <FontAwesome name="check" size={10} color={Theme.buttonDarkText} /> : null}
        {mixed ? <FontAwesome name="minus" size={10} color={Theme.buttonDarkText} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupRow: { flexDirection: "row", backgroundColor: Theme.brandBlueSoft },
  group: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: Theme.borderMedium,
  },
  groupText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: Theme.primaryText },
  headRow: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
  },
  headText: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    minHeight: 48,
  },
  rowEven: { backgroundColor: Theme.cardWhite },
  rowOdd: { backgroundColor: Theme.surface },
  rowDone: { opacity: 0.72 },
  cell: { paddingHorizontal: 8, paddingVertical: 8, justifyContent: "center", minWidth: 0 },
  cellText: { fontSize: 12, color: Theme.primaryText },
  cellStrong: { fontWeight: "700" },
  alignRight: { textAlign: "right" },
  checkHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  checkDisabled: { opacity: 0.35 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  boxOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  validateBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  validateText: { color: Theme.buttonDarkText, fontSize: 12, fontWeight: "700" },
  validatedText: { color: Theme.success, fontSize: 12, fontWeight: "700" },
});
