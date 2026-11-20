/**
 * Reproduces the 19 Nov delete failure on Trip Detail: the trip's org
 * (GOGOVAN) deleted a file on a partner truck owned by another org. The
 * vehicles update matched 0 rows (PATCH 204 in prod logs), returned no error,
 * and the app said "Deleted" while nothing changed. Now: the delete fails
 * loudly, storage is untouched, and the file's entity_documents row can be
 * found by path so Trip Detail deletes the real record.
 */
const VIEWER = "5b471ecb-viewer-org";
const OWNER = "05c8fcab-owner-org";
const VEHICLE = "13095fdc-vehicle";

type VehicleRow = { id: string; organization_id: string };
let mockVehicles: VehicleRow[] = [];
let mockEntityDocs: { id: string; entity_type: string; entity_id: string; storage_path: string }[] = [];
const mockCalls: string[] = [];

function mockVehiclesQuery() {
  const filters: Record<string, string> = {};
  const q: Record<string, unknown> = {};
  q.update = () => {
    mockCalls.push("vehicles.update");
    return q;
  };
  q.eq = (col: string, val: string) => {
    filters[col] = val;
    return q;
  };
  q.select = async () => {
    const matched = mockVehicles.filter(
      (v) => v.id === filters.id && v.organization_id === filters.organization_id,
    );
    return { data: matched.map((v) => ({ id: v.id })), error: null };
  };
  return q;
}

function mockEntityDocsQuery() {
  const filters: Record<string, string> = {};
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (col: string, val: string) => {
    filters[col] = val;
    return q;
  };
  q.limit = () => q;
  q.maybeSingle = async () => {
    const row = mockEntityDocs.find(
      (d) =>
        d.entity_type === filters.entity_type &&
        d.entity_id === filters.entity_id &&
        d.storage_path === filters.storage_path,
    );
    return { data: row ? { id: row.id } : null, error: null };
  };
  return q;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "vehicles") return mockVehiclesQuery();
      if (table === "entity_documents") return mockEntityDocsQuery();
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        remove: async () => {
          mockCalls.push(`storage.remove:${bucket}`);
          return { error: null };
        },
      }),
    },
  }),
}));

import {
  deleteVehicleDocument,
  deleteVehicleExtraDocument,
  findVehicleEntityDocumentIdByPath,
} from "../vehicleDocuments.service";

const PATH = `${VIEWER}/vehicle/${VEHICLE}/insurance-old.jpeg`;

beforeEach(() => {
  mockCalls.length = 0;
  mockVehicles = [{ id: VEHICLE, organization_id: OWNER }];
  mockEntityDocs = [{ id: "621ab8cc", entity_type: "vehicle", entity_id: VEHICLE, storage_path: PATH }];
});

describe("Trip Detail vehicle delete on a partner truck", () => {
  it("extra page: fails loudly when the vehicle row is not ours, and leaves storage alone", async () => {
    const docs = { extras: [{ id: "extra-1", url: PATH, expiryDate: "2025-11-17" }] };
    const { error } = await deleteVehicleExtraDocument(VIEWER, VEHICLE, "extra-1", docs);
    expect(error?.message).toMatch(/Nothing was removed/);
    expect(mockCalls).toEqual(["vehicles.update"]);
  });

  it("slot file: fails loudly when the vehicle row is not ours, and leaves storage alone", async () => {
    const docs = { insurance: { url: PATH, expiryDate: "2025-11-17" } };
    const { error } = await deleteVehicleDocument(VIEWER, VEHICLE, "insurance", docs);
    expect(error?.message).toMatch(/Nothing was removed/);
    expect(mockCalls).toEqual(["vehicles.update"]);
  });

  it("finds the entity_documents row behind the shown file, so the real record can be deleted", async () => {
    await expect(findVehicleEntityDocumentIdByPath(VEHICLE, PATH)).resolves.toEqual({ id: "621ab8cc", error: null });
    await expect(findVehicleEntityDocumentIdByPath(VEHICLE, "other/path.jpeg")).resolves.toEqual({ id: null, error: null });
  });
});

describe("Own-vehicle vault delete still works", () => {
  it("updates the row first, then removes the stored file", async () => {
    mockVehicles = [{ id: VEHICLE, organization_id: VIEWER }];
    const docs = { insurance: { url: `${VIEWER}/${VEHICLE}/insurance.pdf`, expiryDate: "2027-01-01" } };
    const { error, documents } = await deleteVehicleDocument(VIEWER, VEHICLE, "insurance", docs);
    expect(error).toBeNull();
    expect(documents).toEqual({});
    expect(mockCalls).toEqual(["vehicles.update", "storage.remove:vehicle-documents"]);
  });
});
