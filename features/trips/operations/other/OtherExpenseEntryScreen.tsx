import { SmartInput, triggerFeedback } from "@/components/mobile-input";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import {
  OperationalBottomActionBar,
  OperationalButton,
  OperationalHeader,
  Surface,
} from "@/components/operational";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useWebLayoutWidth } from "@/lib/useWebLayoutWidth";
import { useLeaveTripExpenseEntry } from "../shared/useLeaveTripExpenseEntry";
import {
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  CircleParking,
  MoreHorizontal,
  Package,
  PackageOpen,
  Scale,
  Ticket,
  Timer,
  TriangleAlert,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  OperationalPaymentMode,
  OperationalPaymentOwner,
  TripOtherExpenseCategory,
} from "../types";
import {
  useSaveTripOtherExpense,
  useUpdateTripOtherExpense,
} from "../queries/useTripOperations";
import { getTripOtherExpenseById } from "./otherExpense.service";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import {
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
  defaultPaymentOwnerForTrip,
  paymentOwnerOptionsForActor,
} from "../shared/operationsEntryOptions";
import {
  TRIP_OTHER_EXPENSE_OPTIONS,
  formatOtherExpenseCategoryLabel,
  splitOtherExpenseOptions,
} from "../shared/tripOtherExpenseCategories";
import { OperationalChipSelect } from "@/components/operational";
import { DriverExpenseCategorySwitch } from "../shared/DriverExpenseCategorySwitch";
import { DriverExpenseChipSelect } from "../shared/DriverExpenseChipSelect";
import {
  parseDriverExpenseCategoryParam,
  normalizeTripOtherExpenseCategory,
  type DriverExpenseCategoryNav,
} from "../shared/driverExpenseCategoryNav.util";
import {
  DriverExpenseEntryLayout,
  DriverExpenseFieldDivider,
  DriverExpenseFieldLabel,
  DriverExpenseSection,
  DriverExpenseTextInput,
} from "../shared/DriverExpenseEntryLayout";
import { previewOtherReceiptOcr } from "../shared/applyExpenseReceiptOcr.util";
import type { ExpenseReceiptOcrResult } from "../shared/expenseReceiptOcr.service";
import { buildExpenseEntryPartyPreview } from "../shared/expenseEntryPartyPreview.util";
import {
  type ExpenseBillCaptureBag,
  useExpenseBillCapture,
  useRegisterExpenseBillPreview,
} from "../shared/useExpenseBillCapture";
import { ExpenseBillPhotoScan } from "@/features/trips/operations/shared/ExpenseBillPhotoScan";
import { operationsEntryStyles as opsStyles } from "../shared/operationsEntryScreen.styles";

const PRIMARY_OWNER_VALUES: OperationalPaymentOwner[] = [
  "organization",
  "driver",
  "supplier",
];

const CATEGORY_ICON: Record<TripOtherExpenseCategory, LucideIcon> = {
  parking: CircleParking,
  challan: TriangleAlert,
  loading: Package,
  unloading: PackageOpen,
  detention: Timer,
  maintenance: Wrench,
  fastag: Ticket,
  advance: Banknote,
  food: Utensils,
  weighbridge: Scale,
  misc: MoreHorizontal,
};

function RevealToggle({
  expanded,
  labelWhenCollapsed,
  labelWhenExpanded,
  onPress,
  compact,
}: {
  expanded: boolean;
  labelWhenCollapsed: string;
  labelWhenExpanded: string;
  onPress: () => void;
  compact?: boolean;
}) {
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.revealToggle, compact && styles.revealToggleCompact]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={8}
    >
      <Text style={[styles.revealToggleText, compact && styles.revealToggleTextCompact]}>
        {expanded ? labelWhenExpanded : labelWhenCollapsed}
      </Text>
      <Chevron size={compact ? 14 : 16} color={Theme.primary} strokeWidth={2.4} />
    </Pressable>
  );
}

function newOtherExpenseSaveKey(): string {
  return `other-exp:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function OtherExpenseEntryScreen({
  trip,
  entryId,
  initialCategory,
  expenseCategory: expenseCategoryProp,
  onExpenseCategoryChange,
  onCategoryNavChange,
  lockCategorySwitch = false,
  billCapture,
}: {
  trip: TripRow;
  entryId?: string | null;
  initialCategory?: TripOtherExpenseCategory | null;
  /** Controlled category (driver unified expense shell). */
  expenseCategory?: TripOtherExpenseCategory;
  onExpenseCategoryChange?: (category: TripOtherExpenseCategory) => void;
  onCategoryNavChange?: (next: DriverExpenseCategoryNav) => void;
  lockCategorySwitch?: boolean;
  billCapture?: ExpenseBillCaptureBag;
}) {
  const leave = useLeaveTripExpenseEntry(trip.id);
  const insets = useSafeAreaInsets();
  const layoutWidth = useWebLayoutWidth();
  const isDesktop = layoutWidth >= Layout.webDesktopMinWidth;
  const { profile } = useAuth();
  const isDriver = profile?.role === "driver";
  const saveExpense = useSaveTripOtherExpense();
  const updateExpense = useUpdateTripOtherExpense();
  const isEditing = !!entryId?.trim();
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
  const [amountInr, setAmountInr] = useState<number>(0);
  // One key per expense being added; reused if Save is tapped again after a timeout.
  const saveAttemptKeyRef = useRef(newOtherExpenseSaveKey());
  const [amountError, setAmountError] = useState<string | null>(null);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [showMoreOwners, setShowMoreOwners] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [internalCategory, setInternalCategory] = useState<TripOtherExpenseCategory>(() =>
    parseDriverExpenseCategoryParam(
      expenseCategoryProp ?? initialCategory ?? undefined,
    ),
  );
  const isCategoryControlled = expenseCategoryProp != null;
  const expenseCategory = isCategoryControlled ? expenseCategoryProp : internalCategory;

  const setExpenseCategory = useCallback(
    (category: TripOtherExpenseCategory) => {
      if (!isCategoryControlled) setInternalCategory(category);
      onExpenseCategoryChange?.(category);
    },
    [isCategoryControlled, onExpenseCategoryChange],
  );
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>(() =>
    defaultPaymentOwnerForTrip(trip, profile?.role),
  );
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("cash");

  const applyCategorySideEffects = useCallback((category: TripOtherExpenseCategory) => {
    if (category === "fastag") {
      setPaymentMode("fastag");
      setPaymentOwner((prev) => (prev === "unknown" ? "fastag" : prev));
    }
  }, []);

  const handleSelectCategory = useCallback(
    (category: TripOtherExpenseCategory) => {
      setExpenseCategory(category);
      applyCategorySideEffects(category);
    },
    [applyCategorySideEffects, setExpenseCategory],
  );

  const handleOcrPreview = useCallback(
    (result: ExpenseReceiptOcrResult) => {
      return previewOtherReceiptOcr(
        result,
        { amountInr, expenseCategory, description, locationName, notes, paymentMode },
        {
          setAmountInr: (value) => {
            setAmountInr(value);
            if (value > 0) setAmountError(null);
          },
          setExpenseCategory: (category) => {
            setExpenseCategory(category);
            applyCategorySideEffects(category);
          },
          setDescription,
          setLocationName,
          setNotes,
          setPaymentMode,
        },
      );
    },
    [
      amountInr,
      applyCategorySideEffects,
      description,
      expenseCategory,
      locationName,
      notes,
      paymentMode,
      setExpenseCategory,
    ],
  );

  const ownedBillCapture = useExpenseBillCapture({
    organizationId: trip.organization_id,
    tripId: trip.id,
    createdBy: profile?.uid ?? null,
    kind: "other",
    permissionMessage: "Enable camera or photo library access to attach a receipt photo.",
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

  const { primary: primaryCategories, more: moreCategories } = useMemo(
    () => splitOtherExpenseOptions(TRIP_OTHER_EXPENSE_OPTIONS),
    [],
  );

  const primaryOwners = useMemo(
    () => paymentOwnerOptions.filter((opt) => PRIMARY_OWNER_VALUES.includes(opt.value)),
    [paymentOwnerOptions],
  );
  const moreOwners = useMemo(
    () => paymentOwnerOptions.filter((opt) => !PRIMARY_OWNER_VALUES.includes(opt.value)),
    [paymentOwnerOptions],
  );

  const selectedInMoreCategories = moreCategories.some((opt) => opt.value === expenseCategory);
  const selectedInMoreOwners = moreOwners.some((opt) => opt.value === paymentOwner);

  // Desktop: show full taxonomies. Mobile: progressive disclosure to stay compact.
  const visibleCategories = isDesktop || showMoreCategories || selectedInMoreCategories
    ? [...primaryCategories, ...moreCategories]
    : primaryCategories;
  const visibleOwners = isDesktop || showMoreOwners || selectedInMoreOwners
    ? [...primaryOwners, ...moreOwners]
    : primaryOwners;

  const hasOptionalDetails =
    description.trim().length > 0 ||
    locationName.trim().length > 0 ||
    notes.trim().length > 0;

  const saving = saveExpense.isPending || updateExpense.isPending;
  const CategoryIcon = CATEGORY_ICON[expenseCategory] ?? MoreHorizontal;
  const ownerLabel =
    paymentOwnerOptions.find((o) => o.value === paymentOwner)?.label ?? paymentOwner;
  const modeLabel =
    PAYMENT_MODE_OPTIONS.find((o) => o.value === paymentMode)?.label ?? paymentMode;

  useEffect(() => {
    if (isEditing || isCategoryControlled) return;
    setInternalCategory(parseDriverExpenseCategoryParam(initialCategory ?? undefined));
  }, [initialCategory, isCategoryControlled, isEditing]);

  useEffect(() => {
    const id = entryId?.trim();
    if (!id) {
      setLoadingEntry(false);
      return;
    }
    let mounted = true;
    void getTripOtherExpenseById(id).then((res) => {
      if (!mounted) return;
      if (res.error || !res.entry) {
        Alert.alert("Could not load expense", res.error?.message ?? "Not found");
        leave();
        return;
      }
      if (res.entry.trip_id !== trip.id) {
        Alert.alert("Wrong trip", "This expense belongs to a different trip.");
        leave();
        return;
      }
      const entry = res.entry;
      setAmountInr(Number(entry.amount_inr ?? 0));
      setExpenseCategory(normalizeTripOtherExpenseCategory(entry.expense_category));
      setDescription(entry.description ?? "");
      setLocationName(entry.location_name ?? "");
      setNotes(entry.notes ?? "");
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "cash");
      if (
        entry.description?.trim() ||
        entry.location_name?.trim() ||
        entry.notes?.trim()
      ) {
        setShowDetails(true);
      }
      const receiptPath = entry.receipt_storage_path?.trim();
      if (receiptPath) {
        void getDocumentViewUrl(receiptPath).then((url) => {
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
  }, [entryId, hydratePersistedOcrFromJob, leave, setExpenseCategory, setPhotoUri, trip.id]);

  useEffect(() => {
    if (!isEditing) {
      setPaymentOwner(defaultPaymentOwnerForTrip(trip, profile?.role));
    }
  }, [isEditing, profile?.role, trip]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const finishSave = useCallback(
    (message: string) => {
      triggerFeedback("apply");
      setSaveFlash(message);
      leaveTimerRef.current = setTimeout(() => {
        leave();
      }, 450);
    },
    [leave],
  );

  const handleSave = async () => {
    if (amountInr <= 0) {
      setAmountError("Enter the expense amount before saving.");
      triggerFeedback("error");
      return;
    }
    setAmountError(null);
    const payload = {
      tripId: trip.id,
      expenseCategory,
      amountInr,
      description,
      locationName,
      notes,
      enteredBy: profile?.uid ?? null,
      paymentOwner,
      paymentMode,
      operatingMode: trip.operating_mode ?? null,
      receiptLocalUri: photoUri,
      ocrJobId: persistedJob?.id,
    };
    try {
      if (isEditing && entryId?.trim()) {
        await updateExpense.mutateAsync({ ...payload, entryId: entryId.trim() });
        finishSave("Expense updated");
      } else {
        await saveExpense.mutateAsync({
          ...payload,
          actorRole: profile?.role ?? null,
          idempotencyKey: saveAttemptKeyRef.current,
        });
        saveAttemptKeyRef.current = newOtherExpenseSaveKey();
        finishSave("Expense saved");
      }
    } catch (e) {
      Alert.alert(
        isEditing ? "Could not update expense" : "Could not save expense",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading expense…" />;
  }

  if (isDriver) {
    return (
      <View style={styles.screen}>
        {saveFlash ? (
          <View style={[styles.saveToast, { top: insets.top + 8 }]} accessibilityRole="alert">
            <Check size={14} color={Theme.textOnPrimary} strokeWidth={2.6} />
            <Text style={styles.saveToastText}>{saveFlash}</Text>
          </View>
        ) : null}
        <DriverExpenseEntryLayout
          category="other"
          title={isEditing ? "Edit expense" : "Log expense"}
          subtitle={contextLine}
          isEditing={isEditing}
          saving={saving}
          saveDisabled={amountInr <= 0 || !!saveFlash}
          onBack={leave}
          onSave={handleSave}
          billScan={billScan}
          onApplyBillScan={applyPendingUpdates}
          onDismissBillScan={dismissPendingUpdates}
          onReviewBillScan={reopenOcrReview}
          attachment={{
            uri: photoUri,
            busy: saving || scanning,
            label: "Receipt",
            onAttach: () => void handleCapture("camera"),
            onCaptured: (uri) => void acceptPhoto(uri),
            onPick: () => void handleCapture("library"),
            onRemove: handleRemovePhoto,
          }}
          amountSlot={
            <>
              <SmartInput
                type="currency"
                value={amountInr}
                onChange={(_, numeric) => {
                  setAmountInr(numeric);
                  if (numeric > 0) setAmountError(null);
                }}
                label="Expense amount"
                context={contextLine}
                partyPreview={expensePartyPreview}
                submitLabel="Apply"
                variant="field"
                density="compact"
                placeholder="Enter amount"
                required={false}
                validation={{ min: 0, max: 1000000 }}
              />
              {amountError ? <Text style={styles.inlineError}>{amountError}</Text> : null}
            </>
          }
        >
          <DriverExpenseSection title="Category & payment">
            <DriverExpenseCategorySwitch
              tripId={trip.id}
              formKind="other"
              otherCategory={expenseCategory}
              onOtherCategoryChange={handleSelectCategory}
              onCategoryNavChange={onCategoryNavChange}
              lockCategorySwitch={lockCategorySwitch}
              lockKindSwitch={isEditing}
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

          <DriverExpenseSection>
            <RevealToggle
              compact
              expanded={showDetails || hasOptionalDetails}
              labelWhenCollapsed="Add details (optional)"
              labelWhenExpanded="Hide details"
              onPress={() => setShowDetails((v) => !v)}
            />
            {showDetails || hasOptionalDetails ? (
              <View style={styles.driverDetailsStack}>
                <View>
                  <DriverExpenseFieldLabel>Description (optional)</DriverExpenseFieldLabel>
                  <DriverExpenseTextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What was this for?"
                  />
                </View>
                <View>
                  <DriverExpenseFieldLabel>Location (optional)</DriverExpenseFieldLabel>
                  <DriverExpenseTextInput
                    value={locationName}
                    onChangeText={setLocationName}
                    placeholder="Plaza, yard, city"
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
              </View>
            ) : null}
          </DriverExpenseSection>
        </DriverExpenseEntryLayout>
      </View>
    );
  }

  const amountBlock = (
    <Surface elevation={1} density="high" style={opsStyles.card}>
      <SmartInput
        type="currency"
        value={amountInr}
        onChange={(_, numeric) => {
          setAmountInr(numeric);
          if (numeric > 0) setAmountError(null);
        }}
        label="Expense amount"
        context={contextLine}
        partyPreview={expensePartyPreview}
        submitLabel="Apply"
        variant={isDesktop ? "hero" : "field"}
        density="compact"
        heroAccentColor={Theme.primary}
        placeholder="0"
        required={false}
        validation={{ min: 0, max: 1000000 }}
      />
      {amountError ? <Text style={styles.inlineError}>{amountError}</Text> : null}
    </Surface>
  );

  const classifyBlock = (
    <Surface elevation={1} density="high" style={opsStyles.card}>
      <OperationalChipSelect
        label="Category"
        options={visibleCategories}
        value={expenseCategory}
        onChange={handleSelectCategory}
        density="compact"
      />
      {!isDesktop && moreCategories.length > 0 && !selectedInMoreCategories ? (
        <RevealToggle
          compact
          expanded={showMoreCategories}
          labelWhenCollapsed={`More (${moreCategories.length})`}
          labelWhenExpanded="Fewer"
          onPress={() => setShowMoreCategories((v) => !v)}
        />
      ) : null}

      <View style={opsStyles.divider} />

      <OperationalChipSelect
        label="Paid by"
        options={visibleOwners}
        value={paymentOwner}
        onChange={setPaymentOwner}
        density="compact"
      />
      {!isDesktop && moreOwners.length > 0 && !selectedInMoreOwners ? (
        <RevealToggle
          compact
          expanded={showMoreOwners}
          labelWhenCollapsed={`More payers (${moreOwners.length})`}
          labelWhenExpanded="Fewer"
          onPress={() => setShowMoreOwners((v) => !v)}
        />
      ) : null}

      <View style={opsStyles.divider} />

      <OperationalChipSelect
        label="Payment mode"
        options={PAYMENT_MODE_OPTIONS}
        value={paymentMode}
        onChange={setPaymentMode}
        density="compact"
      />
      {expenseCategory === "fastag" && paymentMode === "fastag" ? (
        <Text style={opsStyles.metaHint}>
          Matched to FASTag — change only if paid another way.
        </Text>
      ) : (
        <Text style={opsStyles.metaHint}>
          Operational log — not a commercial adjustment.
        </Text>
      )}
    </Surface>
  );

  const detailsFields = (
    <View style={opsStyles.fieldStack}>
      <View>
        <Text style={opsStyles.fieldLabel}>Description (optional)</Text>
        <TextInput
          style={opsStyles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="What was this for?"
          placeholderTextColor={Theme.textMuted}
        />
      </View>
      <View style={isDesktop ? styles.desktopFieldRow : undefined}>
        <View style={isDesktop ? styles.desktopFieldCell : undefined}>
          <Text style={opsStyles.fieldLabel}>Location (optional)</Text>
          <TextInput
            style={opsStyles.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Plaza, yard, city"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
        <View style={isDesktop ? styles.desktopFieldCell : undefined}>
          <Text style={opsStyles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[opsStyles.input, opsStyles.notes]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Short note"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
      </View>
    </View>
  );

  const detailsBlock = (
    <Surface elevation={1} density="high" style={opsStyles.card}>
      {isDesktop ? (
        <>
          <Text style={styles.desktopSectionLabel}>Details</Text>
          {detailsFields}
        </>
      ) : (
        <>
          <RevealToggle
            compact
            expanded={showDetails || hasOptionalDetails}
            labelWhenCollapsed="Add details (optional)"
            labelWhenExpanded="Hide details"
            onPress={() => setShowDetails((v) => !v)}
          />
          {showDetails || hasOptionalDetails ? detailsFields : null}
        </>
      )}
    </Surface>
  );

  const receiptBlock = (
    <View style={opsStyles.photoWrap}>
      <ExpenseBillPhotoScan
        label="Expense Receipt"
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
  );

  const summaryCard = (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <CategoryIcon size={18} color={Theme.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryEyebrow}>Logging</Text>
        <Text style={styles.summaryTitle} numberOfLines={1}>
          {formatOtherExpenseCategoryLabel(expenseCategory)}
        </Text>
        <Text style={styles.summaryMeta} numberOfLines={1}>
          {ownerLabel} · {modeLabel}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, isDesktop && styles.screenDesktop]}>
      {saveFlash ? (
        <View style={[styles.saveToast, { top: insets.top + 8 }]} accessibilityRole="alert">
          <Check size={14} color={Theme.textOnPrimary} strokeWidth={2.6} />
          <Text style={styles.saveToastText}>{saveFlash}</Text>
        </View>
      ) : null}

      <OperationalHeader
        title={isEditing ? "Edit expense" : "Other expense"}
        subtitle={contextLine}
        onBack={leave}
        density={isDesktop ? "medium" : "high"}
      />

      <ScrollView
        style={opsStyles.scroll}
        contentContainerStyle={[
          isDesktop ? styles.desktopContent : opsStyles.content,
          { paddingBottom: insets.bottom + (isDesktop ? 96 : 76) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          <View style={styles.desktopShell}>
            <View style={styles.desktopIntro}>
              <Text style={styles.desktopTitle}>
                {isEditing ? "Update trip expense" : "Log trip expense"}
              </Text>
              <Text style={styles.desktopHint}>
                Capture amount, classify the cost, and attach a receipt — same flow as mobile,
                arranged for the desk.
              </Text>
            </View>

            <View style={styles.desktopGrid}>
              <View style={styles.desktopRail}>
                {amountBlock}
                {summaryCard}
                {receiptBlock}
              </View>
              <View style={styles.desktopMain}>
                {classifyBlock}
                {detailsBlock}
              </View>
            </View>
          </View>
        ) : (
          <>
            {amountBlock}
            {classifyBlock}
            {detailsBlock}
            {receiptBlock}
          </>
        )}
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={opsStyles.footer}>
          <OperationalButton
            intent="utility"
            label="Cancel"
            onPress={leave}
            density="high"
            disabled={saving || !!saveFlash}
            style={opsStyles.footerBtn}
          />
          <OperationalButton
            intent="bottomSticky"
            label={
              saving ? "Saving…" : isEditing ? "Save changes" : "Save expense"
            }
            onPress={handleSave}
            loading={saving}
            density="high"
            disabled={amountInr <= 0 || !!saveFlash}
            style={opsStyles.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
  },
  screenDesktop: {
    backgroundColor: Theme.analyticsCanvas,
  },
  desktopContent: {
    paddingHorizontal: 28,
    paddingTop: 20,
    alignItems: "center",
  },
  desktopShell: {
    width: "100%",
    maxWidth: 1080,
    gap: 18,
  },
  desktopIntro: {
    gap: 6,
    marginBottom: 4,
  },
  desktopTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: Theme.textBody,
    letterSpacing: -0.5,
  },
  desktopHint: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 20,
    maxWidth: 560,
  },
  desktopGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%",
  },
  desktopRail: {
    width: 360,
    flexShrink: 0,
    gap: 12,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  desktopFieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  desktopFieldCell: {
    flex: 1,
    minWidth: 0,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.brandBlueSoft,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textBody,
  },
  summaryMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  desktopSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  revealToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    minHeight: 36,
    paddingVertical: 4,
  },
  revealToggleCompact: {
    minHeight: 32,
    paddingVertical: 2,
  },
  revealToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  revealToggleTextCompact: {
    fontSize: 11,
  },
  driverDetailsStack: {
    gap: 10,
    marginTop: 6,
  },
  inlineError: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.teslaRed,
    lineHeight: 14,
  },
  saveToast: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Theme.darkGreen,
    shadowColor: Theme.textBody,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveToastText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
