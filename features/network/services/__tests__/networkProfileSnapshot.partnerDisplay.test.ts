import { getOrgProfileSnapshot } from "../networkProfileSnapshot.service";

const mockGetLinkedOrgProfilesBatch = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/features/clients/services/clients.service", () => ({
  getLinkedOrgProfilesBatch: (...args: unknown[]) =>
    mockGetLinkedOrgProfilesBatch(...args),
}));

const mockGetSession = jest.fn(async () => ({
  data: { session: { access_token: "tok" } },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  }),
}));

function thenableQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.select = chain;
  q.eq = chain;
  q.is = chain;
  q.limit = chain;
  q.order = chain;
  q.maybeSingle = () => Promise.resolve(result);
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

describe("getOrgProfileSnapshot partner-display reuse", () => {
  beforeEach(() => {
    mockGetLinkedOrgProfilesBatch.mockReset();
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockGetSession.mockClear();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
  });

  it("uses getLinkedOrgProfilesBatch instead of a raw partner-display RPC", async () => {
    mockGetLinkedOrgProfilesBatch.mockResolvedValue({
      "org-target": {
        organizationName: "Gogovan",
        contactPerson: "A",
        phone: "1",
        avatarUrl: "https://cdn.example/logo.png",
        tripCount: 12,
        averageRating: 4.5,
        vehicleCount: 3,
        networkIndentCount: 2,
        orgCreatedAt: "2024-01-15T00:00:00.000Z",
        ownerSignedUpAt: "2023-06-01T00:00:00.000Z",
        verificationStatus: "verified",
      },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return thenableQuery({
          data: {
            id: "org-target",
            name: "Gogovan",
            avatar_seed: "seed",
            logo_url: null,
            city: "Chennai",
            state: "TN",
            address_line: null,
            owner_id: "user-1",
            profile_sector: null,
            profile_website: null,
            gstin: null,
            operating_model: null,
            created_at: "2024-01-15T00:00:00.000Z",
            verification_status: "verified",
          },
          error: null,
        });
      }
      if (table === "connection_requests") {
        return thenableQuery({ data: null, error: null });
      }
      if (table === "clients" || table === "suppliers") {
        return thenableQuery({ data: null, error: null });
      }
      if (table === "organization_locations") {
        return thenableQuery({ data: [], error: null });
      }
      return thenableQuery({ data: null, error: null });
    });

    const { error, snapshot } = await getOrgProfileSnapshot("org-viewer", "org-target");
    expect(error).toBeNull();
    expect(mockGetLinkedOrgProfilesBatch).toHaveBeenCalledWith(["org-target"]);
    expect(mockRpc).not.toHaveBeenCalledWith(
      "get_connection_partner_display_batch",
      expect.anything(),
    );
    expect(snapshot?.total_trips).toBe(12);
    expect(snapshot?.vehicle_count).toBe(3);
    expect(snapshot?.indent_count).toBe(2);
    expect(snapshot?.rating).toBe(4.5);
    expect(snapshot?.member_since_year).toBe(2023);
  });

  it("skips the partner-display batch when bootstrap already seeded the profile", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return thenableQuery({
          data: {
            id: "org-target",
            name: "Gogovan",
            avatar_seed: "seed",
            logo_url: null,
            city: "Chennai",
            state: "TN",
            address_line: null,
            owner_id: "user-1",
            profile_sector: null,
            profile_website: null,
            gstin: null,
            operating_model: null,
            created_at: "2024-01-15T00:00:00.000Z",
            verification_status: "verified",
          },
          error: null,
        });
      }
      return thenableQuery({ data: null, error: null });
    });

    const { error, snapshot } = await getOrgProfileSnapshot(
      "org-viewer",
      "org-target",
      {
        partnerProfile: {
          organizationName: "Gogovan",
          contactPerson: "A",
          phone: "+919600096556",
          tripCount: 686,
          vehicleCount: 2,
          networkIndentCount: 13994,
          averageRating: 3,
        },
      },
    );
    expect(error).toBeNull();
    expect(mockGetLinkedOrgProfilesBatch).not.toHaveBeenCalled();
    expect(snapshot?.phone).toBe("+919600096556");
    expect(snapshot?.total_trips).toBe(686);
    expect(snapshot?.vehicle_count).toBe(2);
    expect(snapshot?.indent_count).toBe(13994);
  });

  it("fills trip/vehicle/indent from the single RPC when batch stats are null", async () => {
    mockGetLinkedOrgProfilesBatch.mockResolvedValue({
      "org-target": {
        organizationName: "Demo Login 1",
        contactPerson: "DEMO LOGIN",
        phone: "+918787878787",
        // Batch branding row with no numeric stats (live hotfix shape).
      },
    });
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "get_connection_partner_display") {
        return {
          data: {
            organizationName: "Demo Login 1",
            phone: "+918787878787",
            tripCount: 2,
            vehicleCount: 1,
            networkIndentCount: 0,
            averageRating: null,
            ratingCount: 0,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return thenableQuery({
          data: {
            id: "org-target",
            name: "Demo Login 1",
            avatar_seed: "user-10",
            logo_url: null,
            city: "Chennai",
            state: "Tamil Nadu",
            address_line: null,
            owner_id: "user-1",
            profile_sector: null,
            profile_website: null,
            gstin: null,
            operating_model: null,
            created_at: "2026-08-01T00:00:00.000Z",
            verification_status: "unverified",
          },
          error: null,
        });
      }
      return thenableQuery({ data: null, error: null });
    });

    const { error, snapshot } = await getOrgProfileSnapshot("org-viewer", "org-target");
    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("get_connection_partner_display", {
      p_linked_organization_id: "org-target",
    });
    expect(snapshot?.total_trips).toBe(2);
    expect(snapshot?.vehicle_count).toBe(1);
    expect(snapshot?.indent_count).toBe(0);
    expect(snapshot?.phone).toBe("+918787878787");
  });
});
