/**
 * Become a DCO (driver-come-owner / independent owner-operator) — onboarding
 * checklist: identity, DCO docs, assigned/own vehicle, submit, leave fleet.
 * Leave fleet comes LAST and unlocks only after admin approval (DOCS_APPROVED),
 * so a driver never quits their fleet before knowing they are approved.
 * @see supabase/migrations/20271127101550_dco_approve_before_leaving_fleet.sql
 * @see supabase/migrations/20270310200000_dco_schema_foundation.sql
 * @see supabase/migrations/20270310210000_dco_eligibility_and_admin_rpcs.sql
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { activateMyDco, requestDcoStatus } from '@/features/driver/services/dco.service';
import { useDriverAssignedVehicleDisplay } from '@/features/driver/hooks/useDriverAssignedVehicleDisplay';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import type { DriverOperatingModeKind } from '@/features/drivers/domain/driverOperatingMode';
import { canManageOwnerVehicles } from '@/features/drivers/domain/driverOperatingMode';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  IdCard,
  Landmark,
  ShieldAlert,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type StepState = 'done' | 'active' | 'pending' | 'waiting';

export default function DcoStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { status, dcoProfile, isLoading, invalidate } = useDcoStatusQuery(profile?.uid);
  const { operatingMode } = useDriverOperatingModeQuery(profile?.uid);
  const canOwnVehicles = canManageOwnerVehicles(operatingMode);
  const { vehicles: ownerVehicles, isLoading: ownerVehiclesLoading } =
    useOwnerVehiclesQuery(profile?.uid);
  const { vehicleDisplay, hasAssignment, isLoading: fleetVehicleLoading } =
    useDriverAssignedVehicleDisplay(profile?.uid);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kyc, setKyc] = useState<{
    isVerified: boolean;
    uploadedDocs: number;
    reviewStatus: string | null;
  } | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  }, [router]);

  const handleRequest = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: requestError } = await requestDcoStatus();
      if (requestError) {
        setError(requestError.message);
        return;
      }
      invalidate();
    } finally {
      setBusy(false);
    }
  }, [invalidate]);

  useEffect(() => {
    let cancelled = false;
    const uid = profile?.uid;
    if (!uid) {
      setKyc(null);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase()
          .from('driver_kyc_status')
          .select('review_status,is_verified,uploaded_docs')
          .eq('driver_user_id', uid)
          .maybeSingle();
        if (cancelled) return;
        const row = data as {
          review_status: string | null;
          is_verified: boolean | null;
          uploaded_docs: number | null;
        } | null;
        if (row) {
          setKyc({
            isVerified: !!row.is_verified,
            uploadedDocs: row.uploaded_docs ?? 0,
            reviewStatus: row.review_status,
          });
          return;
        }
        const { count } = await supabase()
          .from('driver_kyc_documents')
          .select('id', { count: 'exact', head: true })
          .eq('driver_user_id', uid)
          .is('deleted_at', null);
        if (cancelled) return;
        setKyc({
          isVerified: false,
          uploadedDocs: count ?? 0,
          reviewStatus: null,
        });
      } catch {
        if (!cancelled) setKyc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  const cardBorder = isDark ? colors.borderSubtle : Theme.borderMedium;
  const leftFleet = !operatingMode.isEmployeeDriver;
  const stillOnFleet = !leftFleet;
  // Approved while still on a fleet: Leave fleet unlocks now.
  const fleetUnlocked = status === 'DOCS_APPROVED';

  // Back from Leave fleet (wallet) → pick up DOCS_APPROVED → APPROVED.
  useFocusEffect(
    useCallback(() => {
      if (profile?.uid) invalidate();
    }, [profile?.uid, invalidate]),
  );

  // Approved while on a fleet, and the fleet link is now gone: the server
  // normally activates on leave; this covers any path it missed.
  const modeLoaded = operatingMode.dcoStatus !== 'NONE';
  useEffect(() => {
    if (status !== 'DOCS_APPROVED' || !modeLoaded || stillOnFleet) return;
    let cancelled = false;
    void activateMyDco().then(({ status: next }) => {
      if (!cancelled && next && next !== 'DOCS_APPROVED') invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [status, modeLoaded, stillOnFleet, invalidate]);

  const goLeaveFleet = useCallback(() => {
    router.push(ROUTES.driverWalletSelf() as Parameters<typeof router.push>[0]);
  }, [router]);

  const identityDone = Boolean(kyc?.isVerified);
  const ownerVehicleCount = ownerVehicles.length;
  const hasOwnVehicle = ownerVehicleCount > 0;
  const useOwnVehiclePath = canOwnVehicles || status === 'APPROVED';

  const vehicleStepDone = useOwnVehiclePath
    ? hasOwnVehicle || operatingMode.hasActiveVehicle
    : hasAssignment;
  const submitWaiting = status === 'PENDING';

  // Order: identity → DCO docs → vehicle → submit → leave fleet (after approval).
  const identityState: StepState = identityDone ? 'done' : 'active';
  const docsState: StepState =
    status === 'APPROVED' || status === 'PENDING' || status === 'DOCS_APPROVED'
      ? 'done'
      : identityDone
        ? 'active'
        : 'pending';
  const vehicleState: StepState = vehicleStepDone ? 'done' : 'active';
  const submitState: StepState = submitWaiting
    ? 'waiting'
    : status === 'APPROVED' || status === 'DOCS_APPROVED'
      ? 'done'
      : status === 'REJECTED'
        ? 'active'
        : identityDone
          ? 'active'
          : 'pending';
  const leaveState: StepState = leftFleet ? 'done' : fleetUnlocked ? 'active' : 'pending';

  const stepStates = [identityState, docsState, vehicleState, submitState, leaveState];
  const doneCount = stepStates.filter((s) => s === 'done').length;
  const progressPct = Math.round((doneCount / stepStates.length) * 100);

  const vehicleTitle = useOwnVehiclePath ? 'Your vehicle' : 'Assigned vehicle';
  const vehicleSub = useMemo(() => {
    if (fleetVehicleLoading || (canOwnVehicles && ownerVehiclesLoading)) {
      return 'Loading…';
    }
    if (useOwnVehiclePath) {
      if (hasOwnVehicle) {
        return `${ownerVehicleCount} vehicle${ownerVehicleCount === 1 ? '' : 's'} in My Fleet`;
      }
      return 'Add your vehicle in My Fleet';
    }
    if (hasAssignment) {
      return `${vehicleDisplay.model} · ${vehicleDisplay.plate}`;
    }
    return 'No fleet vehicle linked yet';
  }, [
    fleetVehicleLoading,
    canOwnVehicles,
    ownerVehiclesLoading,
    useOwnVehiclePath,
    hasOwnVehicle,
    ownerVehicleCount,
    hasAssignment,
    vehicleDisplay.model,
    vehicleDisplay.plate,
  ]);

  const openVehicleStep = useCallback(() => {
    if (useOwnVehiclePath) {
      router.push(ROUTES.driverMyFleet() as Parameters<typeof router.push>[0]);
      return;
    }
    router.push(ROUTES.driverAssignedVehicle() as Parameters<typeof router.push>[0]);
  }, [router, useOwnVehiclePath]);

  const openDocuments = useCallback(() => {
    router.push('/(driver)/documents' as Parameters<typeof router.push>[0]);
  }, [router]);

  const softSurface = isDark ? colors.surfaceElevated : Theme.surfaceGray;

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Become a DCO"
        subtitle="Independent owner-operator"
        onBack={handleBack}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: Math.max(insets.bottom, 16) + 28,
          paddingTop: 10,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={
            isDark
              ? [Theme.driverEmeraldDark, '#022c22']
              : [Theme.driverEmerald, Theme.driverEmeraldDark]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <BadgeCheck size={13} color="#ecfdf5" strokeWidth={2.3} />
            <Text style={styles.heroEyebrow}>DCO · DRIVER-CUM-OWNER</Text>
          </View>
          <Text style={styles.heroTitle}>Run as your own operator</Text>
          <Text style={styles.heroBody}>
            Keep your driver KYC. Add PAN and bank proof and submit for Pulse approval.
            Leave your fleet only after you are approved.
          </Text>

          <View style={styles.progressBlock}>
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>Setup progress</Text>
              <Text style={styles.progressValue}>
                {doneCount}/{stepStates.length} complete
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
        </LinearGradient>

        {isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 8 }} />
        ) : (
          <StatusBlock
            status={status}
            operatingMode={operatingMode.mode}
            reason={dcoProfile?.decisionReason ?? null}
            leftFleet={leftFleet}
            isDark={isDark}
            colors={colors}
            cardBorder={cardBorder}
          />
        )}

        {!isLoading ? (
          <View
            style={[
              styles.checklistCard,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Text style={[styles.checklistTitle, { color: colors.text }]}>
              Onboarding path
            </Text>
            <Text style={[styles.checklistSub, { color: colors.textMuted }]}>
              Finish each step in order. Active steps open the right screen.
            </Text>

            <View style={styles.stepList}>
              <ChecklistStep
                index={1}
                state={identityState}
                title="Identity documents"
                body={
                  identityDone
                    ? 'Identity verified.'
                    : kyc?.reviewStatus === 'submitted'
                      ? 'Awaiting verification — our team is reviewing.'
                      : 'Upload Driving Licence, Aadhaar and Selfie.'
                }
                colors={colors}
                isDark={isDark}
                softSurface={softSurface}
                cardBorder={cardBorder}
                icon={<IdCard size={15} color={colors.emerald} strokeWidth={2.2} />}
                actionLabel="Open Documents"
                onAction={openDocuments}
              />

              <ChecklistStep
                index={2}
                state={docsState}
                title="DCO documents"
                body="Required only for DCO verification."
                colors={colors}
                isDark={isDark}
                softSurface={softSurface}
                cardBorder={cardBorder}
                icon={<FileText size={15} color={colors.emerald} strokeWidth={2.2} />}
              >
                <NestedActionRow
                  label="PAN card"
                  required
                  actionLabel="Upload"
                  onPress={openDocuments}
                  colors={colors}
                  softSurface={softSurface}
                  cardBorder={cardBorder}
                  icon={<IdCard size={15} color={Theme.textRouteCard} strokeWidth={2.1} />}
                />
                <NestedActionRow
                  label="Bank proof"
                  hint="Cancelled cheque / passbook"
                  required
                  actionLabel="Upload"
                  onPress={openDocuments}
                  colors={colors}
                  softSurface={softSurface}
                  cardBorder={cardBorder}
                  icon={<Landmark size={15} color={Theme.textRouteCard} strokeWidth={2.1} />}
                />
              </ChecklistStep>

              <ChecklistStep
                index={3}
                state={vehicleState}
                title={vehicleTitle}
                body={vehicleSub}
                colors={colors}
                isDark={isDark}
                softSurface={softSurface}
                cardBorder={cardBorder}
                icon={<Truck size={15} color={colors.emerald} strokeWidth={2.2} />}
              >
                <NestedActionRow
                  label={useOwnVehiclePath ? 'My Fleet' : 'Fleet assigned'}
                  hint={
                    useOwnVehiclePath
                      ? hasOwnVehicle
                        ? 'Manage your vehicles'
                        : 'Add your first vehicle'
                      : hasAssignment
                        ? 'View linked assignment'
                        : 'Open vehicle details'
                  }
                  actionLabel={
                    useOwnVehiclePath
                      ? hasOwnVehicle
                        ? 'Open'
                        : 'Add'
                      : hasAssignment
                        ? 'View'
                        : 'Open'
                  }
                  onPress={openVehicleStep}
                  colors={colors}
                  softSurface={softSurface}
                  cardBorder={cardBorder}
                  icon={<Truck size={15} color={Theme.textRouteCard} strokeWidth={2.1} />}
                />
              </ChecklistStep>

              <ChecklistStep
                index={4}
                state={submitState}
                title="Submit for approval"
                body={
                  status === 'PENDING'
                    ? 'Submitted — waiting for Pulse admin approval.'
                    : status === 'DOCS_APPROVED'
                      ? 'Approved by Pulse admin.'
                      : status === 'APPROVED'
                        ? 'Approved — you can operate as an independent owner-operator.'
                        : status === 'REJECTED'
                          ? 'Rejected — request again after fixing issues.'
                          : status === 'SUSPENDED'
                            ? 'Suspended — contact Pulse support.'
                            : 'Request DCO status when your documents are ready. You can stay on your fleet.'
                }
                colors={colors}
                isDark={isDark}
                softSurface={softSurface}
                cardBorder={cardBorder}
                icon={<BadgeCheck size={15} color={colors.emerald} strokeWidth={2.2} />}
              />

              <ChecklistStep
                index={5}
                state={leaveState}
                title="Leave fleet"
                body={
                  leftFleet
                    ? 'Not linked to any fleet employer.'
                    : fleetUnlocked
                      ? 'You are approved. Leave your fleet now to start as a DCO (pending-pay warning shown; the owner is notified).'
                      : 'Keep driving for your fleet. This unlocks after Pulse admin approves you.'
                }
                colors={colors}
                isDark={isDark}
                softSurface={softSurface}
                cardBorder={cardBorder}
                icon={<Building2 size={15} color={colors.emerald} strokeWidth={2.2} />}
                actionLabel={stillOnFleet && fleetUnlocked ? 'Leave fleet' : undefined}
                onAction={stillOnFleet && fleetUnlocked ? goLeaveFleet : undefined}
                isLast
              />
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!isLoading && (status === 'NONE' || status === 'REJECTED') ? (
          <Pressable
            onPress={() => void handleRequest()}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: colors.emerald,
                opacity: pressed || busy ? 0.72 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              status === 'REJECTED' ? 'Request DCO status again' : 'Request DCO status'
            }
          >
            {busy ? (
              <ActivityIndicator color={Theme.textOnPrimary} />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  {status === 'REJECTED' ? 'Request again' : 'Request DCO status'}
                </Text>
                <ChevronRight size={18} color={Theme.textOnPrimary} strokeWidth={2.4} />
              </>
            )}
          </Pressable>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          DCO trips settle to you directly at your agreed bid — never as employee
          commission, never through a Business supplier ledger.
        </Text>
      </ScrollView>
    </View>
  );
}

function ChecklistStep({
  index,
  state,
  title,
  body,
  colors,
  softSurface,
  cardBorder,
  icon,
  actionLabel,
  onAction,
  children,
  isLast,
}: {
  index: number;
  state: StepState;
  title: string;
  body: string;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  softSurface: string;
  cardBorder: string;
  icon: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
  isLast?: boolean;
}) {
  const isDone = state === 'done';
  const isWaiting = state === 'waiting';
  const isActive = state === 'active';

  return (
    <View style={[styles.stepRow, !isLast && styles.stepRowGap]}>
      <View style={styles.stepRail}>
        <View
          style={[
            styles.stepBadge,
            {
              backgroundColor: isDone
                ? colors.emerald
                : isWaiting
                  ? 'rgba(245,158,11,0.16)'
                  : isActive
                    ? softSurface
                    : softSurface,
              borderColor: isDone
                ? colors.emerald
                : isWaiting
                  ? 'rgba(245,158,11,0.45)'
                  : isActive
                    ? Theme.driverEmeraldBorderSoft
                    : cardBorder,
            },
          ]}
        >
          {isDone ? (
            <Check size={14} color={Theme.textOnPrimary} strokeWidth={2.8} />
          ) : isWaiting ? (
            <Clock3 size={14} color={Theme.warning} strokeWidth={2.4} />
          ) : (
            <Text
              style={[
                styles.stepNum,
                { color: isActive ? colors.emerald : colors.textMuted },
              ]}
            >
              {index}
            </Text>
          )}
        </View>
        {!isLast ? (
          <View
            style={[
              styles.stepLine,
              {
                backgroundColor: isDone
                  ? 'rgba(4,120,87,0.35)'
                  : 'rgba(148,163,184,0.35)',
              },
            ]}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.stepCard,
          {
            backgroundColor: isActive ? softSurface : 'transparent',
            borderColor: isActive ? Theme.driverEmeraldBorderSoft : 'transparent',
          },
        ]}
      >
        <View style={styles.stepCardHead}>
          <View
            style={[
              styles.stepIconWrap,
              {
                backgroundColor: isDone
                  ? 'rgba(4,120,87,0.12)'
                  : softSurface,
              },
            ]}
          >
            {icon}
          </View>
          <View style={styles.stepCopy}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.stepBodyText, { color: colors.textMuted }]}>{body}</Text>
          </View>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [
              styles.stepActionBtn,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorder,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={[styles.stepActionText, { color: colors.emerald }]}>
              {actionLabel}
            </Text>
            <ChevronRight size={15} color={colors.emerald} strokeWidth={2.4} />
          </Pressable>
        ) : null}

        {children ? <View style={styles.nestedStack}>{children}</View> : null}
      </View>
    </View>
  );
}

function NestedActionRow({
  label,
  hint,
  required,
  actionLabel,
  onPress,
  colors,
  softSurface,
  cardBorder,
  icon,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  actionLabel: string;
  onPress: () => void;
  colors: ReturnType<typeof useDriverThemeColors>;
  softSurface: string;
  cardBorder: string;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.nestedRow,
        {
          backgroundColor: colors.surface,
          borderColor: cardBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${actionLabel}`}
    >
      <View style={[styles.nestedIcon, { backgroundColor: softSurface }]}>{icon}</View>
      <View style={styles.nestedCopy}>
        <Text style={[styles.nestedLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
          {required ? <Text style={{ color: Theme.negative }}> *</Text> : null}
        </Text>
        {hint ? (
          <Text style={[styles.nestedHint, { color: colors.textMuted }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.nestedRight}>
        <Upload size={13} color={colors.textMuted} strokeWidth={2.2} />
        <Text style={[styles.nestedAction, { color: colors.textMuted }]}>{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function StatusBlock({
  status,
  operatingMode,
  reason,
  leftFleet,
  isDark,
  colors,
  cardBorder,
}: {
  status: 'NONE' | 'PENDING' | 'DOCS_APPROVED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  operatingMode: DriverOperatingModeKind;
  reason: string | null;
  leftFleet: boolean;
  isDark: boolean;
  colors: ReturnType<typeof useDriverThemeColors>;
  cardBorder: string;
}) {
  if (status === 'NONE') return null;

  const cfg = {
    PENDING: {
      icon: Clock3,
      tint: Theme.warning,
      bg: isDark ? 'rgba(180,83,9,0.18)' : 'rgba(255,247,237,0.98)',
      title: 'Under review',
      body: leftFleet
        ? 'Pulse admin is reviewing your DCO request.'
        : 'Pulse admin is reviewing your DCO request. Keep driving for your fleet — you leave only after approval.',
    },
    DOCS_APPROVED: {
      icon: Check,
      tint: colors.emerald,
      bg: isDark ? colors.emeraldMuted : 'rgba(236,253,245,0.98)',
      title: 'You are approved 🎉',
      body: leftFleet
        ? 'Activating your DCO status…'
        : 'Leave your fleet to start as a DCO. Your DCO status turns on as soon as you leave.',
    },
    APPROVED: {
      icon: Check,
      tint: colors.emerald,
      bg: isDark ? colors.emeraldMuted : 'rgba(236,253,245,0.98)',
      title: 'DCO approved',
      body:
        operatingMode === 'DCO'
          ? 'You can bid in the marketplace as an independent owner-operator.'
          : operatingMode === 'DCO_EMPLOYMENT_CONFLICT'
            ? 'You are still linked to a business as an employee driver. Leave that fleet to use Marketplace.'
            : 'Add an active vehicle to your fleet to use Marketplace.',
    },
    REJECTED: {
      icon: XCircle,
      tint: Theme.negative,
      bg: isDark ? 'rgba(153,27,27,0.18)' : 'rgba(254,242,242,0.98)',
      title: 'Request rejected',
      body: reason || 'Your DCO request was not approved.',
    },
    SUSPENDED: {
      icon: ShieldAlert,
      tint: Theme.negative,
      bg: isDark ? 'rgba(153,27,27,0.18)' : 'rgba(254,242,242,0.98)',
      title: 'DCO suspended',
      body: reason || 'Your DCO status is currently suspended by Pulse admin.',
    },
  }[status];

  const Icon = cfg.icon;

  return (
    <View style={[styles.statusCard, { backgroundColor: cfg.bg, borderColor: cardBorder }]}>
      <View style={[styles.statusIconWrap, { backgroundColor: colors.surface }]}>
        <Icon size={18} color={cfg.tint} strokeWidth={2.4} />
      </View>
      <View style={styles.statusTextWrap}>
        <Text style={[styles.statusTitle, { color: colors.text }]}>{cfg.title}</Text>
        <Text style={[styles.statusBody, { color: colors.textMuted }]}>{cfg.body}</Text>
        {status === 'SUSPENDED' ? (
          <Text style={[styles.statusBody, { color: colors.textMuted }]}>
            Contact Pulse support — suspension is reversed by admin, not self-service.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#ecfdf5',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
    color: Theme.textOnDark,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(236,253,245,0.82)',
  },
  progressBlock: {
    marginTop: 4,
    gap: 8,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: 'rgba(236,253,245,0.75)',
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ecfdf5',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#a7f3d0',
  },
  checklistCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 6,
  },
  checklistTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  checklistSub: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  stepList: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepRowGap: {
    marginBottom: 4,
  },
  stepRail: {
    width: 30,
    alignItems: 'center',
  },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '800',
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 18,
    borderRadius: 1,
  },
  stepCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  stepCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  stepBodyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  stepActionBtn: {
    alignSelf: 'stretch',
    minHeight: 42,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  nestedStack: {
    gap: 8,
  },
  nestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  nestedIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nestedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  nestedLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  nestedHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  nestedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  nestedAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    alignItems: 'flex-start',
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusTextWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.negative,
  },
  cta: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
});
