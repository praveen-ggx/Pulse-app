jest.mock("@/lib/partyAvatarDisplay", () => ({
  driverAvatarSeedFromId: (id: string) => id,
}));

import { buildTripHubPartyMetaByTripId } from "@/features/trips/utils/tripHubPartyMeta";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";

function trip(partial: Partial<TripRow> & Pick<TripRow, "id">): TripRow {
  return partial as TripRow;
}

describe("buildTripHubPartyMetaByTripId supplier award", () => {
  it("uses the awarded organization name and avatar link when the trip has no supplier row", () => {
    const meta = buildTripHubPartyMetaByTripId(
      [
        trip({
          id: "trip-1",
          organization_id: "owner-org",
          indent_id: "indent-1",
          client_name: "Apollo",
        }),
      ],
      [],
      [],
      [],
      [],
      {},
      {
        viewerOrgId: "owner-org",
        indentAwardOrgByIndentId: { "indent-1": "supplier-org" },
        orgNameById: { "supplier-org": "Perambra Logistics" },
      },
    );
    const row = meta.get("trip-1");
    expect(row?.displaySupplierName).toBe("Perambra Logistics");
    expect(row?.supplierLinkedOrgId).toBe("supplier-org");
    expect(row?.supplierIntegrated).toBe(true);
  });

  it("uses the linked supplier avatar when the award matches a supplier record", () => {
    const supplier = {
      id: "sup-1",
      name: "Hema Sai",
      linked_organization_id: "supplier-org",
      avatar_url: "https://cdn.example/hema.png",
      avatar_seed: "hema",
      supplier_type: "integrated",
    } as SupplierRow;
    const meta = buildTripHubPartyMetaByTripId(
      [trip({ id: "trip-2", organization_id: "owner-org", indent_id: "indent-2" })],
      [],
      [supplier],
      [],
      [],
      {},
      {
        viewerOrgId: "owner-org",
        indentAwardOrgByIndentId: { "indent-2": "supplier-org" },
      },
    );
    const row = meta.get("trip-2");
    expect(row?.displaySupplierName).toBe("Hema Sai");
    expect(row?.supplierAvatarUrl).toBe("https://cdn.example/hema.png");
    expect(row?.supplierAvatarSeed).toBe("hema");
    expect(row?.supplierLinkedOrgId).toBe("supplier-org");
  });
});
