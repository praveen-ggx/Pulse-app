/**
 * Full-page Salary Request screen (driver).
 * Matches reference: header, balance card, fleet, type, period, amount, note, sticky submit, success state.
 * Safe area and Theme/Layout compliant.
 */
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { DriverSelfAvatar } from '@/components/driver/DriverSelfAvatar';
import {
  tripEarningsDetailForDriver,
  tripEarningsForDriver,
} from '@/features/drivers/utils/driverUtils.util';
import { resolveDriverOrgAvatarUri } from '@/features/drivers/utils/resolveDriverOrgAvatar.util';
import { useOrgBrandingByIds } from '@/lib/hooks/useOrgBrandingByIds';
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from '@/features/driver/utils/driverTripSequence.util';
import { showAppAlert } from '@/lib/appAlert';
import { VALIDATION } from '@/lib/validation';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as salaryRequestsService from '@/features/drivers/services/salaryRequests.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { NeededByCalendar } from '@/components/driver/NeededByCalendar';
import { SmartInput } from '@/components/mobile-input';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  ReceiptText,
  Send,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { driverTabBarBottomPad } from '@/components/driver/driverTabBarInsets';

function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
}

function formatLedgerDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const SALARY_REQUEST_DRAFT_KEY = 'driver_salary_request_draft_v1';

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Compact display ref from UUID (copy still uses full id). */
function formatRequestRefDisplay(id: string): string {
  const hex = id.replace(/-/g, '');
  if (hex.length >= 14) return `${hex.slice(0, 14).toUpperCase()}`;
  return id;
}

/** Parsed integer ₹ from keypad / TextInput (non-digits stripped). Empty → 0 (invalid for submit). */
function parseRupeeAmountInput(raw: string): number {
  const cleaned = String(raw).replace(/[^0-9]/g, '');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

const REQUEST_TYPES: { type: salaryRequestsService.SalaryRequestType; label: string; hint: string }[] = [
  // Map to existing DB enum (kept stable for backend):
  // - Salary -> monthly
  // - Trip commission -> trip_based (uses tripIds)
  // - Advance -> advance
  { type: 'monthly', label: 'Salary', hint: 'Monthly salary request' },
  { type: 'trip_based', label: 'Trip commission', hint: 'Select trips to be paid' },
  { type: 'advance', label: 'Advance', hint: 'Before payday' },
];

export default function SalaryRequestScreen() {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const { isDark } = useDriverTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const isOnline = useIsOnline();
  const { avatarUri, loading: avatarUriLoading } = useDriverAvatarUri();
  const { avatarSeed } = useDriverAvatar();
  const [headerAvatarFailed, setHeaderAvatarFailed] = useState(false);

  /**
   * DriverTabBar is absolutely positioned at the bottom on all platforms.
   * Reserve space so NEXT / SUBMIT never sit under the glass dock (web + iOS + Android).
   */
  const footerPadTop = 4;
  const footerPadBottom = driverTabBarBottomPad(insets.bottom);
  const tabBarClearance =
    Layout.tabBarDockHeight + footerPadTop + footerPadBottom;

  const [loading, setLoading] = useState(true);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [salaryRequests, setSalaryRequests] = useState<salaryRequestsService.SalaryRequestRow[]>([]);

  const [salaryRequestOrg, setSalaryRequestOrg] = useState<{
    driverId: string;
    orgId: string;
    orgName: string;
    logoUrl: string | null;
    ownerSeed: string | null;
    ownerUrl: string | null;
  } | null>(null);
  const [salaryRequestType, setSalaryRequestType] = useState<salaryRequestsService.SalaryRequestType | null>(null);
  const [salaryRequestAmount, setSalaryRequestAmount] = useState('');
  const [salaryRequestReason, setSalaryRequestReason] = useState('');
  const [salaryRequestSubmitting, setSalaryRequestSubmitting] = useState(false);
  const [selectedSalaryTripIds, setSelectedSalaryTripIds] = useState<string[]>([]);
  const [salaryRequestDate, setSalaryRequestDate] = useState<Date | null>(null);
  const [_showSalaryMonthDropdown, setShowSalaryMonthDropdown] = useState(false);
  const [showRequestTypeMenu, setShowRequestTypeMenu] = useState(false);
  const [neededByDate, setNeededByDate] = useState<Date | null>(null);
  const [showNeededByPicker, setShowNeededByPicker] = useState(false);
  const [showTripsDropdown, setShowTripsDropdown] = useState(false);
  const [_blink, setBlink] = useState(true);
  const [widgetPage, setWidgetPage] = useState<0 | 1>(0);

  const reasonMax = 500;

  const headerAvatarUri = headerAvatarFailed ? getAvatarUriForSeed(avatarSeed) : avatarUri;

  useEffect(() => {
    setHeaderAvatarFailed(false);
  }, [avatarUri]);

  /** Success state: full-screen confirmation using the row returned from `driver_salary_requests` */
  const [isSuccess, setIsSuccess] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    orgName: string;
    request: salaryRequestsService.SalaryRequestRow;
  } | null>(null);
  const [successCopiedId, setSuccessCopiedId] = useState(false);
  /** Request summary accordion on success screen */
  const [successSummaryExpanded, setSuccessSummaryExpanded] = useState(true);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ]).then(([driversRes, invRes]) => {
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      setInvites(invRes.invites ?? []);
      setLinkedDrivers(drivers);
      if (drivers.length > 0) {
        const driverIds = drivers.map((d) => d.id);
        Promise.all([
          tripsService.getDriverUiTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
          salaryRequestsService.getSalaryRequestsByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes, salaryReqRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
          setSalaryRequests(salaryReqRes.requests ?? []);
          setLoading(false);
        });
      } else {
        setSalaryRequests([]);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  /** Full reset of local UI state (success card + form). */
  const resetSalaryRequestScreen = useCallback(() => {
    setIsSuccess(false);
    setSuccessPayload(null);
    setSuccessCopiedId(false);
    setSuccessSummaryExpanded(true);
    setWidgetPage(0);
    setSalaryRequestAmount('');
    setSalaryRequestReason('');
    setSelectedSalaryTripIds([]);
    setNeededByDate(null);
    setSalaryRequestDate(null);
    setSalaryRequestType('advance');
    setSalaryRequestOrg(null);
    setSalaryRequestSubmitting(false);
    setShowSalaryMonthDropdown(false);
    setShowRequestTypeMenu(false);
    setShowNeededByPicker(false);
    setShowTripsDropdown(false);
  }, []);

  const pathname = usePathname();
  const segments = useSegments();
  const routeFingerprint = `${pathname ?? ''}|${(segments ?? []).join('/')}`;
  const routeFingerprintPrevRef = useRef<string>('');

  /**
   * Hidden tab + web: `useFocusEffect` often does not run when switching tabs, so success/form
   * state stayed mounted. Reset when route fingerprint shows we *entered* salary-request from
   * another screen (pathname + segments covers Expo Router web + native).
   */
  useEffect(() => {
    const current = routeFingerprint;
    const prev = routeFingerprintPrevRef.current;
    const onSalary = current.includes('salary-request');
    const wasOnSalary = prev.length > 0 && prev.includes('salary-request');
    if (onSalary && !wasOnSalary) {
      resetSalaryRequestScreen();
    }
    routeFingerprintPrevRef.current = current;
  }, [routeFingerprint, resetSalaryRequestScreen]);

  /** Native tab focus (when it fires); pathname effect is the reliable fix for hidden tabs + web. */
  useFocusEffect(
    useCallback(() => {
      resetSalaryRequestScreen();
    }, [resetSalaryRequestScreen])
  );

  useEffect(() => {
    const interval = setInterval(() => setBlink((prev) => !prev), 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!salaryRequestType) setSalaryRequestType('advance');
  }, [salaryRequestType]);

  const openNeededByAndroid = useCallback(() => {
    const value = neededByDate ?? new Date();
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      display: 'calendar',
      onChange: (e, date) => {
        if (e.type === 'set' && date) setNeededByDate(date);
      },
    });
  }, [neededByDate]);

  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    // An accepted invite is ONE way to earn a salary relationship, not the only
    // one. Phone-assignment drivers never get an invite row yet run real trips,
    // and the Wallet / trip-detail claim paths already let them request payment.
    // Requiring an invite here blocked 17 of 25 active drivers.
    const options = linkedDrivers
      .filter(driversService.isSalaryEligibleDriver)
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || '')
        );
        const rawName =
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).from_org_name) ||
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).fromOrgName) ||
          null;
        const logoUrl = (inv && (inv as { from_org_logo_url?: string | null }).from_org_logo_url) || null;
        const ownerSeed = (inv && (inv as { from_org_avatar_seed?: string | null }).from_org_avatar_seed) || null;
        const ownerUrl = (inv && (inv as { from_org_avatar_url?: string | null }).from_org_avatar_url) || null;
        const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : null;
        return {
          driverId: d.id,
          orgId: String(d.organization_id ?? ''),
          orgName: name || 'Fleet',
          logoUrl,
          ownerSeed,
          ownerUrl,
        };
      });
    if (options.length <= 1) return options;

    // Multi-fleet driver: pick the single effective employer. Each tier below is
    // real evidence of a salary relationship; an accepted invite is no longer a
    // precondition, otherwise an invite-less driver falls past every tier to an
    // arbitrary options[0] and could bill the WRONG fleet.
    const hasPayTerms = (orgId: string) => {
      const row = linkedDrivers.find((d) => String(d.organization_id ?? '') === String(orgId));
      if (!row) return false;
      return (
        (row.payable_amount != null && Number(row.payable_amount) > 0) ||
        (row.commission_percent != null && Number(row.commission_percent) > 0) ||
        (row.commission_per_km != null && Number(row.commission_per_km) > 0)
      );
    };

    // Tier 1 — agreed pay terms on the driver row. Strongest signal.
    const withPay = options.find((opt) => hasPayTerms(opt.orgId));
    if (withPay) return [withPay];

    const monthlySalaryOrgIds = new Set(
      salaryRequests
        .filter((r) => r.request_type === 'monthly')
        .map((r) => String(r.organization_id ?? ''))
        .filter(Boolean),
    );
    // Tier 2 — prior monthly salary history with that fleet.
    const withMonthly = options.find((opt) => monthlySalaryOrgIds.has(String(opt.orgId)));
    if (withMonthly) return [withMonthly];

    const anySalaryOrgIds = new Set(
      salaryRequests
        .map((r) => String(r.organization_id ?? ''))
        .filter(Boolean),
    );
    // Tier 3 — any prior request of any type with that fleet.
    const withAnySalary = options.find((opt) => anySalaryOrgIds.has(String(opt.orgId)));
    if (withAnySalary) return [withAnySalary];

    // Tier 4 — most recent accepted invite, when one exists.
    const acceptedSorted = [...accepted].sort(
      (a, b) =>
        new Date(b.responded_at ?? b.created_at).getTime() -
        new Date(a.responded_at ?? a.created_at).getTime(),
    );
    for (const inv of acceptedSorted) {
      const orgId = String(inv.from_organization_id ?? '');
      const match = options.find((opt) => String(opt.orgId) === orgId);
      if (match) return [match];
    }

    // No evidence distinguishes the fleets. Return ALL of them so the driver
    // chooses explicitly — silently defaulting to options[0] risks billing the
    // wrong fleet, which is worse than asking.
    return options;
  }, [linkedDrivers, invites, salaryRequests]);

  const effectiveSalaryOrg = salaryRequestOrg ?? (salaryRequestOrgOptions.length === 1 ? salaryRequestOrgOptions[0] : null);

  const salaryOrgBrandingIds = useMemo(
    () => salaryRequestOrgOptions.map((o) => String(o.orgId ?? '').trim()).filter(Boolean),
    [salaryRequestOrgOptions],
  );
  const orgBrandingById = useOrgBrandingByIds(salaryOrgBrandingIds);

  const fleetHeroAvatarUri = useMemo(() => {
    if (!effectiveSalaryOrg) return '';
    const orgId = String(effectiveSalaryOrg.orgId ?? '');
    return resolveDriverOrgAvatarUri({
      orgId,
      orgName: effectiveSalaryOrg.orgName,
      branding: orgBrandingById[orgId],
      logoUrl: effectiveSalaryOrg.logoUrl,
      avatarSeed: effectiveSalaryOrg.ownerSeed,
      avatarUrl: effectiveSalaryOrg.ownerUrl,
    });
  }, [effectiveSalaryOrg, orgBrandingById]);

  const premiumCardBorder = isDark ? colors.emeraldBorder : 'rgba(16, 185, 129, 0.14)';

  const completedTrips = useMemo(() => {
    const list = trips.filter((t) => tripsService.isTripCompleted(t));
    return [...list].sort((a, b) => {
      const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
      const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
      return db - da;
    });
  }, [trips]);
  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(trips),
    [trips],
  );

  const receivedByTripId = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const e of ledgerEntries) {
      const amt = Number(e.amount) || 0;
      const tid = e.trip_id?.trim() || null;
      if (tid) byTrip[tid] = (byTrip[tid] ?? 0) + amt;
    }
    return byTrip;
  }, [ledgerEntries]);

  const pendingTripsForSalaryOrg = useMemo(() => {
    if (!effectiveSalaryOrg) return [];
    return completedTrips.filter(
      (t) =>
        t.driver_id === effectiveSalaryOrg.driverId &&
        (receivedByTripId[t.id] ?? 0) === 0 &&
        // A trip with no agreed commission/salary terms has nothing real to
        // request — excluded here (not just hidden) so the legacy 10% guess
        // can't become the basis of an actual salary claim.
        !tripEarningsDetailForDriver(t).isEstimated,
    );
  }, [effectiveSalaryOrg, completedTrips, receivedByTripId]);

  const pendingTotalForSalaryOrg = useMemo(
    () => Math.round(pendingTripsForSalaryOrg.reduce((s, t) => s + tripEarnings(t), 0)),
    [pendingTripsForSalaryOrg]
  );

  const selectedTripTotal = useMemo(() => {
    if (selectedSalaryTripIds.length === 0) return 0;
    return Math.round(
      pendingTripsForSalaryOrg
        .filter((t) => selectedSalaryTripIds.includes(t.id))
        .reduce((s, t) => s + tripEarnings(t), 0)
    );
  }, [pendingTripsForSalaryOrg, selectedSalaryTripIds]);

  const defaultSalaryRequestDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  }, []);

  const salaryCurrentYear = new Date().getFullYear();

  useEffect(() => {
    if (salaryRequestOrgOptions.length === 1) {
      setSalaryRequestOrg(salaryRequestOrgOptions[0]);
    } else {
      setSalaryRequestOrg(null);
    }
  }, [salaryRequestOrgOptions]);

  /** Sync amount field when user selects/deselects trips (trip commission only). */
  useEffect(() => {
    if (salaryRequestType === 'trip_based') {
      setSalaryRequestAmount(selectedSalaryTripIds.length > 0 ? String(selectedTripTotal) : '');
    }
  }, [salaryRequestType, selectedSalaryTripIds, selectedTripTotal]);

  /**
   * Trip commission: set "Needed by" from selected trip dates (completion / updated / created).
   * Uses the latest date among selected trips so multi-select stays coherent. Clears when none selected.
   */
  useEffect(() => {
    if (salaryRequestType !== 'trip_based') return;
    if (selectedSalaryTripIds.length === 0) {
      setNeededByDate(null);
      return;
    }
    const selected = pendingTripsForSalaryOrg.filter((t) => selectedSalaryTripIds.includes(t.id));
    if (selected.length === 0) return;
    let maxTs = 0;
    for (const t of selected) {
      const raw = t.completed_at ?? t.updated_at ?? t.created_at;
      if (!raw) continue;
      const ts = new Date(raw).getTime();
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
    }
    if (maxTs <= 0) return;
    const d = new Date(maxTs);
    setNeededByDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }, [salaryRequestType, selectedSalaryTripIds, pendingTripsForSalaryOrg]);

  useEffect(() => {
    if (salaryRequestType !== 'trip_based') {
      setSelectedSalaryTripIds([]);
      setShowTripsDropdown(false);
    }
  }, [salaryRequestType]);

  useEffect(() => {
    if (salaryRequestType === 'monthly') {
      const y = salaryCurrentYear;
      const base = salaryRequestDate ?? defaultSalaryRequestDate;
      if (!salaryRequestDate) setSalaryRequestDate(new Date(y, base.getMonth(), 1));
      else if (salaryRequestDate.getFullYear() !== y || salaryRequestDate.getDate() !== 1) {
        setSalaryRequestDate(new Date(y, salaryRequestDate.getMonth(), 1));
      }
      setShowSalaryMonthDropdown(false);
    }
  }, [salaryRequestType, salaryRequestDate, defaultSalaryRequestDate, salaryCurrentYear]);

  const toggleSalaryTripSelection = useCallback((tripId: string) => {
    setSelectedSalaryTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  }, []);

  const _handleAmountKeyPress = useCallback((key: string) => {
    if (salaryRequestType === 'trip_based') return;
    if (key === '.') return;
    if (key === 'delete') {
      setSalaryRequestAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    setSalaryRequestAmount((prev) => {
      const current = prev.replace(/[^0-9]/g, '') || '0';
      if (current === '0') return key;
      if (current.length >= 9) return current;
      return `${current}${key}`;
    });
  }, [salaryRequestType]);

  const _selectAllSalaryTrips = useCallback(() => {
    setSelectedSalaryTripIds(pendingTripsForSalaryOrg.map((t) => t.id));
    setSalaryRequestAmount(String(pendingTotalForSalaryOrg));
  }, [pendingTripsForSalaryOrg, pendingTotalForSalaryOrg]);

  const deselectAllSalaryTrips = useCallback(() => {
    setSelectedSalaryTripIds([]);
    setSalaryRequestAmount('');
  }, []);

  const _saveDraft = useCallback(async () => {
    const payload = {
      version: 1,
      requestType: salaryRequestType,
      amount: salaryRequestAmount,
      neededBy: neededByDate ? neededByDate.toISOString() : null,
      reason: salaryRequestReason,
      updatedAt: new Date().toISOString(),
    };
    try {
      await AsyncStorage.setItem(SALARY_REQUEST_DRAFT_KEY, JSON.stringify(payload));
      showAppAlert('Saved', 'Draft saved on this device.');
    } catch {
      showAppAlert('Error', 'Could not save draft.');
    }
  }, [salaryRequestType, salaryRequestAmount, neededByDate, salaryRequestReason]);

  const submitSalaryRequest = useCallback(async () => {
    if (salaryRequestSubmitting) return;
    if (!isOnline) {
      showAppAlert('Offline', 'You are offline. Save as draft and submit when connected.');
      return;
    }
    const org = salaryRequestOrg ?? (salaryRequestOrgOptions.length === 1 ? salaryRequestOrgOptions[0] : null);
    if (!org) {
      if (salaryRequestOrgOptions.length === 0) {
        showAppAlert(
          'No fleet linked',
          'Your account is not linked to a fleet that can accept payment requests. Ask your fleet to add you, then try again.',
        );
      } else {
        showAppAlert('Select fleet', 'Choose which fleet to request salary from.');
      }
      return;
    }
    if (!salaryRequestType) {
      showAppAlert('Select type', 'Choose Monthly salary, Advance, or Trip-based.');
      return;
    }
    if (salaryRequestType === 'advance' && !neededByDate) {
      showAppAlert('Needed by date', 'Select when you need the advance by.');
      return;
    }
    if (salaryRequestType === 'trip_based' && selectedSalaryTripIds.length === 0) {
      showAppAlert('Select trips', 'Select at least one trip to be paid.');
      return;
    }
    const amount = parseRupeeAmountInput(salaryRequestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showAppAlert('Enter amount', 'Enter a valid amount in ₹.');
      return;
    }
    if (amount > VALIDATION.AMOUNT_MAX) {
      showAppAlert(
        'Amount too large',
        `Amount cannot exceed ₹${VALIDATION.AMOUNT_MAX.toLocaleString('en-IN')}.`,
      );
      return;
    }
    const trimmedReason = salaryRequestReason.trim();
    if (trimmedReason.length > VALIDATION.NOTES_MAX_LENGTH) {
      showAppAlert(
        'Reason too long',
        `Reason must be at most ${VALIDATION.NOTES_MAX_LENGTH} characters.`,
      );
      return;
    }
    // No additional notes / attachments in the 2-widget driver form.

    const monthForDb =
      salaryRequestType === 'monthly'
        ? toISODate(
            new Date(
              (salaryRequestDate ?? defaultSalaryRequestDate).getFullYear(),
              (salaryRequestDate ?? defaultSalaryRequestDate).getMonth(),
              1
            )
          )
        : undefined;

    if (salaryRequestType === 'monthly' && monthForDb) {
      // One salary request per fleet per month: a second one gets paid twice.
      const sameMonth = salaryRequests.find(
        (r) =>
          r.request_type === 'monthly' &&
          String(r.organization_id) === String(org.orgId) &&
          (r.salary_month ?? '').slice(0, 7) === monthForDb.slice(0, 7) &&
          (r.status === 'pending' || r.status === 'approved' || r.status === 'paid'),
      );
      if (sameMonth) {
        showAppAlert(
          sameMonth.status === 'paid' ? 'Salary already paid' : 'Already requested',
          sameMonth.status === 'paid'
            ? `Your salary for this month was already paid by ${org.orgName}.`
            : `You already have a salary request for this month with ${org.orgName}. Wait for the fleet to pay or reject it.`,
        );
        return;
      }
    }

    setSalaryRequestSubmitting(true);
    const { error, request } = await salaryRequestsService.createSalaryRequest(
      org.driverId,
      org.orgId,
      salaryRequestType,
      amount,
      {
        note: trimmedReason ? trimmedReason.slice(0, VALIDATION.NOTES_MAX_LENGTH) : null,
        createdBy: profile?.uid ?? null,
        tripIds: salaryRequestType === 'trip_based' && selectedSalaryTripIds.length > 0 ? selectedSalaryTripIds : undefined,
        salaryMonth: monthForDb,
      }
    );
    setSalaryRequestSubmitting(false);
    if (error) {
      showAppAlert('Request failed', error.message);
      return;
    }
    if (!request) {
      showAppAlert('Request failed', 'Could not load request details. Check your connection and try again.');
      return;
    }
    setSuccessPayload({ orgName: org.orgName, request });
    setIsSuccess(true);
    load();
  }, [
    salaryRequestSubmitting,
    salaryRequests,
    isOnline,
    salaryRequestOrg,
    salaryRequestOrgOptions,
    salaryRequestType,
    salaryRequestAmount,
    salaryRequestReason,
    salaryRequestDate,
    defaultSalaryRequestDate,
    selectedSalaryTripIds,
    neededByDate,
    profile?.uid,
    load,
  ]);

  const goBack = useCallback(() => {
    if (widgetPage === 1) {
      setWidgetPage(0);
      return;
    }
    if (isSuccess) {
      setIsSuccess(false);
      setSuccessPayload(null);
      setSuccessCopiedId(false);
      setSuccessSummaryExpanded(true);
      setSalaryRequestAmount('');
    }
    router.back();
  }, [widgetPage, isSuccess, router]);

  const copySuccessRequestId = useCallback(async () => {
    const id = successPayload?.request?.id;
    if (!id) return;
    try {
      await Clipboard.setStringAsync(id);
      setSuccessCopiedId(true);
      setTimeout(() => setSuccessCopiedId(false), 2000);
    } catch {
      showAppAlert('Copy failed', 'Could not copy to clipboard.');
    }
  }, [successPayload]);

  const shareSalaryRequestSuccess = useCallback(async () => {
    if (!successPayload?.request) return;
    const req = successPayload.request;
    const org = successPayload.orgName;
    const amount = Number(req.amount);
    const refDisplay = formatRequestRefDisplay(req.id);
    const message = [
      `Salary request — ${org}`,
      `Amount: ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `Reference: ${refDisplay}`,
      `ID: ${req.id}`,
    ].join('\n');
    try {
      await Share.share({ message });
    } catch {
      /* dismissed */
    }
  }, [successPayload]);

  const paymentModeLabel = useCallback((t: salaryRequestsService.SalaryRequestType | string) => {
    if (t === 'trip_based') return 'Trip-Based Settlement';
    if (t === 'monthly') return 'Monthly Salary';
    if (t === 'advance') return 'Advance Payment';
    return String(t);
  }, []);

  // —— Success state (premium full-screen confirmation; data from DB row) ——
  if (isSuccess && successPayload) {
    const req = successPayload.request;
    const orgName = successPayload.orgName;
    const amountDisplay = Number(req.amount);
    const reqType = req.request_type as salaryRequestsService.SalaryRequestType;
    const tripIds = Array.isArray(req.trip_ids) ? req.trip_ids : [];
    const submittedAt = new Date(req.created_at);
    const submittedLabel = Number.isFinite(submittedAt.getTime())
      ? submittedAt.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '—';
    let salaryPeriodLabel: string | null = null;
    if (reqType === 'monthly' && req.salary_month) {
      const sm = new Date(req.salary_month);
      salaryPeriodLabel = Number.isFinite(sm.getTime())
        ? sm.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        : null;
    }

    const amountFormatted = amountDisplay.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const refDisplay = formatRequestRefDisplay(req.id);
    /** Driver app emerald — same as tabs, CTAs, and `colors.emerald` */
    const heroGreen = colors.emerald;

    return (
      <View style={[styles.successRoot, { backgroundColor: heroGreen }]}>
        <View
          style={[
            styles.successTopBar,
            {
              paddingTop: insets.top + 8,
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
            },
          ]}
        >
          <TouchableOpacity
            onPress={goBack}
            style={styles.successIconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={22} color={Theme.textOnPrimary} strokeWidth={2.4} />
          </TouchableOpacity>
          <View style={styles.successStatusChip}>
            <Clock size={13} color="rgba(167,243,208,0.95)" strokeWidth={2.5} />
            <Text style={styles.successStatusChipText}>Pending approval</Text>
          </View>
          <TouchableOpacity
            onPress={shareSalaryRequestSuccess}
            style={styles.successIconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Share request details"
            accessibilityRole="button"
          >
            <Share2 size={20} color={Theme.textOnPrimary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <View style={styles.successHero}>
          <View style={styles.successSendCircleOuter}>
            <Send size={44} color={heroGreen} strokeWidth={2.4} style={{ marginLeft: 3 }} />
          </View>
          <Text style={styles.successHeroEyebrow}>Request sent successfully</Text>
          <View style={styles.successAmountRow}>
            <Text style={styles.successRupee}>₹</Text>
            <Text style={styles.successAmountDigits} numberOfLines={1} adjustsFontSizeToFit>
              {amountFormatted}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.successSheet,
            {
              backgroundColor: Theme.screenBackground,
              paddingBottom: tabBarClearance + 20,
              shadowColor: Theme.shadow,
            },
          ]}
        >
          <View style={styles.successSheetHandle} />

          <ScrollView
            style={styles.successSheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.successSheetScrollContent}
          >
            <View style={styles.successPayeeRow}>
              <View style={[styles.successPayeeIcon, { backgroundColor: colors.emeraldMuted }]}>
                <Building2 size={26} color={colors.emerald} strokeWidth={2.2} />
              </View>
              <View style={styles.successPayeeTextCol}>
                <Text style={[styles.successCapsLabel, { color: colors.textMuted }]}>Payee organization</Text>
                <Text style={[styles.successPayeeName, { color: colors.text }]} numberOfLines={3}>
                  {orgName}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setSuccessSummaryExpanded((v) => !v)}
              style={({ pressed }) => [
                styles.successAccordionHead,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: successSummaryExpanded }}
            >
              <View style={styles.successAccordionHeadLeft}>
                <ReceiptText size={20} color={colors.emerald} strokeWidth={2.2} />
                <Text style={[styles.successAccordionTitle, { color: colors.text }]}>Request summary</Text>
              </View>
              <View
                style={{
                  transform: [{ rotate: successSummaryExpanded ? '180deg' : '0deg' }],
                }}
              >
                <ChevronDown size={22} color={colors.textMuted} strokeWidth={2.2} />
              </View>
            </Pressable>

            {successSummaryExpanded ? (
              <View style={[styles.successDetailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.successSummaryRow}>
                  <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Reference ID</Text>
                  <Pressable
                    onPress={copySuccessRequestId}
                    style={({ pressed }) => [
                      styles.successCopyPill,
                      {
                        backgroundColor: Theme.screenBackground,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Copy full reference ID"
                  >
                    <Text style={[styles.successCopyMono, { color: colors.text }]} numberOfLines={1}>
                      {refDisplay}
                    </Text>
                    <FontAwesome name={successCopiedId ? 'check' : 'copy'} size={12} color={colors.emerald} />
                  </Pressable>
                </View>

                <View style={styles.successSummaryRow}>
                  <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Request date</Text>
                  <Text style={[styles.successSummaryValue, { color: colors.text }]}>{submittedLabel}</Text>
                </View>

                <View style={styles.successSummaryRow}>
                  <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Payment mode</Text>
                  <Text style={[styles.successSummaryValue, { color: colors.text }]}>{paymentModeLabel(reqType)}</Text>
                </View>

                {reqType === 'trip_based' && tripIds.length > 0 ? (
                  <View style={styles.successSummaryRow}>
                    <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Trips</Text>
                    <Text style={[styles.successSummaryValue, { color: colors.text }]}>
                      {tripIds.length} selected
                    </Text>
                  </View>
                ) : null}

                {salaryPeriodLabel ? (
                  <View style={styles.successSummaryRow}>
                    <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Salary period</Text>
                    <Text style={[styles.successSummaryValue, { color: colors.text }]}>{salaryPeriodLabel}</Text>
                  </View>
                ) : null}

                <View style={[styles.successSummaryRow, styles.successSummaryRowLast]}>
                  <Text style={[styles.successSummaryLabel, { color: colors.textMuted }]}>Request status</Text>
                  <View style={[styles.successStatusPill, { backgroundColor: Theme.warningMuted, borderColor: 'rgba(180, 83, 9, 0.22)' }]}>
                    <View style={[styles.successStatusDot, { backgroundColor: Theme.warning }]} />
                    <Text style={[styles.successStatusText, { color: Theme.warning }]}>Awaiting approval</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.successDoneBtn, { backgroundColor: colors.emerald }]}
              onPress={goBack}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.successDoneBtnText}>Done</Text>
            </TouchableOpacity>

            <View style={styles.successFooterTrust}>
              <View style={styles.successFooterTrustRow}>
                <ShieldCheck size={12} color={colors.textMuted} strokeWidth={2.4} />
                <Text style={[styles.successFooterTrustCaps, { color: colors.textMuted }]}>Secure banking protocol</Text>
              </View>
              <Text style={[styles.successFooterFine, { color: colors.textMuted }]}>
                Encrypted in transit. You’ll be notified when your fleet acts on this request.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.emerald} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  // —— Main form ——
  const contentPadding = Layout.screenPaddingHorizontal;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Header — clean MNC-style */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Layout.driverHeaderTopOffset,
              paddingLeft: Math.max(insets.left, Layout.driverHeaderHorizontalPadding),
              paddingRight: Math.max(insets.right, Layout.driverHeaderHorizontalPadding),
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
              zIndex: 20,
              elevation: 20,
            },
          ]}
        >
          <View style={styles.headerSide}>
            <TouchableOpacity
              onPress={goBack}
              style={[styles.backBtn, { backgroundColor: colors.surface }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <FontAwesome name="chevron-left" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, styles.headerTitlePremium, { color: colors.text }]}>Salary request</Text>
          </View>
          <View style={[styles.headerSide, styles.headerSideAlignEnd]}>
            <View style={{ position: 'relative' }}>
              <DriverSelfAvatar
                size={36}
                uri={headerAvatarUri}
                seed={avatarSeed}
                borderColor={colors.emerald}
              />
              {avatarUriLoading && Boolean(profile?.avatar_url?.trim()) && !headerAvatarFailed ? (
                <View style={[styles.headerAvatarLoading, { backgroundColor: colors.surface }]}>
                  <ActivityIndicator size="small" color={colors.emerald} />
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {!isOnline ? (
          <View style={[styles.offlineBanner, { backgroundColor: Theme.negativeMuted, borderBottomColor: colors.border }]}>
            <FontAwesome name="cloud" size={12} color={Theme.negative} />
            <Text style={[styles.offlineBannerText, { color: Theme.negative }]}>
              Offline Mode — Changes will sync when connected
            </Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom:
              widgetPage === 1 ? tabBarClearance + 120 : tabBarClearance + 140,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.canvas}>
          {salaryRequestOrgOptions.length === 0 ? (
            <View style={[styles.emptyStateWrap, { paddingHorizontal: contentPadding }]}>
              <View style={[styles.emptyStateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.emptyStateIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                  <FontAwesome name="building-o" size={32} color={colors.emerald} />
                </View>
                <Text style={[styles.emptyStateTitle, { color: colors.text }]}>Connect a fleet first</Text>
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  Go to Dashboard to accept a fleet invite. Then you can request salary here.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyStateButton, { backgroundColor: colors.emerald }]}
                  onPress={() => router.push('/(driver)')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyStateButtonText}>Go to Dashboard</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Fleet picker: only when multiple fleets (single fleet uses hero below — avoids duplicate avatar + name). */}
              {salaryRequestOrgOptions.length > 1 ? (
                <View style={[styles.section, styles.fleetProfilesSection, { borderBottomColor: colors.border }]}>
                  <View style={[styles.fleetProfilesRow, { paddingHorizontal: contentPadding }]}>
                    {salaryRequestOrgOptions.map((opt) => {
                      const active = effectiveSalaryOrg?.orgId === opt.orgId;
                      return (
                        <TouchableOpacity
                          key={opt.orgId}
                          style={styles.fleetProfileChip}
                          onPress={() => setSalaryRequestOrg(opt)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.fleetAvatarRing, { borderColor: active ? colors.emerald : 'transparent' }]}>
                            <Image
                              source={{
                                uri: resolveDriverOrgAvatarUri({
                                  orgId: opt.orgId,
                                  orgName: opt.orgName,
                                  branding: orgBrandingById[String(opt.orgId ?? '')],
                                  logoUrl: opt.logoUrl,
                                  avatarSeed: opt.ownerSeed,
                                  avatarUrl: opt.ownerUrl,
                                }),
                              }}
                              style={styles.fleetAvatar}
                              resizeMode="cover"
                            />
                          </View>
                          <Text style={[styles.fleetProfileName, { color: active ? colors.emerald : colors.text }]} numberOfLines={2}>
                            {opt.orgName}
                          </Text>
                          {active ? <View style={[styles.fleetProfileUnderline, { backgroundColor: colors.emerald }]} /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {effectiveSalaryOrg ? (
                <View
                  style={[
                    styles.fleetHeroSection,
                    salaryRequestOrgOptions.length > 1 && styles.fleetHeroSectionAfterChips,
                    { paddingHorizontal: contentPadding },
                  ]}
                >
                  <View style={styles.fleetHeroAlign}>
                    {salaryRequestOrgOptions.length === 1 ? (
                      <>
                        <View
                          style={[
                            styles.fleetHeroAvatarOuter,
                            {
                              borderColor: colors.emerald,
                              backgroundColor: colors.surface,
                              shadowColor: isDark ? '#000' : 'rgba(16, 185, 129, 0.35)',
                            },
                          ]}
                        >
                          <Image source={{ uri: fleetHeroAvatarUri }} style={styles.fleetHeroAvatarImg} resizeMode="cover" />
                        </View>
                        <Text
                          style={[
                            styles.fleetHeroOrgName,
                            {
                              color: Theme.driverEmeraldDark,
                              textDecorationColor: 'rgba(16, 185, 129, 0.35)',
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {effectiveSalaryOrg.orgName}
                        </Text>
                      </>
                    ) : null}
                    <Text style={[styles.fleetHeroBlurb, { color: colors.textMuted }]}>
                      Fill the form below to request salary from{' '}
                      <Text style={[styles.fleetHeroBlurbAccent, { color: colors.text }]}>{effectiveSalaryOrg.orgName}</Text>.
                    </Text>
                  </View>
                </View>
              ) : salaryRequestOrgOptions.length > 1 ? (
                <View style={[styles.section, { paddingHorizontal: contentPadding, marginBottom: 8 }]}>
                  <Text style={[styles.fleetSelectHint, { color: colors.textMuted }]}>
                    Select a fleet above to continue.
                  </Text>
                </View>
              ) : null}

              {/* 2-widget flow replaces the continuous form */}

              {/* Widget Page 1: Details */}
              {widgetPage === 0 ? (
                <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                  <View
                    style={[
                      styles.widgetCard,
                      styles.premiumDetailCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: premiumCardBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.widgetTitlePremium, { color: colors.text }]}>Details</Text>
                    <Text style={[styles.widgetSubtitlePremium, { color: colors.textMuted }]}>
                      Choose request type and amount.
                    </Text>

                    <View style={styles.premiumFormGap}>
                      <View style={styles.formCol}>
                        <Text style={[styles.fieldLabelCaps, { color: colors.textMuted }]}>Request type</Text>
                        <TouchableOpacity
                          style={[styles.inputShellPremium, { borderColor: colors.borderSubtle, backgroundColor: colors.inputBg }]}
                          onPress={() => setShowRequestTypeMenu(true)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.inputText, { color: colors.text }]}>
                            {REQUEST_TYPES.find((t) => t.type === salaryRequestType)?.label ?? 'Select'}
                          </Text>
                          <ChevronDown size={15} color={colors.textMuted} strokeWidth={2.2} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.formCol}>
                        <SmartInput
                          type="currency"
                          label="Amount"
                          value={salaryRequestAmount}
                          onChange={(raw) => setSalaryRequestAmount(raw)}
                          variant="field"
                          disabled={salaryRequestSubmitting || salaryRequestType === 'trip_based'}
                          placeholder={salaryRequestType === 'trip_based' ? 'Auto-calculated' : '0.00'}
                        />
                        {salaryRequestType === 'trip_based' ? (
                          <Text style={[styles.hint, { color: colors.textMuted, marginTop: 6 }]}>
                            Amount is auto-calculated from selected trips.
                          </Text>
                        ) : null}
                      </View>

                      {salaryRequestType === 'trip_based' ? (
                        <View style={{ marginTop: 4 }}>
                          <Text style={[styles.fieldLabelCaps, { color: colors.textMuted }]}>Trips to be paid</Text>
                          <TouchableOpacity
                            style={[styles.inputShellPremium, { borderColor: colors.borderSubtle, backgroundColor: colors.inputBg }]}
                            onPress={() => setShowTripsDropdown(true)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.inputText, { color: selectedSalaryTripIds.length ? colors.text : colors.placeholder }]}>
                              {selectedSalaryTripIds.length
                                ? `Selected: ${selectedSalaryTripIds.length} trip${selectedSalaryTripIds.length === 1 ? '' : 's'}`
                                : 'Select trips'}
                            </Text>
                            <ChevronDown size={15} color={colors.textMuted} strokeWidth={2.2} />
                          </TouchableOpacity>
                          {effectiveSalaryOrg ? (
                            <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>
                              Pending trips for {effectiveSalaryOrg.orgName}: {pendingTripsForSalaryOrg.length}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.fieldLabelCaps, { color: colors.textMuted }]}>Needed by</Text>
                        <TouchableOpacity
                          style={[styles.inputShellPremium, { borderColor: colors.borderSubtle, backgroundColor: colors.inputBg }]}
                          onPress={() => {
                            if (Platform.OS === 'android') openNeededByAndroid();
                            else setShowNeededByPicker(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.inputText, { color: neededByDate ? colors.text : colors.placeholder }]}>
                            {neededByDate ? neededByDate.toLocaleDateString('en-IN') : 'dd/mm/yyyy'}
                          </Text>
                          <CalendarDays size={15} color={colors.textMuted} strokeWidth={2} />
                        </TouchableOpacity>
                        {salaryRequestType === 'trip_based' ? (
                          <Text style={[styles.hint, { color: colors.textMuted, marginTop: 10 }]}>
                            Auto-filled from your selected trip date(s). Tap to change if needed.
                          </Text>
                        ) : salaryRequestType === 'monthly' ? (
                          <Text style={[styles.hint, { color: colors.textMuted, marginTop: 10 }]}>
                            Needed by is required only for Advance requests.
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Widget Page 2: Reason + Rules + Credit */}
              {widgetPage === 1 ? (
                <>
                  <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                    <View
                      style={[
                        styles.widgetCard,
                        styles.premiumDetailCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: premiumCardBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.reviewEyebrow, { color: colors.emerald }]}>Review</Text>
                      <View style={styles.reasonHeaderRow}>
                        <Text style={[styles.fieldLabelCaps, { color: colors.textMuted, marginBottom: 0 }]}>Reason for request</Text>
                        <Text style={[styles.reasonCounter, { color: colors.textMuted }]}>
                          {salaryRequestReason.length} / {reasonMax}
                        </Text>
                      </View>
                      <View
                        style={[styles.multilineShell, styles.multilinePremium, { borderColor: colors.borderSubtle, backgroundColor: colors.inputBg }]}
                      >
                        <TextInput
                          style={[styles.reasonInput, { color: colors.text }]}
                          placeholder="Explain the context of this request..."
                          placeholderTextColor={colors.placeholder}
                          value={salaryRequestReason}
                          onChangeText={(t) => setSalaryRequestReason(t.slice(0, reasonMax))}
                          multiline
                          numberOfLines={4}
                          editable={!salaryRequestSubmitting}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                    <View
                      style={[
                        styles.rulesCardV2,
                        styles.premiumDetailCard,
                        { backgroundColor: colors.surface, borderColor: premiumCardBorder },
                      ]}
                    >
                      <View style={styles.rulesHeaderV2}>
                        <View style={[styles.rulesShieldWrap, { backgroundColor: colors.emeraldMuted }]}>
                          <ShieldCheck size={16} color={colors.emerald} strokeWidth={2.2} />
                        </View>
                        <Text style={[styles.rulesTitleV2, { color: colors.text }]}>Submission rules</Text>
                      </View>

                      <View style={styles.rulesItemsV2}>
                        <View style={styles.rulesItemV2}>
                          <FontAwesome name="check-circle" size={14} color={Theme.positive} />
                          <Text style={[styles.rulesItemTextV2, { color: colors.textMuted }]}>
                            Advance requests limited to 40% of monthly base salary.
                          </Text>
                        </View>
                        <View style={styles.rulesItemV2}>
                          <FontAwesome name="check-circle" size={14} color={Theme.positive} />
                          <Text style={[styles.rulesItemTextV2, { color: colors.textMuted }]}>
                            Approvals typically processed within 48 business hours.
                          </Text>
                        </View>
                        <View style={styles.rulesItemV2}>
                          <FontAwesome name="check-circle" size={14} color={Theme.positive} />
                          <Text style={[styles.rulesItemTextV2, { color: colors.textMuted }]}>
                            Attachments required for all reimbursement claims.
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Available credit removed */}
                </>
              ) : null}

              {/* (Removed duplicated legacy sections: rules + credit are already in Widget Page 2) */}
            </>
          )}
          </View>
        </ScrollView>

        {/* Request type modal */}
        <Modal
          transparent
          visible={showRequestTypeMenu}
          animationType="fade"
          onRequestClose={() => setShowRequestTypeMenu(false)}
        >
          <View style={[styles.modalScreenRoot, Platform.OS === 'web' && styles.modalScreenRootWeb]}>
            <Pressable
              style={styles.modalScreenBackdrop}
              onPress={() => setShowRequestTypeMenu(false)}
              accessibilityLabel="Close"
            />
            <View pointerEvents="box-none" style={styles.modalScreenCenter}>
              <View
                style={[styles.monthModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.monthModalTitle, { color: colors.text }]}>Request type</Text>
                <ScrollView style={styles.monthModalList} keyboardShouldPersistTaps="handled">
                  {REQUEST_TYPES.map(({ type, label, hint }, idx) => {
                    const selected = salaryRequestType === type;
                    const isLast = idx === REQUEST_TYPES.length - 1;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.monthModalRow,
                          { borderBottomColor: colors.border },
                          isLast && styles.monthDropdownRowLast,
                          selected && { backgroundColor: colors.emeraldMuted },
                        ]}
                        onPress={() => {
                          setSalaryRequestType(type);
                          setShowRequestTypeMenu(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                          <Text style={[styles.monthModalRowText, { color: selected ? colors.emerald : colors.text }]}>{label}</Text>
                          <Text style={[styles.hint, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                            {hint}
                          </Text>
                        </View>
                        {selected ? <FontAwesome name="check" size={16} color={colors.emerald} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>

        {/* Trips dropdown modal (Trip commission) */}
        <Modal
          transparent
          visible={showTripsDropdown}
          animationType="fade"
          onRequestClose={() => setShowTripsDropdown(false)}
        >
          <View style={[styles.modalScreenRoot, Platform.OS === 'web' && styles.modalScreenRootWeb]}>
            <Pressable
              style={styles.modalScreenBackdrop}
              onPress={() => setShowTripsDropdown(false)}
              accessibilityLabel="Close"
            />
            <View pointerEvents="box-none" style={styles.modalScreenCenter}>
              <View
                style={[styles.monthModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.tripsModalHeader}>
                  <Text style={[styles.monthModalTitle, { color: colors.text }]}>Select trips</Text>
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {selectedSalaryTripIds.length} selected
                  </Text>
                </View>
                {!effectiveSalaryOrg ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      Select a fleet above to see pending trips.
                    </Text>
                  </View>
                ) : pendingTripsForSalaryOrg.length === 0 ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      No pending trips for {effectiveSalaryOrg.orgName}.
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={styles.monthModalList} keyboardShouldPersistTaps="handled">
                    {pendingTripsForSalaryOrg.map((t, idx) => {
                      const isSelected = selectedSalaryTripIds.includes(t.id);
                      const isLast = idx === pendingTripsForSalaryOrg.length - 1;
                      const earned = tripEarnings(t);
                      const date = formatLedgerDate(t.completed_at ?? t.updated_at ?? t.created_at);
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.tripSelectRow,
                            { borderBottomColor: colors.border },
                            isLast && styles.monthDropdownRowLast,
                            isSelected && { backgroundColor: colors.emeraldMuted },
                          ]}
                          onPress={() => toggleSalaryTripSelection(t.id)}
                          activeOpacity={0.85}
                        >
                          <FontAwesome
                            name={isSelected ? 'check-square' : 'square-o'}
                            size={18}
                            color={isSelected ? colors.emerald : colors.textMuted}
                          />
                          <View style={styles.tripSelectText}>
                            <Text style={[styles.tripSelectTitle, { color: colors.text }]} numberOfLines={1}>
                              {getDriverTripDisplayNumber(t, driverTripNumberById)}
                            </Text>
                            <Text style={[styles.tripSelectSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                              {date} · ₹{earned.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={styles.tripsModalFooter}>
                  <TouchableOpacity
                    style={[styles.tripsModalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => {
                      deselectAllSalaryTrips();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tripsModalBtnText, { color: colors.textMuted }]}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tripsModalBtn, { backgroundColor: colors.text }]}
                    onPress={() => setShowTripsDropdown(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tripsModalBtnText, { color: Theme.textOnPrimary }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Needed-by date picker */}
        {showNeededByPicker ? (
          <Modal transparent animationType="fade" visible onRequestClose={() => setShowNeededByPicker(false)}>
            <View style={[styles.modalScreenRoot, Platform.OS === 'web' && styles.modalScreenRootWeb]}>
              <Pressable
                style={styles.modalScreenBackdrop}
                onPress={() => setShowNeededByPicker(false)}
                accessibilityLabel="Close"
              />
              <View pointerEvents="box-none" style={styles.modalScreenCenter}>
                <View
                  style={[
                    styles.monthModalCard,
                    styles.monthModalCardCalendar,
                    { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: 14 },
                  ]}
                >
                  <Text style={[styles.monthModalTitle, { color: colors.text }]}>Needed by</Text>
                  <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
                    <ScrollView
                      style={styles.neededByCalendarScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      <NeededByCalendar
                        value={neededByDate}
                        onDayPress={(d) => setNeededByDate(d)}
                        colors={{
                          surface: colors.surface,
                          text: colors.text,
                          textMuted: colors.textMuted,
                          placeholder: colors.placeholder,
                          emerald: colors.emerald,
                          emeraldMuted: colors.emeraldMuted,
                        }}
                      />
                    </ScrollView>
                    <TouchableOpacity
                      style={[styles.modalDoneBtn, { backgroundColor: colors.text }]}
                      onPress={() => setShowNeededByPicker(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalDoneBtnText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}

        {/* Sticky footer — primary CTA */}
        {salaryRequestOrgOptions.length > 0 && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.min(insets.bottom, 12) + 8,
                paddingHorizontal: contentPadding,
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: tabBarClearance,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.submitBtn,
                salaryRequestSubmitting && { opacity: 0.9 },
              ]}
              onPress={() => {
                if (salaryRequestSubmitting) return;
                if (widgetPage === 0) {
                  const amount = parseRupeeAmountInput(salaryRequestAmount);
                  if (!salaryRequestType) {
                    showAppAlert('Select type', 'Choose Monthly salary, Advance, or Trip-based.');
                    return;
                  }
                  if (!Number.isFinite(amount) || amount <= 0) {
                    showAppAlert('Enter amount', 'Enter a valid amount in ₹.');
                    return;
                  }
                  if (amount > VALIDATION.AMOUNT_MAX) {
                    showAppAlert(
                      'Amount too large',
                      `Amount cannot exceed ₹${VALIDATION.AMOUNT_MAX.toLocaleString('en-IN')}.`,
                    );
                    return;
                  }
                  if (salaryRequestType === 'advance' && !neededByDate) {
                    showAppAlert('Needed by', 'Select when you need the advance by.');
                    return;
                  }
                  if (salaryRequestType === 'trip_based' && selectedSalaryTripIds.length === 0) {
                    showAppAlert('Select trips', 'Select at least one trip to be paid.');
                    return;
                  }
                  setWidgetPage(1);
                  return;
                }
                submitSalaryRequest();
              }}
              disabled={salaryRequestSubmitting}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={salaryRequestSubmitting ? 'Submitting' : widgetPage === 0 ? 'Next' : 'Submit request'}
            >
              <LinearGradient
                colors={salaryRequestSubmitting ? [colors.surface, colors.surface] : [colors.emeraldDark, colors.emerald]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.submitBtnContent}>
                {salaryRequestSubmitting ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <Text style={[styles.submitBtnText, { color: Theme.textOnPrimary }]}>
                      {widgetPage === 0 ? 'NEXT' : 'SUBMIT REQUEST'}
                    </Text>
                    {widgetPage === 0 ? (
                      <ArrowRight size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
                    ) : (
                      <FontAwesome name="send" size={17} color={Theme.textOnPrimary} />
                    )}
                  </>
                )}
              </View>
            </TouchableOpacity>
            {/* Save as Draft removed */}
            <Text style={[styles.footerHint, { color: colors.textMuted }]}>
              Usually processed within 24–48 business hours after your fleet reviews the request.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const CARD_RADIUS = 16;
const CARD_ELEVATION = 3;
const CARD_SHADOW_OPACITY = 0.06;
const CARD_SHADOW_RADIUS = 12;
const BUTTON_RADIUS = 14;
const MIN_TOUCH = Layout.minTouchTargetSize;

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  loadingCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
  },
  successRoot: {
    flex: 1,
  },
  successTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  successIconBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: MIN_TOUCH / 2,
  },
  successStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  successStatusChipText: {
    color: Theme.textOnPrimary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  successHero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    minHeight: 160,
  },
  successSendCircleOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.textOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  successHeroEyebrow: {
    color: Theme.textOnPrimary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.95,
    textAlign: 'center',
    marginBottom: 10,
  },
  successAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  successRupee: {
    color: Theme.textOnPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
    marginRight: 2,
    opacity: 0.95,
  },
  successAmountDigits: {
    color: Theme.textOnPrimary,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  successSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
    maxHeight: '58%',
    minHeight: 220,
  },
  successSheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    marginTop: 10,
    marginBottom: 6,
  },
  successSheetScroll: {
    flex: 1,
  },
  successSheetScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  successPayeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    marginTop: 6,
  },
  successPayeeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successPayeeTextCol: {
    flex: 1,
    minWidth: 0,
  },
  successCapsLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  successPayeeName: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  successAccordionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  successAccordionHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  successAccordionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  successDetailCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  successSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 30,
  },
  successSummaryRowLast: {
    marginTop: 4,
    alignItems: 'center',
  },
  successSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 0,
    maxWidth: '44%',
  },
  successSummaryValue: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  successCopyPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '56%',
    minHeight: 36,
  },
  successCopyMono: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  successStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  successStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  successStatusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  successDoneBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 14,
  },
  successDoneBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  successFooterTrust: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    gap: 6,
    opacity: 0.85,
  },
  successFooterTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  successFooterTrustCaps: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  successFooterFine: {
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Layout.driverHeaderBottomPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: {
    width: MIN_TOUCH,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideAlignEnd: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.spacingSmall,
  },
  backBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.headerTitle,
  },
  headerTitlePremium: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  fleetHeroSection: {
    marginTop: 0,
    marginBottom: 12,
    alignItems: 'center',
  },
  fleetHeroSectionAfterChips: {
    marginTop: 2,
    marginBottom: 10,
  },
  fleetHeroAlign: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  fleetHeroAvatarOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  fleetHeroAvatarImg: {
    width: '100%',
    height: '100%',
  },
  fleetHeroOrgName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.25,
    textAlign: 'center',
    paddingHorizontal: 12,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  fleetHeroBlurb: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  fleetHeroBlurbAccent: {
    fontWeight: '900',
  },
  fleetSelectHint: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  headerAvatarRing: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  headerAvatarLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.88,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  offlineBannerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  canvas: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  scrollContent: {
    paddingTop: 10,
    paddingHorizontal: 0,
  },
  hint: { fontSize: 10, fontWeight: '500', lineHeight: 14 },
  emptyStateWrap: { paddingTop: 24 },
  emptyStateCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  emptyStateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BUTTON_RADIUS,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  emptyStateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  section: { marginBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: 18,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formCol: {
    flex: 1,
    minWidth: 0,
  },
  inputShell: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  inputText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  currencyPrefix: {
    fontSize: 13,
    fontWeight: '800',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 8,
  },
  multilineShell: {
    borderRadius: 12,
    borderWidth: 0,
    overflow: 'hidden',
    marginTop: 10,
  },
  reasonInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 96,
    fontSize: 12,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  notesInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  supportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  supportHint: {
    fontSize: 11,
    fontWeight: '700',
  },
  widgetCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: 18,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  premiumDetailCard: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  widgetTitlePremium: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  widgetSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  widgetSubtitlePremium: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  premiumFormGap: {
    marginTop: 12,
    gap: 10,
  },
  fieldLabelCaps: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputShellPremium: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  multilinePremium: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  reviewEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  reasonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  reasonCounter: {
    fontSize: 10,
    fontWeight: '600',
  },
  rulesCard: {
    // Flat page layout: legacy rules card chrome removed.
    borderRadius: 0,
    borderWidth: 0,
    padding: 0,
    borderLeftWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  rulesCardV2: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  rulesHeaderV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  rulesShieldWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesInfoIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitleV2: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  rulesItemsV2: {
    gap: 10,
  },
  rulesItemV2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rulesItemTextV2: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  rulesList: {
    gap: 6,
    paddingLeft: 2,
  },
  rulesBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 12,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  attachGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  uploadTile: {
    width: 88,
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadTileText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  attachmentTile: {
    width: 88,
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: '100%',
    height: '100%',
  },
  pdfTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 6,
  },
  pdfName: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  removeAttachmentBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  creditHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  creditAmount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  creditBarBg: {
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  creditBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  fleetProfilesSection: {
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    paddingBottom: 12,
  },
  fleetProfilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
  },
  fleetProfileChip: {
    width: 88,
    alignItems: 'center',
  },
  fleetAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  fleetProfileName: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 13,
  },
  fleetProfileUnderline: {
    width: 28,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
  },
  requestTypeSelectedText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
    alignSelf: 'center',
    width: '100%',
  },
  requestTypeMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  requestTypeMenu: {
    position: 'absolute',
    width: 240,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  requestTypeMenuTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  requestTypeMenuItem: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestTypeMenuTextWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
  requestTypeMenuItemLabel: { fontSize: 14, fontWeight: '700' },
  requestTypeMenuItemHint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  monthYearRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  monthBlock: { flex: 1, minWidth: 0 },
  monthDropdownWrap: { position: 'relative' as const, zIndex: 10 },
  monthTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  monthTriggerText: { fontSize: 15, fontWeight: '600', flex: 1 },
  monthDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthDropdownRowLast: { borderBottomWidth: 0 },
  /** Modal layout: backdrop + centered card (avoids nested Pressable touch bugs on web). */
  modalScreenRoot: {
    flex: 1,
  },
  modalScreenRootWeb: {
    zIndex: 20000,
  },
  modalScreenBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 20, 0.35)',
  },
  modalScreenCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  monthModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 20, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  monthModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  monthModalCardCalendar: {
    maxWidth: 400,
  },
  monthModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  monthModalList: { maxHeight: 320 },
  neededByCalendarScroll: { maxHeight: 400 },
  monthModalRow: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthModalRowText: { fontSize: 13, fontWeight: '700' },
  yearBlock: { width: 100 },
  tripsModalHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tripSelectText: { flex: 1, minWidth: 0 },
  tripSelectTitle: { fontSize: 13, fontWeight: '700' },
  tripSelectSubtitle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  tripsModalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  tripsModalBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripsModalBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  tripListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectAllText: { fontSize: 13, fontWeight: '700' },
  tripListEmpty: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tripListEmptyText: { flex: 1, fontSize: 14, lineHeight: 20 },
  tripList: { overflow: 'hidden', padding: 0, maxHeight: Platform.OS === 'android' ? 286 : 300 },
  tripListScroll: { maxHeight: Platform.OS === 'android' ? 226 : 238 },
  tripListContent: { paddingBottom: 0 },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  tripCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripInfo: { flex: 1, minWidth: 0 },
  tripId: { fontSize: 14, fontWeight: '700' },
  tripDate: { fontSize: 11, fontWeight: '500', marginTop: 2, lineHeight: 14 },
  tripAmount: { fontSize: 14, fontWeight: '700', minWidth: 90, textAlign: 'right' },
  tripTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tripTotalLabel: { fontSize: 13, fontWeight: '700' },
  tripTotalAmount: { fontSize: 15, fontWeight: '800' },
  amountDisplayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 10,
    minHeight: 58,
  },
  amountPrefix: { fontSize: 28, fontWeight: '800', marginRight: 6, letterSpacing: -0.5 },
  amountDisplay: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    paddingVertical: 8,
    minHeight: 48,
    letterSpacing: -0.5,
    textAlignVertical: 'center',
  },
  amountDecimals: { fontSize: 22, fontWeight: '700', marginTop: 1 },
  amountCursor: {
    width: 3,
    height: 38,
    borderRadius: 2,
    marginLeft: 6,
  },
  keypadCard: { padding: 10, borderRadius: 28 },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  keypadButton: {
    width: '31%',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  noteInput: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 15,
    fontWeight: '500',
    minHeight: 96,
    textAlignVertical: 'top',
  },
  footer: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    minHeight: 48,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  draftBtn: {
    marginTop: 10,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  draftBtnText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  footerHint: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 13,
    paddingHorizontal: 8,
  },
  modalDoneBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
  },
});
