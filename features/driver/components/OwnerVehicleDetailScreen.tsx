/**
 * Owner vehicle detail foundation — Phase 1b (no docs / trips / P&L yet).
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  ownerVehicleSubtitle,
  ownerVehicleTitle,
  softDeleteOwnerVehicle,
} from '@/features/driver/services/ownerVehicles.service';
import { OwnerVehicleDocumentsSection } from '@/features/driver/components/OwnerVehicleDocumentsSection';
import { useOwnerVehicleDetailQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fuel, Gauge, Share2, Truck, Wrench } from 'lucide-react-native';
import { confirmDialog } from '@/lib/confirmDialog';
import { showAppAlert } from '@/lib/appAlert';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OwnerVehicleDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const params = useLocalSearchParams<{ vehicleId?: string | string[] }>();
  const rawId = Array.isArray(params.vehicleId) ? params.vehicleId[0] : params.vehicleId;
  const vehicleId = rawId?.trim() || '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { data: vehicle, isLoading, error, refetch } = useOwnerVehicleDetailQuery(
    vehicleId,
    uid,
  );
  const { invalidate } = useOwnerVehiclesQuery(uid);
  const [removing, setRemoving] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.driverMyFleet());
  }, [router]);

  const confirmRemove = useCallback(() => {
    if (!uid || !vehicleId) return;
    // confirmDialog / showAppAlert also work on web (the native alert does nothing there).
    void (async () => {
      const ok = await confirmDialog({
        title: 'Remove vehicle?',
        message: 'This removes it from My Fleet. It does not delete Business org vehicles.',
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!ok) return;
      setRemoving(true);
      const { error: delError } = await softDeleteOwnerVehicle(uid, vehicleId);
      setRemoving(false);
      if (delError) {
        showAppAlert('Could not remove', delError.message);
        return;
      }
      invalidate();
      router.replace(ROUTES.driverMyFleet());
    })();
  }, [uid, vehicleId, invalidate, router]);

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title={vehicle ? ownerVehicleTitle(vehicle) : 'Vehicle'}
        subtitle="Owner vehicle"
        onBack={handleBack}
      />

      {isLoading ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 40 }} />
      ) : error || !vehicle ? (
        <View style={styles.gatePad}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>Vehicle not found</Text>
          <Text style={[styles.gateBody, { color: colors.textMuted }]}>
            {error instanceof Error ? error.message : 'It may have been removed.'}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [
              styles.secondaryCta,
              {
                borderColor: cardBorder,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryCtaText, { color: colors.text }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 12,
          }}
        >
          <View
            style={[
              styles.hero,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: isDark
                    ? colors.emeraldMuted
                    : 'rgba(167,243,208,0.4)',
                },
              ]}
            >
              <Truck size={22} color={colors.emerald} />
            </View>
            <Text style={[styles.plate, { color: colors.text }]}>
              {ownerVehicleTitle(vehicle)}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {ownerVehicleSubtitle(vehicle)}
            </Text>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      vehicle.status === 'active'
                        ? colors.emerald
                        : vehicle.status === 'maintenance'
                          ? Theme.warning
                          : colors.textMuted,
                  },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
                {vehicle.status}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.grid,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <MetaRow
              icon={<Gauge size={16} color={colors.emerald} />}
              label="Capacity"
              value={vehicle.capacity || '—'}
              muted={colors.textMuted}
              text={colors.text}
            />
            <MetaRow
              icon={<Fuel size={16} color={colors.emerald} />}
              label="Fuel"
              value={vehicle.fuel_type || '—'}
              muted={colors.textMuted}
              text={colors.text}
            />
            <MetaRow
              icon={<Wrench size={16} color={colors.emerald} />}
              label="Type"
              value={vehicle.vehicle_type || '—'}
              muted={colors.textMuted}
              text={colors.text}
            />
          </View>

          <OwnerVehicleDocumentsSection
            ownerUserId={uid}
            ownerVehicleId={vehicle.id}
          />

          <Pressable
            onPress={() =>
              router.push(
                ROUTES.driverCapacityStory(vehicle.id) as Parameters<
                  typeof router.push
                >[0],
              )
            }
            style={({ pressed }) => [
              styles.shareStoryBtn,
              {
                backgroundColor: colors.emerald,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Share2 size={15} color={Theme.textOnPrimary} strokeWidth={2.4} />
            <Text style={styles.shareStoryText}>Share as Story</Text>
          </Pressable>

          <View
            style={[
              styles.soonCard,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Truck size={18} color={colors.textMuted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.soonTitle, { color: colors.text }]}>Coming later</Text>
              <Text style={[styles.soonBody, { color: colors.textMuted }]}>
                Operations, expenses and P&L attach here after documents. Owning
                this vehicle never unlocks creating trips in the Driver App.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={confirmRemove}
            disabled={removing}
            style={({ pressed }) => [
              styles.dangerCta,
              {
                borderColor: Theme.negative,
                opacity: pressed || removing ? 0.75 : 1,
              },
            ]}
          >
            {removing ? (
              <ActivityIndicator color={Theme.negative} />
            ) : (
              <Text style={styles.dangerText}>Remove from My Fleet</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function MetaRow({
  icon,
  label,
  value,
  muted,
  text,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  muted: string;
  text: string;
}) {
  return (
    <View style={styles.metaRow}>
      {icon}
      <Text style={[styles.metaLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gatePad: { padding: 20, gap: 10 },
  gateTitle: { fontSize: 17, fontWeight: '800' },
  gateBody: { fontSize: 13, lineHeight: 19 },
  hero: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 6,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  plate: { fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  sub: { fontSize: 13 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  grid: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  metaLabel: { width: 72, fontSize: 12, fontWeight: '600' },
  metaValue: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  soonCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  soonTitle: { fontSize: 14, fontWeight: '700' },
  soonBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  dangerCta: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: Theme.negative, fontSize: 14, fontWeight: '700' },
  shareStoryBtn: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareStoryText: {
    color: Theme.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryCta: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryCtaText: { fontSize: 14, fontWeight: '700' },
});
