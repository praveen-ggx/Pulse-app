import type { NetworkNotificationRow } from '@/features/network/services/networkNotifications.service';
import {
  networkDisconnectDriverId,
  networkDisconnectDriverName,
  networkNotificationActionText,
  networkNotificationHighlightText,
  networkNotificationTagLabel,
} from '../networkNotificationLabels.util';

function row(
  over: Partial<NetworkNotificationRow> = {},
): NetworkNotificationRow {
  return {
    id: 'n1',
    organization_id: 'org-1',
    actor_org_id: null,
    event_type: 'driver_disconnected',
    status: 'open',
    title: 'Ravi Kumar',
    subtitle: 'Disconnected from your fleet.',
    amount_meta: null,
    indent_id: null,
    quote_id: null,
    bid_id: null,
    payload_json: {
      driver_id: 'drv-1',
      driver_name: 'Ravi Kumar',
    },
    created_at: '2026-11-04T10:00:00.000Z',
    updated_at: null,
    read_at: null,
    handled_at: null,
    ...over,
  };
}

describe('networkNotificationLabels — driver_disconnected', () => {
  it('reads as left-your-fleet for the owner inbox', () => {
    expect(networkNotificationActionText('driver_disconnected')).toBe(
      'left your fleet',
    );
    expect(networkNotificationTagLabel('driver_disconnected')).toBe('Left fleet');
    expect(networkNotificationHighlightText(row())).toBe('Disconnected');
  });

  it('prefers payload driver name and id', () => {
    expect(networkDisconnectDriverName(row())).toBe('Ravi Kumar');
    expect(networkDisconnectDriverId(row())).toBe('drv-1');
  });

  it('parses legacy title "Name disconnected from your fleet"', () => {
    expect(
      networkDisconnectDriverName(
        row({
          title: 'Asha disconnected from your fleet',
          payload_json: {},
        }),
      ),
    ).toBe('Asha');
  });
});
