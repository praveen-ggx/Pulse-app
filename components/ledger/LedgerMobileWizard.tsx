import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  Check,
  ChevronLeft,
  ChevronDown,
  Hash,
  Search,
  Truck,
} from "lucide-react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import { SmartInput } from "@/components/mobile-input";
import {
  OperationalBottomActionBar,
  OperationalButton,
} from "@/components/operational";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import { formatINR, formatLedgerAmountInput } from "@/lib/format";
import type { LedgerTripSettlementPreview } from "@/lib/ledgerTripSettlementPreview.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyMobileWizardStyles as shell } from "@/components/party/partyMobileWizardStyles";
import { LedgerReconSummaryCard } from "@/components/ledger/LedgerReconSummaryCard";
import { LedgerHeaderTripDetail } from "@/components/ledger/LedgerHeaderTripDetail";
import { LedgerTripSettlementNote } from "@/components/ledger/LedgerTripSettlementNote";
import { LedgerSettlementPctDock } from "@/components/ledger/LedgerSettlementPctDock";
import {
  isLedgerCashPaymentMode,
  LEDGER_PAYMENT_MODES,
  LedgerPaymentModeTile,
  LedgerPaymentTypeIcon,
  paymentModeHasWordmark,
  splitLedgerPaymentModes,
  type PaymentModeVisual,
} from "@/components/ledger/ledgerPaymentVisuals";
import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";
import { ledgerPaymentTypeVisual } from "@/components/ledger/paymentTypeVisuals.util";

export type LedgerWizardStep =
  | "direction"
  | "amount"
  | "amountPayment"
  | "party"
  | "trip"
  | "paymentType"
  | "paymentMode"
  | "paymentCapture"
  | "details"
  | "review";

export interface LedgerWizardPartyOption {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  entityType?: PartyEntityType;
  is_integrated?: boolean;
}

export interface LedgerWizardTripOption {
  id: string;
  trip_number: string;
  route_label?: string | null;
  trip_date?: string | null;
  client_name?: string | null;
  supplier_name?: string | null;
  /** Suggested settlement for current IN/OUT direction (party-scoped when applicable). */
  dueAmount?: number | null;
}

export interface LedgerPaymentTypeItem {
  key: string;
  label: string;
  kind: string;
  selected: boolean;
  onPress: () => void;
}

export interface LedgerMobileWizardProps {
  isEditMode: boolean;
  entryContextLabel?: string;
  type: "in" | "out";
  onTypeChange: (next: "in" | "out") => void;
  typeLocked?: boolean;
  amountStr: string;
  onAmountChange: (value: string) => void;
  amountPlaceholder: string;
  /** Numeric due for % quick-set when placeholder string is unavailable. */
  dueAmountInr?: number | null;
  partyId: string | null;
  onPartySelect: (id: string | null) => void;
  partyOptions: LedgerWizardPartyOption[];
  partyLocked: boolean;
  partyDisplayName?: string | null;
  partyAvatarUrl?: string | null;
  partyAvatarSeed?: string | null;
  partyEntityType?: PartyEntityType;
  partyIsIntegrated?: boolean;
  hidePartyStep?: boolean;
  submitting?: boolean;
  selectedTripId: string | null;
  onTripSelect: (id: string | null) => void;
  trips: LedgerWizardTripOption[];
  tripLocked: boolean;
  tripDisplay?: string | null;
  /** When true, pick trip before amount (party / entity context). */
  tripBeforeAmount?: boolean;
  /** Default trip list filter — entity flows use trips with outstanding due. */
  defaultTripDueFilter?: "all" | "has_due";
  paymentTypeItems: LedgerPaymentTypeItem[];
  showPaymentTypeStep: boolean;
  paymentModeId: string;
  onPaymentModeSelect: (id: string) => void;
  paymentTypeExpanded?: boolean;
  onPaymentTypeExpandedChange?: (open: boolean) => void;
  paymentModeExpanded?: boolean;
  onPaymentModeExpandedChange?: (open: boolean) => void;
  paymentReference: string;
  onPaymentReferenceChange: (value: string) => void;
  entryDate: string;
  onEntryDateChange: (iso: string) => void;
  reconRows: { label: string; value: string }[];
  reconAmountText: string;
  canSubmit: boolean;
  onSubmit: () => void;
  onClose: () => void;
  stepError?: string | null;
  /** Changes when parent re-opens the flow — resets step index. */
  flowSessionKey?: string;
  compact?: boolean;
  /** Trip ledger lines for duplicate-avoidance preview on amount + review steps. */
  tripLedgerPreview?: LedgerTripSettlementPreview | null;
  /** Full CN/DN + ledger split summary card when a trip is linked. */
  focusedTripCard?: ReactNode | null;
  /** Trip id + route shown in wizard header (hidden on focused card). */
  headerTripNumber?: string | null;
  headerTripRoute?: string | null;
  headerPartyName?: string | null;
  /**
   * Trip-detail capture: Category → Amount & payment (2 steps, matches desktop wizard).
   * Active when trip + party + direction are already known.
   */
  twoStepTripLockedFlow?: boolean;
  /**
   * Trip-detail mobile capture: Amount (settlement + partial %) → payment type/mode/UTR.
   */
  tripDirectTwoStepFlow?: boolean;
  /**
   * Mobile entity / party flows: after amount, use payment capture (type + mode + UTR)
   * instead of separate paymentType → paymentMode → details → review steps.
   */
  paymentCaptureAfterAmount?: boolean;
  /** Label for final authorize button on trip-direct step 2. */
  submitButtonLabel?: string;
  /** Parent hook when user clears trip to pick another (entity finance flows). */
  onChangeTripRequest?: () => void;
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDueAmount(placeholder: string): number {
  return parseAmount(placeholder || "0");
}

function resolveDueTotalInr(props: LedgerMobileWizardProps): number {
  const fromPlaceholder = parseDueAmount(props.amountPlaceholder);
  if (fromPlaceholder > 0) return fromPlaceholder;
  if (props.dueAmountInr != null && props.dueAmountInr > 0) return props.dueAmountInr;
  if (props.selectedTripId) {
    const trip = props.trips.find((t) => t.id === props.selectedTripId);
    if (trip?.dueAmount != null && trip.dueAmount > 0) return trip.dueAmount;
  }
  return 0;
}

function buildSteps(props: LedgerMobileWizardProps): LedgerWizardStep[] {
  if (props.tripDirectTwoStepFlow) {
    return ["amount", "paymentCapture"];
  }

  if (props.twoStepTripLockedFlow) {
    const steps: LedgerWizardStep[] = [];
    if (props.showPaymentTypeStep) steps.push("paymentType");
    steps.push("amountPayment");
    return steps;
  }

  if (props.paymentCaptureAfterAmount) {
    const steps: LedgerWizardStep[] = [];
    if (!props.typeLocked && !props.isEditMode) steps.push("direction");
    if (!props.partyLocked && !props.hidePartyStep) steps.push("party");
    if (props.tripBeforeAmount) {
      if (!props.tripLocked) steps.push("trip");
      steps.push("amount", "paymentCapture");
    } else {
      steps.push("amount", "paymentCapture");
      if (!props.tripLocked) steps.push("trip");
    }
    return steps;
  }

  const steps: LedgerWizardStep[] = [];
  if (!props.typeLocked && !props.isEditMode) steps.push("direction");
  if (!props.partyLocked && !props.hidePartyStep) steps.push("party");

  if (props.tripBeforeAmount) {
    if (!props.tripLocked) steps.push("trip");
    steps.push("amount");
  } else {
    steps.push("amount");
    if (!props.tripLocked) steps.push("trip");
  }

  if (props.showPaymentTypeStep) steps.push("paymentType");
  steps.push("paymentMode", "details", "review");
  return steps;
}

function resolveInitialStepIndex(
  steps: LedgerWizardStep[],
  props: LedgerMobileWizardProps,
): number {
  if (props.isEditMode) {
    const review = steps.indexOf("review");
    return review >= 0 ? review : 0;
  }
  if (props.tripDirectTwoStepFlow || props.twoStepTripLockedFlow) {
    return 0;
  }
  if (props.tripLocked && props.partyLocked && props.typeLocked) {
    const amountIdx = steps.indexOf("amount");
    if (amountIdx >= 0 && parseAmount(props.amountStr) <= 0) return amountIdx;
    const modeIdx = steps.indexOf("paymentMode");
    return modeIdx >= 0 ? modeIdx : amountIdx >= 0 ? amountIdx : 0;
  }
  if (props.partyLocked && props.typeLocked && !props.tripLocked) {
    const tripIdx = steps.indexOf("trip");
    if (tripIdx >= 0) return tripIdx;
  }
  return 0;
}

function stepMeta(step: LedgerWizardStep, props: LedgerMobileWizardProps) {
  switch (step) {
    case "direction":
      return {
        title: "Money in or out?",
        hint: "Choose whether you received cash or paid someone.",
      };
    case "amount": {
      const dueInr = resolveDueTotalInr(props);
      const settledOnTrip = props.tripLocked && dueInr <= 0;
      return {
        title: props.type === "in" ? "Amount received" : "Amount paid",
        hint: settledOnTrip
          ? props.type === "in"
            ? "Nothing due from the client on this trip."
            : "Nothing due to this party on this trip."
          : props.amountPlaceholder
            ? `Due: ₹${props.amountPlaceholder} — edit if needed`
            : "Enter the settlement amount.",
      };
    }
    case "party":
      return {
        title: "Who is this with?",
        hint: "Pick the customer, supplier, or driver.",
      };
    case "trip":
      return {
        title: "Which trip?",
        hint:
          props.defaultTripDueFilter === "has_due"
            ? "Trips with outstanding balance are shown first."
            : "Link this entry to a voyage (optional).",
      };
    case "amountPayment": {
      const dueInr = resolveDueTotalInr(props);
      return {
        title: "Amount & payment",
        hint:
          dueInr > 0 && props.amountPlaceholder
            ? `Due: ₹${props.amountPlaceholder} — enter amount and how it was paid.`
            : "Enter amount, payment mode, and date.",
      };
    }
    case "paymentType":
      return {
        title: props.twoStepTripLockedFlow
          ? "Category"
          : props.type === "in"
            ? "Payment type"
            : "Expense type",
        hint: props.twoStepTripLockedFlow
          ? "Choose the payment category for this trip."
          : "What kind of entry is this?",
      };
    case "paymentMode":
      return {
        title: "How was it paid?",
        hint: "UPI, FASTag, cash, or other.",
      };
    case "paymentCapture":
      return {
        title: "Payment details",
        hint: "Choose type, mode, and add a reference if needed.",
      };
    case "details":
      return {
        title: "Reference & date",
        hint: isLedgerCashPaymentMode(props.paymentModeId)
          ? "Confirm the entry date."
          : "Add UTR or reference if you have one.",
      };
    case "review":
      return {
        title: props.isEditMode ? "Review update" : "Confirm sync",
        hint: "Authorize this entry to post it to your books.",
      };
    default:
      return { title: "", hint: "" };
  }
}

function canAdvanceStep(step: LedgerWizardStep, props: LedgerMobileWizardProps): boolean {
  switch (step) {
    case "direction":
      return true;
    case "amount":
      return parseAmount(props.amountStr) > 0;
    case "amountPayment":
      return parseAmount(props.amountStr) > 0 && Boolean(props.paymentModeId);
    case "party":
      return props.partyLocked || props.partyId != null;
    case "trip":
      return true;
    case "paymentType":
      return props.paymentTypeItems.some((item) => item.selected);
    case "paymentMode":
      return Boolean(props.paymentModeId);
    case "paymentCapture": {
      const hasType =
        !props.showPaymentTypeStep || props.paymentTypeItems.some((item) => item.selected);
      return hasType && Boolean(props.paymentModeId);
    }
    case "details":
      return true;
    case "review":
      return props.canSubmit;
    default:
      return false;
  }
}

function formatDueCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-IN");
}

function shouldShowFocusedTripCard(
  step: LedgerWizardStep,
  props: LedgerMobileWizardProps,
): boolean {
  if (!props.selectedTripId || !props.focusedTripCard) return false;
  if (step === "trip") return props.tripLocked;
  return (
    step === "paymentType" ||
    step === "amount" ||
    step === "amountPayment" ||
    step === "review"
  );
}

function FocusedTripCardSection({
  card,
  compact,
  hideEyebrow,
}: {
  card: ReactNode;
  compact?: boolean;
  hideEyebrow?: boolean;
}) {
  return (
    <View style={[styles.focusedNodeSection, compact && styles.focusedNodeSectionCompact]}>
      {!hideEyebrow ? (
        <Text style={styles.focusedNodeEyebrow}>FOCUSED NODE</Text>
      ) : null}
      {card}
    </View>
  );
}

/** Single horizontal gutter for all mobile wizard screens. */
const PAGE_PAD = Layout.screenPaddingHorizontal;

/** Two-step amount → payment capture progress dots. */
const PAYMENT_PAIR_PROGRESS = [0, 1] as const;

/** Footer FAB + hint — keep list scroll end above this on mobile web. */
const WIZARD_FOOTER_CLEARANCE = 88;

export const LedgerMobileWizard = memo(function LedgerMobileWizard(props: LedgerMobileWizardProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useEffectiveBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  const compact = props.compact !== false;
  const sideBySideRefDate = windowWidth >= 360;
  const listBottomPad = bottomInset + WIZARD_FOOTER_CLEARANCE;
  const steps = useMemo(() => buildSteps(props), [props]);
  const [stepIndex, setStepIndex] = useState(() => resolveInitialStepIndex(steps, props));
  const [partySearch, setPartySearch] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const [tripDueFilter, setTripDueFilter] = useState<"all" | "has_due">(
    props.defaultTripDueFilter ?? "all",
  );

  const dueTotalInr = useMemo(() => resolveDueTotalInr(props), [props]);

  const amountPartyVisual = useMemo(() => {
    const fromOptions = props.partyId
      ? props.partyOptions.find((p) => p.id === props.partyId)
      : null;
    const name =
      props.partyDisplayName?.trim() ||
      fromOptions?.name?.trim() ||
      props.entryContextLabel?.trim() ||
      "Party";
    const entityType =
      props.partyEntityType ??
      fromOptions?.entityType ??
      (props.type === "in" ? "client" : "supplier");
    return {
      name,
      avatarUrl: props.partyAvatarUrl ?? fromOptions?.avatar_url ?? null,
      avatarSeed: props.partyAvatarSeed ?? fromOptions?.avatar_seed ?? null,
      entityType,
      isIntegrated: props.partyIsIntegrated ?? fromOptions?.is_integrated ?? false,
      contextLine:
        props.entryContextLabel?.trim() &&
        props.entryContextLabel.trim() !== name
          ? props.entryContextLabel.trim()
          : props.tripDisplay?.trim() || null,
    };
  }, [props]);

  const handleAmountChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(String(value).replace(/,/g, "").trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        props.onAmountChange("");
        return;
      }
      props.onAmountChange(formatLedgerAmountInput(parsed));
    },
    [props],
  );

  const lastSessionKeyRef = useRef(props.flowSessionKey ?? "");
  useEffect(() => {
    const key = props.flowSessionKey ?? "";
    if (key === lastSessionKeyRef.current) return;
    lastSessionKeyRef.current = key;
    setStepIndex(resolveInitialStepIndex(steps, props));
    setTripDueFilter(props.defaultTripDueFilter ?? "all");
    setPartySearch("");
    setTripSearch("");
  }, [props.flowSessionKey, props.defaultTripDueFilter, steps, props]);

  const currentStep = steps[stepIndex] ?? "review";
  const { title, hint } = stepMeta(currentStep, props);
  const canAdvance = canAdvanceStep(currentStep, props);
  const accent = props.type === "in" ? Theme.darkGreen : Theme.teslaRed;
  const usesPaymentCapturePair =
    props.tripDirectTwoStepFlow || props.paymentCaptureAfterAmount;
  const amountStepIndex = steps.indexOf("amount");
  const paymentCaptureStepIndex = steps.indexOf("paymentCapture");
  const inAmountPaymentPair =
    usesPaymentCapturePair &&
    amountStepIndex >= 0 &&
    paymentCaptureStepIndex === amountStepIndex + 1 &&
    (currentStep === "amount" || currentStep === "paymentCapture");

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return props.partyOptions;
    return props.partyOptions.filter((p) => p.name.toLowerCase().includes(q));
  }, [partySearch, props.partyOptions]);

  const tripsWithDueFilter = useMemo(() => {
    if (tripDueFilter === "all") return props.trips;
    return props.trips.filter((t) => (t.dueAmount ?? 0) > 0);
  }, [props.trips, tripDueFilter]);

  const filteredTrips = useMemo(() => {
    const q = tripSearch.trim().toLowerCase();
    if (!q) return tripsWithDueFilter;
    return tripsWithDueFilter.filter((t) => {
      const hay = [t.trip_number, t.route_label, t.client_name, t.supplier_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tripSearch, tripsWithDueFilter]);

  const handleBack = useCallback(() => {
    if (stepIndex <= 0) {
      props.onClose();
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }, [stepIndex, props]);

  const handleAdvance = useCallback(() => {
    if (
      currentStep === "review" ||
      currentStep === "amountPayment" ||
      currentStep === "paymentCapture"
    ) {
      if (props.canSubmit) props.onSubmit();
      return;
    }
    if (!canAdvance) return;
    const nextStep = steps[stepIndex + 1];
    if (currentStep === "amount" && nextStep === "paymentCapture") {
      if (props.paymentTypeItems.some((item) => item.selected)) {
        props.onPaymentTypeExpandedChange?.(false);
      }
      if (props.paymentModeId) {
        props.onPaymentModeExpandedChange?.(false);
      }
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [canAdvance, currentStep, props, steps, stepIndex]);

  const handleTripPick = useCallback(
    (id: string | null) => {
      props.onTripSelect(id);
      if (!id || currentStep !== "trip") return;
      const trip = props.trips.find((t) => t.id === id);
      const amountIdx = steps.indexOf("amount");
      if (amountIdx < 0) return;
      if ((trip?.dueAmount ?? 0) > 0 || props.tripBeforeAmount) {
        setStepIndex(amountIdx);
      }
    },
    [currentStep, props, steps],
  );

  const tripStepIndex = steps.indexOf("trip");
  const showChangeTrip =
    !props.tripLocked &&
    !!props.selectedTripId &&
    tripStepIndex >= 0 &&
    currentStep !== "trip";

  const handleChangeTrip = useCallback(() => {
    props.onChangeTripRequest?.();
    props.onTripSelect(null);
    if (tripStepIndex >= 0) {
      setStepIndex(tripStepIndex);
    }
  }, [props, tripStepIndex]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const entityTitle = props.isEditMode ? "Update ledger" : "Record payment";
  const mobileTripNumber =
    (props.headerTripNumber ?? props.tripDisplay ?? "").trim() || null;
  const mobileTripRoute = (props.headerTripRoute ?? "").trim() || null;
  const mobilePartyName =
    props.headerPartyName?.trim() ||
    props.entryContextLabel?.trim() ||
    props.partyDisplayName?.trim() ||
    null;
  const showMobileTripHeader = Boolean(
    compact &&
      (mobileTripNumber ||
        mobileTripRoute ||
        mobilePartyName ||
        props.tripLocked ||
        props.selectedTripId),
  );

  const renderAmountTopBar = () => {
    const hasHeaderContent = showMobileTripHeader || showChangeTrip;
    return (
      <View
        style={[
          styles.amountTopBar,
          hasHeaderContent && styles.amountTopBarWithDetail,
          { paddingTop: insets.top + 4 },
        ]}
      >
        <Pressable
          style={styles.amountBackBtn}
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
        </Pressable>
        {showMobileTripHeader ? (
          <View style={styles.amountTopBarDetail}>
            <LedgerHeaderTripDetail
              partyName={mobilePartyName}
              tripNumber={mobileTripNumber}
              routeLabel={mobileTripRoute}
              compact
              fill={false}
            />
          </View>
        ) : (
          <View style={styles.amountTopBarDetail} />
        )}
        {showChangeTrip ? (
          <Pressable
            style={styles.amountTopBarChangeTrip}
            onPress={handleChangeTrip}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change trip"
          >
            <Text style={styles.changeTripBtn}>Change trip</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderMobileTripHeader = () => {
    if (!showMobileTripHeader && !showChangeTrip) return null;
    return (
      <View style={styles.mobileTripHeaderBand}>
        <View style={styles.mobileTripHeaderRow}>
          {showMobileTripHeader ? (
            <View style={styles.mobileTripHeaderMain}>
              <LedgerHeaderTripDetail
                partyName={mobilePartyName}
                tripNumber={mobileTripNumber}
                routeLabel={mobileTripRoute}
                compact
                fill={false}
              />
            </View>
          ) : (
            <View style={styles.mobileTripHeaderMain} />
          )}
          {showChangeTrip ? (
            <Pressable
              onPress={handleChangeTrip}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Change trip"
            >
              <Text style={styles.changeTripBtn}>Change trip</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const twoStepLabel = inAmountPaymentPair
    ? currentStep === "amount"
      ? "Step 1 of 2 · Amount & settlement"
      : "Step 2 of 2 · Payment details"
    : props.twoStepTripLockedFlow && steps.length === 2
      ? `Step ${stepIndex + 1} of 2 · ${
          currentStep === "paymentType" ? "Category" : "Amount & payment"
        }`
      : null;
  const advanceLabel =
    inAmountPaymentPair && currentStep === "amount"
      ? "Continue to payment"
      : props.twoStepTripLockedFlow && currentStep === "paymentType"
      ? "Continue to amount"
      : currentStep === "review"
        ? props.isEditMode
          ? "Save Changes"
          : "Confirm Sync"
        : currentStep === "amountPayment"
          ? "Confirm Sync"
          : "Continue";

  const renderDirection = () => (
    <View style={styles.choiceCol}>
      <Pressable
        style={[styles.directionCard, props.type === "in" && styles.directionCardActiveIn]}
        onPress={() => props.onTypeChange("in")}
      >
        <View style={[styles.directionIcon, { backgroundColor: "#dcfce7" }]}>
          <ArrowDownLeft size={22} color={Theme.darkGreen} strokeWidth={2.4} />
        </View>
        <View style={styles.directionTextCol}>
          <Text style={styles.directionTitle}>Cash in</Text>
          <Text style={styles.directionSub}>Received</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.directionCard, props.type === "out" && styles.directionCardActiveOut]}
        onPress={() => props.onTypeChange("out")}
      >
        <View style={[styles.directionIcon, { backgroundColor: "#fee2e2" }]}>
          <ArrowUpRight size={22} color={Theme.teslaRed} strokeWidth={2.4} />
        </View>
        <View style={styles.directionTextCol}>
          <Text style={styles.directionTitle}>Cash out</Text>
          <Text style={styles.directionSub}>Paid</Text>
        </View>
      </Pressable>
    </View>
  );

  const renderFocusedTripCard = () => {
    if (!shouldShowFocusedTripCard(currentStep, props) || !props.focusedTripCard) return null;
    return (
      <FocusedTripCardSection
        card={props.focusedTripCard}
        compact={compact}
        hideEyebrow={showMobileTripHeader}
      />
    );
  };

  const renderAmount = (opts?: { embedded?: boolean }) => {
    const isIn = props.type === "in";
    const dueLabel = isIn ? "Total receivable" : "Total payable";
    const payLinePrefix = isIn ? "Receiving from" : "Paying";
    const showFocusedCard = shouldShowFocusedTripCard("amount", props) && !!props.focusedTripCard;
    const compactAmountLayout = showFocusedCard;

    const amountBody = (
      <>
        {showFocusedCard ? renderFocusedTripCard() : null}
        <View style={[styles.amountHeroStack, compactAmountLayout && styles.amountHeroStackTight]}>
          <View style={[styles.amountHeroCenter, compactAmountLayout && styles.amountHeroCenterTight]}>
            {!compactAmountLayout ? (
              <>
                <View style={styles.amountAvatarRing}>
                  <EntityAvatar
                    name={amountPartyVisual.name}
                    avatarUrl={amountPartyVisual.avatarUrl}
                    avatarSeed={amountPartyVisual.avatarSeed}
                    entityType={amountPartyVisual.entityType}
                    isIntegrated={amountPartyVisual.isIntegrated}
                    size={56}
                    showIntegrationBadge={false}
                  />
                </View>

                <Text style={styles.amountPayLine} numberOfLines={2}>
                  {payLinePrefix}{" "}
                  <Text style={styles.amountPayLineName}>{amountPartyVisual.name}</Text>
                </Text>

                {amountPartyVisual.contextLine ? (
                  <Text style={styles.amountContextLineCentered} numberOfLines={2}>
                    {amountPartyVisual.contextLine}
                  </Text>
                ) : null}
              </>
            ) : null}

            <View
              style={[
                styles.amountHeroInputWrap,
                compactAmountLayout && styles.amountHeroInputWrapTight,
              ]}
            >
              <SmartInput
                type="currency"
                value={parseAmount(props.amountStr)}
                onChange={(_, numeric) => {
                  handleAmountChange(formatLedgerAmountInput(numeric));
                }}
                label={isIn ? "Amount received" : "Amount paid"}
                submitLabel="Apply"
                variant="hero"
                density={compactAmountLayout ? "compact" : "default"}
                heroAccentColor={accent}
                placeholder="0"
                required={false}
                validation={{ min: 0, max: 100000000 }}
              />
            </View>

            {!showFocusedCard && props.tripLedgerPreview ? (
              <LedgerTripSettlementNote
                preview={props.tripLedgerPreview}
                enteredInr={parseAmount(props.amountStr)}
                compact
              />
            ) : !showFocusedCard && dueTotalInr > 0 ? (
              <View style={styles.amountDueChip}>
                <Text style={styles.amountDueChipLabel}>{dueLabel}</Text>
                <Text style={[styles.amountDueChipValue, { color: accent }]}>
                  {formatINR(dueTotalInr)}
                </Text>
              </View>
            ) : !showFocusedCard && props.tripLocked ? (
              <View style={styles.amountSettledChip}>
                <Text style={styles.amountSettledChipTitle}>Nothing due</Text>
                <Text style={styles.amountSettledChipSub}>
                  {isIn
                    ? "This trip has no outstanding client balance. You can still record a payment or correction."
                    : "This trip has no outstanding balance for this party. You can still record a payout or correction."}
                </Text>
              </View>
            ) : !showFocusedCard ? (
              <Text style={styles.amountMetaHintCentered}>
                Enter the settlement amount for this entry.
              </Text>
            ) : null}
          </View>
        </View>
      </>
    );

    if (opts?.embedded) {
      return amountBody;
    }

    return (
      <ScrollView
        style={styles.amountScroll}
        contentContainerStyle={[
          styles.amountScrollContent,
          showFocusedCard && styles.amountScrollContentWithFocused,
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {amountBody}
      </ScrollView>
    );
  };

  const renderAmountFullPage = () => {
    return (
      <View style={styles.amountFullPage}>
        {renderAmountTopBar()}
        {inAmountPaymentPair && currentStep === "amount" ? (
          <View style={styles.tripDirectStepBand}>
            <View style={styles.tripDirectProgressRow}>
              {PAYMENT_PAIR_PROGRESS.map((i) => (
                <View
                  key={i}
                  style={[
                    styles.tripDirectProgressDot,
                    i === 0 && styles.tripDirectProgressDotActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.twoStepFlowLabel}>Step 1 of 2 · Amount & settlement</Text>
          </View>
        ) : null}
        <ScrollView
          style={styles.amountFullPageScroll}
          contentContainerStyle={styles.amountFullPageScrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {renderAmount({ embedded: true })}
          <View style={styles.amountPctDockInline}>
            <LedgerSettlementPctDock
              dueTotalInr={dueTotalInr}
              amountStr={props.amountStr}
              onAmountChange={handleAmountChange}
              accentColor={accent}
              variant="light"
              compact
            />
          </View>
        </ScrollView>
        <OperationalBottomActionBar>
          <OperationalButton
            intent="bottomSticky"
            label={advanceLabel}
            onPress={handleAdvance}
            disabled={!canAdvance}
            density="high"
            fullWidth
          />
        </OperationalBottomActionBar>
      </View>
    );
  };

  const renderPartyAvatar = (
    item: LedgerWizardPartyOption,
    selected: boolean,
    size = 36,
  ) => (
    <EntityAvatar
      name={item.name}
      avatarUrl={item.avatar_url}
      avatarSeed={item.avatar_seed}
      entityType={item.entityType ?? "client"}
      isIntegrated={item.is_integrated}
      size={size}
      showIntegrationBadge={false}
    />
  );

  const renderParty = () => (
    <View style={styles.listPane}>
      <View style={styles.searchRow}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          value={partySearch}
          onChangeText={setPartySearch}
          placeholder="Search party…"
          placeholderTextColor={Theme.textMuted}
        />
      </View>
      <FlatList
        data={filteredParties}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No parties match your search.</Text>
        }
        renderItem={({ item }) => {
          const selected = props.partyId === item.id;
          return (
            <Pressable
              style={[styles.listRow, selected && styles.listRowActive]}
              onPress={() => props.onPartySelect(item.id)}
            >
              {renderPartyAvatar(item, selected) ?? (
                <View style={[styles.listAvatar, selected && { backgroundColor: accent }]}>
                  <Text style={[styles.listAvatarText, selected && { color: "#fff" }]}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.listRowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {selected ? <Check size={16} color={accent} strokeWidth={2.8} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );

  const renderTripFilters = () => (
    <View style={styles.filterRow}>
      {(
        [
          { id: "has_due" as const, label: "With due" },
          { id: "all" as const, label: "All trips" },
        ] as const
      ).map((opt) => {
        const on = tripDueFilter === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={[styles.filterChip, on && styles.filterChipActive]}
            onPress={() => setTripDueFilter(opt.id)}
          >
            <Text style={[styles.filterChipText, on && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderLockedParty = () => (
    <View style={styles.lockedCard}>
      <Text style={styles.lockedLabel}>Party</Text>
      <View style={styles.lockedPartyRow}>
        <EntityAvatar
          name={props.partyDisplayName ?? "—"}
          avatarUrl={props.partyAvatarUrl}
          avatarSeed={props.partyAvatarSeed}
          entityType={props.partyEntityType ?? "client"}
          isIntegrated={props.partyIsIntegrated}
          size={40}
          showIntegrationBadge={false}
        />
        <Text style={styles.lockedValue} numberOfLines={2}>
          {props.partyDisplayName ?? "—"}
        </Text>
      </View>
    </View>
  );

  const renderTrip = () => (
    <View style={styles.listPane}>
      {renderTripFilters()}
      <View style={styles.searchRow}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          value={tripSearch}
          onChangeText={setTripSearch}
          placeholder="Search trip or route…"
          placeholderTextColor={Theme.textMuted}
        />
      </View>
      <FlatList
        data={filteredTrips}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="always"
        ListHeaderComponent={
          <Pressable
            style={[
              styles.listRow,
              props.selectedTripId == null && styles.listRowActive,
            ]}
            onPress={() => handleTripPick(null)}
          >
            <View style={[styles.listAvatar, { backgroundColor: "#f1f5f9" }]}>
              <Text style={styles.listAvatarText}>—</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.listRowTitle}>No trip</Text>
              <Text style={styles.listRowSub}>General entry</Text>
            </View>
            {props.selectedTripId == null ? (
              <Check size={16} color={accent} strokeWidth={2.8} />
            ) : null}
          </Pressable>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {tripDueFilter === "has_due"
              ? "No trips with due for this party."
              : "No trips match your search."}
          </Text>
        }
        renderItem={({ item }) => {
          const selected = props.selectedTripId === item.id;
          const due = item.dueAmount ?? 0;
          return (
            <Pressable
              style={[styles.listRow, selected && styles.listRowActive]}
              onPress={() => handleTripPick(item.id)}
            >
              <View style={[styles.listAvatar, selected && { backgroundColor: accent }]}>
                <Text style={[styles.listAvatarText, selected && { color: "#fff" }]}>
                  {(item.trip_number || "T").slice(0, 1)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.listRowTitle} numberOfLines={1}>
                  {item.trip_number}
                </Text>
                <Text style={styles.listRowSub} numberOfLines={1}>
                  {[item.route_label, item.trip_date].filter(Boolean).join(" · ") || "Trip"}
                </Text>
              </View>
              {due > 0 ? (
                <View style={[styles.duePill, { borderColor: accent }]}>
                  <Text style={[styles.duePillText, { color: accent }]}>
                    ₹{formatDueCompact(due)}
                  </Text>
                </View>
              ) : null}
              {selected ? <Check size={16} color={accent} strokeWidth={2.8} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );

  const renderPaymentType = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridPad}>
      <View style={styles.iconGrid}>
        {props.paymentTypeItems.map((item) => {
          const selected = item.selected;
          const visual = ledgerPaymentTypeVisual(item.kind);
          return (
            <Pressable
              key={item.key}
              style={[
                styles.typeTile,
                selected && { borderColor: visual.color, backgroundColor: visual.tint },
              ]}
              onPress={item.onPress}
            >
              <View style={styles.typeIconWrap}>
                <LedgerPaymentTypeIcon kind={item.kind} size={36} />
              </View>
              <Text
                style={[
                  styles.typeTileLabel,
                  selected && { color: visual.color },
                ]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderModeTile = (mode: PaymentModeVisual) => {
    const selected = props.paymentModeId === mode.id;
    const hideLabel = paymentModeHasWordmark(mode.id);
    return (
      <Pressable
        key={mode.id}
        style={[
          styles.modeTileEqual,
          selected && { borderColor: mode.color, backgroundColor: mode.tint },
        ]}
        onPress={() => props.onPaymentModeSelect(mode.id)}
        accessibilityRole="button"
        accessibilityLabel={mode.label}
        accessibilityState={{ selected }}
      >
        <LedgerPaymentModeTile modeId={mode.id} selected={selected} />
        {hideLabel ? null : (
          <Text
            style={[styles.modeTileLabel, selected && { color: mode.color }]}
            numberOfLines={1}
          >
            {mode.shortLabel}
          </Text>
        )}
      </Pressable>
    );
  };

  const renderPaymentModeRows = () => {
    const { core, extra } = splitLedgerPaymentModes(LEDGER_PAYMENT_MODES);
    return (
      <View style={styles.modeRows}>
        <View style={styles.modeTileRow}>{core.map(renderModeTile)}</View>
        {extra.length > 0 ? (
          <View style={styles.modeTileRow}>{extra.map(renderModeTile)}</View>
        ) : null}
      </View>
    );
  };

  const renderPaymentMode = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridPad}>
      {renderPaymentModeRows()}
    </ScrollView>
  );

  const renderDetailsFields = () => {
    const referenceField = (
      <View style={[shell.fieldBlock, sideBySideRefDate && styles.refDateHalf]}>
        <Text style={shell.fieldLabel}>REFERENCE / UTR</Text>
        <TextInput
          style={[shell.input, compact && styles.inputCompact]}
          value={props.paymentReference}
          onChangeText={props.onPaymentReferenceChange}
          placeholder={
            isLedgerCashPaymentMode(props.paymentModeId)
              ? "UTR or bank reference (optional)"
              : "NEFT / UPI / bank reference"
          }
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="characters"
        />
      </View>
    );
    const dateField = (
      <View style={[shell.fieldBlock, sideBySideRefDate && styles.refDateHalf]}>
        <Text style={shell.fieldLabel}>PAID ON</Text>
        <View style={styles.dateRow}>
          {[
            { label: "Today", iso: todayIso },
            { label: "Yesterday", iso: yesterdayIso },
          ].map((opt) => {
            const selected = props.entryDate === opt.iso;
            return (
              <Pressable
                key={opt.iso}
                style={[styles.dateChip, selected && styles.dateChipActive]}
                onPress={() => props.onEntryDateChange(opt.iso)}
              >
                <Calendar
                  size={12}
                  color={selected ? Theme.primary : Theme.textMuted}
                  strokeWidth={2.2}
                />
                <Text style={[styles.dateChipText, selected && styles.dateChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
    return sideBySideRefDate ? (
      <View style={styles.refDateRow}>
        {referenceField}
        {dateField}
      </View>
    ) : (
      <>
        {referenceField}
        {dateField}
      </>
    );
  };

  const renderPaymentCapture = () => {
    const selectedTypeItem = props.paymentTypeItems.find((item) => item.selected);
    const selectedTypeLabel = selectedTypeItem?.label ?? "";
    const selectedMode = LEDGER_PAYMENT_MODES.find((mode) => mode.id === props.paymentModeId);
    const typeStripOpen = props.onPaymentTypeExpandedChange
      ? (props.paymentTypeExpanded ?? true)
      : true;
    const modeStripOpen = props.onPaymentModeExpandedChange
      ? (props.paymentModeExpanded ?? true)
      : true;
    const typeCollapsed =
      Boolean(props.onPaymentTypeExpandedChange) &&
      !typeStripOpen &&
      Boolean(selectedTypeLabel);
    const modeCollapsed =
      Boolean(props.onPaymentModeExpandedChange) &&
      !modeStripOpen &&
      Boolean(props.paymentModeId);

    const renderCaptureSummary = (
      summary: ReactNode,
      label: string,
      onExpand: () => void,
    ) => (
      <Pressable
        style={styles.captureSummaryCard}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`Change ${label}`}
      >
        <View style={styles.captureSummaryMain}>{summary}</View>
        <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.4} />
      </Pressable>
    );

    return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.paymentCaptureScroll}
    >
      {props.showPaymentTypeStep ? (
        <View style={styles.captureSectionCard}>
          <View style={styles.captureSectionHead}>
            <View style={[styles.captureSectionIcon, styles.captureSectionIconType]}>
              <Truck size={15} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.captureSectionHeadText}>
              <Text style={styles.captureSectionEyebrow}>
                {props.type === "in" ? "Payment type" : "Expense type"}
              </Text>
              {!typeCollapsed ? (
                <Text style={styles.captureSectionHint}>What kind of entry is this?</Text>
              ) : null}
            </View>
            {typeCollapsed ? (
              <Pressable
                style={styles.captureChangeBtn}
                onPress={() => props.onPaymentTypeExpandedChange?.(true)}
                accessibilityRole="button"
                accessibilityLabel="Change payment type"
              >
                <Text style={styles.captureChangeBtnText}>Change</Text>
              </Pressable>
            ) : null}
          </View>
          {typeCollapsed ? (
            renderCaptureSummary(
              <>
                <View style={styles.captureSummaryIcon}>
                  <LedgerPaymentTypeIcon kind={selectedTypeItem?.kind ?? ""} size={22} />
                </View>
                <Text style={styles.captureSummaryText} numberOfLines={2}>
                  {selectedTypeLabel}
                </Text>
              </>,
              "payment type",
              () => props.onPaymentTypeExpandedChange?.(true),
            )
          ) : (
            <View style={styles.iconGrid}>
              {props.paymentTypeItems.map((item) => {
                const selected = item.selected;
                const visual = ledgerPaymentTypeVisual(item.kind);
                return (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.typeTile,
                      selected && { borderColor: visual.color, backgroundColor: visual.tint },
                    ]}
                    onPress={item.onPress}
                  >
                    <View style={styles.typeIconWrap}>
                      <LedgerPaymentTypeIcon kind={item.kind} size={36} />
                    </View>
                    <Text
                      style={[styles.typeTileLabel, selected && { color: visual.color }]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.captureSectionCard}>
        <View style={styles.captureSectionHead}>
          <View style={[styles.captureSectionIcon, styles.captureSectionIconMode]}>
            <Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />
          </View>
          <View style={styles.captureSectionHeadText}>
            <Text style={styles.captureSectionEyebrow}>Payment mode</Text>
            {!modeCollapsed ? (
              <Text style={styles.captureSectionHint}>How this money moved</Text>
            ) : null}
          </View>
          {modeCollapsed ? (
            <Pressable
              style={styles.captureChangeBtn}
              onPress={() => props.onPaymentModeExpandedChange?.(true)}
              accessibilityRole="button"
              accessibilityLabel="Change payment mode"
            >
              <Text style={styles.captureChangeBtnText}>Change</Text>
            </Pressable>
          ) : null}
        </View>
        {modeCollapsed ? (
          renderCaptureSummary(
            <>
              <View style={styles.captureSummaryIcon}>
                <PaymentModeLogo modeId={props.paymentModeId} size={22} />
              </View>
              <Text style={styles.captureSummaryText} numberOfLines={1}>
                {selectedMode?.shortLabel ?? selectedMode?.label ?? "Payment mode"}
              </Text>
            </>,
            "payment mode",
            () => props.onPaymentModeExpandedChange?.(true),
          )
        ) : (
          renderPaymentModeRows()
        )}
      </View>

      <View
        style={[
          styles.captureSectionCard,
          sideBySideRefDate && styles.captureRefDateCard,
        ]}
      >
        <View style={sideBySideRefDate ? styles.captureRefDateCol : undefined}>
          <View style={styles.captureSectionHead}>
            <View style={[styles.captureSectionIcon, styles.captureSectionIconRef]}>
              <Hash size={15} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.captureSectionHeadText}>
              <Text style={styles.captureSectionEyebrow}>Reference / UTR</Text>
              <Text style={styles.captureSectionHint}>
                {isLedgerCashPaymentMode(props.paymentModeId)
                  ? "Optional for cash payments"
                  : "NEFT / UPI / bank transaction reference"}
              </Text>
            </View>
          </View>
          <TextInput
            style={styles.captureReferenceInput}
            value={props.paymentReference}
            onChangeText={props.onPaymentReferenceChange}
            placeholder={
              isLedgerCashPaymentMode(props.paymentModeId)
                ? "UTR or reference (optional)"
                : "Enter UTR or bank reference"
            }
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <View style={sideBySideRefDate ? styles.captureRefDateCol : styles.capturePaidOnBlock}>
          <Text style={styles.captureSectionEyebrow}>Paid on</Text>
          <View style={styles.dateRow}>
            {[
              { label: "Today", iso: todayIso },
              { label: "Yesterday", iso: yesterdayIso },
            ].map((opt) => {
              const selected = props.entryDate === opt.iso;
              return (
                <Pressable
                  key={opt.iso}
                  style={[styles.dateChip, selected && styles.dateChipActive]}
                  onPress={() => props.onEntryDateChange(opt.iso)}
                >
                  <Calendar
                    size={12}
                    color={selected ? Theme.primary : Theme.textMuted}
                    strokeWidth={2.2}
                  />
                  <Text style={[styles.dateChipText, selected && styles.dateChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
    );
  };

  const renderAmountPayment = () => {
    const isIn = props.type === "in";
    const dueLabel = isIn ? "Total receivable" : "Total payable";

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.amountPaymentScroll}
      >
        <View style={styles.amountPaymentSection}>
          <Text style={styles.amountPaymentSectionLabel}>
            {isIn ? "Amount received" : "Amount paid"}
          </Text>
          <View style={styles.amountPaymentInputWrap}>
            <SmartInput
              type="currency"
              value={parseAmount(props.amountStr)}
              onChange={(_, numeric) => {
                handleAmountChange(formatLedgerAmountInput(numeric));
              }}
              label={isIn ? "Amount" : "Amount"}
              submitLabel="Apply"
              variant="field"
              placeholder="0"
              required={false}
              validation={{ min: 0, max: 100000000 }}
            />
          </View>
          {dueTotalInr > 0 ? (
            <View style={styles.amountDueChip}>
              <Text style={styles.amountDueChipLabel}>{dueLabel}</Text>
              <Text style={[styles.amountDueChipValue, { color: accent }]}>
                {formatINR(dueTotalInr)}
              </Text>
            </View>
          ) : null}
          {dueTotalInr > 0 ? (
            <LedgerSettlementPctDock
              dueTotalInr={dueTotalInr}
              amountStr={props.amountStr}
              onAmountChange={handleAmountChange}
              accentColor={accent}
              variant="light"
            />
          ) : null}
        </View>

        <View style={styles.amountPaymentSection}>
          <Text style={styles.amountPaymentSectionLabel}>How was it paid?</Text>
          {renderPaymentModeRows()}
        </View>

        <View style={styles.amountPaymentSection}>{renderDetailsFields()}</View>
      </ScrollView>
    );
  };

  const renderDetails = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {renderDetailsFields()}
    </ScrollView>
  );

  const renderReview = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reviewScroll}>
      {props.tripLedgerPreview ? (
        <View style={styles.reviewLedgerNoteWrap}>
          <LedgerTripSettlementNote
            preview={props.tripLedgerPreview}
            enteredInr={parseAmount(props.amountStr)}
          />
        </View>
      ) : null}
      <LedgerReconSummaryCard
        amountText={props.reconAmountText}
        direction={props.type}
        rows={props.reconRows}
        isEditMode={props.isEditMode}
        phase="review"
        variant="flat"
      />
    </ScrollView>
  );

  const body = (() => {
    switch (currentStep) {
      case "direction":
        return renderDirection();
      case "amount":
        return renderAmount();
      case "amountPayment":
        return renderAmountPayment();
      case "party":
        return props.partyLocked ? renderLockedParty() : renderParty();
      case "trip":
        return props.tripLocked ? (
          renderFocusedTripCard() ?? (
            <View style={styles.lockedCard}>
              <Text style={styles.lockedLabel}>Trip</Text>
              <Text style={styles.lockedValue}>{props.tripDisplay ?? "—"}</Text>
            </View>
          )
        ) : (
          renderTrip()
        );
      case "paymentType":
        return renderPaymentType();
      case "paymentMode":
        return renderPaymentMode();
      case "paymentCapture":
        return renderPaymentCapture();
      case "details":
        return renderDetails();
      case "review":
        return renderReview();
      default:
        return null;
    }
  })();

  const c = compact ? compactShell : shell;

  if (currentStep === "amount" && (!props.twoStepTripLockedFlow || props.tripDirectTwoStepFlow)) {
    return (
      <View style={[styles.amountFullPageShell, styles.wizardRoot]}>
        {renderAmountFullPage()}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[c.root, styles.wizardRoot]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[c.root, styles.wizardRoot, { paddingTop: insets.top }]}>
        <View style={[c.topBar, compact && styles.topBarCompact]}>
          <Pressable style={c.backBtn} onPress={handleBack} hitSlop={12}>
            <ChevronLeft size={20} color="#0f172a" strokeWidth={2.5} />
          </Pressable>
          <View style={styles.mobileHeaderCenter}>
            <View style={c.progressRow}>
              {inAmountPaymentPair && currentStep === "paymentCapture" ? (
                PAYMENT_PAIR_PROGRESS.map((i) => (
                  <View
                    key={i}
                    style={[
                      c.progressDot,
                      c.progressDotActive,
                      compact && styles.progressDotActiveCompact,
                    ]}
                  />
                ))
              ) : (
                steps.map((id, i) => (
                  <View
                    key={id}
                    style={[
                      c.progressDot,
                      i <= stepIndex && c.progressDotActive,
                      compact && i <= stepIndex && styles.progressDotActiveCompact,
                    ]}
                  />
                ))
              )}
            </View>
          </View>
          <View style={c.backBtnSpacer} />
        </View>

        {renderMobileTripHeader()}

        {!compact ? (
          <View style={c.hero}>
            <View style={c.titleRow}>
              <View style={c.liveDot} />
              <Text style={c.entityTitle}>{entityTitle}</Text>
            </View>
            {props.entryContextLabel ? (
              <Text style={c.subtitle} numberOfLines={2}>
                {props.entryContextLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {props.stepError ? (
          <View style={[c.errorBar, compact && styles.errorBarCompact]}>
            <Text style={c.errorText}>{props.stepError}</Text>
          </View>
        ) : null}

        <View
          style={[
            c.body,
            compact && styles.bodyCompact,
            currentStep === "party" || currentStep === "trip" ? styles.bodyFlex : null,
          ]}
        >
          {currentStep !== "amount" && currentStep !== "paymentCapture"
            ? renderFocusedTripCard()
            : null}
          <View style={[styles.stepHeader, currentStep === "review" && styles.stepHeaderReview]}>
            {compact ? (
              <View style={styles.compactContext}>
                {!showMobileTripHeader ? (
                  <>
                    <View style={c.titleRow}>
                      <View style={c.liveDot} />
                      <Text style={styles.entityTitleCompact}>{entityTitle}</Text>
                    </View>
                    {props.entryContextLabel ? (
                      <Text style={styles.subtitleCompact} numberOfLines={1}>
                        {props.entryContextLabel}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
            {currentStep !== "review" &&
            !(usesPaymentCapturePair && currentStep === "paymentCapture") ? (
              <Text style={[c.stepTitle, compact && styles.stepTitleCompact]}>{title}</Text>
            ) : currentStep === "review" ? (
              <Text style={[c.stepTitle, compact && styles.stepTitleCompact]}>Confirm sync</Text>
            ) : null}
            {twoStepLabel ? (
              <Text style={styles.twoStepFlowLabel}>{twoStepLabel}</Text>
            ) : null}
            {hint &&
            currentStep !== "review" &&
            !(usesPaymentCapturePair && currentStep === "paymentCapture") ? (
              <Text style={[c.stepHint, compact && styles.stepHintCompact]}>{hint}</Text>
            ) : currentStep === "review" ? (
              <Text style={[c.stepHint, compact && styles.stepHintCompact]}>
                Authorize this entry to post it to your books.
              </Text>
            ) : null}
          </View>
          {body}
        </View>

        <View
          style={[
            c.footer,
            compact && styles.footerCompact,
            styles.footerAboveBrowserChrome,
            { paddingBottom: bottomInset + 12 },
          ]}
        >
          {currentStep === "review" ||
          currentStep === "amountPayment" ||
          currentStep === "paymentCapture" ? (
            usesPaymentCapturePair && currentStep === "paymentCapture" ? (
              <View style={styles.twoStepFooterRow}>
                <Pressable
                  style={styles.twoStepFooterBackBtn}
                  onPress={() => setStepIndex(amountStepIndex >= 0 ? amountStepIndex : 0)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to amount"
                >
                  <ChevronLeft size={18} color={LedgerSyncPalette.ink} strokeWidth={2.5} />
                  <Text style={styles.twoStepFooterBackText}>Amount</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmSyncBtn,
                    styles.twoStepFooterSubmit,
                    (!props.canSubmit || props.submitting || !canAdvance) &&
                      styles.confirmSyncBtnDisabled,
                  ]}
                  onPress={handleAdvance}
                  disabled={!props.canSubmit || props.submitting || !canAdvance}
                >
                  <Text style={styles.confirmSyncBtnText}>
                    {props.submitting
                      ? "Authorizing…"
                      : props.submitButtonLabel ?? "Authorize Financial Sync"}
                  </Text>
                </Pressable>
              </View>
            ) : props.twoStepTripLockedFlow && currentStep === "amountPayment" ? (
              <View style={styles.twoStepFooterRow}>
                <Pressable
                  style={styles.twoStepFooterBackBtn}
                  onPress={() => setStepIndex(0)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to category"
                >
                  <ChevronLeft size={18} color={LedgerSyncPalette.ink} strokeWidth={2.5} />
                  <Text style={styles.twoStepFooterBackText}>Category</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmSyncBtn,
                    styles.twoStepFooterSubmit,
                    (!props.canSubmit || props.submitting || !canAdvance) &&
                      styles.confirmSyncBtnDisabled,
                  ]}
                  onPress={handleAdvance}
                  disabled={!props.canSubmit || props.submitting || !canAdvance}
                >
                  <Text style={styles.confirmSyncBtnText}>
                    {props.submitting ? "Authorizing…" : "Confirm Sync"}
                  </Text>
                </Pressable>
              </View>
            ) : (
            <Pressable
              style={[
                styles.confirmSyncBtn,
                (!props.canSubmit || props.submitting) && styles.confirmSyncBtnDisabled,
              ]}
              onPress={handleAdvance}
              disabled={!props.canSubmit || props.submitting}
            >
              <Text style={styles.confirmSyncBtnText}>
                {props.submitting
                  ? "Authorizing…"
                  : props.isEditMode
                    ? "Save Changes"
                    : "Confirm Sync"}
              </Text>
            </Pressable>
            )
          ) : (
            <>
              <Pressable
                style={[c.fab, compact && styles.fabCompact, !canAdvance && c.fabDisabled]}
                onPress={handleAdvance}
                disabled={!canAdvance}
              >
                <ArrowRight size={20} color="#fff" strokeWidth={2.8} />
              </Pressable>
              <Text style={[c.footerHint, compact && styles.footerHintCompact]}>{advanceLabel}</Text>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
});

const compactShell = {
  ...shell,
  root: { ...shell.root, width: "100%", alignSelf: "stretch" },
  topBar: { ...shell.topBar, paddingHorizontal: PAGE_PAD, paddingBottom: 4 },
  body: {
    ...shell.body,
    paddingHorizontal: PAGE_PAD,
    paddingTop: 0,
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  footer: { ...shell.footer, paddingHorizontal: PAGE_PAD, paddingTop: 4 },
  stepTitle: { ...shell.stepTitle, fontSize: 20 },
  stepHint: { ...shell.stepHint, marginBottom: 0, fontSize: 12, lineHeight: 17 },
};

const styles = StyleSheet.create({
  wizardRoot: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  stepHeader: {
    marginBottom: 10,
    gap: 4,
  },
  stepHeaderReview: {
    marginBottom: 8,
  },
  compactContext: {
    gap: 2,
    marginBottom: 4,
  },
  bodyFlex: {
    flex: 1,
    minHeight: 0,
  },
  listPane: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 12,
    gap: 6,
  },
  reviewScroll: {
    paddingBottom: 8,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  reviewLedgerNoteWrap: {
    marginBottom: 10,
  },
  focusedNodeSection: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    marginBottom: 12,
    gap: 6,
  },
  focusedNodeSectionCompact: {
    marginBottom: 6,
    gap: 4,
  },
  focusedNodeEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: LedgerSyncPalette.indigo,
    alignSelf: "flex-start",
  },
  mobileHeaderCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  mobileTripHeaderBand: {
    width: "100%",
    paddingHorizontal: PAGE_PAD,
    paddingTop: 2,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LedgerSyncPalette.border,
    backgroundColor: Theme.cardWhite,
  },
  mobileTripHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  mobileTripHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  changeTripBtn: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.indigo,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    paddingTop: 2,
    flexShrink: 0,
  },
  mobileHeaderParty: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    textAlign: "center",
    width: "100%",
  },
  tripLockedPane: {
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  errorBarCompact: {
    marginHorizontal: PAGE_PAD,
    marginBottom: 6,
  },
  topBarCompact: { paddingHorizontal: PAGE_PAD, paddingBottom: 2 },
  bodyCompact: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: 0,
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  footerCompact: { paddingHorizontal: PAGE_PAD, paddingTop: 2 },
  footerAboveBrowserChrome: Platform.select({
    web: {
      flexShrink: 0,
      backgroundColor: "#fff",
    },
    default: {},
  }),
  entityTitleCompact: { fontSize: 10, letterSpacing: 1.4 },
  subtitleCompact: { fontSize: 12, marginTop: 4 },
  stepTitleCompact: { fontSize: 20, letterSpacing: -0.3 },
  stepHintCompact: { fontSize: 12, marginBottom: 0, lineHeight: 17 },
  progressDotActiveCompact: { width: 18, height: 6, borderRadius: 3 },
  fabCompact: { width: 48, height: 48, borderRadius: 24 },
  footerHintCompact: { fontSize: 9 },
  inputCompact: {
    fontSize: 15,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  },
  choiceCol: { gap: 8 },
  directionCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  directionCardActiveIn: {
    borderColor: Theme.darkGreen,
    backgroundColor: "#f0fdf4",
  },
  directionCardActiveOut: {
    borderColor: Theme.teslaRed,
    backgroundColor: "#fef2f2",
  },
  directionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  directionTextCol: { flex: 1, minWidth: 0 },
  directionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  directionSub: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 2,
  },
  amountBlock: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    minHeight: 52,
  },
  amountFullPageShell: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
  },
  amountFullPage: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
  },
  amountFullPageBody: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
  },
  amountFullPageScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
  },
  amountFullPageScrollContent: {
    flexGrow: 1,
    paddingHorizontal: PAGE_PAD,
    paddingTop: 6,
    paddingBottom: 8,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    gap: 8,
  },
  amountScroll: {
    flex: 1,
  },
  amountScrollContent: {
    flexGrow: 1,
    paddingHorizontal: PAGE_PAD,
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "stretch",
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  amountScrollContentWithFocused: {
    gap: 8,
  },
  amountPctDock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    backgroundColor: Theme.screenBackground,
  },
  amountPctDockInline: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    paddingBottom: 4,
  },
  amountHeroStack: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  amountHeroStackTight: {
    marginTop: -2,
  },
  amountHeroCenter: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    alignSelf: "stretch",
    minWidth: 0,
  },
  amountHeroCenterTight: {
    gap: 4,
  },
  amountMinimalTop: {
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 4,
    width: "100%",
  },
  amountTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 8,
    width: "100%",
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
  },
  amountTopBarWithDetail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LedgerSyncPalette.border,
  },
  amountTopBarDetail: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  amountTopBarChangeTrip: {
    flexShrink: 0,
    alignSelf: "center",
    maxWidth: 88,
  },
  amountBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  amountAvatarRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#eef2f7",
    marginBottom: 4,
    alignSelf: "center",
  },
  amountPayLine: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  amountPayLineName: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  amountContextLineCentered: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
    paddingHorizontal: 12,
    marginTop: -4,
  },
  amountHeroInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 8,
    marginBottom: 4,
  },
  amountHeroInputWrapTight: {
    marginTop: 2,
    marginBottom: 0,
  },
  amountDueChip: {
    marginTop: 4,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 12,
  },
  amountDueChipLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  amountDueChipValue: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  amountSettledChip: {
    marginTop: 8,
    maxWidth: 320,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  amountSettledChipTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  amountSettledChipSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  pctSectionLabelCentered: {
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  pctSubsectionLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  fullPayTile: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
    minHeight: 52,
  },
  fullPayTileActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 2,
  },
  fullPayLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  fullPayAmount: {
    fontSize: 15,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  amountMetaHintCentered: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  pctGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
    justifyContent: "center",
  },
  pctTile: {
    width: "31%",
    minWidth: 96,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 3,
    minHeight: 48,
  },
  pctTileActive: {
    borderColor: Theme.pulseIndigoRing,
    backgroundColor: Theme.pulseIndigoWash,
  },
  pctTilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  pctTilePct: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  pctTilePctActive: {
    color: Theme.primary,
  },
  pctTileAmt: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
    lineHeight: 11,
  },
  pctTileAmtActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  amountMetaHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
    marginTop: 2,
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: "800",
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 8,
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  filterChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterChipTextActive: {
    color: Theme.primary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  listRowActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.06)",
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  listAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  listRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 0,
  },
  listRowSub: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  duePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 4,
  },
  duePillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
  gridPad: {
    paddingBottom: 12,
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  typeTile: {
    width: "47%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 4,
    minHeight: 68,
  },
  typeTileActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  typeIconWrap: {
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  typeTileLabelActive: {
    color: Theme.primary,
  },
  modeRows: {
    width: "100%",
    gap: 8,
  },
  modeTileRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  modeTile: {
    width: "30%",
    flexGrow: 1,
    minWidth: 88,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 8,
  },
  modeTileEqual: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 72,
  },
  modeTileLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  refDateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  refDateHalf: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  captureRefDateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  captureRefDateCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  capturePaidOnBlock: {
    marginTop: 12,
    gap: 8,
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
    marginTop: 6,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  dateChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  dateChipTextActive: {
    color: Theme.primary,
  },
  lockedCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  lockedLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  lockedPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lockedValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 0,
  },
  reviewCard: {
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewPartyText: {
    flex: 1,
    minWidth: 0,
  },
  reviewPartyLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  reviewPartyName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  reviewDetailsCard: {
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  reviewAmount: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  reviewDirection: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    flex: 1,
  },
  reviewValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1.2,
    textAlign: "right",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: "#0f172a",
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonDarkText,
    letterSpacing: 0.3,
  },
  confirmSyncBtn: {
    alignSelf: "stretch",
    backgroundColor: Theme.primary,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  confirmSyncBtnDisabled: { opacity: 0.55 },
  confirmSyncBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  twoStepFlowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: LedgerSyncPalette.indigo,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  amountPaymentScroll: {
    paddingBottom: 12,
    gap: 16,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  amountPaymentSection: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    gap: 8,
  },
  amountPaymentSectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  amountPaymentInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  twoStepFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  twoStepFooterBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
  },
  twoStepFooterBackText: {
    fontSize: 13,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
  },
  twoStepFooterSubmit: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  paymentCaptureScroll: {
    paddingBottom: 12,
    gap: 12,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  captureSectionCard: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 12,
  },
  captureSectionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  captureSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  captureSectionIconType: {
    backgroundColor: "#eff6ff",
  },
  captureSectionIconMode: {
    backgroundColor: "#ecfdf5",
  },
  captureSectionIconRef: {
    backgroundColor: "#eff6ff",
  },
  captureSectionHeadText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  captureSectionEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.1,
  },
  captureSectionHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  captureReferenceInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    width: "100%",
    minWidth: 0,
  },
  captureChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
  },
  captureChangeBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  captureSummaryCard: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  captureSummaryMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  captureSummaryIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  captureSummaryText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  tripDirectStepBand: {
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 8,
    gap: 6,
    alignItems: "center",
  },
  tripDirectProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripDirectProgressDot: {
    width: 28,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  tripDirectProgressDotActive: {
    backgroundColor: LedgerSyncPalette.indigo,
  },
});
