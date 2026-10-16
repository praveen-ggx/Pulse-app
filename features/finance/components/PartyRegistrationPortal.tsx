/**
 * Party addition flow (Finance): desktop sheet or mobile full-screen wizards.
 * Steps: fill form → review and confirm → Finance entity handlers.
 */
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import {
  PARTY_LOOKUP_ERROR_MESSAGE,
  classifyNullInviteeResult,
  sameOrgPartyMessage,
} from "@/features/connections/hooks/usePartyPhoneLookupState";
import { CapacityDialPicker } from "@/components/CapacityDialPicker";
import Theme from "@/constants/Theme";
import type {
  AddClientFormData,
  ConnectionInviteeMatch,
} from "@/features/clients/components/AddClientModal";
import type { DriverFormData } from "@/features/drivers/components/AddDriverModal";
import {
  searchExistingDriversByPhone,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";
import type { SupplierFormData } from "@/features/suppliers/components/AddSupplierModal";
import type { AddVehicleCompletePayload } from "@/features/vehicles/utils/addVehiclePayload.model";
import {
  getCapacityRecommendations,
} from "@/features/vehicles/utils/indianTruckData.util";
import {
  BODY_LENGTH_SELECT_OPTIONS,
  OTHER_LABEL,
  normalizeBodyLengthKey,
} from "@/features/vehicles/utils/vehicleFormOptions.util";
import { partyAddModalChromeStyles } from "@/components/PartyAddModalChrome";
import {
  PartyContactMobileWizard,
  nextStepAfterContactImport,
  type PartyContactWizardFieldStep,
} from "@/components/party/PartyContactMobileWizard";
import { PartyContactCombinedForm } from "@/components/party/PartyContactCombinedForm";
import {
  PartyDriverMobileWizard,
  nextStepAfterDriverImport,
  type PartyDriverWizardStep,
} from "@/components/party/PartyDriverMobileWizard";
import { PartyCreateSuccessModal } from "@/components/party/PartyCreateSuccessModal";
import { PartyMobileWizardReview } from "@/components/party/PartyMobileWizardReview";
import {
  PartyVehicleMobileWizard,
  type PartyVehicleWizardStep,
} from "@/components/party/PartyVehicleMobileWizard";
import { VehicleTypeCatalogField } from "@/features/vehicles/components/VehicleTypeCatalogField";
import {
  capacityForPassingTon,
  parseVehicleTypeSelection,
} from "@/features/vehicles/utils/vehicleTypeCatalog.model";
import { showAppAlert } from "@/lib/appAlert";
import { validateEmail } from "@/lib/emailValidation";
import { formatIndianVehicleNumberInput, formatMobileNumber } from "@/lib/format";
import { applyIndianDlKeystroke } from "@/lib/indianDrivingLicenseInput.util";
import { applyIndianVehicleKeystroke } from "@/lib/indianVehicleInput.util";
import {
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from "@/lib/phoneValidation";
import { validateIndianVehicleNumber } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
  ArrowLeftRight,
  ArrowRight,
  BookUser,
  Building2,
  ChevronLeft,
  Key,
  Layers,
  Mail,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Truck,
  UserPlus,
  Verified,
} from "lucide-react-native";
import { isContactPickerAvailable, pickContactForNameAndPhone } from "@/lib/contactPicker";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
} from "@/features/connections/services/connectionRequests.service";
import {
  ActivityIndicator,
  Dimensions,
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
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PartyRegistrationKind =
  | "client"
  | "supplier"
  | "driver"
  | "vehicle";

/** Tiranga chip beside +91 (matches onboarding reference UI). */
function IndiaFlagIcon({
  width = 20,
  height = 15,
}: {
  width?: number;
  height?: number;
}) {
  const spokes = [...Array(24)].map((_, i) => (
    <Path
      key={i}
      transform={`rotate(${i * 15} 450 300)`}
      d="M450 208L444 300L456 300Z"
      fill="#000080"
    />
  ));
  return (
    <Svg width={width} height={height} viewBox="0 0 900 600">
      <Rect width={900} height={600} fill="#FF9933" />
      <Rect width={900} height={400} y={200} fill="#FFFFFF" />
      <Rect width={900} height={200} y={400} fill="#138808" />
      <Circle cx={450} cy={300} r={92.5} fill="#000080" />
      <Circle cx={450} cy={300} r={80} fill="#FFFFFF" />
      <Circle cx={450} cy={300} r={16} fill="#000080" />
      {spokes}
    </Svg>
  );
}

/** Web modal routes and Finance use the same portal above this width (px). */
export const PARTY_REGISTRATION_PORTAL_WEB_MIN_WIDTH = 900;

export interface PartyRegistrationPortalProps {
  visible: boolean;
  onClose: () => void;
  /** Tab selected when opened (from Finance subtabs). */
  initialKind: PartyRegistrationKind;
  organizationId: string | null;
  noOrganizationMessage: string | null;
  onRefreshOrganization?: () => void;
  onAddClient: (data: AddClientFormData) => Promise<void>;
  onAddSupplier: (data: SupplierFormData) => Promise<void>;
  onAddDriver: (data: DriverFormData) => Promise<void>;
  onAddVehicle: (payload: AddVehicleCompletePayload) => Promise<void>;
  /**
   * When set with `onSendInvitation`, debounced phone lookup (same as AddClientModal)
   * auto-fills contact / org from platform data and enables connection invite for customer flow.
   */
  searchInviteeByPhone?: (
    phone: string,
  ) => Promise<ConnectionInviteeMatch | null>;
  /** Called from review step when a non-driver platform match exists (instead of offline create). */
  onSendInvitation?: (toOrgId: string) => Promise<void>;
  /**
   * Same as client invite, for supplier: `createConnectionRequest` with carrier flag.
   * When set with `searchInviteeByPhone`, enables debounced lookup + invite on the supplier form.
   */
  onSendSupplierInvitation?: (toOrgId: string) => Promise<void>;
  /**
   * When set, debounced phone lookup + review “Send invitation” path (AddDriverModal parity).
   * If no app account match, review still saves via `onAddDriver`.
   */
  onInviteDriver?: (data: DriverFormData) => Promise<void>;
  /** Optional prefill for client form (used by attribution flow). */
  initialClientPrefill?: {
    organizationName?: string | null;
    contactName?: string | null;
    phone?: string | null;
  };
  /** Force full-page wizard layout (no desktop popup shell). */
  forceFullPage?: boolean;
}

const DL_CLEAN = /[\s-]/g;

// Serial block is 7 or 8 digits: most states issue 15-char DLs, some (e.g. AP) 16.
const DL_FORMAT = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7,8}$/;

const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const PHONE_DEBOUNCE_MS = 400;
const CLIENT_DRAFT_STORAGE_KEY = "party-registration-client-draft-v1";
const SUPPLIER_DRAFT_STORAGE_KEY = "party-registration-supplier-draft-v1";
const DRIVER_DRAFT_STORAGE_KEY = "party-registration-driver-draft-v1";
const VEHICLE_DRAFT_STORAGE_KEY = "party-registration-vehicle-draft-v1";

const READY_TO_SAVE_SUMMARY_COPY =
  "Saved records stay private to your current organization — Finance, trips, and assignments will pick them up automatically.";

interface DriverDraftStorage {
  organizationId: string | null;
  name: string;
  phone: string;
  license: string;
  email: string;
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
  preferOfflineOnly: boolean;
}

interface PartyContactDraftStorage {
  organizationId: string | null;
  organizationName: string;
  contactName: string;
  phoneDigits: string;
}

interface VehicleDraftStorage {
  organizationId: string | null;
  registration: string;
  category: string;
  capacity: string;
  bodyLength: string;
  bodyLengthIsOther: boolean;
  axle: string;
  bodyType?: string;
}

function readDraft<T>(storageKey: string): T | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeDraft<T>(storageKey: string, draft: T) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}

function clearDraft(storageKey: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage clear failures.
  }
}

function dlError(raw: string): string | null {
  const n = raw.trim().toUpperCase().replace(DL_CLEAN, "");
  if (!n) return null;
  return DL_FORMAT.test(n)
    ? null
    : "Use a valid DL number (e.g. TN01 20200001234).";
}

type SummaryIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

function vehiclePayloadFromInputs(
  reg: string,
  vehicleCategory: string,
  capacity: string,
  bodyLength: string,
  axle: string,
  bodyType: string,
): AddVehicleCompletePayload {
  const vehicleNumber = formatIndianVehicleNumberInput(reg).trim();
  return {
    vehicleSource: "organization",
    vehicleNumber,
    vehicleType: vehicleCategory.trim() || "Other",
    capacity: capacity.trim(),
    vehicleBrand: null,
    vehicleModel: null,
    vehicleBodyType: bodyType.trim() || null,
    vehicleSize: bodyLength.trim() || null,
    vehicleAxle: axle.trim() || null,
    documents: {},
  };
}

export function PartyRegistrationPortal(props: PartyRegistrationPortalProps) {
  const { width } = useWindowDimensions();
  if (!props.visible) return null;

  const isWide =
    props.forceFullPage !== true &&
    Platform.OS === "web" &&
    width >= 720;

  return <PartyRegistrationPortalInner {...props} layoutWide={isWide} />;
}

function PartyRegistrationPortalInner(
  props: PartyRegistrationPortalProps & { layoutWide: boolean },
) {
  const {
    visible,
    onClose,
    initialKind,
    organizationId,
    noOrganizationMessage,
    onRefreshOrganization,
    onAddClient,
    onAddSupplier,
    onAddDriver,
    onAddVehicle,
    searchInviteeByPhone,
    onSendInvitation,
    onSendSupplierInvitation,
    onInviteDriver,
    initialClientPrefill,
    layoutWide,
  } = props;

  const { t } = useLanguage();
  const [kind, setKind] = useState<PartyRegistrationKind>(initialKind);
  const [step, setStep] = useState<"form" | "review">("form");
  const [contactWizardStep, setContactWizardStep] =
    useState<PartyContactWizardFieldStep>("source");
  const [driverWizardStep, setDriverWizardStep] =
    useState<PartyDriverWizardStep>("source");
  const [vehicleWizardStep, setVehicleWizardStep] =
    useState<PartyVehicleWizardStep>("registration");
  const [submitting, setSubmitting] = useState(false);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [createSuccessInvited, setCreateSuccessInvited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [inviteeMatch, setInviteeMatch] =
    useState<ConnectionInviteeMatch | null>(null);
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [searchedNoResult, setSearchedNoResult] = useState(false);
  const [driverRegisteredAtPhone, setDriverRegisteredAtPhone] = useState(false);
  /** Phone is an ACTIVE member of this org (hidden by the invitee RPC). */
  const [sameOrgMemberAtPhone, setSameOrgMemberAtPhone] = useState(false);
  /** Membership undetermined; block submit and let the user retry. */
  const [lookupFailed, setLookupFailed] = useState(false);
  const phoneLookupSearchIdRef = useRef(0);
  const { width: viewportW, height: viewportH } = useWindowDimensions();
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(
    null,
  );

  const hasClientInviteSearch =
    kind === "client" &&
    Boolean(searchInviteeByPhone && onSendInvitation);
  const hasSupplierInviteSearch =
    kind === "supplier" &&
    Boolean(searchInviteeByPhone && onSendSupplierInvitation);
  const showPhoneInviteeUi = hasClientInviteSearch || hasSupplierInviteSearch;
  const inviteeIsDriver = inviteeProfileIsDriver(inviteeMatch?.profile_role);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible || typeof window === "undefined") {
      setVisualViewportHeight(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      setVisualViewportHeight(null);
      return;
    }
    const syncVisualViewport = () => {
      const next = Number.isFinite(vv.height) ? vv.height : null;
      setVisualViewportHeight(next && next > 0 ? next : null);
    };
    syncVisualViewport();
    vv.addEventListener("resize", syncVisualViewport);
    vv.addEventListener("scroll", syncVisualViewport);
    return () => {
      vv.removeEventListener("resize", syncVisualViewport);
      vv.removeEventListener("scroll", syncVisualViewport);
    };
  }, [visible]);

  // Shared-ish fields
  const [orgOrCompanyName, setOrgOrCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");

  // Driver
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverDl, setDriverDl] = useState("");
  const [driverExistingMatches, setDriverExistingMatches] = useState<
    ExistingDriverMatch[]
  >([]);
  const [driverPhoneLookupLoading, setDriverPhoneLookupLoading] =
    useState(false);
  const [driverPhoneLookupError, setDriverPhoneLookupError] = useState<
    string | null
  >(null);
  const driverPhoneLookupIdRef = useRef(0);
  const [driverEmail, setDriverEmail] = useState("");
  const [driverPayableAmount, setDriverPayableAmount] = useState<number | null>(
    null,
  );
  const [driverCommissionPercent, setDriverCommissionPercent] = useState<
    number | null
  >(null);
  const [driverCommissionPerKm, setDriverCommissionPerKm] = useState<
    number | null
  >(null);
  /** When true, Save creates a fleet driver row via `onAddDriver` instead of sending an in-app invite. */
  const [driverPreferOfflineOnly, setDriverPreferOfflineOnly] = useState(false);

  // Vehicle — global vehicle type picker + specs
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [vehicleBodyFt, setVehicleBodyFt] = useState("");
  const [bodyLengthIsOther, setBodyLengthIsOther] = useState(false);
  const [bodyLengthPickerOpen, setBodyLengthPickerOpen] = useState(false);
  const [vehicleAxle, setVehicleAxle] = useState("");
  const [vehicleBodyType, setVehicleBodyType] = useState("");
  /** Catalog pick fills vehicle type, body type, body length and capacity (if outside range). */
  const applyCatalogVehicleType = (value: string, passingTon: string | null) => {
    const sel = parseVehicleTypeSelection(value);
    setVehicleCategory(value);
    setVehicleBodyType(sel?.group ?? "");
    setBodyLengthIsOther(false);
    setVehicleBodyFt(sel?.type ?? "");
    const nextCapacity = capacityForPassingTon(passingTon, vehicleCapacity);
    if (nextCapacity) setVehicleCapacity(nextCapacity);
  };

  useEffect(() => {
    if (!visible) return;
    setKind(initialKind);
    setStep("form");
    setContactWizardStep("source");
    setDriverWizardStep("source");
    setVehicleWizardStep("registration");
    setFormError(null);
    setSubmitting(false);
    setShowCreateSuccess(false);
    setCreateSuccessInvited(false);
    setImportLoading(false);
    setImportError(null);
    setOrgOrCompanyName("");
    setContactName("");
    setPhoneDigits("");
    setDriverName("");
    setDriverPhone("");
    setDriverDl("");
    setDriverEmail("");
    setDriverPayableAmount(null);
    setDriverCommissionPercent(null);
    setDriverCommissionPerKm(null);
    setDriverPreferOfflineOnly(false);
    setDriverExistingMatches([]);
    setDriverPhoneLookupLoading(false);
    setDriverPhoneLookupError(null);
    setVehicleReg("");
    setVehicleCategory("");
    setVehicleCapacity("");
    setVehicleBodyFt("");
    setBodyLengthIsOther(false);
    setBodyLengthPickerOpen(false);
    setVehicleAxle("");
    setVehicleBodyType("");
    setInviteeMatch(null);
    setPhoneSearchLoading(false);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (initialKind === "client") {
      const draft = readDraft<PartyContactDraftStorage>(CLIENT_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setOrgOrCompanyName(draft.organizationName);
        setContactName(draft.contactName);
        setPhoneDigits(draft.phoneDigits);
      }
      const prefillOrg = String(initialClientPrefill?.organizationName ?? "").trim();
      const prefillContact = String(initialClientPrefill?.contactName ?? "").trim();
      const prefillPhone = formatMobileNumber(
        String(initialClientPrefill?.phone ?? "").trim(),
      );
      if (prefillOrg) setOrgOrCompanyName(prefillOrg);
      if (prefillContact) setContactName(prefillContact);
      if (prefillPhone) setPhoneDigits(prefillPhone);
    } else if (initialKind === "supplier") {
      const draft = readDraft<PartyContactDraftStorage>(SUPPLIER_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setOrgOrCompanyName(draft.organizationName);
        setContactName(draft.contactName);
        setPhoneDigits(draft.phoneDigits);
      }
    } else if (initialKind === "driver") {
      const draft = readDraft<DriverDraftStorage>(DRIVER_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setDriverName(draft.name);
        setDriverPhone(draft.phone);
        setDriverDl(draft.license);
        setDriverEmail(draft.email);
        setDriverPayableAmount(draft.payableAmount);
        setDriverCommissionPercent(draft.commissionPercent);
        setDriverCommissionPerKm(draft.commissionPerKm);
        setDriverPreferOfflineOnly(draft.preferOfflineOnly);
      }
    } else {
      const draft = readDraft<VehicleDraftStorage>(VEHICLE_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setVehicleReg(draft.registration);
        setVehicleCategory(draft.category);
        setVehicleCapacity(draft.capacity);
        setVehicleBodyFt(draft.bodyLength);
        setBodyLengthIsOther(draft.bodyLengthIsOther);
        setVehicleAxle(draft.axle);
        if (draft.bodyType) setVehicleBodyType(draft.bodyType);
      }
    }
  }, [visible, initialKind, organizationId, initialClientPrefill]);

  useEffect(() => {
    if (!visible || kind !== "client") return;
    writeDraft(CLIENT_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      organizationName: orgOrCompanyName,
      contactName,
      phoneDigits,
    } satisfies PartyContactDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    orgOrCompanyName,
    contactName,
    phoneDigits,
  ]);

  useEffect(() => {
    if (!visible || kind !== "supplier") return;
    writeDraft(SUPPLIER_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      organizationName: orgOrCompanyName,
      contactName,
      phoneDigits,
    } satisfies PartyContactDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    orgOrCompanyName,
    contactName,
    phoneDigits,
  ]);

  useEffect(() => {
    if (!visible || kind !== "driver") return;
    writeDraft(DRIVER_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      name: driverName,
      phone: driverPhone,
      license: driverDl,
      email: driverEmail,
      payableAmount: driverPayableAmount,
      commissionPercent: driverCommissionPercent,
      commissionPerKm: driverCommissionPerKm,
      preferOfflineOnly: driverPreferOfflineOnly,
    });
  }, [
    visible,
    kind,
    organizationId,
    driverName,
    driverPhone,
    driverDl,
    driverEmail,
    driverPayableAmount,
    driverCommissionPercent,
    driverCommissionPerKm,
    driverPreferOfflineOnly,
  ]);

  useEffect(() => {
    if (!visible || kind !== "vehicle") return;
    writeDraft(VEHICLE_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      registration: vehicleReg,
      category: vehicleCategory,
      capacity: vehicleCapacity,
      bodyLength: vehicleBodyFt,
      bodyLengthIsOther,
      axle: vehicleAxle,
      bodyType: vehicleBodyType,
    } satisfies VehicleDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    vehicleReg,
    vehicleCategory,
    vehicleCapacity,
    vehicleBodyFt,
    bodyLengthIsOther,
    vehicleAxle,
    vehicleBodyType,
  ]);

  // Add Client / Supplier — debounced phone lookup (AddClientModal / AddSupplierModal parity).
  useEffect(() => {
    if (!visible) return;
    if (kind === "client") {
      if (!searchInviteeByPhone || !onSendInvitation) return;
    } else if (kind === "supplier") {
      if (!searchInviteeByPhone || !onSendSupplierInvitation) return;
    } else {
      return;
    }
    const normalized = phoneDigits.trim().replace(/\s+/g, "");
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    setSameOrgMemberAtPhone(false);
    setLookupFailed(false);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++phoneLookupSearchIdRef.current;
    setPhoneSearchLoading(true);
    const timer = setTimeout(() => {
      searchInviteeByPhone(normalized).then(async (result) => {
        if (phoneLookupSearchIdRef.current !== id) return;
        if (!result) {
          // Null is ambiguous: absent, or an active same-org member the RPC hid.
          const status = organizationId
            ? await classifyNullInviteeResult(normalized, organizationId)
            : "not_found";
          // Phone changed / workspace switched while the probe was in flight.
          if (phoneLookupSearchIdRef.current !== id) return;
          setPhoneSearchLoading(false);
          setSameOrgMemberAtPhone(status === "same_org");
          setLookupFailed(status === "error");
          setSearchedNoResult(status === "not_found");
          return;
        }
        setPhoneSearchLoading(false);
        setInviteeMatch(result);
        setSearchedNoResult(false);
        setDriverRegisteredAtPhone(
          inviteeProfileIsDriver(result.profile_role),
        );
        if (result) {
          setContactName((prev) => (prev.trim() ? prev : result.full_name));
          const suggested = inviteeSuggestedCompanyName(result);
          if (suggested) {
            setOrgOrCompanyName((prev) => (prev.trim() ? prev : suggested));
          }
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    visible,
    kind,
    phoneDigits,
    searchInviteeByPhone,
    onSendInvitation,
    onSendSupplierInvitation,
    organizationId,
  ]);

  // Add Driver (web) — debounced lookup for in-app invite when `onInviteDriver` is provided.
  useEffect(() => {
    if (!visible || kind !== "driver" || !onInviteDriver) return;
    const normalized = driverPhone.trim().replace(/\s+/g, "");
    setDriverExistingMatches([]);
    setDriverPhoneLookupError(null);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setDriverPhoneLookupLoading(false);
      return;
    }
    const id = ++driverPhoneLookupIdRef.current;
    setDriverPhoneLookupLoading(true);
    const timer = setTimeout(() => {
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (driverPhoneLookupIdRef.current !== id) return;
        setDriverPhoneLookupLoading(false);
        setDriverPhoneLookupError(err?.message ?? null);
        setDriverExistingMatches(matches);
        if (matches.length === 1) {
          const one = matches[0];
          setDriverName((prev) => (prev.trim() ? prev : one.full_name));
          const dlFromRpc = one.license_number?.trim();
          if (dlFromRpc) {
            setDriverDl((prev) =>
              prev.trim() ? prev : applyIndianDlKeystroke(dlFromRpc),
            );
          }
          const em = one.email?.trim();
          if (em) {
            setDriverEmail((prev) => (prev.trim() ? prev : em));
          }
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visible, kind, driverPhone, onInviteDriver]);

  const handleDriverPhoneLookupChange = (text: string) => {
    setDriverPhone(formatMobileNumber(text));
    setDriverExistingMatches([]);
    setDriverPhoneLookupError(null);
    setDriverPreferOfflineOnly(false);
  };

  const handleDriverDlChange = (text: string) => {
    setDriverDl(applyIndianDlKeystroke(text));
  };

  const handleAddDriverOfflineInstead = () => {
    setDriverPreferOfflineOnly(true);
  };

  const insets = useSafeAreaInsets();
  const capacityRecommendations = useMemo(
    () => getCapacityRecommendations(vehicleCapacity).slice(0, 6),
    [vehicleCapacity],
  );

  const renderPortalSpecHint = (items: string[], currentValue: string) => {
    const display = items
      .filter(
        (item) =>
          item.trim().toLowerCase() !== currentValue.trim().toLowerCase(),
      )
      .slice(0, 5);
    if (display.length === 0) return null;
    return (
      <Text style={styles.specHintText}>
        Suggested: {display.join(", ")}
      </Text>
    );
  };

  const headline = useMemo(
    () =>
      kind === "client"
        ? "Customer"
        : kind === "supplier"
          ? "Supplier"
          : kind === "driver"
            ? "Driver"
            : "Vehicle",
    [kind],
  );

  const phoneE164Hint = useMemo(() => {
    const n = normalizeIndianPhoneForMetadata(phoneDigits);
    return n ?? "";
  }, [phoneDigits]);

  const driverPhonePretty = useMemo(() => {
    return normalizeIndianPhoneForMetadata(driverPhone) ?? driverPhone.trim();
  }, [driverPhone]);

  /**
   * At least one pay term is mandatory. Without it, every trip this driver runs
   * is priced by a silent 10%-of-trip-value fallback nobody agreed to.
   */
  const driverHasPayTerm =
    Number(driverPayableAmount ?? 0) > 0 ||
    Number(driverCommissionPercent ?? 0) > 0 ||
    Number(driverCommissionPerKm ?? 0) > 0;

  const validateFormForKind = useCallback(() => {
    setFormError(null);
    if (!organizationId) {
      setFormError(noOrganizationMessage ?? "Select or load an organization first.");
      return false;
    }
    if (kind === "client" || kind === "supplier") {
      if ((kind === "client" || kind === "supplier") && sameOrgMemberAtPhone) {
      setFormError(sameOrgPartyMessage(kind === "client" ? "client" : "supplier"));
      return;
    }
    if ((kind === "client" || kind === "supplier") && lookupFailed) {
      setFormError(PARTY_LOOKUP_ERROR_MESSAGE);
      return;
    }
    if (kind === "client" && driverRegisteredAtPhone) {
        setFormError(t("errorDriverCannotAddAsClient"));
        return false;
      }
      if (kind === "supplier" && driverRegisteredAtPhone) {
        setFormError(t("errorDriverCannotAddAsSupplier"));
        return false;
      }
      const orgOk = orgOrCompanyName.trim().length >= 2;
      const nameOk = contactName.trim().length >= 2;
      const phoneErr = validatePhone(phoneDigits);
      if (!orgOk) {
        setFormError(
          kind === "client"
            ? "Enter the organization or billing name."
            : "Enter the supplier company name.",
        );
        return false;
      }
      if (!nameOk) {
        setFormError("Enter the contact person's name.");
        return false;
      }
      if (phoneErr) {
        setFormError(phoneErr);
        return false;
      }
      return true;
    }
    if (kind === "driver") {
      if (
        onInviteDriver &&
        driverExistingMatches.some((m) => m.is_in_fleet === true)
      ) {
        setFormError(t("existingDriverInFleetDetail"));
        return false;
      }
      if (driverName.trim().length < 2) {
        setFormError("Enter the driver's name.");
        return false;
      }
      const pErr = validatePhone(driverPhone);
      if (pErr) {
        setFormError(pErr);
        return false;
      }
      const dl = dlError(driverDl);
      if (!driverDl.trim()) {
        setFormError("Enter the driving licence number.");
        return false;
      }
      if (dl) {
        setFormError(dl);
        return false;
      }
      const emailTrim = driverEmail.trim();
      if (emailTrim) {
        const eErr = validateEmail(emailTrim);
        if (eErr) {
          setFormError(eErr);
          return false;
        }
      }
      if (!driverHasPayTerm) {
        setFormError(
          "Set at least one pay term — fixed salary, commission %, or per km rate.",
        );
        return false;
      }
      return true;
    }
    const regErr = validateIndianVehicleNumber(vehicleReg);
    if (regErr) {
      setFormError(regErr);
      return false;
    }
    if (
      !vehicleCategory.trim() ||
      !vehicleCapacity.trim() ||
      !vehicleBodyFt.trim()
    ) {
      setFormError(
        "Select vehicle category, load capacity, and body length (use the lists or type manually).",
      );
      return false;
    }
    return true;
  }, [
    organizationId,
    noOrganizationMessage,
    kind,
    contactName,
    phoneDigits,
    driverName,
    driverPhone,
    driverDl,
    vehicleReg,
    vehicleCategory,
    vehicleCapacity,
    vehicleBodyFt,
    driverRegisteredAtPhone,
    driverExistingMatches,
    driverEmail,
    driverHasPayTerm,
    onInviteDriver,
    t,
  ]);

  const handlePhoneLookupChange = (text: string) => {
    const hadInviteeMatch = inviteeMatch != null;
    setPhoneDigits(formatMobileNumber(text));
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (hadInviteeMatch) {
      setContactName("");
      setOrgOrCompanyName("");
    }
  };

  const handleAddAsOfflineInstead = () => {
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
  };

  const goReview = () => {
    if (!validateFormForKind()) return;
    setStep("review");
  };

  const handleImportFromContacts = async () => {
    setImportError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setImportError(null);
        if (kind === "driver") {
          const digits = result.contact.phone
            .replace(/^\+91/, "")
            .replace(/^\+/, "");
          setDriverName(result.contact.name);
          setDriverPhone(formatMobileNumber(digits));
          setDriverExistingMatches([]);
          setDriverPhoneLookupError(null);
          if (!layoutWide) {
            setDriverWizardStep(
              nextStepAfterDriverImport(
                result.contact.name,
                digits,
                driverDl,
              ),
            );
          }
        } else {
          const digits = result.contact.phone
            .replace(/^\+91/, "")
            .replace(/^\+/, "");
          setContactName(result.contact.name);
          setPhoneDigits(formatMobileNumber(digits));
          if (kind === "client" || kind === "supplier") {
            setInviteeMatch(null);
            setSearchedNoResult(false);
            setDriverRegisteredAtPhone(false);
            if (!layoutWide) {
              setContactWizardStep(
                nextStepAfterContactImport("", result.contact.name, digits),
              );
            }
          }
        }
      } else if (result.reason !== "cancelled") {
        setImportError(result.message ?? "Could not load contact. Please type manually.");
      }
    } finally {
      setImportLoading(false);
    }
  };

  const contactPickerAvailable = isContactPickerAvailable();

  const openCreateSuccess = (invited: boolean) => {
    setCreateSuccessInvited(invited);
    setShowCreateSuccess(true);
  };

  const handleCreateSuccessOk = () => {
    setShowCreateSuccess(false);
    onClose();
  };

  const buildDriverPayload = (): DriverFormData => ({
    driverSource: "organization",
    name: driverName.trim(),
    phone: driverPhone.trim(),
    email: driverEmail.trim(),
    emergencyContact: "",
    emergencyName: "",
    licenseNumber: driverDl.trim().toUpperCase(),
    payableAmount: driverPayableAmount,
    commissionPercent: driverCommissionPercent,
    commissionPerKm: driverCommissionPerKm,
  });

  const confirmSave = async () => {
    if (!validateFormForKind()) {
      setStep("form");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (kind === "client") {
        const pNorm =
          normalizeIndianPhoneForMetadata(phoneDigits) ?? phoneDigits.trim();
        const inviteeIsDrv = inviteeProfileIsDriver(inviteeMatch?.profile_role);
        if (inviteeMatch && onSendInvitation && !inviteeIsDrv) {
          await onSendInvitation(inviteeMatch.organization_id);
          clearDraft(CLIENT_DRAFT_STORAGE_KEY);
          openCreateSuccess(true);
          return;
        }
        await onAddClient({
          organizationName: orgOrCompanyName.trim(),
          contactPerson: contactName.trim(),
          phone: pNorm,
        });
        clearDraft(CLIENT_DRAFT_STORAGE_KEY);
      } else if (kind === "supplier") {
        const pNorm =
          normalizeIndianPhoneForMetadata(phoneDigits) ?? phoneDigits.trim();
        const inviteeIsDrv = inviteeProfileIsDriver(inviteeMatch?.profile_role);
        if (inviteeMatch && onSendSupplierInvitation && !inviteeIsDrv) {
          await onSendSupplierInvitation(inviteeMatch.organization_id);
          clearDraft(SUPPLIER_DRAFT_STORAGE_KEY);
          openCreateSuccess(true);
          return;
        }
        await onAddSupplier({
          name: contactName.trim(),
          companyName: orgOrCompanyName.trim(),
          phone: pNorm,
        });
        clearDraft(SUPPLIER_DRAFT_STORAGE_KEY);
      } else if (kind === "driver") {
        const dp = buildDriverPayload();
        const pn = normalizeIndianPhoneForMetadata(dp.phone) ?? dp.phone.trim();
        const payload = { ...dp, phone: pn };
        if (
          onInviteDriver &&
          driverExistingMatches.length > 0 &&
          !driverPreferOfflineOnly
        ) {
          await onInviteDriver(payload);
          clearDraft(DRIVER_DRAFT_STORAGE_KEY);
          openCreateSuccess(true);
          return;
        }
        await onAddDriver(payload);
        clearDraft(DRIVER_DRAFT_STORAGE_KEY);
      } else {
        await onAddVehicle(
          vehiclePayloadFromInputs(
            vehicleReg,
            vehicleCategory,
            vehicleCapacity,
            vehicleBodyFt,
            vehicleAxle,
            vehicleBodyType,
          ),
        );
        clearDraft(VEHICLE_DRAFT_STORAGE_KEY);
      }
      openCreateSuccess(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Something went wrong. Try again.";
      showAppAlert("Could not save", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const summaryLinesData = useMemo(() => {
    if (kind === "client") {
      return [
        {
          label: "Business / billing name",
          value: orgOrCompanyName.trim() || "—",
          Icon: Building2,
        },
        {
          label: "Primary contact",
          value: contactName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        {
          label: "Phone",
          value: phoneE164Hint || phoneDigits.trim(),
          Icon: Smartphone,
        },
      ];
    }
    if (kind === "supplier") {
      return [
        {
          label: "Company",
          value: orgOrCompanyName.trim() || "—",
          Icon: Building2,
        },
        {
          label: "Contact person",
          value: contactName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        {
          label: "Phone",
          value: phoneE164Hint || phoneDigits.trim(),
          Icon: Smartphone,
        },
      ];
    }
    if (kind === "driver") {
      const lines: {
        label: string;
        value: string;
        Icon: SummaryIcon;
        emphasis?: boolean;
      }[] = [
        {
          label: "Driver",
          value: driverName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        { label: "Mobile", value: driverPhonePretty, Icon: Smartphone },
        {
          label: "Driving licence",
          value: driverDl.trim().toUpperCase(),
          Icon: Key,
        },
      ];
      if (driverEmail.trim()) {
        lines.push({
          label: "Email",
          value: driverEmail.trim(),
          Icon: Mail,
        });
      }
      const offerBits: string[] = [];
      if (driverPayableAmount != null && driverPayableAmount > 0) {
        offerBits.push(
          `Fixed ₹${driverPayableAmount.toLocaleString("en-IN")}`,
        );
      }
      if (driverCommissionPercent != null && driverCommissionPercent > 0) {
        offerBits.push(`${driverCommissionPercent}% commission`);
      }
      if (driverCommissionPerKm != null && driverCommissionPerKm > 0) {
        offerBits.push(`₹${driverCommissionPerKm}/km`);
      }
      if (offerBits.length > 0) {
        lines.push({
          label: "Compensation",
          value: offerBits.join(" · "),
          Icon: BookUser,
        });
      }
      return lines;
    }
    return [
      {
        label: "Registration",
        value: formatIndianVehicleNumberInput(vehicleReg).trim(),
        Icon: Verified,
        emphasis: true,
      },
      {
        label: "Vehicle category",
        value: vehicleCategory.trim() || "—",
        Icon: Truck,
      },
      ...(vehicleBodyType.trim()
        ? [{ label: "Body type", value: vehicleBodyType.trim(), Icon: Truck }]
        : []),
      { label: "Load capacity", value: vehicleCapacity.trim(), Icon: Layers },
      {
        label: "Body length",
        value: vehicleBodyFt.trim() || "—",
        Icon: ArrowLeftRight,
      },
      {
        label: "Axle",
        value: vehicleAxle.trim() || "—",
        Icon: RotateCcw,
      },
    ];
  }, [
    kind,
    orgOrCompanyName,
    contactName,
    phoneE164Hint,
    phoneDigits,
    driverName,
    driverPhonePretty,
    driverDl,
    driverEmail,
    driverPayableAmount,
    driverCommissionPercent,
    driverCommissionPerKm,
    vehicleReg,
    vehicleCategory,
    vehicleCapacity,
    vehicleBodyFt,
    vehicleAxle,
    vehicleBodyType,
  ]);

  if (!visible) return null;

  const formTitle = `New ${headline}`;

  const reviewDriverInvite =
    kind === "driver" &&
    Boolean(onInviteDriver) &&
    driverExistingMatches.length > 0 &&
    !driverPreferOfflineOnly;

  const reviewSaveLabel =
    inviteeMatch &&
    !inviteeIsDriver &&
    ((kind === "client" && onSendInvitation) ||
      (kind === "supplier" && onSendSupplierInvitation))
      ? t("sendInvitation")
      : reviewDriverInvite
        ? t("sendInvitation")
        : "Save";

  const reviewConfirmTitle =
    reviewSaveLabel === t("sendInvitation")
      ? `Confirm ${headline.toLowerCase()} invitation`
      : `Confirm ${headline.toLowerCase()} details`;

  const reviewConfirmMessage =
    reviewSaveLabel === t("sendInvitation")
      ? "Review the details below, then send the invitation."
      : "Review the summary below, then save to add this record to your organization.";

  const narrowShellMaxHeight =
    !layoutWide && viewportH > 0
      ? Math.min(
          Math.min(
            viewportH,
            visualViewportHeight != null ? visualViewportHeight : viewportH,
          ) * 0.94,
          900,
        )
      : undefined;
  /** Narrow sheet like ledger / transaction column density on desktop. */
  const shellMaxWidth = layoutWide
    ? Math.min(540, Math.max(400, viewportW - 48))
    : Math.max(280, viewportW - 24);
  /**
   * Max height cap for the content-sized desktop card that hosts the step
   * wizard. The card sizes to its content; this only prevents very tall steps
   * from exceeding the viewport (no minimum floor, so short steps like the
   * keypad don't get clipped or padded with empty space).
   */
  const wizardDesktopHeight = Math.min(Math.max(viewportH - 48, 360), 760);
  const keyboardInset =
    !layoutWide &&
    viewportH > 0 &&
    visualViewportHeight != null &&
    visualViewportHeight < viewportH
      ? viewportH - visualViewportHeight
      : 0;

  // Desktop uses the single-page combined form for clients/suppliers;
  // mobile keeps the step-by-step wizard for a focused experience.
  const useContactWizard =
    !layoutWide && (kind === "client" || kind === "supplier");
  const useContactCombinedDesktop =
    layoutWide && (kind === "client" || kind === "supplier");
  const useDriverWizard = !layoutWide && kind === "driver";
  const useVehicleWizard = !layoutWide && kind === "vehicle";
  const isDriverReviewTone = kind === "driver";
  const driverCompensationBitsCount =
    (driverPayableAmount != null && driverPayableAmount > 0 ? 1 : 0) +
    (driverCommissionPercent != null && driverCommissionPercent > 0 ? 1 : 0) +
    (driverCommissionPerKm != null && driverCommissionPerKm > 0 ? 1 : 0);
  const driverFixedSalaryLabel =
    driverPayableAmount != null && driverPayableAmount > 0
      ? `₹${driverPayableAmount.toLocaleString("en-IN")}`
      : "Not set";
  const driverTripCommissionLabel =
    driverCommissionPercent != null && driverCommissionPercent > 0
      ? `${driverCommissionPercent}%`
      : driverCommissionPerKm != null && driverCommissionPerKm > 0
        ? `₹${driverCommissionPerKm}/km`
        : "Not set";

  const orgBannerMobile = !organizationId ? (
    <View style={[styles.banner, { marginHorizontal: 20 }]}>
      <FontAwesome name="warning" size={16} color="#92400e" />
      <Text style={styles.bannerText}>
        {noOrganizationMessage ?? "No organization loaded."}
      </Text>
    </View>
  ) : null;

  const mobileWizardSummaryContent =
    kind === "driver" ? (
      <View style={styles.driverPreviewRoot}>
        <View style={styles.driverPreviewHero}>
          <Text style={styles.driverPreviewKicker}>Fleet invitation</Text>
          <Text style={styles.driverPreviewTitle}>Join your fleet driver team</Text>
          <Text style={styles.driverPreviewName} numberOfLines={1}>
            {driverName.trim() || "Driver"}
          </Text>
          <View style={styles.driverPreviewMetaRow}>
            <Text style={styles.driverPreviewMeta} numberOfLines={1}>
              {driverPhonePretty || "No mobile"}
            </Text>
            <Text style={styles.driverPreviewMetaDot}>•</Text>
            <Text style={styles.driverPreviewMeta} numberOfLines={1}>
              {driverDl.trim().toUpperCase() || "No licence"}
            </Text>
          </View>
        </View>

        <View style={styles.driverPreviewBody}>
          <View style={styles.driverPreviewSectionHeader}>
            <Text style={styles.driverPreviewSectionTitle}>Your offer</Text>
            <View style={styles.driverPreviewBenefitsPill}>
              <Text style={styles.driverPreviewBenefitsText}>
                {Math.max(driverCompensationBitsCount, 1)} benefits
              </Text>
            </View>
          </View>

          <View style={styles.driverPreviewOfferGrid}>
            <View style={[styles.driverPreviewOfferCard, styles.driverPreviewOfferCardPrimary]}>
              <Text style={styles.driverPreviewOfferValue}>{driverFixedSalaryLabel}</Text>
              <Text style={styles.driverPreviewOfferLabel}>Fixed salary</Text>
            </View>
            <View style={styles.driverPreviewOfferCard}>
              <Text style={styles.driverPreviewOfferValue}>{driverTripCommissionLabel}</Text>
              <Text style={styles.driverPreviewOfferLabel}>Trip commission</Text>
            </View>
          </View>

          <View style={styles.driverPreviewNextCard}>
            <Text style={styles.driverPreviewNextTitle}>What happens next</Text>
            <Text style={styles.driverPreviewNextLine}>
              → Driver can receive trip assignments from this fleet
            </Text>
            <Text style={styles.driverPreviewNextLine}>
              → Earnings and commissions are tracked automatically
            </Text>
            <Text style={styles.driverPreviewNextLine}>
              → Saved records stay private to your organization
            </Text>
          </View>

          <View style={styles.driverPreviewStatusBar}>
            <ShieldCheck size={15} color="#166534" strokeWidth={2.4} />
            <Text style={styles.driverPreviewStatusText}>
              Invitation preview stays active until you save this driver.
            </Text>
          </View>
        </View>
      </View>
    ) : (
      <View
        style={[
          styles.summaryDetailsCard,
          isDriverReviewTone && styles.summaryDetailsCardDriver,
        ]}
      >
        <Text
          style={[
            styles.summaryDetailsHeading,
            isDriverReviewTone && styles.summaryDetailsHeadingDriver,
          ]}
        >
          Details
        </Text>
        {summaryLinesData.map((line, idx) => (
          <SummaryDetailRow
            key={`${line.label}-${idx}`}
            label={line.label}
            value={line.value}
            Icon={line.Icon}
            emphasized={!!line.emphasis}
            isLast={false}
            tone={isDriverReviewTone ? "driver" : "default"}
          />
        ))}
        <SummaryDetailRow
          label="Ready to save"
          value={READY_TO_SAVE_SUMMARY_COPY}
          Icon={ShieldCheck}
          emphasized
          isLast
          iconColor={isDriverReviewTone ? "#16a34a" : Theme.buttonPrimaryText}
          valueMaxLines={12}
          valueProse
          tone={isDriverReviewTone ? "driver" : "default"}
        />
      </View>
    );

  const driverReviewFooterExtra =
    kind === "driver" &&
    onInviteDriver &&
    driverExistingMatches.length > 0 &&
    !driverExistingMatches.some((m) => m.is_in_fleet === true) &&
    !driverPreferOfflineOnly ? (
      <View style={{ width: "100%", paddingBottom: 4 }}>
        <Pressable
          onPress={handleAddDriverOfflineInstead}
          disabled={submitting}
          style={styles.clientOfflineLink}
        >
          <Text style={styles.clientOfflineLinkText}>
            Add as offline driver instead
          </Text>
        </Pressable>
      </View>
    ) : null;

  const contactWizardCanAdvance =
    (contactWizardStep === "organization" &&
      orgOrCompanyName.trim().length >= 2) ||
    (contactWizardStep === "contact" && contactName.trim().length >= 2) ||
    (contactWizardStep === "phone" &&
      contactName.trim().length >= 2 &&
      !validatePhone(phoneDigits) &&
      !driverRegisteredAtPhone &&
      !sameOrgMemberAtPhone &&
      !lookupFailed);

  const handleContactWizardAdvance = () => {
    setFormError(null);
    if (contactWizardStep === "organization") {
      if (orgOrCompanyName.trim().length < 2) {
        setFormError(
          kind === "client"
            ? "Enter the organization or billing name."
            : "Enter the supplier company name.",
        );
        return;
      }
      setContactWizardStep("contact");
      return;
    }
    if (contactWizardStep === "contact") {
      if (contactName.trim().length < 2) {
        setFormError("Enter the contact person's name.");
        return;
      }
      setContactWizardStep("phone");
      return;
    }
    if (contactWizardStep === "phone") {
      goReview();
    }
  };

  const contactWizardPhoneExtras =
    showPhoneInviteeUi && contactWizardStep === "phone" ? (
      <>
        <Text style={styles.clientPhoneLookupHint}>
          Search by number to find someone on the platform and invite their
          organization.
        </Text>
        {phoneDigits.trim().replace(/\s+/g, "").length >=
          MIN_PHONE_LENGTH_FOR_SEARCH && phoneSearchLoading ? (
          <View style={styles.clientLookupLoadingRow}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.clientLookupLoadingText}>Looking up…</Text>
          </View>
        ) : null}
        {inviteeMatch ? (
          <View style={styles.clientInviteeCard}>
            <Text style={styles.clientInviteeLabel}>
              {inviteeIsDriver
                ? t("inviteeRegisteredDriver")
                : t("inviteeFoundOnPlatform")}
            </Text>
            <Text style={styles.clientInviteeName}>
              {inviteeMatch.full_name || inviteeMatch.phone}
            </Text>
            <Text style={styles.clientInviteeHint}>
              {inviteeIsDriver
                ? kind === "supplier"
                  ? t("addSupplierInviteeHintDriver")
                  : t("addClientInviteeHintDriver")
                : kind === "supplier"
                  ? t("addSupplierInviteeHintDefault")
                  : t("addClientInviteeHintDefault")}
            </Text>
            {!inviteeIsDriver ? (
              <Pressable
                onPress={handleAddAsOfflineInstead}
                disabled={submitting}
                style={styles.clientOfflineLink}
                testID="party-add-offline-btn"
              >
                <Text style={styles.clientOfflineLinkText}>
                  Add as offline instead
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : sameOrgMemberAtPhone ? (
          <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
            {sameOrgPartyMessage(kind === "supplier" ? "supplier" : "client")}
          </Text>
        ) : lookupFailed ? (
          <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
            {PARTY_LOOKUP_ERROR_MESSAGE}
          </Text>
        ) : searchedNoResult ? (
          <Text style={styles.clientNoMatchHint}>
            No account with this number. Add as offline below.
          </Text>
        ) : null}
      </>
    ) : null;

  const driverWizardPhoneExtras =
    onInviteDriver && driverWizardStep === "phone" ? (
      <>
        <Text style={styles.clientPhoneLookupHint}>
          {t("existingDriverOnPlatform")}. If this number matches a driver
          account, you can send an in-app invitation on the next step.
        </Text>
        {driverPhone.trim().replace(/\s+/g, "").length >=
          MIN_PHONE_LENGTH_FOR_SEARCH && driverPhoneLookupLoading ? (
          <View style={styles.clientLookupLoadingRow}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.clientLookupLoadingText}>Looking up…</Text>
          </View>
        ) : null}
        {driverPhoneLookupError ? (
          <Text style={styles.importContactsError}>{driverPhoneLookupError}</Text>
        ) : null}
        {driverExistingMatches.length > 0 ? (
          <View style={styles.clientInviteeCard}>
            <Text style={styles.clientInviteeLabel}>
              {driverExistingMatches.some((m) => m.is_in_fleet)
                ? t("existingDriverInFleet")
                : t("existingDriverNotInFleet")}
            </Text>
            <Text style={styles.clientInviteeName}>
              {driverExistingMatches[0]?.full_name ||
                driverExistingMatches[0]?.phone ||
                "—"}
            </Text>
            <Text style={styles.clientInviteeHint}>
              {driverExistingMatches.some((m) => m.is_in_fleet)
                ? t("existingDriverInFleetDetail")
                : "Tap Continue, then use Send request on the review screen to invite them in the app."}
            </Text>
            {!driverExistingMatches.some((m) => m.is_in_fleet === true) ? (
              driverPreferOfflineOnly ? (
                <Text style={styles.clientInviteeHint}>
                  Offline fleet record only — no in-app invite will be sent.
                </Text>
              ) : (
                <Pressable
                  onPress={handleAddDriverOfflineInstead}
                  disabled={submitting}
                  style={styles.clientOfflineLink}
                  testID="party-driver-add-offline-btn"
                >
                  <Text style={styles.clientOfflineLinkText}>
                    Add as offline driver instead
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}
      </>
    ) : null;

  const driverWizardCanAdvance =
    driverWizardStep === "source" ||
    (driverWizardStep === "name" && driverName.trim().length >= 2) ||
    (driverWizardStep === "phone" &&
      !validatePhone(driverPhone) &&
      !(
        onInviteDriver &&
        driverExistingMatches.some((m) => m.is_in_fleet === true)
      )) ||
    (driverWizardStep === "license" &&
      driverDl.trim().length > 0 &&
      !dlError(driverDl)) ||
    (driverWizardStep === "extras" && driverHasPayTerm);

  const handleDriverWizardAdvance = () => {
    setFormError(null);
    if (driverWizardStep === "source") {
      setDriverWizardStep("name");
      return;
    }
    if (driverWizardStep === "name") {
      if (driverName.trim().length < 2) {
        setFormError("Enter the driver's name.");
        return;
      }
      setDriverWizardStep("phone");
      return;
    }
    if (driverWizardStep === "phone") {
      const pErr = validatePhone(driverPhone);
      if (pErr) {
        setFormError(pErr);
        return;
      }
      if (
        onInviteDriver &&
        driverExistingMatches.some((m) => m.is_in_fleet === true)
      ) {
        setFormError(t("existingDriverInFleetDetail"));
        return;
      }
      setDriverWizardStep("license");
      return;
    }
    if (driverWizardStep === "license") {
      if (!driverDl.trim()) {
        setFormError("Enter the driving licence number.");
        return;
      }
      const dl = dlError(driverDl);
      if (dl) {
        setFormError(dl);
        return;
      }
      setDriverWizardStep("extras");
      return;
    }
    if (driverWizardStep === "extras") {
      if (!driverHasPayTerm) {
        setFormError(
          "Set at least one pay term — fixed salary, commission %, or per km rate.",
        );
        return;
      }
      goReview();
    }
  };

  const vehicleWizardCanAdvance =
    (vehicleWizardStep === "registration" &&
      !validateIndianVehicleNumber(vehicleReg)) ||
    (vehicleWizardStep === "category" && Boolean(vehicleCategory.trim())) ||
    vehicleWizardStep === "model" ||
    (vehicleWizardStep === "specs" &&
      Boolean(vehicleCapacity.trim()) &&
      Boolean(vehicleBodyFt.trim()));

  const handleVehicleWizardAdvance = () => {
    setFormError(null);
    if (vehicleWizardStep === "registration") {
      const regErr = validateIndianVehicleNumber(vehicleReg);
      if (regErr) {
        setFormError(regErr);
        return;
      }
      setVehicleWizardStep("category");
      return;
    }
    if (vehicleWizardStep === "category") {
      if (!vehicleCategory.trim()) {
        setFormError("Select a vehicle category.");
        return;
      }
      setVehicleWizardStep("model");
      return;
    }
    if (vehicleWizardStep === "model") {
      setVehicleWizardStep("specs");
      return;
    }
    if (vehicleWizardStep === "specs") {
      if (!vehicleCapacity.trim() || !vehicleBodyFt.trim()) {
        setFormError("Enter load capacity and body length.");
        return;
      }
      goReview();
    }
  };

  const vehicleWizardCapacityHint = renderPortalSpecHint(
    capacityRecommendations,
    vehicleCapacity,
  );
  const vehicleWizardAxleHint = null;

  const renderVehiclePickerModals = (opts?: { overlay?: boolean }) => {
    const useOverlay = opts?.overlay === true;

    const wrapPicker = (
      visible: boolean,
      onClose: () => void,
      sheet: ReactNode,
    ) => {
      if (!visible) return null;
      if (useOverlay) {
        return (
          <View style={styles.vehiclePickOverlayHost} pointerEvents="box-none">
            {sheet}
          </View>
        );
      }
      return (
        <Modal
          visible
          transparent
          animationType="slide"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={onClose}
        >
          {sheet}
        </Modal>
      );
    };

    const bodyLengthSheet = (
        <KeyboardAvoidingView
          style={styles.vehiclePickBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setBodyLengthPickerOpen(false)}
          />
          <View
            style={[
              styles.vehiclePickSheet,
              {
                paddingBottom: insets.bottom + 16,
                maxHeight: Dimensions.get("window").height * 0.72,
              },
            ]}
          >
            <Text style={styles.vehiclePickTitle}>Body length</Text>
            <Text style={styles.vehiclePickHint}>
              Choose a preset or Other for a custom value.
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={styles.vehiclePickScroll}
            >
              {BODY_LENGTH_SELECT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={normalizeBodyLengthKey(opt)}
                  style={[
                    styles.vehiclePickRow,
                    normalizeBodyLengthKey(vehicleBodyFt) ===
                      normalizeBodyLengthKey(opt) &&
                      !bodyLengthIsOther &&
                      styles.vehiclePickRowActive,
                  ]}
                  onPress={() => {
                    setBodyLengthIsOther(false);
                    setVehicleBodyFt(opt);
                    setBodyLengthPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.vehiclePickRowText,
                      normalizeBodyLengthKey(vehicleBodyFt) ===
                        normalizeBodyLengthKey(opt) &&
                        !bodyLengthIsOther &&
                        styles.vehiclePickRowTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.vehiclePickRow,
                  bodyLengthIsOther && styles.vehiclePickRowActive,
                ]}
                onPress={() => {
                  setBodyLengthIsOther(true);
                  setVehicleBodyFt("");
                  setBodyLengthPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.vehiclePickRowText,
                    bodyLengthIsOther && styles.vehiclePickRowTextActive,
                  ]}
                >
                  {OTHER_LABEL} — type manually
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={styles.vehiclePickDone}
              onPress={() => setBodyLengthPickerOpen(false)}
            >
              <Text style={styles.vehiclePickDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
    );

    return (
      <>
        {wrapPicker(
          bodyLengthPickerOpen,
          () => setBodyLengthPickerOpen(false),
          bodyLengthSheet,
        )}
      </>
    );
  };

  /**
   * Present a step wizard. Mobile / narrow web → full-screen slide.
   * Desktop (wide web) → same wizard hosted inside a centered card so it matches
   * the mobile experience. The review step renders its own centered overlay, so
   * on desktop it's shown directly (no extra card wrapper).
   */
  const renderWizardModal = (body: ReactNode, extra?: ReactNode) => {
    const isReview = step !== "form";
    // Success dialog closes the portal on OK (handleCreateSuccessOk → onClose);
    // the combined form relied on it, so the wizard flow renders it too.
    const successModal = (
      <PartyCreateSuccessModal
        visible={showCreateSuccess}
        kind={kind}
        invited={createSuccessInvited}
        onOk={handleCreateSuccessOk}
      />
    );

    if (!layoutWide) {
      return (
        <>
          <Modal
            visible
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onClose}
          >
            {body}
            {extra}
          </Modal>
          {successModal}
        </>
      );
    }

    return (
      <>
        <Modal
          visible
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={onClose}
        >
          {isReview ? (
            <>
              {body}
              {extra}
            </>
          ) : (
            <View style={partyAddModalChromeStyles.overlay}>
              <Pressable
                style={partyAddModalChromeStyles.overlayDismissHit}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              />
              <View
                style={[
                  partyAddModalChromeStyles.shell,
                  styles.wizardDesktopCard,
                  { maxWidth: shellMaxWidth, maxHeight: wizardDesktopHeight },
                ]}
              >
                {body}
              </View>
              {extra}
            </View>
          )}
        </Modal>
        {successModal}
      </>
    );
  };

  if (useContactCombinedDesktop) {
    const combinedCanAdvance =
      !!organizationId &&
      orgOrCompanyName.trim().length >= 2 &&
      contactName.trim().length >= 2 &&
      !validatePhone(phoneDigits) &&
      !driverRegisteredAtPhone &&
      !sameOrgMemberAtPhone &&
      !lookupFailed;

    return renderWizardModal(
      step === "form" ? (
        <PartyContactCombinedForm
          entityTitle={formTitle}
          subtitle="Fill required fields and continue."
          onClose={onClose}
          orgLabel={
            kind === "client"
              ? "Organization / billing name"
              : "Supplier company name"
          }
          orgValue={orgOrCompanyName}
          onOrgChange={setOrgOrCompanyName}
          contactLabel="Primary contact"
          contactValue={contactName}
          onContactChange={setContactName}
          phoneValue={phoneDigits}
          onPhoneChange={handlePhoneLookupChange}
          formError={formError}
          noOrganizationBanner={
            !organizationId ? (
              <View style={[styles.banner, { marginHorizontal: 0, marginBottom: 12 }]}>
                <FontAwesome name="warning" size={16} color="#92400e" />
                <Text style={styles.bannerText}>
                  {noOrganizationMessage ?? "No organization loaded."}
                </Text>
              </View>
            ) : null
          }
          phoneExtras={
            showPhoneInviteeUi ? (
              <>
                <Text style={styles.clientPhoneLookupHint}>
                  Search by number to find someone on the platform and invite their
                  organization.
                </Text>
                {phoneDigits.trim().replace(/\s+/g, "").length >=
                  MIN_PHONE_LENGTH_FOR_SEARCH && phoneSearchLoading ? (
                  <View style={styles.clientLookupLoadingRow}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.clientLookupLoadingText}>Looking up…</Text>
                  </View>
                ) : null}
                {inviteeMatch ? (
                  <View style={styles.clientInviteeCard}>
                    <Text style={styles.clientInviteeLabel}>
                      {inviteeIsDriver
                        ? t("inviteeRegisteredDriver")
                        : t("inviteeFoundOnPlatform")}
                    </Text>
                    <Text style={styles.clientInviteeName}>
                      {inviteeMatch.full_name || inviteeMatch.phone}
                    </Text>
                    <Text style={styles.clientInviteeHint}>
                      {inviteeIsDriver
                        ? kind === "supplier"
                          ? t("addSupplierInviteeHintDriver")
                          : t("addClientInviteeHintDriver")
                        : kind === "supplier"
                          ? t("addSupplierInviteeHintDefault")
                          : t("addClientInviteeHintDefault")}
                    </Text>
                    {!inviteeIsDriver ? (
                      <Pressable
                        onPress={handleAddAsOfflineInstead}
                        disabled={submitting}
                        style={styles.clientOfflineLink}
                        testID="party-add-offline-btn"
                      >
                        <Text style={styles.clientOfflineLinkText}>
                          Add as offline instead
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : sameOrgMemberAtPhone ? (
                  <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
                    {sameOrgPartyMessage(kind === "supplier" ? "supplier" : "client")}
                  </Text>
                ) : lookupFailed ? (
                  <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
                    {PARTY_LOOKUP_ERROR_MESSAGE}
                  </Text>
                ) : searchedNoResult ? (
                  <Text style={styles.clientNoMatchHint}>
                    No account with this number. Add as offline below.
                  </Text>
                ) : null}
              </>
            ) : null
          }
          canAdvance={combinedCanAdvance}
          onAdvance={goReview}
          advanceLabel="Continue"
        />
      ) : (
        <PartyMobileWizardReview
          onBackToEdit={() => setStep("form")}
          summaryContent={mobileWizardSummaryContent}
          reviewSaveLabel={reviewSaveLabel}
          submitting={submitting}
          organizationId={organizationId}
          onConfirm={() => void confirmSave()}
          title={reviewConfirmTitle}
          message={reviewConfirmMessage}
        />
      ),
    );
  }

  if (useContactWizard) {
    return renderWizardModal(
      step === "form" ? (
            <PartyContactMobileWizard
              entityTitle={formTitle.toUpperCase()}
              subtitle="Fill required fields and continue."
              wizardStep={contactWizardStep}
              onWizardStepChange={setContactWizardStep}
              onClose={onClose}
              orgLabel={
                kind === "client"
                  ? "Organization / billing name"
                  : "Supplier company name"
              }
              orgValue={orgOrCompanyName}
              onOrgChange={setOrgOrCompanyName}
              contactLabel="Primary contact"
              contactValue={contactName}
              onContactChange={setContactName}
              phoneValue={phoneDigits}
              onPhoneChange={handlePhoneLookupChange}
              importLoading={importLoading}
              contactPickerAvailable={contactPickerAvailable}
              importError={importError}
              onImportContacts={() => void handleImportFromContacts()}
              formError={formError}
              noOrganizationBanner={
                !organizationId ? (
                  <View style={[styles.banner, { marginHorizontal: 20 }]}>
                    <FontAwesome name="warning" size={16} color="#92400e" />
                    <Text style={styles.bannerText}>
                      {noOrganizationMessage ?? "No organization loaded."}
                    </Text>
                  </View>
                ) : null
              }
              phoneStepExtras={contactWizardPhoneExtras}
              canAdvance={contactWizardCanAdvance}
              onAdvance={handleContactWizardAdvance}
              advanceLabel={
                contactWizardStep === "phone" ? "Review" : "Continue"
              }
            />
          ) : (
            <PartyMobileWizardReview
              onBackToEdit={() => {
                setStep("form");
                setContactWizardStep("phone");
              }}
              summaryContent={mobileWizardSummaryContent}
              reviewSaveLabel={reviewSaveLabel}
              submitting={submitting}
              organizationId={organizationId}
              onConfirm={() => void confirmSave()}
              title={reviewConfirmTitle}
              message={reviewConfirmMessage}
            />
      ),
    );
  }

  if (useDriverWizard) {
    return renderWizardModal(
      step === "form" ? (
            <PartyDriverMobileWizard
              entityTitle={formTitle.toUpperCase()}
              wizardStep={driverWizardStep}
              onWizardStepChange={setDriverWizardStep}
              onClose={onClose}
              driverName={driverName}
              onDriverNameChange={setDriverName}
              driverPhone={driverPhone}
              onDriverPhoneChange={
                onInviteDriver
                  ? handleDriverPhoneLookupChange
                  : (x) => setDriverPhone(x.replace(/[^\d+]/g, ""))
              }
              phoneMaxLength={onInviteDriver ? 10 : 14}
              driverDl={driverDl}
              onDriverDlChange={handleDriverDlChange}
              driverEmail={driverEmail}
              onDriverEmailChange={setDriverEmail}
              driverPayableAmount={driverPayableAmount}
              onDriverPayableAmountChange={setDriverPayableAmount}
              driverCommissionPercent={driverCommissionPercent}
              onDriverCommissionPercentChange={setDriverCommissionPercent}
              driverCommissionPerKm={driverCommissionPerKm}
              onDriverCommissionPerKmChange={setDriverCommissionPerKm}
              importLoading={importLoading}
              contactPickerAvailable={contactPickerAvailable}
              importError={importError}
              onImportContacts={() => void handleImportFromContacts()}
              formError={formError}
              noOrganizationBanner={orgBannerMobile}
              phoneStepExtras={driverWizardPhoneExtras}
              canAdvance={driverWizardCanAdvance}
              onAdvance={handleDriverWizardAdvance}
              advanceLabel={
                driverWizardStep === "extras" ? "Review" : "Continue"
              }
            />
          ) : (
            <PartyMobileWizardReview
              onBackToEdit={() => {
                setStep("form");
                setDriverWizardStep("extras");
              }}
              summaryContent={mobileWizardSummaryContent}
              footerExtra={driverReviewFooterExtra}
              reviewSaveLabel={reviewSaveLabel}
              submitting={submitting}
              organizationId={organizationId}
              onConfirm={() => void confirmSave()}
              title={reviewConfirmTitle}
              message={reviewConfirmMessage}
            />
      ),
    );
  }

  if (useVehicleWizard) {
    return renderWizardModal(
      step === "form" ? (
            <PartyVehicleMobileWizard
              entityTitle={formTitle.toUpperCase()}
              wizardStep={vehicleWizardStep}
              onWizardStepChange={setVehicleWizardStep}
              onClose={onClose}
              vehicleReg={vehicleReg}
              onVehicleRegChange={setVehicleReg}
              vehicleCategory={vehicleCategory}
              onVehicleCategoryChange={(cat) => { setVehicleCategory(cat); setVehicleBodyType(""); }}
              categoryField={
                <VehicleTypeCatalogField
                  value={vehicleCategory}
                  tons={vehicleCapacity}
                  onChange={applyCatalogVehicleType}
                  style={styles.input}
                />
              }
              hideBodyLength={parseVehicleTypeSelection(vehicleCategory) != null}
              vehicleCapacity={vehicleCapacity}
              onVehicleCapacityChange={setVehicleCapacity}
              vehicleBodyFt={vehicleBodyFt}
              onVehicleBodyFtChange={setVehicleBodyFt}
              bodyLengthIsOther={bodyLengthIsOther}
              onOpenBodyLengthPicker={() => setBodyLengthPickerOpen(true)}
              onChooseBodyLengthFromList={() => {
                setBodyLengthIsOther(false);
                setBodyLengthPickerOpen(true);
              }}
              vehicleAxle={vehicleAxle}
              onVehicleAxleChange={setVehicleAxle}
              vehicleBodyType={vehicleBodyType}
              onVehicleBodyTypeChange={setVehicleBodyType}
              capacityHint={vehicleWizardCapacityHint}
              axleHint={vehicleWizardAxleHint}
              formError={formError}
              noOrganizationBanner={orgBannerMobile}
              canAdvance={vehicleWizardCanAdvance}
              onAdvance={handleVehicleWizardAdvance}
              advanceLabel={
                vehicleWizardStep === "specs" ? "Review" : "Continue"
              }
            />
          ) : (
            <PartyMobileWizardReview
              onBackToEdit={() => {
                setStep("form");
                setVehicleWizardStep("specs");
              }}
              summaryContent={mobileWizardSummaryContent}
              reviewSaveLabel={reviewSaveLabel}
              submitting={submitting}
              organizationId={organizationId}
              onConfirm={() => void confirmSave()}
              title={reviewConfirmTitle}
              message={reviewConfirmMessage}
            />
      ),
      renderVehiclePickerModals({ overlay: true }),
    );
  }

  return (
    <>
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          partyAddModalChromeStyles.overlay,
          !layoutWide && styles.overlayCompactMobile,
          !layoutWide && {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingHorizontal: 12,
          },
        ]}
      >
        <Pressable
          style={partyAddModalChromeStyles.overlayDismissHit}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            partyAddModalChromeStyles.shell,
            layoutWide && styles.shellWideDesktop,
            !layoutWide && styles.shellStacked,
            !layoutWide && styles.shellNarrowWeb,
            {
              maxWidth: shellMaxWidth,
              ...(narrowShellMaxHeight != null
                ? { maxHeight: narrowShellMaxHeight }
                : {}),
            },
          ]}
        >
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.mainScrollContent,
              keyboardInset > 0 && { paddingBottom: 40 + keyboardInset },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.portalHeaderMinimal}>
              <Pressable
                style={styles.backBtnLight}
                onPress={step === "review" ? () => setStep("form") : onClose}
                hitSlop={12}
                testID="party-close-btn"
              >
                <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
              </Pressable>
            </View>

            {!organizationId ? (
              <View style={styles.banner}>
                <FontAwesome name="warning" size={16} color="#92400e" />
                <Text style={styles.bannerText}>
                  {noOrganizationMessage ?? "No organization loaded."}
                </Text>
                {onRefreshOrganization ? (
                  <Pressable style={styles.bannerBtn} onPress={onRefreshOrganization}>
                    <Text style={styles.bannerBtnText}>Refresh</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {step === "form" ? (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.liveDot} />
                  <Text style={styles.formHeaderTitle}>{formTitle}</Text>
                </View>
                <Text style={styles.formHeaderHint}>
                  Fill required fields and continue.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.liveDot} />
                  <Text style={styles.formHeaderTitle}>{reviewConfirmTitle}</Text>
                </View>
                <Text style={styles.formHeaderHint}>{reviewConfirmMessage}</Text>
              </>
            )}

            {formError ? (
              <View style={styles.errorBar} testID="party-form-error">
                <Text style={styles.errorBarText}>{formError}</Text>
              </View>
            ) : null}

            {step === "form" ? (
              <View style={styles.fieldsBlock}>
                {(kind === "client" || kind === "supplier" || kind === "driver") && (
                  <View style={styles.importContactsWrap}>
                    <Pressable
                      style={[
                        styles.importContactsBtn,
                        (!contactPickerAvailable || importLoading) && styles.importContactsBtnDim,
                      ]}
                      onPress={() => void handleImportFromContacts()}
                      disabled={importLoading}
                    >
                      {importLoading ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <BookUser
                          size={16}
                          color={contactPickerAvailable ? "#2563eb" : Theme.textMuted}
                          strokeWidth={2.2}
                        />
                      )}
                      <Text
                        style={[
                          styles.importContactsBtnText,
                          !contactPickerAvailable && styles.importContactsBtnTextMuted,
                        ]}
                      >
                        {importLoading ? "Opening contacts…" : "Import from contacts"}
                      </Text>
                    </Pressable>
                    {importError ? (
                      <Text style={styles.importContactsError}>{importError}</Text>
                    ) : !contactPickerAvailable ? (
                      <Text style={styles.importContactsHint}>
                        Open this page on your phone's Chrome browser to use contact import.
                      </Text>
                    ) : null}
                  </View>
                )}

                {(kind === "client" || kind === "supplier") && (
                  <>
                    <Field
                      label={
                        kind === "client"
                          ? "Organization / billing name"
                          : "Supplier company name"
                      }
                    >
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. abc company"
                        placeholderTextColor={Theme.textMuted}
                        value={orgOrCompanyName}
                        onChangeText={setOrgOrCompanyName}
                        autoCapitalize="words"
                        testID="party-org-name-input"
                      />
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Primary contact">
                          <TextInput
                            style={styles.input}
                            placeholder="Full name"
                            placeholderTextColor={Theme.textMuted}
                            value={contactName}
                            onChangeText={setContactName}
                            testID="party-contact-name-input"
                          />
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Phone">
                          <View style={styles.phoneOuter}>
                            <View style={styles.phoneCcWrap}>
                              <IndiaFlagIcon width={20} height={15} />
                              <Text style={styles.phoneCc}>+91</Text>
                            </View>
                            <TextInput
                              style={[styles.input, styles.phoneInput]}
                              placeholder="10-digit mobile"
                              placeholderTextColor={Theme.textMuted}
                              keyboardType="phone-pad"
                              maxLength={
                                kind === "client" || kind === "supplier"
                                  ? 10
                                  : 14
                              }
                              value={phoneDigits}
                              onChangeText={
                                kind === "client" || kind === "supplier"
                                  ? handlePhoneLookupChange
                                  : (x) =>
                                      setPhoneDigits(x.replace(/[^\d+]/g, ""))
                              }
                              testID="party-phone-input"
                            />
                            <Smartphone
                              size={18}
                              color={Theme.textMuted}
                              style={styles.phoneIcon}
                            />
                          </View>
                        </Field>
                      </View>
                    </View>
                    {showPhoneInviteeUi ? (
                      <>
                        <Text style={styles.clientPhoneLookupHint}>
                          Search by number to find someone on the platform and invite
                          their organization.
                        </Text>
                        {phoneDigits.trim().replace(/\s+/g, "").length >=
                          MIN_PHONE_LENGTH_FOR_SEARCH && phoneSearchLoading ? (
                          <View style={styles.clientLookupLoadingRow}>
                            <ActivityIndicator size="small" color="#2563eb" />
                            <Text style={styles.clientLookupLoadingText}>
                              Looking up…
                            </Text>
                          </View>
                        ) : null}
                        {inviteeMatch ? (
                          <View style={styles.clientInviteeCard}>
                            <Text style={styles.clientInviteeLabel}>
                              {inviteeIsDriver
                                ? t("inviteeRegisteredDriver")
                                : t("inviteeFoundOnPlatform")}
                            </Text>
                            <Text style={styles.clientInviteeName}>
                              {inviteeMatch.full_name || inviteeMatch.phone}
                            </Text>
                            <Text style={styles.clientInviteeHint}>
                              {inviteeIsDriver
                                ? kind === "supplier"
                                  ? t("addSupplierInviteeHintDriver")
                                  : t("addClientInviteeHintDriver")
                                : kind === "supplier"
                                  ? t("addSupplierInviteeHintDefault")
                                  : t("addClientInviteeHintDefault")}
                            </Text>
                            {!inviteeIsDriver ? (
                              <Pressable
                                onPress={handleAddAsOfflineInstead}
                                disabled={submitting}
                                style={styles.clientOfflineLink}
                                testID="party-add-offline-btn"
                              >
                                <Text style={styles.clientOfflineLinkText}>
                                  Add as offline instead
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : sameOrgMemberAtPhone ? (
                          <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
                            {sameOrgPartyMessage(kind === "supplier" ? "supplier" : "client")}
                          </Text>
                        ) : lookupFailed ? (
                          <Text style={[styles.clientNoMatchHint, { color: Theme.negative }]}>
                            {PARTY_LOOKUP_ERROR_MESSAGE}
                          </Text>
                        ) : searchedNoResult ? (
                          <Text style={styles.clientNoMatchHint}>
                            No account with this number. Add as offline below.
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}

                {kind === "driver" && (
                  <>
                    <Field label="Driver name">
                      <View style={styles.inputIconRow}>
                        <UserPlus
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="Legal name"
                          placeholderTextColor={Theme.textMuted}
                          value={driverName}
                          onChangeText={setDriverName}
                          testID="party-driver-name-input"
                        />
                      </View>
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Mobile">
                          <View style={[styles.phoneOuter, styles.inputIconRow]}>
                            <View style={styles.phoneCcWrap}>
                              <IndiaFlagIcon width={20} height={15} />
                              <Text style={styles.phoneCc}>+91</Text>
                            </View>
                            <TextInput
                              style={[styles.input, styles.phoneInput]}
                              keyboardType="phone-pad"
                              maxLength={onInviteDriver ? 10 : 14}
                              placeholder="10-digit number"
                              placeholderTextColor={Theme.textMuted}
                              value={driverPhone}
                              onChangeText={
                                onInviteDriver
                                  ? handleDriverPhoneLookupChange
                                  : (x) =>
                                      setDriverPhone(x.replace(/[^\d+]/g, ""))
                              }
                              testID="party-driver-phone-input"
                            />
                          </View>
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Driving licence No.">
                          <View style={styles.inputIconRow}>
                            <Key
                              size={18}
                              color={Theme.textMuted}
                              style={styles.inputLeadingIcon}
                            />
                            <TextInput
                              style={[styles.input, styles.inputPadded]}
                              placeholder="TN01 20200001234"
                              placeholderTextColor={Theme.textMuted}
                              autoCapitalize="characters"
                              value={driverDl}
                              onChangeText={handleDriverDlChange}
                              testID="party-driver-dl-input"
                            />
                          </View>
                        </Field>
                      </View>
                    </View>
                    <Field label="Email" optionalHint="optional">
                      <View style={styles.inputIconRow}>
                        <Mail
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="name@example.com"
                          placeholderTextColor={Theme.textMuted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={driverEmail}
                          onChangeText={setDriverEmail}
                          testID="party-driver-email-input"
                        />
                      </View>
                    </Field>
                    <Text style={styles.driverPayTermsHint}>
                      Set at least one pay term. Trips are priced from these — leaving
                      them blank means the driver&apos;s earnings get estimated instead
                      of agreed.
                    </Text>
                    <Field label="Fixed salary (₹)">
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 25000"
                        placeholderTextColor={Theme.textMuted}
                        keyboardType="numeric"
                        value={
                          driverPayableAmount != null &&
                          driverPayableAmount !== 0
                            ? String(driverPayableAmount)
                            : ""
                        }
                        onChangeText={(v) => {
                          const n =
                            v.trim() === ""
                              ? null
                              : parseFloat(v.replace(/[^0-9.]/g, ""));
                          setDriverPayableAmount(
                            n != null && !Number.isNaN(n) ? n : null,
                          );
                        }}
                      />
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Commission (%)">
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 10"
                            placeholderTextColor={Theme.textMuted}
                            keyboardType="numeric"
                            value={
                              driverCommissionPercent != null &&
                              driverCommissionPercent !== 0
                                ? String(driverCommissionPercent)
                                : ""
                            }
                            onChangeText={(v) => {
                              const n =
                                v.trim() === ""
                                  ? null
                                  : parseFloat(v.replace(/[^0-9.]/g, ""));
                              const val =
                                n != null && !Number.isNaN(n)
                                  ? Math.min(100, Math.max(0, n))
                                  : null;
                              setDriverCommissionPercent(val);
                            }}
                          />
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Per km (₹/km)">
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 8"
                            placeholderTextColor={Theme.textMuted}
                            keyboardType="numeric"
                            value={
                              driverCommissionPerKm != null &&
                              driverCommissionPerKm !== 0
                                ? String(driverCommissionPerKm)
                                : ""
                            }
                            onChangeText={(v) => {
                              const n =
                                v.trim() === ""
                                  ? null
                                  : parseFloat(v.replace(/[^0-9.]/g, ""));
                              setDriverCommissionPerKm(
                                n != null && !Number.isNaN(n) && n >= 0
                                  ? n
                                  : null,
                              );
                            }}
                          />
                        </Field>
                      </View>
                    </View>
                    {onInviteDriver ? (
                      <>
                        <Text style={styles.clientPhoneLookupHint}>
                          {t("existingDriverOnPlatform")}. If this number matches a
                          driver account, you can send an in-app invitation on the
                          next step.
                        </Text>
                        {driverPhone.trim().replace(/\s+/g, "").length >=
                          MIN_PHONE_LENGTH_FOR_SEARCH && driverPhoneLookupLoading ? (
                          <View style={styles.clientLookupLoadingRow}>
                            <ActivityIndicator size="small" color="#2563eb" />
                            <Text style={styles.clientLookupLoadingText}>
                              Looking up…
                            </Text>
                          </View>
                        ) : null}
                        {driverPhoneLookupError ? (
                          <Text style={styles.importContactsError}>
                            {driverPhoneLookupError}
                          </Text>
                        ) : null}
                        {driverExistingMatches.length > 0 ? (
                          <View style={styles.clientInviteeCard}>
                            <Text style={styles.clientInviteeLabel}>
                              {driverExistingMatches.some((m) => m.is_in_fleet)
                                ? t("existingDriverInFleet")
                                : t("existingDriverNotInFleet")}
                            </Text>
                            <Text style={styles.clientInviteeName}>
                              {driverExistingMatches[0]?.full_name ||
                                driverExistingMatches[0]?.phone ||
                                "—"}
                            </Text>
                            <Text style={styles.clientInviteeHint}>
                              {driverExistingMatches.some((m) => m.is_in_fleet)
                                ? t("existingDriverInFleetDetail")
                                : "Tap Continue, then use Send request on the review screen to invite them in the app."}
                            </Text>
                            {!driverExistingMatches.some(
                              (m) => m.is_in_fleet === true,
                            ) ? (
                              driverPreferOfflineOnly ? (
                                <Text style={styles.clientInviteeHint}>
                                  Offline fleet record only — no in-app invite will
                                  be sent.
                                </Text>
                              ) : (
                                <Pressable
                                  onPress={handleAddDriverOfflineInstead}
                                  disabled={submitting}
                                  style={styles.clientOfflineLink}
                                  testID="party-driver-add-offline-btn"
                                >
                                  <Text style={styles.clientOfflineLinkText}>
                                    Add as offline driver instead
                                  </Text>
                                </Pressable>
                              )
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}

                {kind === "vehicle" && (
                  <>
                    <Field label="Vehicle number">
                      <View style={styles.inputIconRow}>
                        <Verified
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="e.g. TN 18 D 2522"
                          placeholderTextColor={Theme.textMuted}
                          autoCapitalize="characters"
                          value={vehicleReg}
                          onChangeText={(t) =>
                            setVehicleReg(applyIndianVehicleKeystroke(t))
                          }
                          testID="party-vehicle-reg-input"
                        />
                      </View>
                    </Field>
                    <Field label="Vehicle type">
                      <VehicleTypeCatalogField
                        value={vehicleCategory}
                        tons={vehicleCapacity}
                        onChange={applyCatalogVehicleType}
                        style={styles.input}
                      />
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Load capacity">
                          <CapacityDialPicker
                            value={vehicleCapacity}
                            onChange={setVehicleCapacity}
                          />
                        </Field>
                      </View>
                      {/* Catalog vehicle types already carry the body length. */}
                      {parseVehicleTypeSelection(vehicleCategory) ? null : (
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Body length (ft)">
                          {bodyLengthIsOther ? (
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. 28 or 32 ft"
                              placeholderTextColor={Theme.textMuted}
                              value={vehicleBodyFt}
                              onChangeText={setVehicleBodyFt}
                              testID="party-vehicle-body-input"
                            />
                          ) : (
                            <Pressable
                              style={[styles.input, styles.presetFieldPress]}
                              onPress={() => setBodyLengthPickerOpen(true)}
                              testID="party-vehicle-body-picker"
                            >
                              <Text
                                style={
                                  vehicleBodyFt.trim()
                                    ? styles.presetFieldValue
                                    : styles.presetFieldPlaceholder
                                }
                                numberOfLines={2}
                              >
                                {vehicleBodyFt.trim()
                                  ? vehicleBodyFt
                                  : "Tap to choose body length"}
                              </Text>
                            </Pressable>
                          )}
                          {bodyLengthIsOther ? (
                            <Pressable
                              onPress={() => {
                                setBodyLengthIsOther(false);
                                setBodyLengthPickerOpen(true);
                              }}
                              style={styles.presetLinkWrap}
                            >
                              <Text style={styles.presetLinkText}>
                                Choose from list instead
                              </Text>
                            </Pressable>
                          ) : null}
                        </Field>
                      </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            ) : (
              <View
                style={[
                  styles.summarySheet,
                  layoutWide && styles.summarySheetDesktop,
                ]}
              >
                {mobileWizardSummaryContent}
              </View>
            )}

            {step === "review" &&
            kind === "driver" &&
            onInviteDriver &&
            driverExistingMatches.length > 0 &&
            !driverExistingMatches.some((m) => m.is_in_fleet === true) &&
            !driverPreferOfflineOnly ? (
              <View style={styles.reviewDriverOfflineLinkWrap}>
                <Pressable
                  onPress={handleAddDriverOfflineInstead}
                  disabled={submitting}
                  style={styles.clientOfflineLink}
                >
                  <Text style={styles.clientOfflineLinkText}>
                    Add as offline driver instead
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {step === "form" ? (
              <Pressable
                style={[
                  styles.primaryBtn,
                  (!organizationId ||
                    ((kind === "client" || kind === "supplier") &&
                      (driverRegisteredAtPhone ||
                        sameOrgMemberAtPhone ||
                        lookupFailed)) ||
                    (kind === "driver" &&
                      onInviteDriver &&
                      driverExistingMatches.some((m) => m.is_in_fleet === true))) &&
                    styles.primaryBtnDisabled,
                ]}
                onPress={goReview}
                disabled={
                  !organizationId ||
                  ((kind === "client" || kind === "supplier") &&
                    (driverRegisteredAtPhone ||
                      sameOrgMemberAtPhone ||
                      lookupFailed)) ||
                  (kind === "driver" &&
                    onInviteDriver &&
                    driverExistingMatches.some((m) => m.is_in_fleet === true))
                }
                testID="party-continue-btn"
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </Pressable>
            ) : (
              <View style={styles.reviewActionsStack}>
                <Pressable
                  style={[
                    styles.primaryBtn,
                    styles.reviewPrimaryBtn,
                    (!organizationId || submitting) &&
                      styles.primaryBtnDisabled,
                  ]}
                  onPress={() => void confirmSave()}
                  disabled={!organizationId || submitting}
                  testID="party-save-btn"
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.primaryBtnText}>
                        {reviewSaveLabel}
                      </Text>
                      <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={styles.reviewEditLink}
                  onPress={() => setStep("form")}
                  hitSlop={8}
                  testID="party-edit-details-btn"
                >
                  <Text style={styles.ghostBtnText}>← Edit details</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

      {kind === "vehicle" ? renderVehiclePickerModals() : null}
      <PartyCreateSuccessModal
        visible={showCreateSuccess}
        kind={kind}
        invited={createSuccessInvited}
        onOk={handleCreateSuccessOk}
      />
    </>
  );
}

function Field(props: {
  label: string;
  optionalHint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        {props.optionalHint ? (
          <Text style={styles.optionalPill}>{props.optionalHint}</Text>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

function SummaryDetailRow({
  label,
  value,
  Icon,
  emphasized,
  isLast,
  iconColor,
  valueMaxLines = 4,
  valueProse,
  tone = "default",
}: {
  label: string;
  value: string;
  Icon: SummaryIcon;
  emphasized?: boolean;
  isLast?: boolean;
  iconColor?: string;
  valueMaxLines?: number;
  /** Long explanatory copy: same row chrome, readable body text (not headline-sized). */
  valueProse?: boolean;
  tone?: "default" | "driver";
}) {
  const display = value?.trim() || "—";
  const isDriverTone = tone === "driver";
  return (
    <View
      style={[
        styles.summaryDetailRow,
        isDriverTone && styles.summaryDetailRowDriver,
        emphasized && styles.summaryDetailRowEmphasis,
        emphasized && isDriverTone && styles.summaryDetailRowEmphasisDriver,
        isLast && styles.summaryDetailRowLast,
      ]}
    >
      <View
        style={[
          styles.summaryDetailIconBubble,
          isDriverTone && styles.summaryDetailIconBubbleDriver,
          emphasized && styles.summaryDetailIconBubbleEmphasis,
          emphasized && isDriverTone && styles.summaryDetailIconBubbleEmphasisDriver,
        ]}
      >
        <Icon
          size={14}
          color={
            iconColor ??
            (emphasized
              ? isDriverTone
                ? "#15803d"
                : Theme.buttonPrimaryText
              : isDriverTone
                ? "#15803d"
                : Theme.textRouteCard)
          }
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.summaryDetailCopy}>
        <Text
          style={[
            styles.summaryDetailLabel,
            isDriverTone && styles.summaryDetailLabelDriver,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.summaryDetailValue,
            !valueProse && emphasized && styles.summaryDetailValueEmphasis,
            valueProse && styles.summaryDetailValueProse,
            valueProse && isDriverTone && styles.summaryDetailValueProseDriver,
          ]}
          numberOfLines={valueMaxLines}
        >
          {display}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Mobile web: avoid generic padding so safe-area + horizontal inset can apply cleanly. */
  overlayCompactMobile: {
    justifyContent: "flex-start",
    alignItems: "stretch",
  },
  shellWideDesktop: {
    maxHeight: 800,
    minHeight: 0,
    ...(Platform.OS === "web"
      ? ({
          boxShadow:
            "0 80px 160px -40px rgba(15,23,42,0.14), 0 1px 0 rgba(255,255,255,0.06)",
        } as ViewStyle)
      : ({} as ViewStyle)),
  },
  /** Desktop card that hosts the mobile step wizard (fixed height so the
   *  wizard's flex column + bottom action fill the card cleanly). */
  wizardDesktopCard: {
    alignSelf: "center",
    maxHeight: "100%",
    ...(Platform.OS === "web"
      ? ({
          boxShadow:
            "0 80px 160px -40px rgba(15,23,42,0.14), 0 1px 0 rgba(255,255,255,0.06)",
        } as ViewStyle)
      : ({} as ViewStyle)),
  },
  shellStacked: {
    maxHeight: 900,
  },
  /** Narrow / mobile web: avoid forcing tall min-height so the card fits the viewport. */
  shellNarrowWeb: {
    minHeight: 0,
    alignSelf: "stretch",
    width: "100%",
    flex: 1,
  },
  portalHeaderMinimal: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e8ecf1",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  mainScroll: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
  },
  mainScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 28,
    flexGrow: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 14,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fcd34d",
    flexWrap: "wrap",
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#78350f",
    minWidth: 200,
  },
  bannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  bannerBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  formHeaderTitle: {
    ...FinanceTxnTypography.partyTitle,
    flexShrink: 1,
  },
  formHeaderHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    lineHeight: 14,
    marginBottom: 12,
  },
  errorBar: {
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorBarText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
  },
  fieldsBlock: {
    marginBottom: 8,
  },
  row2: {
    marginBottom: 0,
  },
  row2Web: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  row2Grow: {
    flex: 1,
    minWidth: 0,
  },
  vehicleChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxWidth: "100%",
  },
  vehicleChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  vehicleChipText: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 9,
    fontStyle: "italic",
    color: "#334155",
    maxWidth: 200,
  },
  vehicleChipTextActive: {
    color: "#fff",
  },
  presetFieldPress: {
    justifyContent: "center",
    minHeight: 44,
  },
  presetFieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  presetFieldPlaceholder: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 11,
  },
  presetLinkWrap: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  presetLinkText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.buttonPrimary,
  },
  specHintText: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    marginTop: 6,
    lineHeight: 15,
  },
  vehiclePickOverlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  vehiclePickBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  vehiclePickSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    width: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 -8px 40px rgba(0,0,0,0.15)" } as ViewStyle)
      : ({
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        } as ViewStyle)),
  },
  vehiclePickTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  vehiclePickHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginBottom: 12,
  },
  vehiclePickScroll: {
    flexGrow: 0,
    maxHeight: 340,
  },
  vehiclePickRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  vehiclePickRowActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  vehiclePickRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  vehiclePickRowTextActive: {
    color: "#1d4ed8",
  },
  vehiclePickDone: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#0f172a",
  },
  vehiclePickDoneText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
  },
  optionalPill: {
    ...FinanceTxnTypography.noDueChip,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    backgroundColor: "#fff",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  inputIconRow: {
    position: "relative",
  },
  inputLeadingIcon: {
    position: "absolute",
    left: 12,
    top: 13,
    zIndex: 1,
  },
  inputPadded: {
    paddingLeft: 38,
  },
  phoneOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingLeft: 10,
    paddingRight: 8,
    gap: 8,
    minHeight: 44,
    position: "relative",
  },
  phoneCcWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
    marginRight: 4,
    borderRightWidth: 1,
    borderRightColor: "#f1f5f9",
  },
  phoneCc: {
    ...FinanceTxnTypography.dateLine,
    fontWeight: "600",
  },
  phoneInput: {
    flex: 1,
    borderWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  phoneIcon: {
    marginRight: 8,
  },
  primaryBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    letterSpacing: 0.75,
  },
  mobileWizardReviewRoot: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mobileWizardReviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  mobileWizardReviewTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  mobileWizardReviewScroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  mobileWizardReviewFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  ghostBtn: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  ghostBtnText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 14,
    paddingVertical: 14,
  },
  confirmBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.75,
  },
  confirmBtnFlexible: {
    flex: 1,
    minHeight: 52,
    ...Platform.select({
      web: { maxWidth: 280 } as object,
      default: {},
    }),
  },
  reviewActionsBar: {
    flexDirection: "column",
    gap: 12,
    marginTop: 20,
    paddingTop: 4,
  },
  reviewActionsBarWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  reviewGhostBtnWide: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  reviewActionsStack: {
    marginTop: 8,
    gap: 4,
    width: "100%",
  },
  reviewPrimaryBtn: {
    marginTop: 8,
  },
  reviewEditLink: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 10,
    alignSelf: "center",
  },

  summarySheet: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 8,
  },
  summarySheetDesktop: {
    alignSelf: "stretch",
    maxWidth: "100%",
  },

  summaryDetailsCard: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    gap: 0,
  },
  summaryDetailsCardDriver: {
    backgroundColor: "#f7fdf9",
    borderWidth: 0,
    borderRadius: 14,
  },
  summaryDetailsHeading: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  summaryDetailsHeadingDriver: {
    color: "#166534",
    letterSpacing: 0.6,
  },

  summaryDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  summaryDetailRowLast: {
    borderBottomWidth: 0,
  },
  summaryDetailRowEmphasis: {},
  summaryDetailRowDriver: {
    borderBottomColor: "#d6f0dc",
  },
  summaryDetailRowEmphasisDriver: {
    borderColor: "#4ade80",
    ...Platform.select({
      web: { backgroundColor: "#f7fff8" } as object,
      default: { backgroundColor: "#f7fff8" },
    }),
  },
  summaryDetailIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: "#d7ebf5",
  },
  summaryDetailIconBubbleDriver: {
    backgroundColor: "#ecfdf3",
    borderColor: "#c7f0d5",
  },
  summaryDetailIconBubbleEmphasis: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: "#c5e0ef",
  },
  summaryDetailIconBubbleEmphasisDriver: {
    backgroundColor: "#d6f5df",
    borderColor: "#a7e5bc",
  },
  summaryDetailCopy: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    gap: 1,
  },
  summaryDetailLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  summaryDetailLabelDriver: {
    color: "#16a34a",
  },
  summaryDetailValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 13,
    fontWeight: "600",
    fontStyle: "italic",
    lineHeight: 17,
    color: Theme.textPrimaryDark,
  },
  summaryDetailValueEmphasis: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
    letterSpacing: 0.1,
  },
  summaryDetailValueProse: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "normal",
    lineHeight: 15,
    color: Theme.textMuted,
  },
  summaryDetailValueProseDriver: {
    color: "#166534",
  },
  driverPreviewRoot: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#ffffff",
  },
  driverPreviewHero: {
    backgroundColor: "#047857",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  driverPreviewKicker: {
    ...FinanceTxnTypography.fieldLabel,
    color: "#a7f3d0",
    letterSpacing: 1.2,
  },
  driverPreviewTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 20,
    color: "#ecfdf5",
    lineHeight: 24,
  },
  driverPreviewName: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 14,
    color: "#ffffff",
  },
  driverPreviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  driverPreviewMeta: {
    ...FinanceTxnTypography.routeWhy,
    color: "#d1fae5",
    fontSize: 10,
    fontWeight: "600",
    flexShrink: 1,
  },
  driverPreviewMetaDot: {
    color: "#6ee7b7",
    fontSize: 12,
    fontWeight: "800",
  },
  driverPreviewBody: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  driverPreviewSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  driverPreviewSectionTitle: {
    ...FinanceTxnTypography.fieldLabel,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  driverPreviewBenefitsPill: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  driverPreviewBenefitsText: {
    ...FinanceTxnTypography.fieldValue,
    color: "#166534",
    fontSize: 10,
    fontWeight: "700",
  },
  driverPreviewOfferGrid: {
    flexDirection: "row",
    gap: 10,
  },
  driverPreviewOfferCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 12,
    minHeight: 92,
    justifyContent: "space-between",
  },
  driverPreviewOfferCardPrimary: {
    backgroundColor: "#dcfce7",
    borderColor: "#bbf7d0",
  },
  driverPreviewOfferValue: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 17,
    color: "#0f172a",
  },
  driverPreviewOfferLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  driverPayTermsHint: {
    fontSize: 11,
    lineHeight: 16,
    color: Theme.textSecondary,
    marginBottom: 10,
  },
  driverPreviewNextCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 7,
  },
  driverPreviewNextTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 14,
    color: "#0f172a",
  },
  driverPreviewNextLine: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    color: "#475569",
    lineHeight: 15,
  },
  driverPreviewStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  driverPreviewStatusText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    color: "#166534",
    flex: 1,
    lineHeight: 14,
  },

  importContactsWrap: {
    marginBottom: 16,
    alignSelf: "stretch",
  },
  importContactsError: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
    marginTop: 8,
    lineHeight: 17,
  },
  importContactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    minWidth: 180,
  },
  importContactsBtnDim: {
    opacity: 0.55,
  },
  importContactsBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 9,
    fontWeight: "600",
    color: "#2563eb",
    letterSpacing: 0.45,
  },
  importContactsBtnTextMuted: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  importContactsHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 6,
    marginLeft: 2,
    lineHeight: 16,
  },
  clientPhoneLookupHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 17,
  },
  clientLookupLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  clientLookupLoadingText: {
    ...FinanceTxnTypography.dateLine,
    color: "#2563eb",
    fontWeight: "600",
  },
  clientInviteeCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  clientInviteeLabel: {
    ...FinanceTxnTypography.tripId,
    color: "#1d4ed8",
    marginBottom: 4,
  },
  clientInviteeName: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    marginBottom: 4,
  },
  clientInviteeHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  clientOfflineLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  clientOfflineLinkText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontWeight: "600",
    color: "#2563eb",
  },
  reviewDriverOfflineLinkWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  clientNoMatchHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textMuted,
    marginBottom: 4,
    lineHeight: 17,
  },
});
