import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { mapDriverInvitesSentToProtocolItems } from '@/lib/globalSync/driverInviteProtocol.util';
import { useInboundProtocolInvites } from '@/lib/globalSync/useInboundProtocolInvites';
import { useDriverInvitesSentQuery } from '@/lib/queries/useNetworkQueries';
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

/** Connection protocol invites plus pending fleet driver invitations (sent tab). */
export function useProtocolInvitesWithDriverSent(orgId: string | null) {
  const protocol = useInboundProtocolInvites(orgId);
  const driverInvitesSentQ = useDriverInvitesSentQuery(orgId);
  const queryClient = useQueryClient();

  // Live: driver declined / asked for changes / accepted → refresh the Sent list.
  const refetchSent = driverInvitesSentQ.refetch;
  useEffect(() => {
    if (!orgId) return;
    return subscribeSharedPostgresChanges(
      `driver-invites-sent-${orgId}`,
      [
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_invites',
          filter: `from_organization_id=eq.${orgId}`,
        },
      ],
      (payload) => {
        const id = (payload.new as { id?: string } | null)?.id;
        if (id) {
          void queryClient.invalidateQueries({ queryKey: ['q', 'driverInviteDetails', id] });
        }
        void refetchSent();
      },
    );
  }, [orgId, queryClient, refetchSent]);

  const driverSentItems = useMemo(
    () => mapDriverInvitesSentToProtocolItems(driverInvitesSentQ.data ?? [], orgId),
    [driverInvitesSentQ.data, orgId],
  );

  const sentItems = useMemo((): InboundProtocolInviteItem[] => {
    const merged = [...protocol.sentItems, ...driverSentItems];
    // Driver change requests need an answer, so they go first; then newest first.
    const needsAnswer = (i: InboundProtocolInviteItem) =>
      i.driverInviteStatus === 'countered' ? 0 : 1;
    return merged.sort(
      (a, b) =>
        needsAnswer(a) - needsAnswer(b) ||
        String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  }, [protocol.sentItems, driverSentItems]);

  /** Drivers who asked for changes — the fleet must answer (Keep / Revise / Withdraw). */
  const driverChangesAskedCount = useMemo(
    () => driverSentItems.filter((i) => i.driverInviteStatus === 'countered').length,
    [driverSentItems],
  );

  return {
    ...protocol,
    sentItems,
    driverChangesAskedCount,
    /** Received invites + driver change requests: everything waiting on this org. */
    actionNeededCount: protocol.pendingCount + driverChangesAskedCount,
    driverSentItems,
    refetchDriverInvitesSent: () => driverInvitesSentQ.refetch(),
  };
}
