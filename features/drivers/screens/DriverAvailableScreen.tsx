/**
 * A7.3 — DCO Available surface. Home for a DCO-eligible driver
 * (isDcoEligibleParticipation) who is currently available (no active trip,
 * per is_driver_available()). Intentionally minimal by design: a clear
 * available state, a short explanation, and entry points into the existing
 * Find Work / My Bids surfaces — no new feed, no WorkOpportunity, no
 * location logic. See docs from A7.2 design approval.
 *
 * This screen never renders while a trip is active — app/(driver)/index.tsx
 * routes to DriverHomeScreen (DriverJobCard: legacy vs multi-order) for
 * that case. Reappearing here after trip completion is automatic: completion
 * already invalidates driverApp.availability via useInvalidateDriverHomeDashboard,
 * so no completion-flow change was needed.
 */
import { DriverShellIdentityBlock } from '@/components/driver/DriverShellIdentityBlock';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import { CircleCheck, Gauge, ListChecks } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DriverAvailableScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const { avatarUri } = useDriverAvatarUri();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: isDark ? colors.background : Theme.surfaceGray },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingHorizontal: Layout.driverHeaderHorizontalPadding,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: isDark ? colors.surface : Theme.surfaceGray,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <DriverShellIdentityBlock
          avatarUri={avatarUri}
          title={user?.displayName ? `Hi, ${user.displayName}` : 'Home'}
          titleColor={colors.text}
          brandColor={colors.textMuted}
          avatarBorderColor={colors.emerald}
        />
      </View>

      <View style={styles.body}>
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statusIconWrap, { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(16,185,129,0.12)' }]}>
            <CircleCheck size={28} color={colors.emerald} strokeWidth={2.2} />
          </View>
          <Text style={[styles.statusTitle, { color: colors.text }]}>You&rsquo;re available</Text>
          <Text style={[styles.statusBody, { color: colors.textMuted }]}>
            Find work that fits your fleet.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryAction, { backgroundColor: colors.emerald }]}
          activeOpacity={0.88}
          onPress={() => router.push(ROUTES.driverAvailableLoads())}
          accessibilityRole="button"
          accessibilityLabel="Find work"
        >
          <Gauge size={18} color={Theme.textOnPrimary} strokeWidth={2.2} />
          <Text style={styles.primaryActionText}>Find Work</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: colors.surface }]}
          activeOpacity={0.88}
          onPress={() =>
            router.push({
              pathname: ROUTES.driverAvailableLoads(),
              params: { segment: 'mybids' },
            } as Parameters<typeof router.push>[0])
          }
          accessibilityRole="button"
          accessibilityLabel="My Bids"
        >
          <ListChecks size={16} color={colors.text} strokeWidth={2.2} />
          <Text style={[styles.secondaryActionText, { color: colors.text }]}>My Bids</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  avatarBtn: { padding: 2 },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: 'none',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
    gap: 14,
  },
  statusCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  statusIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statusBody: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
