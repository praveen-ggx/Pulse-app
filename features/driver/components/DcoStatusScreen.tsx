/**
 * Become a DCO (driver-come-owner / independent owner-operator) — onboarding
 * checklist: leave fleet, identity, DCO docs, assigned/own vehicle, submit.
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
import { requestDcoStatus } from '@/features/driver/services/dco.service';
import { useDriverAssignedVehicleDisplay } from '@/features/driver/hooks/useDriverAssignedVehicleDisplay';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import type { DriverOperatingModeKind } from '@/features/drivers/domain/driverOperatingMode';
import { canManageOwnerVehicles } from '@/features/drivers/domain/driverOperatingMode';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  ShieldAlert,
  Truck,
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

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const leftFleet = !operatingMode.isEmployeeDriver;
  const identityDone = Boolean(kyc?.isVerified);
  const ownerVehicleCount = ownerVehicles.length;
  const hasOwnVehicle = ownerVehicleCount > 0;
  const useOwnVehiclePath = canOwnVehicles || status === 'APPROVED';

  const vehicleStepDone = useOwnVehiclePath
    ? hasOwnVehicle || operatingMode.hasActiveVehicle
    : hasAssignment;
  const submitWaiting = status === 'PENDING';

  const leaveState: StepState = leftFleet ? 'done' : 'active';
  const identityState: StepState = identityDone ? 'done' : leftFleet ? 'active' : 'pending';
  const docsState: StepState =
    status === 'APPROVED' || status === 'PENDING'
      ? 'done'
      : identityDone
        ? 'active'
        : 'pending';
  const vehicleState: StepState = vehicleStepDone
    ? 'done'
    : leftFleet || useOwnVehiclePath
      ? 'active'
      : 'pending';
  const submitState: StepState = submitWaiting
    ? 'waiting'
    : status === 'APPROVED'
      ? 'done'
      : status === 'REJECTED'
        ? 'active'
        : leftFleet && !operatingMode.isEmployeeDriver
          ? 'active'
          : 'pending';

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

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="DCO status"
        subtitle="Independent owner-operator"
        onBack={handleBack}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          paddingTop: 12,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Text style={[styles.heroEyebrow, { color: colors.emerald }]}>
            DCO · DRIVER-CUM-OWNER
          </Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            Operate as an independent owner-operator
          </Text>
          <Text style={[styles.heroBody, { color: colors.textMuted }]}>
            Driver documents stay the same. For DCO, upload PAN and bank proof for Pulse
            admin verification. Fleet employment must end before Marketplace bids.
          </Text>
        </View>

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
            style={[styles.checklistCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}
          >
            <ChecklistStep
              index={1}
              state={leaveState}
              title="Leave fleet"
              body={
                leftFleet
                  ? 'Not linked to any fleet.'
                  : 'You are still linked as an employee driver. Leave that fleet to continue.'
              }
              colors={colors}
              isDark={isDark}
            />

            <ChecklistStep
              index={2}
              state={identityState}
              title="Identity documents"
              body={
                identityDone
                  ? 'Identity verified.'
                  : kyc?.reviewStatus === 'submitted'
                    ? 'Awaiting verification — our team is reviewing.'
                    : 'Upload Driving Licence, Aadhaar and Selfie in Documents.'
              }
              colors={colors}
              isDark={isDark}
              actionLabel="Open Documents"
              onAction={openDocuments}
            />

            <ChecklistStep
              index={3}
              state={docsState}
              title="DCO documents"
              body="Required only for DCO. Tap each to upload in Documents."
              colors={colors}
              isDark={isDark}
            >
              <NestedActionRow
                label="PAN card"
                required
                actionLabel="Upload"
                onPress={openDocuments}
                colors={colors}
                isDark={isDark}
                cardBorder={cardBorder}
              />
              <NestedActionRow
                label="Bank proof (cancelled cheque / passbook)"
                required
                actionLabel="Upload"
                onPress={openDocuments}
                colors={colors}
                isDark={isDark}
                cardBorder={cardBorder}
              />
            </ChecklistStep>

            <ChecklistStep
              index={4}
              state={vehicleState}
              title={vehicleTitle}
              body={vehicleSub}
              colors={colors}
              isDark={isDark}
            >
              <NestedActionRow
                label={useOwnVehiclePath ? 'My Fleet' : 'Fleet assigned'}
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
                isDark={isDark}
                cardBorder={cardBorder}
                icon={
                  <View
                    style={[
                      styles.nestedIcon,
                      {
                        backgroundColor: isDark
                          ? 'rgba(59,130,246,0.2)'
                          : 'rgba(219,234,254,0.95)',
                      },
                    ]}
                  >
                    <Truck size={16} color="#3b82f6" strokeWidth={2.3} />
                  </View>
                }
              />
            </ChecklistStep>

            <ChecklistStep
              index={5}
              state={submitState}
              title="Submit for DCO approval"
              body={
                status === 'PENDING'
                  ? 'Submitted — waiting for Pulse admin approval.'
                  : status === 'APPROVED'
                    ? 'Approved — you can operate as an independent owner-operator.'
                    : status === 'REJECTED'
                      ? 'Rejected — request again after fixing issues.'
                      : status === 'SUSPENDED'
                        ? 'Suspended — contact Pulse support.'
                        : 'Request DCO status when fleet leave and documents are ready.'
              }
              colors={colors}
              isDark={isDark}
              isLast
            />
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!isLoading && (status === 'NONE' || status === 'REJECTED') ? (
          <Pressable
            onPress={() => void handleRequest()}
            disabled={busy || operatingMode.isEmployeeDriver}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: colors.emerald,
                opacity:
                  pressed || busy || operatingMode.isEmployeeDriver ? 0.72 : 1,
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
              <Text style={styles.ctaText}>
                {status === 'REJECTED' ? 'Request again' : 'Request DCO status'}
              </Text>
            )}
          </Pressable>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          DCO trips settle to you directly, at your agreed bid amount — never as employee
          commission and never through a Business's supplier ledger.
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
  isDark,
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
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
  isLast?: boolean;
}) {
  const tint =
    state === 'done'
      ? colors.emerald
      : state === 'waiting'
        ? '#B45309'
        : colors.textMuted;

  return (
    <View style={[styles.stepRow, !isLast && styles.stepRowBorder]}>
      <View style={styles.stepRail}>
        <View
          style={[
            styles.stepBadge,
            {
              backgroundColor:
                state === 'done'
                  ? isDark
                    ? colors.emeraldMuted
                    : 'rgba(220,252,231,0.95)'
                  : state === 'waiting'
                    ? isDark
                      ? 'rgba(180,83,9,0.22)'
                      : 'rgba(254,243,199,0.95)'
                    : isDark
                      ? colors.surfaceElevated
                      : Theme.surfaceGray,
              borderColor:
                state === 'done'
                  ? Theme.driverEmeraldBorderSoft
                  : state === 'waiting'
                    ? 'rgba(245,158,11,0.35)'
                    : colors.borderSubtle,
            },
          ]}
        >
          {state === 'done' ? (
            <CheckCircle2 size={16} color={colors.emerald} strokeWidth={2.4} />
          ) : state === 'waiting' ? (
            <Clock size={14} color={tint} strokeWidth={2.4} />
          ) : (
            <Text style={[styles.stepNum, { color: tint }]}>{index}</Text>
          )}
        </View>
        {!isLast ? (
          <View
            style={[
              styles.stepLine,
              {
                backgroundColor: isDark
                  ? 'rgba(4,120,87,0.28)'
                  : 'rgba(4,120,87,0.14)',
              },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.stepBodyText, { color: colors.textMuted }]}>{body}</Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={8}
            style={styles.inlineLink}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={[styles.inlineLinkText, { color: colors.emerald }]}>
              {actionLabel} {'>'}
            </Text>
          </Pressable>
        ) : null}
        {children ? <View style={styles.nestedStack}>{children}</View> : null}
      </View>
    </View>
  );
}

function NestedActionRow({
  label,
  required,
  actionLabel,
  onPress,
  colors,
  isDark,
  cardBorder,
  icon,
}: {
  label: string;
  required?: boolean;
  actionLabel: string;
  onPress: () => void;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  cardBorder: string;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.nestedRow,
        {
          backgroundColor: isDark ? colors.surfaceElevated : '#ffffff',
          borderColor: cardBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${actionLabel}`}
    >
      <View style={styles.nestedLeft}>
        {icon}
        <Text style={[styles.nestedLabel, { color: colors.text }]} numberOfLines={2}>
          {label}
          {required ? <Text style={{ color: Theme.negative }}> *</Text> : null}
        </Text>
      </View>
      <View style={styles.nestedRight}>
        <Text style={[styles.nestedAction, { color: colors.textMuted }]}>{actionLabel}</Text>
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.2} />
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
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
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
      icon: Clock,
      tint: '#B45309',
      bg: isDark ? 'rgba(180,83,9,0.18)' : 'rgba(253,230,138,0.55)',
      title: 'Under review',
      body: leftFleet
        ? 'Pulse admin is reviewing your DCO request. Fleet disconnect is already done.'
        : 'Pulse admin is reviewing your DCO request.',
    },
    APPROVED: {
      icon: CheckCircle2,
      tint: colors.emerald,
      bg: isDark ? colors.emeraldMuted : 'rgba(220,252,231,0.9)',
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
      bg: isDark ? 'rgba(153,27,27,0.18)' : 'rgba(254,226,226,0.9)',
      title: 'Request rejected',
      body: reason || 'Your DCO request was not approved.',
    },
    SUSPENDED: {
      icon: ShieldAlert,
      tint: Theme.negative,
      bg: isDark ? 'rgba(153,27,27,0.18)' : 'rgba(254,226,226,0.9)',
      title: 'DCO suspended',
      body: reason || 'Your DCO status is currently suspended by Pulse admin.',
    },
  }[status];

  const Icon = cfg.icon;

  return (
    <View style={[styles.statusCard, { backgroundColor: cfg.bg, borderColor: cardBorder }]}>
      <Icon size={22} color={cfg.tint} strokeWidth={2.4} />
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
  heroCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  heroEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  heroTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 26 },
  heroBody: { fontSize: 13, lineHeight: 19 },
  checklistCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  stepRow: { flexDirection: 'row', gap: 12, paddingBottom: 14 },
  stepRowBorder: {},
  stepRail: { width: 28, alignItems: 'center' },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 12, fontWeight: '800' },
  stepLine: { width: 2, flex: 1, marginTop: 4, minHeight: 12, borderRadius: 1 },
  stepBody: { flex: 1, minWidth: 0, gap: 4, paddingBottom: 4 },
  stepTitle: { fontSize: 15, fontWeight: '700' },
  stepBodyText: { fontSize: 12, lineHeight: 17 },
  inlineLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingVertical: 4 },
  inlineLinkText: { fontSize: 13, fontWeight: '700' },
  nestedStack: { gap: 8, marginTop: 8 },
  nestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nestedLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  nestedIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nestedLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  nestedRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nestedAction: { fontSize: 12, fontWeight: '700' },
  statusCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    alignItems: 'flex-start',
  },
  statusTextWrap: { flex: 1, gap: 4, minWidth: 0 },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusBody: { fontSize: 12, lineHeight: 17 },
  errorText: { fontSize: 13, fontWeight: '600', color: Theme.negative },
  cta: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: Theme.textOnPrimary },
  footnote: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
});
