import { DriverInviteModal } from '@/components/driver/DriverInviteModal';
import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import * as driversService from '@/features/drivers/services/drivers.service';
import {
  driverInvitesReceivedQueryKey,
  useDriverInvitesQuery,
} from '@/lib/queries/useDriverInvitesQuery';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { subscribeSignificantAppResume } from '@/lib/significantAppResume';
import { syncAndInvalidateLinkedDrivers } from '@/lib/syncLinkedDriversForDriverHome';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { showAppAlert } from '@/lib/appAlert';
import { DriverInviteChangeRequestModal } from '@/features/drivers/components/DriverInviteChangeRequestModal';
import {
  declineDriverInviteWithReason,
  requestDriverInviteChangesByMessage,
} from '@/features/drivers/services/driverInviteNegotiation.service';
import { askDeclineReason } from '@/features/drivers/utils/askDeclineReason.util';

type DriverInviteModalContextValue = {
  allInvites: DriverInviteRow[];
  pendingCount: number;
  pendingInvites: DriverInviteRow[];
  refreshInvites: () => Promise<void>;
  presentPendingInvite: () => void;
  fleetConnectionRevision: number;
  bumpFleetConnectionRevision: () => void;
};

const DriverInviteModalContext = createContext<DriverInviteModalContextValue | null>(null);

export function useOptionalDriverInviteModal(): DriverInviteModalContextValue | null {
  return useContext(DriverInviteModalContext);
}

export function useDriverInviteModal(): DriverInviteModalContextValue {
  const ctx = useContext(DriverInviteModalContext);
  if (!ctx) {
    throw new Error('useDriverInviteModal must be used within DriverInviteModalProvider');
  }
  return ctx;
}

export function DriverInviteModalProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const queryClient = useQueryClient();

  const {
    allInvites,
    pendingInvites,
    pendingCount,
    refreshInvites,
    isError,
    error,
  } = useDriverInvitesQuery(uid);

  const [sessionSnoozedIds, setSessionSnoozedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<DriverInviteRow | null>(null);
  /** Invite the driver is sending changed pay terms for (popup hides meanwhile). */
  const [counterTarget, setCounterTarget] = useState<DriverInviteRow | null>(null);
  const [fleetConnectionRevision, setFleetConnectionRevision] = useState(0);

  const bumpFleetConnectionRevision = useCallback(() => {
    setFleetConnectionRevision((n) => n + 1);
  }, []);

  const invalidateInvites = useCallback(() => {
    if (!uid) return;
    void queryClient.invalidateQueries({
      queryKey: driverInvitesReceivedQueryKey(uid),
    });
  }, [queryClient, uid]);

  const clearSessionSnooze = useCallback(() => {
    setSessionSnoozedIds(new Set());
  }, []);

  useEffect(() => {
    if (!isError || !__DEV__ || !error) return;
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[DriverInviteModal] invites query:', msg);
  }, [isError, error]);

  /** Significant resume only — brief inactive→active must not clear Later snooze. */
  useEffect(() => {
    if (!uid) return;

    const unsubResume = subscribeSignificantAppResume(() => {
      invalidateInvites();
    });
    return () => {
      unsubResume();
    };
  }, [uid, invalidateInvites]);

  /** Event-driven refresh when fleet sends or updates an invitation. */
  useEffect(() => {
    if (!uid) return;

    return subscribeSharedPostgresChanges(
      `driver-invites-received-${uid}`,
      [
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_invites',
          filter: `to_user_id=eq.${uid}`,
        },
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_invites',
          filter: `to_user_id=eq.${uid}`,
        },
      ],
      (payload) => {
        const row = payload.new as { status?: string } | null;
        const isPending =
          row != null && String(row.status ?? '').toLowerCase() === 'pending';
        invalidateInvites();
        if (isPending) clearSessionSnooze();
      },
    );
  }, [uid, invalidateInvites, clearSessionSnooze]);

  const visiblePendingInvites = useMemo(
    () => pendingInvites.filter((i) => !sessionSnoozedIds.has(i.id)),
    [pendingInvites, sessionSnoozedIds],
  );

  const activeInvite = visiblePendingInvites[0] ?? null;
  const showModal = !!activeInvite && !declineTarget && !counterTarget;

  const presentPendingInvite = useCallback(() => {
    clearSessionSnooze();
    if (pendingCount === 0) void refreshInvites();
  }, [pendingCount, refreshInvites, clearSessionSnooze]);

  const handleLater = useCallback(() => {
    // Snooze every currently visible pending invite so Later is one tap.
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev);
      for (const invite of visiblePendingInvites) next.add(invite.id);
      return next;
    });
  }, [visiblePendingInvites]);

  const handleAccept = useCallback(async () => {
    if (!activeInvite) return;
    setBusyId(activeInvite.id);
    const { error: acceptError } = await driversService.acceptDriverInvite(activeInvite.id);
    setBusyId(null);
    if (acceptError) {
      // Alert.alert from react-native is a NO-OP on react-native-web, so on
      // gx-pulse.netlify.app this error was raised, returned, and then shown to
      // nobody — the Accept button looked dead. That silence is what led the
      // driver to tap Decline instead, permanently burning the invite.
      // showAppAlert routes to the themed modal, falling back to window.alert.
      showAppAlert(
        'Accept failed',
        acceptError.message ?? 'Could not accept invite. Try again.',
      );
      return;
    }
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev);
      next.delete(activeInvite.id);
      return next;
    });
    invalidateInvites();
    bumpFleetConnectionRevision();
    // Phase 2: sync linked driver rows after invite accept (not inside drivers queryFn).
    if (uid) void syncAndInvalidateLinkedDrivers(queryClient, uid);
  }, [
    activeInvite,
    invalidateInvites,
    bumpFleetConnectionRevision,
    uid,
    queryClient,
  ]);

  const runDecline = useCallback(
    async (invite: DriverInviteRow, reason: string | null = null) => {
      setBusyId(invite.id);
      // Reason goes to the fleet (driver_decline_invite); falls back to the old
      // reject when the migration is missing.
      const { error: declineError } = await declineDriverInviteWithReason(invite.id, reason);
      setBusyId(null);
      setDeclineTarget(null);
      if (declineError) {
        // Same react-native-web no-op as the accept path above.
        showAppAlert(
          'Decline failed',
          declineError.message ?? 'Could not decline invite. Try again.',
        );
        return;
      }
      setSessionSnoozedIds((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
      invalidateInvites();
      bumpFleetConnectionRevision();
    },
    [invalidateInvites, bumpFleetConnectionRevision],
  );

  const handleDeclinePress = useCallback(() => {
    if (!activeInvite) return;
    const invite = activeInvite;
    void (async () => {
      const reason = await askDeclineReason();
      if (reason === undefined) return;
      await runDecline(invite, reason);
    })();
  }, [activeInvite, runDecline]);

  /** Inline reply from the popup's Messages thread. */
  const handleSendMessage = useCallback(
    async (message: string): Promise<boolean> => {
      const invite = activeInvite;
      if (!invite) return false;
      const { error: sendError } = await requestDriverInviteChangesByMessage(invite, message);
      if (sendError) {
        showAppAlert('Could not send', sendError.message);
        return false;
      }
      showAppAlert(
        'Sent to fleet',
        `${invite.from_org_name || 'The fleet'} will see your reply. You will get the invite back when they answer.`,
      );
      invalidateInvites();
      return true;
    },
    [activeInvite, invalidateInvites],
  );

  const handleRequestChangesPress = useCallback(() => {
    if (activeInvite) setCounterTarget(activeInvite);
  }, [activeInvite]);

  const submitCounter = useCallback(
    async (message: string) => {
      const invite = counterTarget;
      if (!invite) return;
      setBusyId(invite.id);
      const { error: counterError } = await requestDriverInviteChangesByMessage(invite, message);
      setBusyId(null);
      if (counterError) {
        showAppAlert('Could not send', counterError.message);
        return;
      }
      setCounterTarget(null);
      showAppAlert(
        'Sent to fleet',
        `${invite.from_org_name || 'The fleet'} will see your message. You will get the invite back when they reply.`,
      );
      invalidateInvites();
    },
    [counterTarget, invalidateInvites],
  );

  const value = useMemo(
    (): DriverInviteModalContextValue => ({
      allInvites,
      pendingCount,
      pendingInvites,
      refreshInvites,
      presentPendingInvite,
      fleetConnectionRevision,
      bumpFleetConnectionRevision,
    }),
    [
      allInvites,
      pendingCount,
      pendingInvites,
      refreshInvites,
      presentPendingInvite,
      fleetConnectionRevision,
      bumpFleetConnectionRevision,
    ],
  );

  return (
    <DriverInviteModalContext.Provider value={value}>
      {children}

      {uid && activeInvite ? (
        <DriverInviteModal
          visible={showModal}
          invite={activeInvite}
          queueIndex={
            pendingInvites.findIndex((i) => i.id === activeInvite.id) + 1 || 1
          }
          queueTotal={pendingInvites.length}
          busy={busyId === activeInvite.id}
          onAccept={() => void handleAccept()}
          onDecline={handleDeclinePress}
          onLater={handleLater}
          onRequestChanges={handleRequestChangesPress}
          onSendMessage={handleSendMessage}
        />
      ) : null}

      {uid ? (
        <DriverInviteChangeRequestModal
          visible={counterTarget != null}
          orgName={counterTarget?.from_org_name || 'the fleet'}
          offer={counterTarget ?? {}}
          submitting={counterTarget != null && busyId === counterTarget.id}
          onClose={() => setCounterTarget(null)}
          onSubmit={submitCounter}
        />
      ) : null}

      <ThemedConfirmModal
        visible={!!declineTarget}
        title="Decline invitation?"
        message="You will reject this fleet connection invitation."
        cancelText="Cancel"
        confirmText="Decline"
        variant="warning"
        confirmVariant="destructive"
        onCancel={() => setDeclineTarget(null)}
        onConfirm={() => {
          if (declineTarget) void runDecline(declineTarget);
        }}
        onRequestClose={() => setDeclineTarget(null)}
      />
    </DriverInviteModalContext.Provider>
  );
}
