/**
 * Add Transaction modal — demo-style ledger sync (IN/OUT, amount, party, link MSN).
 * Ledger entry form: Ledger title, IN / OUT toggle, amount, party + trip dropdowns, SAVE ENTRY.
 */
import { LedgerFlowGuardAlert } from "@/components/LedgerFlowGuardAlert";
import type { TripLedgerSmartTag } from "@/components/TripLedgerFinancialSummary";
import { LedgerMobileWizard, type LedgerPaymentTypeItem } from "@/components/ledger/LedgerMobileWizard";
import {
  LedgerPaymentTypeIcon,
  LedgerProtocolStripModeTile,
  LedgerProtocolStripTypeTile,
} from "@/components/ledger/ledgerPaymentVisuals";
import {
  LEDGER_PROTOCOL_TILE_GAP,
  LedgerProtocolStripSection,
  LedgerProtocolWorkbench,
} from "@/components/ledger/LedgerProtocolStrip";
import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";
import { LedgerReconSummaryModal } from "@/components/ledger/LedgerReconSummaryModal";
import { LedgerTripSettlementNote } from "@/components/ledger/LedgerTripSettlementNote";
import { LedgerFocusedTripCard } from "@/components/ledger/LedgerFocusedTripCard";
import { LedgerHeaderTripDetail } from "@/components/ledger/LedgerHeaderTripDetail";
import { LedgerSettlementPctDock } from "@/components/ledger/LedgerSettlementPctDock";
import { LedgerWebDateField } from "@/components/ledger/LedgerWebDateField";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import type { DriverOffer } from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
    computeTripEntryFinancialSnapshot,
    type TripEntryFinancialSnapshot,
} from "@/features/finance/utils/computeTripEntryFinancials.util";
import { resolveTripLedgerTripType } from "@/features/finance/utils/tripLedgerPayoutMode.util";
import { isTripCompleted } from "@/features/trips/services/trips.service";
import {
    isCrossOrgIntegrationTrip,
    isIntegratedClientRow,
    isIntegratedSupplierRow,
    isLoadBasedTrip,
} from "@/features/trips/visibility/tripVisibility";
import { showAppAlert } from "@/lib/appAlert";
import { formatIndianVehicleNumber, formatINR, formatLedgerAmountInput } from "@/lib/format";
import {
    buildMissionTripPendingChips,
    deriveLedgerLockedEntityType,
    isTripSmartTagSelectable,
    ledgerDisplayClientDue,
    ledgerDisplayDriverDue,
    ledgerDisplaySupplierDue,
    ledgerLockedPartyFlowGuard,
    ledgerLockedPartyPreferredFlow,
    ledgerTripDueWeightForContext,
    ledgerTripNoDueHeroMessage,
    ledgerTripNoDueTagLabel,
    type LedgerFlowGuardAlertContent,
    type LedgerLockedEntityType,
} from "@/lib/ledgerPartySmartTagPolicy";
import { resolveLedgerTripSettlementPreview } from "@/lib/ledgerTripSettlementPreview.util";
import {
  adjustmentsForTripId,
  useTripFinanceAdjustmentsMap,
} from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { dateISO, VALIDATION } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
    Banknote,
    ChevronLeft,
    CircleEllipsis,
    Clock,
    Hash,
    Route,
    Search,
    Sparkles,
    User,
    X
} from "lucide-react-native";
import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Ledger sync full-page — protocol tiles & typography (matches web reference). */
const LEDGER_SLATE = "#0f172a";
const LEDGER_PROTOCOL_ICON = "#a5b4fc";
const LEDGER_LUCIDE_STROKE = 2.2;

/** Full-page ledger: stack trip band vs split columns below this width. */
const LEDGER_STACK_TRIP_BAND_BREAKPOINT = 680;

/**
 * Viewport width for ledger layout math. Do **not** drive this from `useWindowDimensions` inside
 * `useEffect([width])`: on web the value can fluctuate every frame (scrollbar/subpixel), causing
 * `Maximum update depth exceeded`. Web uses debounced `resize`; native uses `Dimensions` change.
 */
function useLedgerViewportWidth(): number {
  const [winW, setWinW] = useState(() =>
    Math.max(0, Math.round(Dimensions.get("window").width)),
  );

  useEffect(() => {
    const commit = (raw: number) => {
      const next = Math.max(0, Math.round(Number.isFinite(raw) ? raw : 0));
      setWinW((prev) => (prev === next ? prev : next));
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      commit(window.innerWidth);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onResize = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => commit(window.innerWidth), 120);
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        clearTimeout(timeout);
      };
    }

    commit(Dimensions.get("window").width);
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      commit(window.width);
    });
    return () => sub.remove();
  }, []);

  return winW;
}


function ledgerIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLedgerDateDdMmYyyy(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, day] = iso.split("-").map((x) => parseInt(x, 10));
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Stable noon local parse for ISO `YYYY-MM-DD` (DateTimePicker value). */
function ledgerDateFromIso(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  return new Date(`${iso}T12:00:00`);
}

const LEDGER_DATE_PICKER_MIN = new Date(2000, 0, 1);
const LEDGER_DATE_PICKER_MAX = new Date(2037, 11, 31);
const LEDGER_DATE_PICKER_MIN_ISO = "2000-01-01";
const LEDGER_DATE_PICKER_MAX_ISO = "2037-12-31";

/** Default smart-tag for trip tap / IN·OUT toggle (matches mission due chips). */
function resolveDefaultTripSmartTag(
  flowType: TransactionType,
  preview: TripEntryFinancialSnapshot | null | undefined,
  opts?: {
    effectivePartyId?: string | null;
    localSupplierId?: string | null;
    driverId?: string | null;
    lockedEntityType?: LedgerLockedEntityType | null;
  },
): TripLedgerSmartTag | null {
  if (!preview) return null;
  const f = preview.financials;
  const tripPayType = preview.trip_type as string | undefined;
  if (flowType === "in") {
    return f.client_receivable > 0 ? "client" : null;
  }
  const locked = opts?.lockedEntityType ?? null;
  const supDue =
    locked === "SUPPLIER"
      ? Math.max(0, f.supplier_payable_raw ?? f.supplier_payable)
      : Math.max(0, f.supplier_payable);
  const drvDue =
    locked === "DRIVER"
      ? Math.max(0, f.driver_payable_raw ?? f.driver_payable)
      : Math.max(0, f.driver_payable);

  const effectivePartyId = opts?.effectivePartyId ?? null;
  const localSupplierId = opts?.localSupplierId ?? null;
  const driverId = opts?.driverId ?? null;
  if (effectivePartyId && localSupplierId && effectivePartyId === localSupplierId && supDue > 0) {
    return "supplier";
  }
  if (effectivePartyId && driverId && effectivePartyId === driverId && drvDue > 0) {
    return "driver";
  }
  if (tripPayType === "asset" && drvDue > 0) return "driver";
  if (tripPayType === "market" && supDue > 0) return "supplier";
  if (supDue > 0) return "supplier";
  if (drvDue > 0) return "driver";
  return null;
}

export type TransactionType = "in" | "out";

export type AddTransactionSubmitOptions = { entryId: string };

/** Amount input placeholder when empty: Indian grouping, 2 decimals; use for suggested due/receivable. */
export function formatAmountDuePlaceholder(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "0.00";
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Split a non-negative integer total across buckets proportional to weights (≥0).
 * Remainder units go to the largest fractional remainders. Equal split when all weights are 0.
 */
export function allocateIntegerByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sumW <= 0) {
    const base = Math.floor(safeTotal / n);
    const rem = safeTotal - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }
  const raw = weights.map((w) => (safeTotal * Math.max(0, w)) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = safeTotal - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

/** Legacy expense categories (backward compat); prefer CLIENT/SUPPLIER/DRIVER/VEHICLE_CATEGORIES. */
export const EXPENSE_CATEGORIES = [
  "DRIVER SALARY",
  "DRIVER COMMISSION",
  "SUPPLIER PAYMENT",
  "FUEL",
  "TOLL",
  "MAINTENANCE",
  "REPAIR",
  "PERMIT / TAX",
  "INSURANCE",
  "PARKING",
  "OFFICE EXPENSE",
  "COMMISSION",
  "FINES / PENALTIES",
  "ADVANCE PAYMENT",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Client (Cash IN / Receivables) — payment categories. Stored in description. */
export const CLIENT_CATEGORIES = [
  "Trip Payment",
  "Advance Payment",
  "Partial Payment",
  "Extra Charges",
  "Detention Charges",
  "Cancellation Charges",
  "Adjustment",
  "Other",
] as const;
export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

/** Supplier (Payables) — payment categories. Stored in description. */
export const SUPPLIER_CATEGORIES = [
  "Trip Payment",
  "Advance",
  "Balance Payment",
  "Commission",
  "Detention Charges",
  "Penalty",
  "Adjustment",
  "Other",
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

/** Driver payment types (driver_ledger.type). Shown when Cash OUT and party is driver. */
export const DRIVER_PAYMENT_TYPES = [
  { label: "Monthly Salary", type: "salary" as const },
  { label: "Trip Commission", type: "settlement" as const },
  { label: "Advance", type: "advance" as const },
  { label: "Reimbursement", type: "reimbursement" as const },
  { label: "Bonus", type: "bonus" as const },
  { label: "Deduction", type: "deduction" as const },
  { label: "Adjustment", type: "adjustment" as const },
] as const;
export type DriverPaymentType = (typeof DRIVER_PAYMENT_TYPES)[number]["type"];

/** Receivable categories for Cash IN (client payments). Stored as description. */
export const RECEIVABLE_CATEGORIES = [
  "Trip Payment",
  "Advance from Client",
  "Extra Charges",
  "Detention Charges",
  "Cancellation Charges",
  "Other",
] as const;
export type ReceivableCategory = (typeof RECEIVABLE_CATEGORIES)[number];

/** Supplier payment types (Cash OUT, party = supplier). Stored as description. */
export const SUPPLIER_PAYMENT_TYPES = [
  "Trip Payment",
  "Advance",
  "Balance Payment",
  "Adjustment",
  "Penalty",
  "Other",
] as const;
export type SupplierPaymentType = (typeof SUPPLIER_PAYMENT_TYPES)[number];

/** Vehicle / Garage expense categories. First field when adding vehicle expense (Cash OUT). */
export const VEHICLE_CATEGORIES = [
  "Fuel",
  "Toll",
  "Maintenance",
  "Repair",
  "Tyre",
  "Insurance",
  "Permit / Tax",
  "Parking",
  "Cleaning",
  "Other",
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

import { PAYMENT_MODES } from '@/lib/paymentModes';
export { PAYMENT_MODES };

/** True when mode is cash (case-insensitive so stored/legacy values still match). */
function isLedgerCashPaymentMode(id: string | null | undefined): boolean {
  return (id ?? "").trim().toUpperCase() === "CASH";
}

const LEDGER_LAST_PAYMENT_MODE_KEY = "@q/ledger_last_payment_mode";
type FontAwesomeIconName = React.ComponentProps<typeof FontAwesome>["name"];

const PAYMENT_MODE_ICON: Record<string, FontAwesomeIconName> = {
  CASH: "money",
  UPI: "mobile",
  BANK: "bank",
  CHEQUE: "file-text-o",
  FUEL_CARD: "credit-card",
  FASTAG: "ticket",
  CREDIT: "clock-o",
};

/** Short labels for ledger protocol grid (2×N tiles). */
const PAYMENT_MODE_LABEL_SHORT: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank",
  CHEQUE: "Cheque",
  FUEL_CARD: "Fuel card",
  FASTAG: "FASTag",
  CREDIT: "Credit",
};

const PAYMENT_TYPE_ICON: Record<string, FontAwesomeIconName> = {
  "Trip Payment": "truck",
  "Advance Payment": "arrow-up",
  "Advance from Client": "arrow-up",
  Advance: "arrow-up",
  "Partial Payment": "exchange",
  "Balance Payment": "check-circle-o",
  "Extra Charges": "plus-circle",
  "Detention Charges": "clock-o",
  "Cancellation Charges": "ban",
  Commission: "line-chart",
  "DRIVER COMMISSION": "line-chart",
  Penalty: "exclamation-triangle",
  "Permit / Tax": "file-text-o",
  Fuel: "tint",
  Toll: "road",
  Maintenance: "wrench",
  Repair: "wrench",
  Insurance: "shield",
  Parking: "car",
  Cleaning: "magic",
  Adjustment: "sliders",
  Reimbursement: "undo",
  Bonus: "star",
  Deduction: "minus-circle",
  salary: "user",
  settlement: "check",
  advance: "arrow-up",
  reimbursement: "undo",
  bonus: "star",
  deduction: "minus-circle",
  adjustment: "sliders",
  Other: "ellipsis-h",
};

/** Vehicle expense "parties" — vehicle cannot be party; user selects expense type. id = name = stored in description. */
export const VEHICLE_EXPENSE_PARTIES: PartyOption[] = [
  ...VEHICLE_CATEGORIES,
].map((c) => ({ id: c, name: c }));

/** All category/description values that should display as-is in ledger (not "GENERAL"). */
export const ALL_LEDGER_CATEGORY_VALUES: readonly string[] = [
  ...EXPENSE_CATEGORIES,
  ...CLIENT_CATEGORIES,
  ...SUPPLIER_CATEGORIES,
  ...RECEIVABLE_CATEGORIES,
  ...SUPPLIER_PAYMENT_TYPES,
  ...DRIVER_PAYMENT_TYPES.map((t) => t.label),
  ...VEHICLE_CATEGORIES,
  ...VEHICLE_EXPENSE_PARTIES.map((p) => p.id),
];

/** One row when splitting a single payment across multiple trips (ledger sync). */
export type TripLedgerAllocation = {
  tripId: string;
  amount: number;
  tripNumber?: string | null;
  indentId?: string | null;
};

export interface AddTransactionData {
  type: TransactionType;
  amount: number;
  partyId: string | null;
  partyName: string | null;
  tripId: string | null;
  tripNumber: string | null;
  /** Expense/receivable/supplier category. Cash IN: receivable; Cash OUT + supplier: supplier payment type; else expense. Stored as description. */
  category?: string | null;
  /** When contactType is driver: driver_ledger.type for this payment. */
  driverPaymentType?: DriverPaymentType | null;
  /** For cash_entries: contact_id and contact_type when party is selected. */
  contactId?: string | null;
  contactType?: "client" | "supplier" | "driver" | "dco" | null;
  /** Optional: vehicle number and driver name from trip for cash_entries. */
  vehicleNumber?: string | null;
  driverName?: string | null;
  indentId?: string | null;
  /** Entry date (YYYY-MM-DD). When not set, parent uses today or editing entry's date. */
  transactionDate?: string | null;
  /** Payment mode (e.g. CASH, UPI, BANK) */
  paymentMode?: string | null;
  /** Reference number / UTR for online transactions */
  paymentReference?: string | null;
  /** When set (multi-trip batch), parent creates one ledger row per item with that trip_id and amount. */
  tripAllocations?: TripLedgerAllocation[];
}

export interface PartyOption {
  id: string;
  name: string;
  /** Optional — used in ledger trip list avatars when linked by id. */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  /** Integrated client — indent trips owned by linked org may still be receivable for this client. */
  linked_organization_id?: string | null;
  is_integrated?: boolean;
  /** Integrated supplier — org-as-shipper trips. */
  supplier_type?: string | null;
}

/** Optional vehicle display for trip (e.g. "Vehicle: MH-01-XX-XXXX"). */
export interface VehicleOption {
  id: string;
  vehicle_number: string;
}

export interface TripOption {
  id: string;
  trip_number: string;
  /** For Cash IN: trip's client. */
  client_id: string | null;
  client_name: string | null;
  /** For Cash OUT: trip's supplier and driver (auto-tag). */
  supplier_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  /** Optional: for cash_entries indent_id. */
  indent_id?: string | null;
  /** Route label for dropdown e.g. "Mumbai → Pune". */
  route_label?: string | null;
  /** Formatted date for dropdown e.g. "26 FEB" (pickup_date or created_at). */
  trip_date?: string | null;
  driver_display_name?: string | null;
  supplier_name?: string | null;
  /** Trip owner org — required to match integrated client/supplier loads safely. */
  organization_id?: string | null;
  /** For trip-first smart tags & financial summary (from TripRow / API). */
  client_price?: number | null;
  supplier_rate?: number | null;
  driver_commission?: number | null;
  distance?: string | number | null;
  is_cross_org_supplier?: boolean | null;
  /** Non-owner indent: subcontract cost for supplier payable. */
  subcontract_rate?: number | null;
  /** DB: market = supplier payout; asset = driver + vehicle. When null, inferred from supplier_id. */
  trip_payout_mode?: string | null;
  /** Trip lifecycle — used for Active vs Completed filters on mission list. */
  status?: string | null;
  completed_at?: string | null;
}

/** Pending due for the active ledger direction — matches mission due chips & party lock (raw supplier/driver when locked). */
function tripFinancialSnapshotHasRelevantDue(
  snap: ReturnType<typeof computeTripEntryFinancialSnapshot> | null | undefined,
  ledgerFlow: "in" | "out",
  lockedEntityType?: LedgerLockedEntityType | null,
): boolean {
  if (!snap) return false;
  const f = snap.financials;
  if (ledgerFlow === "in") {
    return f.client_receivable > 0;
  }
  if (lockedEntityType === "SUPPLIER") {
    return (f.supplier_payable_raw ?? f.supplier_payable) > 0;
  }
  if (lockedEntityType === "DRIVER") {
    return (f.driver_payable_raw ?? f.driver_payable) > 0;
  }
  return f.supplier_payable > 0 || f.driver_payable > 0;
}

function tripOptionToLedgerFinancialInput(t: TripOption) {
  return {
    id: t.id,
    organization_id: t.organization_id ?? null,
    indent_id: t.indent_id ?? null,
    client_id: t.client_id ?? null,
    supplier_id: t.supplier_id ?? null,
    driver_id: t.driver_id ?? null,
    vehicle_id: t.vehicle_id ?? null,
    client_price: t.client_price ?? null,
    supplier_rate: t.supplier_rate ?? null,
    driver_commission: t.driver_commission ?? null,
    distance: t.distance ?? null,
    is_cross_org_supplier: t.is_cross_org_supplier ?? null,
    subcontract_rate: t.subcontract_rate ?? null,
    trip_payout_mode: t.trip_payout_mode ?? null,
  };
}

/** When set, Party dropdown shows only that type; 'all' shows clients + suppliers (e.g. Ledger tab). */
export type PartyContext = "customers" | "suppliers" | "dco" | "all";

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Second arg entryId is set when editing an existing entry. */
  onSubmit: (
    data: AddTransactionData,
    options?: AddTransactionSubmitOptions,
  ) => void | Promise<void>;
  /** Full-page ledger: navigate after animated success screen (replaces immediate onClose). */
  onSuccessDismiss?: () => void;
  clients: PartyOption[];
  /** Optional suppliers — shown in party dropdown when partyContext is 'all' or 'suppliers'; used for Cash OUT + trip auto-tag. */
  suppliers?: PartyOption[];
  /** Optional DCO payees — shown in party dropdown when partyContext is 'dco'. DCO-6: Cash OUT
   * only, no trip-level allocation (a DCO due is derived from their trips' supplier_rate, not
   * a per-payment trip link). */
  dcoPayees?: PartyOption[];
  /** Optional drivers — used for Cash OUT + trip auto-tag when user selects a trip. */
  drivers?: PartyOption[];
  /** Optional vehicles — used to display vehicle number when a trip with vehicle_id is selected (Cash OUT). */
  vehicles?: VehicleOption[];
  trips: TripOption[];
  /** When set (e.g. from client/supplier detail), party is pre-selected when modal opens. */
  defaultPartyId?: string | null;
  /** When set with defaultPartyId, ensures the party appears in the list and can be pre-selected (e.g. entity from overlay). */
  defaultPartyName?: string | null;
  /** When both set, party and name are read-only (auto-tagged from tab/entity). */
  lockedPartyId?: string | null;
  lockedPartyName?: string;
  /** When opened from entity detail — scopes due chips and smart tags to this counterparty. */
  lockedEntityType?: LedgerLockedEntityType | null;
  /** When 'customers', Party list is clients only; when 'suppliers', suppliers only; when 'all', both. */
  partyContext?: PartyContext;
  /** When set, modal opens in edit mode with form pre-filled; onSubmit will be called with { entryId: initialEntry.id }. */
  initialEntry?: LedgerRow | null;
  /** When set (e.g. from entity detail), amount is pre-filled from this value (e.g. commission due); field stays editable. */
  lockedAmount?: number | null;
  /** When set (e.g. driver offer payable_amount), used to auto-fill amount when user selects "Monthly salary". */
  salaryAmount?: number | null;
  /** When opening from trip statement: pre-select this trip. */
  defaultTripId?: string | null;
  /** When opening from trip statement: pre-select IN or OUT. */
  defaultType?: "in" | "out";
  /** When opening from trip statement: pre-select this party (client/supplier/driver id). */
  defaultContactId?: string | null;
  /** When opening from trip statement: party type for defaultContactId. */
  defaultContactType?: "client" | "supplier" | "driver" | null;
  /** When opening from driver salary request (Pay Now), pre-select this driver payment type (e.g. 'advance'). */
  defaultDriverPaymentType?: DriverPaymentType | null;
  /** When true, trip is fixed (e.g. opened from inside a trip); LINK TO TRIP is read-only. */
  tripLocked?: boolean;
  /** When tripLocked, display this when trip not yet in list (e.g. from URL params). */
  lockedTripDisplay?: string | null;
  /** When true, render as full-page content (no Modal); parent provides header/safe area. */
  fullPage?: boolean;
  /** When true, supplier Cash OUT must have a trip linked (suppliers always link to trips). */
  requireTripForSupplierOut?: boolean;
  /** When set (e.g. from entity detail), show "Entry for [label]" so user sees which party/vehicle the entry is for. */
  entryContextLabel?: string;
  /** Map supplier party id -> linked_organization_id so trips created by that org (org-as-client) are shown for the supplier. */
  supplierLinkedOrgIds?: Record<string, string>;
  /** Map linked_organization_id -> local_client_id (for integrated trips). */
  linkedClientIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Map linked_organization_id -> local_supplier_id. */
  linkedSupplierIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Current organization ID to detect if trip is "ours". */
  viewerOrgId?: string | null;
  /** When true (e.g. Garrage/vehicle context), hide party dropdown for Cash OUT and use vehicle expense categories as first field. */
  hidePartyForCashOut?: boolean;
  /**
   * When set (e.g. opened from a Vehicle detail page), pre-select this vehicle in the vehicle row and
   * make it read-only. Trips list is filtered to this vehicle, and `vehicleNumber` is included on submit.
   */
  lockedVehicleId?: string | null;
  /** Display name for the locked vehicle (e.g. registration number); falls back to value resolved from `vehicles`. */
  lockedVehicleNumber?: string | null;
  /** Cash IN: suggested receivable in amount placeholder when the field is empty (e.g. customer / trip pending). */
  dueAmountIn?: number | null;
  /** Cash OUT: suggested payable in amount placeholder when the field is empty (e.g. supplier / driver due). */
  dueAmountOut?: number | null;
  /** When set, used to compute trip financial summary + smart tags (trip-first ledger). */
  ledgerTransactions?: LedgerRow[] | null;
  /** Commission terms by driver id — improves driver payable on smart tags. */
  driverOffersByDriverId?: Record<string, DriverOffer> | null;
  /** Preloaded CN/DN lines keyed by trip id (e.g. from LedgerSyncScreen). */
  tripAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
  /** Full-page ledger header subtitle (e.g. org name). */
  ledgerWorkspaceSubtitle?: string;
}

export function AddTransactionModal({
  visible,
  onClose,
  onSubmit,
  onSuccessDismiss,
  clients,
  suppliers = [],
  dcoPayees = [],
  drivers = [],
  vehicles = [],
  trips,
  defaultPartyId,
  defaultPartyName,
  lockedPartyId,
  lockedPartyName,
  lockedEntityType: lockedEntityTypeProp = null,
  partyContext = "all",
  initialEntry = null,
  lockedAmount,
  salaryAmount,
  defaultTripId,
  defaultType,
  defaultContactId,
  defaultDriverPaymentType,
  tripLocked = false,
  lockedTripDisplay,
  fullPage = false,
  requireTripForSupplierOut = true,
  entryContextLabel,
  supplierLinkedOrgIds,
  linkedClientIdByOrgId,
  linkedSupplierIdByOrgId,
  viewerOrgId,
  hidePartyForCashOut = false,
  lockedVehicleId = null,
  lockedVehicleNumber = null,
  dueAmountIn = null,
  dueAmountOut = null,
  ledgerTransactions = null,
  driverOffersByDriverId = null,
  tripAdjustmentsByTripId: tripAdjustmentsByTripIdProp,
}: AddTransactionModalProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useEffectiveBottomInset();
  const winW = useLedgerViewportWidth();
  const stackTripFinancialBand = winW < LEDGER_STACK_TRIP_BAND_BREAKPOINT;
  /** Desktop full-page: flex viewport (header + split band + footer), no outer page scroll. */
  const ledgerFullPageViewportFit = fullPage && !stackTripFinancialBand;
  const isLedgerWide = winW >= 900;
  /** Full-page ledger horizontal padding — tighter on phones so all cards stay readable. */
  const ledgerFullPagePadH =
    winW < 420 ? 14 : winW < LEDGER_STACK_TRIP_BAND_BREAKPOINT ? 16 : 20;
  const safeClients = useMemo(() => clients ?? [], [clients]);
  const safeSuppliers = useMemo(() => suppliers ?? [], [suppliers]);
  const safeDcoPayees = useMemo(() => dcoPayees ?? [], [dcoPayees]);
  const safeDrivers = useMemo(() => drivers ?? [], [drivers]);
  const baseSafeVehicles = useMemo(() => vehicles ?? [], [vehicles]);
  // When a vehicle is locked (e.g. opened from a Vehicle detail page), make sure it is present
  // in the vehicle list so the row can render its name even before the vehicles fetch settles.
  const safeVehicles = useMemo(() => {
    if (!lockedVehicleId) return baseSafeVehicles;
    if (baseSafeVehicles.some((v) => v.id === lockedVehicleId)) return baseSafeVehicles;
    return [
      { id: lockedVehicleId, vehicle_number: lockedVehicleNumber ?? "" },
      ...baseSafeVehicles,
    ];
  }, [baseSafeVehicles, lockedVehicleId, lockedVehicleNumber]);
  const isVehicleLocked = lockedVehicleId != null;
  const safeTrips = useMemo(() => trips ?? [], [trips]);

  const [type, setType] = useState<TransactionType>(
    () => defaultType ?? (partyContext === "customers" ? "in" : "out"),
  );
  const [amountStr, setAmountStr] = useState("");

  const amountPlaceholder = useMemo(
    () =>
      formatAmountDuePlaceholder(type === "in" ? dueAmountIn : dueAmountOut),
    [type, dueAmountIn, dueAmountOut],
  );
  const [partyId, setPartyId] = useState<string | null>(null);
  /** Ledger mission list: multiple trips allowed; submit splits amount across rows by suggested dues. */
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  /** Ledger entries always link to at most one trip (radio, not checkbox). */
  const selectLedgerTrip = useCallback((tripId: string | null) => {
    setSelectedTripIds(tripId ? [tripId] : []);
  }, []);

  useEffect(() => {
    if (selectedTripIds.length <= 1) return;
    setSelectedTripIds([selectedTripIds[0]!]);
  }, [selectedTripIds]);
  const [category, setCategory] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string>(PAYMENT_MODES[0].id);
  const [paymentReference, setPaymentReference] = useState<string>("");
  const ledgerPaymentModeHydratedRef = useRef(false);
  const [driverPaymentType, setDriverPaymentType] =
    useState<DriverPaymentType | null>(null);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDriverPaymentTypePicker, setShowDriverPaymentTypePicker] =
    useState(false);
  /** When party is "Driver salary", which driver this salary is for. */
  const [driverIdForSalary, setDriverIdForSalary] = useState<string | null>(
    null,
  );
  const [showDriverForSalaryPicker, setShowDriverForSalaryPicker] =
    useState(false);
  /** When vehicle expense (Cash OUT, no party) and no trip selected, user can pick a vehicle so it's stored. */
  const [selectedVehicleIdForExpense, setSelectedVehicleIdForExpense] =
    useState<string | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [paymentModeExpanded, setPaymentModeExpanded] = useState(true);
  const [paymentTypeExpanded, setPaymentTypeExpanded] = useState(true);
  const [tripSearch, setTripSearch] = useState("");
  const [missionTripSearchExpanded, setMissionTripSearchExpanded] = useState(false);
  const missionTripSearchInputRef = useRef<TextInput>(null);
  const deferredTripSearch = useDeferredValue(tripSearch);
  /** Mission trip list filters (full-page ledger). */
  const [missionTripFilterDue, setMissionTripFilterDue] = useState<
    "all" | "has_due" | "no_due"
  >("all");
  const [missionTripFilterPayout, setMissionTripFilterPayout] = useState<
    "all" | "asset" | "aggregate"
  >("all");
  const [missionTripFilterLifecycle, setMissionTripFilterLifecycle] = useState<
    "all" | "active" | "completed"
  >("all");
  /**
   * Full-page ledger: after user picks a voyage (or explicitly "No associated trip"),
   * hide filters + list — same as desktop focus mode (mobile was missing this).
   */
  const [ledgerMissionRegistryExpanded, setLedgerMissionRegistryExpanded] =
    useState(true);
  /** Desktop full-page: 1 = sync mode & category, 2 = amount & date. */
  const [_ledgerDesktopWizardStep, setLedgerDesktopWizardStep] = useState<1 | 2>(1);
  /** Full-page ledger: show reconciliation summary in a confirm overlay before save. */
  const [ledgerSubmitConfirmVisible, setLedgerSubmitConfirmVisible] =
    useState(false);
  const [ledgerSubmitting, setLedgerSubmitting] = useState(false);
  const [ledgerReconSucceeded, setLedgerReconSucceeded] = useState(false);
  const [ledgerFlowGuardAlert, setLedgerFlowGuardAlert] =
    useState<LedgerFlowGuardAlertContent | null>(null);
  const [ledgerSyncDatePickerVisible, setLedgerSyncDatePickerVisible] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(
    () =>
      initialEntry?.transaction_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  /** When fullPage: extra bottom padding so scroll can bring content above keyboard. */
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(0);
  /** Trip-first smart tags: highlight cleared when amount diverges from tag suggestion. */
  const [smartTagHighlight, setSmartTagHighlight] = useState<TripLedgerSmartTag | null>(null);
  const [smartTagSuggestedAmount, setSmartTagSuggestedAmount] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  /** Skip clearing smart-tag state when trip id is set by applyTripSmartTag / selectMissionTrip. */
  const skipSmartTagClearRef = useRef(false);
  /** User picked a partial % or typed amount — block trip-preview auto-fill from overwriting. */
  const ledgerAmountUserEditedRef = useRef(false);

  const isEditMode = Boolean(initialEntry?.id);
  /** Lock from route/entity when id is anchored; display name may resolve a tick later (avoids layout flip). */
  const isPartyLocked = lockedPartyId != null;
  const ledgerLockedEntityType = useMemo(
    () =>
      deriveLedgerLockedEntityType(
        lockedEntityTypeProp,
        partyContext,
        isPartyLocked,
      ),
    [lockedEntityTypeProp, partyContext, isPartyLocked],
  );
  const showLedgerFlowGuardAlert = useCallback(
    (guard: LedgerFlowGuardAlertContent) => {
      setLedgerFlowGuardAlert(guard);
    },
    [],
  );

  const requestLedgerFlowType = useCallback(
    (next: "in" | "out") => {
      if (next === type) return;
      // DCO-6: a DCO payment is always Cash OUT (Pulse paying the DCO) — there is
      // no legitimate "DCO pays us" scenario the way a client receipt or supplier
      // refund can exist. Locking this out entirely, rather than leaving the
      // toggle open, is what avoids the pre-existing supplier-flow ambiguity
      // (an unlocked toggle plus contactType derivation that doesn't check the
      // selected party's actual type can silently mislabel a Cash In row).
      if (partyContext === "dco" && next === "in") return;
      const guard = ledgerLockedPartyFlowGuard(
        next,
        ledgerLockedEntityType,
        lockedPartyId,
      );
      if (guard) {
        showLedgerFlowGuardAlert(guard);
        return;
      }
      setType(next);
    },
    [type, partyContext, ledgerLockedEntityType, lockedPartyId, showLedgerFlowGuardAlert],
  );
  const effectivePartyId = isPartyLocked ? lockedPartyId : partyId;

  /** Today as short label for tag (e.g. "11 Mar"). */
  const _todayTagLabel = useMemo(() => {
    const d = new Date();
    const day = d.getDate();
    const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    return `${day} ${months[d.getMonth()]}`;
  }, []);

  const allParties = useMemo(
    () => [...safeClients, ...safeSuppliers],
    [safeClients, safeSuppliers],
  );

  /** When set, amount is pre-filled from entity detail but remains editable. */
  const amount = Math.round(
    parseFloat(amountStr.replace(/,/g, "").trim()) || 0,
  );

  /** When a client or supplier is selected (or party is locked), show only trips related to that party. */
  const effectivePartyIdForTrips = isPartyLocked ? lockedPartyId : partyId;
  const filteredTrips = useMemo(() => {
    const linkedMapGet = (
      m: Record<string, string> | Map<string, string> | undefined,
      key: string,
    ): string | undefined => {
      if (!m) return undefined;
      return m instanceof Map ? m.get(key) : m[key];
    };

    const tripOrgId = (t: TripOption) =>
      (t.organization_id ?? (t as { organization_id?: string | null }).organization_id) ??
      null;

    /** Strict client match: same client_id on trip, or integrated load where org + map resolve to this client. */
    const tripMatchesClient = (t: TripOption, clientId: string): boolean => {
      if ((t.client_id ?? "").trim() === clientId) return true;
      const client = safeClients.find((c) => c.id === clientId);
      if (!client || !isIntegratedClientRow(client)) return false;
      const linkedOrgId = client.linked_organization_id ?? null;
      if (!linkedOrgId || !isLoadBasedTrip(t)) return false;
      if (tripOrgId(t) !== linkedOrgId) return false;
      return linkedMapGet(linkedClientIdByOrgId, linkedOrgId) === clientId;
    };

    /** Strict supplier match: same supplier_id on trip, or integrated shipper load for this supplier only. */
    const tripMatchesSupplier = (t: TripOption, supplierId: string): boolean => {
      if ((t.supplier_id ?? "").trim() === supplierId) return true;
      const supplier = safeSuppliers.find((s) => s.id === supplierId);
      if (!supplier || !isIntegratedSupplierRow(supplier)) return false;
      const linkedOrgId = supplier.linked_organization_id ?? null;
      if (!linkedOrgId || !isLoadBasedTrip(t)) return false;
      if (tripOrgId(t) !== linkedOrgId) return false;
      return linkedMapGet(linkedSupplierIdByOrgId, linkedOrgId) === supplierId;
    };

    // Garage vehicle expense: only trips for the selected vehicle (never all trips).
    if (hidePartyForCashOut && type === "out") {
      if (selectedVehicleIdForExpense)
        return safeTrips.filter((t) => (t.vehicle_id ?? "").trim() === selectedVehicleIdForExpense);
      return [];
    }

    if (
      !effectivePartyIdForTrips ||
      effectivePartyIdForTrips === "misc"
    ) {
      return [];
    }

    if (effectivePartyIdForTrips === "driver-salary") {
      if (!driverIdForSalary) return [];
      return safeTrips.filter((t) => (t.driver_id ?? "").trim() === driverIdForSalary);
    }

    if (partyContext === "customers") {
      return safeTrips.filter((t) =>
        tripMatchesClient(t, effectivePartyIdForTrips),
      );
    }
    if (partyContext === "suppliers") {
      return safeTrips.filter((t) =>
        tripMatchesSupplier(t, effectivePartyIdForTrips),
      );
    }

    const isClient = safeClients.some((c) => c.id === effectivePartyIdForTrips);
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    if (isClient) {
      return safeTrips.filter((t) =>
        tripMatchesClient(t, effectivePartyIdForTrips),
      );
    }
    if (isSupplier) {
      return safeTrips.filter((t) =>
        tripMatchesSupplier(t, effectivePartyIdForTrips),
      );
    }
    if (safeDrivers.some((d) => d.id === effectivePartyIdForTrips)) {
      return safeTrips.filter(
        (t) => (t.driver_id ?? "").trim() === effectivePartyIdForTrips,
      );
    }
    return [];
  }, [
    safeTrips,
    effectivePartyIdForTrips,
    partyContext,
    safeClients,
    safeSuppliers,
    safeDrivers,
    linkedClientIdByOrgId,
    linkedSupplierIdByOrgId,
    hidePartyForCashOut,
    type,
    selectedVehicleIdForExpense,
    driverIdForSalary,
  ]);

  /** Full-page global ledger: show all trips until party is chosen (trip-first). */
  const ledgerMissionTripsBase = useMemo(() => {
    let base: TripOption[];
    if (hidePartyForCashOut && type === "out") {
      base = filteredTrips;
    } else if (fullPage && !tripLocked && partyContext === "all" && partyId == null) {
      base = safeTrips;
    } else {
      base = filteredTrips;
    }

    const presetIds = new Set<string>();
    const presetFromProps = (defaultTripId ?? "").trim();
    if (presetFromProps) presetIds.add(presetFromProps);
    const presetFromSelection = (selectedTripIds[0] ?? "").trim();
    if (presetFromSelection) presetIds.add(presetFromSelection);

    let merged = base;
    for (const pid of presetIds) {
      if (merged.some((t) => t.id === pid)) continue;
      const preset = safeTrips.find((t) => t.id === pid);
      if (preset) merged = [preset as TripOption, ...merged];
    }
    return merged;
  }, [
    fullPage,
    tripLocked,
    partyContext,
    partyId,
    filteredTrips,
    safeTrips,
    hidePartyForCashOut,
    type,
    defaultTripId,
    selectedTripIds,
  ]);

  /** Web: avoid useDeferredValue here — concurrent follow-up renders were visibly tearing the trip list. */
  const missionTripSearchQuery =
    Platform.OS === "web" ? tripSearch : deferredTripSearch;
  const missionTrips = useMemo(() => {
    const base = ledgerMissionTripsBase;
    const q = missionTripSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((t) => {
      const hay = [
        t.trip_number,
        t.route_label,
        t.trip_date,
        t.client_name,
        t.supplier_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [ledgerMissionTripsBase, missionTripSearchQuery]);

  useEffect(() => {
    if (skipSmartTagClearRef.current) {
      skipSmartTagClearRef.current = false;
      return;
    }
    setSmartTagHighlight(null);
    setSmartTagSuggestedAmount(null);
  }, [selectedTripIds]);

  useEffect(() => {
    if (!visible) {
      setLedgerSubmitConfirmVisible(false);
      setMissionTripSearchExpanded(false);
    } else if (fullPage) {
      setLedgerMissionRegistryExpanded(true);
    }
  }, [visible, fullPage]);

  useEffect(() => {
    if (!fullPage || !visible) {
      ledgerPaymentModeHydratedRef.current = false;
      return;
    }
    if (initialEntry?.id) return;
    if (ledgerPaymentModeHydratedRef.current) return;
    ledgerPaymentModeHydratedRef.current = true;
    void AsyncStorage.getItem(LEDGER_LAST_PAYMENT_MODE_KEY).then((stored) => {
      const id = (stored ?? "").trim().toUpperCase();
      if (id && PAYMENT_MODES.some((p) => p.id === id)) setPaymentModeId(id);
    });
  }, [fullPage, visible, initialEntry?.id]);

  useEffect(() => {
    if (!fullPage || !visible || initialEntry?.id) return;
    void AsyncStorage.setItem(LEDGER_LAST_PAYMENT_MODE_KEY, paymentModeId);
  }, [fullPage, visible, paymentModeId, initialEntry?.id]);

  useEffect(() => {
    if (smartTagHighlight == null || smartTagSuggestedAmount == null) return;
    const raw = amountStr.replace(/,/g, "").trim();
    if (raw === "") return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    if (Math.abs(parsed - smartTagSuggestedAmount) > 0.009) {
      setSmartTagHighlight(null);
    }
  }, [amountStr, smartTagHighlight, smartTagSuggestedAmount]);

  /** Counterparty for trip row avatar (client on IN, supplier/driver on OUT). */
  const _getLedgerTripPartyVisual = useCallback(
    (t: TripOption) => {
      if (type === "in") {
        const cid = t.client_id?.trim() || null;
        const party = cid ? safeClients.find((c) => c.id === cid) : undefined;
        const name = party?.name ?? t.client_name ?? "Client";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "client" as const,
        };
      }
      const sid = t.supplier_id?.trim() || null;
      if (sid) {
        const party = safeSuppliers.find((s) => s.id === sid);
        const name =
          party?.name ??
          (t as { supplier_name?: string | null }).supplier_name ??
          "Supplier";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "supplier" as const,
        };
      }
      const did = t.driver_id?.trim() || null;
      if (did) {
        const party = safeDrivers.find((d) => d.id === did);
        const name =
          party?.name ??
          t.driver_display_name ??
          "Driver";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "driver" as const,
        };
      }
      const fallback = t.client_name?.trim() || t.route_label?.trim() || "Trip";
      return {
        name: fallback,
        avatarUrl: null as string | null,
        avatarSeed: null as string | null,
        entityType: "client" as const,
      };
    },
    [type, safeClients, safeSuppliers, safeDrivers],
  );

  const resolveTripOptionById = useCallback(
    (id: string): TripOption | null => {
      const fromSafe = safeTrips.find((t) => t.id === id);
      if (fromSafe) return fromSafe as TripOption;
      const fromMission = ledgerMissionTripsBase.find((t) => t.id === id);
      return fromMission ? (fromMission as TripOption) : null;
    },
    [safeTrips, ledgerMissionTripsBase],
  );

  /** Trip list for ledger can be a superset (e.g. merged loads); first selected id drives party chips when multiple trips share context. */
  const selectedTrip = useMemo((): TripOption | null => {
    if (selectedTripIds.length === 0) return null;
    return resolveTripOptionById(selectedTripIds[0]);
  }, [selectedTripIds, resolveTripOptionById]);
  const selectedTripPayoutMode = useMemo(
    () => (selectedTrip ? resolveTripLedgerTripType(selectedTrip) : null),
    [selectedTrip],
  );
  const tripNumber = selectedTrip?.trip_number ?? null;

  const tripFinancialPreviewByTripId = useMemo(() => {
    const m: Record<string, ReturnType<typeof computeTripEntryFinancialSnapshot>> = {};
    const txs = ledgerTransactions ?? [];
    const tripsForPreview = [...ledgerMissionTripsBase];
    for (const tid of selectedTripIds) {
      if (!tid || tripsForPreview.some((t) => t.id === tid)) continue;
      const extra = resolveTripOptionById(tid);
      if (extra) tripsForPreview.push(extra);
    }
    for (const raw of tripsForPreview) {
      const t = raw as TripOption;
      if (t.client_price == null && t.supplier_rate == null) continue;
      m[t.id] = computeTripEntryFinancialSnapshot(
        tripOptionToLedgerFinancialInput(t),
        txs,
        viewerOrgId,
        t.driver_id && driverOffersByDriverId
          ? driverOffersByDriverId[t.driver_id] ?? null
          : null,
      );
    }
    return m;
  }, [
    ledgerMissionTripsBase,
    selectedTripIds,
    resolveTripOptionById,
    ledgerTransactions,
    viewerOrgId,
    driverOffersByDriverId,
  ]);

  const missionTripPreviewReady = useMemo(
    () =>
      Boolean(
        selectedTripIds[0] && tripFinancialPreviewByTripId[selectedTripIds[0]],
      ),
    [selectedTripIds, tripFinancialPreviewByTripId],
  );

  const focusedLedgerTripIds = useMemo(() => {
    if (!fullPage) return [];
    const ids = new Set<string>();
    const selected = selectedTripIds[0];
    if (selected) ids.add(selected);
    const preset = (defaultTripId ?? "").trim();
    if (preset) ids.add(preset);
    return [...ids];
  }, [fullPage, selectedTripIds, defaultTripId]);

  const { record: focusedTripAdjustmentsRecord } = useTripFinanceAdjustmentsMap(
    viewerOrgId,
    focusedLedgerTripIds,
  );

  const missionTripsFiltered = useMemo(() => {
    return missionTrips.filter((t) => {
      const snap = tripFinancialPreviewByTripId[t.id];
      if (
        missionTripFilterDue === "has_due" &&
        !tripFinancialSnapshotHasRelevantDue(snap, type, ledgerLockedEntityType)
      )
        return false;
      if (
        missionTripFilterDue === "no_due" &&
        tripFinancialSnapshotHasRelevantDue(snap, type, ledgerLockedEntityType)
      )
        return false;

      const payout = resolveTripLedgerTripType(t);
      if (missionTripFilterPayout === "asset" && payout !== "asset") return false;
      if (missionTripFilterPayout === "aggregate" && payout !== "market") return false;

      const completed = isTripCompleted({
        status: t.status ?? "",
        completed_at: t.completed_at ?? null,
      });
      if (missionTripFilterLifecycle === "active" && completed) return false;
      if (missionTripFilterLifecycle === "completed" && !completed) return false;

      return true;
    });
  }, [
    missionTrips,
    tripFinancialPreviewByTripId,
    missionTripFilterDue,
    missionTripFilterPayout,
    missionTripFilterLifecycle,
    type,
    ledgerLockedEntityType,
  ]);

  const resolveLocalClientPartyIdFromTrip = useCallback(
    (trip: TripOption): string | null => {
      const orgId = trip.organization_id ?? null;
      if (viewerOrgId && orgId && orgId !== viewerOrgId) {
        const m = linkedClientIdByOrgId;
        if (!m) return null;
        const linked = m instanceof Map ? m.get(orgId) : m[orgId as keyof typeof m];
        return typeof linked === "string" && linked.trim() ? linked.trim() : null;
      }
      const cid = (trip.client_id ?? "").trim();
      return cid || null;
    },
    [viewerOrgId, linkedClientIdByOrgId],
  );

  const resolveLocalSupplierPartyIdFromTrip = useCallback(
    (trip: TripOption): string | null => {
      const orgId = trip.organization_id ?? null;
      if (viewerOrgId && orgId && orgId !== viewerOrgId) {
        const m = linkedSupplierIdByOrgId;
        const linked =
          m instanceof Map ? m.get(orgId) : m?.[orgId as keyof typeof m];
        if (typeof linked === "string" && linked.trim()) return linked.trim();

        // Fallback for non-unique linked org maps: prefer supplier-name match
        // within local suppliers tied to this same linked organization.
        const linkedCandidates = safeSuppliers.filter(
          (s) =>
            (s as { linked_organization_id?: string | null })
              .linked_organization_id === orgId,
        );
        if (linkedCandidates.length === 0) return null;
        const tripSupplierName = (
          (trip as { supplier_name?: string | null }).supplier_name ?? ""
        )
          .trim()
          .toLowerCase();
        if (tripSupplierName) {
          const byName = linkedCandidates.find(
            (s) => (s.name ?? "").trim().toLowerCase() === tripSupplierName,
          );
          if (byName?.id) return byName.id;
        }
        if (linkedCandidates.length === 1) return linkedCandidates[0].id;
        return null;
      }
      const sid = (trip.supplier_id ?? "").trim();
      if (sid && safeSuppliers.some((s) => s.id === sid)) return sid;
      const tripSupplierName = (
        (trip as { supplier_name?: string | null }).supplier_name ?? ""
      )
        .trim()
        .toLowerCase();
      if (tripSupplierName) {
        const byName = safeSuppliers.find(
          (s) => (s.name ?? "").trim().toLowerCase() === tripSupplierName,
        );
        if (byName?.id) return byName.id;
      }
      return sid || null;
    },
    [viewerOrgId, linkedSupplierIdByOrgId, safeSuppliers],
  );

  const tripPartyIdsFromTrip = useCallback(
    (trip: TripOption) => ({
      localClientId: resolveLocalClientPartyIdFromTrip(trip),
      localSupplierId: resolveLocalSupplierPartyIdFromTrip(trip),
      driverId: (trip.driver_id ?? "").trim() || null,
      tripClientId: (trip.client_id ?? "").trim() || null,
      tripSupplierId: (trip.supplier_id ?? "").trim() || null,
    }),
    [resolveLocalClientPartyIdFromTrip, resolveLocalSupplierPartyIdFromTrip],
  );

  /** Mission list is already filtered to the locked entity (incl. integrated loads). */
  const isTripInLockedPartyScope = useCallback(
    (trip: TripOption) => {
      if (!ledgerLockedEntityType || !lockedPartyId) return false;
      return missionTrips.some((m) => m.id === trip.id);
    },
    [ledgerLockedEntityType, lockedPartyId, missionTrips],
  );

  const resolveMissionTripSmartTag = useCallback(
    (
      trip: TripOption,
      flowType: TransactionType,
      preview: TripEntryFinancialSnapshot | null | undefined,
    ): TripLedgerSmartTag | null => {
      const parties = tripPartyIdsFromTrip(trip);
      const tag = resolveDefaultTripSmartTag(flowType, preview, {
        effectivePartyId,
        localSupplierId: parties.localSupplierId,
        driverId: parties.driverId,
        lockedEntityType: ledgerLockedEntityType,
      });
      if (!tag) return null;
      if (
        !isTripSmartTagSelectable(
          tag,
          flowType,
          ledgerLockedEntityType,
          lockedPartyId ?? null,
          parties,
          isTripInLockedPartyScope(trip),
        )
      ) {
        return null;
      }
      return tag;
    },
    [
      tripPartyIdsFromTrip,
      effectivePartyId,
      ledgerLockedEntityType,
      lockedPartyId,
      isTripInLockedPartyScope,
    ],
  );

  /** Per-trip suggested due weight for placeholder + multi-trip amount split (aligned with mission chips). */
  const getLedgerTripDueWeight = useCallback(
    (trip: TripOption): number => {
      const preview = tripFinancialPreviewByTripId[trip.id];
      if (!preview) return 0;
      const f = preview.financials;
      const tripPayType = preview.trip_type;
      return ledgerTripDueWeightForContext(
        type,
        f,
        tripPayType,
        ledgerLockedEntityType,
        lockedPartyId ?? null,
        tripPartyIdsFromTrip(trip),
        effectivePartyId ?? null,
        isTripInLockedPartyScope(trip),
      );
    },
    [
      tripFinancialPreviewByTripId,
      type,
      ledgerLockedEntityType,
      lockedPartyId,
      tripPartyIdsFromTrip,
      effectivePartyId,
      isTripInLockedPartyScope,
    ],
  );

  const formatLedgerSyncAmountInput = useCallback((value: number) => {
    return formatLedgerAmountInput(value);
  }, []);

  const handleLedgerQuickAmountChange = useCallback(
    (value: string) => {
      ledgerAmountUserEditedRef.current = true;
      const parsed = parseFloat(String(value).replace(/,/g, "").trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setAmountStr("");
        return;
      }
      setAmountStr(formatLedgerAmountInput(parsed));
    },
    [],
  );

  const handleLedgerAmountInputChange = useCallback((value: string) => {
    ledgerAmountUserEditedRef.current = true;
    setAmountStr(value);
  }, []);

  /** Selected trip(s): placeholder = sum of suggested dues, not party-wide totals from props. */
  const ledgerAmountPlaceholder = useMemo(() => {
    const base = amountPlaceholder;
    if (selectedTripIds.length === 0) return base;
    let sum = 0;
    for (const tid of selectedTripIds) {
      const trip = resolveTripOptionById(tid);
      if (!trip) continue;
      sum += getLedgerTripDueWeight(trip);
    }
    if (sum > 0) return formatAmountDuePlaceholder(sum);
    return base;
  }, [
    amountPlaceholder,
    selectedTripIds,
    resolveTripOptionById,
    getLedgerTripDueWeight,
  ]);

  const ledgerDueAmountInr = useMemo(() => {
    const explicitDue = type === "in" ? dueAmountIn : dueAmountOut;
    const tid = selectedTripIds[0];
    if (
      explicitDue != null &&
      explicitDue > 0 &&
      defaultTripId &&
      tid === defaultTripId
    ) {
      const trip = tid ? resolveTripOptionById(tid) : null;
      const fromTrip = trip ? getLedgerTripDueWeight(trip) : 0;
      if (fromTrip <= 0 || Math.abs(fromTrip - explicitDue) > 0.01) {
        return explicitDue;
      }
    }
    const parsed = parseFloat(String(ledgerAmountPlaceholder).replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    if (explicitDue != null && explicitDue > 0) return explicitDue;
    if (tid) {
      const trip = resolveTripOptionById(tid);
      if (trip) {
        const due = getLedgerTripDueWeight(trip);
        if (due > 0) return due;
      }
    }
    return null;
  }, [
    ledgerAmountPlaceholder,
    type,
    dueAmountIn,
    dueAmountOut,
    defaultTripId,
    selectedTripIds,
    resolveTripOptionById,
    getLedgerTripDueWeight,
  ]);

  const applyTripSmartTag = useCallback(
    (trip: TripOption, tag: TripLedgerSmartTag) => {
      const flowForTag: TransactionType = tag === "client" ? "in" : "out";
      if (
        !isTripSmartTagSelectable(
          tag,
          flowForTag,
          ledgerLockedEntityType,
          lockedPartyId ?? null,
          tripPartyIdsFromTrip(trip),
          isTripInLockedPartyScope(trip),
        )
      ) {
        return;
      }
      if (trip.client_price == null && trip.supplier_rate == null) return;
      const snap = computeTripEntryFinancialSnapshot(
        tripOptionToLedgerFinancialInput(trip),
        ledgerTransactions ?? [],
        viewerOrgId,
        trip.driver_id && driverOffersByDriverId
          ? driverOffersByDriverId[trip.driver_id] ?? null
          : null,
      );
      if (!snap) return;
      const f = snap.financials;
      const amt =
        tag === "client"
          ? f.client_receivable
          : tag === "supplier"
            ? f.supplier_payable
            : f.driver_payable;
      if (!(amt > 0)) return;
      skipSmartTagClearRef.current = true;
      selectLedgerTrip(trip.id);
      setSmartTagSuggestedAmount(amt);
      setSmartTagHighlight(tag);
      setAmountStr(formatLedgerSyncAmountInput(amt));
      setPaymentModeExpanded(false);
      setPaymentTypeExpanded(false);
      if (tag === "client") {
        const pid =
          resolveLocalClientPartyIdFromTrip(trip) ??
          (isPartyLocked && lockedPartyId ? lockedPartyId : null);
        if (!pid) {
          Alert.alert("Client", "Could not resolve local client for this trip.");
          return;
        }
        setType("in");
        setPartyId(pid);
        setCategory("Trip Payment");
        setDriverPaymentType(null);
      } else if (tag === "supplier") {
        const sid =
          resolveLocalSupplierPartyIdFromTrip(trip) ??
          (isPartyLocked && lockedPartyId ? lockedPartyId : null);
        if (!sid) {
          Alert.alert("Supplier", "Could not resolve supplier for this trip.");
          return;
        }
        setType("out");
        setPartyId(sid);
        setCategory("Trip Payment");
        setDriverPaymentType(null);
      } else {
        const did = (trip.driver_id ?? "").trim();
        if (!did) return;
        setType("out");
        setPartyId(did);
        setDriverPaymentType("settlement");
        setCategory(null);
      }
    },
    [
      formatLedgerSyncAmountInput,
      ledgerLockedEntityType,
      lockedPartyId,
      isPartyLocked,
      isTripInLockedPartyScope,
      tripPartyIdsFromTrip,
      ledgerTransactions,
      viewerOrgId,
      driverOffersByDriverId,
      resolveLocalClientPartyIdFromTrip,
      resolveLocalSupplierPartyIdFromTrip,
      selectLedgerTrip,
    ],
  );

  const ledgerFocusedTripForSummary = useMemo(() => {
    const tid = selectedTripIds[0] ?? (defaultTripId?.trim() || null);
    if (!tid) return null;
    return (
      missionTripsFiltered.find((trip) => trip.id === tid) ??
      missionTrips.find((trip) => trip.id === tid) ??
      resolveTripOptionById(tid)
    );
  }, [
    selectedTripIds,
    defaultTripId,
    missionTripsFiltered,
    missionTrips,
    resolveTripOptionById,
  ]);

  const headerTripNumber =
    (ledgerFocusedTripForSummary?.trip_number ?? "").trim() ||
    (tripNumber ?? "").trim() ||
    (lockedTripDisplay ?? "").trim() ||
    null;
  const headerTripRoute = useMemo(() => {
    const fromSummary = (ledgerFocusedTripForSummary?.route_label ?? "").trim();
    if (fromSummary) return fromSummary;
    const tid = selectedTripIds[0] ?? (defaultTripId?.trim() || null);
    if (!tid) return null;
    const trip =
      ledgerFocusedTripForSummary ??
      missionTrips.find((t) => t.id === tid) ??
      resolveTripOptionById(tid);
    const route = (trip?.route_label ?? "").trim();
    return route || null;
  }, [
    ledgerFocusedTripForSummary,
    selectedTripIds,
    defaultTripId,
    missionTrips,
    resolveTripOptionById,
  ]);
  const hasLinkedTripContext = Boolean(
    tripLocked ||
      selectedTripIds.length > 0 ||
      (defaultTripId ?? "").trim(),
  );
  const showHeaderTripDetail = Boolean(headerTripNumber && hasLinkedTripContext);

  const ledgerFocusedTripCardElement = useMemo(() => {
    const t = ledgerFocusedTripForSummary;
    if (!t) return null;
    const routeLine = (t.route_label || "").trim() || "—";
    const preview = tripFinancialPreviewByTripId[t.id];
    const fin = preview?.financials;
    const tripPayType = preview?.trip_type;
    const parties = tripPartyIdsFromTrip(t);
    const showClientDuePill =
      !ledgerLockedEntityType || ledgerLockedEntityType === "CLIENT";
    const showSupplierDuePill =
      !ledgerLockedEntityType || ledgerLockedEntityType === "SUPPLIER";
    const showDriverDuePill =
      !ledgerLockedEntityType || ledgerLockedEntityType === "DRIVER";
    const pendingChips = buildMissionTripPendingChips(
      type,
      fin,
      tripPayType,
      formatINR,
      ledgerLockedEntityType,
      lockedPartyId ?? null,
      parties,
      isTripInLockedPartyScope(t),
    );
    const showNoDueTag =
      preview != null &&
      !tripFinancialSnapshotHasRelevantDue(preview, type, ledgerLockedEntityType);
    const noDueTagLabel = ledgerTripNoDueTagLabel(type, ledgerLockedEntityType);
    const tripAdjustments = (() => {
      const fromProp = adjustmentsForTripId(tripAdjustmentsByTripIdProp, t.id);
      if (fromProp.length > 0) return fromProp;
      return adjustmentsForTripId(focusedTripAdjustmentsRecord, t.id);
    })();
    const revisedLaneAmount =
      type === "in" ? Number(t.client_price ?? 0) : Number(t.supplier_rate ?? 0);
    const compact = stackTripFinancialBand;

    return (
      <LedgerFocusedTripCard
        tripNumber={t.trip_number}
        routeLabel={routeLine}
        flowType={type}
        adjustments={tripAdjustments}
        revisedAmount={revisedLaneAmount}
        financialSnapshot={preview}
        ledgerTransactions={ledgerTransactions}
        tripId={t.id}
        showClientLane={showClientDuePill}
        showSupplierLane={showSupplierDuePill}
        showDriverLane={showDriverDuePill}
        showNoDueTag={showNoDueTag}
        noDueTagLabel={noDueTagLabel}
        compact={compact}
        hideTripIdentity={showHeaderTripDetail}
        chips={pendingChips.map((c) => ({
          key: `${c.tag}-${c.disabled ? "d" : "a"}`,
          label: c.label,
          disabled: c.disabled,
          onPress: () => {
            if (c.disabled) {
              if (c.tag === "client") {
                Alert.alert(
                  "Different party · Cash IN",
                  "Client receipts use Cash IN. Switch to IN to record money from the client.",
                );
              } else {
                Alert.alert(
                  "Different party · Cash OUT",
                  "Supplier and driver payments use Cash OUT. Switch to OUT to record this payment.",
                );
              }
              return;
            }
            applyTripSmartTag(t, c.tag);
          },
        }))}
        noDuePillLabel={
          pendingChips.length === 0 && showNoDueTag ? noDueTagLabel : null
        }
      />
    );
  }, [
    ledgerFocusedTripForSummary,
    tripFinancialPreviewByTripId,
    type,
    ledgerLockedEntityType,
    lockedPartyId,
    isTripInLockedPartyScope,
    tripPartyIdsFromTrip,
    tripAdjustmentsByTripIdProp,
    focusedTripAdjustmentsRecord,
    showHeaderTripDetail,
    ledgerTransactions,
    stackTripFinancialBand,
    applyTripSmartTag,
  ]);

  const lastNoDueAlertTripIdRef = useRef<string | null>(null);

  const fillLedgerAmountFromTripDue = useCallback(
    (trip: TripOption, options?: { showNoDueAlert?: boolean }) => {
      if (isEditMode || lockedAmount != null) {
        selectLedgerTrip(trip.id);
        return;
      }
      skipSmartTagClearRef.current = true;
      selectLedgerTrip(trip.id);

      const preview = tripFinancialPreviewByTripId[trip.id];
      const tag = resolveMissionTripSmartTag(trip, type, preview);
      if (tag) {
        lastNoDueAlertTripIdRef.current = null;
        applyTripSmartTag(trip, tag);
        return;
      }
      const weight = getLedgerTripDueWeight(trip);
      if (weight > 0) {
        lastNoDueAlertTripIdRef.current = null;
        setAmountStr(formatLedgerSyncAmountInput(weight));
        setSmartTagSuggestedAmount(weight);
        setSmartTagHighlight(null);
        return;
      }

      setSmartTagHighlight(null);
      setSmartTagSuggestedAmount(null);

      const noDue =
        preview != null && !tripFinancialSnapshotHasRelevantDue(preview, type, ledgerLockedEntityType);
      if (!noDue) return;

      if (
        options?.showNoDueAlert &&
        lastNoDueAlertTripIdRef.current !== trip.id
      ) {
        lastNoDueAlertTripIdRef.current = trip.id;
        Alert.alert(
          "No pending due",
          ledgerTripNoDueHeroMessage(
            type,
            ledgerLockedEntityType,
            trip.trip_number,
          ),
          [{ text: "OK" }],
        );
      }
    },
    [
      isEditMode,
      lockedAmount,
      tripFinancialPreviewByTripId,
      resolveMissionTripSmartTag,
      type,
      ledgerLockedEntityType,
      applyTripSmartTag,
      getLedgerTripDueWeight,
      formatLedgerSyncAmountInput,
      selectLedgerTrip,
    ],
  );

  const selectedTripNoDueNotice = useMemo(() => {
    const tid = selectedTripIds[0];
    if (!tid || !fullPage) return null;
    const preview = tripFinancialPreviewByTripId[tid];
    if (!preview || tripFinancialSnapshotHasRelevantDue(preview, type, ledgerLockedEntityType)) {
      return null;
    }
    return ledgerTripNoDueHeroMessage(
      type,
      ledgerLockedEntityType,
      resolveTripOptionById(tid)?.trip_number,
    );
  }, [
    selectedTripIds,
    fullPage,
    tripFinancialPreviewByTripId,
    type,
    ledgerLockedEntityType,
    resolveTripOptionById,
  ]);

  const ledgerWizardTripLedgerPreview = useMemo(() => {
    const tid = selectedTripIds[0];
    if (!tid) return null;
    return resolveLedgerTripSettlementPreview(
      tripFinancialPreviewByTripId[tid],
      type,
      ledgerLockedEntityType,
    );
  }, [
    selectedTripIds,
    tripFinancialPreviewByTripId,
    type,
    ledgerLockedEntityType,
  ]);

  const selectMissionTrip = useCallback(
    (trip: TripOption | null) => {
      if (!trip) {
        ledgerAmountUserEditedRef.current = false;
        if (smartTagSuggestedAmount != null) {
          const parsed = parseFloat(amountStr.replace(/,/g, ""));
          if (
            Number.isFinite(parsed) &&
            Math.abs(parsed - smartTagSuggestedAmount) < 0.009
          ) {
            setAmountStr("");
          }
        }
        selectLedgerTrip(null);
        return;
      }
      if (fullPage) setLedgerMissionRegistryExpanded(false);
      if (isEditMode || lockedAmount != null) {
        selectLedgerTrip(trip.id);
        return;
      }
      ledgerAmountUserEditedRef.current = false;
      fillLedgerAmountFromTripDue(trip, { showNoDueAlert: true });
    },
    [
      amountStr,
      smartTagSuggestedAmount,
      selectLedgerTrip,
      isEditMode,
      lockedAmount,
      fillLedgerAmountFromTripDue,
      fullPage,
    ],
  );

  /**
   * When IN/OUT toggles or trip financial preview hydrates, fill synchronization magnitude.
   */
  const selectedMissionTripId = selectedTripIds[0] ?? null;
  useEffect(() => {
    if (!selectedMissionTripId) {
      lastNoDueAlertTripIdRef.current = null;
    }
  }, [selectedMissionTripId]);

  useEffect(() => {
    if (!visible || !fullPage || isEditMode || lockedAmount != null) return;
    if (!selectedMissionTripId || !missionTripPreviewReady) return;
    if (ledgerAmountUserEditedRef.current) return;
    if (amountStr.replace(/,/g, "").trim()) return;
    const trip = resolveTripOptionById(selectedMissionTripId);
    if (!trip) return;
    fillLedgerAmountFromTripDue(trip, { showNoDueAlert: false });
  }, [
    visible,
    fullPage,
    isEditMode,
    lockedAmount,
    selectedMissionTripId,
    missionTripPreviewReady,
    amountStr,
    resolveTripOptionById,
    fillLedgerAmountFromTripDue,
  ]);

  useEffect(() => {
    ledgerAmountUserEditedRef.current = false;
  }, [selectedMissionTripId, type]);

  useEffect(() => {
    if (!visible) {
      ledgerAmountUserEditedRef.current = false;
    }
  }, [visible]);

  const partyOptions = useMemo(() => {
    if (type === "in" && selectedTrip) {
      const lid = selectedTrip.organization_id ?? "";
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

      if (isIntegrated) {
        const localCid =
          linkedClientIdByOrgId instanceof Map
            ? linkedClientIdByOrgId.get(lid)
            : linkedClientIdByOrgId?.[lid];
        if (localCid) {
          const client = safeClients.find((c) => c.id === localCid);
          if (client) return [client];
          // If we have a local ID but not in full list, try defaultPartyName/lockedPartyName
          if (
            (defaultPartyId === localCid || lockedPartyId === localCid) &&
            (defaultPartyName || lockedPartyName)
          ) {
            return [
              {
                id: localCid,
                name: (lockedPartyName || defaultPartyName) as string,
              },
            ];
          }
        }
      }

      const cid =
        selectedTrip.client_id && selectedTrip.client_id.trim()
          ? selectedTrip.client_id
          : null;
      const cname = (selectedTrip.client_name || "").trim().toLowerCase();
      if (cid) {
        const inList = safeClients.find((c) => c.id === cid);
        if (inList) return [inList];
        return [
          { id: cid, name: selectedTrip.client_name || "Unknown client" },
        ];
      }
      if (cname) {
        const byName = safeClients.filter(
          (c) => (c.name || "").trim().toLowerCase() === cname,
        );
        if (byName.length >= 1) return byName;
        // Never invent a blank-id party — Confirm Sync would hang/fail with
        // "Missing contact_id" while the UI still looked selected (iPad bug).
        // Fall through to the full customers list so the user picks a real client.
      }
    }
    if (type === "out" && selectedTrip) {
      const payoutMode = selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip);
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

      if (isIntegrated) {
        const localSid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
        if (localSid) {
          const supplier = safeSuppliers.find((s) => s.id === localSid);
          if (supplier) return [supplier];
          const resolvedSupplierName =
            (selectedTrip as { supplier_name?: string | null }).supplier_name?.trim() ||
            (lockedPartyName || defaultPartyName || "").trim() ||
            "Supplier";
          return [{ id: localSid, name: resolvedSupplierName }];
        }
      }

      const outOptions: PartyOption[] = [];
      if (payoutMode === "market" && selectedTrip.supplier_id) {
        const resolvedSid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
        const sup = resolvedSid
          ? safeSuppliers.find((s) => s.id === resolvedSid)
          : null;
        if (sup) {
          outOptions.push(sup);
        } else {
          const fallbackLabel =
            (selectedTrip as { supplier_name?: string | null }).supplier_name?.trim() ||
            "Supplier";
          outOptions.push({
            id: resolvedSid ?? selectedTrip.supplier_id,
            name: fallbackLabel,
          });
        }
      }
      if (selectedTrip.driver_id) {
        const dr = safeDrivers.find((d) => d.id === selectedTrip.driver_id!);
        if (dr) outOptions.push(dr);
        else outOptions.push({ id: selectedTrip.driver_id, name: "Driver" });
      }
      if (outOptions.length > 0) return outOptions;
    }
    if (partyContext === "customers") {
      const list = safeClients;
      if (
        defaultPartyId &&
        defaultPartyName &&
        !list.some((p) => p.id === defaultPartyId)
      )
        return [{ id: defaultPartyId, name: defaultPartyName }, ...list];
      return list;
    }
    if (partyContext === "suppliers") {
      const list = safeSuppliers;
      if (
        defaultPartyId &&
        defaultPartyName &&
        !list.some((p) => p.id === defaultPartyId)
      )
        return [{ id: defaultPartyId, name: defaultPartyName }, ...list];
      return list;
    }
    if (partyContext === "dco") {
      const list = safeDcoPayees;
      if (
        defaultPartyId &&
        defaultPartyName &&
        !list.some((p) => p.id === defaultPartyId)
      )
        return [{ id: defaultPartyId, name: defaultPartyName }, ...list];
      return list;
    }
    let options = allParties;
    // In edit mode, ensure the entry's party appears in the list (e.g. if not in current clients/suppliers).
    if (initialEntry?.contact_id && initialEntry.party_name) {
      const exists = options.some((p) => p.id === initialEntry!.contact_id);
      if (!exists)
        options = [
          { id: initialEntry.contact_id, name: initialEntry.party_name },
          ...options,
        ];
    }
    // Ledger (all): Cash OUT can be supplier, driver, or "Driver salary" (then pick driver); plus Misc.
    if (partyContext === "all") {
      if (type === "out" && safeDrivers.length > 0) {
        options = [
          ...options,
          ...safeDrivers,
          { id: "driver-salary", name: "Driver salary" },
        ];
      }
      options = [...options, { id: "misc", name: "Misc / Unlinked" }];
    }
    return options;
  }, [
    type,
    selectedTrip,
    selectedTripPayoutMode,
    safeClients,
    safeSuppliers,
    safeDcoPayees,
    safeDrivers,
    allParties,
    partyContext,
    initialEntry,
    defaultPartyId,
    defaultPartyName,
    viewerOrgId,
    linkedClientIdByOrgId,
    resolveLocalSupplierPartyIdFromTrip,
    lockedPartyId,
    lockedPartyName,
  ]);

  /** Cash OUT: payee from the party row (picker or smart tag). Can differ from `effectivePartyId` when the list is scoped by a locked entity. */
  const cashOutPayeeId =
    type === "out" &&
    partyId != null &&
    partyId !== "misc" &&
    partyId !== "driver-salary"
      ? partyId
      : null;

  const cashOutPayeeName =
    cashOutPayeeId == null
      ? null
      : (partyOptions.find((p) => p.id === cashOutPayeeId)?.name ??
          safeDrivers.find((d) => d.id === cashOutPayeeId)?.name ??
          safeSuppliers.find((s) => s.id === cashOutPayeeId)?.name ??
          null);
  const supplierCategorySelected =
    type === "out" &&
    category != null &&
    SUPPLIER_CATEGORIES.includes(category as SupplierCategory);
  const associatedSupplierNameForOut =
    type === "out" && selectedTrip
      ? (() => {
          const sid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
          if (sid) {
            const supplierName = safeSuppliers.find((s) => s.id === sid)?.name?.trim();
            if (supplierName) return supplierName;
          }
          const tripSupplierName = (
            selectedTrip as { supplier_name?: string | null }
          ).supplier_name?.trim();
          return tripSupplierName || null;
        })()
      : null;

  const resolvedLockedPartyName = (() => {
    if (!lockedPartyId) return null;
    const raw = (lockedPartyName ?? "").trim();
    const lower = raw.toLowerCase();
    const isGeneric =
      lower === "" ||
      lower === "supplier" ||
      lower === "client" ||
      lower === "driver" ||
      lower === "entry";
    if (!isGeneric) return raw;

    const lockedId = (lockedPartyId ?? "").trim();
    if (lockedId) {
      const byId =
        partyOptions.find((p) => p.id === lockedId)?.name?.trim() ||
        safeSuppliers.find((s) => s.id === lockedId)?.name?.trim() ||
        safeClients.find((c) => c.id === lockedId)?.name?.trim() ||
        safeDrivers.find((d) => d.id === lockedId)?.name?.trim() ||
        null;
      if (byId) return byId;
    }

    if (type === "out" && associatedSupplierNameForOut?.trim()) {
      return associatedSupplierNameForOut.trim();
    }

    const defaultId = (defaultPartyId ?? "").trim();
    if (defaultId) {
      const byDefault =
        safeSuppliers.find((s) => s.id === defaultId)?.name?.trim() ||
        safeClients.find((c) => c.id === defaultId)?.name?.trim() ||
        safeDrivers.find((d) => d.id === defaultId)?.name?.trim() ||
        null;
      if (byDefault) return byDefault;
    }

    return raw || null;
  })();

  const effectivePartyName =
    isPartyLocked && type === "in"
      ? resolvedLockedPartyName
      : tripLocked &&
          category === "DRIVER COMMISSION" &&
          type === "out" &&
          ((selectedTrip?.driver_id &&
            safeDrivers.find((d) => d.id === selectedTrip.driver_id)?.name?.trim()) ||
            ((selectedTrip as { driver_display_name?: string | null } | null)
              ?.driver_display_name ?? "")
              .trim())
        ? ((selectedTrip?.driver_id &&
            safeDrivers.find((d) => d.id === selectedTrip.driver_id)?.name?.trim()) ||
            ((selectedTrip as { driver_display_name?: string | null } | null)
              ?.driver_display_name ?? "")
              .trim())
      : type === "out" && cashOutPayeeName?.trim()
        ? cashOutPayeeName.trim()
        : type === "out" &&
            supplierCategorySelected &&
            associatedSupplierNameForOut?.trim()
          ? associatedSupplierNameForOut.trim()
        : isPartyLocked
          ? resolvedLockedPartyName
          : partyId
            ? (partyOptions.find((c) => c.id === partyId)?.name ?? null)
            : null;

  const headerPartyName =
    (() => {
      const raw = (effectivePartyName ?? "").trim();
      const generic =
        raw === "" ||
        raw.toLowerCase() === "supplier" ||
        raw.toLowerCase() === "client" ||
        raw.toLowerCase() === "driver";
      if (!generic) return raw;
      if (type !== "out" || !selectedTrip) return raw || null;

      if (associatedSupplierNameForOut?.trim()) return associatedSupplierNameForOut.trim();

      const tripOrgId = (selectedTrip.organization_id ?? "").trim();
      if (tripOrgId) {
        const byLinkedOrg = safeSuppliers.find(
          (s) =>
            (s.linked_organization_id ?? "").trim() === tripOrgId &&
            (s.name ?? "").trim().length > 0,
        );
        if (byLinkedOrg?.name?.trim()) return byLinkedOrg.name.trim();
      }

      const tripSupplierName = (
        (selectedTrip as { supplier_name?: string | null }).supplier_name ?? ""
      ).trim();
      if (tripSupplierName) return tripSupplierName;

      return raw || null;
    })();

  /**
   * Entity sheet opens add-entry with party locked to client/supplier, but trip smart tags set
   * `partyId` to the actual payout counterparty (driver/supplier). `effectivePartyId` stays locked
   * for trip filtering — use `partyId` / `cashOutPayeeId` for OUT settlement party + submit when it is a driver/supplier.
   */
  const tripLockedOutPayoutCounterpartyId =
    tripLocked &&
    type === "out" &&
    (
      (partyId != null &&
        partyId !== "misc" &&
        partyId !== "driver-salary" &&
        (safeDrivers.some((d) => d.id === partyId) ||
          safeSuppliers.some((s) => s.id === partyId)))
        ? partyId
        : (category === "DRIVER COMMISSION" && selectedTrip?.driver_id
            ? selectedTrip.driver_id
            : null)
    );
  const tripLockedOutPayoutCounterpartyName =
    tripLockedOutPayoutCounterpartyId == null
      ? null
      : (safeDrivers.find((d) => d.id === tripLockedOutPayoutCounterpartyId)?.name ??
          safeSuppliers.find((s) => s.id === tripLockedOutPayoutCounterpartyId)?.name ??
          "")
          .trim() || null;

  const isDriverSalaryParty =
    type === "out" && effectivePartyId === "driver-salary";
  const isDriverPayment =
    type === "out" &&
    (isDriverSalaryParty ||
      (cashOutPayeeId != null &&
        safeDrivers.some((d) => d.id === cashOutPayeeId)));
  const isDriverCommissionCategory =
    type === "out" && category === "DRIVER COMMISSION";
  const isExplicitNonSupplierOutCategory =
    type === "out" &&
    category != null &&
    !(SUPPLIER_CATEGORIES as readonly string[]).includes(
      category as SupplierCategory,
    ) &&
    ((EXPENSE_CATEGORIES as readonly string[]).includes(category) ||
      VEHICLE_EXPENSE_PARTIES.some(
        (p) => p.id === category || p.name === category,
      ));
  const isSupplierPayment =
    type === "out" &&
    !hidePartyForCashOut &&
    !isExplicitNonSupplierOutCategory &&
    (cashOutPayeeId != null
      ? safeSuppliers.some((s) => s.id === cashOutPayeeId)
      : effectivePartyId != null &&
        safeSuppliers.some((s) => s.id === effectivePartyId));
  const isClientPayment =
    type === "in" &&
    effectivePartyId != null &&
    safeClients.some((c) => c.id === effectivePartyId);

  /** Category list for the current context: Receivables (Cash IN), Supplier (Cash OUT), or legacy expense (backward compat when no party). */
  const categoriesForPicker = useMemo(() => {
    if (type === "in") return [...CLIENT_CATEGORIES]; // Receivables — always show when Cash IN (not tied to party selection)
    if (type === "out" && isSupplierPayment) {
      const selectedMode = selectedTrip
        ? selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip)
        : null;
      if (selectedMode === "asset") return [];
      return [...SUPPLIER_CATEGORIES];
    }
    if (hidePartyForCashOut && type === "out") return []; // Vehicle: category is the first field (party = vehicle category)
    // Legacy / fallback: old EXPENSE_CATEGORIES for any other Cash OUT
    return hidePartyForCashOut
      ? EXPENSE_CATEGORIES.filter(
          (c) => c !== "DRIVER SALARY" && c !== "DRIVER COMMISSION",
        )
      : [...EXPENSE_CATEGORIES];
  }, [
    type,
    isSupplierPayment,
    hidePartyForCashOut,
    selectedTrip,
    selectedTripPayoutMode,
  ]);

  const isVehicleExpenseOut = hidePartyForCashOut && type === "out";
  /** Cash OUT with a vehicle expense category (Fuel, Toll, etc.) — show vehicle row and store vehicle_number. */
  const isVehicleExpenseCategory =
    type === "out" &&
    category != null &&
    VEHICLE_CATEGORIES.includes(category as VehicleCategory);
  const supplierNeedsTrip =
    requireTripForSupplierOut && isSupplierPayment && selectedTripIds.length === 0;

  // Trip required when not locked, party is selected (not misc), and there are trips to link.
  // Monthly Salary: trip is optional (driver payment type "salary").
  const tripRequired =
    !tripLocked &&
    effectivePartyId != null &&
    effectivePartyId !== "misc" &&
    filteredTrips.length > 0 &&
    !(isDriverPayment && driverPaymentType === "salary");
  const hasValidTrip = !tripRequired || selectedTripIds.length > 0;

  // Trip-locked cash IN with no resolvable client_id (e.g. name-only "nihas logs")
  // must show a party picker — otherwise Confirm Sync submits a blank contact_id.
  const tripLockedCashInNeedsPartyPick = useMemo(() => {
    if (!tripLocked || type !== "in" || !selectedTrip) return false;
    const lid = (selectedTrip as { organization_id?: string | null })
      .organization_id;
    const isIntegrated = isCrossOrgIntegrationTrip(
      {
        organization_id: selectedTrip.organization_id ?? "",
        indent_id: selectedTrip.indent_id ?? null,
        supplier_id: selectedTrip.supplier_id ?? null,
      },
      viewerOrgId,
    );
    if (isIntegrated && lid != null) {
      const localCid =
        (linkedClientIdByOrgId instanceof Map
          ? linkedClientIdByOrgId.get(lid)
          : linkedClientIdByOrgId?.[lid]) ?? null;
      if (localCid && String(localCid).trim()) return false;
    }
    const tripCid = (selectedTrip.client_id ?? "").trim();
    return !tripCid;
  }, [
    tripLocked,
    type,
    selectedTrip,
    viewerOrgId,
    linkedClientIdByOrgId,
  ]);

  // Party required: user must select a party (incl. Misc when no other option).
  // When tripLocked with a linked client, party is derived — no party field shown.
  // Reject blank ids (legacy synthetic `{ id: "" }` options must not enable Confirm Sync).
  const hasValidPartyId =
    typeof effectivePartyId === "string" && effectivePartyId.trim().length > 0;
  const hasValidParty =
    (tripLocked && !tripLockedCashInNeedsPartyPick) ||
    (hasValidPartyId &&
      (effectivePartyId !== "misc" ||
        (type === "in" && safeClients.length === 0) ||
        (type === "out" &&
          safeSuppliers.length === 0 &&
          safeDrivers.length === 0 &&
          !hidePartyForCashOut)));
  const needsLedgerPartyPick =
    (!tripLocked || tripLockedCashInNeedsPartyPick) && !isPartyLocked;

  // Category / payment type required when the field is shown.
  // Cash IN payment types are always CLIENT_CATEGORIES (picker is not tied to party).
  const hasValidCategory =
    (type === "in" &&
      category != null &&
      (CLIENT_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "in" &&
      !isClientPayment &&
      !tripLocked &&
      category != null &&
      (EXPENSE_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "out" &&
      isSupplierPayment &&
      category != null &&
      (SUPPLIER_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "out" &&
      isDriverPayment &&
      (isDriverSalaryParty
        ? driverIdForSalary != null
        : driverPaymentType != null || isVehicleExpenseCategory)) ||
    (type === "out" && isVehicleExpenseOut && effectivePartyId != null) ||
    (type === "out" &&
      !isDriverPayment &&
      !isVehicleExpenseOut &&
      category != null &&
      ((EXPENSE_CATEGORIES as readonly string[]).includes(category) ||
        category === "SUPPLIER COST"));

  /** Entry date: when non-empty must be valid YYYY-MM-DD; empty falls back to today in submit. */
  const entryDateError =
    entryDate.trim().length > 0 ? dateISO()(entryDate) : null;

  const canSubmit =
    amount > 0 &&
    amount <= VALIDATION.AMOUNT_MAX &&
    hasValidParty &&
    hasValidCategory &&
    hasValidTrip &&
    !supplierNeedsTrip &&
    !entryDateError;
  const submitBlockReason = !canSubmit
    ? !hasValidParty
      ? type === "in"
        ? "Select a customer to authorize this payment."
        : "Select a party to authorize this entry."
      : !hasValidCategory
        ? type === "in"
          ? "Select a payment type."
          : "Select a category."
        : amount <= 0
          ? "Enter an amount."
          : entryDateError
            ? entryDateError
            : supplierNeedsTrip
              ? "Link a trip for this supplier payment."
              : !hasValidTrip
                ? "Select a trip."
                : "Complete the required fields to authorize."
    : null;

  const ledgerMobileFlow = fullPage && stackTripFinancialBand;
  /** Opened from trip detail — desktop single-page; mobile uses 2-step wizard. */
  const ledgerTripDirectCapture =
    fullPage &&
    !isEditMode &&
    Boolean(tripLocked || (defaultTripId ?? "").trim());
  const ledgerTripDirectTwoStepFlow =
    ledgerTripDirectCapture && ledgerMobileFlow && !isEditMode;
  const ledgerUseMobileWizard = ledgerMobileFlow;

  const ledgerWizardFromPartyContext = Boolean(
    entryContextLabel ||
      isPartyLocked ||
      lockedEntityTypeProp ||
      (dueAmountIn != null && dueAmountIn > 0) ||
      (dueAmountOut != null && dueAmountOut > 0),
  );

  /** Finance entity overlay — pick trip (due first) before amount; not trip-detail direct capture. */
  const ledgerEntityTripPickFlow = Boolean(
    fullPage &&
      !isEditMode &&
      !tripLocked &&
      !(defaultTripId ?? "").trim() &&
      (ledgerWizardFromPartyContext || lockedVehicleId != null),
  );

  const ledgerCaptureSinglePageActive =
    fullPage &&
    !isEditMode &&
    !ledgerEntityTripPickFlow &&
    (ledgerFullPageViewportFit ||
      (ledgerTripDirectCapture && !ledgerMobileFlow));

  /** Entity flow after trip pick (or explicit no-trip): same left/right split as capture mode. */
  const ledgerEntityPastTripPick =
    ledgerEntityTripPickFlow &&
    (selectedTripIds.length > 0 || !ledgerMissionRegistryExpanded);

  const ledgerDesktopPaymentSplitActive =
    ledgerCaptureSinglePageActive || ledgerEntityPastTripPick;

  const ledgerWizardTrips = useMemo(() => {
    const source =
      ledgerWizardFromPartyContext || partyId != null || tripLocked
        ? filteredTrips
        : ledgerMissionTripsBase;
    return source.map((t) => {
      const due = getLedgerTripDueWeight(t as TripOption);
      return {
        id: t.id,
        trip_number: t.trip_number,
        route_label: t.route_label ?? null,
        trip_date: t.trip_date ?? null,
        client_name: t.client_name ?? null,
        supplier_name: (t as { supplier_name?: string | null }).supplier_name ?? null,
        dueAmount: due > 0 ? due : null,
      };
    });
  }, [
    ledgerWizardFromPartyContext,
    partyId,
    tripLocked,
    filteredTrips,
    ledgerMissionTripsBase,
    getLedgerTripDueWeight,
  ]);

  const ledgerWizardPartyOptions = useMemo(
    () =>
      partyOptions.map((p) => {
        let entityType: PartyEntityType = "client";
        if (safeSuppliers.some((s) => s.id === p.id)) entityType = "supplier";
        else if (safeDrivers.some((d) => d.id === p.id)) entityType = "driver";
        const party = p as PartyOption;
        return {
          id: party.id,
          name: party.name,
          avatar_url: party.avatar_url ?? null,
          avatar_seed: party.avatar_seed ?? null,
          entityType,
          is_integrated: party.is_integrated === true,
        };
      }),
    [partyOptions, safeSuppliers, safeDrivers],
  );

  const ledgerPartyVisual = useMemo(() => {
    const id = effectivePartyId;
    const name = (effectivePartyName ?? "").trim() || "—";
    if (!id || id === "misc" || id === "driver-salary") {
      return {
        name,
        partyEntityType: "client" as PartyEntityType,
        partyAvatarUrl: null as string | null,
        partyAvatarSeed: null as string | null,
        partyIsIntegrated: false,
      };
    }
    const client = safeClients.find((c) => c.id === id);
    if (client) {
      return {
        name: client.name || name,
        partyEntityType: "client" as PartyEntityType,
        partyAvatarUrl: client.avatar_url ?? null,
        partyAvatarSeed: client.avatar_seed ?? null,
        partyIsIntegrated: client.is_integrated === true,
      };
    }
    const supplier = safeSuppliers.find((s) => s.id === id);
    if (supplier) {
      return {
        name: supplier.name || name,
        partyEntityType: "supplier" as PartyEntityType,
        partyAvatarUrl: supplier.avatar_url ?? null,
        partyAvatarSeed: supplier.avatar_seed ?? null,
        partyIsIntegrated: false,
      };
    }
    const driver = safeDrivers.find((d) => d.id === id);
    if (driver) {
      return {
        name: driver.name || name,
        partyEntityType: "driver" as PartyEntityType,
        partyAvatarUrl: driver.avatar_url ?? null,
        partyAvatarSeed: driver.avatar_seed ?? null,
        partyIsIntegrated: false,
      };
    }
    return {
      name,
      partyEntityType: "client" as PartyEntityType,
      partyAvatarUrl: null,
      partyAvatarSeed: null,
      partyIsIntegrated: false,
    };
  }, [effectivePartyId, effectivePartyName, safeClients, safeSuppliers, safeDrivers]);

  const ledgerWizardFlowSessionKey = useMemo(
    () =>
      [
        entryContextLabel ?? "",
        lockedPartyId ?? "",
        defaultTripId ?? "",
        defaultType ?? "",
        type,
        String(visible),
      ].join("|"),
    [
      entryContextLabel,
      lockedPartyId,
      defaultTripId,
      defaultType,
      type,
      visible,
    ],
  );

  useEffect(() => {
    if (!visible || !fullPage) return;
    if (ledgerEntityTripPickFlow || ledgerWizardFromPartyContext) {
      setMissionTripFilterDue("has_due");
    }
  }, [visible, fullPage, ledgerEntityTripPickFlow, ledgerWizardFromPartyContext]);

  useEffect(() => {
    if (!visible || !ledgerEntityTripPickFlow) return;
    setLedgerMissionRegistryExpanded(true);
    selectLedgerTrip(null);
    setAmountStr("");
    ledgerAmountUserEditedRef.current = false;
  }, [visible, ledgerEntityTripPickFlow, ledgerWizardFlowSessionKey, selectLedgerTrip]);

  useEffect(() => {
    if (!visible) {
      setLedgerDesktopWizardStep(1);
      return;
    }
    if (ledgerFullPageViewportFit) {
      setLedgerDesktopWizardStep(1);
    }
  }, [visible, ledgerWizardFlowSessionKey, ledgerFullPageViewportFit]);

  useEffect(() => {
    if (!ledgerDesktopPaymentSplitActive) return;
    if (isEditMode || lockedAmount != null) return;
    if (ledgerAmountUserEditedRef.current) return;
    if (amountStr.replace(/,/g, "").trim()) return;
    if (ledgerDueAmountInr != null && ledgerDueAmountInr > 0) {
      setAmountStr(formatLedgerSyncAmountInput(ledgerDueAmountInr));
    }
  }, [
    ledgerDesktopPaymentSplitActive,
    isEditMode,
    lockedAmount,
    amountStr,
    ledgerDueAmountInr,
    formatLedgerSyncAmountInput,
  ]);

  useEffect(() => {
    if (!visible || !ledgerUseMobileWizard || isEditMode || lockedAmount != null) return;
    if (amountStr.replace(/,/g, "").trim()) return;
    const partyDue = type === "in" ? dueAmountIn : dueAmountOut;
    if (partyDue != null && partyDue > 0) {
      setAmountStr(formatAmountDuePlaceholder(partyDue));
    }
  }, [
    visible,
    ledgerUseMobileWizard,
    isEditMode,
    lockedAmount,
    amountStr,
    type,
    dueAmountIn,
    dueAmountOut,
  ]);

  const ledgerWizardPaymentTypeItems = useMemo((): LedgerPaymentTypeItem[] => {
    if (type === "in") {
      return categoriesForPicker.map((cat) => ({
        key: cat,
        label: cat,
        kind: cat,
        selected: category === cat,
        onPress: () => {
          setCategory(cat);
          setPaymentTypeExpanded(false);
        },
      }));
    }
    if (isDriverPayment) {
      return [
        ...DRIVER_PAYMENT_TYPES.map((opt) => ({
          key: opt.type,
          label: opt.label,
          kind: opt.type,
          selected: driverPaymentType === opt.type,
          onPress: () => {
            setDriverPaymentType(opt.type);
            setCategory(null);
            setPaymentTypeExpanded(false);
          },
        })),
        ...VEHICLE_CATEGORIES.map((cat) => ({
          key: `vehicle-${cat}`,
          label: cat,
          kind: cat,
          selected: driverPaymentType == null && category === cat,
          onPress: () => {
            setDriverPaymentType(null);
            setCategory(cat);
            setPaymentTypeExpanded(false);
          },
        })),
      ];
    }
    return categoriesForPicker.map((cat) => ({
      key: cat,
      label: cat,
      kind: cat,
      selected: category === cat,
      onPress: () => {
        setCategory(cat);
        setPaymentTypeExpanded(false);
      },
    }));
  }, [
    type,
    categoriesForPicker,
    category,
    isDriverPayment,
    driverPaymentType,
  ]);

  const ledgerWizardShowPaymentType = ledgerWizardPaymentTypeItems.length > 0;

  const ledgerMobileTwoStepTripFlow =
    ledgerUseMobileWizard &&
    !ledgerTripDirectTwoStepFlow &&
    tripLocked &&
    !isEditMode &&
    ledgerWizardShowPaymentType &&
    (isPartyLocked || partyId != null) &&
    Boolean(defaultType);

  /** Mobile party/entity flows: amount → payment capture (skip multi-step review). */
  const ledgerPaymentCaptureAfterAmount =
    ledgerUseMobileWizard &&
    !isEditMode &&
    !ledgerTripDirectTwoStepFlow &&
    !ledgerMobileTwoStepTripFlow;

  useEffect(() => {
    if (!paymentModeId) {
      setPaymentModeExpanded(true);
    }
  }, [paymentModeId]);

  useEffect(() => {
    const hasSelection = isDriverPayment
      ? driverPaymentType != null
      : category != null;
    if (!hasSelection) {
      setPaymentTypeExpanded(true);
    }
  }, [category, driverPaymentType, isDriverPayment]);

  // When modal opens: prefill from initialEntry (edit) or defaultPartyId (add); on close, hide pickers.
  // Do not depend on partyOptions here: selecting a trip changes partyOptions and would re-run this effect and reset tripId.
  const partyOptionsRef = React.useRef(partyOptions);
  partyOptionsRef.current = partyOptions;
  useEffect(() => {
    if (!visible) {
      setShowPartyPicker(false);
      setShowTripPicker(false);
      setShowCategoryPicker(false);
      setShowDriverForSalaryPicker(false);
      setDriverIdForSalary(null);
      return;
    }
    if (initialEntry?.id) {
      const isIn = (initialEntry.amount_in ?? 0) > 0;
      setType(isIn ? "in" : "out");
      setAmountStr(
        String(initialEntry.amount_in || initialEntry.amount_out || 0),
      );
      const desc = (initialEntry as { description?: string }).description ?? "";
      const isVehicleExpenseDesc =
        desc &&
        VEHICLE_EXPENSE_PARTIES.some((p) => p.id === desc || p.name === desc);
      const isDriverSalaryEntry =
        initialEntry.contact_id &&
        (initialEntry.party_name === "Driver salary" ||
          desc === "DRIVER SALARY" ||
          desc === "Monthly salary" ||
          desc === "Monthly Salary");
      setPartyId(
        isDriverSalaryEntry
          ? "driver-salary"
          : isVehicleExpenseDesc && !initialEntry.contact_id
            ? (VEHICLE_EXPENSE_PARTIES.find(
                (p) => p.id === desc || p.name === desc,
              )?.id ?? desc)
            : (initialEntry.contact_id ?? null),
      );
      setDriverIdForSalary(
        isDriverSalaryEntry ? (initialEntry.contact_id ?? null) : null,
      );
      const matchedClientCat =
        desc && (CLIENT_CATEGORIES as readonly string[]).includes(desc);
      const matchedSupplierCat =
        desc && (SUPPLIER_CATEGORIES as readonly string[]).includes(desc);
      const matchedLegacyCat =
        desc && (EXPENSE_CATEGORIES as readonly string[]).includes(desc);
      setCategory(
        matchedClientCat || matchedSupplierCat || matchedLegacyCat
          ? desc
          : ((isVehicleExpenseDesc
              ? (VEHICLE_EXPENSE_PARTIES.find(
                  (p) => p.id === desc || p.name === desc,
                )?.id ?? null)
              : null) ?? null),
      );
      setDriverIdForSalary(
        isDriverSalaryEntry && initialEntry.contact_id != null ? initialEntry.contact_id : null
      );
      const tid = initialEntry.trip_id;
      setSelectedTripIds(tid !== undefined && tid !== null ? [tid] : []);
      setCategory(desc && (EXPENSE_CATEGORIES as readonly string[]).includes(desc) ? desc : null);
    } else {
      if (defaultTripId != null) setSelectedTripIds([defaultTripId]);
      if (defaultType != null) {
        const lockedType = deriveLedgerLockedEntityType(
          lockedEntityTypeProp,
          partyContext,
          lockedPartyId != null,
        );
        const flowGuard = ledgerLockedPartyFlowGuard(
          defaultType,
          lockedType,
          lockedPartyId,
        );
        setType(
          flowGuard && lockedType
            ? ledgerLockedPartyPreferredFlow(lockedType)
            : defaultType,
        );
      }
      if (defaultContactId != null) {
        setPartyId(defaultContactId);
      } else if (lockedPartyId != null) {
        setPartyId(lockedPartyId);
      } else if (defaultPartyId != null) {
        setPartyId(defaultPartyId);
      } else {
        setPartyId(null);
      }
      setAmountStr(lockedAmount != null ? String(lockedAmount) : "");
      if (defaultTripId == null) setSelectedTripIds([]);
      setCategory(null);
      setDriverPaymentType(
        (defaultDriverPaymentType == null ? null : defaultDriverPaymentType) as DriverPaymentType | null
      );
    }
    // Vehicle context lock: pre-select the locked vehicle so trips/expense flow already know which
    // vehicle this entry belongs to (otherwise the trip filter is empty until user picks one).
    if (lockedVehicleId != null) {
      setSelectedVehicleIdForExpense(lockedVehicleId);
    }
  }, [
    visible,
    defaultPartyId,
    lockedPartyId,
    lockedAmount,
    lockedVehicleId,
    defaultTripId,
    defaultType,
    defaultContactId,
    defaultDriverPaymentType,
    initialEntry?.id,
    initialEntry?.amount_in,
    initialEntry?.amount_out,
    initialEntry?.contact_id,
    initialEntry?.trip_id,
    initialEntry?.description,
    initialEntry,
    lockedEntityTypeProp,
    partyContext,
  ]);

  // Clear party when it is no longer in the filtered list (e.g. context or type/trip change). Skip when party is locked.
  useEffect(() => {
    if (!visible || isPartyLocked) return;
    if (partyId != null && !partyOptions.some((p) => p.id === partyId)) {
      setPartyId(null);
      if (partyId === "driver-salary") setDriverIdForSalary(null);
    }
  }, [visible, partyId, partyOptions, isPartyLocked]);
  // When switching away from "Driver salary", clear driver selection.
  useEffect(() => {
    if (!visible || effectivePartyId !== "driver-salary")
      setDriverIdForSalary(null);
  }, [visible, effectivePartyId]);

  // Keep trip as the primary selector. If party/trip conflict, clear party instead of trip.
  // Skip when tripLocked — trip is fixed and party is derived from it.
  useEffect(() => {
    if (!visible || tripLocked || !effectivePartyIdForTrips || selectedTripIds.length === 0)
      return;
    // If the UI has only one possible party for the selected trip/context, keep it stable.
    // This prevents an auto-select/clear ping-pong that can cause render-depth overflow on web.
    if (
      partyOptions.length === 1 &&
      partyOptions[0]?.id != null &&
      partyOptions[0].id === effectivePartyIdForTrips
    ) {
      return;
    }
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    const isDriver = safeDrivers.some((d) => d.id === effectivePartyIdForTrips);
    const supplierLinkedOrgId =
      supplierLinkedOrgIds?.[effectivePartyIdForTrips];
    for (const tid of selectedTripIds) {
      const trip = safeTrips.find((t) => t.id === tid);
      if (!trip) continue;
      const clientIdMatch = trip.client_id === effectivePartyIdForTrips;
      const clientNameMatch =
        Boolean(effectivePartyName && (trip.client_name || "").trim()) &&
        (trip.client_name || "").trim().toLowerCase() ===
          (effectivePartyName || "").trim().toLowerCase();
      const tripMatches =
        clientIdMatch ||
        clientNameMatch ||
        (isSupplier &&
          (trip.supplier_id === effectivePartyIdForTrips ||
            (supplierLinkedOrgId != null &&
              (trip as { organization_id?: string }).organization_id ===
                supplierLinkedOrgId))) ||
        (isDriver && trip.driver_id === effectivePartyIdForTrips);
      if (!tripMatches) {
        setPartyId(null);
        if (partyId === "driver-salary") setDriverIdForSalary(null);
        return;
      }
    }
  }, [
    visible,
    effectivePartyIdForTrips,
    effectivePartyName,
    partyId,
    selectedTripIds,
    safeTrips,
    safeSuppliers,
    safeDrivers,
    partyOptions,
    type,
    supplierLinkedOrgIds,
    tripLocked,
  ]);

  // Sync entry date when opening for edit or new. When from client or trip, always use today.
  useEffect(() => {
    if (!visible) return;
    if (isPartyLocked || tripLocked) {
      setEntryDate(new Date().toISOString().slice(0, 10));
      return;
    }
    setEntryDate(
      initialEntry?.transaction_date?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
    );
  }, [visible, initialEntry?.id, initialEntry?.transaction_date, isPartyLocked, tripLocked]);

  // When IN + tagged trip: auto-select the trip's client (single option or first of list). When OUT + tagged trip: auto-select if single supplier/driver. Skip when party is locked.
  useEffect(() => {
    if (!visible || isPartyLocked) return;
    if (type === "in" && selectedTrip && partyOptions.length === 1) {
      const firstId = (partyOptions[0].id ?? "").trim();
      const currentInList =
        partyId != null &&
        partyId.trim().length > 0 &&
        partyOptions.some((c) => c.id === partyId);
      if (!currentInList && firstId) setPartyId(firstId);
      return;
    }
    if (
      type === "out" &&
      selectedTrip &&
      partyOptions.length === 1 &&
      (partyOptions[0].id ?? "").trim() &&
      partyId !== partyOptions[0].id
    ) {
      setPartyId(partyOptions[0].id);
    }
  }, [visible, type, selectedTrip, partyOptions, partyId, isPartyLocked]);

  // When user selects Trip-based commission or Monthly salary, auto-fill amount from commission due or salary (payable).
  useEffect(() => {
    if (!visible || !isDriverPayment || isEditMode) return;
    if (driverPaymentType === "settlement" && lockedAmount != null) {
      setAmountStr(String(lockedAmount));
    } else if (driverPaymentType === "salary" && salaryAmount != null) {
      setAmountStr(String(salaryAmount));
    }
  }, [
    visible,
    isDriverPayment,
    isEditMode,
    driverPaymentType,
    lockedAmount,
    salaryAmount,
  ]);

  // Full page: adjust scroll padding when keyboard opens so user can scroll to focused field and submit.
  useEffect(() => {
    if (!fullPage) return;
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardPaddingBottom(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardPaddingBottom(0);
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [fullPage]);

  // When Cash OUT: default category by party — supplier → SUPPLIER COST; otherwise DRIVER SALARY for backward compat.
  useEffect(() => {
    if (
      visible &&
      hidePartyForCashOut &&
      type === "out" &&
      (category === "DRIVER SALARY" || category === "DRIVER COMMISSION")
    )
      setCategory(null);
  }, [visible, hidePartyForCashOut, type, category]);
  // Default category by party: Receivables (Cash IN) -> Trip Payment; Supplier (Cash OUT) -> Trip Payment; legacy Cash OUT -> SUPPLIER PAYMENT or DRIVER SALARY.
  useEffect(() => {
    if (!visible) return;
    if (type === "in") {
      if (!category || !CLIENT_CATEGORIES.includes(category as ClientCategory))
        setCategory("Trip Payment");
      return;
    }
    if (type === "out" && hidePartyForCashOut) return;
    if (type === "out" && isDriverPayment) return;
    if (type === "out" && isSupplierPayment) {
      if (
        !category ||
        !SUPPLIER_CATEGORIES.includes(category as SupplierCategory)
      )
        setCategory("Trip Payment");
      return;
    }
    if (type === "out" && !category) {
      // Keep user-selected OUT category (including vehicle expense categories).
      // Only seed a default when nothing is selected yet.
      setCategory("SUPPLIER PAYMENT");
    }
  }, [
    visible,
    type,
    hidePartyForCashOut,
    isDriverPayment,
    isSupplierPayment,
    isClientPayment,
    category,
  ]);

  // Driver Commission should resolve against a driver counterparty.
  useEffect(() => {
    if (!visible) return;
    if (type !== "out" || category !== "DRIVER COMMISSION") return;
    if (tripLocked || isPartyLocked) return;
    if (partyId != null && safeDrivers.some((d) => d.id === partyId)) return;
    const preferredDriverId =
      selectedTrip?.driver_id ?? (safeDrivers.length > 0 ? safeDrivers[0].id : null);
    if (preferredDriverId) setPartyId(preferredDriverId);
  }, [
    visible,
    type,
    category,
    tripLocked,
    isPartyLocked,
    partyId,
    safeDrivers,
    selectedTrip,
  ]);

  /** Vehicle number: from selected trip when present, else from explicit vehicle pick (aggregated flow). */
  const selectedVehicleNumber =
    type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory)
      ? selectedTrip?.vehicle_id
        ? (safeVehicles.find((v) => v.id === selectedTrip.vehicle_id!)
            ?.vehicle_number ?? null)
        : selectedVehicleIdForExpense
          ? (safeVehicles.find((v) => v.id === selectedVehicleIdForExpense)
              ?.vehicle_number ?? null)
          : null
      : null;

  const ledgerReconDetailRows = useMemo((): { label: string; value: string }[] => {
    const modeName = PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? "Cash";
    const typeLabel = isDriverPayment
      ? driverPaymentType != null
        ? (DRIVER_PAYMENT_TYPES.find((t) => t.type === driverPaymentType)?.label ??
          driverPaymentType)
        : null
      : (category ?? null);
    const directionLabel = type === "in" ? "Cash In" : "Cash Out";

    const reconPartySummary = (() => {
      if (tripLockedOutPayoutCounterpartyName)
        return tripLockedOutPayoutCounterpartyName;
      if (type === "out" && cashOutPayeeName?.trim())
        return cashOutPayeeName.trim();
      if (tripLocked && lockedPartyName) return lockedPartyName;
      if (isPartyLocked && type === "in") {
        const label =
          (lockedPartyName ?? "").trim() || (resolvedLockedPartyName ?? "").trim();
        if (label) return label;
      }
      if (isDriverSalaryParty && driverIdForSalary) {
        const dn = safeDrivers.find((d) => d.id === driverIdForSalary)?.name?.trim();
        return dn ? `Driver salary · ${dn}` : "Driver salary";
      }
      if (hidePartyForCashOut && type === "out" && effectivePartyId) {
        const cat =
          VEHICLE_EXPENSE_PARTIES.find((p) => p.id === effectivePartyId)?.name ??
          partyOptions.find((p) => p.id === effectivePartyId)?.name ??
          effectivePartyId;
        if (selectedVehicleNumber)
          return `${cat} · ${formatIndianVehicleNumber(selectedVehicleNumber)}`;
        return String(cat);
      }
      if (partyId === "misc") return "Misc / Unlinked";
      return effectivePartyName?.trim() || "—";
    })();

    const reconTripSummary = (() => {
      if (selectedTripIds.length === 0) return "No voyage linked";
      if (selectedTripIds.length === 1) {
        return (
          [tripNumber || lockedTripDisplay || null, selectedTrip?.route_label]
            .filter(Boolean)
            .join(" · ") || "Trip linked"
        );
      }
      const labels = selectedTripIds
        .slice(0, 3)
        .map((id) => resolveTripOptionById(id)?.trip_number ?? id)
        .join(", ");
      const extra =
        selectedTripIds.length > 3 ? ` +${selectedTripIds.length - 3} more` : "";
      return `${selectedTripIds.length} voyages · ${labels}${extra}`;
    })();

    const reconReferenceSummary = isLedgerCashPaymentMode(paymentModeId)
      ? "— (cash)"
      : paymentReference.trim() || "—";

    const reconDateSummary = formatLedgerDateDdMmYyyy(entryDate);

    return [
      { label: "Direction", value: directionLabel },
      { label: "Party Node", value: reconPartySummary },
      { label: "Payment Mode", value: modeName },
      { label: "Sync Type", value: typeLabel?.trim() || "—" },
      { label: "Reference / UTR", value: reconReferenceSummary },
      { label: "Voyage Identity", value: reconTripSummary },
      { label: "Sync Date", value: reconDateSummary },
      ...(isEditMode && initialEntry?.id
        ? [{ label: "Entry ID", value: initialEntry.id } as { label: string; value: string }]
        : []),
    ];
  }, [
    tripLockedOutPayoutCounterpartyName,
    type,
    cashOutPayeeName,
    tripLocked,
    lockedPartyName,
    resolvedLockedPartyName,
    isPartyLocked,
    isDriverSalaryParty,
    driverIdForSalary,
    safeDrivers,
    hidePartyForCashOut,
    effectivePartyId,
    partyOptions,
    selectedVehicleNumber,
    partyId,
    effectivePartyName,
    tripNumber,
    lockedTripDisplay,
    selectedTrip,
    selectedTripIds,
    resolveTripOptionById,
    paymentModeId,
    paymentReference,
    entryDate,
    isEditMode,
    initialEntry?.id,
    isDriverPayment,
    driverPaymentType,
    category,
  ]);

  const commitLedgerSubmit = () => {
    if (!canSubmit) return;
    if (
      !tripLocked &&
      (typeof effectivePartyId !== "string" || !effectivePartyId.trim())
    ) {
      // Defensive: blank synthetic party ids must never reach createLedgerEntry.
      return;
    }
    const flowGuard = ledgerLockedPartyFlowGuard(
      type,
      ledgerLockedEntityType,
      lockedPartyId,
    );
    if (flowGuard) {
      showLedgerFlowGuardAlert(flowGuard);
      return;
    }
    // When tripLocked, derive party from trip (no party field shown).
    let derivedContactId: string | null = null;
    let derivedContactType: AddTransactionData["contactType"] = null;
    let derivedPartyName: string | null = null;
    if (tripLocked && selectedTrip) {
      const lid = (selectedTrip as { organization_id?: string | null })
        .organization_id;
      const selectedTripMode = selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip);
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

      if (type === "in") {
        let localCid: string | null = null;
        if (isIntegrated && lid != null) {
          localCid =
            (linkedClientIdByOrgId instanceof Map
              ? linkedClientIdByOrgId.get(lid)
              : linkedClientIdByOrgId?.[lid]) ?? null;
        }

        if (localCid) {
          derivedContactId = localCid;
          derivedContactType = "client";
          derivedPartyName =
            safeClients.find((c) => c.id === localCid)?.name ??
            lockedPartyName ??
            defaultPartyName ??
            null;
        } else {
          const tripCid = (selectedTrip.client_id ?? "").trim() || null;
          derivedContactId = tripCid;
          derivedContactType = tripCid ? "client" : null;
          derivedPartyName = selectedTrip.client_name ?? null;
        }
        // Trip has name-only client (no id): use the party picker selection.
        if (
          !derivedContactId &&
          partyId &&
          partyId.trim() &&
          safeClients.some((c) => c.id === partyId)
        ) {
          derivedContactId = partyId;
          derivedContactType = "client";
          derivedPartyName =
            safeClients.find((c) => c.id === partyId)?.name ??
            selectedTrip.client_name ??
            null;
        }
        if (type === "in" && !derivedContactId) {
          showAppAlert(
            "Customer required",
            "This trip has no linked customer. Choose a customer in the party picker, then confirm sync.",
          );
          return;
        }
      } else {
        let localSid: string | null = resolveLocalSupplierPartyIdFromTrip(
          selectedTrip,
        );

        if (localSid) {
          derivedContactId = localSid;
          derivedContactType = "supplier";
          derivedPartyName =
            safeSuppliers.find((s) => s.id === localSid)?.name ??
            (selectedTrip as { supplier_name?: string | null }).supplier_name ??
            lockedPartyName ??
            defaultPartyName ??
            null;
        } else if (
          isPartyLocked &&
          lockedPartyId &&
          safeSuppliers.some((s) => s.id === lockedPartyId)
        ) {
          derivedContactId = lockedPartyId;
          derivedContactType = "supplier";
          derivedPartyName =
            safeSuppliers.find((s) => s.id === lockedPartyId)?.name ??
            lockedPartyName ??
            null;
        } else {
          const preferDriverForCommission = isDriverCommissionCategory;
          const preferredOutId =
            preferDriverForCommission
              ? (selectedTrip.driver_id ?? selectedTrip.supplier_id ?? null)
              : selectedTripMode === "asset"
              ? (selectedTrip.driver_id ?? selectedTrip.supplier_id ?? null)
              : (selectedTrip.supplier_id ?? selectedTrip.driver_id ?? null);
          derivedContactId = preferredOutId;
          derivedContactType =
            preferDriverForCommission
              ? selectedTrip.driver_id
                ? "driver"
                : selectedTrip.supplier_id
                  ? "supplier"
                  : null
              : selectedTripMode === "asset"
              ? selectedTrip.driver_id
                ? "driver"
                : selectedTrip.supplier_id
                  ? "supplier"
                  : null
              : selectedTrip.supplier_id
                ? "supplier"
                : selectedTrip.driver_id
                  ? "driver"
                  : null;
          derivedPartyName =
            derivedContactType === "supplier"
              ? (safeSuppliers.find((s) => s.id === selectedTrip!.supplier_id!)?.name ??
                (selectedTrip as { supplier_name?: string }).supplier_name ??
                null)
              : derivedContactType === "driver"
                ? (safeDrivers.find((d) => d.id === selectedTrip!.driver_id!)?.name ??
                  null)
                : null;
        }
      }
    }
    if (
      tripLocked &&
      selectedTrip &&
      type === "out" &&
      tripLockedOutPayoutCounterpartyId
    ) {
      const pid = tripLockedOutPayoutCounterpartyId;
      if (safeDrivers.some((d) => d.id === pid)) {
        derivedContactId = pid;
        derivedContactType = "driver";
        derivedPartyName =
          safeDrivers.find((d) => d.id === pid)?.name?.trim() ||
          (
            (selectedTrip as { driver_display_name?: string | null })
              .driver_display_name ?? ""
          ).trim() ||
          derivedPartyName;
      } else if (safeSuppliers.some((s) => s.id === pid)) {
        derivedContactId = pid;
        derivedContactType = "supplier";
        derivedPartyName =
          safeSuppliers.find((s) => s.id === pid)?.name?.trim() ||
          (
            (selectedTrip as { supplier_name?: string | null }).supplier_name ??
            ""
          ).trim() ||
          derivedPartyName;
      }
    }
    const isUnlinkedMisc =
      !tripLocked && effectivePartyId === "misc";
    const contactType: AddTransactionData["contactType"] = tripLocked
      ? derivedContactType
      : isUnlinkedMisc
        ? null
        : type === "out" &&
            cashOutPayeeId &&
            (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
              safeSuppliers.some((s) => s.id === cashOutPayeeId) ||
              safeDcoPayees.some((d) => d.id === cashOutPayeeId))
          ? safeDrivers.some((d) => d.id === cashOutPayeeId)
            ? "driver"
            : safeDcoPayees.some((d) => d.id === cashOutPayeeId)
              ? "dco"
              : "supplier"
          : isPartyLocked && effectivePartyId
            ? safeClients.some((c) => c.id === effectivePartyId)
              ? "client"
              : safeSuppliers.some((s) => s.id === effectivePartyId)
                ? "supplier"
                : safeDrivers.some((d) => d.id === effectivePartyId)
                  ? "driver"
                  : safeDcoPayees.some((d) => d.id === effectivePartyId)
                    ? "dco"
                    : null
            : type === "in"
              ? "client"
              : type === "out" && effectivePartyId
                ? safeDrivers.some((d) => d.id === effectivePartyId)
                  ? "driver"
                  : safeDcoPayees.some((d) => d.id === effectivePartyId)
                    ? "dco"
                    : "supplier"
                : null;
    const finalContactId =
      tripLocked && derivedContactId
        ? derivedContactId
        : isDriverSalaryParty
          ? driverIdForSalary
          : isUnlinkedMisc
            ? null
            : type === "out" &&
                cashOutPayeeId &&
                (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
                  safeSuppliers.some((s) => s.id === cashOutPayeeId) ||
                  safeDcoPayees.some((d) => d.id === cashOutPayeeId))
              ? cashOutPayeeId
              : (effectivePartyId ?? undefined);
    const finalContactType =
      tripLocked ? derivedContactType : isDriverSalaryParty
        ? "driver"
        : isUnlinkedMisc
          ? null
          : (contactType ?? undefined);
    const isVehicleExpenseEntry =
      type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory);
    const normalizedContactIdForSubmit = isVehicleExpenseEntry
      ? null
      : (finalContactId ?? undefined);
    const normalizedContactTypeForSubmit = isVehicleExpenseEntry
      ? null
      : (finalContactType ?? undefined);
    const finalDriverPaymentType = isDriverSalaryParty
      ? "salary"
      : isDriverPayment
        ? (driverPaymentType ?? undefined)
        : undefined;
    const finalPartyName =
      tripLocked && derivedPartyName
        ? derivedPartyName
        : isDriverSalaryParty
          ? "Driver salary"
          : isUnlinkedMisc
            ? "Misc / Unlinked"
            : type === "out" && cashOutPayeeName?.trim()
              ? cashOutPayeeName.trim()
              : (effectivePartyName ?? null);
    const normalizedCategory =
      category === "SUPPLIER COST" ? "SUPPLIER PAYMENT" : category;

    const guardTrips: TripOption[] =
      selectedTripIds.length > 0
        ? selectedTripIds
            .map((id) => resolveTripOptionById(id))
            .filter((t): t is TripOption => t != null)
        : selectedTrip
          ? [selectedTrip]
          : [];
    for (const tr of guardTrips) {
      const mode = resolveTripLedgerTripType(tr);
      const isSupplierPaymentForAssetTrip =
        type === "out" &&
        mode === "asset" &&
        ((normalizedCategory != null &&
          SUPPLIER_CATEGORIES.includes(normalizedCategory as SupplierCategory)) ||
          finalContactType === "supplier");
      if (isSupplierPaymentForAssetTrip) {
        Alert.alert(
          "Supplier payment restricted",
          "Supplier payment is not allowed for asset-based trips. Use driver payment or vehicle expense for this trip.",
        );
        return;
      }
    }

    const data: AddTransactionData = {
      type,
      amount,
      partyId:
        tripLocked && derivedContactId
          ? derivedContactId
          : isUnlinkedMisc
            ? null
            : type === "out" &&
                cashOutPayeeId &&
                (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
                  safeSuppliers.some((s) => s.id === cashOutPayeeId))
              ? cashOutPayeeId
              : effectivePartyId,
      partyName: finalPartyName,
      tripId: isUnlinkedMisc ? null : selectedTripIds[0] ?? null,
      tripNumber: isUnlinkedMisc ? null : tripNumber || null,
      category:
        type === "in"
          ? (isClientPayment || tripLocked)
            ? (normalizedCategory ?? undefined)
            : undefined
          : type === "out"
            ? isVehicleExpenseOut
              ? (effectivePartyId ?? undefined)
              : isVehicleExpenseCategory || !isDriverPayment
                ? (normalizedCategory ?? undefined)
                : undefined
            : undefined,
      driverPaymentType: isVehicleExpenseEntry ? undefined : finalDriverPaymentType,
      contactId: normalizedContactIdForSubmit ?? undefined,
      contactType: normalizedContactTypeForSubmit ?? undefined,
      vehicleNumber: selectedVehicleNumber ?? undefined,
      driverName:
        type === "out" && normalizedContactTypeForSubmit === "driver"
          ? (safeDrivers.find((d) => d.id === (normalizedContactIdForSubmit ?? ""))?.name ??
            effectivePartyName ??
            null)
          : undefined,
      indentId: selectedTrip?.indent_id ?? undefined,
      transactionDate: /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
        ? entryDate
        : undefined,
      paymentMode: paymentModeId,
      paymentReference: paymentReference.trim() || null,
    };
    void (async () => {
      if (ledgerSubmitting) return;
      setLedgerSubmitting(true);
      try {
        if (isEditMode && initialEntry?.id) {
          await Promise.resolve(onSubmit(data, { entryId: initialEntry.id }));
        } else {
          await Promise.resolve(onSubmit(data));
        }
        if (fullPage) {
          if (ledgerSubmitConfirmVisible || ledgerUseMobileWizard) {
            setLedgerReconSucceeded(true);
          } else if (onSuccessDismiss) {
            onSuccessDismiss();
          } else {
            onClose();
          }
          return;
        }
        setAmountStr("");
        setPartyId(null);
        setSelectedTripIds([]);
        setCategory(null);
        setDriverPaymentType(null);
        onClose();
      } catch {
        // onSubmit surfaces its own error to the user (Alert) before rejecting.
        // Swallow here so the modal stays open (no success/dismiss) without the
        // rejection escaping this fire-and-forget IIFE as an unhandled rejection.
      } finally {
        setLedgerSubmitting(false);
      }
    })();
  };

  const dismissFullPageAfterLedgerSave = useCallback(() => {
    if (onSuccessDismiss) {
      onSuccessDismiss();
      return;
    }
    onClose();
  }, [onSuccessDismiss, onClose]);

  const handleLedgerReconSuccessComplete = useCallback(() => {
    setLedgerReconSucceeded(false);
    setLedgerSubmitConfirmVisible(false);
    dismissFullPageAfterLedgerSave();
  }, [dismissFullPageAfterLedgerSave]);

  const handleClose = () => {
    setLedgerReconSucceeded(false);
    setLedgerSubmitConfirmVisible(false);
    setLedgerSyncDatePickerVisible(false);
    setShowPartyPicker(false);
    setShowTripPicker(false);
    setShowCategoryPicker(false);
    setShowDriverPaymentTypePicker(false);
    setShowDriverForSalaryPicker(false);
    setShowVehiclePicker(false);
    setSelectedVehicleIdForExpense(null);
    setPartyId(null);
    setDriverPaymentType(null);
    setDriverIdForSalary(null);
    onClose();
  };

  const closeAllPickers = () => {
    setShowPartyPicker(false);
    setShowTripPicker(false);
    setShowCategoryPicker(false);
    setShowDriverPaymentTypePicker(false);
    setShowDriverForSalaryPicker(false);
    setShowVehiclePicker(false);
    setShowPaymentPicker(false);
    setLedgerSyncDatePickerVisible(false);
  };

  const beginLedgerSyncDatePick = useCallback(() => {
    Keyboard.dismiss();
    if (Platform.OS === "web") return;
    setLedgerSyncDatePickerVisible(true);
  }, []);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (fullPage && !ledgerUseMobileWizard) {
      Keyboard.dismiss();
      closeAllPickers();
      setLedgerSubmitConfirmVisible(true);
      return;
    }
    commitLedgerSubmit();
  };

  const pickerModalVisible =
    fullPage &&
    (showPartyPicker ||
      showTripPicker ||
      showCategoryPicker ||
      showDriverPaymentTypePicker ||
      showDriverForSalaryPicker ||
      showVehiclePicker ||
      showPaymentPicker);

  if (!visible && !fullPage) return null;
  if (fullPage && !visible) return null;

  const windowHeight = Dimensions.get("window").height;
  const panelHeight = Math.min(
    windowHeight * Layout.ledgerPanelHeightRatio,
    Layout.ledgerPanelMaxHeight,
  );
  const scrollContentPaddingBottom = fullPage
    ? 24 + keyboardPaddingBottom
    : 280;
  const submitButton = (
    <View style={styles.submitBtnWrap}>
      {submitBlockReason ? (
        <Text style={styles.submitBlockReason}>{submitBlockReason}</Text>
      ) : null}
    <TouchableOpacity
      style={[
        styles.submitBtn,
        fullPage
          ? [
              styles.submitBtnLedgerFullPage,
              stackTripFinancialBand && styles.ledgerMobSubmit,
            ]
          : type === "in"
            ? styles.submitBtnIn
            : styles.submitBtnOut,
        !canSubmit && styles.submitBtnDisabled,
      ]}
      onPress={handleSubmit}
      disabled={!canSubmit}
      activeOpacity={0.9}
    >
      {fullPage ? (
        <Sparkles
          size={stackTripFinancialBand ? 14 : 18}
          color={LedgerSyncPalette.indigo}
          strokeWidth={2}
        />
      ) : null}
      <Text
        style={[
          styles.submitBtnText,
          fullPage && styles.submitBtnTextLedger,
          fullPage && stackTripFinancialBand && styles.ledgerMobSubmitText,
          fullPage && winW < 420 && !stackTripFinancialBand && styles.submitBtnTextLedgerTight,
        ]}
      >
        {fullPage
          ? isEditMode
            ? "UPDATE FINANCIAL SYNC"
            : winW < 420
              ? "AUTHORIZE SYNC"
              : "AUTHORIZE FINANCIAL SYNC"
          : isEditMode
            ? "UPDATE ENTRY"
            : "SAVE ENTRY"}
      </Text>
    </TouchableOpacity>
    </View>
  );
  const selectedPaymentModeName =
    PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? "Cash";
  const selectedPaymentModeIcon =
    PAYMENT_MODE_ICON[paymentModeId] ?? "circle-o";
  const selectedPaymentTypeLabel = isDriverPayment
    ? (driverPaymentType != null
        ? (DRIVER_PAYMENT_TYPES.find((t) => t.type === driverPaymentType)?.label ??
          driverPaymentType)
        : (isVehicleExpenseCategory ? category : null))
    : (category ?? null);
  const selectedPaymentTypeIcon = selectedPaymentTypeLabel
    ? (PAYMENT_TYPE_ICON[selectedPaymentTypeLabel] ?? "circle-o")
    : "circle-o";
  const previewAmountText =
    amountStr.trim().length > 0 && Number.isFinite(amount) && amount > 0
      ? amount.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : ledgerAmountPlaceholder;
  const previewDirectionLabel = type === "in" ? "Cash In" : "Cash Out";

  const renderLedgerSyncV2 = () => {
    const accent = type === "in" ? Theme.darkGreen : Theme.teslaRed;
    const todayIso = ledgerIsoFromDate(new Date());
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterdayIso = ledgerIsoFromDate(yDate);

    /** Protocol strips: desktop = one row each; mobile = horizontal scroll in side-by-side columns. */
    const mob = stackTripFinancialBand;
    const protocolTileGap = mob
      ? LEDGER_PROTOCOL_TILE_GAP.compact
      : LEDGER_PROTOCOL_TILE_GAP.desktop;
    /** Mobile column: more tiles visible in horizontal scroll. */
    const LEDGER_PROTOCOL_TILES_ACROSS_MOBILE = 7;
    const LEDGER_PROTOCOL_STRIP_VARIANT = mob ? "compact" : "desktop";
    /** Stack synchronization + date vertically on very narrow widths. */
    const LEDGER_MOBILE_STACK_BREAKPOINT = 430;
    /** Stacked trip band only: allow side-by-side sync cards on wider phones/tablets. */
    const LEDGER_SYNC_HERO_PAIR_WIDE_MIN = 820;

    const ledgerProtocolSplitWrapPad = 12 * 2;

    const ledgerNarrowPhone = winW < LEDGER_MOBILE_STACK_BREAKPOINT;

    /** Full-page ledger on desktop split layout. */
    const ledgerTripDesktopSplit = fullPage && !stackTripFinancialBand;
    /** Desktop capture: single page — category + amount on right; mode + UTR on left. */
    const ledgerDesktopOnSetupStep = false;
    const ledgerDesktopOnPaymentStep = ledgerDesktopPaymentSplitActive;
    const LEDGER_PROTOCOL_SUMMARY_LOGO = ledgerTripDesktopSplit ? 20 : mob ? 18 : 20;
    const selectedLedgerTripId =
      selectedTripIds[0] ?? (defaultTripId?.trim() || null);
    const activeLedgerTrip =
      selectedLedgerTripId != null
        ? (missionTripsFiltered.find((t) => t.id === selectedLedgerTripId) ??
          missionTrips.find((t) => t.id === selectedLedgerTripId) ??
          resolveTripOptionById(selectedLedgerTripId))
        : null;
    /** Minimize voyage registry after selection (all full-page widths; previously desktop-only). */
    const ledgerTripFocusMode =
      fullPage && !!selectedLedgerTripId && !tripLocked;
    const ledgerNoTripMinimized =
      fullPage &&
      !tripLocked &&
      selectedLedgerTripId == null &&
      !ledgerMissionRegistryExpanded;
    /** Entity finance page: trip pick is step 1 — hide payment until a trip is chosen. */
    const ledgerPartyTripPickGate =
      ledgerEntityTripPickFlow &&
      selectedLedgerTripId == null &&
      !ledgerNoTripMinimized;
    /** Stacked mobile/tablet: cap list height; desktop split fills the matched pane height. */
    const missionListMaxHeight = ledgerPartyTripPickGate
      ? Math.min(520, Math.max(320, Math.floor(Dimensions.get("window").height * 0.45)))
      : stackTripFinancialBand
        ? Math.min(240, Math.max(140, Math.floor(Dimensions.get("window").height * 0.26)))
        : 320;

    /** Split desktop band: always stack sync value + date vertically; stacked mobile band uses width rule. */
    const ledgerSyncHeroStack =
      !stackTripFinancialBand ||
      ledgerNarrowPhone ||
      (stackTripFinancialBand && winW < LEDGER_SYNC_HERO_PAIR_WIDE_MIN);

    const paymentTypeItems =
      type === "in"
        ? categoriesForPicker.map((cat) => ({
            key: cat,
            label: cat,
            selected: category === cat,
            onPress: () => {
              setCategory(cat);
              setPaymentTypeExpanded(false);
            },
            icon: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
          }))
        : isDriverPayment
          ? [
              ...DRIVER_PAYMENT_TYPES.map((opt) => ({
                key: opt.type,
                label: opt.label,
                selected: driverPaymentType === opt.type,
                onPress: () => {
                  setDriverPaymentType(opt.type);
                  setCategory(null);
                  setPaymentTypeExpanded(false);
                },
                icon:
                  PAYMENT_TYPE_ICON[opt.type] ??
                  PAYMENT_TYPE_ICON[opt.label] ??
                  "circle-o",
              })),
              ...VEHICLE_CATEGORIES.map((cat) => ({
                key: `vehicle-${cat}`,
                label: cat,
                selected: driverPaymentType == null && category === cat,
                onPress: () => {
                  setDriverPaymentType(null);
                  setCategory(cat);
                  setPaymentTypeExpanded(false);
                },
                icon: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
              })),
            ]
          : categoriesForPicker.map((cat) => ({
              key: cat,
              label: cat,
              selected: category === cat,
              onPress: () => {
                setCategory(cat);
                setPaymentTypeExpanded(false);
              },
            icon: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
          }));

    /** Mode / category tiles: inner width uses actual full-page horizontal padding + column gap (matches panel). */
    const pagePadTotal = ledgerFullPagePadH * 2;
    const ledgerProtocolRowColGap = 10;
    const topBandWrapInnerW = winW - pagePadTotal - ledgerProtocolSplitWrapPad;
    const topBandColInnerW = (topBandWrapInnerW - ledgerProtocolRowColGap) / 2;
    /** Desktop split: protocol sits in the 7/12 right pane — size tiles from that column, not full window. */
    const LEDGER_TRIP_PANE_GAP = 10;
    const LEDGER_TRIP_PANE_PAD = 14;
    const LEDGER_TRIP_RIGHT_FLEX = 7;
    const LEDGER_TRIP_FLEX_TOTAL = 12;
    const desktopRightPaneInnerW = ledgerTripDesktopSplit
      ? Math.max(
          160,
          ((topBandWrapInnerW - LEDGER_TRIP_PANE_GAP) * LEDGER_TRIP_RIGHT_FLEX) /
            LEDGER_TRIP_FLEX_TOTAL -
            LEDGER_TRIP_PANE_PAD * 2 -
            ledgerProtocolSplitWrapPad,
        )
      : topBandColInnerW;
    const ledgerProtocolTileWidthMobile = Math.max(
      32,
      Math.floor(
        (topBandColInnerW -
          protocolTileGap * (LEDGER_PROTOCOL_TILES_ACROSS_MOBILE - 1)) /
          LEDGER_PROTOCOL_TILES_ACROSS_MOBILE,
      ),
    );
    const syncModeCount = PAYMENT_MODES.length;
    const paymentTypeCount = paymentTypeItems.length;
    const LEDGER_DESKTOP_PROTOCOL_TILE_WIDTH = 76;
    /** Desktop split: fixed tile width + horizontal scroll so CATEGORY row never clips. */
    const protocolDesktopTileCount = Math.max(syncModeCount, paymentTypeCount);
    const protocolDesktopUnifiedTileWidth = ledgerTripDesktopSplit
      ? LEDGER_DESKTOP_PROTOCOL_TILE_WIDTH
      : Math.max(
          44,
          Math.floor(
            (desktopRightPaneInnerW -
              protocolTileGap * (protocolDesktopTileCount - 1)) /
              protocolDesktopTileCount,
          ),
        );
    const LEDGER_DESKTOP_TYPE_TILE_MIN = protocolDesktopUnifiedTileWidth;
    const paymentTypeFitsDesktopRow =
      paymentTypeCount * LEDGER_DESKTOP_TYPE_TILE_MIN +
        (paymentTypeCount - 1) * protocolTileGap <=
      desktopRightPaneInnerW;
    const protocolModeTileWidth = ledgerTripDesktopSplit
      ? protocolDesktopUnifiedTileWidth
      : ledgerProtocolTileWidthMobile;
    const protocolTypeTileWidth = ledgerTripDesktopSplit
      ? protocolDesktopUnifiedTileWidth
      : ledgerProtocolTileWidthMobile;
    const protocolModeStripUsesScroll =
      mob || !ledgerTripDesktopSplit || ledgerTripDesktopSplit;
    const protocolTypeStripUsesScroll =
      mob || !ledgerTripDesktopSplit || !paymentTypeFitsDesktopRow || ledgerTripDesktopSplit;

    /** Desktop: SYNC MODE row, then PAYMENT TYPE row; compact mobile: single side-by-side row. */
    const ledgerProtocolModeStripOpen =
      ledgerTripDesktopSplit || paymentModeExpanded;
    const ledgerProtocolTypeStripOpen =
      ledgerTripDesktopSplit || paymentTypeExpanded;

    const protocolModeCenterRow =
      ledgerTripDesktopSplit &&
      !protocolModeStripUsesScroll &&
      syncModeCount < paymentTypeCount;

    const ledgerProtocolSyncModeSection = (
      <LedgerProtocolStripSection
        title="SYNC MODE"
        variant={LEDGER_PROTOCOL_STRIP_VARIANT}
        stripOpen={ledgerProtocolModeStripOpen}
        onExpand={() => setPaymentModeExpanded(true)}
        summaryIcon={
          <PaymentModeLogo modeId={paymentModeId} size={LEDGER_PROTOCOL_SUMMARY_LOGO} />
        }
        summaryLabel={selectedPaymentModeName}
        usesScroll={protocolModeStripUsesScroll}
        tileGap={protocolTileGap}
        centerRow={protocolModeCenterRow}
        sectionStyle={
          ledgerDesktopOnPaymentStep
            ? undefined
            : ledgerTripDesktopSplit
              ? styles.ledgerProtocolSectionStackBottom
              : stackTripFinancialBand
                ? styles.ledgerProtocolSectionStackBottom
                : styles.ledgerProtocolSectionSideLeft
        }
      >
        {PAYMENT_MODES.map((opt) => {
          const selected = paymentModeId === opt.id;
          return (
            <LedgerProtocolStripModeTile
              key={opt.id}
              modeId={opt.id}
              label={PAYMENT_MODE_LABEL_SHORT[opt.id] ?? opt.name}
              selected={selected}
              variant={LEDGER_PROTOCOL_STRIP_VARIANT}
              width={protocolModeTileWidth}
              onPress={() => {
                setPaymentModeId(opt.id);
                setPaymentModeExpanded(false);
              }}
            />
          );
        })}
      </LedgerProtocolStripSection>
    );

    const ledgerProtocolCategorySection = (
      <LedgerProtocolStripSection
        title={
          type === "in"
            ? "PAYMENT TYPE"
            : isDriverPayment
              ? "PAYMENT TYPE"
              : "CATEGORY"
        }
        variant={LEDGER_PROTOCOL_STRIP_VARIANT}
        stripOpen={ledgerProtocolTypeStripOpen}
        onExpand={() => setPaymentTypeExpanded(true)}
        summaryIcon={
          <LedgerPaymentTypeIcon
            kind={selectedPaymentTypeLabel ?? ""}
            size={LEDGER_PROTOCOL_SUMMARY_LOGO}
          />
        }
        summaryLabel={selectedPaymentTypeLabel ?? ""}
        usesScroll={protocolTypeStripUsesScroll}
        tileGap={protocolTileGap}
        sectionStyle={
          ledgerDesktopOnSetupStep && ledgerDesktopPaymentSplitActive
            ? undefined
            : ledgerTripDesktopSplit && !ledgerDesktopOnSetupStep
              ? styles.ledgerProtocolSectionStackTop
              : stackTripFinancialBand
                ? styles.ledgerProtocolSectionStackTop
                : styles.ledgerProtocolSectionSideRight
        }
      >
        {paymentTypeItems.map((item) => (
          <LedgerProtocolStripTypeTile
            key={String(item.key)}
            kind={item.label}
            label={item.label}
            selected={item.selected}
            variant={LEDGER_PROTOCOL_STRIP_VARIANT}
            width={protocolTypeTileWidth}
            onPress={item.onPress}
          />
        ))}
      </LedgerProtocolStripSection>
    );

    const ledgerModeCategoryTopBand = (
      <LedgerProtocolWorkbench stacked={ledgerTripDesktopSplit} compact={mob}>
        {ledgerProtocolSyncModeSection}
        {ledgerProtocolCategorySection}
      </LedgerProtocolWorkbench>
    );

    const ledgerDesktopLeftCategoryTitle =
      type === "in"
        ? "Payment type"
        : isDriverPayment
          ? "Payment type"
          : "Category";

    const ledgerDesktopProtocolStrip = (items: React.ReactNode) => (
      <ScrollView
        horizontal
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.ledgerDesktopProtocolStripRow,
          { gap: protocolTileGap },
        ]}
      >
        {items}
      </ScrollView>
    );

    const capturePaymentTypeCollapsed =
      ledgerDesktopPaymentSplitActive &&
      !paymentTypeExpanded &&
      Boolean(selectedPaymentTypeLabel);
    const capturePaymentModeCollapsed =
      ledgerDesktopPaymentSplitActive && !paymentModeExpanded && Boolean(paymentModeId);

    const ledgerDesktopPartyBand = (
      <View style={styles.ledgerDesktopPaymentSectionCard}>
        <View style={styles.ledgerDesktopSectionHead}>
          <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconParty]}>
            <User size={15} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.ledgerDesktopSectionHeadText}>
            <Text style={styles.ledgerDesktopSectionEyebrow}>
              {type === "in" ? "Customer" : "Party"}
            </Text>
            <Text style={styles.ledgerDesktopSectionHint}>
              {type === "in"
                ? "Who is paying this amount?"
                : "Who is this entry for?"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.selectorSummaryCard}
          onPress={() => {
            setShowTripPicker(false);
            setShowCategoryPicker(false);
            setShowPartyPicker((v) => !v);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.selectorSummaryMain}>
            <Text
              style={[
                styles.selectorSummaryText,
                !effectivePartyName && styles.selectorSummaryPlaceholder,
              ]}
              numberOfLines={1}
            >
              {effectivePartyName ||
                (type === "in" ? "Select customer" : "Select party")}
            </Text>
          </View>
          <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
        </TouchableOpacity>
        {!hasValidParty ? (
          <Text style={styles.fieldErrorText}>
            {type === "in"
              ? "This trip has no linked customer. Choose one to authorize."
              : "Choose a party to authorize."}
          </Text>
        ) : null}
      </View>
    );

    const ledgerDesktopLeftCategoryBand = (
      <View style={styles.ledgerDesktopPaymentSectionCard}>
        <View style={styles.ledgerDesktopSectionHead}>
          <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconCategory]}>
            <LedgerPaymentTypeIcon
              kind={selectedPaymentTypeLabel ?? "Trip Payment"}
              size={15}
            />
          </View>
          <View style={styles.ledgerDesktopSectionHeadText}>
            <Text style={styles.ledgerDesktopSectionEyebrow}>
              {ledgerDesktopLeftCategoryTitle}
            </Text>
            {!capturePaymentTypeCollapsed ? (
              <Text style={styles.ledgerDesktopSectionHint}>
                What kind of entry is this?
              </Text>
            ) : null}
          </View>
          {capturePaymentTypeCollapsed ? (
            <TouchableOpacity
              style={styles.ledgerDesktopCategoryChangeBtn}
              onPress={() => setPaymentTypeExpanded(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.ledgerDesktopCategoryChangeText}>Change</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {capturePaymentTypeCollapsed ? (
          <TouchableOpacity
            style={styles.selectorSummaryCard}
            onPress={() => setPaymentTypeExpanded(true)}
            activeOpacity={0.85}
          >
            <View style={styles.selectorSummaryMain}>
              <View style={styles.selectorSummaryIconSm}>
                <LedgerPaymentTypeIcon
                  kind={selectedPaymentTypeLabel ?? ""}
                  size={22}
                />
              </View>
              <Text style={styles.selectorSummaryText}>{selectedPaymentTypeLabel}</Text>
            </View>
            <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
          </TouchableOpacity>
        ) : (
          ledgerDesktopProtocolStrip(
            paymentTypeItems.map((item) => (
              <LedgerProtocolStripTypeTile
                key={String(item.key)}
                kind={item.label}
                label={item.label}
                selected={item.selected}
                variant={LEDGER_PROTOCOL_STRIP_VARIANT}
                width={protocolTypeTileWidth}
                onPress={item.onPress}
              />
            )),
          )
        )}
      </View>
    );

    const ledgerDesktopModeBand = (
      <View style={styles.ledgerDesktopPaymentSectionCard}>
        <View style={styles.ledgerDesktopSectionHead}>
          <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconMode]}>
            <Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />
          </View>
          <View style={styles.ledgerDesktopSectionHeadText}>
            <Text style={styles.ledgerDesktopSectionEyebrow}>Payment mode</Text>
            {!capturePaymentModeCollapsed ? (
              <Text style={styles.ledgerDesktopSectionHint}>How this money moved</Text>
            ) : null}
          </View>
          {capturePaymentModeCollapsed ? (
            <TouchableOpacity
              style={styles.ledgerDesktopCategoryChangeBtn}
              onPress={() => setPaymentModeExpanded(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.ledgerDesktopCategoryChangeText}>Change</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {capturePaymentModeCollapsed ? (
          <TouchableOpacity
            style={styles.selectorSummaryCard}
            onPress={() => setPaymentModeExpanded(true)}
            activeOpacity={0.85}
          >
            <View style={styles.selectorSummaryMain}>
              <View style={styles.selectorSummaryIconSm}>
                <PaymentModeLogo modeId={paymentModeId} size={22} />
              </View>
              <Text style={styles.selectorSummaryText}>{selectedPaymentModeName}</Text>
            </View>
            <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
          </TouchableOpacity>
        ) : (
          ledgerDesktopProtocolStrip(
            PAYMENT_MODES.map((opt) => {
              const selected = paymentModeId === opt.id;
              return (
                <LedgerProtocolStripModeTile
                  key={opt.id}
                  modeId={opt.id}
                  label={PAYMENT_MODE_LABEL_SHORT[opt.id] ?? opt.name}
                  selected={selected}
                  variant={LEDGER_PROTOCOL_STRIP_VARIANT}
                  width={protocolModeTileWidth}
                  onPress={() => {
                    setPaymentModeId(opt.id);
                    setPaymentModeExpanded(false);
                  }}
                />
              );
            }),
          )
        )}
      </View>
    );

    const ledgerSyncAmountHero = (
        <View
          style={[
            styles.syncAmountCard,
            styles.syncAmountCardSide,
            styles.syncHeroBandCard,
            ledgerDesktopOnPaymentStep
              ? styles.syncAmountCardLight
              : styles.syncAmountCardPulse,
            !ledgerDesktopOnPaymentStep && ledgerTripDesktopSplit && styles.syncAmountCardPulseDesktop,
            mob && styles.ledgerMobSyncAmount,
            ledgerSyncHeroStack && styles.syncHeroCardFullWidth,
            stackTripFinancialBand && styles.syncAmountCardMobileAlign,
            !ledgerDesktopOnPaymentStep && ledgerTripDesktopSplit && styles.syncAmountCardDesktopHero,
            ledgerDesktopOnPaymentStep && styles.syncAmountCardDesktopPaymentStep,
            selectedTripNoDueNotice && styles.syncAmountCardNoDueHighlight,
          ]}
        >
          {!ledgerDesktopOnPaymentStep ? (
            <View style={styles.syncAmountGlow} pointerEvents="none" />
          ) : null}
          {!ledgerDesktopOnPaymentStep && ledgerWizardTripLedgerPreview ? (
            <View style={styles.ledgerTripPreviewWrap}>
              <LedgerTripSettlementNote
                preview={ledgerWizardTripLedgerPreview}
                enteredInr={amount}
                compact={mob}
              />
            </View>
          ) : !ledgerDesktopOnPaymentStep && selectedTripNoDueNotice ? (
            <View style={[styles.ledgerSyncNoDueBanner, mob && styles.ledgerMobNoDueBanner]}>
              <CircleEllipsis
                size={mob ? 12 : 13}
                color={LedgerSyncPalette.muted}
                strokeWidth={2}
              />
              <Text
                style={[styles.ledgerSyncNoDueBannerText, mob && styles.ledgerMobNoDueBannerText]}
              >
                {selectedTripNoDueNotice}
              </Text>
            </View>
          ) : null}
          {!ledgerDesktopOnPaymentStep ? (
          <Text
            style={[
              styles.syncAmountEyebrow,
              styles.syncAmountEyebrowPulse,
              stackTripFinancialBand && styles.syncSectionEyebrowMobile,
              mob && styles.ledgerMobSyncEyebrow,
            ]}
          >
            Synchronization Magnitude
          </Text>
          ) : null}
          <View
            style={[
              styles.syncAmountRow,
              stackTripFinancialBand && styles.syncAmountRowMobile,
              ledgerTripDesktopSplit && styles.syncAmountRowHeroDesktop,
            ]}
          >
            <Text
              style={[
                styles.syncRupee,
                styles.syncRupeeSide,
                ledgerDesktopOnPaymentStep ? styles.syncRupeeLight : styles.syncRupeePulse,
                mob && styles.ledgerMobSyncRupee,
                !ledgerDesktopOnPaymentStep && ledgerTripDesktopSplit && styles.syncAmountHeroRupeeDesktop,
              ]}
            >
              ₹
            </Text>
            <TextInput
              style={[
                styles.syncAmountInput,
                styles.syncAmountInputSide,
                ledgerDesktopOnPaymentStep ? styles.syncAmountInputLight : styles.syncAmountInputPulse,
                mob && styles.ledgerMobSyncInput,
                stackTripFinancialBand && styles.syncAmountInputMobileLeft,
                !ledgerDesktopOnPaymentStep && ledgerTripDesktopSplit && styles.syncAmountHeroInputDesktop,
              ]}
              placeholder={ledgerAmountPlaceholder}
              placeholderTextColor={Theme.textMutedDemo}
              value={amountStr}
              onChangeText={handleLedgerAmountInputChange}
              keyboardType="decimal-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
          {amountStr.trim().length > 0 &&
          (amount <= 0 || !Number.isFinite(parseFloat(amountStr.replace(/,/g, "")))) ? (
            <Text style={styles.fieldErrorText}>Enter a valid amount.</Text>
          ) : null}
          {ledgerDueAmountInr != null && ledgerDueAmountInr > 0 ? (
            <LedgerSettlementPctDock
              dueTotalInr={ledgerDueAmountInr}
              amountStr={amountStr}
              onAmountChange={handleLedgerQuickAmountChange}
              accentColor={type === "in" ? Theme.darkGreen : Theme.teslaRed}
              variant="light"
            />
          ) : null}
        </View>
    );

    const ledgerSyncDatePresetPills = (
      <View
        style={[
          styles.ledgerSyncDatePresetRow,
          ledgerDesktopOnPaymentStep && styles.ledgerSyncDatePresetRowInline,
        ]}
      >
            <TouchableOpacity
              style={[
              styles.ledgerSyncDatePresetPill,
              mob && styles.ledgerMobDatePreset,
              entryDate === todayIso && styles.ledgerSyncDatePresetPillOn,
              ]}
              onPress={() => {
                setLedgerSyncDatePickerVisible(false);
                setEntryDate(todayIso);
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                styles.ledgerSyncDatePresetText,
                mob && styles.ledgerMobDatePresetText,
                entryDate === todayIso && styles.ledgerSyncDatePresetTextOn,
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
              styles.ledgerSyncDatePresetPill,
              mob && styles.ledgerMobDatePreset,
              entryDate === yesterdayIso && styles.ledgerSyncDatePresetPillOn,
              ]}
              onPress={() => {
                setLedgerSyncDatePickerVisible(false);
                setEntryDate(yesterdayIso);
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                styles.ledgerSyncDatePresetText,
                mob && styles.ledgerMobDatePresetText,
                entryDate === yesterdayIso && styles.ledgerSyncDatePresetTextOn,
                ]}
              >
                Yesterday
              </Text>
            </TouchableOpacity>
          </View>
    );

    const ledgerSyncDateFieldControl = (
            <Pressable
              style={({ pressed }) => [
            styles.ledgerSyncDateField,
            mob && styles.ledgerMobDateField,
            ledgerDesktopOnPaymentStep && styles.ledgerSyncDateFieldInline,
            Platform.OS === "web" && styles.ledgerSyncDateFieldWeb,
            pressed && Platform.OS !== "web" && styles.ledgerSyncDateFieldPressed,
          ]}
          onPress={Platform.OS === "web" ? undefined : beginLedgerSyncDatePick}
              accessibilityRole="button"
              accessibilityLabel="Pick sync date"
        >
          {Platform.OS === "web" ? (
            <LedgerWebDateField
              overlay
              value={entryDate}
              minimumDate={LEDGER_DATE_PICKER_MIN_ISO}
              maximumDate={LEDGER_DATE_PICKER_MAX_ISO}
              onChange={setEntryDate}
            />
          ) : null}
          <View
            style={styles.ledgerSyncDateFieldInner}
            pointerEvents={Platform.OS === "web" ? "none" : "auto"}
            >
              <Text
              style={[styles.ledgerSyncDateFieldText, mob && styles.ledgerMobDateFieldText]}
                numberOfLines={1}
              >
                {formatLedgerDateDdMmYyyy(entryDate)}
              </Text>
            <FontAwesome name="calendar" size={mob ? 12 : 14} color={Theme.textMutedDemo} />
          </View>
            </Pressable>
    );

    const ledgerSyncDatePanel = (
        <View
          style={[
          styles.ledgerSyncDateCard,
          mob && styles.ledgerMobDateCard,
            ledgerSyncHeroStack && styles.syncHeroCardFullWidth,
            stackTripFinancialBand && styles.syncDateCardMobileAlign,
          ledgerTripDesktopSplit && styles.syncDateCardDesktopFull,
          ledgerDesktopOnPaymentStep && styles.ledgerDesktopDatePanelNested,
          entryDateError && styles.ledgerSyncDateCardError,
        ]}
      >
        {!ledgerDesktopOnPaymentStep ? (
          <Text style={[styles.ledgerFieldEyebrow, mob && styles.ledgerMobFieldEyebrow]}>
            Sync Date
          </Text>
        ) : null}
        {ledgerDesktopOnPaymentStep ? (
          <View style={styles.ledgerSyncDateInlineRow}>
            {ledgerSyncDatePresetPills}
            {ledgerSyncDateFieldControl}
          </View>
        ) : (
          <>
            {ledgerSyncDatePresetPills}
            {ledgerSyncDateFieldControl}
          </>
        )}
          {entryDateError ? <Text style={styles.fieldErrorText}>{entryDateError}</Text> : null}
        </View>
    );

    const needsLedgerPaymentReference = !isLedgerCashPaymentMode(paymentModeId);

    const ledgerReferenceCard = (
        <View
          style={[
            styles.syncReferenceCard,
            styles.syncReferenceCardTripBand,
            mob && styles.ledgerMobRefCard,
          ]}
        >
          <Text
            style={[
              styles.syncReferenceEyebrow,
              styles.syncReferenceEyebrowLedger,
              mob && styles.ledgerMobRefEyebrow,
            ]}
          >
            Reference / UTR
          </Text>
          <View style={[styles.syncReferenceInputRow, mob && styles.ledgerMobRefInput]}>
            <Hash
              size={mob ? 16 : 22}
              color={Theme.textSection}
              strokeWidth={LEDGER_LUCIDE_STROKE}
            />
            <TextInput
              style={[styles.syncReferenceInputPill, mob && styles.ledgerMobRefInputText]}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder={
                needsLedgerPaymentReference
                  ? "NEFT / UPI / bank reference"
                  : "UTR or reference (optional)"
              }
              placeholderTextColor={Theme.textMutedDemo}
              autoCorrect={false}
              autoCapitalize="characters"
              accessibilityLabel="Reference Number or UTR"
              onFocus={() => {
                if (fullPage && scrollRef.current) {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                }
              }}
            />
          </View>
        </View>
      );

    const ledgerDesktopPaymentPreview =
      ledgerDesktopOnPaymentStep && ledgerWizardTripLedgerPreview ? (
        <View style={styles.ledgerDesktopPaymentPreview}>
          <LedgerTripSettlementNote
            preview={ledgerWizardTripLedgerPreview}
            enteredInr={amount}
            compact={false}
          />
        </View>
      ) : ledgerDesktopOnPaymentStep && selectedTripNoDueNotice ? (
        <View style={[styles.ledgerSyncNoDueBanner, styles.ledgerDesktopPaymentPreview]}>
          <CircleEllipsis size={13} color={LedgerSyncPalette.muted} strokeWidth={2} />
          <Text style={styles.ledgerSyncNoDueBannerText}>{selectedTripNoDueNotice}</Text>
        </View>
      ) : null;

    const ledgerDesktopReferenceSection = (
        <View style={styles.ledgerDesktopPaymentSectionCard}>
          <View style={styles.ledgerDesktopSectionHead}>
            <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconRef]}>
              <Hash size={15} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.ledgerDesktopSectionHeadText}>
              <Text style={styles.ledgerDesktopSectionEyebrow}>Reference / UTR</Text>
              <Text style={styles.ledgerDesktopSectionHint}>
                {needsLedgerPaymentReference
                  ? "NEFT / UPI / bank transaction reference"
                  : "Optional for cash payments"}
              </Text>
            </View>
          </View>
          <View style={styles.ledgerDesktopReferenceInputWrap}>
            <TextInput
              style={styles.ledgerDesktopReferenceInput}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder={
                needsLedgerPaymentReference
                  ? "Enter UTR or bank reference"
                  : "UTR or reference (optional)"
              }
              placeholderTextColor={Theme.textMutedDemo}
              autoCorrect={false}
              autoCapitalize="characters"
              accessibilityLabel="Reference Number or UTR"
            />
          </View>
        </View>
      );

    const ledgerDesktopDateSection = ledgerDesktopOnPaymentStep ? (
      <View style={styles.ledgerDesktopPaymentSectionCard}>
        <View style={styles.ledgerDesktopSectionHead}>
          <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconDate]}>
            <Clock size={15} color={LedgerSyncPalette.ink} strokeWidth={2.2} />
          </View>
          <View style={styles.ledgerDesktopSectionHeadText}>
            <Text style={styles.ledgerDesktopSectionEyebrow}>Sync date</Text>
            <Text style={styles.ledgerDesktopSectionHint}>When this payment was made</Text>
          </View>
        </View>
        {ledgerSyncDatePanel}
      </View>
    ) : null;

    const ledgerProvisionStepCombined = (
        <ScrollView
          style={styles.ledgerDesktopPaymentScroll}
          contentContainerStyle={styles.ledgerDesktopPaymentScrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {ledgerDesktopPaymentPreview}
          <View style={styles.ledgerDesktopPaymentSectionCard}>
            <View style={styles.ledgerDesktopSectionHead}>
              <View style={[styles.ledgerDesktopSectionIcon, styles.ledgerDesktopSectionIconAmount]}>
                <Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />
              </View>
              <View style={styles.ledgerDesktopSectionHeadText}>
                <Text style={styles.ledgerDesktopSectionEyebrow}>Amount</Text>
                <Text style={styles.ledgerDesktopSectionHint}>
                  {type === "in" ? "How much was received" : "How much was paid"}
                </Text>
              </View>
            </View>
            <View style={styles.ledgerDesktopAmountSection}>
              {ledgerSyncAmountHero}
            </View>
          </View>
          {ledgerDesktopDateSection}
        </ScrollView>
    );

    const ledgerProvisionBody = ledgerDesktopPaymentSplitActive ? (
      ledgerProvisionStepCombined
    ) : (
      <View
        style={[
          styles.ledgerProvisionCard,
          mob && styles.ledgerMobProvision,
          ledgerTripDesktopSplit && styles.ledgerProvisionCardPaneFill,
        ]}
      >
        {ledgerModeCategoryTopBand}
        {ledgerReferenceCard}
        {ledgerSyncAmountHero}
        {ledgerSyncDatePanel}
      </View>
    );

    const renderMissionTripDuePills = (
      clientDue: string | null,
      supplierDue: string | null,
      driverDue: string | null,
      onDark = false,
    ) => {
      if (!clientDue && !supplierDue && !driverDue) return null;
      return (
        <View style={styles.missionTripDuePillsRow}>
          {clientDue ? (
            <View
              style={[
                styles.missionTripDuePill,
                styles.missionTripDuePillGreen,
                mob && styles.ledgerMobDuePill,
              ]}
            >
              <Text
                style={[
                  styles.missionTripDuePillText,
                  mob && styles.ledgerMobDuePillText,
                  onDark && styles.missionTripDuePillTextOnDark,
                ]}
                numberOfLines={1}
              >
                {clientDue}
              </Text>
            </View>
          ) : null}
          {supplierDue ? (
            <View
              style={[
                styles.missionTripDuePill,
                styles.missionTripDuePillRed,
                mob && styles.ledgerMobDuePill,
              ]}
            >
              <Text
                style={[
                  styles.missionTripDuePillText,
                  styles.missionTripDuePillTextRed,
                  mob && styles.ledgerMobDuePillText,
                  onDark && styles.missionTripDuePillTextOnDark,
                ]}
                numberOfLines={1}
              >
                {supplierDue}
              </Text>
            </View>
          ) : null}
          {driverDue ? (
            <View
              style={[
                styles.missionTripDuePill,
                styles.missionTripDuePillRed,
                mob && styles.ledgerMobDuePill,
              ]}
            >
              <Text
                style={[
                  styles.missionTripDuePillText,
                  styles.missionTripDuePillTextRed,
                  mob && styles.ledgerMobDuePillText,
                  onDark && styles.missionTripDuePillTextOnDark,
                ]}
                numberOfLines={1}
              >
                {driverDue}
              </Text>
            </View>
          ) : null}
        </View>
      );
    };

    const missionLedgerBlock = ledgerDesktopPaymentSplitActive ? (
      <View style={[styles.missionCard, styles.missionCardTripPaneFill]}>
        <ScrollView
          style={styles.ledgerDesktopLeftScroll}
          contentContainerStyle={styles.ledgerDesktopLeftPaymentStack}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.missionHead, styles.ledgerDesktopCaptureHead]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.missionTitle, styles.missionTitleCapture]}>Settlement</Text>
            </View>
            {ledgerTripDirectCapture ? null : ledgerTripFocusMode || ledgerNoTripMinimized ? (
              <TouchableOpacity
                onPress={() => {
                  setLedgerMissionRegistryExpanded(true);
                  if (selectedLedgerTripId) selectMissionTrip(null);
                }}
                activeOpacity={0.85}
                hitSlop={8}
              >
                <Text style={styles.missionChangeTripBtnCapture}>Change trip</Text>
              </TouchableOpacity>
            ) : tripLocked && activeLedgerTrip ? (
              <Text style={styles.missionLockedTripHint} numberOfLines={1}>
                Linked from trip
              </Text>
            ) : null}
          </View>
          {(ledgerTripFocusMode || tripLocked || ledgerTripDirectCapture) &&
          activeLedgerTrip &&
          ledgerFocusedTripCardElement
            ? ledgerFocusedTripCardElement
            : null}
          {needsLedgerPartyPick ? ledgerDesktopPartyBand : null}
          {ledgerDesktopLeftCategoryBand}
          {ledgerDesktopModeBand}
          {ledgerDesktopReferenceSection}
        </ScrollView>
      </View>
    ) : (
      <View
        style={[
          styles.missionCard,
          stackTripFinancialBand && styles.missionCardTripBandStack,
          ledgerTripDesktopSplit && styles.missionCardTripPaneFill,
        ]}
      >
        <View style={[styles.missionHead, mob && styles.ledgerMobMissionHead]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.missionTitle, mob && styles.ledgerMobMissionTitle]}>
              {ledgerPartyTripPickGate
                ? "Select trip"
                : showHeaderTripDetail
                  ? "Settlement"
                  : ledgerTripFocusMode || (tripLocked && activeLedgerTrip)
                    ? "Focused trip"
                    : ledgerNoTripMinimized
                      ? "No trip linked"
                      : ledgerEntityTripPickFlow
                        ? "Trips with due"
                        : "Select trip"}
            </Text>
          </View>
          {ledgerTripFocusMode || ledgerNoTripMinimized ? (
            <TouchableOpacity
              onPress={() => {
                setLedgerMissionRegistryExpanded(true);
                if (selectedLedgerTripId) selectMissionTrip(null);
              }}
              activeOpacity={0.85}
              hitSlop={8}
            >
              <Text style={styles.missionChangeTripBtn}>Change Trip</Text>
            </TouchableOpacity>
          ) : tripLocked && activeLedgerTrip ? (
            <Text style={styles.missionLockedTripHint} numberOfLines={1}>
              Linked from trip
            </Text>
          ) : null}
        </View>
        {!tripLocked && !ledgerTripFocusMode && !ledgerNoTripMinimized ? (
          <View style={[styles.missionToolbarRow, mob && styles.missionToolbarRowMob]}>
            {missionTripSearchExpanded || tripSearch.length > 0 ? (
              <View
            style={[
                  styles.missionSearchExpandWrap,
                  mob && styles.missionSearchExpandWrapMob,
                ]}
              >
                <Search
                  size={mob ? 13 : 14}
                  color={LedgerSyncPalette.muted}
                  strokeWidth={LEDGER_LUCIDE_STROKE}
                />
            <TextInput
                  ref={missionTripSearchInputRef}
              style={[
                    styles.missionSearchExpandInput,
                    mob && styles.missionSearchExpandInputMob,
              ]}
              value={tripSearch}
              onChangeText={setTripSearch}
                  placeholder="Voyage ID..."
                  placeholderTextColor={LedgerSyncPalette.muted}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={styles.missionSearchCollapseBtn}
                  onPress={() => {
                    setTripSearch("");
                    setMissionTripSearchExpanded(false);
                    Keyboard.dismiss();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close search"
                >
                  <X size={mob ? 14 : 16} color={LedgerSyncPalette.muted} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.missionSearchIconBtn, mob && styles.missionSearchIconBtnMob]}
                onPress={() => {
                  setMissionTripSearchExpanded(true);
                  setTimeout(() => missionTripSearchInputRef.current?.focus(), 50);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Search voyages"
              >
                <Search
                  size={mob ? 15 : 16}
                  color={LedgerSyncPalette.muted}
                  strokeWidth={LEDGER_LUCIDE_STROKE}
                />
              </TouchableOpacity>
            )}
            <ScrollView
              horizontal
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.missionFilterStripInline}
              contentContainerStyle={[
                styles.missionFilterStripContent,
                styles.missionFilterStripContentInline,
                stackTripFinancialBand && styles.missionFilterStripContentMobile,
              ]}
            >
            <View style={styles.missionFilterSegment}>
              <Text style={[styles.missionFilterLabelInline, mob && styles.ledgerMobFilterLabel]}>
                DUE
              </Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "has_due" as const, label: "Has due" },
                    { id: "no_due" as const, label: "No due" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterDue === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.missionFilterChip,
                        mob && styles.ledgerMobFilterChip,
                        on && styles.missionFilterChipOn,
                      ]}
                      onPress={() => setMissionTripFilterDue(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.missionFilterChipText,
                          mob && styles.ledgerMobFilterChipText,
                          on && styles.missionFilterChipTextOn,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.missionFilterSegment}>
              <Text style={[styles.missionFilterLabelInline, mob && styles.ledgerMobFilterLabel]}>
                TYPE
              </Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "asset" as const, label: "Asset" },
                    { id: "aggregate" as const, label: "Aggregate" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterPayout === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.missionFilterChip,
                        mob && styles.ledgerMobFilterChip,
                        on && styles.missionFilterChipOn,
                      ]}
                      onPress={() => setMissionTripFilterPayout(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.missionFilterChipText,
                          mob && styles.ledgerMobFilterChipText,
                          on && styles.missionFilterChipTextOn,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.missionFilterSegment}>
              <Text style={[styles.missionFilterLabelInline, mob && styles.ledgerMobFilterLabel]}>
                STATUS
              </Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "active" as const, label: "Active" },
                    { id: "completed" as const, label: "Completed" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterLifecycle === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.missionFilterChip,
                        mob && styles.ledgerMobFilterChip,
                        on && styles.missionFilterChipOn,
                      ]}
                      onPress={() => setMissionTripFilterLifecycle(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.missionFilterChipText,
                          mob && styles.ledgerMobFilterChipText,
                          on && styles.missionFilterChipTextOn,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
          </View>
        ) : null}
        {tripLocked && !activeLedgerTrip ? (
          <View style={styles.missionLocked}>
            <Text style={styles.missionLockedLabel}>Trip locked</Text>
            <Text style={styles.missionLockedVal} numberOfLines={2}>
              {tripNumber || lockedTripDisplay || "—"}
            </Text>
          </View>
        ) : (ledgerTripFocusMode || tripLocked) && activeLedgerTrip && ledgerFocusedTripCardElement ? (
          ledgerFocusedTripCardElement
        ) : ledgerNoTripMinimized ? (
          <View
            style={[styles.ledgerFocusedTripCard, mob && styles.ledgerMobFocusedCard]}
          >
            <View style={styles.ledgerFocusedTripInner}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 4,
                }}
              >
                <View style={styles.missionTripIconPlaceholder}>
                  <FontAwesome
                    name="unlink"
                    size={12}
                    color={Theme.textMutedDemo}
                  />
                </View>
                <Text
                  style={[
                    styles.missionTripRouteInline,
                    { flex: 1, marginHorizontal: 10 },
                  ]}
                  numberOfLines={1}
                >
                  No associated trip
                </Text>
                <FontAwesome name="check" size={12} color={accent} />
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            style={[
              styles.missionList,
              ledgerTripDesktopSplit
                ? styles.missionListDesktopFill
                : { maxHeight: missionListMaxHeight },
            ]}
            contentContainerStyle={[
              styles.missionListContentCompact,
              mob && styles.ledgerMobListContent,
            ]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            removeClippedSubviews={false}
          >
            {!ledgerTripFocusMode ? (
            <View style={styles.missionTripBlock}>
              <TouchableOpacity
                style={[
                  styles.missionTripRowCompact,
                  selectedTripIds.length === 0 && styles.missionTripRowCompactOn,
                ]}
                  onPress={() => {
                    if (fullPage) setLedgerMissionRegistryExpanded(false);
                    selectMissionTrip(null);
                  }}
                activeOpacity={0.85}
              >
                <View style={styles.missionTripIconPlaceholder}>
                  <FontAwesome name="unlink" size={12} color={Theme.textMutedDemo} />
                </View>
                <Text style={styles.missionTripRouteInline} numberOfLines={1}>
                  No associated trip
                </Text>
                {selectedTripIds.length === 0 ? (
                  <FontAwesome name="check" size={12} color={accent} />
                ) : null}
              </TouchableOpacity>
            </View>
            ) : null}
            {missionTripsFiltered.length === 0 && missionTrips.length > 0 ? (
              <Text style={styles.missionFilterEmpty}>No trips match these filters.</Text>
            ) : null}
            {missionTripsFiltered.map((t) => {
              const selected = selectedTripIds.includes(t.id);
              const routeLine = (t.route_label || "").trim() || "—";
              const preview = tripFinancialPreviewByTripId[t.id];
              const fin = preview?.financials;
              const tripPayType = preview?.trip_type;
              const tripDateLabel = (t.trip_date ?? "").trim() || "—";
              const parties = tripPartyIdsFromTrip(t);
              const showClientDuePill =
                !ledgerLockedEntityType || ledgerLockedEntityType === "CLIENT";
              const showSupplierDuePill =
                !ledgerLockedEntityType || ledgerLockedEntityType === "SUPPLIER";
              const showDriverDuePill =
                !ledgerLockedEntityType || ledgerLockedEntityType === "DRIVER";
              const clientDueAmt =
                fin && showClientDuePill
                  ? ledgerDisplayClientDue(fin, type, ledgerLockedEntityType)
                  : 0;
              const clientDue = clientDueAmt > 0 ? formatINR(clientDueAmt) : null;
              const supplierDueAmt =
                fin && showSupplierDuePill
                  ? ledgerDisplaySupplierDue(fin, type, tripPayType, ledgerLockedEntityType)
                  : 0;
              const supplierDue = supplierDueAmt > 0 ? formatINR(supplierDueAmt) : null;
              const driverDueAmt =
                fin && showDriverDuePill
                  ? ledgerDisplayDriverDue(fin, type, tripPayType, ledgerLockedEntityType)
                  : 0;
              const driverDue = driverDueAmt > 0 ? formatINR(driverDueAmt) : null;
              const pendingChips = buildMissionTripPendingChips(
                type,
                fin,
                tripPayType,
                formatINR,
                ledgerLockedEntityType,
                lockedPartyId ?? null,
                parties,
                isTripInLockedPartyScope(t),
              );
              const showNoDueTag =
                preview != null &&
                !tripFinancialSnapshotHasRelevantDue(preview, type, ledgerLockedEntityType);
              const noDueTagLabel = ledgerTripNoDueTagLabel(type, ledgerLockedEntityType);
              const showListSelection = selected && !ledgerTripFocusMode;
              return (
                <View key={t.id} style={styles.missionTripBlock}>
                  <TouchableOpacity
                    style={[
                      styles.missionTripProtocolCardCompact,
                      mob && styles.ledgerMobTripCard,
                      showListSelection && styles.missionTripProtocolCardCompactOn,
                    ]}
                    onPress={() => selectMissionTrip(t)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.missionTripProtocolTop}>
                      <View style={styles.missionTripProtocolTitleRow}>
                        <View
                          style={[
                            styles.missionTripProtocolIconCompact,
                            mob && styles.ledgerMobTripIcon,
                          ]}
                        >
                          <Route
                            size={mob ? 14 : 18}
                            color={LedgerSyncPalette.indigo}
                            strokeWidth={2}
                          />
                        </View>
                        <View style={styles.missionTripProtocolTitleCol}>
                          <Text
                            style={[
                              styles.missionTripProtocolIdCompact,
                              mob && styles.ledgerMobTripId,
                            ]}
                            numberOfLines={1}
                          >
                            {t.trip_number}
                    </Text>
                          <Text
                            style={[
                              styles.missionTripProtocolRouteCompact,
                              mob && styles.ledgerMobTripRoute,
                            ]}
                            numberOfLines={2}
                          >
                            {routeLine}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.missionTripDateBadge, mob && styles.ledgerMobDateBadge]}>
                        <Text
                          style={[
                            styles.missionTripDateBadgeText,
                            mob && styles.ledgerMobDateBadgeText,
                          ]}
                        >
                          {tripDateLabel}
                        </Text>
                      </View>
                    </View>
                  {pendingChips.length > 0 ? (
                      <View
                        style={[
                          styles.missionTripChipsInline,
                          mob && styles.ledgerMobPendingChipsRow,
                        ]}
                      >
                      {pendingChips.map((c) => (
                        <TouchableOpacity
                          key={`${c.tag}-${c.disabled ? "d" : "a"}`}
                          style={[
                            styles.missionTripPendingChip,
                              mob && styles.ledgerMobPendingChip,
                            c.disabled && styles.missionTripPendingChipDisabled,
                          ]}
                          onPress={() => {
                            if (c.disabled) {
                              if (c.tag === "client") {
                                Alert.alert(
                                  "Different party · Cash IN",
                                  "Client receipts use Cash IN. Switch to IN to record money from the client.",
                                );
                              } else {
                                Alert.alert(
                                  "Different party · Cash OUT",
                                  "Supplier and driver payments use Cash OUT. Switch to OUT to record this payment.",
                                );
                              }
                              return;
                            }
                            applyTripSmartTag(t, c.tag);
                          }}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={c.label}
                        >
                          <Text
                            style={[
                              styles.missionTripPendingChipText,
                                mob && styles.ledgerMobPendingChipText,
                              c.disabled && styles.missionTripPendingChipTextDisabled,
                            ]}
                            numberOfLines={1}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    ) : showNoDueTag ? (
                      <View
                        style={[
                          styles.missionTripChipsInline,
                          mob && styles.ledgerMobPendingChipsRow,
                        ]}
                      >
                        <View style={[styles.missionTripNoDuePill, mob && styles.ledgerMobNoDuePill]}>
                          <Text
                            style={[
                              styles.missionTripNoDuePillText,
                              mob && styles.ledgerMobNoDuePillText,
                            ]}
                            numberOfLines={1}
                          >
                            {noDueTagLabel}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      renderMissionTripDuePills(clientDue, supplierDue, driverDue)
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );

    const ledgerSyncDatePickerValue = ledgerDateFromIso(entryDate);
    const ledgerSyncAndroidPicker =
      ledgerSyncDatePickerVisible && Platform.OS === "android" ? (
        <DateTimePicker
          value={ledgerSyncDatePickerValue}
          mode="date"
          display="default"
          minimumDate={LEDGER_DATE_PICKER_MIN}
          maximumDate={LEDGER_DATE_PICKER_MAX}
          onChange={(event, date) => {
            setLedgerSyncDatePickerVisible(false);
            if (event.type === "set" && date) {
              setEntryDate(ledgerIsoFromDate(date));
            }
          }}
        />
      ) : null;

    const ledgerSyncIosPicker =
      ledgerSyncDatePickerVisible && Platform.OS === "ios" ? (
        <Modal
          transparent
          visible
          animationType="slide"
          onRequestClose={() => setLedgerSyncDatePickerVisible(false)}
        >
          <View style={styles.ledgerDatePickerBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
            onPress={() => setLedgerSyncDatePickerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss date picker"
            />
            <View
              style={[styles.ledgerDatePickerSheet, { paddingBottom: insets.bottom + 14 }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.ledgerDatePickerHeader}>
                <Text style={styles.ledgerDatePickerTitle}>Pick date</Text>
                <TouchableOpacity
                  onPress={() => setLedgerSyncDatePickerVisible(false)}
                  hitSlop={12}
                >
                  <Text style={styles.ledgerDatePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={ledgerSyncDatePickerValue}
                mode="date"
                display="spinner"
                minimumDate={LEDGER_DATE_PICKER_MIN}
                maximumDate={LEDGER_DATE_PICKER_MAX}
                onChange={(_, date) => {
                  if (date) setEntryDate(ledgerIsoFromDate(date));
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null;

    return (
      <>
      <View
        style={[
          styles.ledgerV2Shell,
          stackTripFinancialBand && styles.ledgerV2ShellMobileTablet,
          mob && styles.ledgerMobShell,
          (ledgerTripDesktopSplit || ledgerTripDirectCapture) && styles.ledgerV2ShellFill,
        ]}
      >
        <View
          style={[
            styles.ledgerV2HeaderLedger,
            mob && styles.ledgerMobHeader,
            (ledgerTripDesktopSplit || ledgerTripDirectCapture) && styles.ledgerV2HeaderLedgerShrink,
          ]}
        >
          <View style={styles.ledgerV2HeaderLeft}>
                <TouchableOpacity
              style={[styles.ledgerV2BackBtn, mob && styles.ledgerMobBackBtn]}
              onPress={onClose}
              activeOpacity={0.88}
                  accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft
                size={mob ? 18 : 22}
                color={LedgerSyncPalette.ink}
                strokeWidth={2.5}
              />
                </TouchableOpacity>
            <View style={[styles.ledgerV2HeaderDivider, mob && styles.ledgerMobHeaderDivider]} />
          <View style={styles.ledgerV2HeaderTitleBlock}>
              <LedgerHeaderTripDetail
                title={
                  ledgerDesktopPaymentSplitActive
                    ? isEditMode
                      ? "Edit ledger"
                      : "Record payment"
                    : isEditMode
                      ? "Edit ledger"
                      : "Ledger"
                }
                partyName={headerPartyName?.trim() || entryContextLabel?.trim() || null}
                tripNumber={showHeaderTripDetail ? headerTripNumber : null}
                routeLabel={showHeaderTripDetail ? headerTripRoute : null}
                hint={
                  ledgerPartyTripPickGate
                    ? "Choose a trip with outstanding due"
                    : ledgerDesktopPaymentSplitActive && !showHeaderTripDetail
                      ? "Category, amount & sync"
                      : null
                }
                compact={mob}
              />
          </View>
          </View>
          {defaultType || tripLocked || isEditMode ? null : (
          <View style={[styles.toggleWrap, styles.toggleWrapLedgerPulse]}>
            <TouchableOpacity
              style={[
                styles.toggleBtnPulse,
                mob && styles.ledgerMobToggle,
                type === "in" && styles.toggleBtnPulseIn,
              ]}
              onPress={() => requestLedgerFlowType("in")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.toggleBtnPulseText,
                  mob && styles.ledgerMobToggleText,
                  type === "in" && styles.toggleBtnPulseTextActive,
                ]}
              >
                IN
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtnPulse,
                mob && styles.ledgerMobToggle,
                type === "out" && styles.toggleBtnPulseOut,
              ]}
              onPress={() => requestLedgerFlowType("out")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.toggleBtnPulseText,
                  mob && styles.ledgerMobToggleText,
                  type === "out" && styles.toggleBtnPulseTextActive,
                ]}
              >
                OUT
              </Text>
            </TouchableOpacity>
          </View>
          )}
        </View>

        <View
          style={[
            styles.ledgerV2TripFirstBand,
            stackTripFinancialBand && styles.ledgerV2TripFirstBandStack,
            mob && styles.ledgerMobTripBand,
            ledgerTripDesktopSplit && styles.ledgerV2TripFirstBandFill,
            ledgerDesktopPaymentSplitActive && styles.ledgerV2TripFirstBandCapture,
            ledgerPartyTripPickGate && styles.ledgerV2TripFirstBandTripPickOnly,
          ]}
        >
          <View
            style={[
              styles.ledgerTripPaneCard,
              stackTripFinancialBand && styles.ledgerTripPaneCardStack,
              mob && styles.ledgerMobPaneCard,
              ledgerTripDesktopSplit && styles.ledgerTripPaneCardLeftRegistry,
              ledgerDesktopPaymentSplitActive && styles.ledgerTripPaneCardTransparent,
              ledgerPartyTripPickGate && styles.ledgerTripPaneCardTripPickFull,
            ]}
          >
            {missionLedgerBlock}
          </View>
          {!ledgerPartyTripPickGate ? (
          <View
            style={[
              styles.ledgerTripPaneCard,
              stackTripFinancialBand && styles.ledgerTripPaneCardStack,
              mob && styles.ledgerMobPaneCard,
              ledgerTripDesktopSplit && styles.ledgerTripPaneCardRightWide,
              ledgerDesktopPaymentSplitActive && styles.ledgerTripPaneCardTransparent,
            ]}
          >
            {ledgerProvisionBody}
          </View>
          ) : null}
        </View>

        {!ledgerDesktopPaymentSplitActive && !ledgerEntityTripPickFlow ? (
            <View
              style={[
            styles.ledgerV2Grid,
            isLedgerWide && styles.ledgerV2GridWide,
            ledgerTripDesktopSplit && styles.ledgerV2GridDesktopCompact,
          ]}
        >
          <View style={styles.ledgerV2Col}>
            {needsLedgerPartyPick ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
                onPress={() => {
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowPartyPicker((v) => !v);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.syncPartyLabel}>Party / person</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {effectivePartyName || "Select party"}
                </Text>
                <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
              </TouchableOpacity>
            ) : null}

            {type === "out" && isDriverSalaryParty ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowDriverPaymentTypePicker(false);
                  setShowDriverForSalaryPicker((v) => !v);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.syncPartyLabel}>Driver</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {driverIdForSalary
                    ? (safeDrivers.find((d) => d.id === driverIdForSalary)?.name ?? "Driver")
                    : "Select driver"}
                </Text>
                <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
              </TouchableOpacity>
            ) : null}

            {type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory) ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
                onPress={() => {
                  if (safeVehicles.length > 0) {
                    setShowPartyPicker(false);
                    setShowTripPicker(false);
                    setShowCategoryPicker(false);
                    setShowDriverPaymentTypePicker(false);
                    setShowDriverForSalaryPicker(false);
                    setShowVehiclePicker((v) => !v);
                  }
                }}
                activeOpacity={safeVehicles.length > 0 ? 0.85 : 1}
                disabled={safeVehicles.length === 0}
              >
                <Text style={styles.syncPartyLabel}>Vehicle</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {selectedVehicleNumber
                    ? formatIndianVehicleNumber(selectedVehicleNumber)
                    : safeVehicles.length > 0
                      ? "Select vehicle"
                      : "No vehicles"}
                </Text>
                {safeVehicles.length > 0 ? (
                  <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                ) : null}
              </TouchableOpacity>
            ) : null}

            {supplierNeedsTrip ? (
              <Text style={styles.hintText}>
                Supplier payments must be linked to a trip. Select a voyage below.
              </Text>
            ) : null}
          </View>
        </View>
        ) : null}
      </View>
      {ledgerSyncAndroidPicker}
      {ledgerSyncIosPicker}
      </>
    );
  };

  const formContent = (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoid, fullPage && styles.keyboardAvoidFullPage]}
      behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "web" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "web" ? 0 : fullPage ? 100 : 0}
      enabled={Platform.OS !== "web"}
    >
      <View
        style={[
          styles.panel,
          fullPage && styles.panelFullPage,
          ledgerFullPageViewportFit && styles.panelFullPageColumn,
          ledgerTripDirectCapture && styles.panelFullPageColumn,
          fullPage && !ledgerUseMobileWizard && { paddingHorizontal: ledgerFullPagePadH },
          {
            paddingBottom: fullPage
              ? 0
              : insets.bottom + Layout.modalBottomPadding,
            ...(fullPage
              ? {}
              : { height: panelHeight, maxHeight: panelHeight }),
          },
        ]}
      >
        {ledgerFullPageViewportFit ||
        (ledgerTripDirectCapture && !ledgerMobileFlow) ? (
          <View style={[styles.panelScroll, styles.panelScrollViewportFit]}>
            <View
              style={[
                styles.panelScrollInner,
                styles.panelScrollInnerFullPageLedger,
              ]}
            >
              {renderLedgerSyncV2()}
            </View>
          </View>
        ) : fullPage && ledgerUseMobileWizard ? (
          <View style={[styles.panelScroll, styles.panelScrollViewportFit]}>
            <View
              style={[
                styles.panelScrollInner,
                styles.panelScrollInnerFullPageLedger,
                styles.panelScrollInnerMobileWizard,
              ]}
            >
              <LedgerMobileWizard
                isEditMode={isEditMode}
                entryContextLabel={entryContextLabel}
                type={type}
                onTypeChange={requestLedgerFlowType}
                typeLocked={Boolean(defaultType) || tripLocked || isEditMode}
                amountStr={amountStr}
                onAmountChange={handleLedgerQuickAmountChange}
                amountPlaceholder={ledgerAmountPlaceholder}
                dueAmountInr={ledgerDueAmountInr}
                partyId={partyId}
                onPartySelect={setPartyId}
                partyOptions={ledgerWizardPartyOptions}
                partyLocked={
                  isPartyLocked ||
                  (tripLocked && !tripLockedCashInNeedsPartyPick)
                }
                partyDisplayName={effectivePartyName}
                partyAvatarUrl={ledgerPartyVisual.partyAvatarUrl}
                partyAvatarSeed={ledgerPartyVisual.partyAvatarSeed}
                partyEntityType={ledgerPartyVisual.partyEntityType}
                partyIsIntegrated={ledgerPartyVisual.partyIsIntegrated}
                hidePartyStep={partyOptions.length === 0}
                submitting={ledgerSubmitting}
                selectedTripId={selectedTripIds[0] ?? defaultTripId ?? null}
                onTripSelect={(id) => {
                  const trip = id ? resolveTripOptionById(id) : null;
                  selectMissionTrip(trip);
                }}
                onChangeTripRequest={() => {
                  setLedgerMissionRegistryExpanded(true);
                }}
                trips={ledgerWizardTrips}
                tripLocked={tripLocked}
                tripDisplay={tripNumber || lockedTripDisplay || null}
                tripBeforeAmount={ledgerWizardFromPartyContext && !tripLocked}
                defaultTripDueFilter={
                  ledgerWizardFromPartyContext ? "has_due" : "all"
                }
                paymentTypeItems={ledgerWizardPaymentTypeItems}
                showPaymentTypeStep={ledgerWizardShowPaymentType}
                paymentModeId={paymentModeId}
                onPaymentModeSelect={(id) => {
                  setPaymentModeId(id);
                  setPaymentModeExpanded(false);
                }}
                paymentTypeExpanded={paymentTypeExpanded}
                onPaymentTypeExpandedChange={setPaymentTypeExpanded}
                paymentModeExpanded={paymentModeExpanded}
                onPaymentModeExpandedChange={setPaymentModeExpanded}
                paymentReference={paymentReference}
                onPaymentReferenceChange={setPaymentReference}
                entryDate={entryDate}
                onEntryDateChange={setEntryDate}
                reconRows={ledgerReconDetailRows}
                reconAmountText={previewAmountText}
                canSubmit={canSubmit}
                onSubmit={() => {
                  Keyboard.dismiss();
                  commitLedgerSubmit();
                }}
                onClose={onClose}
                flowSessionKey={ledgerWizardFlowSessionKey}
                compact
                tripLedgerPreview={ledgerWizardTripLedgerPreview}
                focusedTripCard={ledgerFocusedTripCardElement}
                twoStepTripLockedFlow={ledgerMobileTwoStepTripFlow}
                tripDirectTwoStepFlow={ledgerTripDirectTwoStepFlow}
                paymentCaptureAfterAmount={ledgerPaymentCaptureAfterAmount}
                submitButtonLabel="Authorize Financial Sync"
                headerTripNumber={showHeaderTripDetail ? headerTripNumber : null}
                headerTripRoute={showHeaderTripDetail ? headerTripRoute : null}
                headerPartyName={
                  showHeaderTripDetail
                    ? headerPartyName?.trim() || entryContextLabel?.trim() || null
                    : null
                }
              />
            </View>
          </View>
        ) : (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => {
            Keyboard.dismiss();
            closeAllPickers();
          }}
          scrollEnabled={
            (fullPage && stackTripFinancialBand) ||
            (!fullPage &&
              !showPartyPicker &&
              !showTripPicker &&
              !showCategoryPicker &&
              !showDriverPaymentTypePicker &&
              !showDriverForSalaryPicker)
          }
          style={styles.panelScroll}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={[
            styles.panelScrollContent,
            fullPage && styles.panelScrollContentFullPage,
            {
              paddingBottom: fullPage
                ? Math.max(16, scrollContentPaddingBottom)
                : scrollContentPaddingBottom,
              flexGrow: fullPage ? 1 : undefined,
            },
          ]}
        >
          <View
            style={[
              styles.panelScrollInner,
              fullPage && stackTripFinancialBand && styles.panelScrollInnerLedgerNarrow,
              fullPage && !stackTripFinancialBand && styles.panelScrollInnerFullPageLedger,
            ]}
          >
            {fullPage ? (
              renderLedgerSyncV2()
            ) : (
            <>
            <View style={styles.flowCard}>
              <View style={styles.flowCardHead}>
                <View
                  style={[
                    styles.flowStepBadge,
                    type === "in" ? styles.flowStepBadgeIn : styles.flowStepBadgeOut,
                  ]}
                >
                  <Text style={styles.flowStepBadgeText}>01</Text>
                </View>
                <Text style={styles.flowCardTitle}>Entry Details</Text>
              </View>
              {/* Header: LEDGER SYNC + optional "Entry for [name]" + IN/OUT toggle */}
              <View style={styles.headerRow}>
                <View style={styles.titleBlock}>
                  <Text style={[styles.tagLabel, styles.title]}>
                    {isEditMode ? "EDIT ENTRY" : "ADD ENTRY"}
                  </Text>
                  {entryContextLabel && !isPartyLocked && !tripLocked ? (
                    <Text style={[styles.tagLabel, styles.entryContextLabel]} numberOfLines={1}>
                      Entry for {entryContextLabel}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.toggleWrap}>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      type === "in" && styles.toggleBtnIn,
                    ]}
                    onPress={() => requestLedgerFlowType("in")}
                    activeOpacity={0.8}
                    accessibilityLabel={
                      type === "in"
                        ? "Money in — selected"
                        : "Money in — tap to record cash received"
                    }
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.toggleBtnText,
                        type === "in" && styles.toggleBtnTextActive,
                      ]}
                    >
                      IN
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      type === "out" && styles.toggleBtnOut,
                    ]}
                    onPress={() => requestLedgerFlowType("out")}
                    activeOpacity={0.8}
                    accessibilityLabel={
                      type === "out"
                        ? "Money out — selected"
                        : "Money out — tap to record cash paid"
                    }
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.toggleBtnText,
                        type === "out" && styles.toggleBtnTextActive,
                      ]}
                    >
                      OUT
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tiny tag when opened from client (party locked): show party name. Trip + date are in form below. */}
              {isPartyLocked && effectivePartyName ? (
                <View style={styles.tagsRow}>
                  <View style={styles.tinyTag}>
                    <Text style={styles.tinyTagText}>{effectivePartyName}</Text>
                  </View>
                </View>
              ) : null}

              {/* Amount: pre-filled from entity detail (e.g. Salary Due) when lockedAmount is set; always editable. */}
              <View style={styles.amountBlock}>
                <Text style={[styles.tagLabel, styles.amountLabel]}>SETTLEMENT AMOUNT (INR)</Text>
                <View style={styles.amountRow}>
                  <Text
                    style={[
                      styles.amountSymbol,
                      type === "in"
                        ? styles.amountSymbolIn
                        : styles.amountSymbolOut,
                    ]}
                  >
                    ₹
                  </Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder={ledgerAmountPlaceholder}
                    placeholderTextColor={Theme.textMutedDemo}
                    value={amountStr}
                    onChangeText={setAmountStr}
                    keyboardType="decimal-pad"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    editable={visible || fullPage}
                    onFocus={() => {
                      if (fullPage && scrollRef.current) {
                        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
                      }
                    }}
                  />
                </View>
                {amountStr.trim().length > 0 &&
                (amount <= 0 || !Number.isFinite(parseFloat(amountStr.replace(/,/g, "")))) ? (
                  <Text style={styles.fieldErrorText}>Enter a valid amount.</Text>
                ) : null}
              </View>

              <View style={styles.paymentModeBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>MODE OF PAYMENT</Text>
                  {!paymentModeExpanded ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentModeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentModeExpanded ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentModeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentModeIcon as FontAwesomeIconName} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentModeName}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.paymentModeGrid}>
                    {PAYMENT_MODES.map((opt) => {
                      const selected = paymentModeId === opt.id;
                      const isIn = type === "in";
                      const accentColor = isIn ? Theme.darkGreen : Theme.teslaRed;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[
                            styles.paymentModeChip,
                            selected && styles.paymentModeChipSelected,
                            selected && { borderColor: accentColor, backgroundColor: `${accentColor}12` },
                          ]}
                          onPress={() => {
                            setPaymentModeId(opt.id);
                            setPaymentModeExpanded(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.paymentModeIconWrap,
                              selected && { backgroundColor: accentColor },
                            ]}
                          >
                            <FontAwesome
                              name={PAYMENT_MODE_ICON[opt.id] ?? "circle-o"}
                              size={11}
                              color={selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                            />
                          </View>
                          <Text
                            style={[
                              styles.paymentModeChipText,
                              selected && { color: accentColor },
                            ]}
                            numberOfLines={1}
                          >
                            {opt.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={[styles.fieldBlockFull, { marginTop: 0, borderTopWidth: 0 }]}>
                <Text style={[styles.tagLabel, styles.fieldLabel]}>REFERENCE NO / UTR</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={paymentReference}
                  onChangeText={setPaymentReference}
                  placeholder={
                    isLedgerCashPaymentMode(paymentModeId)
                      ? "UTR or bank reference (optional)"
                      : "NEFT / UPI / bank reference"
                  }
                  placeholderTextColor={Theme.textMutedDemo}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  accessibilityLabel="Reference Number or UTR"
                  onFocus={() => {
                    if (fullPage && scrollRef.current) {
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                    }
                  }}
                />
              </View>
            </View>

            <View style={styles.flowCard}>
              <View style={styles.flowCardHead}>
                <View
                  style={[
                    styles.flowStepBadge,
                    type === "in" ? styles.flowStepBadgeIn : styles.flowStepBadgeOut,
                  ]}
                >
                  <Text style={styles.flowStepBadgeText}>02</Text>
                </View>
                <Text style={styles.flowCardTitle}>Links & Classification</Text>
              </View>

            {/* Entry date + Trip: show date and trip in same row (trip near date). */}
            <View style={styles.twoCol}>
              <View style={styles.fieldBlock}>
                <Text style={[styles.tagLabel, styles.fieldLabel]}>ENTRY DATE</Text>
                <View style={styles.fieldInputDateWrap}>
                  <TextInput
                    style={[
                      styles.fieldInputDate,
                      entryDateError && styles.fieldInputError,
                    ]}
                    value={entryDate}
                    onChangeText={setEntryDate}
                    placeholder="2025-03-05"
                    placeholderTextColor={Theme.textMutedDemo}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    onFocus={() => {
                      if (fullPage && scrollRef.current) {
                        setTimeout(() => scrollRef.current?.scrollTo({ y: 200, animated: true }), 100);
                      }
                    }}
                    accessibilityLabel="Entry date — when the money was received or paid. Format: year, month, day."
                  />
                  {entryDateError ? (
                    <Text style={styles.fieldErrorText}>{entryDateError}</Text>
                  ) : null}
                </View>
              </View>
              {tripLocked ? (
                <View style={styles.fieldBlock}>
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>TRIP</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {tripNumber || lockedTripDisplay || "—"}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.fieldBlock, showTripPicker && styles.fieldBlockOpen]}
                  onPress={() => {
                    setShowPartyPicker(false);
                    setShowCategoryPicker(false);
                    setShowTripPicker((v) => !v);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>TRIP (optional)</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {tripNumber || "No trip"}
                  </Text>
                  <FontAwesome
                    name="chevron-down"
                    size={10}
                    color={showTripPicker ? Theme.primary : Theme.textMutedDemo}
                    style={[styles.fieldChevron, showTripPicker && styles.fieldChevronOpen]}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Party: hidden when tripLocked with a linked client (derived). */}
            {needsLedgerPartyPick ? (
              <TouchableOpacity
                style={[styles.fieldBlockFull, showPartyPicker && styles.fieldBlockOpen]}
                onPress={() => {
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowPartyPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>PARTY / PERSON</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {effectivePartyName || "SELECT PARTY..."}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={showPartyPicker ? Theme.primary : Theme.textMutedDemo}
                  style={[styles.fieldChevron, showPartyPicker && styles.fieldChevronOpen]}
                />
              </TouchableOpacity>
            ) : null}

            {supplierNeedsTrip && (
              <Text style={styles.hintText}>
                Supplier payments must be linked to a trip. Select a trip above.
              </Text>
            )}

            {type === "out" && isDriverSalaryParty && (
              <TouchableOpacity
                style={[styles.fieldBlockFull, showDriverForSalaryPicker && styles.fieldBlockOpen]}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowDriverPaymentTypePicker(false);
                  setShowDriverForSalaryPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>DRIVER</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {driverIdForSalary
                    ? (safeDrivers.find((d) => d.id === driverIdForSalary)
                        ?.name ?? "Driver")
                    : "SELECT DRIVER..."}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={showDriverForSalaryPicker ? Theme.primary : Theme.textMutedDemo}
                  style={[styles.fieldChevron, showDriverForSalaryPicker && styles.fieldChevronOpen]}
                />
              </TouchableOpacity>
            )}
            {type === "in" && (
              <View style={styles.categoryBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>
                    PAYMENT TYPE
                  </Text>
                  {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentTypeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentTypeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentTypeIcon as FontAwesomeIconName} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentTypeLabel}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.categoryChipGrid}>
                    {categoriesForPicker.map((cat) => {
                      const selected = category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.categoryChip,
                            selected && styles.categoryChipSelected,
                            selected && styles.categoryChipIn,
                          ]}
                          onPress={() => {
                            setCategory(cat);
                            setPaymentTypeExpanded(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.categoryChipIconWrap,
                              selected && styles.categoryChipIconWrapIn,
                            ]}
                          >
                            <FontAwesome
                              name={PAYMENT_TYPE_ICON[cat] ?? "circle-o"}
                              size={11}
                              color={selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                            />
                          </View>
                          <Text
                            style={[
                              styles.categoryChipText,
                              selected && styles.categoryChipTextIn,
                            ]}
                            numberOfLines={1}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            {type === "out" && !isVehicleExpenseOut && !isDriverSalaryParty && (
              <View style={styles.categoryBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>
                    {isDriverPayment ? "PAYMENT TYPE" : "CATEGORY"}
                  </Text>
                  {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentTypeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentTypeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentTypeIcon as FontAwesomeIconName} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentTypeLabel}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.categoryChipGrid}>
                    {(isDriverPayment
                      ? [
                          ...DRIVER_PAYMENT_TYPES.map((opt) => ({
                            key: opt.type,
                            label: opt.label,
                            selected: driverPaymentType === opt.type,
                            onPress: () => {
                              setDriverPaymentType(opt.type);
                              setCategory(null);
                              setPaymentTypeExpanded(false);
                            },
                            iconName:
                              PAYMENT_TYPE_ICON[opt.type] ??
                              PAYMENT_TYPE_ICON[opt.label] ??
                              "circle-o",
                          })),
                          ...VEHICLE_CATEGORIES.map((cat) => ({
                            key: `vehicle-${cat}`,
                            label: cat,
                            selected: driverPaymentType == null && category === cat,
                            onPress: () => {
                              setDriverPaymentType(null);
                              setCategory(cat);
                              setPaymentTypeExpanded(false);
                            },
                            iconName: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
                          })),
                        ]
                      : categoriesForPicker.map((cat) => ({
                          key: cat,
                          label: cat,
                          selected: category === cat,
                          onPress: () => {
                            setCategory(cat);
                            setPaymentTypeExpanded(false);
                          },
                          iconName: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
                        }))
                    ).map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[
                          styles.categoryChip,
                          item.selected && styles.categoryChipSelected,
                          item.selected && styles.categoryChipOut,
                        ]}
                        onPress={item.onPress}
                        activeOpacity={0.85}
                      >
                        <View
                          style={[
                            styles.categoryChipIconWrap,
                            item.selected && styles.categoryChipIconWrapOut,
                          ]}
                        >
                          <FontAwesome
                            name={item.iconName as FontAwesomeIconName}
                            size={11}
                            color={item.selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryChipText,
                            item.selected && styles.categoryChipTextOut,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {showDriverForSalaryPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !driverIdForSalary && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setDriverIdForSalary(null);
                      setShowDriverForSalaryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>SELECT DRIVER...</Text>
                  </TouchableOpacity>
                  {safeDrivers.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.pickerItem,
                        driverIdForSalary === d.id && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setDriverIdForSalary(d.id);
                        setShowDriverForSalaryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText} numberOfLines={1}>
                        {d.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {showDriverPaymentTypePicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !driverPaymentType &&
                        !isVehicleExpenseCategory &&
                        styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setDriverPaymentType(null);
                      setCategory(null);
                      setShowDriverPaymentTypePicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>
                      SELECT PAYMENT TYPE...
                    </Text>
                  </TouchableOpacity>
                  {DRIVER_PAYMENT_TYPES.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.pickerItem,
                        driverPaymentType === opt.type &&
                          styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setDriverPaymentType(opt.type);
                        setCategory(null);
                        setShowDriverPaymentTypePicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                  {VEHICLE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={`vehicle-${cat}`}
                      style={[
                        styles.pickerItem,
                        !driverPaymentType &&
                          category === cat &&
                          styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setDriverPaymentType(null);
                        setCategory(cat);
                        setShowDriverPaymentTypePicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showCategoryPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !category && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setCategory(null);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>
                      {type === "in"
                        ? "SELECT PAYMENT TYPE..."
                        : "SELECT CATEGORY..."}
                    </Text>
                  </TouchableOpacity>
                  {categoriesForPicker.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.pickerItem,
                        category === cat && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setCategory(cat);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showPaymentPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {PAYMENT_MODES.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.pickerItem,
                        paymentModeId === opt.id && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setPaymentModeId(opt.id);
                        setShowPaymentPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{opt.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory) && (
              <>
                <TouchableOpacity
                  style={[styles.vehicleRow, showVehiclePicker && styles.fieldBlockOpen]}
                  onPress={() => {
                    if (isVehicleLocked) return;
                    if (safeVehicles.length > 0) {
                      setShowPartyPicker(false);
                      setShowTripPicker(false);
                      setShowCategoryPicker(false);
                      setShowDriverPaymentTypePicker(false);
                      setShowDriverForSalaryPicker(false);
                      setShowVehiclePicker((v) => !v);
                    }
                  }}
                  activeOpacity={isVehicleLocked || safeVehicles.length === 0 ? 1 : 0.8}
                  disabled={isVehicleLocked || safeVehicles.length === 0}
                >
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>VEHICLE</Text>
                  <Text style={styles.vehicleValue} numberOfLines={1}>
                    {selectedVehicleNumber
                      ? formatIndianVehicleNumber(selectedVehicleNumber)
                      : safeVehicles.length > 0
                        ? "Select vehicle..."
                        : "No vehicles"}
                  </Text>
                  {!isVehicleLocked && safeVehicles.length > 0 ? (
                    <FontAwesome
                      name="chevron-down"
                      size={10}
                      color={showVehiclePicker ? Theme.primary : Theme.textMutedDemo}
                      style={[styles.fieldChevron, showVehiclePicker && styles.fieldChevronOpen]}
                    />
                  ) : null}
                </TouchableOpacity>
                {showVehiclePicker && safeVehicles.length > 0 && !fullPage && (
                  <View style={styles.pickerList}>
                    <ScrollView
                      style={styles.pickerScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                    >
                      <TouchableOpacity
                        style={[
                          styles.pickerItem,
                          !selectedVehicleIdForExpense &&
                            !selectedTrip?.vehicle_id &&
                          styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setSelectedVehicleIdForExpense(null);
                          setShowVehiclePicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemText}>
                          General (no vehicle)
                        </Text>
                      </TouchableOpacity>
                      {safeVehicles.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.pickerItem,
                            (selectedVehicleIdForExpense === v.id ||
                              selectedTrip?.vehicle_id === v.id) &&
                              styles.pickerItemActive,
                          ]}
                          onPress={() => {
                            setSelectedVehicleIdForExpense(v.id);
                            setShowVehiclePicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemText} numberOfLines={1}>
                            {formatIndianVehicleNumber(v.vehicle_number ?? "")}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {showPartyPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => {
                      setPartyId(null);
                      setShowPartyPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>SELECT PARTY...</Text>
                  </TouchableOpacity>
                  {partyOptions.length === 0 ? (
                    <View style={styles.pickerItem}>
                      <Text style={styles.pickerEmptyText}>
                        {type === "in" && selectedTrip
                          ? "No client associated with this trip."
                          : partyContext === "customers"
                            ? "No customers. Add clients from Home."
                            : partyContext === "suppliers"
                              ? "No suppliers. Add suppliers first."
                              : "No parties available."}
                      </Text>
                    </View>
                  ) : (
                    partyOptions.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.pickerItem,
                          partyId === c.id && styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setPartyId(c.id);
                          setShowPartyPicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemText} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {showTripPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      selectedTripIds.length === 0 && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setSelectedTripIds([]);
                      setShowTripPicker(false);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.pickerItemText}>General</Text>
                  </TouchableOpacity>
                  {filteredTrips.map((t) => {
                    const routeAndDate = [t.route_label, t.trip_date]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.pickerItem,
                          selectedTripIds.length === 1 &&
                            selectedTripIds[0] === t.id &&
                            styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setSelectedTripIds([t.id]);
                          setShowTripPicker(false);
                        }}
                        activeOpacity={0.6}
                      >
                        <View style={styles.pickerItemTripContent}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={styles.pickerItemText} numberOfLines={1}>
                              {t.trip_number}
                            </Text>
                            {t.is_cross_org_supplier ? (
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#4D3636", backgroundColor: "#ede9fe", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                SUPPLIER
                              </Text>
                            ) : null}
                          </View>
                          {routeAndDate ? (
                            <Text
                              style={styles.pickerItemSubtext}
                              numberOfLines={1}
                            >
                              {routeAndDate}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.ledgerPreviewCard}>
              <View style={styles.ledgerPreviewHead}>
                <Text style={styles.ledgerPreviewHeadText}>Ledger Preview</Text>
                <Text
                  style={[
                    styles.ledgerPreviewStatus,
                    type === "in" ? styles.ledgerPreviewStatusIn : styles.ledgerPreviewStatusOut,
                  ]}
                >
                  LIVE
                </Text>
              </View>
              <View style={styles.ledgerPreviewBody}>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Direction</Text>
                  <Text
                    style={[
                      styles.ledgerPreviewValue,
                      type === "in" ? styles.ledgerPreviewValueIn : styles.ledgerPreviewValueOut,
                    ]}
                  >
                    {previewDirectionLabel}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Amount</Text>
                  <Text
                    style={[
                      styles.ledgerPreviewAmount,
                      type === "in" ? styles.ledgerPreviewAmountIn : styles.ledgerPreviewAmountOut,
                    ]}
                  >
                    ₹{previewAmountText}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Party</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {effectivePartyName || "—"}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Trip</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {tripNumber || lockedTripDisplay || "General"}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Date</Text>
                  <Text style={styles.ledgerPreviewValue}>{entryDate || "—"}</Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Mode</Text>
                  <Text style={styles.ledgerPreviewValue}>{selectedPaymentModeName}</Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Type</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {category || "General"}
                  </Text>
                </View>
              </View>
            </View>
            </View>
            </>
            )}

            {!fullPage && submitButton}
          </View>
        </ScrollView>
        )}

        {fullPage && !ledgerUseMobileWizard && (
          <View
            style={[
              styles.fullPageFooter,
              ledgerFullPageViewportFit && styles.fullPageFooterPinned,
              ledgerTripDirectCapture && styles.fullPageFooterPinned,
              { paddingBottom: bottomInset + 16 },
            ]}
          >
            {submitButton}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  const pickerModalScrollStyle = [styles.pickerScroll, styles.pickerModalScroll];
  const activePickerTitle = showTripPicker
    ? "Select Trip"
    : showCategoryPicker
      ? (type === "in" ? "Select Payment Type" : "Select Category")
      : showPartyPicker
        ? "Select Party"
        : showDriverPaymentTypePicker
          ? "Select Payment Type"
          : showDriverForSalaryPicker
            ? "Select Driver"
            : showPaymentPicker
              ? "Select Payment Mode"
              : showVehiclePicker
                ? "Select Vehicle"
                : "Select";

  const renderPickerModalContent = () => {
    if (showTripPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity
            style={[
              styles.pickerItem,
              selectedTripIds.length === 0 && styles.pickerItemActive,
            ]}
            onPress={() => {
              setSelectedTripIds([]);
              setShowTripPicker(false);
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.pickerItemText}>General</Text>
          </TouchableOpacity>
          {filteredTrips.map((t) => {
            const routeAndDate = [t.route_label, t.trip_date].filter(Boolean).join(" · ");
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.pickerItem,
                  selectedTripIds.length === 1 &&
                    selectedTripIds[0] === t.id &&
                    styles.pickerItemActive,
                ]}
                onPress={() => {
                  setSelectedTripIds([t.id]);
                  setShowTripPicker(false);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.pickerItemTripContent}>
                  <Text style={styles.pickerItemText} numberOfLines={1}>{t.trip_number}</Text>
                  {routeAndDate ? <Text style={styles.pickerItemSubtext} numberOfLines={1}>{routeAndDate}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }
    if (showCategoryPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !category && styles.pickerItemActive]} onPress={() => { setCategory(null); setShowCategoryPicker(false); }}>
            <Text style={styles.pickerItemText}>{type === "in" ? "SELECT PAYMENT TYPE..." : "SELECT CATEGORY..."}</Text>
          </TouchableOpacity>
          {categoriesForPicker.map((cat) => (
            <TouchableOpacity key={cat} style={[styles.pickerItem, category === cat && styles.pickerItemActive]} onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}>
              <Text style={styles.pickerItemText}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showPartyPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={styles.pickerItem} onPress={() => { setPartyId(null); setShowPartyPicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT PARTY...</Text>
          </TouchableOpacity>
          {partyOptions.length === 0 ? (
            <View style={styles.pickerItem}><Text style={styles.pickerEmptyText}>{type === "in" && selectedTrip ? "No client associated with this trip." : partyContext === "customers" ? "No customers. Add clients from Home." : partyContext === "suppliers" ? "No suppliers. Add suppliers first." : "No parties available."}</Text></View>
          ) : (
            partyOptions.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.pickerItem, partyId === c.id && styles.pickerItemActive]} onPress={() => { setPartyId(c.id); setShowPartyPicker(false); }}>
                <Text style={styles.pickerItemText} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      );
    }
    if (showDriverPaymentTypePicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !driverPaymentType && !isVehicleExpenseCategory && styles.pickerItemActive]} onPress={() => { setDriverPaymentType(null); setCategory(null); setShowDriverPaymentTypePicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT PAYMENT TYPE...</Text>
          </TouchableOpacity>
          {DRIVER_PAYMENT_TYPES.map((opt) => (
            <TouchableOpacity key={opt.label} style={[styles.pickerItem, driverPaymentType === opt.type && styles.pickerItemActive]} onPress={() => { setDriverPaymentType(opt.type); setCategory(null); setShowDriverPaymentTypePicker(false); }}>
              <Text style={styles.pickerItemText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          {VEHICLE_CATEGORIES.map((cat) => (
            <TouchableOpacity key={`vehicle-${cat}`} style={[styles.pickerItem, !driverPaymentType && category === cat && styles.pickerItemActive]} onPress={() => { setDriverPaymentType(null); setCategory(cat); setShowDriverPaymentTypePicker(false); }}>
              <Text style={styles.pickerItemText}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showDriverForSalaryPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !driverIdForSalary && styles.pickerItemActive]} onPress={() => { setDriverIdForSalary(null); setShowDriverForSalaryPicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT DRIVER...</Text>
          </TouchableOpacity>
          {safeDrivers.map((d) => (
            <TouchableOpacity key={d.id} style={[styles.pickerItem, driverIdForSalary === d.id && styles.pickerItemActive]} onPress={() => { setDriverIdForSalary(d.id); setShowDriverForSalaryPicker(false); }}>
              <Text style={styles.pickerItemText} numberOfLines={1}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showPaymentPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          {PAYMENT_MODES.map((opt) => (
            <TouchableOpacity key={opt.id} style={[styles.pickerItem, paymentModeId === opt.id && styles.pickerItemActive]} onPress={() => { setPaymentModeId(opt.id); setShowPaymentPicker(false); }}>
              <Text style={styles.pickerItemText}>{opt.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showVehiclePicker && safeVehicles.length > 0) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !selectedVehicleIdForExpense && !selectedTrip?.vehicle_id && styles.pickerItemActive]} onPress={() => { setSelectedVehicleIdForExpense(null); setShowVehiclePicker(false); }}>
            <Text style={styles.pickerItemText}>General (no vehicle)</Text>
          </TouchableOpacity>
          {safeVehicles.map((v) => (
            <TouchableOpacity key={v.id} style={[styles.pickerItem, (selectedVehicleIdForExpense === v.id || selectedTrip?.vehicle_id === v.id) && styles.pickerItemActive]} onPress={() => { setSelectedVehicleIdForExpense(v.id); setShowVehiclePicker(false); }}>
              <Text style={styles.pickerItemText} numberOfLines={1}>{formatIndianVehicleNumber(v.vehicle_number ?? "")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    return null;
  };

  if (fullPage) {
    return (
      <>
        {formContent}
        {pickerModalVisible ? (
          <Modal transparent visible animationType="fade" onRequestClose={closeAllPickers}>
            <View style={[styles.pickerModalContainer, { paddingBottom: insets.bottom + 16, pointerEvents: 'box-none' }]}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeAllPickers} activeOpacity={1} />
              <View style={[styles.pickerModalPanel, { height: Math.min(windowHeight * 0.5, 380), pointerEvents: 'auto' }]}>
                <View style={styles.pickerModalHeader}>
                  <View style={styles.pickerModalHandle} />
                  <Text style={styles.pickerModalTitle}>{activePickerTitle}</Text>
                </View>
                {renderPickerModalContent()}
              </View>
            </View>
          </Modal>
        ) : null}
        <LedgerReconSummaryModal
          visible={
            ledgerUseMobileWizard
              ? ledgerSubmitting || ledgerReconSucceeded
              : ledgerSubmitConfirmVisible
          }
          progressOnly={ledgerUseMobileWizard}
          amountText={previewAmountText}
          direction={type}
          rows={ledgerReconDetailRows}
          isEditMode={isEditMode}
          phase={
            ledgerReconSucceeded
              ? "success"
              : ledgerSubmitting
                ? "submitting"
                : "review"
          }
          partyAvatar={
            ledgerPartyVisual.name && ledgerPartyVisual.name !== "—"
              ? {
                  name: ledgerPartyVisual.name,
                  entityType: ledgerPartyVisual.partyEntityType,
                  avatarUrl: ledgerPartyVisual.partyAvatarUrl,
                  avatarSeed: ledgerPartyVisual.partyAvatarSeed,
                }
              : undefined
          }
          onClose={() => {
            if (ledgerSubmitting || ledgerReconSucceeded) return;
            setLedgerSubmitConfirmVisible(false);
          }}
          onConfirm={() => {
            commitLedgerSubmit();
          }}
          onSuccessComplete={handleLedgerReconSuccessComplete}
        />
        <LedgerFlowGuardAlert
          visible={ledgerFlowGuardAlert != null}
          content={ledgerFlowGuardAlert}
          onDismiss={() => setLedgerFlowGuardAlert(null)}
        />
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => {
            const hasOpenPicker =
              showPartyPicker ||
              showTripPicker ||
              showCategoryPicker ||
              showDriverPaymentTypePicker ||
              showDriverForSalaryPicker ||
              showVehiclePicker ||
              showPaymentPicker;
            if (hasOpenPicker) {
              closeAllPickers();
            } else {
              handleClose();
            }
          }}
          activeOpacity={1}
        />
        {formContent}
      </View>
      <LedgerFlowGuardAlert
        visible={ledgerFlowGuardAlert != null}
        content={ledgerFlowGuardAlert}
        onDismiss={() => setLedgerFlowGuardAlert(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  keyboardAvoid: {
    width: "100%",
  },
  keyboardAvoidFullPage: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({
      web: {
        ...(WEB_APP_VIEWPORT_STYLE as object),
      },
    }),
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  panelFullPage: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: LedgerSyncPalette.page,
    ...Platform.select({
      web: {
        ...(WEB_APP_VIEWPORT_STYLE as object),
      },
    }),
  },
  panelFullPageColumn: {
    flexDirection: "column",
  },
  panelScrollViewportFit: {
    flex: 1,
    minHeight: 0,
  },
  fullPageFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: LedgerSyncPalette.surface,
    borderTopWidth: 1,
    borderTopColor: LedgerSyncPalette.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  fullPageFooterPinned: {
    flexShrink: 0,
  },
  hintText: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: -4,
    marginBottom: 8,
  },
  panelScroll: { flex: 1, minHeight: 0 },
  panelScrollInner: { gap: 28 },
  panelScrollInnerLedgerNarrow: {
    gap: 10,
  },
  /** Ledger full-page stacked mobile: compact typography, icons, and spacing. */
  ledgerMobShell: { gap: 8, paddingBottom: 2 },
  ledgerMobHeader: { paddingVertical: 8, marginBottom: 4 },
  ledgerMobTitle: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  ledgerMobSub: { fontSize: 11, fontWeight: "600", letterSpacing: 0, marginTop: 2 },
  ledgerMobBackBtn: { width: 36, height: 36, borderRadius: 12 },
  ledgerMobHeaderDivider: { height: 32 },
  ledgerMobToggle: { paddingVertical: 6, paddingHorizontal: 10, minWidth: 68, borderRadius: 14 },
  ledgerMobToggleText: { fontSize: 8, letterSpacing: 1.2 },
  ledgerMobPaneCard: { padding: 10, borderRadius: 18 },
  ledgerMobTripBand: { gap: 8, marginBottom: 8 },
  ledgerMobMissionHead: { marginBottom: 6 },
  ledgerMobMissionTitle: { fontSize: 8, letterSpacing: 2 },
  ledgerMobSearchWrap: {
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  ledgerMobSearchInput: { fontSize: 16, paddingVertical: 8 },
  ledgerMobFilterStrip: { marginBottom: 6 },
  ledgerMobFilterChip: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 28,
  },
  ledgerMobFilterChipText: {
    fontSize: 7,
    letterSpacing: 0.45,
  },
  ledgerMobFilterLabel: {
    fontSize: 7,
    letterSpacing: 0.45,
  },
  ledgerMobListContent: { flexGrow: 0, gap: 6, paddingBottom: 8 },
  ledgerMobTripCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    flexGrow: 0,
  },
  ledgerMobTripIcon: { width: 28, height: 28, borderRadius: 10 },
  ledgerMobTripId: { fontSize: 11 },
  ledgerMobTripRoute: { fontSize: 8 },
  ledgerMobDateBadge: { paddingHorizontal: 7, paddingVertical: 3 },
  ledgerMobDateBadgeText: { fontSize: 8 },
  ledgerMobDuePill: { paddingHorizontal: 8, paddingVertical: 3 },
  ledgerMobDuePillText: { fontSize: 8 },
  ledgerMobPendingChipsRow: { marginTop: 2, gap: 4 },
  ledgerMobPendingChip: { paddingVertical: 4, paddingHorizontal: 8 },
  ledgerMobPendingChipText: { fontSize: 9 },
  ledgerMobNoDuePill: { paddingVertical: 3, paddingHorizontal: 8 },
  ledgerMobNoDuePillText: { fontSize: 7, letterSpacing: 0.4 },
  ledgerMobNoDueBanner: { marginBottom: 8, paddingHorizontal: 11, paddingVertical: 9 },
  ledgerMobNoDueBannerText: { fontSize: 8, lineHeight: 12 },
  ledgerMobRefInputText: { fontSize: 12 },
  ledgerMobProvision: { padding: 10, gap: 8, borderRadius: 18 },
  ledgerMobProtocolWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  ledgerMobTagLabel: { fontSize: 8, letterSpacing: 0.6 },
  ledgerMobSelectorSummary: {
    minHeight: 32,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  ledgerMobSelectorIcon: {
    width: 18,
    height: 18,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  ledgerMobSelectorText: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    textTransform: "none",
  },
  ledgerMobSelectorChange: { paddingHorizontal: 8, paddingVertical: 3 },
  ledgerMobSelectorChangeText: { fontSize: 9 },
  ledgerMobProtocolTile: {
    minHeight: 32,
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 2,
  },
  ledgerMobProtocolTileText: { fontSize: 7, lineHeight: 9 },
  ledgerMobSyncAmount: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 18 },
  ledgerMobSyncRupee: { fontSize: 12 },
  ledgerMobSyncInput: { fontSize: 13, fontWeight: "500" },
  ledgerMobSyncEyebrow: { letterSpacing: 2, marginBottom: 4, fontSize: 8 },
  ledgerMobDateCard: { padding: 8, gap: 6, borderRadius: 14 },
  ledgerMobFieldEyebrow: { fontSize: 8, letterSpacing: 1.5 },
  ledgerMobDatePreset: { paddingVertical: 4, paddingHorizontal: 10 },
  ledgerMobDatePresetText: { fontSize: 10 },
  ledgerMobDateField: { paddingVertical: 7, paddingHorizontal: 10 },
  ledgerMobDateFieldText: { fontSize: 13 },
  ledgerMobRefCard: { paddingVertical: 8, paddingHorizontal: 8 },
  ledgerMobRefInput: { paddingVertical: 10, paddingHorizontal: 12, gap: 8, borderRadius: 20 },
  ledgerMobRefEyebrow: { fontSize: 8, letterSpacing: 1.5 },
  ledgerMobFocusedCard: { padding: 12, borderRadius: 16 },
  ledgerMobFocusedInner: { gap: 8, width: "100%", minWidth: 0 },
  ledgerMobFocusedChips: { marginTop: 2, gap: 4 },
  ledgerMobFocusedId: { fontSize: 12 },
  ledgerMobFocusedCheck: { width: 26, height: 26, borderRadius: 13 },
  ledgerMobFocusedRoute: { fontSize: 10, lineHeight: 14 },
  ledgerMobSubmit: { paddingVertical: 13, minHeight: 46, borderRadius: 22, gap: 8 },
  ledgerMobSubmitText: { fontSize: 11, letterSpacing: 1 },
  panelScrollContent: { gap: 28, paddingBottom: 8 },
  panelScrollContentFullPage: {
    gap: 16,
    paddingBottom: 6,
    paddingTop: 6,
    backgroundColor: LedgerSyncPalette.page,
  },
  flowCard: {
    backgroundColor: Theme.surface,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  flowCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  flowStepBadge: {
    width: 28,
    height: 28,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
  },
  flowStepBadgeIn: {
    backgroundColor: Theme.darkGreen,
  },
  flowStepBadgeOut: {
    backgroundColor: Theme.teslaRed,
  },
  flowStepBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.8,
  },
  flowCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  /** Non-editable labels shown as small tags above/beside inputs. */
  tagLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: Theme.textPrimaryDark,
  },
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleWrapLedger: {
    backgroundColor: Theme.liquidPillBg,
    padding: 6,
  },
  toggleBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  toggleBtnIn: {
    backgroundColor: Theme.darkGreen,
    shadowColor: Theme.darkGreen,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtnOut: {
    backgroundColor: Theme.teslaRed,
    shadowColor: Theme.teslaRed,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  toggleBtnTextActive: { color: Theme.buttonPrimaryText },
  entryContextLabel: {
    fontSize: 10,
    marginTop: 4,
    opacity: 0.9,
  },

  amountBlock: {
    backgroundColor: Theme.surface,
    paddingVertical: 26,
    paddingHorizontal: 22,
    minHeight: 110,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  amountLabel: {
    marginBottom: 14,
    letterSpacing: 1.4,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    gap: 10,
  },
  amountSymbol: {
    fontSize: 34,
    fontWeight: "900",
    width: 24,
    textAlign: "center",
  },
  amountSymbolIn: { color: Theme.darkGreen },
  amountSymbolOut: { color: Theme.teslaRed },
  amountInput: {
    flex: 1,
    fontSize: 42,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  tinyTag: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tinyTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  twoCol: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  twoColSingle: {},
  fieldBlock: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: Layout.minTouchTargetSize + 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
    minWidth: 220,
  },
  fieldBlockFull: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: Layout.minTouchTargetSize + 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  fieldLabel: {
    marginRight: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  fieldLabelNoMargin: {
    marginRight: 0,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 0,
  },
  fieldValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  fieldInputDateWrap: { flex: 1, minWidth: 0 },
  fieldInputDate: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 6,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  fieldInputError: { borderWidth: 1, borderColor: Theme.negative, borderRadius: 8 },
  fieldErrorText: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 6,
  },
  fieldChevron: {
    marginLeft: 6,
    transform: [{ rotate: "0deg" }],
    ...Platform.select({
      web: {
        transitionDuration: "160ms",
      } as object,
    }),
  },
  fieldChevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  fieldBlockOpen: {
    backgroundColor: Theme.primary + "0D",
  },
  paymentModeBlock: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  /** Mode + category side-by-side (full-page ledger). */
  ledgerProtocolSplitWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    width: "100%",
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ledgerProtocolSplitWrapStack: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    flexGrow: 0,
    gap: 12,
  },
  ledgerProtocolSplitWrapTopBand: {
    alignSelf: "stretch",
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  /** Reference UI: elevated MODE / TYPE workbench card (Pulse-style). */
  ledgerProtocolWorkbenchElevated: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  ledgerProtocolSectionSideLeft: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: 1,
    borderRightColor: Theme.borderMedium,
    paddingRight: 8,
  },
  ledgerProtocolSectionSideRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
  },
  ledgerProtocolSectionStackBottom: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    paddingBottom: 10,
  },
  ledgerProtocolSectionStackTop: {
    width: "100%",
    paddingTop: 2,
  },
  ledgerProtocolSplitCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: "50%",
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  /** Vertical split between MODE and PAYMENT TYPE (row layout). */
  ledgerProtocolSplitColDividerRight: {
    borderRightWidth: 1,
    borderRightColor: Theme.borderMedium,
    paddingRight: 12,
  },
  ledgerProtocolSplitColPaddedLeft: {
    paddingLeft: 12,
  },
  /** Horizontal split when MODE / TYPE stack (narrow). */
  ledgerProtocolSplitColStackBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    paddingBottom: 12,
  },
  ledgerProtocolSplitColStackTop: {
    paddingTop: 12,
  },
  /** Stacked MODE / TYPE: height = content only (no `flex: 1` vertical steal). */
  ledgerProtocolSplitColNarrow: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    overflow: "visible",
  },
  ledgerProtocolSplitColStacked: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    overflow: "visible",
  },
  selectorHeaderTitle: {
    flex: 1,
    minWidth: 0,
  },
  selectorHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  selectorHeaderRowLedgerMobile: {
    marginBottom: 6,
    minHeight: 22,
  },
  selectorChangeBtn: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectorChangeBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  selectorSummaryCard: {
    minHeight: 42,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectorSummaryMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  selectorSummaryIcon: {
    width: 22,
    height: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorSummaryIconSm: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  selectorSummaryText: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    textTransform: "none",
  },
  selectorSummaryPlaceholder: {
    color: Theme.textMutedDemo,
    fontWeight: "600",
  },
  paymentModeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentModeChip: {
    minHeight: 54,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "48.6%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  paymentModeChipSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  paymentModeIconWrap: {
    width: 24,
    height: 24,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentModeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  categoryBlock: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    minHeight: 54,
    backgroundColor: Theme.surface,
    paddingHorizontal: 9,
    paddingVertical: 8,
    width: "48.6%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  categoryChipSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  categoryChipIn: {
    backgroundColor: `${Theme.darkGreen}12`,
  },
  categoryChipOut: {
    backgroundColor: `${Theme.teslaRed}12`,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  categoryChipTextIn: {
    color: Theme.darkGreen,
  },
  categoryChipTextOut: {
    color: Theme.teslaRed,
  },
  categoryChipIconWrap: {
    width: 24,
    height: 24,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipIconWrapIn: {
    backgroundColor: Theme.darkGreen,
  },
  categoryChipIconWrapOut: {
    backgroundColor: Theme.teslaRed,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 8,
    minHeight: Layout.minTouchTargetSize + 4,
  },
  vehicleValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },

  pickerList: {
    height: 240,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  pickerModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerModalPanel: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerModalHeader: {
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  pickerModalHandle: {
    width: 44,
    height: 5,
    backgroundColor: Theme.borderLight,
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  pickerScroll: {
    flex: 1,
    height: 240,
  },
  pickerModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  pickerItemActive: {
    backgroundColor: Theme.primary + "14",
    borderLeftWidth: 3,
    borderLeftColor: Theme.primary,
  },
  pickerItemTripContent: { flex: 1 },
  pickerItemText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  pickerItemSubtext: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
    textTransform: "none",
  },
  pickerEmptyText: {
    fontSize: 12,
    color: Theme.textMutedDemo,
    fontStyle: "italic",
  },

  submitBtnWrap: {
    width: "100%",
    alignSelf: "stretch",
    gap: 8,
  },
  submitBlockReason: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  submitBtn: {
    paddingVertical: 19,
    minHeight: Layout.minTouchTargetSize + 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnIn: {
    backgroundColor: Theme.darkGreen,
    shadowColor: Theme.darkGreen,
    shadowOpacity: 0.2,
  },
  submitBtnOut: {
    backgroundColor: Theme.buttonPrimary,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 2.2,
  },
  submitBtnLedgerFullPage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: LedgerSyncPalette.ink,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 8,
    paddingVertical: 18,
    minHeight: 56,
    width: "100%",
    alignSelf: "stretch",
  },
  submitBtnTextLedger: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "500",
    color: Theme.textOnDark,
  },
  submitBtnTextLedgerTight: {
    letterSpacing: 0.8,
    fontSize: 11,
  },
  ledgerV2Shell: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 16,
    paddingBottom: 8,
    width: "100%",
  },
  ledgerV2ShellFill: {
    flex: 1,
    minHeight: 0,
    gap: 12,
    paddingBottom: 4,
    justifyContent: "flex-start",
  },
  ledgerV2HeaderLedgerShrink: {
    flexShrink: 0,
  },
  ledgerV2ShellMobileTablet: {
    gap: 14,
    paddingBottom: 4,
  },
  panelScrollInnerFullPageLedger: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  panelScrollInnerMobileWizard: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  ledgerV2TripFirstBand: {
    width: "100%",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 10,
  },
  ledgerV2TripFirstBandFill: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  ledgerV2TripFirstBandCapture: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 12,
  },
  ledgerV2TripFirstBandTripPickOnly: {
    flexDirection: "column",
  },
  ledgerV2TripFirstBandStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 10,
  },
  ledgerTripPaneCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "stretch",
    backgroundColor: LedgerSyncPalette.surface,
    padding: 14,
    overflow: "hidden",
  },
  ledgerTripPaneCardStack: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
    minHeight: 0,
  },
  ledgerTripPaneCardLeftRegistry: {
    flex: 5,
    flexDirection: "column",
  },
  ledgerTripPaneCardRightWide: {
    flex: 7,
    flexDirection: "column",
  },
  ledgerTripPaneCardTripPickFull: {
    flex: 1,
    width: "100%",
    minHeight: 280,
  },
  ledgerTripPaneCardTransparent: {
    backgroundColor: "transparent",
    padding: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  ledgerV2HeaderLedger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: LedgerSyncPalette.border,
    backgroundColor: LedgerSyncPalette.surface,
    width: "100%",
  },
  ledgerV2HeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  ledgerV2BackBtn: {
    width: 44,
    height: 44,
    backgroundColor: LedgerSyncPalette.page,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerV2HeaderDivider: {
    width: 1,
    height: 40,
    backgroundColor: LedgerSyncPalette.border,
  },
  ledgerV2HeaderTitleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  ledgerV2Title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.35,
    lineHeight: 24,
    color: LedgerSyncPalette.ink,
  },
  ledgerV2Sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: LedgerSyncPalette.muted,
  },
  toggleWrapLedgerPulse: {
    backgroundColor: "#F1F5F9",
    padding: 4,
    gap: 4,
  },
  toggleBtnPulse: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 76,
    alignItems: "center",
  },
  toggleBtnPulseIn: {
    backgroundColor: LedgerSyncPalette.emerald,
    shadowColor: LedgerSyncPalette.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  toggleBtnPulseOut: {
    backgroundColor: LedgerSyncPalette.rose,
    shadowColor: LedgerSyncPalette.rose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  toggleBtnPulseText: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  toggleBtnPulseTextActive: {
    color: Theme.textOnDark,
  },
  ledgerProvisionCard: {
    backgroundColor: LedgerSyncPalette.surface,
    padding: 14,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  /** Fills the right pane; inner sections stay top-aligned, amount hero can grow. */
  ledgerProvisionCardPaneFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  ledgerDesktopSetupPane: {
    gap: 14,
    justifyContent: "flex-start",
  },
  ledgerDesktopSetupSummary: {
    marginTop: "auto",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LedgerSyncPalette.border,
    gap: 8,
  },
  ledgerDesktopSetupSummaryEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: LedgerSyncPalette.muted,
  },
  ledgerDesktopSetupChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ledgerDesktopSetupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: LedgerSyncPalette.page,
    maxWidth: "100%",
  },
  ledgerDesktopSetupChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
    flexShrink: 1,
  },
  ledgerDesktopPaymentPane: {
    padding: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  ledgerDesktopLeftPaymentStack: {
    gap: 10,
    paddingTop: 0,
    paddingBottom: 16,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  ledgerDesktopLeftScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerDesktopProtocolStripRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 2,
  },
  ledgerDesktopCaptureHead: {
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  ledgerDesktopSinglePageHint: {
    fontSize: 11,
    fontWeight: "600",
    color: LedgerSyncPalette.muted,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  ledgerDesktopPaymentScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  ledgerDesktopPaymentScrollContent: {
    gap: 10,
    padding: 0,
    paddingBottom: 10,
    flexGrow: 1,
  },
  ledgerDesktopPaymentPreview: {
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerDesktopCategoryReminder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: LedgerSyncPalette.page,
  },
  ledgerDesktopCategoryReminderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ledgerDesktopCategoryReminderIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  ledgerDesktopCategoryReminderTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ledgerDesktopCategoryReminderLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: LedgerSyncPalette.muted,
  },
  ledgerDesktopCategoryReminderValue: {
    fontSize: 12,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
  },
  ledgerDesktopCategoryChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.cardWhite,
  },
  ledgerDesktopCategoryChangeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  ledgerDesktopAmountSection: {
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerDesktopAmountEyebrow: {
    letterSpacing: 2.4,
    fontSize: 9,
  },
  ledgerDesktopPaymentSectionCard: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  ledgerDesktopSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ledgerDesktopSectionHeadText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ledgerDesktopSectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerDesktopSectionIconMode: {
    backgroundColor: "rgba(16,185,129,0.08)",
  },
  ledgerDesktopSectionIconCategory: {
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  ledgerDesktopSectionIconParty: {
    backgroundColor: Theme.primaryLight,
  },
  ledgerDesktopSectionIconRef: {
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  ledgerDesktopSectionIconDate: {
    backgroundColor: LedgerSyncPalette.page,
  },
  ledgerDesktopSectionIconAmount: {
    backgroundColor: "rgba(16,185,129,0.08)",
  },
  ledgerDesktopSectionEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: LedgerSyncPalette.ink,
    letterSpacing: -0.1,
  },
  ledgerDesktopSectionHint: {
    fontSize: 10,
    fontWeight: "500",
    color: LedgerSyncPalette.muted,
    lineHeight: 14,
  },
  ledgerDesktopReferenceInputWrap: {
    backgroundColor: LedgerSyncPalette.page,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  ledgerDesktopReferenceInput: {
    fontSize: 13,
    fontWeight: "600",
    color: LedgerSyncPalette.ink,
    paddingVertical: 10,
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  ledgerDesktopDatePanelNested: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 10,
    shadowOpacity: 0,
    elevation: 0,
  },
  ledgerDesktopWizardMeta: {
    marginTop: 8,
    gap: 6,
  },
  ledgerDesktopWizardSteps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ledgerDesktopWizardDot: {
    width: 8,
    height: 8,
    backgroundColor: LedgerSyncPalette.border,
  },
  ledgerDesktopWizardDotActive: {
    backgroundColor: LedgerSyncPalette.ink,
  },
  ledgerDesktopWizardLine: {
    width: 28,
    height: 2,
    backgroundColor: LedgerSyncPalette.border,
  },
  ledgerDesktopWizardLineActive: {
    backgroundColor: LedgerSyncPalette.ink,
  },
  ledgerDesktopWizardStepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: LedgerSyncPalette.muted,
    letterSpacing: 0.2,
  },
  ledgerDesktopFooterRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  ledgerDesktopFooterBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 14,
    backgroundColor: LedgerSyncPalette.surface,
    minHeight: 56,
  },
  ledgerDesktopFooterBackText: {
    fontSize: 11,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
    letterSpacing: 0.3,
  },
  ledgerDesktopFooterSubmitWrap: {
    flex: 1,
    minWidth: 0,
  },
  ledgerSyncDateCard: {
    backgroundColor: LedgerSyncPalette.page,
    padding: 12,
    gap: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerSyncDateCardError: {
  },
  ledgerSyncDatePresetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  ledgerSyncDatePresetRowInline: {
    flexWrap: "nowrap",
    flexShrink: 0,
  },
  ledgerSyncDateInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  ledgerSyncDateFieldInline: {
    flex: 1,
    minWidth: 120,
    alignSelf: "stretch",
  },
  ledgerSyncDatePresetPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: LedgerSyncPalette.surface,
  },
  ledgerSyncDatePresetPillOn: {
    backgroundColor: LedgerSyncPalette.ink,
  },
  ledgerSyncDatePresetText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  ledgerSyncDatePresetTextOn: {
    color: Theme.textOnDark,
  },
  ledgerSyncDateFieldWeb: {
    position: "relative",
    overflow: "hidden",
  },
  ledgerSyncDateFieldInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  ledgerSyncDateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceForm,
  },
  ledgerSyncDateFieldPressed: {
    backgroundColor: Theme.surface,
  },
  ledgerSyncDateFieldText: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    color: Theme.textPrimaryDark,
  },
  missionToolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    minHeight: 34,
  },
  missionToolbarRowMob: {
    marginBottom: 6,
    gap: 6,
    minHeight: 32,
  },
  missionSearchIconBtn: {
    width: 38,
    height: 38,
    backgroundColor: LedgerSyncPalette.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  missionSearchIconBtnMob: {
    width: 34,
    height: 34,
  },
  missionSearchExpandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    width: 148,
    maxWidth: "42%",
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: LedgerSyncPalette.surface,
  },
  missionSearchExpandWrapMob: {
    width: 120,
    minWidth: 100,
    maxWidth: "46%",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  missionSearchExpandInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: LedgerSyncPalette.ink,
    paddingVertical: 0,
  },
  missionSearchExpandInputMob: {
    fontSize: 11,
  },
  missionSearchCollapseBtn: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  missionFilterStripInline: {
    flex: 1,
    minWidth: 0,
    flexGrow: 1,
  },
  missionFilterStripContentInline: {
    alignItems: "center",
    paddingRight: 4,
  },
  missionSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LedgerSyncPalette.surface,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  missionSearchIcon: {
    marginRight: 10,
  },
  missionSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
    paddingVertical: 11,
  },
  ledgerV2Grid: {
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },
  ledgerV2GridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  ledgerV2GridDesktopCompact: {
    marginTop: 4,
    gap: 10,
  },
  ledgerV2Col: {
    flex: 1,
    gap: 18,
    minWidth: 0,
  },
  syncHeroDateRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
  },
  syncHeroDateRowStack: {
    flexDirection: "column",
    gap: 10,
  },
  syncHeroDateRowInTripBand: {
    width: "100%",
  },
  syncHeroBandCard: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  syncHeroCardFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  syncAmountCardMobileAlign: {
    alignItems: "flex-start",
  },
  syncDateCardMobileAlign: {
    alignItems: "stretch",
  },
  syncSectionEyebrowMobile: {
    alignSelf: "stretch",
    textAlign: "left",
    marginBottom: 8,
    letterSpacing: 2,
  },
  syncDateHeadMobile: {
    width: "100%",
  },
  syncAmountRowMobile: {
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  syncAmountInputMobileLeft: {
    textAlign: "left",
  },
  syncAmountCardSide: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  syncRupeeSide: {
    fontSize: 20,
  },
  syncAmountInputSide: {
    fontSize: 22,
  },
  syncDateCardSide: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  syncDateChipSide: {
    paddingVertical: 10,
  },
  syncDateFieldWrapSide: {
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 10,
    gap: 8,
  },
  syncDateInputSide: {
    fontSize: 18,
  },
  syncAmountCard: {
    backgroundColor: Theme.surface,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  syncAmountEyebrow: {
    ...FinanceTxnTypography.columnTitle,
    color: Theme.textSection,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  syncAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  syncRupee: {
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  syncAmountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    paddingVertical: 4,
  },
  syncDateCard: {
    backgroundColor: Theme.surface,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  syncDateHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  syncDateEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  syncDateChips: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  syncDateChip: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  syncDateChipActive: {
    backgroundColor: LEDGER_SLATE,
  },
  syncDateChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  syncDateChipTextActive: {
    color: Theme.textOnDark,
  },
  syncDateFieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: 12,
  },
  syncDateFieldWrapError: {
  },
  syncDateMatrixCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  syncDateMatrixHead: {
    marginBottom: 10,
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  syncDateChipsMatrix: {
    marginBottom: 14,
    marginTop: 2,
  },
  syncDateFieldRowMatrix: {
    marginTop: 4,
    minHeight: 48,
  },
  syncDateFieldWrapPressable: {
    alignSelf: "stretch",
  },
  syncDateFieldWrapPressed: {
    backgroundColor: Theme.surfaceForm,
  },
  syncDateDisplayText: {
    flex: 1,
    minWidth: 0,
  },
  ledgerDatePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  ledgerDatePickerSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  ledgerDatePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  ledgerDatePickerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  ledgerDatePickerDone: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.primary,
  },
  ledgerWebDatePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  ledgerWebDatePickerCard: {
    width: "100%",
    maxWidth: 340,
    zIndex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  ledgerWebDatePickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 14,
  },
  ledgerWebDateInputWrap: {
    width: "100%",
    marginBottom: 18,
  },
  ledgerWebDatePickerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
  },
  ledgerWebDatePickerBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceForm,
  },
  ledgerWebDatePickerBtnGhostText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  ledgerWebDatePickerBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Theme.buttonPrimary,
  },
  ledgerWebDatePickerBtnPrimaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.screenBackground,
  },
  syncDateInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  protocolInnerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  /** Full-page protocol / category strip container. */
  protocolStripScroll: {
    width: "100%",
    flexGrow: 0,
  },
  protocolStripScrollSplit: {
    width: "100%",
    flexGrow: 0,
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  protocolStripContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  /** Desktop: all protocol tiles in one row (no wrap). */
  protocolStripRowSingle: {
    flexWrap: "nowrap",
    width: "100%",
  },
  protocolTile: {
    minHeight: 68,
    flexShrink: 0,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  protocolTileSelected: {
    backgroundColor: LEDGER_SLATE,
    transform: [{ scale: 1.02 }],
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  /** Ledger split strips: same active styling without scale (avoids horizontal clipping on narrow columns). */
  protocolTileSplitSelected: {
    backgroundColor: LEDGER_SLATE,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  protocolTileText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  protocolTileTextSelected: {
    color: Theme.textOnDark,
  },
  protocolTileSplit: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 3,
    gap: 3,
  },
  protocolTileTextSplit: {
    ...FinanceTxnTypography.chipLabel,
    lineHeight: 10,
    textAlign: "center",
  },
  syncReferenceCard: {
    backgroundColor: Theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  syncReferenceCardTripBand: {
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 0,
  },
  syncReferenceEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  syncReferenceEyebrowLedger: {
    textAlign: "left",
    letterSpacing: 2.4,
    color: Theme.textSection,
  },
  syncReferenceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.screenBackground,
  },
  syncReferenceInputPill: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  syncReferenceInput: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  syncPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  syncPartyLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    width: 96,
  },
  syncPartyValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  missionCardTripBandStack: {
    minHeight: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
  },
  missionCardTripPaneFill: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
  },
  /** Desktop split: trip list scrolls inside pane matched to provision card height. */
  missionListDesktopFill: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
    maxHeight: undefined,
  },
  missionChangeTripBtn: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.indigo,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  missionChangeTripBtnCapture: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.ink,
    textTransform: "uppercase",
    letterSpacing: 1.8,
  },
  missionLockedTripHint: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  missionCard: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  missionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  missionTitle: {
    ...FinanceTxnTypography.columnTitle,
    color: LedgerSyncPalette.muted,
    letterSpacing: 1.2,
  },
  missionTitleCapture: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  missionSub: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  missionFilterStrip: {
    marginBottom: 10,
    flexGrow: 0,
  },
  missionFilterStripMobile: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  missionFilterStripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  missionFilterStripContentMobile: {
    paddingRight: 4,
  },
  missionSearchInline: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 152,
    maxWidth: 220,
    flexShrink: 0,
  },
  missionSearchInlineCompact: {
    minWidth: 0,
    maxWidth: 140,
    flexShrink: 1,
    flexGrow: 0,
  },
  missionFilterSegment: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  missionFilterLabelInline: {
    ...FinanceTxnTypography.chatFilterGroupLabel,
  },
  missionFilterChipsRowInline: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 5,
  },
  missionFilterChip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  missionFilterChipOn: {
    backgroundColor: LedgerSyncPalette.slate,
    shadowColor: LedgerSyncPalette.slate,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  missionFilterChipText: {
    ...FinanceTxnTypography.chatFilterPill,
    textAlign: "center",
  },
  missionFilterChipTextOn: {
    ...FinanceTxnTypography.chatFilterPillOn,
  },
  missionFilterEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  missionList: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  missionListContentFit: {
    flexGrow: 0,
    paddingBottom: 4,
  },
  missionListContentCompact: {
    flexGrow: 0,
    paddingBottom: 12,
    gap: 8,
  },
  missionLocked: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceGray,
  },
  missionLockedLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  missionLockedVal: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  missionTripBlock: {
    marginBottom: 8,
    flexGrow: 0,
    alignSelf: "stretch",
  },
  missionTripProtocolCardCompact: {
    flexGrow: 0,
    alignSelf: "stretch",
    backgroundColor: LedgerSyncPalette.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  missionTripProtocolCardCompactOn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  missionTripProtocolIconCompact: {
    width: 36,
    height: 36,
    backgroundColor: LedgerSyncPalette.indigoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  missionTripProtocolIdCompact: {
    ...FinanceTxnTypography.partyTitle,
  },
  missionTripProtocolRouteCompact: {
    ...FinanceTxnTypography.routeWhy,
    marginTop: 2,
  },
  missionTripChipsInline: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
    flexGrow: 0,
  },
  missionTripDuePillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
    flexGrow: 0,
  },
  missionTripDuePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  missionTripDuePillGreen: {
    backgroundColor: LedgerSyncPalette.emeraldSoft,
  },
  missionTripDuePillRed: {
    backgroundColor: "#FFF1F2",
  },
  missionTripDuePillText: {
    ...FinanceTxnTypography.tripId,
    color: LedgerSyncPalette.emerald,
  },
  missionTripDuePillTextRed: {
    color: LedgerSyncPalette.rose,
  },
  missionTripDuePillTextOnDark: {
    color: Theme.textOnDark,
  },
  ledgerFocusedTripCard: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: LedgerSyncPalette.surface,
    padding: 16,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  ledgerFocusedTripWatermark: {
    position: "absolute",
    top: -16,
    right: -16,
    opacity: 0.35,
  },
  ledgerFocusedTripInner: {
    position: "relative",
    zIndex: 1,
    gap: 10,
  },
  ledgerFocusedTripHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ledgerFocusedTripId: {
    ...FinanceTxnTypography.partyTitle,
    color: LedgerSyncPalette.ink,
    flex: 1,
    minWidth: 0,
  },
  ledgerFocusedTripCheck: {
    width: 30,
    height: 30,
    backgroundColor: LedgerSyncPalette.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerFocusedTripRoute: {
    ...FinanceTxnTypography.routeWhy,
    color: LedgerSyncPalette.muted,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
  },
  ledgerFocusedTripChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    width: "100%",
    minWidth: 0,
  },
  ledgerFocusedTripChip: {
    backgroundColor: "#f8fafc",
  },
  ledgerFocusedTripChipText: {
    color: LedgerSyncPalette.ink,
  },
  ledgerFocusedTripDues: {
    gap: 8,
    paddingTop: 8,
  },
  ledgerFocusedTripDueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ledgerFocusedTripDueLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  ledgerFocusedTripDueIn: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.positive,
  },
  ledgerFocusedTripDueOut: {
    fontSize: 13,
    fontWeight: "900",
    color: LedgerSyncPalette.rose,
  },
  ledgerFocusedTripNoDueVal: {
    ...FinanceTxnTypography.noDueChip,
    fontSize: 10,
    color: Theme.textMuted,
  },
  ledgerModeIcon3D: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ledgerModeIcon3DInactive: {
    opacity: 0.55,
  },
  ledgerModeIcon3DSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  ledgerSyncModeSection: {
    gap: 12,
  },
  ledgerSectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  ledgerSectionEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  ledgerModeGrid3D: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  ledgerModeGridTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: LedgerSyncPalette.page,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 10,
    position: "relative",
  },
  ledgerModeGridTileOn: {
    backgroundColor: LedgerSyncPalette.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  ledgerModeGridLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  ledgerModeGridLabelOn: {
    color: LedgerSyncPalette.ink,
  },
  ledgerModeGridPulseDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    backgroundColor: LedgerSyncPalette.indigo,
  },
  ledgerModeExtraStrip: {
    gap: 8,
    paddingVertical: 2,
  },
  ledgerModeExtraChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: LedgerSyncPalette.page,
  },
  ledgerModeExtraChipOn: {
    backgroundColor: LedgerSyncPalette.ink,
  },
  ledgerModeExtraChipText: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ledgerModeExtraChipTextOn: {
    color: Theme.textOnDark,
  },
  ledgerProvisionMatrix: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  ledgerProvisionMatrixCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  ledgerProvisionMatrixColFull: {
    flex: 1,
    maxWidth: "100%",
  },
  ledgerFieldEyebrow: {
    ...FinanceTxnTypography.columnTitle,
    color: LedgerSyncPalette.muted,
    paddingHorizontal: 4,
  },
  ledgerRegistryRefField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: LedgerSyncPalette.page,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ledgerRegistryRefInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: LedgerSyncPalette.ink,
    paddingVertical: 0,
  },
  ledgerPaymentProtocolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: LedgerSyncPalette.page,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  ledgerPaymentProtocolText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "900",
    color: LedgerSyncPalette.ink,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  ledgerPaymentTypeStrip: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  syncHeroDateRowDesktopStack: {
    flexDirection: "column",
    gap: 12,
  },
  syncAmountCardDesktopHero: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 168,
    paddingVertical: 22,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  syncAmountCardDesktopPaymentStep: {
    minHeight: 0,
    flexShrink: 0,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 4,
  },
  syncAmountCardNoDueHighlight: {
    shadowColor: LedgerSyncPalette.indigo,
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  ledgerSyncNoDueBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(148, 163, 184, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: LedgerSyncPalette.indigo,
  },
  ledgerTripPreviewWrap: {
    width: "100%",
    marginBottom: 12,
  },
  ledgerSyncNoDueBannerText: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    lineHeight: 14,
    color: LedgerSyncPalette.muted,
  },
  syncAmountRowHeroDesktop: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
    minHeight: 56,
  },
  syncAmountHeroRupeeDesktop: {
    fontSize: 28,
    fontWeight: "800",
    fontStyle: "italic",
    color: "rgba(226,232,240,0.55)",
    paddingBottom: 0,
    lineHeight: 34,
  },
  syncAmountHeroInputDesktop: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 96,
    minHeight: 48,
    fontSize: 32,
    fontWeight: "800",
    fontStyle: "italic",
    lineHeight: 40,
    letterSpacing: -0.4,
    color: Theme.textOnDark,
    paddingVertical: 6,
    marginVertical: 0,
    textAlign: "center",
    ...Platform.select({
      web: {
        outlineStyle: "none",
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  syncDateCardDesktopFull: {
    width: "100%",
    alignSelf: "stretch",
  },
  missionTripProtocolCard: {
    backgroundColor: LedgerSyncPalette.surface,
    padding: 18,
    gap: 12,
    position: "relative",
    overflow: "hidden",
  },
  missionTripProtocolCardOn: {
    backgroundColor: LedgerSyncPalette.ink,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 8,
  },
  missionTripProtocolTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  missionTripProtocolTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  missionTripProtocolIcon: {
    width: 48,
    height: 48,
    backgroundColor: LedgerSyncPalette.indigoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  missionTripProtocolIconOn: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  missionTripProtocolTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  missionTripProtocolId: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: LedgerSyncPalette.ink,
  },
  missionTripProtocolIdOn: {
    color: Theme.textOnDark,
  },
  missionTripProtocolStatus: {
    fontSize: 9,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  missionTripProtocolStatusOn: {
    color: LedgerSyncPalette.indigo,
  },
  missionTripDateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: LedgerSyncPalette.page,
  },
  missionTripDateBadgeOn: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  missionTripDateBadgeText: {
    ...FinanceTxnTypography.dateLine,
    color: LedgerSyncPalette.muted,
  },
  missionTripDateBadgeTextOn: {
    color: Theme.textOnDark,
  },
  missionTripProtocolRoute: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  missionTripProtocolRouteOn: {
    color: "rgba(255,255,255,0.55)",
  },
  missionTripProtocolDueRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  missionTripDueBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: LedgerSyncPalette.page,
    minWidth: "46%",
    flexGrow: 1,
  },
  missionTripDueBoxOn: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  missionTripDueLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: LedgerSyncPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  missionTripDueValueIn: {
    fontSize: 13,
    fontWeight: "900",
    color: LedgerSyncPalette.emerald,
  },
  missionTripDueValueInOn: {
    color: "#6EE7B7",
  },
  missionTripDueValueOut: {
    fontSize: 13,
    fontWeight: "900",
    color: LedgerSyncPalette.rose,
  },
  missionTripDueValueOutOn: {
    color: "#FDA4AF",
  },
  missionTripProtocolCheck: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 36,
    height: 36,
    backgroundColor: LedgerSyncPalette.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  syncAmountCardPulse: {
    backgroundColor: LedgerSyncPalette.ink,
    paddingVertical: 18,
    paddingHorizontal: 14,
    overflow: "hidden",
    position: "relative",
  },
  syncAmountCardLight: {
    backgroundColor: LedgerSyncPalette.page,
    paddingVertical: 8,
    paddingHorizontal: 4,
    overflow: "visible",
    position: "relative",
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Desktop hero: do not clip large tabular figures (web TextInput). */
  syncAmountCardPulseDesktop: {
    overflow: "visible",
  },
  syncAmountGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  syncAmountEyebrowPulse: {
    color: LedgerSyncPalette.muted,
    letterSpacing: 3,
  },
  syncRupeePulse: {
    ...FinanceTxnTypography.amount,
    color: "#64748B",
  },
  syncRupeeLight: {
    ...FinanceTxnTypography.amount,
    color: LedgerSyncPalette.muted,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  syncAmountInputPulse: {
    ...FinanceTxnTypography.amount,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textOnDark,
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    textAlign: "center",
  },
  syncAmountInputLight: {
    ...FinanceTxnTypography.amount,
    fontSize: 32,
    fontWeight: "800",
    color: LedgerSyncPalette.ink,
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    textAlign: "center",
    paddingVertical: 6,
    marginVertical: 0,
    letterSpacing: -0.4,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  missionTripRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
  },
  missionTripPendingChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    paddingLeft: 4,
  },
  missionTripPendingChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: Theme.aggregatePillBg,
    maxWidth: "100%",
  },
  missionTripPendingChipDisabled: {
    opacity: 0.5,
    backgroundColor: Theme.surfaceGray,
  },
  missionTripPendingChipText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 8,
    color: Theme.textPrimaryDark,
  },
  missionTripPendingChipTextDisabled: {
    color: Theme.textSecondary,
  },
  missionTripNoDuePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: LedgerSyncPalette.page,
    maxWidth: "100%",
  },
  missionTripNoDuePillText: {
    ...FinanceTxnTypography.noDueChip,
    color: LedgerSyncPalette.muted,
  },
  ledgerFocusedNoDuePill: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ledgerFocusedNoDuePillText: {
    ...FinanceTxnTypography.noDueChip,
    color: "rgba(255,255,255,0.52)",
  },
  missionTripRowCompactOn: {
    backgroundColor: Theme.aggregatePillBg,
  },
  missionTripIconPlaceholder: {
    width: 28,
    height: 28,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  missionTripTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  missionTripRouteInline: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    textTransform: "none",
  },
  reconCard: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: LEDGER_SLATE,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  reconEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: LEDGER_PROTOCOL_ICON,
    textTransform: "uppercase",
    letterSpacing: 2,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  reconHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  reconAmountHero: {
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 0.3,
    marginBottom: 14,
  },
  reconDetailList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: 10,
    gap: 0,
  },
  reconDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  reconDetailLabel: {
    width: "34%",
    maxWidth: 120,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingTop: 2,
  },
  reconDetailValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
    textAlign: "right",
  },
  readyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(16,185,129,0.22)",
  },
  readyPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a7f3d0",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ledgerConfirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  ledgerConfirmCardWrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    maxHeight: "88%",
  },
  ledgerConfirmScroll: {
    maxHeight: 440,
  },
  ledgerConfirmScrollContent: {
    flexGrow: 0,
  },
  ledgerConfirmActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  ledgerConfirmBtnGhost: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
  },
  ledgerConfirmBtnGhostText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  ledgerConfirmBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  ledgerConfirmBtnPrimaryIn: {
    backgroundColor: Theme.darkGreen,
  },
  ledgerConfirmBtnPrimaryOut: {
    backgroundColor: Theme.teslaRed,
  },
  ledgerConfirmBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textOnPrimary,
  },
  ledgerPreviewCard: {
    backgroundColor: Theme.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginTop: 2,
  },
  ledgerPreviewHead: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ledgerPreviewHeadText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  ledgerPreviewStatus: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ledgerPreviewStatusIn: { color: Theme.darkGreen },
  ledgerPreviewStatusOut: { color: Theme.teslaRed },
  ledgerPreviewBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  ledgerPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  ledgerPreviewLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  ledgerPreviewValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  ledgerPreviewValueIn: { color: Theme.darkGreen },
  ledgerPreviewValueOut: { color: Theme.teslaRed },
  ledgerPreviewAmount: {
    flex: 1,
    textAlign: "right",
    fontSize: 18,
    fontWeight: "900",
  },
  ledgerPreviewAmountIn: { color: Theme.darkGreen },
  ledgerPreviewAmountOut: { color: Theme.teslaRed },
});
