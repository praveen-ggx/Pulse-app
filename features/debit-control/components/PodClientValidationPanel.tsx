import Theme from "@/constants/Theme";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import {
  usePodClientValidationQuery,
  useValidatePodsMutation,
} from "@/features/debit-control/hooks/useDebitControlPod";
import {
  CHARGE_FIELDS,
  IBOND_DEDUCTIBLE_COST,
  type ChargeDraft,
  type ChargeFieldKey,
} from "@/features/debit-control/utils/debitControlPod.model";
import {
  formatPodReceivingAging,
  podAgingEndDate,
  podDelaySubmissionAmount,
  podReceivingAging,
  todayIsoDate,
} from "@/features/debit-control/utils/podAging.util";
import {
  chargeDraftFromLines,
  chargeLinesFromBase,
  chargeLinesFromDraft,
  formatInr,
  netChargeTotal,
} from "@/features/debit-control/utils/podChargeTotals.util";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const GROUP_KEYS: {
  title: string;
  keys: readonly ChargeFieldKey[];
  tone: "charges" | "additional" | "exceptions";
  included: boolean;
}[] = [
  { title: "Charges", keys: ["cost", "loading", "halting", "unloading"], tone: "charges", included: true },
  { title: "Additional", keys: ["extraPoint", "other", "specialApproval"], tone: "additional", included: true },
  {
    title: "Exceptions",
    keys: ["delay", "damage", "productMissing", "documentCost", "podDelaySubmission"],
    tone: "exceptions",
    included: false,
  },
];

const CLIENT_LABEL = new Map(CHARGE_FIELDS.map((field) => [field.key, field.clientLabel]));
const VENDOR_LABEL = new Map(CHARGE_FIELDS.map((field) => [field.key, field.vendorLabel]));

export function PodClientValidationPanel({
  organizationId,
  actorId,
  tripId,
  displayId,
  startDate,
  deliveryDate,
  clientName,
  routeLabel,
  clientPrice,
  supplierRate,
  supplierRateBasis = null,
  loadTons = null,
  tripOrganizationId = null,
  ibond = false,
  reviewMode = false,
  onSaved,
}: {
  organizationId: string;
  actorId: string | null;
  tripId: string;
  displayId: string;
  startDate: string | null;
  deliveryDate: string | null;
  clientName: string;
  routeLabel: string;
  clientPrice: number;
  supplierRate: number;
  /** Same basis Advance Payment uses when the vendor rate is per metric ton. */
  supplierRateBasis?: string | null;
  loadTons?: number | null;
  /** Trip org that owns the document-charge slabs. */
  tripOrganizationId?: string | null;
  /** Kept so existing callers can still pass the saved IBond flag. */
  ibond?: boolean;
  /** Charges stay as text until Edit. Save on POD Received moves the trip on. */
  reviewMode?: boolean;
  /** Called after charges are stored. */
  onSaved?: () => void;
}) {
  const loaded = usePodClientValidationQuery(organizationId || null, tripId, {
    organizationId: tripOrganizationId || organizationId,
    supplierRate,
    supplierRateBasis,
    loadTons,
  });
  const validate = useValidatePodsMutation(organizationId || null, actorId);
  const [draft, setDraft] = useState<ChargeDraft>(() => chargeDraftFromLines(chargeLinesFromBase(clientPrice)));
  const [vendorDraft, setVendorDraft] = useState<ChargeDraft>(() =>
    chargeDraftFromLines(chargeLinesFromBase(supplierRate)),
  );
  const [seededFor, setSeededFor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [delivery, setDelivery] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [clientBaseline, setClientBaseline] = useState<ChargeDraft | null>(null);
  const [vendorBaseline, setVendorBaseline] = useState<ChargeDraft | null>(null);

  useEffect(() => {
    setDraft(chargeDraftFromLines(chargeLinesFromBase(clientPrice)));
    setVendorDraft(chargeDraftFromLines(chargeLinesFromBase(supplierRate)));
    setInvoiceNumber("");
    setTripStart(isoDate(startDate));
    setDelivery(isoDate(deliveryDate));
    setDispatchDate("");
    setSeededFor("");
    setSaved(false);
    setEditing(false);
    setError(null);
  }, [tripId, clientPrice, supplierRate, startDate, deliveryDate]);

  useEffect(() => {
    if (!loaded.data || seededFor === tripId) return;
    const lines = loaded.data.clientCharges ?? chargeLinesFromBase(clientPrice);
    setDraft(chargeDraftFromLines(lines));
    const vendorSeed = chargeDraftFromLines(
      loaded.data.vendorCharges ?? chargeLinesFromBase(supplierRate),
    );
    if ((ibond || loaded.data.ibond) && !loaded.data.validatedAt) {
      vendorSeed.podDelaySubmission = String(IBOND_DEDUCTIBLE_COST);
      vendorSeed.ibondDeductible = "";
    }
    vendorSeed.documentCost =
      !(ibond || loaded.data.ibond) && loaded.data.documentCost > 0
        ? String(loaded.data.documentCost)
        : "";
    setVendorDraft(vendorSeed);
    setInvoiceNumber(loaded.data.invoiceNumber?.trim() || "");
    setTripStart(isoDate(loaded.data.tripStartDate) || isoDate(startDate));
    setDelivery(isoDate(loaded.data.deliveryDate) || isoDate(deliveryDate));
    setDispatchDate(isoDate(loaded.data.dispatchDate));
    setSeededFor(tripId);
    setError(null);
    setSaved(false);
  }, [loaded.data, tripId, clientPrice, supplierRate, startDate, deliveryDate, seededFor, ibond]);

  const aging = podReceivingAging(delivery, podAgingEndDate(dispatchDate, todayIsoDate()), true);
  const showIbond = ibond || loaded.data?.ibond === true;
  const shownAging = showIbond && aging ? { ...aging, penalty: IBOND_DEDUCTIBLE_COST } : aging;
  const podDelayAmount = showIbond
    ? String(IBOND_DEDUCTIBLE_COST)
    : podDelaySubmissionAmount(aging?.penalty);
  useEffect(() => {
    if (loaded.data?.validatedAt || saved) return;
    setVendorDraft((current) =>
      current.podDelaySubmission === podDelayAmount && current.ibondDeductible === ""
        ? current
        : { ...current, podDelaySubmission: podDelayAmount, ibondDeductible: "" },
    );
  }, [podDelayAmount, loaded.data?.validatedAt, saved, seededFor]);

  const documentCostAmount =
    !showIbond && loaded.data && loaded.data.documentCost > 0 ? String(loaded.data.documentCost) : "";
  useEffect(() => {
    const next = showIbond ? "" : documentCostAmount;
    setVendorDraft((current) =>
      current.documentCost === next ? current : { ...current, documentCost: next },
    );
  }, [documentCostAmount, showIbond, seededFor]);

  const parsed = useMemo(() => chargeLinesFromDraft(draft), [draft]);
  const parsedVendor = useMemo(() => chargeLinesFromDraft(vendorDraft), [vendorDraft]);
  const previouslyValidated = Boolean(loaded.data?.validatedAt) || saved;
  const locked = reviewMode ? !editing : false;
  const chargesConfirmed = reviewMode && previouslyValidated;
  const total = parsed.lines ? netChargeTotal(parsed.lines) : null;
  const fetchedDocumentCost = showIbond ? 0 : Math.max(0, Number(loaded.data?.documentCost) || 0);
  const vendorLines = parsedVendor.lines
    ? { ...parsedVendor.lines, ibondDeductible: 0, documentCost: fetchedDocumentCost }
    : null;
  const vendorTotal = vendorLines ? netChargeTotal(vendorLines) : null;
  const invalid = new Set(parsed.lines ? [] : parsed.invalidKeys);
  const vendorInvalid = new Set(parsedVendor.lines ? [] : parsedVendor.invalidKeys);
  const fetchedInvoice = loaded.data?.invoiceNumber?.trim() || "";
  const ready =
    Boolean(parsed.lines && parsedVendor.lines) && !validate.isPending && !loaded.isLoading;

  const confirm = async () => {
    if (!parsed.lines || !parsedVendor.lines) return;
    setError(null);
    const result = await validate.mutateAsync([
      {
        tripId,
        remarks: "",
        clientInvoiceNumber: invoiceNumber || null,
        tripStartDate: tripStart || null,
        deliveryDate: delivery || null,
        dispatchDate: dispatchDate || null,
        client: parsed.lines,
        vendor: vendorLines ?? parsedVendor.lines,
      },
    ]);
    if (result.updatedIds.includes(tripId)) {
      setSaved(true);
      setEditing(false);
      onSaved?.();
      return;
    }
    setError(result.error?.message ?? "Could not confirm validation.");
  };

  return (
    <View style={styles.root}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>POD Validation</Text>
            <Text style={styles.tripId} numberOfLines={1}>{displayId}</Text>
          </View>
          {reviewMode && !editing ? (
            <Pressable
              style={styles.editBtn}
              onPress={() => {
                setClientBaseline(draft);
                setVendorBaseline(vendorDraft);
                setEditing(true);
                setError(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit charges"
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>
        {[clientName, routeLabel].filter(Boolean).length > 0 ? (
          <Text style={styles.sub} numberOfLines={2}>
            {[clientName, routeLabel].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.dateCard}>
        <View style={styles.dateCol}>
          <HardCopyPodDateField
            compact
            label="Trip start date"
            value={tripStart}
            onChange={setTripStart}
            disabled={locked}
          />
        </View>
        <View style={styles.dateCol}>
          <HardCopyPodDateField
            compact
            label="Delivery date"
            value={delivery}
            onChange={setDelivery}
            disabled={locked}
          />
        </View>
        <View style={styles.dateCol}>
          <HardCopyPodDateField
            compact
            label="Dispatch date"
            value={dispatchDate}
            onChange={setDispatchDate}
            disabled={locked}
          />
        </View>
        <View style={styles.agingCol}>
          <Text style={styles.agingLabel}>Aging</Text>
          <View
            style={[
              styles.agingShell,
              shownAging || showIbond ? styles.agingShellFilled : null,
              showIbond || (shownAging && shownAging.penalty > 0) ? styles.agingShellLate : null,
            ]}
          >
            <Text
              style={[
                styles.agingValue,
                shownAging || showIbond ? null : styles.agingPlaceholder,
                showIbond || (shownAging && shownAging.penalty > 0) ? styles.agingLate : null,
              ]}
            >
              {showIbond && !shownAging ? formatInr(IBOND_DEDUCTIBLE_COST) : formatPodReceivingAging(shownAging)}
            </Text>
          </View>
        </View>
      </View>

      {loaded.isLoading ? <ActivityIndicator color={Theme.textPrimaryDark} style={styles.spinner} /> : null}
      {loaded.isError ? (
        <Text style={styles.error}>
          {loaded.error instanceof Error ? loaded.error.message : "Could not load client validation."}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Client Details</Text>
      <ChargeCards
        side="Client"
        showTitles={false}
        labels={CLIENT_LABEL}
        draft={draft}
        invalid={invalid}
        locked={locked}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
      />
      <View style={styles.grid}>
        <View style={[styles.card, styles.invoice]}>
          <Text style={styles.cardTitle}>Sales Invoice Number</Text>
          <Text style={styles.cardHint}>Fetched from Trips Ops. You can edit it before confirming.</Text>
          <TextInput
            value={invoiceNumber}
            editable={!locked}
            onChangeText={setInvoiceNumber}
            placeholder="Sales invoice number"
            placeholderTextColor={Theme.textMuted}
            style={[styles.invoiceInput, locked && styles.inputLocked]}
            accessibilityLabel="Sales Invoice Number"
          />
          {fetchedInvoice && invoiceNumber.trim() === fetchedInvoice ? (
            <Text style={styles.autoFetched}>Auto fetched</Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Vendor Details</Text>
      <ChargeCards
        side="Vendor"
        labels={VENDOR_LABEL}
        draft={vendorDraft}
        invalid={vendorInvalid}
        locked={locked}
        readOnlyKeys={["documentCost"]}
        onChange={(key, value) => {
          if (key === "documentCost") return;
          setVendorDraft((current) => ({ ...current, [key]: value }));
        }}
      />
    </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total Client Value</Text>
          <Text style={styles.totalValue}>{total == null ? "—" : formatInr(total)}</Text>
        </View>
        <View style={[styles.totalBox, styles.vendorTotal]}>
          <Text style={styles.totalLabel}>Total Vendor Value</Text>
          <Text style={styles.totalValue}>{vendorTotal == null ? "—" : formatInr(vendorTotal)}</Text>
        </View>
        <View style={styles.footerActions}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {chargesConfirmed && !editing ? null : (
            <View style={styles.footerButtons}>
              {reviewMode && editing ? (
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => {
                    if (clientBaseline) setDraft(clientBaseline);
                    if (vendorBaseline) setVendorDraft(vendorBaseline);
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={validate.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel charge edits"
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.confirm, !ready && styles.confirmDisabled]}
                disabled={!ready}
                onPress={() => void confirm()}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                accessibilityLabel={reviewMode || previouslyValidated ? "Save" : "Confirm Validation"}
              >
                <Text style={styles.confirmText}>
                  {validate.isPending
                    ? "Saving…"
                    : reviewMode || previouslyValidated
                      ? "Save"
                      : "Confirm Validation"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function isoDate(value: string | null | undefined): string {
  const day = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function ChargeCards({
  side,
  showTitles = false,
  labels,
  draft,
  invalid,
  locked,
  readOnlyKeys,
  onChange,
}: {
  side: "Client" | "Vendor";
  showTitles?: boolean;
  labels: Map<ChargeFieldKey, string>;
  draft: ChargeDraft;
  invalid: Set<ChargeFieldKey>;
  locked: boolean;
  /** Filled from another process. Shown in the same box, but not typed. */
  readOnlyKeys?: readonly ChargeFieldKey[];
  onChange: (key: ChargeFieldKey, value: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {GROUP_KEYS.map((group) => (
        <View key={group.tone} style={[styles.card, styles[group.tone]]}>
          {showTitles ? (
            <Text style={styles.cardTitle}>
              {side} {group.title}
            </Text>
          ) : null}
          <Text style={styles.cardHint}>
            {group.included
              ? `Included in Total ${side} Value`
              : `Deducted from Total ${side} Value`}
          </Text>
          <View style={styles.tableHead}>
            <Text style={styles.headLabel}>Field</Text>
            <Text style={styles.headAmount}>Amount (₹)</Text>
          </View>
          {group.keys
            .filter((key) => side === "Vendor" || !CHARGE_FIELDS.find((field) => field.key === key)?.vendorOnly)
            .map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.fieldLabel}>{labels.get(key)}</Text>
              {locked || readOnlyKeys?.includes(key) ? (
                <Text style={styles.readOnlyValue} accessibilityLabel={labels.get(key)}>
                  {draft[key] ? formatInr(Number(draft[key])) : formatInr(0)}
                </Text>
              ) : (
                <TextInput
                  value={draft[key]}
                  editable
                  onChangeText={(value) => onChange(key, value)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Theme.textMuted}
                  style={[styles.input, invalid.has(key) && styles.inputInvalid]}
                  accessibilityLabel={labels.get(key)}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: Theme.cardWhite },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16, gap: 10 },
  header: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  titleBlock: { flex: 1, minWidth: 0, gap: 2 },
  editBtn: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  cancelBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  readOnlyValue: {
    width: 112,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  title: { fontSize: 16, fontWeight: "800", color: Theme.primaryText },
  tripId: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  dateCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dateCol: { flexGrow: 1, flexBasis: "22%", minWidth: 132 },
  agingCol: { flexGrow: 1, flexBasis: "22%", minWidth: 132, gap: 4 },
  agingLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  agingShell: {
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  agingShellFilled: { borderColor: Theme.borderInput },
  agingShellLate: { borderColor: Theme.destructive, backgroundColor: Theme.cardWhite },
  agingValue: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  agingLate: { color: Theme.destructive, fontWeight: "800" },
  agingPlaceholder: { color: Theme.textMuted, fontWeight: "500" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: Theme.primaryText, marginTop: 2 },
  sub: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  spinner: { marginVertical: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 },
  card: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  charges: { backgroundColor: Theme.complianceStageBalanceBg, borderColor: Theme.complianceTripCardBorder },
  additional: { backgroundColor: Theme.complianceStageSuccessBg, borderColor: Theme.complianceTripCardBorder },
  exceptions: { backgroundColor: Theme.complianceStagePendingBg, borderColor: Theme.complianceTripCardBorder },
  invoice: { backgroundColor: Theme.complianceStageInfoBg, borderColor: Theme.complianceTripCardBorder, gap: 6 },
  cardTitle: { fontSize: 13, fontWeight: "800", color: Theme.primaryText },
  cardHint: { fontSize: 11, color: Theme.textSecondary, marginBottom: 2 },
  tableHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
  },
  headLabel: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  headAmount: { width: 112, fontSize: 11, fontWeight: "700", color: Theme.textMuted, textAlign: "right" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  fieldLabel: { flex: 1, minWidth: 0, fontSize: 13, color: Theme.primaryText },
  input: {
    width: 112,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.cardWhite,
    color: Theme.primaryText,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  inputInvalid: { borderColor: Theme.buttonDestructive },
  inputLocked: { backgroundColor: Theme.screenBackground },
  invoiceInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.cardWhite,
    color: Theme.primaryText,
    fontSize: 13,
  },
  autoFetched: { alignSelf: "flex-end", fontSize: 11, fontWeight: "700", color: Theme.positive },
  footer: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  totalBox: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 150,
    borderRadius: 10,
    backgroundColor: Theme.complianceStageBalanceBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  vendorTotal: { backgroundColor: Theme.complianceStageSuccessBg },
  totalLabel: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  totalValue: { fontSize: 16, fontWeight: "800", color: Theme.primaryText },
  footerActions: { marginLeft: "auto", alignItems: "flex-end", justifyContent: "center", gap: 6, minWidth: 120 },
  footerButtons: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  confirm: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 18,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDisabled: { opacity: 0.4 },
  confirmText: { color: Theme.buttonDarkText, fontWeight: "700", fontSize: 14 },
  lockedNote: { fontSize: 13, fontWeight: "600", color: Theme.positive },
  error: { color: Theme.buttonDestructive, fontSize: 13, textAlign: "right" },
});
