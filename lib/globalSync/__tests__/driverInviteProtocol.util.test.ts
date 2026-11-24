import { mapDriverInvitesSentToProtocolItems } from '../driverInviteProtocol.util';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const row = (id: string, user: string, status: string, created_at: string) => ({
  id,
  from_org_name: 'GK',
  driver_name: `Driver ${user}`,
  status,
  created_at,
  to_user_id: user,
});

describe('fleet sent driver invites', () => {
  it('shows pending, changes-asked and recently declined invites', () => {
    const items = mapDriverInvitesSentToProtocolItems(
      [
        row('a', 'u1', 'pending', '2026-11-17T00:00:00Z'),
        row('b', 'u2', 'countered', '2026-11-16T00:00:00Z'),
        row('c', 'u3', 'rejected', '2026-11-15T00:00:00Z'),
        row('d', 'u4', 'accepted', '2026-11-15T00:00:00Z'),
        row('e', 'u5', 'withdrawn', '2026-11-15T00:00:00Z'),
      ],
      'org-gk',
      NOW,
    );
    expect(items.map((i) => [i.id, i.driverInviteStatus])).toEqual([
      ['a', 'pending'],
      ['b', 'countered'],
      ['c', 'rejected'],
    ]);
    expect(items[0]?.fromOrgId).toBe('org-gk');
  });

  it('only the latest invite per driver (a re-invite hides the old decline)', () => {
    const items = mapDriverInvitesSentToProtocolItems(
      [
        row('old', 'u1', 'rejected', '2026-11-10T00:00:00Z'),
        row('new', 'u1', 'pending', '2026-11-17T00:00:00Z'),
      ],
      'org',
      NOW,
    );
    expect(items.map((i) => i.id)).toEqual(['new']);
  });

  it('drops declines older than 30 days', () => {
    const items = mapDriverInvitesSentToProtocolItems(
      [row('x', 'u1', 'rejected', '2026-09-01T00:00:00Z')],
      'org',
      NOW,
    );
    expect(items).toEqual([]);
  });
});
