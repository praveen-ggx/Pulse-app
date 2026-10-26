/**
 * Trip Detail vault upload for a partner (supplier-owned) truck must not write
 * the owner's vault and must save under the viewer org (entity_documents).
 * The fake storage enforces the prod rule: vehicle-documents uploads only into
 * a folder of an org the user belongs to.
 */
const VIEWER = "5b471ecb-viewer-org";
const OWNER = "c56c9f72-supplier-org";
const VEHICLE = "c2b2adab-vehicle";
const MOCK_USER = "b707df9a-user";

type VehicleRow = { id: string; organization_id: string; documents: Record<string, unknown> | null };

let mockVehicles: VehicleRow[] = [];
let mockMemberOrgs: string[] = [];
const mockStorageUploads: { bucket: string; path: string; ok: boolean }[] = [];
const mockVehicleUpdates: { org: string; id: string }[] = [];
const mockRpcCalls: string[] = [];

function mockVehiclesQuery() {
  const filters: Record<string, string> = {};
  let updating = false;
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.update = () => {
    updating = true;
    return q;
  };
  q.eq = (col: string, val: string) => {
    filters[col] = val;
    return q;
  };
  q.maybeSingle = async () => {
    const row = mockVehicles.find(
      (v) => v.id === filters.id && (!filters.organization_id || v.organization_id === filters.organization_id),
    );
    if (updating) {
      mockVehicleUpdates.push({ org: filters.organization_id, id: filters.id });
      // RLS: only members of the owning org can update the vehicle row.
      if (!row || !mockMemberOrgs.includes(row.organization_id)) return { data: null, error: null };
      return { data: { id: row.id, documents: row.documents }, error: null };
    }
    return { data: row ? { organization_id: row.organization_id, documents: row.documents } : null, error: null };
  };
  return q;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "vehicles") return mockVehiclesQuery();
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          const ok = mockMemberOrgs.includes(path.split("/")[0]);
          mockStorageUploads.push({ bucket, path, ok });
          return ok
            ? { data: { path }, error: null }
            : { data: null, error: { message: 'new row violates row-level security policy for table "objects"' } };
        },
        remove: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: { id: MOCK_USER } } }) },
    rpc: async (name: string) => {
      mockRpcCalls.push(name);
      return { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
    },
  }),
}));

const mockUploadComplianceDocument = jest.fn();
jest.mock("@/features/compliance/services/documents.service", () => ({
  uploadComplianceDocument: (...args: unknown[]) => mockUploadComplianceDocument(...args),
}));

import {
  uploadAndSaveVehicleDocumentForTrip,
  uploadAndSaveVehicleExtraDocumentsForTrip,
} from "@/features/vehicles/services/vehicleDocuments.service";

const FILE = { arrayBuffer: new ArrayBuffer(8), fileName: "rc.jpeg", mimeType: "image/jpeg" };

beforeEach(() => {
  mockVehicles = [];
  mockMemberOrgs = [VIEWER];
  mockStorageUploads.length = 0;
  mockVehicleUpdates.length = 0;
  mockRpcCalls.length = 0;
  mockUploadComplianceDocument.mockReset();
  mockUploadComplianceDocument.mockImplementation(async (input: { orgId: string; docType: string }) => ({
    error: null,
    document: {
      storage_path: `${input.orgId}/vehicle/${VEHICLE}/${input.docType}_x.jpeg`,
      expiry_date: null,
      created_at: "2026-10-15T00:00:00Z",
    },
  }));
});

describe("uploadAndSaveVehicleDocumentForTrip", () => {
  it("partner truck: saves under the viewer org, never touches the owner's vault", async () => {
    const ownerDocs = { rc: { url: `${OWNER}/${VEHICLE}/rc.pdf`, expiryDate: "" } };
    mockVehicles = [{ id: VEHICLE, organization_id: OWNER, documents: ownerDocs }];

    const res = await uploadAndSaveVehicleDocumentForTrip(VIEWER, "trip-1", VEHICLE, "rc", FILE, "", null, [VIEWER]);

    expect(res.error).toBeNull();
    expect(res.documents?.rc?.url).toBe(`${VIEWER}/vehicle/${VEHICLE}/rc_x.jpeg`);
    expect(mockUploadComplianceDocument).toHaveBeenCalledTimes(1);
    expect(mockUploadComplianceDocument.mock.calls[0][0]).toMatchObject({
      orgId: VIEWER,
      entityType: "vehicle",
      entityId: VEHICLE,
      docType: "rc",
      uploadedBy: MOCK_USER,
    });
    // No write attempt into the supplier's storage folder or vehicle row.
    expect(mockStorageUploads).toEqual([]);
    expect(mockVehicleUpdates).toEqual([]);
    expect(mockRpcCalls).toEqual([]);
    // Supplier's own vault record is unchanged.
    expect(mockVehicles[0].documents).toBe(ownerDocs);
  });

  it("own truck: writes the viewer org's vault and skips entity_documents", async () => {
    mockVehicles = [{ id: VEHICLE, organization_id: VIEWER, documents: null }];

    const res = await uploadAndSaveVehicleDocumentForTrip(VIEWER, "trip-1", VEHICLE, "rc", FILE, "", null, [VIEWER]);

    expect(res.error).toBeNull();
    expect(mockStorageUploads).toEqual([{ bucket: "vehicle-documents", path: `${VIEWER}/${VEHICLE}/rc.jpeg`, ok: true }]);
    expect(mockVehicleUpdates).toEqual([{ org: VIEWER, id: VEHICLE }]);
    expect(mockUploadComplianceDocument).not.toHaveBeenCalled();
    expect(mockRpcCalls).toEqual([]);
  });

  it("own truck whose vault write is refused: falls back to entity_documents under the viewer org", async () => {
    mockVehicles = [{ id: VEHICLE, organization_id: VIEWER, documents: null }];
    mockMemberOrgs = []; // storage refuses every folder

    const res = await uploadAndSaveVehicleDocumentForTrip(VIEWER, "trip-1", VEHICLE, "fitness", FILE, "", null, []);

    expect(res.error).toBeNull();
    expect(mockUploadComplianceDocument).toHaveBeenCalledTimes(1);
    expect(mockUploadComplianceDocument.mock.calls[0][0]).toMatchObject({ orgId: VIEWER, docType: "fitness" });
    expect(mockRpcCalls).toEqual([]);
  });

  it("surfaces the entity_documents error instead of reporting success", async () => {
    mockVehicles = [{ id: VEHICLE, organization_id: OWNER, documents: null }];
    mockUploadComplianceDocument.mockResolvedValueOnce({ error: new Error("denied"), document: null });

    const res = await uploadAndSaveVehicleDocumentForTrip(VIEWER, "trip-1", VEHICLE, "rc", FILE, "", null, [VIEWER]);

    expect(res.documents).toBeNull();
    expect(res.error?.message).toBe("denied");
  });
});

describe("uploadAndSaveVehicleExtraDocumentsForTrip", () => {
  it("partner truck extra page: saves under the viewer org, never touches the owner's vault", async () => {
    const ownerDocs = { rc: { url: `${OWNER}/${VEHICLE}/rc.pdf`, expiryDate: "" } };
    mockVehicles = [{ id: VEHICLE, organization_id: OWNER, documents: ownerDocs }];

    const res = await uploadAndSaveVehicleExtraDocumentsForTrip(
      VIEWER,
      VEHICLE,
      [{ ...FILE, fileName: "rc-2.jpeg", docType: "rc" }],
      ownerDocs,
      [VIEWER],
    );

    expect(res.error).toBeNull();
    expect(res.documents?.extras?.[0]?.url).toBe(`${VIEWER}/vehicle/${VEHICLE}/rc_x.jpeg`);
    expect(mockUploadComplianceDocument).toHaveBeenCalledTimes(1);
    expect(mockStorageUploads).toEqual([]);
    expect(mockVehicleUpdates).toEqual([]);
    expect(mockVehicles[0].documents).toBe(ownerDocs);
  });

  it("own truck extra page: writes the viewer org's vault extras", async () => {
    mockVehicles = [{ id: VEHICLE, organization_id: VIEWER, documents: { rc: { url: `${VIEWER}/${VEHICLE}/rc.jpeg`, expiryDate: "" } } }];

    const res = await uploadAndSaveVehicleExtraDocumentsForTrip(
      VIEWER,
      VEHICLE,
      [{ ...FILE, fileName: "rc-2.jpeg", docType: "rc" }],
      mockVehicles[0].documents as { rc: { url: string; expiryDate: string } },
      [VIEWER],
    );

    expect(res.error).toBeNull();
    expect(mockStorageUploads[0]?.path).toMatch(new RegExp(`^${VIEWER}/${VEHICLE}/extras/`));
    expect(mockVehicleUpdates).toEqual([{ org: VIEWER, id: VEHICLE }]);
    expect(mockUploadComplianceDocument).not.toHaveBeenCalled();
  });
});
