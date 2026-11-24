import { SmartInput } from "@/components/mobile-input";
import { showAppAlert } from "@/lib/appAlert";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripTollEntry, useUpdateTripTollEntry } from "../queries/useTripOperations";
import { getTripTollEntryById } from "./toll.service";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import {
  PAYMENT_MODE_OPTIONS,
  TOLL_PAYMENT_OWNER_OPTIONS,
  defaultPaymentOwnerForTrip,
  paymentOwnerOptionsForActor,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";
import { DriverExpenseCategorySwitch } from "../shared/DriverExpenseCategorySwitch";
import { DriverExpenseChipSelect } from "../shared/DriverExpenseChipSelect";
import type { DriverExpenseCategoryNav } from "../shared/driverExpenseCategoryNav.util";
import { buildExpenseEntryPartyPreview } from "../shared/expenseEntryPartyPreview.util";
import type { TripOtherExpenseCategory } from "../types";
import {
  DriverExpenseEntryLayout,
  DriverExpenseFieldDivider,
  DriverExpenseFieldLabel,
  DriverExpenseSection,
  DriverExpenseTextInput,
} from "../shared/DriverExpenseEntryLayout";
import { previewTollReceiptOcr } from "../shared/applyExpenseReceiptOcr.util";
import type { ExpenseReceiptOcrResult } from "../shared/expenseReceiptOcr.service";
import {
  type ExpenseBillCaptureBag,
  useExpenseBillCapture,
  useRegisterExpenseBillPreview,
} from "../shared/useExpenseBillCapture";
import { ExpenseBillPhotoScan } from "@/features/trips/operations/shared/ExpenseBillPhotoScan";

export function TollEntryScreen({
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
  billCapture?: ExpenseBillCaptureBag;
}) {
  const leave = useLeaveTripExpenseEntry(trip.id);
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isDriver = profile?.role === "driver";
  const saveToll = useSaveTripTollEntry();
  const updateToll = useUpdateTripTollEntry();
  const { pendingCount, failedCount, refresh } = useOperationsSyncState();
  const isEditing = !!entryId?.trim();

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
  const [amountInr, setAmountInr] = useState<number>(0);
  const [plazaName, setPlazaName] = useState("");
  const [notes, setNotes] = useState("");
  const [isEstimated, setIsEstimated] = useState(false);
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>(() =>
    defaultPaymentOwnerForTrip(trip, profile?.role),
  );
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("unknown");
  const [hint, setHint] = useState<string | null>(null);

  const handleOcrPreview = useCallback(
    (result: ExpenseReceiptOcrResult) => {
      return previewTollReceiptOcr(
        result,
        { amountInr, plazaName, notes, paymentMode },
        {
          setAmountInr,
          setPlazaName,
          setNotes,
          setPaymentMode,
          setIsEstimated,
        },
      );
    },
    [amountInr, notes, paymentMode, plazaName],
  );

  const ownedBillCapture = useExpenseBillCapture({
    organizationId: trip.organization_id,
    tripId: trip.id,
    createdBy: profile?.uid ?? null,
    kind: "toll",
    permissionMessage: "Enable camera or photo library access to attach a toll receipt photo.",
    previewOcrUpdates: handleOcrPreview,
  });
  const capture = billCapture ?? ownedBillCapture;
  useRegisterExpenseBillPreview(billCapture, handleOcrPreview);

  const {
    photoUri: receiptUri,
    setPhotoUri: setReceiptUri,
    scanning,
    billScan,
    persistedJob,
    handleCapture,
    acceptPhoto,
    handleRemovePhoto: handleRemoveReceipt,
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
    () => paymentOwnerOptionsForActor(TOLL_PAYMENT_OWNER_OPTIONS, profile?.role, trip),
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
    void getTripTollEntryById(id).then((res) => {
      if (!mounted) return;
      if (res.error || !res.entry) {
        Alert.alert("Could not load toll entry", res.error?.message ?? "Not found");
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
      setPlazaName(entry.plaza_name ?? "");
      setNotes(entry.notes ?? "");
      setIsEstimated(entry.is_estimated === true);
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "unknown");
      const receiptPath = entry.receipt_storage_path?.trim();
      if (receiptPath) {
        void getDocumentViewUrl(receiptPath).then((url) => {
          if (mounted && url) setReceiptUri(url);
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
  }, [entryId, hydratePersistedOcrFromJob, leave, setReceiptUri, trip.id]);

  const saving = saveToll.isPending || updateToll.isPending;

  const handleSave = async () => {
    // A ₹0 entry adds a useless expense row (other expenses already block this).
    if (!(amountInr > 0)) {
      showAppAlert("Enter the amount", "Enter the toll amount before saving.");
      return;
    }
    const payload = {
      tripId: trip.id,
      amountInr,
      plazaName,
      notes,
      isEstimated,
      enteredBy: profile?.uid ?? null,
      paymentOwner,
      paymentMode,
      operatingMode: trip.operating_mode ?? null,
      receiptLocalUri: receiptUri,
      ocrJobId: persistedJob?.id,
    };
    try {
      if (isEditing && entryId?.trim()) {
        await updateToll.mutateAsync({ ...payload, entryId: entryId.trim() });
      } else {
        const res = await saveToll.mutateAsync({
          ...payload,
          actorRole: profile?.role === "driver" ? "driver" : "user",
        });
        if (res.queued) setHint("Saved offline — will sync when connected.");
      }
      await refresh();
      leave();
    } catch (e) {
      Alert.alert(
        isEditing ? "Could not update toll entry" : "Could not save toll entry",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const syncHint =
    pendingCount > 0
      ? `Sync queue: ${pendingCount}${failedCount > 0 ? ` · failed ${failedCount}` : ""}`
      : null;

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading toll entry…" />;
  }

  if (isDriver) {
    return (
      <DriverExpenseEntryLayout
        category="toll"
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
          uri: receiptUri,
          busy: saving || scanning,
          label: "Receipt",
          onAttach: () => void handleCapture("camera"),
          onCaptured: (uri) => void acceptPhoto(uri),
          onPick: () => void handleCapture("library"),
          onRemove: handleRemoveReceipt,
        }}
        amountSlot={
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Toll amount"
            context={contextLine}
            partyPreview={expensePartyPreview}
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="Enter amount"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        }
      >
        <DriverExpenseSection title="Category & payment">
          <DriverExpenseCategorySwitch
            tripId={trip.id}
            formKind="toll"
            otherCategory={otherCategory}
            onOtherCategoryChange={() => {}}
            onCategoryNavChange={onCategoryNavChange}
            lockCategorySwitch={lockCategorySwitch}
            lockKindSwitch={isEditing}
          />
          <DriverExpenseFieldDivider />
          <DriverExpenseChipSelect
            label="Entry type"
            options={[
              { value: "actual", label: "Actual" },
              { value: "estimated", label: "Estimated" },
            ]}
            value={isEstimated ? "estimated" : "actual"}
            onChange={(v) => setIsEstimated(v === "estimated")}
            columns={2}
            visualGroup="toll_entry"
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
            <DriverExpenseFieldLabel>Plaza (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={plazaName}
              onChangeText={setPlazaName}
              placeholder="Toll plaza name"
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
        title={isEditing ? "Edit toll" : "Toll Entry"}
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
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Toll amount"
            context={contextLine}
            partyPreview={expensePartyPreview}
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="Tap to enter"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <DriverExpenseChipSelect
            label="Entry type"
            options={[
              { value: "actual", label: "Actual" },
              { value: "estimated", label: "Estimated" },
            ]}
            value={isEstimated ? "estimated" : "actual"}
            onChange={(v) => setIsEstimated(v === "estimated")}
            columns={2}
            visualGroup="toll_entry"
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
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <View style={s.fieldStack}>
            <View>
              <Text style={s.fieldLabel}>Plaza (optional)</Text>
              <TextInput
                style={s.input}
                value={plazaName}
                onChangeText={setPlazaName}
                placeholder="Toll plaza name"
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
            label="Toll Receipt"
            uri={receiptUri}
            scan={billScan}
            scanning={scanning}
            busy={saving}
            onAttach={handleCapture}
            onRetake={handleCapture}
            onRemove={handleRemoveReceipt}
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
