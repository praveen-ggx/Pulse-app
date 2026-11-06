/**
 * Become a DCO (driver-come-owner / independent owner-operator) — the single
 * owner-operator onboarding path, as one guided upgrade:
 *   1. Leave fleet  2. Identity documents (normal driver KYC, reused)
 *   3. DCO documents (PAN + bank proof, uploaded here)  4. Submit for approval
 * The driver Documents screen stays driver-documents only; DCO-only documents
 * live on this screen. Pulse admin verifies all of them before approving.
 * @see supabase/migrations/20270310200000_dco_schema_foundation.sql
 * @see supabase/migrations/20271110104500_dco_require_verified_kyc.sql
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
import { useDriverKycDocUpload } from '@/features/drivers/hooks/useDriverKycDocUpload';
import { VerifiedDcoBadge } from '@/components/driver/VerifiedDcoBadge';
import {
  DCO_REQUIRED_KYC_DOC_TYPES,
  MANDATORY_DRIVER_KYC_DOC_TYPES,
  getMyDriverKycSubmission,
  latestDriverKycDocument,
  listDriverKycDocRequirements,
  listMyDriverKycDocuments,
  submitDriverKycForVerification,
  type DriverKycDocType,
  type DriverKycDocument,
  type DriverKycReviewStatus,
} from '@/features/drivers/services/driverKycDocuments.service';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import type { DriverOperatingModeKind } from '@/features/drivers/domain/driverOperatingMode';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Gavel,
  ShieldAlert,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BENEFITS = [
  { icon: Gavel, label: 'Bid in the marketplace as an independent owner-operator' },
  { icon: Truck, label: 'Bring your own vehicle to every trip' },
  { icon: Wallet, label: 'Settle directly — no employee commission' },
] as const;

const DCO_DOC_LABEL: Partial<Record<DriverKycDocType, string>> = {
  pan: 'PAN card',
  bank_proof: 'Bank proof (cancelled cheque / passbook)',
};

type StepState = 'done' | 'pending' | 'todo' | 'error';

function docReady(doc: DriverKycDocument | undefined): boolean {
  return !!doc?.storage_path && doc.status !== 'rejected' && doc.status !== 'expired';
}

function docStatusText(doc: DriverKycDocument | undefined): string {
  if (!doc?.storage_path) return 'Upload';
  switch (doc.status) {
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected — re-upload';
    case 'expired':
      return 'Expired — re-upload';
    default:
      return 'Under verification';
  }
}

export default function DcoStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { status, dcoProfile, isLoading, invalidate } = useDcoStatusQuery(profile?.uid);
  const { operatingMode, invalidate: invalidateMode } = useDriverOperatingModeQuery(profile?.uid);
  const stillOnFleet = operatingMode.isEmployeeDriver === true;
  const uid = profile?.uid ?? '';
  // New vehicles are saved active, so no vehicle → "Add vehicle" (straight to
  // the add form); once one exists → "Manage my vehicle".
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const hasVehicle = vehicles.length > 0;

  // Driver-level KYC submission (identity documents review state).
  const kycQuery = useQuery({
    queryKey: queryKeys.driverApp.driverKycSubmission(uid),
    queryFn: async () => {
      const { error: kycError, submission } = await getMyDriverKycSubmission();
      if (kycError) throw kycError;
      return submission;
    },
    enabled: !!uid,
    staleTime: 30_000,
  });
  // Per-document state + which types are mandatory / DCO-only.
  const docsQuery = useQuery({
    queryKey: queryKeys.driverApp.driverKycDocuments(uid),
    queryFn: async () => {
      const [{ error: docsError, documents }, requirements] = await Promise.all([
        listMyDriverKycDocuments(),
        listDriverKycDocRequirements(),
      ]);
      if (docsError) throw docsError;
      return { documents, requirements };
    },
    enabled: !!uid,
    staleTime: 30_000,
  });
  const refetchKyc = kycQuery.refetch;
  const refetchDocs = docsQuery.refetch;
  const refreshKyc = useCallback(async () => {
    await Promise.all([refetchKyc(), refetchDocs()]);
  }, [refetchKyc, refetchDocs]);
  // Returning from the Documents screen / wallet should reflect new state.
  useFocusEffect(
    useCallback(() => {
      if (uid) void refreshKyc();
    }, [uid, refreshKyc]),
  );
  const { uploadingDocKey, promptUpload } = useDriverKycDocUpload(refreshKyc);

  const kycStatus: DriverKycReviewStatus | 'none' = kycQuery.data?.review_status ?? 'none';
  const kycSubmitted = kycStatus === 'submitted' || kycStatus === 'approved';
  const documents = docsQuery.data?.documents ?? [];
  const requirements = docsQuery.data?.requirements ?? [];
  const serverMandatory = requirements.filter((r) => r.is_mandatory).map((r) => r.doc_type);
  const mandatoryTypes = serverMandatory.length ? serverMandatory : MANDATORY_DRIVER_KYC_DOC_TYPES;
  const serverDco = requirements.filter((r) => r.required_for_dco).map((r) => r.doc_type);
  const dcoTypes = serverDco.length ? serverDco : DCO_REQUIRED_KYC_DOC_TYPES;
  const docOf = (type: DriverKycDocType) => latestDriverKycDocument(documents, type);

  // Identity docs uploaded but never submitted are submitted together with
  // the DCO request (one tap), same completeness rule as the RPC.
  const identityUploaded = mandatoryTypes.every((t) => docReady(docOf(t)));
  const identityOk = kycSubmitted || identityUploaded;
  const dcoDocsUploaded = dcoTypes.every((t) => docReady(docOf(t)));

  // Admin approval flips dco status first; refresh the cached mode so the
  // Market tab and Find Work appear without waiting for the next refetch.
  useEffect(() => {
    if (status === 'APPROVED' && operatingMode.mode === 'DRIVER') invalidateMode();
  }, [status, operatingMode.mode, invalidateMode]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  }, [router]);

  const canRequest = !isLoading && (status === 'NONE' || status === 'REJECTED');
  const readyToSubmit = canRequest && !stillOnFleet && identityOk && dcoDocsUploaded;

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!readyToSubmit) return;
    setBusy(true);
    try {
      if (!kycSubmitted) {
        const { error: kycError } = await submitDriverKycForVerification();
        if (kycError) {
          setError(kycError.message);
          return;
        }
      }
      const { error: requestError } = await requestDcoStatus();
      if (requestError) {
        const msg = requestError.message ?? '';
        setError(
          /employment_conflict/i.test(msg)
            ? 'Disconnect from your fleet first, then submit.'
            : /kyc_required/i.test(msg)
              ? 'Upload your identity documents first (Step 2).'
              : /dco_documents_required/i.test(msg)
                ? `Upload the DCO documents first: ${msg.match(/\(([^)]+)\)/)?.[1] ?? 'PAN, bank proof'}.`
                : msg,
        );
        return;
      }
      invalidate();
      invalidateMode();
    } finally {
      setBusy(false);
      void refreshKyc();
    }
  }, [readyToSubmit, kycSubmitted, invalidate, invalidateMode, refreshKyc]);

  const goDocuments = useCallback(() => {
    router.push('/(driver)/documents' as Parameters<typeof router.push>[0]);
  }, [router]);

  const goDisconnectFleet = useCallback(() => {
    router.push(ROUTES.driverWalletSelf() as Parameters<typeof router.push>[0]);
  }, [router]);

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const showSteps =
    !isLoading && (status === 'NONE' || status === 'REJECTED' || status === 'PENDING');
  const showDcoDocs = status !== 'NONE' || showSteps;

  // ── Step states ──────────────────────────────────────────────────────────
  const fleetStep: { state: StepState; body: string } = stillOnFleet
    ? {
        state: 'todo',
        body: 'You are linked as an employee driver. Leave that fleet first (pending-pay warning shown; the owner is notified).',
      }
    : { state: 'done', body: 'Not linked to any fleet.' };

  const identityStep: { state: StepState; body: string } =
    kycStatus === 'approved'
      ? { state: 'done', body: 'Licence, Aadhaar and Selfie verified.' }
      : kycStatus === 'submitted'
        ? { state: 'pending', body: 'Submitted — Pulse admin is verifying them.' }
        : identityUploaded
          ? { state: 'done', body: 'Uploaded — submitted together with your DCO request.' }
          : kycStatus === 'rejected'
            ? {
                state: 'error',
                body: kycQuery.data?.review_notes || 'Some documents were rejected. Fix them in Documents.',
              }
            : { state: 'todo', body: 'Upload Driving Licence, Aadhaar and Selfie in Documents.' };

  const dcoDocsVerified = dcoTypes.every((t) => docOf(t)?.status === 'verified');
  const dcoDocsRejected = dcoTypes.some((t) => docOf(t)?.status === 'rejected');
  const dcoStep: { state: StepState; body: string } = dcoDocsVerified
    ? { state: 'done', body: 'Verified.' }
    : dcoDocsRejected
      ? { state: 'error', body: 'A document was rejected — re-upload it below.' }
      : dcoDocsUploaded
        ? { state: status === 'PENDING' ? 'pending' : 'done', body: status === 'PENDING' ? 'Pulse admin is verifying them.' : 'Uploaded.' }
        : { state: 'todo', body: 'Required only for DCO. Tap each to upload.' };

  const submitStep: { state: StepState; body: string } =
    status === 'PENDING'
      ? { state: 'pending', body: 'Submitted — waiting for Pulse admin approval.' }
      : status === 'REJECTED'
        ? { state: 'error', body: dcoProfile?.decisionReason || 'Not approved. Fix the steps above and submit again.' }
        : { state: 'todo', body: 'Submit everything for DCO verification in one tap.' };

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
            Your driver documents stay as they are. For DCO you also upload PAN and a bank
            proof here, then submit. Pulse admin verifies everything before approving.
          </Text>
        </View>

        {status === 'NONE' ? (
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            {BENEFITS.map(({ icon: Icon, label }) => (
              <View key={label} style={styles.benefitRow}>
                <View
                  style={[
                    styles.benefitIcon,
                    { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(167,243,208,0.35)' },
                  ]}
                >
                  <Icon size={16} color={colors.emerald} strokeWidth={2.3} />
                </View>
                <Text style={[styles.benefitLabel, { color: colors.text }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 8 }} />
        ) : (
          <StatusBlock
            status={status}
            operatingMode={operatingMode.mode}
            stillOnFleet={stillOnFleet}
            reason={dcoProfile?.decisionReason ?? null}
            hasVehicle={hasVehicle}
            isDark={isDark}
            colors={colors}
            cardBorder={cardBorder}
          />
        )}

        {showSteps ? (
          <View style={[styles.stepsCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            <StepRow
              index={1}
              title="Leave fleet"
              {...fleetStep}
              actionLabel={stillOnFleet ? 'Disconnect from fleet' : undefined}
              onAction={goDisconnectFleet}
              colors={colors}
            />
            <StepRow
              index={2}
              title="Identity documents"
              {...identityStep}
              actionLabel={identityStep.state === 'todo' || identityStep.state === 'error' ? 'Open Documents' : undefined}
              onAction={goDocuments}
              colors={colors}
            />
            <StepRow index={3} title="DCO documents" {...dcoStep} colors={colors} />
            <View style={styles.dcoDocList}>
              {dcoTypes.map((type) => {
                const doc = docOf(type);
                const label = DCO_DOC_LABEL[type] ?? type;
                return (
                  <DcoDocRow
                    key={type}
                    label={label}
                    doc={doc}
                    uploading={uploadingDocKey === type}
                    disabled={uploadingDocKey != null}
                    onPress={() => promptUpload(doc, type, label)}
                    colors={colors}
                    cardBorder={cardBorder}
                  />
                );
              })}
            </View>
            <StepRow index={4} title="Submit for DCO approval" {...submitStep} colors={colors} last />
          </View>
        ) : null}

        {/* Approved / suspended DCO: their DCO documents stay visible here. */}
        {!showSteps && showDcoDocs && !isLoading ? (
          <View style={[styles.stepsCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>DCO documents</Text>
            <View style={styles.dcoDocList}>
              {dcoTypes.map((type) => {
                const doc = docOf(type);
                const label = DCO_DOC_LABEL[type] ?? type;
                return (
                  <DcoDocRow
                    key={type}
                    label={label}
                    doc={doc}
                    uploading={uploadingDocKey === type}
                    disabled={uploadingDocKey != null}
                    onPress={() => promptUpload(doc, type, label)}
                    colors={colors}
                    cardBorder={cardBorder}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {canRequest ? (
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={busy || !readyToSubmit}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: readyToSubmit ? colors.emerald : colors.border,
                opacity: pressed || busy ? 0.88 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit for DCO approval"
            accessibilityState={{ disabled: busy || !readyToSubmit }}
          >
            {busy ? (
              <ActivityIndicator color={Theme.textOnPrimary} />
            ) : (
              <Text
                style={[styles.ctaText, !readyToSubmit ? { color: colors.textMuted } : null]}
              >
                {!readyToSubmit
                  ? 'Complete the steps above'
                  : status === 'REJECTED'
                    ? 'Submit again for DCO approval'
                    : 'Submit for DCO approval'}
              </Text>
            )}
          </Pressable>
        ) : null}

        {!isLoading && status === 'APPROVED' && !stillOnFleet ? (
          <Pressable
            onPress={() =>
              router.push(
                (hasVehicle
                  ? ROUTES.driverMyFleet()
                  : ROUTES.driverMyFleetAdd()) as Parameters<typeof router.push>[0],
              )
            }
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.emerald, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={hasVehicle ? 'Manage my vehicle' : 'Add vehicle'}
          >
            <Text style={styles.ctaText}>{hasVehicle ? 'Manage my vehicle' : 'Add vehicle'}</Text>
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

function StepRow({
  index,
  title,
  state,
  body,
  actionLabel,
  onAction,
  colors,
  last,
}: {
  index: number;
  title: string;
  state: StepState;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  colors: ReturnType<typeof useDriverThemeColors>;
  last?: boolean;
}) {
  const tint =
    state === 'done'
      ? colors.emerald
      : state === 'pending'
        ? Theme.accentGold
        : state === 'error'
          ? Theme.negative
          : colors.textMuted;
  const Icon = state === 'done' ? CheckCircle2 : state === 'pending' ? Clock : state === 'error' ? XCircle : null;

  return (
    <View style={[styles.stepRow, last ? null : { borderBottomColor: colors.border }, last ? { borderBottomWidth: 0 } : null]}>
      <View style={[styles.stepBadge, { borderColor: tint }]}>
        {Icon ? (
          <Icon size={16} color={tint} strokeWidth={2.4} />
        ) : (
          <Text style={[styles.stepBadgeText, { color: tint }]}>{index}</Text>
        )}
      </View>
      <View style={styles.statusTextWrap}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.statusBody, { color: state === 'error' ? Theme.negative : colors.textMuted }]}>
          {body}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            style={styles.stepAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={8}
          >
            <Text style={[styles.kycCta, { color: colors.emerald }]}>{actionLabel}</Text>
            <ChevronRight size={14} color={colors.emerald} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DcoDocRow({
  label,
  doc,
  uploading,
  disabled,
  onPress,
  colors,
  cardBorder,
}: {
  label: string;
  doc: DriverKycDocument | undefined;
  uploading: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useDriverThemeColors>;
  cardBorder: string;
}) {
  const statusTint = !doc?.storage_path
    ? colors.emerald
    : doc.status === 'verified'
      ? colors.emerald
      : doc.status === 'rejected' || doc.status === 'expired'
        ? Theme.negative
        : Theme.accentGold;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.dcoDocRow,
        { borderColor: cardBorder, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${docStatusText(doc)}`}
    >
      <View style={styles.statusTextWrap}>
        <Text style={[styles.dcoDocLabel, { color: colors.text }]}>
          {label}
          <Text style={{ color: Theme.negative }}> *</Text>
        </Text>
        {doc?.status === 'rejected' && doc.rejection_notes ? (
          <Text style={[styles.statusBody, { color: Theme.negative }]}>{doc.rejection_notes}</Text>
        ) : null}
      </View>
      {uploading ? (
        <ActivityIndicator color={colors.emerald} />
      ) : (
        <Text style={[styles.dcoDocStatus, { color: statusTint }]}>{docStatusText(doc)}</Text>
      )}
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function StatusBlock({
  status,
  operatingMode,
  stillOnFleet,
  reason,
  hasVehicle,
  isDark,
  colors,
  cardBorder,
}: {
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  operatingMode: DriverOperatingModeKind;
  stillOnFleet: boolean;
  reason: string | null;
  hasVehicle: boolean;
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
      title: stillOnFleet ? 'Leave fleet before admin can approve' : 'Under review',
      body: stillOnFleet
        ? 'Your request is waiting, but you are still on a fleet seat. Disconnect first — admin approval only completes after that.'
        : 'Pulse admin is reviewing your DCO request. Fleet disconnect is already done.',
    },
    APPROVED: {
      icon: CheckCircle2,
      tint: colors.emerald,
      bg: isDark ? colors.emeraldMuted : 'rgba(220,252,231,0.9)',
      title: 'DCO approved',
      body:
        operatingMode === 'DCO'
          ? 'You can bid in the marketplace as an independent owner-operator.'
          : operatingMode === 'DCO_EMPLOYMENT_CONFLICT' || stillOnFleet
            ? 'You are still linked to a business as an employee driver. Leave that fleet to use Marketplace.'
            : hasVehicle
              ? 'Your vehicle is inactive. Set it to active to use Marketplace.'
              : 'Add your vehicle to use Marketplace.',
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
        {status === 'APPROVED' ? <VerifiedDcoBadge size="sm" style={styles.statusBadge} /> : null}
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
  statusBadge: { marginBottom: 6 },
  kycCta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  stepsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { fontSize: 13, fontWeight: '800' },
  stepTitle: { fontSize: 14, fontWeight: '700' },
  stepAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  dcoDocList: { gap: 8, paddingLeft: 40, paddingBottom: 8 },
  dcoDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dcoDocLabel: { fontSize: 13, fontWeight: '600' },
  dcoDocStatus: { fontSize: 12, fontWeight: '700' },
  heroCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  heroEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  heroTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 26 },
  heroBody: { fontSize: 13, lineHeight: 19 },
  listCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  benefitIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  benefitLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
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
  cta: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaText: { fontSize: 15, fontWeight: '700', color: Theme.textOnPrimary },
  footnote: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
});
