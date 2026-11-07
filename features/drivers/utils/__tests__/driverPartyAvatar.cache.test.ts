const mockGetClientDetails = jest.fn();
const mockGetLinkedOrgProfile = jest.fn();
const mockGetLinkedOrgProfilesBatch = jest.fn();

jest.mock("@/lib/supabase", () => ({ supabase: () => ({}) }));

jest.mock("@/lib/entityIdentity", () => ({
  resolvePartyAvatarIdentityFromClient: () => ({ avatarUrl: null, avatarSeed: null }),
}));

jest.mock("@/features/clients/services/clients.service", () => ({
  getClientDetails: (...args: unknown[]) => mockGetClientDetails(...args),
  getLinkedOrgProfile: (...args: unknown[]) => mockGetLinkedOrgProfile(...args),
  getLinkedOrgProfilesBatch: (...args: unknown[]) => mockGetLinkedOrgProfilesBatch(...args),
}));

import {
  clearDriverPartyAvatarCacheForTests,
  resolveDriverTripCounterpartyAvatarMap,
} from "@/features/drivers/utils/driverPartyAvatar.util";
import type { TripRow } from "@/features/trips/services/trips.service";

const trip = (id: string, clientId: string) =>
  ({ id, client_id: clientId, client_name: `Client ${clientId}`, organization_id: "org-1" }) as unknown as TripRow;

beforeEach(() => {
  clearDriverPartyAvatarCacheForTests();
  mockGetClientDetails.mockReset().mockImplementation(async (id: string) => ({
    error: null,
    client: { id, name: `Client ${id}`, linked_organization_id: null },
  }));
  mockGetLinkedOrgProfile.mockReset().mockResolvedValue({ error: null, profile: null });
  mockGetLinkedOrgProfilesBatch.mockReset().mockResolvedValue({});
});

describe("driver party avatar lookups", () => {
  it("fetches each client once across repeated resolutions", async () => {
    const trips = [trip("t1", "c1"), trip("t2", "c2"), trip("t3", "c1")];
    await resolveDriverTripCounterpartyAvatarMap(trips);
    await resolveDriverTripCounterpartyAvatarMap(trips);
    await resolveDriverTripCounterpartyAvatarMap(trips);
    const ids = mockGetClientDetails.mock.calls.map((call) => call[0]).sort();
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("does not cache a failed lookup", async () => {
    mockGetClientDetails.mockResolvedValueOnce({ error: new Error("network"), client: null });
    await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
    await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
    expect(mockGetClientDetails).toHaveBeenCalledTimes(2);
  });

  it("refreshes after the cache window", async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    try {
      await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
      jest.setSystemTime(1_000_000 + 5 * 60_000 + 1);
      await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
      expect(mockGetClientDetails).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
