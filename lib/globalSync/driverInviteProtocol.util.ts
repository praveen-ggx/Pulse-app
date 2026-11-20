import type { DriverInviteSentRow } from '@/features/drivers/services/drivers.service';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';

const DECLINED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Map fleet driver invites sent by the org into Inbound Protocol cards.
 * Only the latest invite per driver is shown: pending, countered (driver asked
 * for changes — the fleet must answer) or recently declined (so the owner
 * knows; it no longer silently disappears).
 */
export function mapDriverInvitesSentToProtocolItems(
  invites: DriverInviteSentRow[],
  orgId?: string | null,
  now: number = Date.now(),
): InboundProtocolInviteItem[] {
  const seen = new Set<string>();
  const items: InboundProtocolInviteItem[] = [];
  const sorted = [...invites].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  for (const row of sorted) {
    const who = String(row.to_user_id ?? row.id);
    if (seen.has(who)) continue;
    seen.add(who);
    const status = String(row.status ?? '').toLowerCase();
    if (status !== 'pending' && status !== 'countered' && status !== 'rejected') continue;
    if (status === 'rejected') {
      const at = Date.parse(String(row.created_at ?? ''));
      if (!Number.isFinite(at) || now - at > DECLINED_VISIBLE_MS) continue;
    }
    items.push({
      id: row.id,
      name: (row.driver_name ?? 'Driver').trim() || 'Driver',
      subtitle:
        status === 'countered'
          ? 'Driver asked for changes'
          : status === 'rejected'
            ? 'Driver declined'
            : 'Fleet driver invitation',
      type: 'DRIVER',
      kind: 'driver' as const,
      partnerOrgId: row.to_user_id ?? row.id,
      createdAt: row.created_at,
      avatarUri: null,
      driverInviteStatus: status as 'pending' | 'countered' | 'rejected',
      fromOrgId: orgId ?? null,
    });
  }
  return items;
}
