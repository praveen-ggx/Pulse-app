import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  bundleAdjustmentToTripAdjustment,
  bundleTransactionToLedgerRow,
  loadLedgerEntryBootstrap,
} from "@/features/finance/utils/ledgerEntryBootstrap.util";

jest.mock("@/lib/queries/useTripDetailBundleQuery", () => ({
  peekTripDetailBundleCache: jest.fn(),
  fetchTripDetailBundle: jest.fn(),
}));

jest.mock("@/features/trips/services/trips.service", () => {
  const actual = jest.requireActual("@/features/trips/services/trips.service");
  return {
    ...actual,
    getTripsForOrg: jest.fn(),
    getTripsWhereOrgIsClient: jest.fn(),
  };
});

jest.mock("@/features/finance/services/finance.service", () => ({
  getTransactionsByOrganization: jest.fn(),
}));

jest.mock("@/features/trips/services/tripAdjustments", () => {
  const actual = jest.requireActual("@/features/trips/services/tripAdjustments");
  return {
    ...actual,
    fetchTripFinanceAdjustmentsByTripIds: jest.fn(),
  };
});

import {
  fetchTripDetailBundle,
  peekTripDetailBundleCache,
} from "@/lib/queries/useTripDetailBundleQuery";
import { getTripsForOrg, getTripsWhereOrgIsClient } from "@/features/trips/services/trips.service";
import { getTransactionsByOrganization } from "@/features/finance/services/finance.service";
import { fetchTripFinanceAdjustmentsByTripIds } from "@/features/trips/services/tripAdjustments";

const peekBundle = peekTripDetailBundleCache as jest.MockedFunction<
  typeof peekTripDetailBundleCache
>;
const mockFetchBundle = fetchTripDetailBundle as jest.MockedFunction<
  typeof fetchTripDetailBundle
>;
const mockGetTripsForOrg = getTripsForOrg as jest.MockedFunction<typeof getTripsForOrg>;
const mockGetTripsWhereOrgIsClient = getTripsWhereOrgIsClient as jest.MockedFunction<
  typeof getTripsWhereOrgIsClient
>;
const mockGetTx = getTransactionsByOrganization as jest.MockedFunction<
  typeof getTransactionsByOrganization
>;
const mockFetchAdj = fetchTripFinanceAdjustmentsByTripIds as jest.MockedFunction<
  typeof fetchTripFinanceAdjustmentsByTripIds
>;

const ORG = "org-1";
const TRIP = "trip-1";

function emptyBundle(): Record<string, unknown> {
  return {
    trip: {
      id: TRIP,
      organization_id: ORG,
      trip_number: "MSN-001",
      display_trip_id: "MSN-001",
      driver_display_trip_id: null,
      indent_id: null,
      source: "manual",
      pickup_area: "A",
      drop_location: "B",
      distance: 10,
      estimated_duration: null,
      client_id: "c1",
      client_name: "Client",
      supplier_id: "s1",
      driver_id: "d1",
      vehicle_id: "v1",
      driver_display_name: "Driver",
      vehicle_display_number: "KA01",
      client_price: 1000,
      supplier_rate: 800,
      margin: 200,
      platform_fee: 0,
      driver_commission: 0,
      is_guaranteed: false,
      payment_status: "unpaid",
      amount_paid: 0,
      advance_paid: 0,
      status: "completed",
      pickup_date: null,
      started_at: null,
      completed_at: null,
      load_type: null,
      load_tons: null,
      notes: null,
      created_at: null,
      updated_at: null,
      pickup_lat: null,
      pickup_lon: null,
      drop_lat: null,
      drop_lon: null,
      owner_user_id: null,
      created_by_user_id: null,
      assigned_by_user_id: null,
      trip_payout_mode: null,
      operating_mode: null,
      dco_payee_id: null,
      last_location_at: null,
      actual_distance_traveled_km: null,
      last_location_chat_at: null,
    },
    assignment_audit: [],
    driver: {
      id: "d1",
      name: "Driver",
      phone: "1",
      avatar_url: null,
      avatar_seed: null,
      user_id: null,
      organization_id: ORG,
    },
    vehicle: {
      id: "v1",
      vehicle_number: "KA01",
      vehicle_type: null,
      capacity: null,
      vehicle_brand: null,
      vehicle_body_type: null,
      organization_id: ORG,
      supplier_id: null,
      status: "active",
      documents: null,
    },
    client_detail: {
      client: {
        id: "c1",
        name: "Client",
        phone: null,
        avatar_url: null,
        avatar_seed: null,
        linked_organization_id: null,
        organization_id: ORG,
        status: "active",
      },
      linked_org: null,
    },
    supplier_detail: null,
    transactions: [
      {
        id: "tx1",
        organization_id: ORG,
        trip_id: TRIP,
        party_name: "Client",
        description: "in",
        amount_in: 100,
        amount_out: 0,
        transaction_date: "2026-01-01",
        created_at: "2026-01-01",
        contact_id: "c1",
        contact_type: "client",
        ledger_entity_type: null,
        ledger_flow_type: null,
        ledger_category: null,
      },
    ],
    adjustments: [],
    documents: [],
    otp: null,
    latest_driver_location: null,
  };
}

describe("ledgerEntryBootstrap.util", () => {
  beforeEach(() => {
    peekBundle.mockReset();
    mockFetchBundle.mockReset();
    mockGetTripsForOrg.mockReset();
    mockGetTripsWhereOrgIsClient.mockReset();
    mockGetTx.mockReset();
    mockFetchAdj.mockReset();
  });

  it("maps bundle transactions to ledger rows", () => {
    const row = bundleTransactionToLedgerRow(
      {
        id: "tx1",
        organization_id: ORG,
        trip_id: TRIP,
        party_name: "A",
        description: "d",
        amount_in: 10,
        amount_out: 0,
        transaction_date: "2026-01-01",
        created_at: null,
        contact_id: null,
        contact_type: "client",
        ledger_entity_type: null,
        ledger_flow_type: null,
        ledger_category: null,
      },
      "MSN-001",
    );
    expect(row.trip_number).toBe("MSN-001");
    expect(row.amount_in).toBe(10);
    expect(row.contact_type).toBe("client");
  });

  it("maps bundle adjustments", () => {
    const adj = bundleAdjustmentToTripAdjustment({
      id: "a1",
      trip_id: TRIP,
      organization_id: ORG,
      type: "revenue",
      impact: "plus",
      amount: 50,
      reason: "Detention",
      mission_key: null,
      created_at: "2026-01-01",
      created_by: null,
      voided_at: null,
      void_reason: null,
    });
    expect(adj.type).toBe("revenue");
    expect(adj.amount).toBe(50);
  });

  it("trip-locked paint uses bundle and does not call org trip catalog RPCs", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    peekBundle.mockReturnValue(emptyBundle());

    const result = await loadLedgerEntryBootstrap(qc, {
      orgId: ORG,
      tripId: TRIP,
      partyKnown: true,
      duesFromQuery: true,
    });

    expect(mockGetTripsForOrg).not.toHaveBeenCalled();
    expect(mockGetTripsWhereOrgIsClient).not.toHaveBeenCalled();
    expect(mockGetTx).not.toHaveBeenCalled();
    expect(mockFetchAdj).not.toHaveBeenCalled();
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.id).toBe(TRIP);
    expect(result.transactions).toHaveLength(1);
    expect(result.clients[0]?.id).toBe("c1");
    expect(result.drivers[0]?.id).toBe("d1");
    expect(result.driverOffers).toEqual({});
    expect(mockFetchBundle).not.toHaveBeenCalled();
  });

  it("trip-locked peek miss does not fetch get_trip_detail_bundle on the splash path", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    peekBundle.mockReturnValue(undefined);
    qc.setQueryData(queryKeys.trips.finite(ORG), [
      {
        id: TRIP,
        organization_id: ORG,
        trip_number: "MSN-001",
        client_price: 100,
        supplier_rate: 80,
      },
    ]);
    qc.setQueryData(queryKeys.clients.finite(ORG), []);
    qc.setQueryData(queryKeys.suppliers.finite(ORG), []);
    qc.setQueryData(queryKeys.drivers.finite(ORG), []);
    qc.setQueryData(queryKeys.vehicles.finite(ORG), []);

    const result = await loadLedgerEntryBootstrap(qc, {
      orgId: ORG,
      tripId: TRIP,
      partyKnown: true,
      duesFromQuery: true,
    });

    expect(mockFetchBundle).not.toHaveBeenCalled();
    expect(mockGetTripsForOrg).not.toHaveBeenCalled();
    expect(mockGetTx).not.toHaveBeenCalled();
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.id).toBe(TRIP);
  });

  it("finance-unlocked hydrates trips from canonical finite cache without catalog RPC", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.clients.finite(ORG), []);
    qc.setQueryData(queryKeys.suppliers.finite(ORG), []);
    qc.setQueryData(queryKeys.drivers.finite(ORG), []);
    qc.setQueryData(queryKeys.vehicles.finite(ORG), []);
    qc.setQueryData(queryKeys.trips.finite(ORG), [
      {
        id: TRIP,
        organization_id: ORG,
        trip_number: "MSN-001",
        client_price: 100,
        supplier_rate: 80,
      },
    ]);
    qc.setQueryData(queryKeys.trips.whereOrgIsClient(ORG), []);
    qc.setQueryData(queryKeys.transactions.finite(ORG), []);
    mockFetchAdj.mockResolvedValue(new Map());

    const result = await loadLedgerEntryBootstrap(qc, {
      orgId: ORG,
      partyKnown: false,
      duesFromQuery: false,
    });

    expect(mockGetTripsForOrg).not.toHaveBeenCalled();
    expect(result.trips[0]?.id).toBe(TRIP);
    expect(mockFetchAdj).toHaveBeenCalled();
  });

  it("skips org-wide adjustment fetch when dues already come from the CTA", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.clients.finite(ORG), []);
    qc.setQueryData(queryKeys.suppliers.finite(ORG), []);
    qc.setQueryData(queryKeys.drivers.finite(ORG), []);
    qc.setQueryData(queryKeys.vehicles.finite(ORG), []);
    qc.setQueryData(queryKeys.trips.finite(ORG), []);
    qc.setQueryData(queryKeys.trips.whereOrgIsClient(ORG), []);
    qc.setQueryData(queryKeys.transactions.finite(ORG), []);

    await loadLedgerEntryBootstrap(qc, {
      orgId: ORG,
      partyKnown: false,
      duesFromQuery: true,
    });

    expect(mockFetchAdj).not.toHaveBeenCalled();
  });
});
