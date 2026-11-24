import { SmartInput } from "@/components/mobile-input";
import { showAppAlert } from "@/lib/appAlert";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import {
  OperationalBottomActionBar,
  OperationalButton,
  OperationalHeader,
  Surface,
} from "@/components/operational";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useLeaveTripExpenseEntry } from "../shared/useLeaveTripExpenseEntry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FuelType, OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripFuelEntry, useUpdateTripFuelEntry } from "../queries/useTripOperations";
import { getTripFuelEntryById } from "./fuel.service";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import {
  FUEL_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
  defaultPaymentOwnerForTrip,
  paymentOwnerOptionsForActor,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";
import { DriverExpenseCategorySwitch } from "../shared/DriverExpenseCategorySwitch";
import { DriverExpenseChipSelect } from "../shared/DriverExpenseChipSelect";
import type { DriverExpenseCategoryNav } from "../shared/driverExpenseCategoryNav.util";
import type { TripOtherExpenseCategory } from "../types";
import {
  DriverExpenseEntryLayout,
  DriverExpenseFieldDivider,
  DriverExpenseFieldLabel,
  DriverExpenseSection,
  DriverExpenseTextInput,
} from "../shared/DriverExpenseEntryLayout";
import { previewFuelReceiptOcr } from "../shared/applyExpenseReceiptOcr.util";
import type { ExpenseReceiptOcrResult } from "../shared/expenseReceiptOcr.service";
import { buildExpenseEntryPartyPreview } from "../shared/expenseEntryPartyPreview.util";
import {
  type ExpenseBillCaptureBag,
  useExpenseBillCapture,
  useRegisterExpenseBillPreview,
} from "../shared/useExpenseBillCapture";
import { ExpenseBillPhotoScan } from "@/features/trips/operations/shared/ExpenseBillPhotoScan";

function FuelAmountFlow({
  amountInr,
  liters,
  onAmountChange,
  onLitersChange,
  context,
  partyPreview,
  flowHintColor = Theme.textMuted,
}: {
  amountInr: number;
  liters: number | null;
  onAmountChange: (numeric: number) => void;
  onLitersChange: (numeric: number) => void;
  context?: string;
  partyPreview?: NumericEntryPartyPreview;
  flowHintColor?: string;
}) {
  const showLitersStep = amountInr > 0;
  const [litersOpen, setLitersOpen] = useState(false);
  const litersOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (litersOpenTimerRef.current) clearTimeout(litersOpenTimerRef.current);
    };
  }, []);

  const handleSpendChange = useCallback(
    (_raw: string, numeric: number) => {
      onAmountChange(numeric);
      if (numeric <= 0) {
        setLitersOpen(false);
        return;
      }
      // Let Spend sheet finish closing, then open Liters as the next step.
      if (litersOpenTimerRef.current) clearTimeout(litersOpenTimerRef.current);
      litersOpenTimerRef.current = setTimeout(() => {
        setLitersOpen(true);
        litersOpenTimerRef.current = null;
      }, 280);
    },
    [onAmountChange],
  );

  return (
    <View style={flowStyles.wrap}>
      <SmartInput
        type="currency"
        value={amountInr}
        onChange={handleSpendChange}
        label="Spend"
        context={context}
        partyPreview={partyPreview}
        submitLabel="Continue"
        variant="field"
        density="compact"
        placeholder="Enter amount"
        required={false}
        validation={{ min: 0, max: 1000000 }}
      />

      {showLitersStep ? (
        <>
          <View style={flowStyles.connector}>
            <View style={[flowStyles.connectorLine, { backgroundColor: flowHintColor }]} />
            <Text style={[flowStyles.connectorLabel, { color: flowHintColor }]}>Liters</Text>
            <View style={[flowStyles.connectorLine, { backgroundColor: flowHintColor }]} />
          </View>
          <SmartInput
            type="quantity"
            value={liters ?? ""}
            onChange={(_, numeric) => onLitersChange(numeric)}
            label="Liters"
            context={context}
            partyPreview={partyPreview}
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="How many liters?"
            suffix=" L"
            required={false}
            validation={{ min: 0, max: 5000 }}
            open={litersOpen}
            onOpenChange={setLitersOpen}
          />
        </>
      ) : (
        <Text style={[flowStyles.pendingHint, { color: flowHintColor }]}>
          Then add liters
        </Text>
      )}
    </View>
  );
}

const flowStyles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  connector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  connectorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.35,
  },
  connectorLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  pendingHint: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
    paddingHorizontal: 1,
  },
});

export function FuelEntryScreen({
  trip,
  entryId,
  otherCategory = "parking",
  onCategoryNavChange,
  lockCategorySwitch = false,
  billCapture,
}: {
  trip: TripRow;
  entryId?: string | null;
  otherCategory?: TripOtherExpenseCategory;
  onCategoryNavChange?: (next: DriverExpenseCategoryNav) => void;
  lockCategorySwitch?: boolean;
  /** Shared OCR state from DriverUnifiedExpenseEntryScreen (keeps photo across category switch). */
  billCapture?: ExpenseBillCaptureBag;
}) {
  const leave = useLeaveTripExpenseEntry(trip.id);
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isDriver = profile?.role === "driver";
  const saveFuel = useSaveTripFuelEntry();
  const updateFuel = useUpdateTripFuelEntry();
  const { pendingCount, failedCount, refresh } = useOperationsSyncState();
  const isEditing = !!entryId?.trim();

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
  const [amountInr, setAmountInr] = useState<number>(0);
  const [liters, setLiters] = useState<number | null>(null);
  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [stationName, setStationName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>(() =>
    defaultPaymentOwnerForTrip(trip, profile?.role),
  );
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("unknown");
  const [hint, setHint] = useState<string | null>(null);

  const handleOcrPreview = useCallback(
    (result: ExpenseReceiptOcrResult) => {
      return previewFuelReceiptOcr(
        result,
        { amountInr, liters, fuelType, stationName, notes, paymentMode },
        {
          setAmountInr,
          setLiters,
          setFuelType,
          setStationName,
          setNotes,
          setPaymentMode,
        },
      );
    },
    [amountInr, fuelType, liters, notes, paymentMode, stationName],
  );

  const ownedBillCapture = useExpenseBillCapture({
    organizationId: trip.organization_id,
    tripId: trip.id,
    createdBy: profile?.uid ?? null,
    kind: "fuel",
    permissionMessage: "Enable camera or photo library access to attach a fuel bill photo.",
    previewOcrUpdates: handleOcrPreview,
  });
  const capture = billCapture ?? ownedBillCapture;
  useRegisterExpenseBillPreview(billCapture, handleOcrPreview);

  const {
    photoUri,
    setPhotoUri,
    scanning,
    billScan,
    persistedJob,
    handleCapture,
    acceptPhoto,
    handleRemovePhoto,
    applyPendingUpdates,
    dismissPendingUpdates,
    reopenOcrReview,
    hydratePersistedOcrFromJob,
  } = capture;

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );
  const expensePartyPreview = useMemo(
    () => buildExpenseEntryPartyPreview(trip),
    [trip],
  );

  const paymentOwnerOptions = useMemo(
    () => paymentOwnerOptionsForActor(PAYMENT_OWNER_OPTIONS, profile?.role, trip),
    [profile?.role, trip],
  );

  useEffect(() => {
    if (!isEditing) {
      setPaymentOwner(defaultPaymentOwnerForTrip(trip, profile?.role));
    }
  }, [isEditing, profile?.role, trip]);

  useEffect(() => {
    const id = entryId?.trim();
    if (!id) {
      setLoadingEntry(false);
      return;
    }
    let mounted = true;
    void getTripFuelEntryById(id).then((res) => {
      if (!mounted) return;
      if (res.error || !res.entry) {
        Alert.alert("Could not load fuel entry", res.error?.message ?? "Not found");
        leave();
        return;
      }
      if (res.entry.trip_id !== trip.id) {
        Alert.alert("Wrong trip", "This entry belongs to a different trip.");
        leave();
        return;
      }
      const entry = res.entry;
      setAmountInr(Number(entry.amount_inr ?? 0));
      setLiters(entry.liters ?? null);
      setFuelType((entry.fuel_type as FuelType | null) ?? "diesel");
      setStationName(entry.station_name ?? "");
      setNotes(entry.notes ?? "");
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "unknown");
      const billPath = entry.bill_storage_path?.trim();
      if (billPath) {
        void getDocumentViewUrl(billPath).then((url) => {
          if (mounted && url) setPhotoUri(url);
        });
      }
      const ocrJobId = entry.ocr_job_id?.trim();
      if (ocrJobId) {
        void hydratePersistedOcrFromJob(ocrJobId);
      }
      setLoadingEntry(false);
    });
    return () => {
      mounted = false;
    };
  }, [entryId, hydratePersistedOcrFromJob, leave, setPhotoUri, trip.id]);

  const saving = saveFuel.isPending || updateFuel.isPending;

  const handleSave = async () => {
    // A ₹0 entry adds a useless expense row (other expenses already block this).
    if (!(amountInr > 0)) {
      showAppAlert("Enter the amount", "Enter the fuel amount before saving.");
      return;
    }
    const payload = {
      tripId: trip.id,
      amountInr,
      liters,
      fuelType,
      stationName,
      notes,
      enteredBy: profile?.uid ?? null,
      paymentOwner,
      paymentMode,
      operatingMode: trip.operating_mode ?? null,
      billPhotoLocalUri: photoUri,
      ocrJobId: persistedJob?.id,
    };
    try {
      if (isEditing && entryId?.trim()) {
        await updateFuel.mutateAsync({ ...payload, entryId: entryId.trim() });
      } else {
        const res = await saveFuel.mutateAsync({
          ...payload,
          actorRole: profile?.role ?? null,
        });
        if (res.queued) setHint("Saved offline — will sync when connected.");
      }
      await refresh();
      leave();
    } catch (e) {
      Alert.alert(
        isEditing ? "Could not update fuel entry" : "Could not save fuel entry",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const syncHint =
    pendingCount > 0
      ? `Sync queue: ${pendingCount}${failedCount > 0 ? ` · failed ${failedCount}` : ""}`
      : null;

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading fuel entry…" />;
  }

  if (isDriver) {
    return (
      <DriverExpenseEntryLayout
        category="fuel"
        title={isEditing ? "Edit expense" : "Log expense"}
        subtitle={contextLine}
        isEditing={isEditing}
        saving={saving}
        onBack={() => leave()}
        onSave={handleSave}
        hint={hint}
        syncHint={syncHint}
        billScan={billScan}
        onApplyBillScan={applyPendingUpdates}
        onDismissBillScan={dismissPendingUpdates}
        onReviewBillScan={reopenOcrReview}
        attachment={{
          uri: photoUri,
          busy: saving || scanning,
          label: "Bill photo",
          onAttach: () => void handleCapture("camera"),
          onCaptured: (uri) => void acceptPhoto(uri),
          onPick: () => void handleCapture("library"),
          onRemove: handleRemovePhoto,
        }}
        amountSlot={
          <FuelAmountFlow
            amountInr={amountInr}
            liters={liters}
            onAmountChange={setAmountInr}
            onLitersChange={setLiters}
            context={contextLine}
            partyPreview={expensePartyPreview}
            flowHintColor={Theme.driverEmeraldDark}
          />
        }
      >
        <DriverExpenseSection title="Category & payment">
          <DriverExpenseCategorySwitch
            tripId={trip.id}
            formKind="fuel"
            otherCategory={otherCategory}
            onOtherCategoryChange={() => {}}
            onCategoryNavChange={onCategoryNavChange}
            lockCategorySwitch={lockCategorySwitch}
            lockKindSwitch={isEditing}
          />
          <DriverExpenseFieldDivider />
          <DriverExpenseChipSelect
            label="Fuel type"
            options={FUEL_TYPE_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
            columns={2}
            visualGroup="fuel_type"
          />
          <DriverExpenseFieldDivider />
          <DriverExpenseChipSelect
            label="Payment mode"
            options={PAYMENT_MODE_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
            columns={3}
            visualGroup="payment_mode"
          />
        </DriverExpenseSection>

        <DriverExpenseSection title="Details">
          <View>
            <DriverExpenseFieldLabel>Station (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={stationName}
              onChangeText={setStationName}
              placeholder="Pump / station name"
            />
          </View>
          <View>
            <DriverExpenseFieldLabel>Notes (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Short note"
            />
          </View>
        </DriverExpenseSection>
      </DriverExpenseEntryLayout>
    );
  }

  return (
    <View style={s.screen}>
      <OperationalHeader
        title={isEditing ? "Edit fuel" : "Fuel Entry"}
        subtitle={contextLine}
        onBack={() => leave()}
        density="high"
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 76 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high" style={s.card}>
          <FuelAmountFlow
            amountInr={amountInr}
            liters={liters}
            onAmountChange={setAmountInr}
            onLitersChange={setLiters}
            context={contextLine}
            partyPreview={expensePartyPreview}
          />
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <DriverExpenseChipSelect
            label="Fuel type"
            options={FUEL_TYPE_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
            columns={2}
            visualGroup="fuel_type"
          />
          <View style={s.divider} />
          <DriverExpenseChipSelect
            label="Paid by"
            options={paymentOwnerOptions}
            value={paymentOwner}
            onChange={setPaymentOwner}
            columns={3}
            visualGroup="payment_owner"
          />
          <View style={s.divider} />
          <DriverExpenseChipSelect
            label="Payment mode"
            options={PAYMENT_MODE_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
            columns={3}
            visualGroup="payment_mode"
          />
          <Text style={s.metaHint}>
            Operational log only — approval required before posting.
          </Text>
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <View style={s.fieldStack}>
            <View>
              <Text style={s.fieldLabel}>Station (optional)</Text>
              <TextInput
                style={s.input}
                value={stationName}
                onChangeText={setStationName}
                placeholder="Pump / station name"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[s.input, s.notes]}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Short note"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
          </View>
        </Surface>

        <View style={s.photoWrap}>
          <ExpenseBillPhotoScan
            label="Fuel Receipt"
            uri={photoUri}
            scan={billScan}
            scanning={scanning}
            busy={saving}
            onAttach={handleCapture}
            onRetake={handleCapture}
            onRemove={handleRemovePhoto}
            onRescanPhoto={handleCapture}
            onApplyPending={applyPendingUpdates}
            onDismissPending={dismissPendingUpdates}
            onReviewOcr={reopenOcrReview}
          />
        </View>

        {hint ? <Text style={s.hint}>{hint}</Text> : null}
        {syncHint ? <Text style={s.hint}>{syncHint}</Text> : null}
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={s.footer}>
          <OperationalButton
            intent="utility"
            label="Skip"
            onPress={() => leave()}
            density="high"
            style={s.footerBtn}
          />
          <OperationalButton
            intent="bottomSticky"
            label={saving ? "Saving…" : isEditing ? "Update" : "Save"}
            onPress={handleSave}
            loading={saving}
            density="high"
            style={s.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}
