import type { NetworkNotificationRow } from '@/features/network/services/networkNotifications.service';
import {
  REGISTRY_ACCESS_NONE,
  indentPrimaryAction,
  laneBidInviteChannel,
  networkNotificationAction,
} from '@/lib/alertRegistry/registryNotificationAccess.util';
import { resolveNetworkRegistryAvatar } from '@/lib/alertRegistry/registryNotificationAvatar.util';
import { collapsePoolNetworkNotifications } from '@/lib/globalSync/networkLaneNotifications.util';
import { ROUTES } from '@/lib/routes';

jest.mock('@/lib/partyAvatarDisplay', () => ({ driverAvatarSeedFromId: (id: string) => id }));

const row = (p: Partial<NetworkNotificationRow>): NetworkNotificationRow => ({
  id: 'n1',
  organization_id: 'carrier',
  actor_org_id: 'shipper',
  event_type: 'quote_requested',
  status: 'open',
  title: 'Quote requested on SAT812GOGIND003892',
  subtitle: 'Periya → Coimbatore',
  amount_meta: 30000,
  indent_id: 'ind-1',
  quote_id: null,
  bid_id: null,
  payload_json: {},
  created_at: '2026-11-12T10:00:00Z',
  updated_at: null,
  read_at: null,
  handled_at: null,
  ...p,
});

const networkInvite = row({
  id: 'n-net',
  title: 'Rate request on SAT812GOGIND003892',
  payload_json: { kind: 'lane_bid_invite', channel: 'network', lane_invite_id: 'inv-1', indent_code: 'SAT812GOGIND003892' },
});
const marketplaceInvite = row({
  id: 'n-mkt',
  actor_org_id: null,
  indent_id: null,
  title: 'Marketplace rate request',
  payload_json: { kind: 'lane_bid_invite', channel: 'marketplace', lane_invite_id: 'inv-2' },
});

const bidder = { ...REGISTRY_ACCESS_NONE, indents: true, indentBid: true, findLoads: true };

describe('laneBidInviteChannel', () => {
  it('reads the channel from the payload and treats a missing channel as Marketplace', () => {
    expect(laneBidInviteChannel(networkInvite)).toBe('network');
    expect(laneBidInviteChannel(marketplaceInvite)).toBe('marketplace');
    expect(laneBidInviteChannel(row({ payload_json: { kind: 'lane_bid_invite' } }))).toBe('marketplace');
    expect(laneBidInviteChannel(row({}))).toBeNull();
  });
});

describe('networkNotificationAction', () => {
  it.each([
    ['Network', networkInvite],
    ['Marketplace', marketplaceInvite],
  ])('%s rate request opens My Bids → Rate requests, not the indent quote form', (_name, item) => {
    expect(networkNotificationAction(item, bidder)).toEqual({
      label: 'Open rate requests',
      enabled: true,
      href: ROUTES.FIND_LOADS_MY_BIDS,
    });
  });

  it('rate request needs bid access and Find Loads access', () => {
    expect(networkNotificationAction(marketplaceInvite, { ...bidder, indentBid: false }).enabled).toBe(false);
    expect(networkNotificationAction(marketplaceInvite, { ...bidder, findLoads: false }).enabled).toBe(false);
    expect(networkNotificationAction(marketplaceInvite, { ...bidder, indents: false }).enabled).toBe(false);
  });

  it('ordinary quote request keeps its label, gate and indent target', () => {
    const plain = row({});
    const action = networkNotificationAction(plain, bidder);
    expect(action.href).toBe(ROUTES.indentDetail('ind-1'));
    expect({ label: action.label, enabled: action.enabled }).toEqual(indentPrimaryAction('quote_requested', bidder));
    expect(action.label).toBe('Send quote');
    expect(networkNotificationAction(plain, { ...REGISTRY_ACCESS_NONE, indents: true }).label).toBe('View indent');
  });

  it('other events keep routing to the indent', () => {
    expect(networkNotificationAction(row({ event_type: 'bid_received' }), bidder).href).toBe(
      ROUTES.indentDetail('ind-1'),
    );
    expect(networkNotificationAction(row({ indent_id: null }), bidder).href).toBeNull();
  });
});

describe('rate request avatar', () => {
  const ctx = {
    partnerDisplay: {
      shipper: { organizationName: 'Shipper One', logoUrl: 'https://x/logo.png' },
    } as never,
    partnerAvatarUri: { shipper: 'https://x/a.png' },
    linkedOrgs: { shipper: { organizationName: 'Shipper One', logoUrl: 'https://x/logo.png' } } as never,
  };

  it('Marketplace rate request is anonymous even if an actor id slips through', () => {
    const avatar = resolveNetworkRegistryAvatar({ ...marketplaceInvite, actor_org_id: 'shipper' }, ctx);
    expect(avatar.name).toBe('Marketplace');
    expect(avatar.organizationImageUrl).toBeNull();
    expect(avatar.avatarUrl).toBeNull();
    expect(avatar.organizationAvatarSeed).toBeNull();
    expect(JSON.stringify(avatar)).not.toContain('shipper');
  });

  it('Network rate request names the shipper', () => {
    expect(resolveNetworkRegistryAvatar(networkInvite, ctx).name).toBe('Shipper One');
  });
});

describe('rate request grouping', () => {
  it('never merges a rate request into an ordinary quote request card', () => {
    const groups = collapsePoolNetworkNotifications([row({ id: 'plain' }), networkInvite]);
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      const kinds = new Set(
        [group.lead.id, ...group.memberIds].map((id) => (id === 'plain' ? 'plain' : 'invite')),
      );
      expect(kinds.size).toBe(1);
    }
  });

  it('keeps each anonymous Marketplace rate request on its own card', () => {
    const groups = collapsePoolNetworkNotifications([
      marketplaceInvite,
      { ...marketplaceInvite, id: 'n-mkt-2' },
    ]);
    expect(groups).toHaveLength(2);
  });
});
