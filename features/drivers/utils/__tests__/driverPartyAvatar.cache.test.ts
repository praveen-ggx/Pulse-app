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
  clearDriverPartyAvatarCache,
  clearDriverPartyAvatarCacheForTests,
  resolveDriverPartyAvatar,
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

  it("keeps a client lookup and an organization lookup in separate caches", async () => {
    const sharedId = "11111111-1111-4111-8111-111111111111";
    mockGetLinkedOrgProfilesBatch.mockResolvedValue({});
    mockGetLinkedOrgProfile.mockResolvedValue({
      error: null,
      profile: { avatarUrl: "https://cdn.example/org.png", avatarSeed: "org" },
    });
    const orgTrip = trip("t-org", "");
    orgTrip.organization_id = sharedId;
    await resolveDriverPartyAvatar(`shipper:org:${sharedId}`, [orgTrip]);
    await resolveDriverPartyAvatar(`shipper:org:${sharedId}`, [orgTrip]);
    await resolveDriverTripCounterpartyAvatarMap([trip("t-client", sharedId)]);
    await resolveDriverTripCounterpartyAvatarMap([trip("t-client", sharedId)]);
    expect(mockGetLinkedOrgProfile).toHaveBeenCalledTimes(1);
    expect(mockGetClientDetails).toHaveBeenCalledTimes(1);
    expect(mockGetLinkedOrgProfile.mock.calls[0][0]).toBe(sharedId);
    expect(mockGetClientDetails.mock.calls[0][0]).toBe(sharedId);
  });

  it("drops cached identities when the workspace cache is cleared", async () => {
    await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
    clearDriverPartyAvatarCache();
    await resolveDriverTripCounterpartyAvatarMap([trip("t1", "c1")]);
    expect(mockGetClientDetails).toHaveBeenCalledTimes(2);
  });
});
