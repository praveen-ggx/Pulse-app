/**
 * Marketplace Loads: Discover lists pooled opportunities (one per live lane)
 * from the lanes RPC alone; lane loads are only fetched on the pool screen.
 */
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FindLoadsScreen from '../index';
import * as findLoadsForOrgService from '@/features/network/services/findLoadsForOrg.service';
import * as vehiclesService from '@/features/vehicles/services/vehicles.service';

jest.mock('react-native', () => jest.requireActual('react-native'));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/layoutInsets', () => ({
  useLayoutInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0, isDesktopWeb: false }),
}));
jest.mock('@/lib/useMemberAccess', () => ({
  useMemberAccess: () => ({ can: () => true, isLoading: false }),
}));
const mockUseOptionalOrganization = jest.fn(() => ({
  currentOrganization: { id: 'org-1' },
  isLoading: false,
}));
jest.mock('@/contexts/OrganizationContext', () => ({
  useOptionalOrganization: () => mockUseOptionalOrganization(),
}));

const LANES = [
  { pickup_area: 'Bhandara', drop_location: 'Bengaluru', vehicle_type: '40 FT', load_count: 3 },
  { pickup_area: 'Periyapalayam', drop_location: 'Poonamallee', vehicle_type: 'Container 20ft', load_count: 104 },
];

jest.mock('@/features/network/services/findLoadsForOrg.service', () => {
  const actual = jest.requireActual('@/features/network/services/findLoadsForOrg.service');
  return {
    ...actual,
    listOpenMarketplaceLoadsPage: jest.fn(),
    listMarketplaceSearchLanes: jest.fn(),
    listMyOrgMarketBids: jest.fn(),
    submitOrgMarketBid: jest.fn(),
  };
});
jest.mock('@/features/vehicles/services/vehicles.service', () => ({
  getVehiclesByOrganization: jest.fn(),
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FindLoadsScreen />
    </QueryClientProvider>,
  );
}

describe('Find Loads (organization) — pooled opportunities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockUseOptionalOrganization.mockReturnValue({
      currentOrganization: { id: 'org-1' },
      isLoading: false,
    });
    (vehiclesService.getVehiclesByOrganization as jest.Mock).mockResolvedValue({
      error: null,
      vehicles: [{ vehicle_type: '40 FT' }],
    });
    (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mockResolvedValue({
      error: null,
      lanes: LANES,
    });
    (findLoadsForOrgService.listMyOrgMarketBids as jest.Mock).mockResolvedValue({
      error: null,
      bids: [],
    });
    (findLoadsForOrgService.listOpenMarketplaceLoadsPage as jest.Mock).mockResolvedValue({
      error: null,
      loads: [],
      hasMore: false,
      nextOffset: undefined,
    });
  });

  it('renders one pooled card per lane with route, vehicle and load count', async () => {
    const screen = renderScreen();
    expect(
      await screen.findByLabelText(
        'Pooled opportunity, Bhandara to Bengaluru, 40 Ft, 3 loads',
      ),
    ).toBeTruthy();
    expect(screen.getByText('POOLED · 104 LOADS')).toBeTruthy();
    expect(screen.getAllByLabelText('Pool status: Open for bids')).toHaveLength(2);
  });

  it('renders a one-indent lane as a pool of one, with no indent or shipper identity', async () => {
    (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mockResolvedValue({
      error: null,
      lanes: [
        { pickup_area: 'Delhi', drop_location: 'Hyderabad', vehicle_type: '32 FT', load_count: 1 },
      ],
    });
    const screen = renderScreen();
    expect(await screen.findByText('POOLED · 1 LOAD')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Pooled opportunity,/)).toHaveLength(1);
    for (const hidden of [/IND-/, /Pvt Ltd/, /Select all/, /selected/]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it('merges case-only duplicate lanes into one card with one target and a summed count', async () => {
    (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mockResolvedValue({
      error: null,
      lanes: [
        { pickup_area: 'Bhandara', drop_location: 'Bengaluru', vehicle_type: '40 FT', load_count: 3 },
        { pickup_area: 'bhandara', drop_location: 'BENGALURU', vehicle_type: '40 ft', load_count: 2 },
      ],
    });
    const screen = renderScreen();
    expect(await screen.findByText('POOLED · 5 LOADS')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Pooled opportunity,/)).toHaveLength(1);
    fireEvent.press(screen.getByLabelText(/^Pooled opportunity,/));
    expect(mockPush).toHaveBeenCalledWith(
      '/find-loads/pool?pickup=Bhandara&drop=Bengaluru&vehicle=40%20FT',
    );
  });

  it('never fetches per-load rows or offers per-load bidding on the list', async () => {
    const screen = renderScreen();
    expect((await screen.findAllByText('Bid')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Place your bid')).toBeNull();
    expect(screen.queryByText(/IND-/)).toBeNull();
  });

  it('opens the pool detail route for a card', async () => {
    const screen = renderScreen();
    fireEvent.press(
      await screen.findByLabelText('Pooled opportunity, Bhandara to Bengaluru, 40 Ft, 3 loads'),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/find-loads/pool?pickup=Bhandara&drop=Bengaluru&vehicle=40%20FT',
    );
    fireEvent.press(screen.getByLabelText('Bid on pool, Bhandara to Bengaluru'));
    expect(mockPush).toHaveBeenCalledWith(
      '/find-loads/pool?pickup=Bhandara&drop=Bengaluru&vehicle=40%20FT&bid=1',
    );
  });

  it('never marks a list card from route-level bids, which carry no lane identity', async () => {
    (findLoadsForOrgService.listMyOrgMarketBids as jest.Mock).mockResolvedValue({
      error: null,
      bids: [
        { id: 'b1', indent_id: 'i1', pickup_area: 'Bhandara', drop_location: 'Bengaluru', status: 'pending' },
        { id: 'b2', indent_id: 'old', pickup_area: 'Bhandara', drop_location: 'Bengaluru', status: 'accepted' },
      ],
    });
    const screen = renderScreen();
    await screen.findByText('POOLED · 3 LOADS');
    expect(screen.getAllByLabelText('Pool status: Open for bids')).toHaveLength(2);
    expect(screen.queryByLabelText('Pool status: Your bid submitted')).toBeNull();
    expect(screen.queryByLabelText('Pool status: Awarded')).toBeNull();
  });

  it('narrows the pool list with the lane filters', async () => {
    const screen = renderScreen();
    await screen.findByText('POOLED · 104 LOADS');
    fireEvent.press(screen.getByLabelText('Pickup city'));
    fireEvent.press(await screen.findByLabelText('Pickup Bhandara, 3 available'));
    await waitFor(() => expect(screen.queryByText('POOLED · 104 LOADS')).toBeNull());
    expect(screen.getByText('POOLED · 3 LOADS')).toBeTruthy();
  });

  it('shows the error state with Retry when the lanes RPC fails', async () => {
    (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mockResolvedValue({
      error: new Error('permission denied for function list_marketplace_search_lanes'),
      lanes: [],
    });
    const screen = renderScreen();
    expect(await screen.findByText("Couldn't load Marketplace pools.")).toBeTruthy();
    const callsBefore = (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mock.calls
      .length;
    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() =>
      expect(
        (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(callsBefore),
    );
  });

  it('shows empty copy, never the error copy, when no lanes are open', async () => {
    (findLoadsForOrgService.listMarketplaceSearchLanes as jest.Mock).mockResolvedValue({
      error: null,
      lanes: [],
    });
    const screen = renderScreen();
    expect(await screen.findByText('No open Marketplace loads right now.')).toBeTruthy();
    expect(screen.queryByText("Couldn't load Marketplace pools.")).toBeNull();
  });

  it('opens on My Bids when linked from an awarded pool', async () => {
    mockParams = { segment: 'my-bids' };
    const screen = renderScreen();
    expect(await screen.findByText('No Marketplace bids yet')).toBeTruthy();
  });

  it('does not throw when OrganizationProvider is missing', () => {
    mockUseOptionalOrganization.mockReturnValue(undefined as never);
    expect(() => renderScreen()).not.toThrow();
  });
});
