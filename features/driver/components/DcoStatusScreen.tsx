/**
 * Become a DCO (driver-come-owner / independent owner-operator) — the single
 * owner-operator onboarding path: request and view admin approval state.
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
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import type { DriverOperatingModeKind } from '@/features/drivers/domain/driverOperatingMode';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import {
  CheckCircle2,
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

export default function DcoStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { status, dcoProfile, isLoading, invalidate } = useDcoStatusQuery(profile?.uid);
  const { operatingMode, invalidate: invalidateMode } = useDriverOperatingModeQuery(profile?.uid);

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

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

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
            DCO status is reviewed and approved by Pulse admin. It is separate from
            employment — if you are currently an active driver in a business's fleet, you
            are not eligible while that employment continues.
          </Text>
        </View>

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

        {isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 8 }} />
        ) : (
          <StatusBlock
            status={status}
            operatingMode={operatingMode.mode}
            reason={dcoProfile?.decisionReason ?? null}
            isDark={isDark}
            colors={colors}
            cardBorder={cardBorder}
          />
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!isLoading && (status === 'NONE' || status === 'REJECTED') ? (
          <Pressable
            onPress={() => void handleRequest()}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.emerald, opacity: pressed || busy ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={status === 'REJECTED' ? 'Request DCO status again' : 'Request DCO status'}
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

        {!isLoading && status === 'APPROVED' ? (
          <Pressable
            onPress={() =>
              router.push(ROUTES.driverMyFleet() as Parameters<typeof router.push>[0])
            }
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.emerald, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Manage my vehicle"
          >
            <Text style={styles.ctaText}>Manage my vehicle</Text>
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

function StatusBlock({
  status,
  operatingMode,
  reason,
  isDark,
  colors,
  cardBorder,
}: {
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  operatingMode: DriverOperatingModeKind;
  reason: string | null;
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
      body: 'Pulse admin is reviewing your DCO request.',
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
