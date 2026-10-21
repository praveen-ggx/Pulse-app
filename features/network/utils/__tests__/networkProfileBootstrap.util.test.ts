import {
  applyPartnerDisplayToDiscoverOrgs,
  type DiscoverOrg,
} from "@/features/network/services/discover.service";
import {
  buildNetworkProfileSeed,
  hasSeededNetworkProfileHeroStats,
  preferProfileConnectionStatus,
} from "../networkProfileBootstrap.util";

function baseOrg(overrides: Partial<DiscoverOrg> = {}): DiscoverOrg {
  return {
    id: "org-1",
    name: "Gogovan",
    avatar_seed: "seed",
    connection_status: "none",
    ...overrides,
  };
}

describe("network profile bootstrap seed", () => {
  it("merges partner-display hero stats onto discover orgs", () => {
    const [org] = applyPartnerDisplayToDiscoverOrgs([baseOrg()], {
      "org-1": {
        phone: "+919600096556",
        logoUrl: "org-logos/org-1/org-logo.jpg",
        avatarUrl: "owner-1/avatar.jpg",
        tripCount: 686,
        vehicleCount: 2,
        networkIndentCount: 13994,
        averageRating: 3,
        orgCreatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(org.avatar_url).toBe("org-logos/org-1/org-logo.jpg");
    expect(org.phone).toBe("+919600096556");
    expect(org.trip_count).toBe(686);
    expect(org.vehicle_count).toBe(2);
    expect(org.network_indent_count).toBe(13994);
    expect(org.rating).toBe(3);
  });

  it("seeds the modal hero from discover + linked-org cache", () => {
    const { node, totalTrips } = buildNetworkProfileSeed(
      baseOrg({
        city: "Chennai",
        state: "Tamilnadu",
        trip_count: 686,
        mutual_count: 2,
      }),
      {
        phone: "+919600096556",
        vehicleCount: 2,
        networkIndentCount: 13994,
        ownerSignedUpAt: "2026-03-01T00:00:00.000Z",
      },
    );
    expect(totalTrips).toBe(686);
    expect(node.location).toBe("Chennai, Tamilnadu");
    expect(node.phone).toBe("+919600096556");
    expect(node.vehicle_count).toBe(2);
    expect(node.indent_count).toBe(13994);
    expect(node.member_since_year).toBe(2026);
    expect(node.mutuals).toBe(2);
    expect(hasSeededNetworkProfileHeroStats({
      totalTrips,
      vehicleCount: node.vehicle_count,
      indentCount: node.indent_count,
      phone: node.phone,
    })).toBe(true);
  });

  it("does not let a placeholder LIVE status overwrite a pending request", () => {
    expect(preferProfileConnectionStatus("REQUEST SENT", "LIVE")).toBe(
      "REQUEST SENT",
    );
    expect(preferProfileConnectionStatus("LIVE", "CONNECTED")).toBe("CONNECTED");
  });
});
