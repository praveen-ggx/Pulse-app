/**
 * Driver-wide DCO prompts (mounted once in the driver layout):
 *
 *  - DOCS_APPROVED + still in a fleet → "You're approved — leave your fleet"
 *    popup, once per app session, until they leave.
 *  - Just became APPROVED (this device last saw PENDING / DOCS_APPROVED) →
 *    one-time "You're now a DCO" welcome. Already-approved DCOs never see it.
 *
 * Phone push for the same events is queued server-side
 * (20271125125050_dco_approve_before_leaving_fleet.sql); this covers drivers
 * who miss the push. Stays quiet while a fleet-invite popup is open.
 */
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalDriverInviteModal } from '@/contexts/DriverInviteModalContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { activateMyDco } from '@/features/driver/services/dco.service';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { ROUTES } from '@/lib/routes';
import { subscribeSignificantAppResume } from '@/lib/significantAppResume';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { CheckCircle2, PartyPopper } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Prompt = 'leave_fleet' | 'welcome' | null;

const lastStatusKey = (uid: string) => `pulse:dco:last-seen-status:${uid}`;

/** Session-only: Later hides the leave-fleet popup until the app restarts. */
const leaveFleetDismissedFor = new Set<string>();

export function DcoApprovalPromptHost() {
  const router = useRouter();
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const isDriver = profile?.role === 'driver';
  const { status, isSuccess, invalidate } = useDcoStatusQuery(uid);
  const { operatingMode } = useDriverOperatingModeQuery(uid);
  const inviteCtx = useOptionalDriverInviteModal();
  // Only an invite popup actually on screen — snoozed / hidden invites don't block these prompts.
  const invitePopupOpen = inviteCtx?.invitePopupVisible ?? false;

  const [prompt, setPrompt] = useState<Prompt>(null);
  const welcomeChecked = useRef<string | null>(null);

  // Push opens the app: refresh so the popup reflects the admin decision.
  useEffect(() => {
    if (!uid || !isDriver) return;
    return subscribeSignificantAppResume(() => invalidate());
  }, [uid, isDriver, invalidate]);

  // Mode is loaded once it reports the same DCO status as the profile query.
  const modeLoaded = operatingMode.dcoStatus === status;
  const stillOnFleet = operatingMode.isEmployeeDriver === true;

  // Approved while on a fleet but no longer in one (e.g. left during approval):
  // the server normally activates on leave; this covers any path it missed.
  useEffect(() => {
    if (!uid || !isDriver || status !== 'DOCS_APPROVED' || !modeLoaded || stillOnFleet) return;
    let cancelled = false;
    void activateMyDco().then(({ status: next }) => {
      if (!cancelled && next && next !== 'DOCS_APPROVED') invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [uid, isDriver, status, modeLoaded, stillOnFleet, invalidate]);

  useEffect(() => {
    if (!uid || !isDriver || !isSuccess) return;

    if (status === 'DOCS_APPROVED') {
      if (modeLoaded && stillOnFleet && !leaveFleetDismissedFor.has(uid)) {
        setPrompt((p) => p ?? 'leave_fleet');
      }
    } else {
      setPrompt((p) => (p === 'leave_fleet' ? null : p));
    }

    // Remember what this device saw; welcome only on a real transition.
    const checkKey = `${uid}:${status}`;
    if (welcomeChecked.current === checkKey) return;
    welcomeChecked.current = checkKey;
    void (async () => {
      let last: string | null = null;
      try {
        last = await AsyncStorage.getItem(lastStatusKey(uid));
      } catch {
        last = null;
      }
      const wasWaiting = last === 'PENDING' || last === 'DOCS_APPROVED';
      if (status === 'APPROVED' && wasWaiting) setPrompt('welcome');
      try {
        await AsyncStorage.setItem(lastStatusKey(uid), status);
      } catch {
        // Per-device convenience only.
      }
    })();
  }, [uid, isDriver, isSuccess, status, modeLoaded, stillOnFleet]);

  const close = useCallback(() => {
    if (prompt === 'leave_fleet' && uid) leaveFleetDismissedFor.add(uid);
    setPrompt(null);
  }, [prompt, uid]);

  const goLeaveFleet = useCallback(() => {
    if (uid) leaveFleetDismissedFor.add(uid);
    setPrompt(null);
    router.push(ROUTES.driverWalletSelf() as Parameters<typeof router.push>[0]);
  }, [router, uid]);

  const goStart = useCallback(() => {
    setPrompt(null);
    router.push(ROUTES.driverDcoStatus() as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!prompt || invitePopupOpen) return null;

  const isWelcome = prompt === 'welcome';
  const Icon = isWelcome ? PartyPopper : CheckCircle2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.emeraldMuted }]}>
            <Icon size={26} color={colors.emerald} strokeWidth={2.2} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {isWelcome ? "You're now a DCO" : "You're approved as a DCO 🎉"}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {isWelcome
              ? 'You can now take trips as an independent owner-operator. Add your vehicle to start bidding.'
              : 'Pulse admin approved your DCO request. Leave your current fleet to start as a DCO — your DCO status turns on as soon as you leave.'}
          </Text>

          <Pressable
            onPress={isWelcome ? goStart : goLeaveFleet}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.emerald, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isWelcome ? 'Get started' : 'Leave fleet'}
          >
            <Text style={styles.primaryText}>{isWelcome ? 'Get started' : 'Leave fleet'}</Text>
          </Pressable>
          <Pressable
            onPress={close}
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel={isWelcome ? 'Close' : 'Later'}
          >
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
              {isWelcome ? 'Close' : 'Later'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 6,
  },
  primary: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: Theme.textOnPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
