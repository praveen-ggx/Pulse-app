import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "react-native-calendars";
import {
  notifySupplierKycUser,
  openSupplierKycDocument,
  pickAndUploadSupplierKycDocument,
} from "@/features/suppliers/utils/supplierKycUpload.util";
import { resolveSupplierVaultDocType } from "@/features/suppliers/utils/supplierVerificationVault.util";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ClientProfileHubsEditSection } from "@/features/clients/components/ClientProfileHubsEditSection";
import { ClientProfileAgreementSection } from "@/features/clients/components/ClientProfileAgreementSection";
import { ClientProfileLanesEditSection } from "@/features/clients/components/ClientProfileLanesEditSection";
import { ClientProfileFinanceStatementSection } from "@/features/clients/components/ClientProfileFinanceStatementSection";
import { ClientProfileMarginAnalysisSection } from "@/features/clients/components/ClientProfileMarginAnalysisSection";
import { ClientProfilePerformanceSection } from "@/features/clients/components/ClientProfilePerformanceSection";
import { updateClient } from "@/features/clients/services/clients.service";
import { updateSupplier } from "@/features/suppliers/services/suppliers.service";
import type {
  ClientLaneRate,
  ClientWarehouseExtended,
} from "@/features/clients/types/clientManagement.types";

const ASIDE_DEFAULT = 168;
const ASIDE_MIN = 132;
const ASIDE_MAX = 320;
const CONTRACTS_PAGE_SIZE = 5;

type EditPanel = "BASIC" | "WAREHOUSES" | "CONTRACTS" | "KYC";
type ViewTab =
  | "OVERVIEW"
  | "HUBS"
  | "CONTRACTS"
  | "AGREEMENT"
  | "VAULT"
  | "FINANCE"
  | "PERFORMANCE"
  | "MARGIN";

type EditTab = {
  id: EditPanel;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
};

export type ProfileWarehouse = {
  id: string;
  name: string;
  address: string;
  gstNumber?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
};

export type ProfileContract = {
  id: string;
  pickup: string;
  destination: string;
  price: number;
  pricingType: "per_trip" | "per_ton";
  vehicleType?: string | null;
  /** Origin warehouse for Metronic table filter (lane / legacy contract). */
  warehouseId?: string | null;
  warehouseName?: string | null;
  loadingIncluded?: boolean;
  unloadingIncluded?: boolean;
  notes?: string | null;
};

const PRIMARY_REGIONS = ["North", "South", "East", "West"] as const;
type PrimaryRegion = (typeof PRIMARY_REGIONS)[number];

function isPrimaryRegion(value: string | null | undefined): value is PrimaryRegion {
  return PRIMARY_REGIONS.includes(value as PrimaryRegion);
}

function spocContactValue(phone: string | null | undefined): string {
  const value = (phone ?? "").trim();
  if (/^linked-/i.test(value)) return "";
  return value;
}

function dateDraft(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

function formatDdMmYyyy(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

function dateFromIso(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00`);
  return new Date();
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ValidityDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const shown = iso ? formatDdMmYyyy(iso) : "DD-MM-YYYY";
  const close = () => setOpen(false);

  return (
    <View style={styles.dateField}>
      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>{label}</Text>
      <Pressable
        style={[styles.fieldInputLarge, styles.fieldInputPage, styles.datePickerShell]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.datePickerText, !iso && styles.datePickerPlaceholder]}>{shown}</Text>
        <FontAwesome name="calendar-o" size={14} color={Theme.textMuted} />
      </Pressable>
      {Platform.OS === "web" ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
          <View style={styles.datePickerBackdropCenter}>
            <Pressable style={styles.datePickerDismiss} onPress={close} accessibilityLabel="Close date picker" />
            <View style={styles.datePickerPopover}>
              <Text style={styles.datePickerSheetTitle}>{label}</Text>
              <Calendar
                current={iso || undefined}
                onDayPress={(day: { dateString: string }) => {
                  onChange(day.dateString);
                  close();
                }}
                markedDates={
                  iso
                    ? {
                        [iso]: {
                          selected: true,
                          selectedColor: Theme.primary,
                          selectedTextColor: Theme.textOnPrimary,
                        },
                      }
                    : undefined
                }
                theme={{
                  backgroundColor: Theme.cardWhite,
                  calendarBackground: Theme.cardWhite,
                  textSectionTitleColor: Theme.textMuted,
                  monthTextColor: Theme.textPrimaryDark,
                  dayTextColor: Theme.textPrimaryDark,
                  todayTextColor: Theme.primary,
                  arrowColor: Theme.primary,
                  selectedDayBackgroundColor: Theme.primary,
                  selectedDayTextColor: Theme.textOnPrimary,
                  textDayFontWeight: "500",
                  textMonthFontWeight: "700",
                  textDayHeaderFontWeight: "600",
                }}
              />
              <Pressable
                onPress={() => {
                  onChange("");
                  close();
                }}
                hitSlop={8}
                style={styles.datePickerClearRow}
              >
                <Text style={styles.datePickerClear}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={dateFromIso(iso)}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === "set" && date) onChange(isoFromDate(date));
          }}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide">
          <Pressable style={styles.datePickerBackdrop} onPress={() => setOpen(false)}>
            <View style={styles.datePickerSheet}>
              <View style={styles.datePickerSheetHeader}>
                <Pressable
                  onPress={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.datePickerClear}>Clear</Text>
                </Pressable>
                <Text style={styles.datePickerSheetTitle}>{label}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                  <Text style={styles.datePickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={dateFromIso(iso)}
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) onChange(isoFromDate(date));
                }}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function parseDateDraft(value: string): { ok: true; value: string | null } | { ok: false } {
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false };
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  return { ok: true, value: text };
}

export type ProfileKycDoc = {
  id: string;
  documentType: string;
  status: "Verified" | "Pending";
  dateLabel?: string | null;
  docType?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
};

export type CounterpartyProfileSystemCardProps = {
  /** Reset internal view/edit mode when modal closes */
  visible: boolean;
  /** `page` = full-screen hub (left-aligned header, body-width content). Default `sheet` for modals. */
  presentation?: "sheet" | "page";
  /** Header title override (default: Customer / Partner Profile). */
  profileTitle?: string;
  type: "client" | "supplier";
  organizationName: string;
  adminName?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  billingAddress?: string | null;
  /** Supplier only. North, South, East, or West. */
  primaryRegion?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  gridVolumeLabel?: string;
  /** e.g. "94.2%" or health-derived */
  networkTrustLabel?: string;
  /** Selected invoice POD policy, shown after the Core badge. */
  podStatusLabel?: string | null;
  isIntegrated?: boolean;
  entityDisplayId?: string | null;
  warehouses?: ProfileWarehouse[];
  contracts?: ProfileContract[];
  kycDocs?: ProfileKycDoc[];
  /** Page header accessory, rendered beside the customer name. */
  headerSlot?: ReactNode;
  /** Extra fields rendered inside the Edit profile dialog (client page). */
  editSlot?: ReactNode;
  onClose: () => void;
  /** Opens full edit flow (router / modal) */
  onEditPress?: () => void;
  /** Hides the Edit Profile affordance when the viewer lacks edit permission. Defaults to true. */
  canEdit?: boolean;
  /** Enables inline hub/lane CRUD in edit mode (client profiles). */
  organizationId?: string;
  clientId?: string;
  /** Partner id — enables Finance / Performance / Margin tabs for suppliers. */
  supplierId?: string;
  editableWarehouses?: ClientWarehouseExtended[];
  editableLaneRates?: ClientLaneRate[];
  onProfileEntitiesChange?: () => void | Promise<void>;
  /** Supplier onboarding vault rendered by the feature screen; replaces the 3-slot vault. */
  supplierVaultSlot?: ReactNode;
};

function completionPercent(input: {
  organizationName: string;
  adminName?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  billingAddress?: string | null;
  warehouses?: ProfileWarehouse[];
  contracts?: ProfileContract[];
  kycDocs?: ProfileKycDoc[];
}): number {
  let score = 0;
  let total = 6;
  if (input.organizationName.trim()) score += 1;
  if ((input.adminName ?? "").trim()) score += 1;
  if ((input.email ?? "").trim()) score += 1;
  if ((input.phone ?? "").trim()) score += 1;
  if ((input.gstNumber ?? "").trim()) score += 1;
  if ((input.billingAddress ?? "").trim()) score += 1;
  if ((input.warehouses?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  if ((input.contracts?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  if ((input.kycDocs?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  return Math.max(10, Math.min(100, Math.round((score / total) * 100)));
}

/** Trust % reads as an alert level, not a fixed brand color — 0% shouldn't paint green. */
function trustLabelColor(label: string): string {
  const n = Number.parseFloat(label);
  if (!Number.isFinite(n)) return Theme.textMuted;
  if (n >= 70) return Theme.positive;
  if (n >= 40) return Theme.warning;
  return Theme.textMuted;
}

function Badge({
  children,
  variant = "gray",
}: {
  children: ReactNode;
  variant?: "green" | "blue" | "orange" | "gray" | "red";
}) {
  const palette = {
    green: {
      bg: Theme.positiveMuted,
      border: Theme.positive + "44",
      text: Theme.positive,
    },
    blue: {
      bg: Theme.fiscalTabActiveBg,
      border: Theme.aggregatePillBorder,
      text: Theme.aggregatePillText,
    },
    orange: {
      bg: Theme.warningMuted,
      border: Theme.warning + "55",
      text: Theme.warning,
    },
    gray: {
      bg: Theme.surfaceGray,
      border: Theme.borderMedium,
      text: Theme.textMuted,
    },
    red: {
      bg: Theme.negativeMuted,
      border: Theme.negative + "44",
      text: Theme.negative,
    },
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

function VerificationVaultCards({
  docs,
  uploadingId,
  canUpload,
  error,
  onUpdate,
  onView,
}: {
  docs: ProfileKycDoc[];
  uploadingId: string | null;
  canUpload: boolean;
  error: string | null;
  onUpdate: (doc: ProfileKycDoc) => void;
  onView: (doc: ProfileKycDoc) => void;
}) {
  return (
    <>
      {error ? <Text style={styles.kycVaultError}>{error}</Text> : null}
      {docs.map((doc) => {
        const uploading = uploadingId === doc.id;
        const hasFile = Boolean((doc.storagePath ?? "").trim());
        return (
          <View key={doc.id} style={styles.kycVaultCard}>
            <View style={styles.kycVaultLeft}>
              <View
                style={[
                  styles.kycVaultIcon,
                  doc.status === "Verified" ? styles.kycVaultIconOk : styles.kycVaultIconPending,
                ]}
              >
                <FontAwesome
                  name={doc.status === "Verified" || hasFile ? "clipboard" : "cloud-upload"}
                  size={22}
                  color={doc.status === "Verified" ? Theme.positive : Theme.textMuted}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.kycVaultTitle}>{doc.documentType}</Text>
                <View style={styles.kycVaultMeta}>
                  <Badge variant={doc.status === "Verified" ? "green" : "orange"}>{doc.status}</Badge>
                  <Text style={styles.kycVaultDate}>
                    Modified: {(doc.dateLabel ?? "").trim() || "—"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.kycVaultActions}>
              {hasFile ? (
                <TouchableOpacity
                  style={styles.kycViewBtn}
                  onPress={() => onView(doc)}
                  accessibilityLabel={`View ${doc.documentType}`}
                >
                  <Text style={styles.kycViewBtnText}>View</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.kycUpdateBtn, (!canUpload || uploading) && styles.kycUpdateBtnDisabled]}
                onPress={() => onUpdate(doc)}
                disabled={!canUpload || uploading}
                accessibilityLabel={`${hasFile ? "Replace" : "Update"} ${doc.documentType}`}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.kycUpdateBtnText}>
                    {hasFile ? "Replace File" : "Update File"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );
}

export function CounterpartyProfileSystemCard({
  visible,
  presentation = "sheet",
  profileTitle,
  type,
  organizationName,
  adminName,
  email,
  phone,
  gstNumber,
  panNumber,
  billingAddress,
  primaryRegion,
  validFrom,
  validTo,
  gridVolumeLabel,
  networkTrustLabel = "94.2%",
  podStatusLabel = null,
  isIntegrated,
  entityDisplayId,
  warehouses = [],
  contracts = [],
  kycDocs = [],
  headerSlot,
  editSlot,
  onClose,
  onEditPress,
  canEdit = true,
  organizationId,
  clientId,
  supplierId,
  editableWarehouses = [],
  editableLaneRates = [],
  onProfileEntitiesChange,
  supplierVaultSlot,
}: CounterpartyProfileSystemCardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isPage = presentation === "page";
  const isWide = windowWidth >= 900;
  /** Desktop page: wider canvas + breathable side padding (not the mobile 16px). */
  const pagePad = isPage
    ? isWide
      ? Math.max(28, Math.min(48, Math.round(windowWidth * 0.03)))
      : Layout.screenPaddingHorizontal
    : Layout.screenPaddingHorizontal;
  const pageMaxWidth = isPage && isWide ? 1520 : isPage ? 720 : 960;
  const pageScrollContentStyle = useMemo(
    () => [
      styles.viewScrollContent,
      isPage && styles.viewScrollContentPage,
      isPage ? { paddingHorizontal: pagePad, maxWidth: pageMaxWidth } : null,
    ],
    [isPage, pagePad, pageMaxWidth],
  );
  const editDialogScrollStyle = useMemo(
    () => ({ maxHeight: Math.max(280, windowHeight - 180) }),
    [windowHeight],
  );
  const analyticsPartyId =
    type === "client" ? clientId : type === "supplier" ? supplierId : undefined;
  const showAnalyticsTabs = Boolean(organizationId && analyticsPartyId);
  const analyticsPartyRole: "client" | "supplier" =
    type === "supplier" ? "supplier" : "client";
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editPanel, setEditPanel] = useState<EditPanel>("BASIC");
  const [viewTab, setViewTab] = useState<ViewTab>("OVERVIEW");
  const [asideWidth, setAsideWidth] = useState(ASIDE_DEFAULT);
  const [isAsideResizing, setIsAsideResizing] = useState(false);
  const asideWidthRef = useRef(ASIDE_DEFAULT);
  const asideDragStartWidthRef = useRef(ASIDE_DEFAULT);

  const clampAsideWidth = useCallback(
    (next: number) => {
      const maxAllowed = Math.min(ASIDE_MAX, Math.max(ASIDE_MIN + 40, Math.floor(windowWidth * 0.38)));
      return Math.min(maxAllowed, Math.max(ASIDE_MIN, Math.round(next)));
    },
    [windowWidth],
  );

  useEffect(() => {
    asideWidthRef.current = asideWidth;
  }, [asideWidth]);

  useEffect(() => {
    setAsideWidth((prev) => clampAsideWidth(prev));
  }, [clampAsideWidth]);

  const asideResizePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          asideDragStartWidthRef.current = asideWidthRef.current;
          setIsAsideResizing(true);
          if (Platform.OS === "web" && typeof document !== "undefined") {
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }
        },
        onPanResponderMove: (_evt, gesture) => {
          setAsideWidth(clampAsideWidth(asideDragStartWidthRef.current + gesture.dx));
        },
        onPanResponderRelease: () => {
          setIsAsideResizing(false);
          if (Platform.OS === "web" && typeof document !== "undefined") {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          }
        },
        onPanResponderTerminate: () => {
          setIsAsideResizing(false);
          if (Platform.OS === "web" && typeof document !== "undefined") {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          }
        },
      }),
    [clampAsideWidth],
  );

  const [draftName, setDraftName] = useState(organizationName);
  const [draftGst, setDraftGst] = useState((gstNumber ?? "").trim());
  const [draftPan, setDraftPan] = useState((panNumber ?? "").trim());
  const [draftBilling, setDraftBilling] = useState((billingAddress ?? "").trim());
  const [draftPrimaryRegion, setDraftPrimaryRegion] = useState<PrimaryRegion | "">(
    isPrimaryRegion(primaryRegion) ? primaryRegion : "",
  );
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [regionMenuBox, setRegionMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const regionFieldRef = useRef<View>(null);
  const editDialogCardRef = useRef<View>(null);
  const [draftAdmin, setDraftAdmin] = useState((adminName ?? "").trim());
  const [draftEmail, setDraftEmail] = useState((email ?? "").trim());
  const [draftPhone, setDraftPhone] = useState(spocContactValue(phone));
  const [draftValidFrom, setDraftValidFrom] = useState(dateDraft(validFrom));
  const [draftValidTo, setDraftValidTo] = useState(dateDraft(validTo));
  const [dateError, setDateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [contractWarehouseFilter, setContractWarehouseFilter] = useState<string>("all");
  const [contractPage, setContractPage] = useState(0);
  const [kycUploadingId, setKycUploadingId] = useState<string | null>(null);
  const [kycUploadError, setKycUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setMode("view");
      setEditPanel("BASIC");
      setKycUploadingId(null);
      setKycUploadError(null);
      setRegionMenuOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (mode === "edit") return;
    setDraftName(organizationName);
    setDraftGst((gstNumber ?? "").trim());
    setDraftPan((panNumber ?? "").trim());
    setDraftBilling((billingAddress ?? "").trim());
    setDraftPrimaryRegion(isPrimaryRegion(primaryRegion) ? primaryRegion : "");
    setRegionMenuOpen(false);
    setDraftAdmin((adminName ?? "").trim());
    setDraftEmail((email ?? "").trim());
    setDraftPhone(spocContactValue(phone));
    setDraftValidFrom(dateDraft(validFrom));
    setDraftValidTo(dateDraft(validTo));
  }, [
    mode,
    organizationName,
    gstNumber,
    panNumber,
    billingAddress,
    primaryRegion,
    adminName,
    email,
    phone,
    validFrom,
    validTo,
  ]);

  const completion = useMemo(
    () =>
      completionPercent({
        organizationName,
        adminName,
        email,
        phone,
        gstNumber,
        billingAddress,
        warehouses,
        contracts,
        kycDocs,
      }),
    [
      organizationName,
      adminName,
      email,
      phone,
      gstNumber,
      billingAddress,
      warehouses,
      contracts,
      kycDocs,
    ],
  );

  const initials = useMemo(() => {
    const src = organizationName.trim() || (type === "client" ? "CL" : "SP");
    return src
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");
  }, [organizationName, type]);

  const shortId = useMemo(() => {
    const raw = (entityDisplayId ?? "").trim();
    if (raw) return raw.replace(/^#/, "");
    return "";
  }, [entityDisplayId]);

  const typeBadge = type === "client" ? "CLIENT" : "SUPPLIER";
  const headerTitle =
    profileTitle ?? (type === "client" ? "Customer Profile" : "Partner Profile");

  const contractWarehouseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const wh of warehouses) {
      if (wh.id) byId.set(wh.id, wh.name);
    }
    for (const c of contracts) {
      if (c.warehouseId && c.warehouseName) {
        byId.set(c.warehouseId, c.warehouseName);
      }
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [warehouses, contracts]);

  const filteredContracts = useMemo(() => {
    if (contractWarehouseFilter === "all") return contracts;
    return contracts.filter((c) => {
      if (c.warehouseId && c.warehouseId === contractWarehouseFilter) return true;
      const filterName = contractWarehouseOptions.find(
        (o) => o.id === contractWarehouseFilter,
      )?.name;
      if (!filterName) return false;
      if ((c.warehouseName ?? "").trim().toLowerCase() === filterName.trim().toLowerCase()) {
        return true;
      }
      return (c.pickup ?? "").toLowerCase().includes(filterName.toLowerCase());
    });
  }, [contracts, contractWarehouseFilter, contractWarehouseOptions]);

  const contractTotalPages = Math.max(
    1,
    Math.ceil(filteredContracts.length / CONTRACTS_PAGE_SIZE),
  );
  const safeContractPage = Math.min(contractPage, contractTotalPages - 1);
  const pagedContracts = useMemo(() => {
    const start = safeContractPage * CONTRACTS_PAGE_SIZE;
    return filteredContracts.slice(start, start + CONTRACTS_PAGE_SIZE);
  }, [filteredContracts, safeContractPage]);

  useEffect(() => {
    setContractPage(0);
  }, [contractWarehouseFilter, contracts.length]);

  const handleSynchronize = async () => {
    if (type === "client" && organizationId && clientId) {
      setSavingIdentity(true);
      try {
        const fromDate = parseDateDraft(draftValidFrom);
        const toDate = parseDateDraft(draftValidTo);
        if (!fromDate.ok || !toDate.ok) {
          const message = "Enter Valid from and Valid to as YYYY-MM-DD.";
          setDateError(message);
          Alert.alert("Could not save profile", message);
          return;
        }
        if (fromDate.value && toDate.value && toDate.value < fromDate.value) {
          const message = "Valid to must be on or after Valid from.";
          setDateError(message);
          Alert.alert("Could not save profile", message);
          return;
        }
        setDateError(null);
        const validity = {
          valid_from: fromDate.value,
          valid_to: toDate.value,
        };
        const identityPatch = isIntegrated
          ? {
              gstin: draftGst.trim(),
              pan_number: draftPan.trim(),
              address: draftBilling.trim(),
              ...validity,
            }
          : {
              organization_name: draftName.trim(),
              contact_person: draftAdmin.trim(),
              email: draftEmail.trim(),
              phone: draftPhone.trim(),
              gstin: draftGst.trim(),
              pan_number: draftPan.trim(),
              address: draftBilling.trim(),
              ...validity,
            };
        const { error } = await updateClient(organizationId, clientId, identityPatch);
        if (error) {
          Alert.alert("Could not save profile", error.message);
          return;
        }
        onProfileEntitiesChange?.();
      } finally {
        setSavingIdentity(false);
      }
      onEditPress?.();
      setMode("view");
      return;
    }

    if (type === "supplier" && organizationId && supplierId) {
      setSavingIdentity(true);
      setEditError(null);
      try {
        const { error } = await updateSupplier(
          organizationId,
          supplierId,
          {
            name: draftName.trim(),
            contact_person: draftAdmin.trim(),
            email: draftEmail.trim(),
            phone: draftPhone.trim(),
            gstin: draftGst.trim(),
            pan_number: draftPan.trim(),
            address: draftBilling.trim(),
            primary_region: draftPrimaryRegion || null,
          },
          { allowIntegratedIdentity: true },
        );
        if (error) {
          setEditError(error.message);
          return;
        }
        try {
          await onProfileEntitiesChange?.();
        } catch (refreshError) {
          setEditError(
            refreshError instanceof Error
              ? refreshError.message
              : "Saved, but the profile could not be refreshed.",
          );
          return;
        }
        setEditError(null);
        setMode("view");
      } finally {
        setSavingIdentity(false);
      }
      return;
    }

    onEditPress?.();
    setMode("view");
  };

  const canUploadSupplierKyc =
    type === "supplier" && canEdit && Boolean(organizationId && supplierId);

  const handleUpdateKycFile = useCallback(
    async (doc: ProfileKycDoc) => {
      if (type !== "supplier") {
        setMode("edit");
        return;
      }
      if (!canEdit) {
        notifySupplierKycUser("Cannot update", "You do not have permission to edit this vendor.");
        return;
      }
      if (!organizationId || !supplierId) {
        notifySupplierKycUser("Upload failed", "Vendor profile is missing organization details.");
        return;
      }
      const docType = resolveSupplierVaultDocType(doc);
      if (!docType) {
        notifySupplierKycUser("Upload failed", "Unknown document type.");
        return;
      }
      setKycUploadingId(doc.id);
      setKycUploadError(null);
      try {
        const result = await pickAndUploadSupplierKycDocument({
          orgId: organizationId,
          supplierId,
          docType,
          docLabel: doc.documentType,
          isMandatory: true,
        });
        if (result.status === "cancelled") return;
        if (result.status === "error") {
          setKycUploadError(result.error.message);
          notifySupplierKycUser("Upload failed", result.error.message);
          return;
        }
        onProfileEntitiesChange?.();
      } finally {
        setKycUploadingId(null);
      }
    },
    [type, canEdit, organizationId, supplierId, onProfileEntitiesChange],
  );

  const handleViewKycFile = useCallback(async (doc: ProfileKycDoc) => {
    const path = (doc.storagePath ?? "").trim();
    if (!path) return;
    await openSupplierKycDocument(path);
  }, []);

  const canEditEntities = Boolean(
    type === "client" && organizationId && clientId && onProfileEntitiesChange,
  );

  const editTabs = useMemo(() => {
    const base: EditTab[] = [{ id: "BASIC", label: "Basic Information", icon: "info-circle" }];
    if (type === "client" && !isPage) {
      base.push(
        { id: "WAREHOUSES", label: "Operations Hubs", icon: "archive" },
        { id: "CONTRACTS", label: "Route Contracts", icon: "file-text" },
      );
    } else if (type !== "client") {
      base.push({ id: "KYC", label: "Verification Vault", icon: "shield" });
    }
    return base;
  }, [type, isPage]);

  const supplierEditDirty =
    type === "supplier" &&
    (draftName.trim() !== organizationName.trim() ||
      draftEmail.trim() !== (email ?? "").trim() ||
      draftGst.trim() !== (gstNumber ?? "").trim() ||
      draftPan.trim() !== (panNumber ?? "").trim() ||
      draftAdmin.trim() !== (adminName ?? "").trim() ||
      draftPhone.trim() !== spocContactValue(phone).trim() ||
      draftBilling.trim() !== (billingAddress ?? "").trim() ||
      draftPrimaryRegion !== (isPrimaryRegion(primaryRegion) ? primaryRegion : ""));

  const toggleRegionMenu = () => {
    if (regionMenuOpen) {
      setRegionMenuOpen(false);
      return;
    }
    const field = regionFieldRef.current;
    const card = editDialogCardRef.current;
    if (field == null || card == null) return;
    field.measureInWindow((fieldX, fieldY, fieldWidth, fieldHeight) => {
      card.measureInWindow((cardX, cardY) => {
        if (fieldWidth <= 0) return;
        setRegionMenuBox({
          top: fieldY - cardY + fieldHeight + 4,
          left: fieldX - cardX,
          width: fieldWidth,
        });
        setRegionMenuOpen(true);
      });
    });
  };

  const closeEditDialog = () => {
    if (!supplierEditDirty) {
      setEditError(null);
      setMode("view");
      return;
    }
    const discard = () => {
      setEditError(null);
      setMode("view");
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Discard unsaved changes?")) discard();
      return;
    }
    Alert.alert("Unsaved changes", "Discard unsaved changes?", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: discard },
    ]);
  };

  if (mode === "edit" && !isPage) {
    const useFieldGrid = isPage && isWide;
    return (
      <View style={[styles.editorRoot, { paddingTop: isPage ? 0 : insets.top }]}>
        <View style={[styles.editorHeader, isPage && styles.editorHeaderPage]}>
          <View style={styles.editorHeaderLeft}>
            <TouchableOpacity
              onPress={() => setMode("view")}
              style={[styles.iconBtn, isPage && styles.iconBtnPage]}
              hitSlop={10}
              accessibilityLabel="Back to profile"
            >
              <FontAwesome name="chevron-left" size={isPage ? 16 : 18} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
            <View style={styles.editorHeaderCopy}>
              <Text style={[styles.editorTitle, isPage && styles.editorTitlePage]}>
                Modify Business Identity
              </Text>
              <Text style={[styles.editorSubtitle, isPage && styles.editorSubtitlePage]} numberOfLines={1}>
                {organizationName}
              </Text>
            </View>
          </View>
          <View style={styles.editorHeaderActions}>
            <TouchableOpacity
              style={[styles.discardBtn, isPage && styles.discardBtnPage]}
              onPress={() => setMode("view")}
            >
              <Text style={[styles.discardBtnText, isPage && styles.discardBtnTextPage]}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.syncBtn, isPage && styles.syncBtnPage]}
              onPress={() => {
                void handleSynchronize();
              }}
              disabled={savingIdentity}
            >
              <Text style={[styles.syncBtnText, isPage && styles.syncBtnTextPage]}>
                {savingIdentity ? "Saving…" : "Synchronize Hub"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.editorBody, !isWide && styles.editorBodyColumn]}>
          {editTabs.length > 1 && isWide ? (
            <View style={[styles.editorAside, { width: asideWidth, maxWidth: asideWidth }]}>
              <View style={styles.editorAsideContent}>
                {editTabs.map((tab) => {
                  const active = editPanel === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.editorTab,
                        isPage && styles.editorTabPage,
                        active && styles.editorTabActive,
                        styles.editorTabFullWidth,
                      ]}
                      onPress={() => setEditPanel(tab.id)}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name={tab.icon}
                        size={isPage ? 12 : 14}
                        color={active ? Theme.textOnPrimary : Theme.textRouteCard}
                      />
                      <Text
                        style={[
                          styles.editorTabLabel,
                          isPage && styles.editorTabLabelPage,
                          active && styles.editorTabLabelActive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View
                style={[styles.editorResizeHandle, isAsideResizing && styles.editorResizeHandleActive]}
                {...asideResizePan.panHandlers}
                accessibilityRole="adjustable"
                accessibilityLabel="Resize navigation column"
              >
                <View style={styles.editorResizeGrip} />
              </View>
            </View>
          ) : editTabs.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.editorTabsRow}
              contentContainerStyle={styles.editorTabsRowContent}
            >
              {editTabs.map((tab) => {
                const active = editPanel === tab.id;
                return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.editorTab,
                        isPage && styles.editorTabPage,
                        active && styles.editorTabActive,
                        styles.editorTabPill,
                      ]}
                      onPress={() => setEditPanel(tab.id)}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name={tab.icon}
                        size={isPage ? 12 : 14}
                        color={active ? Theme.textOnPrimary : Theme.textRouteCard}
                      />
                      <Text
                        style={[
                          styles.editorTabLabel,
                          isPage && styles.editorTabLabelPage,
                          active && styles.editorTabLabelActive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView
            style={styles.editorMain}
            contentContainerStyle={[
              styles.editorMainContent,
              isPage && styles.editorMainContentPage,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {editPanel === "BASIC" && type !== "client" ? (
              <View style={styles.supplierBasicStack}>
                <View style={styles.supplierBasicCard}>
                  <View style={styles.editSectionHeadingRow}>
                    <View style={styles.accentNavy} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.editSectionTitle, isPage && styles.editSectionTitlePage]}>
                        Admin Registry
                      </Text>
                      <Text style={[styles.editSectionHint, isPage && styles.editSectionHintPage]}>
                        Contact used on invoices and the customer profile
                      </Text>
                    </View>
                  </View>
                  <View style={styles.editDialogGrid}>
                    <View style={isWide ? styles.editDialogCell : styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Legal organization name</Text>
                      <TextInput
                        value={draftName}
                        onChangeText={setDraftName}
                        style={styles.editDialogInput}
                        placeholder="Entity legal name"
                        placeholderTextColor={Theme.textSection}
                        editable={type === "supplier" || !isIntegrated}
                      />
                    </View>
                    <View style={isWide ? styles.editDialogCell : styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Email link</Text>
                      <TextInput
                        value={draftEmail}
                        onChangeText={setDraftEmail}
                        style={styles.editDialogInput}
                        placeholder="billing@company.com"
                        placeholderTextColor={Theme.textSection}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={isWide ? styles.editDialogCell : styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Admin name</Text>
                      <TextInput
                        value={draftAdmin}
                        onChangeText={setDraftAdmin}
                        style={styles.editDialogInput}
                        placeholder="Contact person"
                        placeholderTextColor={Theme.textSection}
                        editable={type === "supplier" || !isIntegrated}
                      />
                    </View>
                    <View style={isWide ? styles.editDialogCell : styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Phone registry</Text>
                      <TextInput
                        value={draftPhone}
                        onChangeText={setDraftPhone}
                        style={styles.editDialogInput}
                        placeholder="Phone"
                        placeholderTextColor={Theme.textSection}
                        keyboardType="phone-pad"
                        editable={type === "supplier" || !isIntegrated}
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.supplierBasicCard}>
                  <View style={styles.editSectionHeadingRow}>
                    <View style={styles.accentNavy} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.editSectionTitle, isPage && styles.editSectionTitlePage]}>
                        Tax Identity
                      </Text>
                      <Text style={[styles.editSectionHint, isPage && styles.editSectionHintPage]}>
                        GSTIN, PAN, and billing address printed on the invoice
                      </Text>
                    </View>
                  </View>
                  <View style={styles.editDialogGrid}>
                    <View style={styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Registered GSTIN</Text>
                      <TextInput
                        value={draftGst}
                        onChangeText={setDraftGst}
                        style={styles.editDialogInput}
                        placeholder="15-character GSTIN"
                        placeholderTextColor={Theme.textSection}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.editDialogFull}>
                      <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Billing address</Text>
                      <TextInput
                        value={draftBilling}
                        onChangeText={setDraftBilling}
                        style={[styles.editDialogInput, styles.supplierBillingInput]}
                        placeholder="Street, city, state, PIN"
                        placeholderTextColor={Theme.textSection}
                        multiline
                      />
                    </View>
                    {dateError ? <Text style={styles.editDialogError}>{dateError}</Text> : null}
                  </View>
                </View>
              </View>
            ) : null}
            {editPanel === "BASIC" && type === "client" ? (
              <View style={[styles.editSection, isPage && styles.editSectionPage]}>
                <View style={styles.editSectionHeadingRow}>
                  <View style={styles.accentNavy} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.editSectionTitle, isPage && styles.editSectionTitlePage]}>
                      Admin Registry
                    </Text>
                    <Text style={[styles.editSectionHint, isPage && styles.editSectionHintPage]}>
                      Contact used on invoices and the customer profile
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.editFormCard,
                    isPage && styles.editFormCardPage,
                    useFieldGrid && styles.editFormGrid,
                  ]}
                >
                  <View style={useFieldGrid ? styles.editFormCell : undefined}>
                    <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                      {type === "client" ? "Client Name" : "Legal organization name"}
                    </Text>
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                      placeholder={type === "client" ? "Client name" : "Entity legal name"}
                      placeholderTextColor={Theme.textSection}
                      editable={!isIntegrated}
                    />
                  </View>
                  <View style={useFieldGrid ? styles.editFormCell : undefined}>
                    <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                      Email link
                    </Text>
                    <TextInput
                      value={draftEmail}
                      onChangeText={setDraftEmail}
                      style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                      placeholder="billing@company.com"
                      placeholderTextColor={Theme.textSection}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={type === "client" ? !isIntegrated : true}
                    />
                  </View>
                  {type === "client" ? (
                    <View style={useFieldGrid ? styles.editFormCell : undefined}>
                      <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>GST</Text>
                      <TextInput
                        value={draftGst}
                        onChangeText={setDraftGst}
                        style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                        placeholder="15-character GSTIN"
                        placeholderTextColor={Theme.textSection}
                        autoCapitalize="characters"
                      />
                    </View>
                  ) : null}
                  {type === "client" ? (
                    <View style={useFieldGrid ? styles.editFormCell : undefined}>
                      <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>PAN</Text>
                      <TextInput
                        value={draftPan}
                        onChangeText={setDraftPan}
                        style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                        placeholder="PAN"
                        placeholderTextColor={Theme.textSection}
                        autoCapitalize="characters"
                      />
                    </View>
                  ) : null}
                  <View style={useFieldGrid ? styles.editFormCell : undefined}>
                    <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                      {type === "client" ? "SPOC Name" : "Admin name"}
                    </Text>
                    <TextInput
                      value={draftAdmin}
                      onChangeText={setDraftAdmin}
                      style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                      placeholder={type === "client" ? "SPOC name" : "Contact person"}
                      placeholderTextColor={Theme.textSection}
                      editable={!isIntegrated}
                    />
                  </View>
                  <View style={useFieldGrid ? styles.editFormCell : undefined}>
                    <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                      {type === "client" ? "SPOC Contact" : "Phone registry"}
                    </Text>
                    <TextInput
                      value={draftPhone}
                      onChangeText={setDraftPhone}
                      style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                      placeholder={type === "client" ? "SPOC phone" : "Phone"}
                      placeholderTextColor={Theme.textSection}
                      keyboardType="phone-pad"
                      editable={!isIntegrated}
                    />
                  </View>
                  {type === "client" ? (
                    <View style={[styles.dateRow, useFieldGrid && styles.editFormCellFull]}>
                      <ValidityDatePicker
                        label="Valid from"
                        value={draftValidFrom}
                        onChange={setDraftValidFrom}
                      />
                      <ValidityDatePicker
                        label="Valid to"
                        value={draftValidTo}
                        onChange={setDraftValidTo}
                      />
                    </View>
                  ) : null}
                  {dateError ? (
                    <Text style={[styles.identitySaveError, useFieldGrid && styles.editFormCellFull]}>
                      {dateError}
                    </Text>
                  ) : null}
                </View>

                <View style={[styles.editSectionHeadingRow, { marginTop: isPage ? 10 : 20 }]}>
                  <View style={styles.accentNavy} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.editSectionTitle, isPage && styles.editSectionTitlePage]}>
                      Tax Identity
                    </Text>
                    <Text style={[styles.editSectionHint, isPage && styles.editSectionHintPage]}>
                      {type === "client"
                        ? "Billing address printed on the invoice"
                        : "GSTIN, PAN, and billing address printed on the invoice"}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.editFormCard,
                    isPage && styles.editFormCardPage,
                  ]}
                >
                  {type === "client" ? null : (
                    <>
                      <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                        Registered GSTIN
                      </Text>
                      <TextInput
                        value={draftGst}
                        onChangeText={setDraftGst}
                        style={[styles.fieldInputLarge, isPage && styles.fieldInputPage]}
                        placeholder="15-character GSTIN"
                        placeholderTextColor={Theme.textSection}
                        autoCapitalize="characters"
                      />
                    </>
                  )}
                  <Text style={[styles.fieldLabel, isPage && styles.fieldLabelPage]}>
                    Billing address
                  </Text>
                  <TextInput
                    value={draftBilling}
                    onChangeText={setDraftBilling}
                    style={[styles.fieldInputArea, isPage && styles.fieldInputAreaPage]}
                    placeholder="Street, city, state, PIN"
                    placeholderTextColor={Theme.textSection}
                    multiline
                  />
                </View>
              </View>
            ) : null}

            {editPanel === "WAREHOUSES" && type === "client" && !isPage && canEditEntities ? (
              <ClientProfileHubsEditSection
                warehouses={editableWarehouses}
                organizationId={organizationId!}
                clientId={clientId!}
                onChanged={onProfileEntitiesChange!}
              />
            ) : null}

            {editPanel === "WAREHOUSES" && type === "client" && !isPage && !canEditEntities ? (
              <View style={styles.editSection}>
                <View style={styles.editSectionRow}>
                  <View style={styles.editSectionBarAmber} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editSectionTitle}>Operations Hubs</Text>
                    <Text style={styles.editSectionHint}>Register pickup and distribution nodes</Text>
                  </View>
                </View>
                {warehouses.length === 0 ? (
                  <Text style={styles.emptyMuted}>No hubs yet.</Text>
                ) : (
                  warehouses.map((wh) => (
                    <View key={wh.id} style={styles.hubEditCard}>
                      <View style={styles.hubEditTop}>
                        <View style={styles.hubEditIcon}>
                          <FontAwesome name="archive" size={22} color={Theme.aggregatePillText} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.hubEditName}>{wh.name}</Text>
                          <View style={styles.localGstPill}>
                            <Text style={styles.localGstPillText}>
                              Local GST: {(wh.gstNumber ?? "").trim() || "—"}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.hubEditGrid}>
                        <View style={styles.hubEditCol}>
                          <FontAwesome name="map-marker" size={16} color={Theme.aggregatePillText} />
                          <Text style={styles.hubEditAddr}>{wh.address}</Text>
                        </View>
                        <View style={[styles.hubEditCol, styles.hubEditColRight]}>
                          <FontAwesome name="user" size={16} color={Theme.positive} />
                          <Text style={styles.hubEditContact}>{(wh.contactPerson ?? "").trim() || "—"}</Text>
                          <Text style={styles.hubEditPhone}>{(wh.phone ?? "").trim() || "—"}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {editPanel === "CONTRACTS" && type === "client" && !isPage && canEditEntities ? (
              <ClientProfileLanesEditSection
                laneRates={editableLaneRates}
                warehouses={editableWarehouses}
                organizationId={organizationId!}
                clientId={clientId!}
                onChanged={onProfileEntitiesChange!}
              />
            ) : null}

            {editPanel === "CONTRACTS" && type === "client" && !isPage && !canEditEntities ? (
              <View style={styles.editSection}>
                <View style={styles.editSectionRow}>
                  <View style={styles.editSectionBarNavy} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editSectionTitle}>Route Contracts</Text>
                    <Text style={styles.editSectionHint}>Defined lane protocols and rate cards</Text>
                  </View>
                </View>
                <View style={styles.contractTableWrap}>
                  <View style={styles.contractTableHead}>
                    <Text style={[styles.contractTh, styles.contractColPickup]}>Hub (Pickup)</Text>
                    <Text style={[styles.contractTh, styles.contractColDest]}>Destination</Text>
                    <Text style={[styles.contractTh, styles.contractColVehicle]}>Vehicle</Text>
                    <Text style={[styles.contractTh, styles.contractColPricing]}>Pricing</Text>
                    <Text style={[styles.contractTh, styles.contractColRate]}>Lane Rate</Text>
                  </View>
                  {contracts.length === 0 ? (
                    <Text style={styles.emptyMutedPadded}>No contracts yet.</Text>
                  ) : (
                    contracts.map((cnt) => (
                      <View key={cnt.id} style={styles.contractTr}>
                        <Text style={[styles.contractTdPickup, styles.contractColPickup]} numberOfLines={2}>
                          {cnt.pickup}
                        </Text>
                        <Text style={[styles.contractTdDest, styles.contractColDest]} numberOfLines={2}>
                          {cnt.destination}
                        </Text>
                        <Text style={[styles.simpleTdVehicle, styles.contractColVehicle]} numberOfLines={1}>
                          {(cnt.vehicleType ?? "").trim() || "—"}
                        </Text>
                        <View style={[styles.contractPricingCol, styles.contractColPricing]}>
                          <View
                            style={[
                              styles.perPill,
                              cnt.pricingType === "per_trip" ? styles.perPillTrip : styles.perPillTon,
                            ]}
                          >
                            <Text
                              style={[
                                styles.perPillText,
                                cnt.pricingType === "per_trip" ? styles.perPillTextTrip : styles.perPillTextTon,
                              ]}
                            >
                              {cnt.pricingType === "per_trip" ? "Per trip" : "Per ton"}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.laneRate, styles.contractColRate]} numberOfLines={1}>
                          ₹{Math.round(cnt.price).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            ) : null}

            {editPanel === "KYC" && type === "supplier" && (
              <View style={styles.editSection}>
                <View style={styles.editSectionBarEmerald} />
                <Text style={styles.editSectionTitle}>Verification Vault</Text>
                <Text style={styles.editSectionHint}>Supplier regulatory compliance records</Text>
                {supplierVaultSlot ?? (
                  <VerificationVaultCards
                    docs={kycDocs}
                    uploadingId={kycUploadingId}
                    canUpload={canUploadSupplierKyc}
                    error={kycUploadError}
                    onUpdate={(doc) => void handleUpdateKycFile(doc)}
                    onView={(doc) => void handleViewKycFile(doc)}
                  />
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.viewRoot,
        isPage && styles.viewRootPage,
        { paddingTop: isPage ? 0 : insets.top },
      ]}
    >
      <View style={[styles.viewStickyHeader, isPage && styles.viewStickyHeaderPage]}>
        <View
          style={[
            styles.viewStickyHeaderInner,
            isPage && {
              paddingHorizontal: pagePad,
              paddingVertical: isWide ? 6 : 8,
              maxWidth: pageMaxWidth,
            },
          ]}
        >
          <View style={styles.viewStickyLeft}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.iconBtn, isPage && styles.iconBtnPage]}
              hitSlop={12}
              accessibilityLabel="Close profile"
            >
              <FontAwesome name="chevron-left" size={isPage ? 14 : 22} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
            {isPage ? (
              <>
                <View style={[styles.avatarCircle, styles.avatarCirclePage]}>
                  <Text style={[styles.avatarInitials, styles.avatarInitialsPage]}>{initials}</Text>
                </View>
                <View style={styles.pageHeaderIdentity}>
                  <Text style={styles.pageHeaderName} numberOfLines={1}>
                    {organizationName}
                  </Text>
                  <View style={styles.identityMetaInline}>
                    {shortId ? (
                      <Text style={[styles.identityId, styles.identityIdPage]}>#{shortId}</Text>
                    ) : null}
                    <View style={styles.pillEmerald}>
                      <Text style={[styles.pillEmeraldText, styles.pillTextPage]}>Active</Text>
                    </View>
                    <View style={[styles.pillIndigo, !isIntegrated && styles.pillIndigoMuted]}>
                      <Text
                        style={[
                          styles.pillIndigoText,
                          !isIntegrated && styles.pillIndigoTextMuted,
                          styles.pillTextPage,
                        ]}
                      >
                        {isIntegrated ? "Integrated" : "Core"}
                      </Text>
                    </View>
                    {podStatusLabel ? (
                      <View style={styles.pillEmerald}>
                        <Text
                          style={[styles.pillEmeraldText, styles.pillTextPage, styles.pillPodText]}
                          numberOfLines={1}
                        >
                          {podStatusLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.viewStickyTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
            )}
          </View>
          <View style={styles.viewStickyRight}>
            {isPage ? null : (
              <Badge variant={type === "client" ? "blue" : "orange"}>{typeBadge}</Badge>
            )}
            {headerSlot ? <View style={styles.pageHeaderPod}>{headerSlot}</View> : null}
            {canEdit ? (
              <Pressable
                onPress={() => {
                  setEditPanel("BASIC");
                  setMode("edit");
                }}
                style={(state) => [
                  styles.editProfileBtn,
                  isPage && styles.editProfileBtnPage,
                  isPage &&
                    (state.pressed || Boolean((state as { hovered?: boolean }).hovered)) &&
                    styles.editProfileBtnHover,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <FontAwesome name="pencil" size={12} color={Theme.textOnPrimary} />
                <Text style={[styles.editProfileBtnText, isPage && styles.editProfileBtnTextPage]}>
                  Edit Profile
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {showAnalyticsTabs ? (
        <View
          style={[
            styles.viewTabBar,
            isPage && styles.viewTabBarPage,
            isPage && {
              paddingHorizontal: pagePad,
              maxWidth: pageMaxWidth,
              alignSelf: "center",
              width: "100%",
            },
          ]}
        >
          {isPage ? (
          <View style={styles.viewTabTrackPage}>
          {(
            [
              { id: "OVERVIEW" as const, label: "Overview" },
              ...(type === "client" && isPage
                ? ([
                    { id: "HUBS" as const, label: "Operations Hubs" },
                    { id: "CONTRACTS" as const, label: "Route Contracts" },
                    { id: "AGREEMENT" as const, label: "Agreement" },
                  ] as const)
                : []),
              ...(type === "supplier" && supplierVaultSlot
                ? ([{ id: "VAULT" as const, label: "Documents & Data" }] as const)
                : []),
              { id: "FINANCE" as const, label: "Finance · Statement" },
              { id: "PERFORMANCE" as const, label: "Lane Performance" },
              { id: "MARGIN" as const, label: "Margin Analysis" },
            ] as const
          ).map((tab) => {
            const active = viewTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={(state) => [
                  styles.viewTabChip,
                  isPage && styles.viewTabChipPage,
                  active && (isPage ? styles.viewTabChipActivePage : styles.viewTabChipActive),
                  !active &&
                    isPage &&
                    (state.pressed || Boolean((state as { hovered?: boolean }).hovered)) &&
                    styles.viewTabChipHover,
                ]}
                onPress={() => setViewTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.viewTabChipText,
                    isPage && styles.viewTabChipTextPage,
                    active && (isPage ? styles.viewTabChipTextActivePage : styles.viewTabChipTextActive),
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.viewTabScroll}
            contentContainerStyle={styles.viewTabScrollContent}
          >
          {(
            [
              { id: "OVERVIEW" as const, label: "Overview" },
              ...(type === "supplier" && supplierVaultSlot
                ? ([{ id: "VAULT" as const, label: "Documents & Data" }] as const)
                : []),
              { id: "FINANCE" as const, label: "Finance · Statement" },
              { id: "PERFORMANCE" as const, label: "Lane Performance" },
              { id: "MARGIN" as const, label: "Margin Analysis" },
            ] as const
          ).map((tab) => {
            const active = viewTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[
                  styles.viewTabChip,
                  active && styles.viewTabChipActive,
                ]}
                onPress={() => setViewTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.viewTabChipText,
                    active && styles.viewTabChipTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          </ScrollView>
          )}
        </View>
      ) : null}

      <ScrollView
        style={styles.viewScroll}
        contentContainerStyle={pageScrollContentStyle}
        showsVerticalScrollIndicator={false}
      >
        {showAnalyticsTabs && organizationId && analyticsPartyId && viewTab === "FINANCE" ? (
          <>
            <ClientProfileFinanceStatementSection
              organizationId={organizationId}
              clientId={analyticsPartyId}
              clientName={organizationName}
              partyRole={analyticsPartyRole}
            />
            <View style={{ height: 24 }} />
          </>
        ) : showAnalyticsTabs && organizationId && analyticsPartyId && viewTab === "PERFORMANCE" ? (
          <>
            <ClientProfilePerformanceSection
              organizationId={organizationId}
              clientId={analyticsPartyId}
              clientName={organizationName}
              partyRole={analyticsPartyRole}
            />
            <View style={{ height: 24 }} />
          </>
        ) : showAnalyticsTabs && organizationId && analyticsPartyId && viewTab === "MARGIN" ? (
          <>
            <ClientProfileMarginAnalysisSection
              organizationId={organizationId}
              clientId={analyticsPartyId}
              clientName={organizationName}
              partyRole={analyticsPartyRole}
            />
            <View style={{ height: 24 }} />
          </>
        ) : viewTab === "HUBS" && type === "client" ? (
          <View style={styles.overviewBlock}>
            {canEditEntities ? (
              <ClientProfileHubsEditSection
                warehouses={editableWarehouses}
                organizationId={organizationId!}
                clientId={clientId!}
                onChanged={onProfileEntitiesChange!}
              />
            ) : (
              <Text style={styles.emptyMuted}>No hubs yet.</Text>
            )}
          </View>
        ) : viewTab === "CONTRACTS" && type === "client" ? (
          <View style={styles.overviewBlock}>
            {canEditEntities ? (
              <ClientProfileLanesEditSection
                laneRates={editableLaneRates}
                warehouses={editableWarehouses}
                organizationId={organizationId!}
                clientId={clientId!}
                onChanged={onProfileEntitiesChange!}
              />
            ) : (
              <Text style={styles.emptyMuted}>No lane contracts on file.</Text>
            )}
          </View>
        ) : viewTab === "VAULT" && type === "supplier" && supplierVaultSlot ? (
          <View style={styles.overviewBlock}>{supplierVaultSlot}</View>
        ) : viewTab === "AGREEMENT" && type === "client" && organizationId && clientId ? (
          <View style={styles.overviewBlock}>
            <ClientProfileAgreementSection
              organizationId={organizationId}
              clientId={clientId}
              onChanged={() => onProfileEntitiesChange?.()}
            />
          </View>
        ) : (
          <>
        {!isPage ? (
        <View style={styles.identityCard}>
          <View style={styles.identityBlob} />
          <View style={styles.avatarRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.identityName} numberOfLines={3}>
            {organizationName}
          </Text>
          {shortId ? <Text style={styles.identityId}>#{shortId}</Text> : null}
          <View style={styles.identityBadgeRow}>
            <View style={styles.pillEmerald}>
              <Text style={styles.pillEmeraldText}>Active Profile</Text>
            </View>
            <View style={[styles.pillIndigo, !isIntegrated && styles.pillIndigoMuted]}>
              <Text style={[styles.pillIndigoText, !isIntegrated && styles.pillIndigoTextMuted]}>
                {isIntegrated ? "Integrated Node" : "Core Node"}
              </Text>
            </View>
          </View>
          <View style={styles.completionBlock}>
            <View style={styles.completionHead}>
              <Text style={styles.completionLabel}>Profile Readiness</Text>
              <Text style={styles.completionPct}>{completion}%</Text>
            </View>
            <View style={styles.completionTrack}>
              <LinearGradient
                colors={[Theme.primaryLight, Theme.positive]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.completionFill, { width: `${completion}%` }]}
              />
            </View>
          </View>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Business Volume</Text>
              <Text style={styles.kpiTileValue}>{gridVolumeLabel ?? "—"}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Network Trust</Text>
              <Text style={[styles.kpiTileValue, { color: trustLabelColor(networkTrustLabel) }]}>
                {networkTrustLabel}
              </Text>
            </View>
          </View>
        </View>
        ) : null}

        {isPage ? (
          <View style={styles.overviewBlock}>
            <View style={[styles.blockHeadingRow, styles.overviewHeadingRow]}>
              <View style={styles.overviewTitleWrap}>
                <View style={styles.accentNavy} />
                <Text style={styles.overviewSectionTitle}>
                  {type === "client" ? "Customer details" : "Partner details"}
                </Text>
              </View>
              {type === "client" ? (
                <TouchableOpacity
                  onPress={() => setViewTab("HUBS")}
                  hitSlop={8}
                >
                  <Text style={styles.linkCta}>Manage hubs</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.detailGrid}>
              {(() => {
                const detailCells = type !== "client" ? [
                  { label: "Partner Name", value: organizationName.trim() || "—" },
                  { label: "Email", value: (email ?? "").trim() || "—" },
                  { label: "GST", value: (gstNumber ?? "").trim() || "—" },
                  { label: "PAN", value: (panNumber ?? "").trim() || "—" },
                  { label: "Admin Name", value: (adminName ?? "").trim() || "—" },
                  { label: "Phone", value: spocContactValue(phone) || "—" },
                  { label: "Partner Type", value: isIntegrated ? "Integrated" : "Offline" },
                  { label: "Primary Region", value: isPrimaryRegion(primaryRegion) ? primaryRegion : "—" },
                  { label: "Billing Address", value: (billingAddress ?? "").trim() || "—" },
                ] : [
                  { label: "Client Name", value: organizationName.trim() || "—" },
                  { label: "Email", value: (email ?? "").trim() || "—" },
                  { label: "GST", value: (gstNumber ?? "").trim() || "—" },
                  { label: "PAN", value: (panNumber ?? "").trim() || "—" },
                  { label: "SPOC Name", value: (adminName ?? "").trim() || "—" },
                  { label: "SPOC Contact", value: spocContactValue(phone) || "—" },
                  { label: "Valid from", value: formatDdMmYyyy(dateDraft(validFrom)) || "—" },
                  { label: "Valid to", value: formatDdMmYyyy(dateDraft(validTo)) || "—" },
                  { label: "Billing Address", value: (billingAddress ?? "").trim() || "—" },
                  {
                    label: "Operations Hub",
                    value:
                      warehouses
                        .map((hub) =>
                          [hub.name.trim(), hub.address.trim()].filter(Boolean).join(" · "),
                        )
                        .filter(Boolean)
                        .join(", ") || "—",
                  },
                ];
                const columns = isWide ? 5 : 2;
                const rows: Array<typeof detailCells> = [];
                for (let i = 0; i < detailCells.length; i += columns) {
                  rows.push(detailCells.slice(i, i + columns));
                }
                return rows.map((row) => (
                  <View key={row[0]?.label} style={styles.detailRow}>
                    {row.map((cell) => (
                      <View key={cell.label} style={styles.detailCard}>
                        <Text style={styles.overviewTileLabel}>{cell.label}</Text>
                        <Text
                          style={styles.overviewTileValue}
                          numberOfLines={
                            cell.label === "Billing Address" || cell.label === "Operations Hub" ? 2 : 1
                          }
                        >
                          {cell.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ));
              })()}
            </View>

            {type === "client" ? (
            <>
            <View style={[styles.blockHeadingRow, styles.overviewHeadingRow]}>
              <View style={styles.overviewTitleWrap}>
                <View style={styles.accentNavy} />
                <Text style={styles.overviewSectionTitle}>Lanes</Text>
              </View>
              <TouchableOpacity
                onPress={() => setViewTab("CONTRACTS")}
                hitSlop={8}
                style={styles.secondaryAction}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryActionText}>View Rate Cards</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.overviewLaneToolbar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mtFilterChips}
              >
                <TouchableOpacity
                  style={[
                    styles.mtChip,
                    contractWarehouseFilter === "all" && styles.mtChipActive,
                  ]}
                  onPress={() => setContractWarehouseFilter("all")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.mtChipText,
                      contractWarehouseFilter === "all" && styles.mtChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {contractWarehouseOptions.map((opt) => {
                  const active = contractWarehouseFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.mtChip, active && styles.mtChipActive]}
                      onPress={() => setContractWarehouseFilter(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[styles.mtChipText, active && styles.mtChipTextActive]}
                        numberOfLines={1}
                      >
                        {opt.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.overviewLaneCount}>
                {filteredContracts.length} lane{filteredContracts.length === 1 ? "" : "s"}
              </Text>
            </View>
            {filteredContracts.length === 0 ? (
              <Text style={styles.emptyMuted}>No lane contracts on file.</Text>
            ) : (
              <View style={styles.laneList}>
                {filteredContracts.map((cnt, idx) => (
                  <Pressable
                    key={cnt.id}
                    style={(state) => [
                      styles.laneCard,
                      idx === filteredContracts.length - 1 && styles.laneCardLast,
                      (state.pressed || Boolean((state as { hovered?: boolean }).hovered)) &&
                        styles.laneCardHover,
                    ]}
                  >
                    <FontAwesome name="map-marker" size={12} color={Theme.textMuted} />
                    <Text style={styles.laneCardRoute} numberOfLines={1}>
                      {cnt.pickup}
                      <Text style={styles.laneCardArrow}>{" → "}</Text>
                      {cnt.destination}
                    </Text>
                    <View style={styles.laneTruckChip}>
                      <Text style={styles.laneCardTruck} numberOfLines={1}>
                        {(cnt.vehicleType ?? "").trim() || "—"}
                      </Text>
                    </View>
                    <Text style={styles.laneCardRate}>
                      ₹{Math.round(cnt.price).toLocaleString("en-IN")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            </>
            ) : null}
          </View>
        ) : null}

        {!isPage ? (
        <View
          style={[
            styles.twoCol,
            type === "client" && isWide && styles.threeCol,
            !isWide && styles.twoColStack,
          ]}
        >
          <View
            style={[
              styles.colBlock,
              isWide && type === "client" && styles.colBlockThird,
              isWide && isPage && type === "client" && styles.infoTableCol,
            ]}
          >
            <View style={[styles.sectionHeadingRow, isPage && styles.sectionHeadingRowDense]}>
              <View style={styles.accentNavy} />
              <Text style={[styles.sectionHeading, isPage && styles.sectionHeadingPage]}>Admin Registry</Text>
            </View>
            <View
              style={[
                styles.registryCard,
                isPage && styles.registryCardPage,
                isWide && isPage && type === "client" && styles.registryCardInTable,
                isWide && styles.infoPanelEqual,
              ]}
            >
              {(type === "client"
                ? [
                    {
                      label: "Client Name",
                      value: organizationName.trim() || "—",
                      icon: "building-o" as const,
                    },
                    {
                      label: "SPOC Name",
                      value: (adminName ?? "").trim() || "—",
                      icon: "user" as const,
                    },
                    {
                      label: "SPOC Contact",
                      value: spocContactValue(phone) || "—",
                      icon: "phone" as const,
                    },
                    {
                      label: "Email Link",
                      value: (email ?? "").trim() || "—",
                      icon: "envelope" as const,
                    },
                  ]
                : [
                    { label: "Admin Name", value: (adminName ?? "").trim() || "—", icon: "user" as const },
                    { label: "Email Link", value: (email ?? "").trim() || "—", icon: "envelope" as const },
                    { label: "Phone Registry", value: (phone ?? "").trim() || "—", icon: "phone" as const },
                  ]
              ).map((item, idx, arr) => (
                <View
                  key={item.label}
                  style={[
                    styles.registryRow,
                    isPage && styles.registryRowPage,
                    idx === arr.length - 1 && styles.registryRowLast,
                  ]}
                >
                  <View style={[styles.registryIconWrap, isPage && styles.registryIconWrapPage]}>
                    <FontAwesome name={item.icon} size={isPage ? 12 : 22} color={Theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.registryLabel, isPage && styles.registryLabelPage]}>{item.label}</Text>
                    <Text style={[styles.registryValue, isPage && styles.registryValuePage]} numberOfLines={1}>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.colBlock,
              isWide && type === "client" && styles.colBlockThird,
              isWide && isPage && type === "client" && styles.infoTableCol,
              isWide && isPage && type === "client" && styles.infoTableColDivider,
            ]}
          >
            <View style={[styles.sectionHeadingRow, isPage && styles.sectionHeadingRowDense]}>
              <View style={styles.accentNavy} />
              <Text style={[styles.sectionHeading, isPage && styles.sectionHeadingPage]}>Tax Identity</Text>
            </View>
            <View
              style={[
                styles.registryCard,
                isPage && styles.registryCardPage,
                isWide && isPage && type === "client" && styles.registryCardInTable,
                isWide && styles.infoPanelEqual,
              ]}
            >
              {(type === "client"
                ? [
                    {
                      label: "GST",
                      value: (gstNumber ?? "").trim() || "—",
                      icon: "file-text-o" as const,
                    },
                    {
                      label: "PAN",
                      value: (panNumber ?? "").trim() || "—",
                      icon: "id-card-o" as const,
                    },
                    {
                      label: "Billing Address",
                      value: (billingAddress ?? "").trim() || "—",
                      icon: "map-marker" as const,
                    },
                  ]
                : [
                    {
                      label: "Registered GSTIN",
                      value: (gstNumber ?? "").trim() || "Not Configured",
                      icon: "file-text-o" as const,
                    },
                    {
                      label: "Billing Address",
                      value: (billingAddress ?? "").trim() || "Not Configured",
                      icon: "map-marker" as const,
                    },
                  ]
              ).map((item, idx, arr) => (
                <View
                  key={item.label}
                  style={[
                    styles.registryRow,
                    isPage && styles.registryRowPage,
                    idx === arr.length - 1 && styles.registryRowLast,
                  ]}
                >
                  <View style={[styles.registryIconWrap, isPage && styles.registryIconWrapPage]}>
                    <FontAwesome name={item.icon} size={isPage ? 12 : 22} color={Theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.registryLabel, isPage && styles.registryLabelPage]}>{item.label}</Text>
                    <Text style={[styles.registryValue, isPage && styles.registryValuePage]} numberOfLines={1}>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {type === "client" ? (
            <View
              style={[
                styles.colBlock,
                isWide && styles.colBlockThird,
                isWide && isPage && styles.infoTableCol,
                isWide && isPage && styles.infoTableColDivider,
              ]}
            >
              <View style={[styles.blockHeadingRow, isPage && styles.blockHeadingRowDense]}>
                <View style={[styles.sectionHeadingRow, styles.sectionHeadingRowInline, isPage && styles.sectionHeadingRowDense]}>
                  <View style={styles.accentNavy} />
                  <Text style={[styles.sectionHeading, isPage && styles.sectionHeadingPage]}>Operations Hub</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditPanel("WAREHOUSES");
                    setMode("edit");
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.linkCta}>Manage</Text>
                </TouchableOpacity>
              </View>
              {warehouses.length === 0 ? (
                <View
                  style={[
                    styles.emptyPanel,
                    styles.hubPanel,
                    isWide && isPage && styles.registryCardInTable,
                    isWide && styles.infoPanelEqual,
                  ]}
                >
                  <Text style={styles.emptyMuted}>No registered hubs yet.</Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={warehouses.length > 3}
                  style={[
                    styles.hubListScroll,
                    isWide && isPage && styles.hubListInTable,
                    isWide && styles.infoPanelEqual,
                  ]}
                  contentContainerStyle={styles.hubListContent}
                >
                  {warehouses.map((wh, idx) => (
                    <View
                      key={wh.id}
                      style={[
                        styles.hubCard,
                        isPage && styles.hubRowFlat,
                        idx === warehouses.length - 1 && styles.registryRowLast,
                      ]}
                    >
                      <View style={[styles.hubIcon, isPage && styles.registryIconWrapPage]}>
                        <FontAwesome name="archive" size={isPage ? 12 : 14} color={Theme.textMuted} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.hubName, isPage && styles.registryValuePage]} numberOfLines={1}>
                          {wh.name}
                        </Text>
                        <Text style={[styles.hubAddr, isPage && styles.hubAddrDense]} numberOfLines={1}>
                          {wh.address}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
        </View>
        ) : null}

        {type === "client" && !isPage && (
          <View style={styles.blockSpaced}>
            <View style={styles.blockHeadingRow}>
              <View style={[styles.sectionHeadingRow, styles.sectionHeadingRowInline]}>
                <View style={styles.accentNavy} />
                <Text style={[styles.sectionHeading, isPage && styles.sectionHeadingPage]}>
                  Active Route Contracts
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setEditPanel("CONTRACTS");
                  setMode("edit");
                }}
                hitSlop={8}
              >
                <Text style={styles.linkCta}>View Rate Cards</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mtTable}>
              <View style={styles.mtToolbar}>
                <View style={styles.mtFilterBlock}>
                  <Text style={styles.mtFilterLabel}>Warehouse</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mtFilterChips}
                  >
                    <TouchableOpacity
                      style={[
                        styles.mtChip,
                        contractWarehouseFilter === "all" && styles.mtChipActive,
                      ]}
                      onPress={() => setContractWarehouseFilter("all")}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.mtChipText,
                          contractWarehouseFilter === "all" && styles.mtChipTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>
                    {contractWarehouseOptions.map((opt) => {
                      const active = contractWarehouseFilter === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.mtChip, active && styles.mtChipActive]}
                          onPress={() => setContractWarehouseFilter(opt.id)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[styles.mtChipText, active && styles.mtChipTextActive]}
                            numberOfLines={1}
                          >
                            {opt.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <Text style={styles.mtToolbarMeta}>
                  {filteredContracts.length} lane{filteredContracts.length === 1 ? "" : "s"}
                </Text>
              </View>

              <View style={styles.mtHead}>
                <Text style={[styles.mtTh, { flex: 1.2 }]}>Lanes</Text>
                <Text style={[styles.mtTh, { flex: 1.1 }]}>Destination</Text>
                <Text style={[styles.mtTh, { width: 96 }]}>Truck Type</Text>
                <Text style={[styles.mtTh, styles.mtThRight, { width: 120 }]}>Contract Rates</Text>
              </View>

              {filteredContracts.length === 0 ? (
                <Text style={styles.emptyMutedPadded}>No lane contracts on file.</Text>
              ) : (
                pagedContracts.map((cnt, idx) => (
                  <View
                    key={cnt.id}
                    style={[styles.mtRow, idx % 2 === 1 && styles.mtRowAlt]}
                  >
                    <View style={{ flex: 1.2, minWidth: 0, paddingRight: 8 }}>
                      <Text style={styles.mtTdPrimary} numberOfLines={1}>
                        {cnt.pickup}
                      </Text>
                      {cnt.warehouseName ? (
                        <Text style={styles.mtTdSub} numberOfLines={1}>
                          {cnt.warehouseName}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.mtTd, { flex: 1.1 }]} numberOfLines={2}>
                      {cnt.destination}
                    </Text>
                    <Text style={[styles.mtTdMuted, { width: 96 }]} numberOfLines={2}>
                      {(cnt.vehicleType ?? "").trim() || "—"}
                    </Text>
                    <Text style={[styles.mtTdMoney, { width: 120 }]}>
                      ₹{Math.round(cnt.price).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ))
              )}

              {filteredContracts.length > 0 ? (
                <View style={styles.mtFooter}>
                  <Text style={styles.mtFooterMeta}>
                    {safeContractPage * CONTRACTS_PAGE_SIZE + 1}–
                    {Math.min(
                      (safeContractPage + 1) * CONTRACTS_PAGE_SIZE,
                      filteredContracts.length,
                    )}{" "}
                    of {filteredContracts.length}
                  </Text>
                  {contractTotalPages > 1 ? (
                    <View style={styles.mtFooterNav}>
                      <TouchableOpacity
                        style={[
                          styles.mtNavBtn,
                          safeContractPage <= 0 && styles.mtNavBtnDisabled,
                        ]}
                        disabled={safeContractPage <= 0}
                        onPress={() => setContractPage(Math.max(0, safeContractPage - 1))}
                        accessibilityLabel="Previous contracts page"
                      >
                        <FontAwesome
                          name="chevron-left"
                          size={11}
                          color={Theme.textPrimaryDark}
                        />
                      </TouchableOpacity>
                      <Text style={styles.mtPageLabel}>
                        {safeContractPage + 1} / {contractTotalPages}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.mtNavBtn,
                          safeContractPage >= contractTotalPages - 1 && styles.mtNavBtnDisabled,
                        ]}
                        disabled={safeContractPage >= contractTotalPages - 1}
                        onPress={() =>
                          setContractPage(Math.min(contractTotalPages - 1, safeContractPage + 1))
                        }
                        accessibilityLabel="Next contracts page"
                      >
                        <FontAwesome
                          name="chevron-right"
                          size={11}
                          color={Theme.textPrimaryDark}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Suppliers with the onboarding vault get it in the "Documents & Data" tab instead. */}
        {(type === "client" || (type === "supplier" && !supplierVaultSlot)) && (
          <View style={styles.blockSpaced}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentNavy} />
              <Text style={[styles.sectionHeading, isPage && styles.sectionHeadingPage]}>Verification Vault</Text>
            </View>
            {kycDocs.length === 0 ? (
              <View style={[styles.emptyPanel, isPage && styles.vaultEmpty]}>
                {isPage ? (
                  <View style={styles.vaultIcon}>
                    <FontAwesome name="shield" size={14} color={Theme.textMuted} />
                  </View>
                ) : null}
                <View style={styles.vaultCopy}>
                  <Text style={styles.emptyMuted}>No KYC documents on file.</Text>
                  {isPage ? (
                    <Text style={styles.vaultHint}>Uploaded compliance documents will show here.</Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <VerificationVaultCards
                docs={kycDocs}
                uploadingId={kycUploadingId}
                canUpload={canUploadSupplierKyc || type === "client"}
                error={kycUploadError}
                onUpdate={(doc) => void handleUpdateKycFile(doc)}
                onView={(doc) => void handleViewKycFile(doc)}
              />
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
      {isPage && mode === "edit" ? (
        <Modal visible transparent animationType="fade" onRequestClose={closeEditDialog}>
          <View style={styles.editDialogBackdrop}>
            <Pressable
              style={[StyleSheet.absoluteFill, styles.editDialogScrim]}
              onPress={closeEditDialog}
              accessibilityLabel="Close edit profile"
            />
            <View
              ref={editDialogCardRef}
              collapsable={false}
              pointerEvents="auto"
              style={[styles.editDialogCard, { width: Math.min(720, Math.max(320, windowWidth - 40)) }]}
            >
              <View style={styles.editDialogHead}>
                <View style={styles.editDialogHeadCopy}>
                  <Text style={styles.editDialogTitle}>Edit profile</Text>
                  <Text style={styles.editDialogSubtitle} numberOfLines={1}>
                    {organizationName}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeEditDialog}
                  style={styles.editDialogClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <FontAwesome name="times" size={14} color={Theme.textPrimaryDark} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={editDialogScrollStyle}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
              <View style={styles.editDialogGrid}>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>
                    {type === "client" ? "Client Name" : "Partner Name"}
                  </Text>
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    style={styles.editDialogInput}
                    placeholder={type === "client" ? "Client name" : "Entity legal name"}
                    placeholderTextColor={Theme.textSection}
                    editable={type === "supplier" || !isIntegrated}
                  />
                </View>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Email</Text>
                  <TextInput
                    value={draftEmail}
                    onChangeText={setDraftEmail}
                    style={styles.editDialogInput}
                    placeholder="billing@company.com"
                    placeholderTextColor={Theme.textSection}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={type === "supplier" || !isIntegrated}
                  />
                </View>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>GST</Text>
                  <TextInput
                    value={draftGst}
                    onChangeText={setDraftGst}
                    style={styles.editDialogInput}
                    placeholder="GSTIN"
                    placeholderTextColor={Theme.textSection}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>PAN</Text>
                  <TextInput
                    value={draftPan}
                    onChangeText={setDraftPan}
                    style={styles.editDialogInput}
                    placeholder="PAN"
                    placeholderTextColor={Theme.textSection}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>
                    {type === "client" ? "SPOC Name" : "Admin Name"}
                  </Text>
                  <TextInput
                    value={draftAdmin}
                    onChangeText={setDraftAdmin}
                    style={styles.editDialogInput}
                    placeholder={type === "client" ? "SPOC name" : "Contact person"}
                    placeholderTextColor={Theme.textSection}
                    editable={type === "supplier" || !isIntegrated}
                  />
                </View>
                <View style={styles.editDialogCell}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>
                    {type === "client" ? "SPOC Contact" : "Phone"}
                  </Text>
                  <TextInput
                    value={draftPhone}
                    onChangeText={setDraftPhone}
                    style={styles.editDialogInput}
                    placeholder="Phone"
                    placeholderTextColor={Theme.textSection}
                    keyboardType="phone-pad"
                    editable={type === "supplier" || !isIntegrated}
                  />
                </View>
                {type === "client" ? (
                  <View style={styles.editDialogDates}>
                    <ValidityDatePicker
                      label="Valid from"
                      value={draftValidFrom}
                      onChange={setDraftValidFrom}
                    />
                    <ValidityDatePicker
                      label="Valid to"
                      value={draftValidTo}
                      onChange={setDraftValidTo}
                    />
                  </View>
                ) : (
                  <>
                  <View style={styles.editDialogCell}>
                    <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Partner Type</Text>
                    <Text style={styles.editDialogLockedValue}>{isIntegrated ? "Integrated" : "Offline"}</Text>
                  </View>
                  <View style={styles.editDialogCell}>
                    <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Primary Region</Text>
                    <Pressable
                      ref={regionFieldRef}
                      collapsable={false}
                      onPress={toggleRegionMenu}
                      accessibilityRole="button"
                      accessibilityLabel="Primary Region"
                      accessibilityState={{ expanded: regionMenuOpen }}
                      style={styles.regionField}
                    >
                      <Text
                        style={draftPrimaryRegion ? styles.regionValue : styles.regionPlaceholder}
                        numberOfLines={1}
                      >
                        {draftPrimaryRegion || "Select region"}
                      </Text>
                      <FontAwesome name="chevron-down" size={11} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                  </>
                )}
                <View style={styles.editDialogFull}>
                  <Text style={[styles.fieldLabel, styles.fieldLabelPage]}>Billing address</Text>
                  <TextInput
                    value={draftBilling}
                    onChangeText={setDraftBilling}
                    style={styles.editDialogInput}
                    placeholder="Street, city, state, PIN"
                    placeholderTextColor={Theme.textSection}
                  />
                </View>
                {editSlot ? <View style={styles.editDialogFull}>{editSlot}</View> : null}
                {dateError ? <Text style={styles.editDialogError}>{dateError}</Text> : null}
                {editError ? <Text style={styles.editDialogError}>{editError}</Text> : null}
              </View>
              </ScrollView>
              <View style={styles.editDialogActions}>
                <TouchableOpacity style={styles.editDialogDiscard} onPress={closeEditDialog}>
                  <Text style={styles.editDialogDiscardText}>{type === "client" ? "Discard" : "Cancel"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editDialogSave}
                  onPress={() => {
                    void handleSynchronize();
                  }}
                  disabled={savingIdentity}
                >
                  <Text style={styles.editDialogSaveText}>
                    {savingIdentity ? "Saving…" : type === "client" ? "Save" : "Save Changes"}
                  </Text>
                </TouchableOpacity>
              </View>
              {regionMenuOpen && regionMenuBox ? (
                <View
                  style={[
                    styles.regionMenu,
                    {
                      top: regionMenuBox.top,
                      left: regionMenuBox.left,
                      width: regionMenuBox.width,
                    },
                  ]}
                >
                  {PRIMARY_REGIONS.map((region) => {
                    const selected = draftPrimaryRegion === region;
                    return (
                      <Pressable
                        key={region}
                        onPress={() => {
                          setDraftPrimaryRegion(region);
                          setRegionMenuOpen(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[styles.regionOption, selected && styles.regionOptionOn]}
                      >
                        <Text style={[styles.regionOptionText, selected && styles.regionOptionTextOn]}>{region}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewRoot: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  viewRootPage: {
    backgroundColor: Theme.analyticsCanvas,
  },
  editDialogBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  editDialogScrim: {
    zIndex: 0,
  },
  editDialogCard: {
    zIndex: 2,
    position: "relative",
    overflow: "visible",
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 12,
    gap: 8,
  },
  editDialogHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editDialogHeadCopy: { flex: 1, minWidth: 0 },
  editDialogTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  editDialogSubtitle: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  editDialogClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  editDialogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 6,
  },
  editDialogCell: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 0,
  },
  editDialogDates: {
    flexBasis: "100%",
    flexGrow: 0,
    flexDirection: "row",
    gap: 8,
  },
  editDialogFull: { flexBasis: "100%", flexGrow: 0, minWidth: 0 },
  editDialogInput: {
    height: 32,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    width: "100%",
  },
  editDialogInputLocked: {
    opacity: 0.7,
  },
  editDialogLockedValue: {
    height: 32,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlignVertical: "center",
  },
  regionField: {
    height: 32,
    minHeight: 32,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
  },
  regionValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  regionPlaceholder: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginRight: 8,
  },
  regionMenu: {
    position: "absolute",
    zIndex: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    overflow: "hidden",
  },
  regionOption: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  regionOptionOn: { backgroundColor: Theme.surface },
  regionOptionText: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  regionOptionTextOn: { color: Theme.analyticsHeroBg },
  supplierBasicStack: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "flex-start",
    gap: 10,
  },
  supplierBasicCard: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 12,
    gap: 8,
  },
  supplierBillingInput: {
    height: 64,
    minHeight: 64,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  editDialogError: {
    flexBasis: "100%",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
  },
  editDialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  editDialogDiscard: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  editDialogDiscardText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  editDialogSave: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.analyticsHeroBg,
  },
  editDialogSaveText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  viewStickyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  viewStickyHeaderPage: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderBottomWidth: 0,
  },
  viewStickyHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    alignSelf: "center",
    gap: 12,
  },
  viewStickyLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  viewStickyTitle: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.6,
    flexShrink: 1,
  },
  viewStickyTitlePage: {
    fontSize: 16,
    fontWeight: "700",
    fontStyle: "normal",
    letterSpacing: -0.2,
    textTransform: "none",
    color: Theme.textPrimaryDark,
  },
  viewStickyRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  pageHeaderIdentity: { flexShrink: 1, minWidth: 120, justifyContent: "center" },
  pageHeaderPod: { flexShrink: 1, minWidth: 280, justifyContent: "center" },
  pageHeaderName: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  viewTabBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  viewTabChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
    minHeight: 30,
    justifyContent: "center",
  },
  viewTabChipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  viewTabChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  viewTabChipTextActive: {
    color: Theme.textOnPrimary,
  },
  viewTabBarPage: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    paddingTop: 0,
    paddingBottom: 0,
  },
  viewTabScroll: { flexGrow: 0, alignSelf: "flex-start", maxWidth: "100%" },
  viewTabScrollPage: { alignSelf: "stretch", flexGrow: 1 },
  viewTabScrollContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  viewTabTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
  },
  viewTabTrackPage: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 2,
    width: "100%",
    minHeight: 40,
  },
  viewTabChipPage: {
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    borderRadius: 0,
    backgroundColor: "transparent",
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
  },
  viewTabChipHover: {
    backgroundColor: Theme.surface,
  },
  viewTabChipActivePage: {
    backgroundColor: "transparent",
    borderBottomColor: Theme.analyticsHeroBg,
  },
  viewTabChipTextPage: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "none",
    color: Theme.textRouteCard,
  },
  viewTabChipTextActivePage: {
    color: Theme.analyticsHeroBg,
    fontWeight: "700",
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPage: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Theme.textPrimaryDark,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  editProfileBtnText: {
    color: Theme.buttonDarkText,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  editProfileBtnPage: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 10,
    backgroundColor: Theme.analyticsHeroBg,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  editProfileBtnHover: { opacity: 0.88 },
  editProfileBtnTextPage: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "none",
    color: Theme.textOnPrimary,
  },
  viewScroll: { flex: 1 },
  viewScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  viewScrollContentPage: {
    paddingTop: 6,
    paddingBottom: 24,
    width: "100%",
    alignSelf: "center",
    gap: 10,
  },
  identityCard: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 28,
    paddingHorizontal: 18,
    marginBottom: 20,
    overflow: "hidden",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.06,
        shadowRadius: 40,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  identityCardPage: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  identityPageWideStack: {
    width: "100%",
    gap: 0,
  },
  identityPageWideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  identityPageWideMain: {
    flex: 1,
    minWidth: 0,
    maxWidth: "42%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  identityPageWideText: {
    flex: 1,
    minWidth: 0,
  },
  identityMetaInline: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  identityPageWideAside: {
    width: 280,
    minWidth: 280,
    gap: 12,
    justifyContent: "center",
  },
  identityMetricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  identityMetricsInline: {
    flex: 1.35,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
  },
  identityMetricGrow: {
    flex: 1.4,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 8,
  },
  identityBlob: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderBottomLeftRadius: 140,
    backgroundColor: Theme.fiscalTabActiveBg,
    opacity: 0.2,
  },
  avatarRing: {
    padding: 6,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  avatarRingPage: { padding: 0, marginBottom: 8 },
  avatarRingPageWide: { marginBottom: 0, flexShrink: 0 },
  avatarCircle: {
    width: 88,
    height: 88,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCirclePage: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Theme.analyticsHeroBg,
  },
  avatarInitials: {
    color: Theme.textOnPrimary,
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  avatarInitialsPage: { fontSize: 14, fontStyle: "normal", fontWeight: "800" },
  identityName: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    textAlign: "center",
    letterSpacing: -1,
    lineHeight: 26,
  },
  identityNamePage: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "normal",
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  identityNamePageWide: {
    textAlign: "left",
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
    textTransform: "none",
  },
  identityId: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.aggregatePillText,
  },
  identityIdPage: { fontSize: 10, fontWeight: "600", fontStyle: "normal", marginTop: 0 },
  identityBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  identityBadgeRowPageWide: {
    justifyContent: "flex-start",
    marginTop: 0,
    gap: 6,
  },
  pillEmerald: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.positiveMuted,
    borderRadius: 999,
  },
  pillEmeraldText: { fontSize: 10, fontWeight: "900", color: Theme.positive, textTransform: "uppercase" },
  pillPodText: { textTransform: "none", letterSpacing: 0.1 },
  pillTextPage: { fontSize: 8, fontWeight: "700", letterSpacing: 0.3 },
  pillIndigo: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.brandBlueWashSubtle,
    borderRadius: 999,
  },
  pillIndigoMuted: { backgroundColor: Theme.surfaceGray },
  pillIndigoText: { fontSize: 10, fontWeight: "900", color: Theme.aggregatePillText, textTransform: "uppercase" },
  pillIndigoTextMuted: { color: Theme.textMuted },
  completionBlock: { width: "100%", maxWidth: 360, marginTop: 18 },
  completionBlockPage: { maxWidth: 320, marginTop: 12 },
  completionBlockPageWide: {
    maxWidth: "100%",
    width: "100%",
    marginTop: 16,
  },
  completionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  completionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  completionLabelPage: { fontSize: 8, letterSpacing: 0.5 },
  completionPct: {
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.primary,
  },
  completionPctPage: { fontSize: 11, fontStyle: "normal", fontWeight: "700" },
  completionTrack: {
    height: 4,
    backgroundColor: Theme.surfaceBorder,
    overflow: "hidden",
    borderRadius: 999,
  },
  completionFill: { height: "100%", borderRadius: 999 },
  completionFillPage: { backgroundColor: Theme.analyticsHeroBg },
  kpiGrid: { flexDirection: "row", gap: 12, marginTop: 22, width: "100%" },
  kpiGridPage: { gap: 10, marginTop: 16 },
  kpiTilePageWide: {
    flex: 1,
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 72,
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  kpiTile: {
    flex: 1,
    backgroundColor: Theme.surface,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  kpiTileLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    textAlign: "center",
  },
  kpiTileValue: {
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  kpiTileLabelPage: { fontSize: 8, letterSpacing: 0.5, marginBottom: 2, textAlign: "left" },
  kpiTileValuePage: { fontSize: 12, fontStyle: "normal", fontWeight: "700", textAlign: "left" },
  kpiTileValuePageWide: { fontSize: 13, lineHeight: 16 },
  twoCol: { flexDirection: "row", gap: 10, marginBottom: 12, alignItems: "stretch" },
  threeCol: { gap: 10 },
  infoTable: {
    gap: 0,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  infoTableCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
  },
  infoTableColDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderInput,
  },
  twoColStack: { flexDirection: "column" },
  colBlock: { flex: 1, minWidth: 0 },
  colBlockNarrow: { flex: 0.95 },
  colBlockWide: { flex: 1.05 },
  colBlockThird: { flex: 1, minWidth: 0 },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 0,
    minHeight: 18,
  },
  sectionHeadingRowDense: {
    marginBottom: 4,
  },
  sectionHeadingRowInline: {
    marginBottom: 0,
    flex: 1,
    minWidth: 0,
  },
  accentIndigo: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  accentEmerald: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  accentAmber: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  accentNavy: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  sectionHeadingPage: { fontSize: 9, letterSpacing: 0.6, fontWeight: "700", color: Theme.textRouteCard },
  registryCard: {
    backgroundColor: Theme.cardWhite,
    padding: 18,
    gap: 14,
  },
  registryCardPage: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    minHeight: 0,
  },
  registryCardInTable: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    minHeight: 0,
    flex: 1,
  },
  infoPanelEqual: {
    flex: 1,
    minHeight: 118,
  },
  registryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  registryRowPage: {
    gap: 8,
    paddingVertical: 6,
    minHeight: 36,
  },
  registryRowLast: {
    borderBottomWidth: 0,
  },
  registryIconWrap: {
    width: 56,
    height: 56,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  registryIconWrapPage: { width: 24, height: 24, borderRadius: 4 },
  registryLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  registryLabelPage: { fontSize: 8, letterSpacing: 0.3, marginBottom: 0 },
  registryValue: { fontSize: 16, fontWeight: "700", color: Theme.textPrimary },
  registryValuePage: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark, lineHeight: 15 },
  overviewBlock: { gap: 10, marginBottom: 4 },
  overviewHeadingRow: { marginBottom: 0, minHeight: 0 },
  overviewTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  overviewSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  overviewLaneToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  overviewLaneCount: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  detailGrid: {
    width: "100%",
    gap: 8,
  },
  detailRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  detailCard: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  overviewTileLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 3,
  },
  overviewTileValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  laneList: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  secondaryAction: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
    letterSpacing: 0.2,
  },
  laneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  laneCardHover: { backgroundColor: Theme.surface },
  laneCardLast: { borderBottomWidth: 0 },
  laneCardRoute: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  laneCardArrow: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  laneTruckChip: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  laneCardTruck: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  laneCardRate: {
    width: 84,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  taxLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  taxLabelPage: { fontSize: 9, marginBottom: 4 },
  taxGst: { fontSize: 20, fontWeight: "900", color: Theme.textPrimaryDark, textTransform: "uppercase" },
  taxGstPage: { fontSize: 15, fontWeight: "800" },
  taxPan: { fontSize: 16, fontWeight: "800", color: Theme.textPrimary },
  taxPanPage: { fontSize: 13, fontWeight: "600" },
  taxBilling: { fontSize: 14, fontWeight: "700", fontStyle: "italic", color: Theme.textSecondary, lineHeight: 20 },
  taxBillingPage: { fontSize: 12, fontWeight: "500", fontStyle: "normal", lineHeight: 18 },
  blockSpaced: { marginBottom: 12 },
  blockHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 0,
    gap: 8,
    minHeight: 18,
  },
  blockHeadingRowDense: {
    marginBottom: 4,
  },
  linkCta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hubListScroll: {
    width: "100%",
    maxHeight: 148,
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  hubListInTable: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    maxHeight: 118,
  },
  hubListContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 0,
  },
  hubPanel: {
    minHeight: 118,
    justifyContent: "center",
  },
  hubScroll: {
    width: "100%",
    flexGrow: 0,
  },
  hubScrollContent: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 12,
    paddingRight: 4,
  },
  hubCard: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
  },
  hubRowFlat: {
    borderWidth: 0,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 6,
    minHeight: 36,
  },
  hubAddrDense: {
    marginTop: 0,
    fontSize: 10,
    lineHeight: 12,
  },
  hubIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emptyPanel: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  vaultEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  vaultIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  vaultCopy: { flex: 1, minWidth: 0, gap: 2 },
  vaultHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textRouteCard,
  },
  mtTable: {
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  mtToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: "#F8FAFC",
  },
  mtFilterBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  mtFilterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  mtFilterChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  mtChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    maxWidth: 160,
  },
  mtChipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  mtChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  mtChipTextActive: {
    color: Theme.textOnPrimary,
  },
  mtToolbarMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  mtHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    gap: 8,
    minHeight: 34,
  },
  mtTh: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mtThRight: { textAlign: "right" },
  mtRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    gap: 8,
    minHeight: 42,
    backgroundColor: Theme.cardWhite,
  },
  mtRowAlt: {
    backgroundColor: "#FCFDFE",
  },
  mtTdPrimary: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mtTdSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  mtTd: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textRouteCard,
    paddingRight: 6,
  },
  mtTdMuted: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    paddingRight: 6,
  },
  mtTdMoney: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  mtFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  mtFooterMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  mtFooterNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mtNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  mtNavBtnDisabled: {
    opacity: 0.35,
  },
  mtPageLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 40,
    textAlign: "center",
  },
  simpleTableHead: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  hubName: { fontSize: 12, fontWeight: "700", fontStyle: "normal", color: Theme.textPrimaryDark },
  hubAddr: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "none",
    letterSpacing: 0.1,
    lineHeight: 12,
  },
  simpleTh: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  simpleThRight: { textAlign: "right" },
  simpleTr: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  simpleTdPickup: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    textTransform: "none",
    paddingRight: 8,
  },
  simpleTdDest: {
    fontSize: 13,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textRouteCard,
    paddingRight: 8,
  },
  simpleTdVehicle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    paddingRight: 8,
  },
  simpleTdMoney: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "right" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.2 },
  emptyMuted: { fontSize: 12, color: Theme.textMuted, fontWeight: "500" },
  emptyMutedPadded: { fontSize: 12, color: Theme.textMuted, fontWeight: "500", padding: 14 },
  editorRoot: { flex: 1, backgroundColor: Theme.cardWhite },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    gap: 8,
  },
  editorHeaderPage: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editorHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  editorHeaderCopy: { flex: 1, minWidth: 0 },
  editorTitle: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  editorTitlePage: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: Theme.textMuted,
  },
  editorSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editorSubtitlePage: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: Theme.textPrimaryDark,
  },
  editorHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  discardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  discardBtnPage: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  discardBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  discardBtnTextPage: { fontSize: 9 },
  syncBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Theme.textPrimaryDark,
  },
  syncBtnPage: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  syncBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  syncBtnTextPage: { fontSize: 9 },
  editorBody: { flex: 1, flexDirection: "row", alignItems: "stretch", minWidth: 0 },
  editorBodyColumn: { flexDirection: "column" },
  editorAside: {
    position: "relative",
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
  },
  editorAsideContent: { padding: 8, gap: 4, paddingRight: 12 },
  editorResizeHandle: {
    position: "absolute",
    top: 0,
    right: -5,
    bottom: 0,
    width: 10,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "col-resize" } as object) : null),
  },
  editorResizeHandleActive: {
    backgroundColor: Theme.buttonPrimary + "18",
  },
  editorResizeGrip: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
  },
  editorTabsRow: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
  },
  editorTabsRowContent: { paddingHorizontal: 10, paddingVertical: 6, gap: 6, alignItems: "center" },
  editorTab: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  editorTabPage: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  editorTabPill: { marginRight: 6 },
  editorTabFullWidth: { alignSelf: "stretch", width: "100%" },
  editorTabActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  editorTabLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flexShrink: 1,
    minWidth: 0,
  },
  editorTabLabelPage: {
    fontSize: 9,
    letterSpacing: 0.35,
  },
  editorTabLabelActive: { color: Theme.textOnPrimary },
  editorTabPulse: {
    position: "absolute",
    right: 8,
    width: 6,
    height: 6,
    backgroundColor: Theme.aggregatePillText,
  },
  editorMain: { flex: 1, minWidth: 0, backgroundColor: Theme.cardWhite },
  editorMainContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  editorMainContentPage: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  editSection: { position: "relative", marginBottom: 12, width: "100%", alignSelf: "stretch" },
  editSectionPage: { marginBottom: 8 },
  editSectionHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 8,
  },
  editSectionBarIndigo: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: Theme.textPrimaryDark,
  },
  editSectionBarAmber: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: Theme.textPrimaryDark,
  },
  editSectionBarNavy: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: Theme.textPrimaryDark,
  },
  editSectionBarEmerald: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: Theme.textPrimaryDark,
  },
  editSectionRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  editSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "normal",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  editSectionTitlePage: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textRouteCard,
  },
  editSectionHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  editSectionHintPage: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.3,
    textTransform: "none",
    color: Theme.textMuted,
  },
  editFormCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  editFormCardPage: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  editFormGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginHorizontal: -6,
  },
  editFormCell: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 8,
    minWidth: 0,
  },
  editFormCellFull: {
    width: "100%",
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  fieldLabelPage: {
    fontSize: 8,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 0,
  },
  dateField: { flex: 1, minWidth: 0 },
  datePickerShell: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  datePickerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  datePickerPlaceholder: { color: Theme.textSection },
  datePickerHit: { ...StyleSheet.absoluteFillObject },
  datePickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  datePickerBackdropCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: Theme.overlayBackdrop,
  },
  datePickerDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  datePickerPopover: {
    width: 320,
    maxWidth: "100%",
    zIndex: 2,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  datePickerClearRow: {
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  datePickerSheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 24,
  },
  datePickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  datePickerSheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: { fontSize: 14, fontWeight: "700", color: Theme.primary },
  datePickerClear: { fontSize: 14, fontWeight: "600", color: Theme.textMuted },
  identitySaveError: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
  },
  fieldInputLarge: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    marginBottom: 12,
    width: "100%",
  },
  fieldInputPage: {
    height: 32,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 0,
  },
  fieldInputPageLast: {
    marginBottom: 10,
  },
  fieldInputArea: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 12,
    width: "100%",
  },
  fieldInputAreaPage: {
    minHeight: 52,
    paddingVertical: 6,
    fontSize: 12,
    marginBottom: 0,
  },
  smallCtaAmber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.warningMuted,
  },
  smallCtaAmberText: { fontSize: 10, fontWeight: "900", color: Theme.warning, textTransform: "uppercase" },
  smallCtaNavy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.textPrimaryDark,
  },
  smallCtaNavyText: { fontSize: 10, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
  hubEditCard: {
    padding: 12,
    backgroundColor: Theme.surface,
    marginBottom: 10,
  },
  hubEditTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  hubEditIcon: {
    width: 44,
    height: 44,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  hubEditName: { fontSize: 14, fontWeight: "900", fontStyle: "normal", color: Theme.textPrimaryDark },
  localGstPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.cardWhite,
  },
  localGstPillText: { fontSize: 10, fontWeight: "900", color: Theme.aggregatePillText, textTransform: "uppercase" },
  iconBtnGhost: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  hubEditGrid: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Theme.surfaceBorder, paddingTop: 10, gap: 10 },
  hubEditCol: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hubEditColRight: { borderLeftWidth: 1, borderLeftColor: Theme.surfaceBorder, paddingLeft: 12 },
  hubEditAddr: { flex: 1, fontSize: 12, fontWeight: "700", fontStyle: "italic", color: Theme.textPrimary },
  hubEditContact: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  hubEditPhone: { marginTop: 3, fontSize: 10, fontWeight: "700", fontStyle: "italic", color: Theme.textMuted },
  contractTableWrap: {
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  contractTableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  contractTh: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  contractColPickup: { flex: 1.35, minWidth: 0 },
  contractColDest: { flex: 1.2, minWidth: 0 },
  contractColVehicle: { flex: 0.85, minWidth: 0 },
  contractColPricing: { width: 92, flexGrow: 0, flexShrink: 0 },
  contractColRate: {
    width: 104,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
  },
  contractTr: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  contractTdPickup: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  contractTdDest: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  contractPricingCol: { alignItems: "flex-start", justifyContent: "center" },
  perPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  perPillTrip: { backgroundColor: Theme.fiscalTabActiveBg, borderColor: Theme.aggregatePillBorder },
  perPillTon: { backgroundColor: Theme.warningMuted, borderColor: Theme.warning + "44" },
  perPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  perPillTextTrip: { color: Theme.aggregatePillText },
  perPillTextTon: { color: Theme.warning },
  laborHint: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  laneRate: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  laneNotes: { marginTop: 6, fontSize: 8, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  kycVaultCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  kycVaultLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  kycVaultIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  kycVaultIconOk: { backgroundColor: Theme.positiveMuted },
  kycVaultIconPending: { backgroundColor: Theme.surfaceGray },
  kycVaultTitle: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  kycVaultMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kycVaultDate: { fontSize: 9, fontWeight: "800", color: Theme.textSection, textTransform: "uppercase" },
  kycVaultError: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.negative,
    marginBottom: 10,
  },
  kycVaultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  kycViewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  kycViewBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  kycUpdateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Theme.textPrimaryDark,
    minWidth: 88,
    alignItems: "center",
  },
  kycUpdateBtnDisabled: { opacity: 0.5 },
  kycUpdateBtnText: { fontSize: 10, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
});
