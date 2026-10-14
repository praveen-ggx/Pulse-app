import { type ReactNode, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { CompactValidTillCalendar } from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { VehicleTypeCatalogField } from "@/features/vehicles/components/VehicleTypeCatalogField";
import {
  ELR_QUANTITY_UNITS,
  ELR_SOURCE_DOCUMENT_TYPES,
  splitElrRoutePlace,
  validateElrCompletion,
  type ElrCompletionDraft,
  type ElrGstChoice,
  type ElrSourceDocumentType,
  type ElrWeightUnit,
} from "@/features/trips/services/elrCompletion.util";

type FieldKey = keyof ElrCompletionDraft;

type Props = {
  visible: boolean;
  tripNumber: string;
  vehicleNumber: string;
  draft: ElrCompletionDraft;
  prefilled: FieldKey[];
  lockedFields: FieldKey[];
  busy: boolean;
  onChange: (draft: ElrCompletionDraft) => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  onDiscardDraft?: () => void;
  draftSaved: boolean;
  editingExisting?: boolean;
  onPreview: () => void;
};

export function ElrCompletionForm({
  visible,
  tripNumber,
  vehicleNumber,
  draft,
  prefilled,
  lockedFields,
  busy,
  onChange,
  onCancel,
  onSaveDraft,
  onDiscardDraft,
  draftSaved,
  editingExisting,
  onPreview,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidePad = width >= 1100 ? 32 : width >= 760 ? 24 : Layout.screenPaddingHorizontal;
  const cols = width >= 900 ? 3 : width >= 640 ? 2 : 1;
  const wide = cols >= 2;
  const paired = width >= 520;
  const partyWide = cols >= 2;
  const issues = validateElrCompletion(draft);
  const locked = new Set(lockedFields);
  const set = (patch: Partial<ElrCompletionDraft>) => {
    const next = { ...draft, ...patch };
    for (const key of locked) next[key] = draft[key];
    onChange(next);
  };
  const issueFor = (field: FieldKey) => issues.find((issue) => issue.field === field);
  const problem = (field: FieldKey) => {
    const issue = issueFor(field);
    if (!issue) return undefined;
    if (showErrors || String(draft[field] ?? "").trim()) return issue.message;
    return undefined;
  };
  const [showErrors, setShowErrors] = useState(false);
  const ready = issues.length === 0;

  if (!visible) return null;

  const noteFor = (field: FieldKey, sourceLabel: string, required = true) => {
    const value = String(draft[field] ?? "").trim();
    const originPlace = splitElrRoutePlace(draft.origin);
    const destinationPlace = splitElrRoutePlace(draft.destination);
    const fromRoute =
      (field === "consignorCity" && originPlace.city && value === originPlace.city) ||
      (field === "consignorState" && originPlace.state && value === originPlace.state) ||
      (field === "consigneeCity" && destinationPlace.city && value === destinationPlace.city) ||
      (field === "consigneeState" && destinationPlace.state && value === destinationPlace.state) ||
      ((field === "origin" || field === "destination") && value.length > 0);
    if (fromRoute) return field === "origin" || field === "destination" ? "From trip" : "From trip route";
    if (prefilled.includes(field) && value) return `Prefilled from ${sourceLabel}`;
    if (required && !value) return "Required — enter manually";
    return undefined;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.top, { paddingHorizontal: sidePad }]}>
        <View style={styles.topRow}>
          <Text style={styles.kicker}>ELECTRONIC LORRY RECEIPT</Text>
          <TouchableOpacity onPress={onCancel} style={styles.cancelHit} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>
          {editingExisting ? "Edit E-LR details" : "Complete E-LR details"}
        </Text>
        <Text style={styles.subtitle}>
          {editingExisting
            ? "Update the information on this LR, then preview and save to replace the current document."
            : "Complete the information required for this LR. Existing information has been prefilled where available."}
        </Text>
        <Text style={styles.meta}>
          Trip: {tripNumber || "—"}
          {vehicleNumber ? `   ·   Vehicle: ${vehicleNumber}` : ""}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePad }]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.grid,
            cols === 3 ? styles.grid3 : cols === 2 ? styles.grid2 : null,
          ]}
        >
          <PartySection
            fill={wide}
            wide={partyWide}
            title="Consignor"
            sourceLabel="client"
            name={draft.consignorName}
            nameLocked={locked.has("consignorName")}
            address={draft.consignorAddress}
            city={draft.consignorCity}
            state={draft.consignorState}
            pin={draft.consignorPin}
            gst={draft.consignorGst}
            gstin={draft.consignorGstin}
            noteFor={(field) => noteFor(field, "client")}
            errorFor={problem}
            onName={(consignorName) => set({ consignorName })}
            onAddress={(consignorAddress) => set({ consignorAddress })}
            onCity={(consignorCity) => set({ consignorCity })}
            onState={(consignorState) => set({ consignorState })}
            onPin={(consignorPin) => set({ consignorPin })}
            onGst={(consignorGst) => set({ consignorGst })}
            onGstin={(consignorGstin) => set({ consignorGstin })}
            nameKey="consignorName"
            addressKey="consignorAddress"
            cityKey="consignorCity"
            stateKey="consignorState"
            pinKey="consignorPin"
            gstKey="consignorGst"
            gstinKey="consignorGstin"
          />
          <PartySection
            fill={wide}
            wide={partyWide}
            title="Consignee"
            sourceLabel="customer"
            hint="Destination is not the consignee"
            name={draft.consigneeName}
            address={draft.consigneeAddress}
            city={draft.consigneeCity}
            state={draft.consigneeState}
            pin={draft.consigneePin}
            gst={draft.consigneeGst}
            gstin={draft.consigneeGstin}
            noteFor={(field) => noteFor(field, "customer")}
            errorFor={problem}
            onName={(consigneeName) => set({ consigneeName })}
            onAddress={(consigneeAddress) => set({ consigneeAddress })}
            onCity={(consigneeCity) => set({ consigneeCity })}
            onState={(consigneeState) => set({ consigneeState })}
            onPin={(consigneePin) => set({ consigneePin })}
            onGst={(consigneeGst) => set({ consigneeGst })}
            onGstin={(consigneeGstin) => set({ consigneeGstin })}
            nameKey="consigneeName"
            addressKey="consigneeAddress"
            cityKey="consigneeCity"
            stateKey="consigneeState"
            pinKey="consigneePin"
            gstKey="consigneeGst"
            gstinKey="consigneeGstin"
          />
        <PartySection
          fill={wide}
          wide={partyWide}
          title="Transporter"
          sourceLabel="organization"
            name={draft.transporterName}
            nameLocked={locked.has("transporterName")}
          address={draft.transporterAddress}
          city={draft.transporterCity}
          state={draft.transporterState}
          pin={draft.transporterPin}
          gst={draft.transporterGst}
          gstin={draft.transporterGstin}
          noteFor={(field) => noteFor(field, "organization")}
          errorFor={problem}
          onName={(transporterName) => set({ transporterName })}
          onAddress={(transporterAddress) => set({ transporterAddress })}
          onCity={(transporterCity) => set({ transporterCity })}
          onState={(transporterState) => set({ transporterState })}
          onPin={(transporterPin) => set({ transporterPin })}
          onGst={(transporterGst) => set({ transporterGst })}
          onGstin={(transporterGstin) => set({ transporterGstin })}
          nameKey="transporterName"
          addressKey="transporterAddress"
          cityKey="transporterCity"
          stateKey="transporterState"
          pinKey="transporterPin"
          gstKey="transporterGst"
          gstinKey="transporterGstin"
        />
        <Section title="Transport" fill={wide}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Vehicle number</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedValue} numberOfLines={1}>
                {vehicleNumber || "—"}
              </Text>
            </View>
            <Text style={styles.note}>From trip</Text>
          </View>
          <View style={styles.field as ViewStyle}>
            <Text style={styles.fieldLabel as TextStyle} numberOfLines={1}>
              Vehicle type *
            </Text>
            <VehicleTypeCatalogField
              value={draft.vehicleType}
              onChange={(vehicleType) => set({ vehicleType })}
              hasError={Boolean(problem("vehicleType"))}
              style={styles.input as ViewStyle}
              textStyle={{ fontSize: 12 }}
            />
            <Text
              style={(problem("vehicleType") ? styles.error : styles.note) as TextStyle}
              numberOfLines={1}
            >
              {problem("vehicleType") || noteFor("vehicleType", "vehicle") || " "}
            </Text>
          </View>
        </Section>
        <Section title="Movement" fill={wide}>
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Origin"
              share={paired}
              value={draft.origin}
              onChangeText={(origin) => set({ origin })}
              note={noteFor("origin", "trip")}
              error={problem("origin")}
              locked={locked.has("origin")}
            />
            <Field
              label="Destination"
              share={paired}
              value={draft.destination}
              onChangeText={(destination) => set({ destination })}
              note={noteFor("destination", "trip")}
              error={problem("destination")}
              locked={locked.has("destination")}
            />
          </View>
        </Section>
        <Section title="Cargo" fill={wide}>
          <Field
            label="Goods description"
            value={draft.cargoDescription}
            onChangeText={(cargoDescription) => set({ cargoDescription })}
            note={noteFor("cargoDescription", "trip")}
            error={problem("cargoDescription")}
            locked={locked.has("cargoDescription")}
          />
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Quantity"
              share={paired}
              value={draft.quantity}
              onChangeText={(quantity) => set({ quantity })}
              keyboardType="decimal-pad"
              note={noteFor("quantity", "trip")}
              error={problem("quantity")}
            />
            <View style={[styles.field, paired ? styles.fieldShare : null]}>
              <Text style={styles.fieldLabel}>Unit *</Text>
              <Choices
                options={[...ELR_QUANTITY_UNITS]}
                value={draft.quantityUnit}
                onChange={(quantityUnit) => set({ quantityUnit })}
              />
              {showErrors && issueFor("quantityUnit") ? (
                <Text style={styles.error}>{issueFor("quantityUnit")?.message}</Text>
              ) : (
                <Text style={styles.note}> </Text>
              )}
            </View>
          </View>
          {locked.has("weight") ? (
            <Field
              label="Weight"
              value={`${draft.weight} ${draft.weightUnit === "kg" ? "kg" : "Tonnes"}`}
              onChangeText={() => undefined}
              locked
            />
          ) : (
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Weight"
              share={paired}
              value={draft.weight}
              onChangeText={(weight) => set({ weight })}
              keyboardType="decimal-pad"
              note={noteFor("weight", "trip")}
              error={problem("weight")}
            />
            <View style={[styles.field, paired ? styles.fieldShare : null]}>
              <Text style={styles.fieldLabel}>Weight unit *</Text>
              <Choices
                options={["kg", "Tonnes"]}
                value={draft.weightUnit === "tons" ? "Tonnes" : draft.weightUnit === "kg" ? "kg" : ""}
                onChange={(label) =>
                  set({ weightUnit: (label === "Tonnes" ? "tons" : "kg") as ElrWeightUnit })
                }
              />
              {showErrors && issueFor("weightUnit") ? (
                <Text style={styles.error}>{issueFor("weightUnit")?.message}</Text>
              ) : (
                <Text style={styles.note}> </Text>
              )}
            </View>
          </View>
          )}
          <Field
            label="Goods value"
            value={draft.goodsValue}
            onChangeText={(goodsValue) => set({ goodsValue })}
            keyboardType="decimal-pad"
            placeholder="Amount"
            note={noteFor("goodsValue", "order")}
            error={problem("goodsValue")}
          />
        </Section>
        <Section title="Source document" fill={wide}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Source document type *</Text>
            <Choices
              options={ELR_SOURCE_DOCUMENT_TYPES.map((item) => item.label)}
              value={
                ELR_SOURCE_DOCUMENT_TYPES.find((item) => item.id === draft.sourceDocumentType)?.label ??
                ""
              }
              onChange={(label) => {
                const match = ELR_SOURCE_DOCUMENT_TYPES.find((item) => item.label === label);
                set({ sourceDocumentType: (match?.id ?? "") as ElrSourceDocumentType });
              }}
            />
            <Text
              style={showErrors && issueFor("sourceDocumentType") ? styles.error : styles.note}
              numberOfLines={1}
            >
              {showErrors && issueFor("sourceDocumentType")
                ? issueFor("sourceDocumentType")?.message
                : " "}
            </Text>
          </View>
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Source document number"
              share={paired}
              value={draft.sourceDocumentNumber}
              onChangeText={(sourceDocumentNumber) => set({ sourceDocumentNumber })}
              error={problem("sourceDocumentNumber")}
            />
            <DateField
              label="Source document date"
              share={paired}
              value={draft.sourceDocumentDate}
              onChange={(sourceDocumentDate) => set({ sourceDocumentDate })}
              error={problem("sourceDocumentDate")}
            />
          </View>
        </Section>
        <Section title="Additional details" fill={wide}>
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Driver name"
              share={paired}
              optional
              value={draft.driverName}
              onChangeText={(driverName) => set({ driverName })}
              note={noteFor("driverName", "trip", false)}
              locked={locked.has("driverName")}
            />
            <Field
              label="Driver licence number"
              share={paired}
              optional
              value={draft.driverLicense}
              onChangeText={(driverLicense) => set({ driverLicense })}
            />
          </View>
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="Order reference"
              share={paired}
              optional
              value={draft.orderReference}
              onChangeText={(orderReference) => set({ orderReference })}
              note={noteFor("orderReference", "order", false)}
            />
            <Field
              label="Freight"
              share={paired}
              optional
              value={draft.freight}
              onChangeText={(freight) => set({ freight })}
              keyboardType="decimal-pad"
              note={noteFor("freight", "trip", false)}
              error={draft.freight.trim() ? issueFor("freight")?.message : undefined}
              locked={locked.has("freight")}
            />
          </View>
          <View style={paired ? styles.columns : undefined}>
            <Field
              label="HSN"
              share={paired}
              optional
              value={draft.hsn}
              onChangeText={(hsn) => set({ hsn: hsn.replace(/\D/g, "").slice(0, 8) })}
              keyboardType="number-pad"
              error={draft.hsn.trim() ? issueFor("hsn")?.message : undefined}
            />
            <Field
              label="E-way bill number"
              share={paired}
              optional
              value={draft.ewayBillNumber}
              onChangeText={(ewayBillNumber) =>
                set({ ewayBillNumber: ewayBillNumber.replace(/\D/g, "").slice(0, 12) })
              }
              keyboardType="number-pad"
              error={draft.ewayBillNumber.trim() ? issueFor("ewayBillNumber")?.message : undefined}
            />
          </View>
        </Section>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: sidePad }]}>
        <View style={styles.footerInner}>
        <TouchableOpacity
          style={styles.draftBtn}
          disabled={busy}
          onPress={onSaveDraft}
          accessibilityRole="button"
        >
          <Text style={styles.draftBtnText}>{draftSaved ? "Draft saved" : "Save Draft"}</Text>
        </TouchableOpacity>
        {onDiscardDraft ? (
          <TouchableOpacity
            style={styles.draftBtn}
            disabled={busy}
            onPress={onDiscardDraft}
            accessibilityRole="button"
          >
            <Text style={styles.draftBtnText}>Discard</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.remaining}>
          {ready ? "Ready to preview" : `${issues.length} required fields remaining`}
        </Text>
        <TouchableOpacity
          style={[styles.previewBtn, (!ready || busy) && styles.previewOff]}
          disabled={!ready || busy}
          onPress={() => {
            if (!ready) {
              setShowErrors(true);
              return;
            }
            onPreview();
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
        >
          <Text style={styles.previewText}>Preview E-LR</Text>
        </TouchableOpacity>
        </View>
      </View>
    </View>
    </Modal>
  );
}

function Section({
  title,
  children,
  fill,
}: {
  title: string;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <View style={[styles.section, fill ? styles.sectionFill : null]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PartySection(props: {
  wide: boolean;
  fill?: boolean;
  title: string;
  sourceLabel: string;
  hint?: string;
  nameLocked?: boolean;
  name: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  gst: ElrGstChoice;
  gstin: string;
  noteFor: (field: FieldKey) => string | undefined;
  errorFor: (field: FieldKey) => string | undefined;
  onName: (value: string) => void;
  onAddress: (value: string) => void;
  onCity: (value: string) => void;
  onState: (value: string) => void;
  onPin: (value: string) => void;
  onGst: (value: ElrGstChoice) => void;
  onGstin: (value: string) => void;
  nameKey: FieldKey;
  addressKey: FieldKey;
  cityKey: FieldKey;
  stateKey: FieldKey;
  pinKey: FieldKey;
  gstKey: FieldKey;
  gstinKey: FieldKey;
}) {
  return (
    <Section title={props.title} fill={props.fill}>
      <Text style={styles.hint} numberOfLines={1}>
        {props.hint ?? " "}
      </Text>
      <Field
        label="Name"
        value={props.name}
        onChangeText={props.onName}
        note={props.noteFor(props.nameKey)}
        error={props.errorFor(props.nameKey)}
        locked={props.nameLocked}
      />
      <Field
        label="Address"
        value={props.address}
        onChangeText={props.onAddress}
        note={props.noteFor(props.addressKey)}
        error={props.errorFor(props.addressKey)}
      />
      <View style={props.wide ? styles.cityRow : styles.columns}>
        <Field
          label="City"
          share
          value={props.city}
          onChangeText={props.onCity}
          note={props.noteFor(props.cityKey)}
          error={props.errorFor(props.cityKey)}
        />
        <Field
          label="State"
          share
          value={props.state}
          onChangeText={props.onState}
          note={props.noteFor(props.stateKey)}
          error={props.errorFor(props.stateKey)}
        />
        {props.wide ? (
          <Field
            label="PIN code"
            share
            compact
            value={props.pin}
            onChangeText={props.onPin}
            keyboardType="number-pad"
            note={props.noteFor(props.pinKey)}
            error={props.errorFor(props.pinKey)}
          />
        ) : null}
      </View>
      {props.wide ? null : (
        <Field
          label="PIN code"
          value={props.pin}
          onChangeText={props.onPin}
          keyboardType="number-pad"
          note={props.noteFor(props.pinKey)}
          error={props.errorFor(props.pinKey)}
        />
      )}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>GST status *</Text>
        <Choices
          options={["Registered", "Unregistered"]}
          value={
            props.gst === "registered" ? "Registered" : props.gst === "unregistered" ? "Unregistered" : ""
          }
          onChange={(label) => props.onGst(label === "Registered" ? "registered" : "unregistered")}
        />
        <Text style={props.errorFor(props.gstKey) ? styles.error : styles.note} numberOfLines={1}>
          {props.errorFor(props.gstKey) || " "}
        </Text>
      </View>
      {props.gst === "registered" ? (
        <Field
          label="GSTIN"
          value={props.gstin}
          onChangeText={(value) => props.onGstin(value.toUpperCase())}
          autoCapitalize="characters"
          note={
            props.gst === "registered" && !props.gstin.trim()
              ? "Required because GST is Registered"
              : props.noteFor(props.gstinKey)
          }
          error={props.errorFor(props.gstinKey)}
        />
      ) : null}
    </Section>
  );
}

function draftDateToIso(value: string): string {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!dmy) return "";
  return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
}

function isoToDmy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function DateField({
  label,
  value,
  onChange,
  error,
  share,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  share?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedIso = draftDateToIso(value);
  const display = selectedIso ? isoToDmy(selectedIso) : "";

  return (
    <View style={[styles.field, share ? styles.fieldShare : null]}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label} *
      </Text>
      <Pressable
        style={[styles.dateField, error ? styles.inputError : null]}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={[styles.dateFieldText, !display && styles.dateFieldPlaceholder]}
          numberOfLines={1}
        >
          {display || "Pick date"}
        </Text>
        <FontAwesome name="calendar" size={13} color={Theme.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.datePickerWrap}>
          <CompactValidTillCalendar
            selectedIso={selectedIso}
            onSelect={(iso) => {
              onChange(isoToDmy(iso));
              setOpen(false);
            }}
          />
        </View>
      ) : null}
      <Text style={error ? styles.error : styles.note} numberOfLines={1}>
        {error || " "}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  optional,
  placeholder,
  keyboardType,
  autoCapitalize,
  note,
  error,
  locked,
  share,
  compact,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  autoCapitalize?: "none" | "characters";
  note?: string;
  error?: string;
  locked?: boolean;
  share?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, share ? styles.fieldShare : null, compact ? styles.fieldCompact : null]}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
        {locked ? "" : optional ? " (optional)" : " *"}
      </Text>
      {locked ? (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedValue} numberOfLines={1}>
            {value || "—"}
          </Text>
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? ""}
          placeholderTextColor={Theme.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete="off"
          importantForAutofill="no"
          style={[styles.input, error ? styles.inputError : null]}
        />
      )}
      <Text style={error && !locked ? styles.error : styles.note} numberOfLines={1}>
        {locked ? "From trip" : error || note || " "}
      </Text>
    </View>
  );
}

function Choices({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.choice, selected && styles.choiceOn]}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  top: { paddingBottom: 8 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: Theme.textMuted,
  },
  title: { marginTop: 2, fontSize: 15, fontWeight: "600", color: Theme.textPrimaryDark },
  subtitle: { marginTop: 2, fontSize: 11, lineHeight: 15, color: Theme.textSecondary },
  meta: { marginTop: 4, fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  cancelHit: { minHeight: 32, justifyContent: "center", paddingHorizontal: 2 },
  cancelText: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
  scroll: { paddingBottom: 16 },
  grid: {
    width: "100%",
    minWidth: 0,
  },
  grid2:
    Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        } as unknown as ViewStyle)
      : {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "stretch",
          gap: 12,
        },
  grid3:
    Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        } as unknown as ViewStyle)
      : {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "stretch",
          gap: 12,
        },
  columns: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  cityRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  section: {
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  sectionFill: {
    minWidth: 0,
    ...(Platform.OS === "web"
      ? { width: "100%" }
      : { flexGrow: 1, flexShrink: 1, flexBasis: 0 }),
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  hint: { marginTop: 2, minHeight: 14, fontSize: 10, lineHeight: 14, color: Theme.textSecondary },
  lockedBox: {
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  lockedValue: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  field: { marginTop: 10, width: "100%", minWidth: 0 },
  fieldShare: { flexGrow: 1, flexShrink: 1, flexBasis: 0, width: undefined },
  fieldCompact: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 128,
    width: 128,
    maxWidth: 140,
  },
  fieldLabel: { fontSize: 10, lineHeight: 13, color: Theme.textSecondary, marginBottom: 4 },
  input: {
    height: 34,
    width: "100%",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 0,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    fontSize: 12,
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none", boxSizing: "border-box" } as const)
      : null),
  },
  inputError: { borderColor: Theme.negative },
  dateField: {
    minHeight: 44,
    width: "100%",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.screenBackground,
  },
  dateFieldText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dateFieldPlaceholder: {
    fontWeight: "500",
    color: Theme.textMuted,
  },
  datePickerWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  note: { marginTop: 3, minHeight: 13, fontSize: 10, lineHeight: 13, color: Theme.textMuted },
  error: { marginTop: 3, minHeight: 13, fontSize: 10, lineHeight: 13, color: Theme.negative },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  choice: {
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  choiceOn: { borderColor: Theme.primary, backgroundColor: Theme.screenBackground },
  choiceText: { fontSize: 11, color: Theme.textSecondary, fontWeight: "500" },
  choiceTextOn: { color: Theme.primary, fontWeight: "600" },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingTop: 8,
  },
  footerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  remaining: { flexGrow: 1, flexShrink: 1, minWidth: 120, fontSize: 11, color: Theme.textSecondary, textAlign: "right" },
  draftBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  draftBtnText: { color: Theme.textPrimaryDark, fontSize: 12, fontWeight: "600" },
  previewBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  previewOff: { opacity: 0.4 },
  previewText: { color: Theme.textOnPrimary, fontSize: 12, fontWeight: "600" },
});
