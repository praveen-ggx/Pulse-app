const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

const mockGetDocumentsByEntity = jest.fn();
const mockGetComplianceDocumentSignedUrl = jest.fn();
const mockTryGetDocumentViewUrl = jest.fn();

jest.mock("@/features/compliance/services/documents.service", () => ({
  getDocumentsByEntity: (...args: unknown[]) => mockGetDocumentsByEntity(...args),
  getComplianceDocumentSignedUrl: (...args: unknown[]) => mockGetComplianceDocumentSignedUrl(...args),
}));

jest.mock("@/features/trips/services/tripDocuments.service", () => ({
  tryGetDocumentViewUrl: (...args: unknown[]) => mockTryGetDocumentViewUrl(...args),
}));

import {
  getReusableVehicleDocuments,
  isReusableVehicleDocumentType,
  isVehicleDocumentReferencePath,
  resolveEntityDocumentVersionOrdinal,
  resolvePinnedVehicleDocumentMeta,
  resolveTripDocumentPreviewUrl,
  resolveVehicleDocumentSource,
  useVehicleDocumentForTrip,
} from "@/features/tripCompliance/services/vehicleDocumentReuse.service";
import type { DocumentRow } from "@/features/compliance/services/documents.service";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "doc-1",
    organization_id: "org-1",
    entity_type: "vehicle",
    entity_id: "vehicle-1",
    doc_type: "insurance",
    doc_label: "Insurance Policy",
    doc_number: "POL-123",
    issued_date: null,
    expiry_date: "2027-03-18",
    issued_by: null,
    status: "verified",
    storage_path: "org-1/vehicle/vehicle-1/insurance_abc.pdf",
    notes: null,
    verified_by: "user-1",
    verified_at: "2026-01-01T00:00:00Z",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Builds a chainable query-builder mock matching the shape
 * resolveEntityDocumentVersionOrdinal/resolveVehicleDocumentSource use:
 * every chain method (.select/.eq/.lte/.maybeSingle) returns the SAME
 * object, which is itself a real Promise resolving to `finalResult` — so
 * both `await builder.select().eq().lte()` (count query) and
 * `await builder.select().eq().maybeSingle()` (single-row query) resolve
 * correctly regardless of how many links are chained.
 */
function chainMock(finalResult: unknown) {
  const builder = Object.assign(Promise.resolve(finalResult), {}) as Promise<unknown> & Record<string, jest.Mock>;
  for (const method of ["select", "eq", "lte", "maybeSingle"]) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
}

describe("isVehicleDocumentReferencePath", () => {
  it("recognizes the synthetic reuse marker and rejects real storage paths", () => {
    expect(isVehicleDocumentReferencePath("ref:vehicle-document:trip-1:insurance:doc-1")).toBe(true);
    expect(isVehicleDocumentReferencePath("org-1/insurance_abc.pdf")).toBe(false);
    expect(isVehicleDocumentReferencePath(null)).toBe(false);
    expect(isVehicleDocumentReferencePath(undefined)).toBe(false);
  });
});

describe("getReusableVehicleDocuments — eligibility classification", () => {
  afterEach(() => {
    mockGetDocumentsByEntity.mockReset();
    mockFrom.mockReset();
  });

  function mockVersionCount(count: number) {
    mockFrom.mockReturnValue(chainMock({ count, error: null }));
  }

  it("classifies a verified, non-expired document as eligible", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [makeDoc()] });
    mockVersionCount(1);
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    const insurance = slots.find((s) => s.documentType === "insurance");
    expect(insurance?.candidate?.eligibility).toBe("eligible");
  });

  it("classifies an expired document by status as expired, not eligible", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({
      error: null,
      documents: [makeDoc({ status: "expired" })],
    });
    mockVersionCount(1);
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    expect(slots.find((s) => s.documentType === "insurance")?.candidate?.eligibility).toBe("expired");
  });

  it("classifies a verified document whose expiry_date has passed as expired (not silently eligible)", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({
      error: null,
      documents: [makeDoc({ status: "verified", expiry_date: "2020-01-01" })],
    });
    mockVersionCount(1);
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    expect(slots.find((s) => s.documentType === "insurance")?.candidate?.eligibility).toBe("expired");
  });

  it("classifies a rejected document as rejected, not eligible", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({
      error: null,
      documents: [makeDoc({ status: "rejected" })],
    });
    mockVersionCount(1);
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    expect(slots.find((s) => s.documentType === "insurance")?.candidate?.eligibility).toBe("rejected");
  });

  it("classifies a pending (not yet verified) document as pending, not eligible", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({
      error: null,
      documents: [makeDoc({ status: "pending" })],
    });
    mockVersionCount(1);
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    expect(slots.find((s) => s.documentType === "insurance")?.candidate?.eligibility).toBe("pending");
  });

  it("reports no candidate at all when nothing is on file for a type — distinct from ineligible", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [] });
    const { slots } = await getReusableVehicleDocuments("org-1", "vehicle-1");
    for (const slot of slots) {
      expect(slot.candidate).toBeNull();
    }
  });

  it("never offers a wrong-vehicle or wrong-org document — getDocumentsByEntity is already scoped by (org, vehicle)", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [] });
    await getReusableVehicleDocuments("org-1", "vehicle-1");
    expect(mockGetDocumentsByEntity).toHaveBeenCalledWith("org-1", "vehicle", "vehicle-1");
  });
});

describe("resolveEntityDocumentVersionOrdinal", () => {
  afterEach(() => mockFrom.mockReset());

  it("returns the historical position, including replaced predecessors, not just the current row", async () => {
    mockFrom.mockReturnValue(chainMock({ count: 3, error: null }));
    const ordinal = await resolveEntityDocumentVersionOrdinal("org-1", "vehicle-1", "insurance", "2026-06-01T00:00:00Z");
    expect(ordinal).toBe(3);
  });

  it("falls back to 1 on a count error rather than throwing", async () => {
    mockFrom.mockReturnValue(chainMock({ count: null, error: { message: "boom" } }));
    const ordinal = await resolveEntityDocumentVersionOrdinal("org-1", "vehicle-1", "insurance", "2026-06-01T00:00:00Z");
    expect(ordinal).toBe(1);
  });
});

describe("useVehicleDocumentForTrip — RPC contract", () => {
  afterEach(() => mockRpc.mockReset());

  it("calls use_vehicle_document_for_trip with exactly the RPC's parameter names", async () => {
    mockRpc.mockResolvedValue({
      data: { trip_document_id: "td-1", entity_document_id: "doc-1", document_type: "insurance", already_attached: false },
      error: null,
    });
    const result = await useVehicleDocumentForTrip({ tripId: "trip-1", entityDocumentId: "doc-1", documentType: "insurance" });
    expect(mockRpc).toHaveBeenCalledWith("use_vehicle_document_for_trip", {
      p_trip_id: "trip-1",
      p_entity_document_id: "doc-1",
      p_document_type: "insurance",
    });
    expect(result.error).toBeNull();
    expect(result.tripDocumentId).toBe("td-1");
    expect(result.alreadyAttached).toBe(false);
  });

  it("surfaces already_attached=true on an idempotent retry, without treating it as an error", async () => {
    mockRpc.mockResolvedValue({
      data: { trip_document_id: "td-1", already_attached: true },
      error: null,
    });
    const result = await useVehicleDocumentForTrip({ tripId: "trip-1", entityDocumentId: "doc-1", documentType: "insurance" });
    expect(result.error).toBeNull();
    expect(result.alreadyAttached).toBe(true);
  });

  it("surfaces the RPC's server-side rejection (e.g. expired/rejected/wrong-vehicle) as an error, not a silent success", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "vehicle document is expired (expiry date: 2020-01-01)" },
    });
    const result = await useVehicleDocumentForTrip({ tripId: "trip-1", entityDocumentId: "doc-1", documentType: "insurance" });
    expect(result.error?.message).toMatch(/expired/);
    expect(result.tripDocumentId).toBeNull();
  });
});

describe("resolveVehicleDocumentSource", () => {
  afterEach(() => {
    mockFrom.mockReset();
    mockGetComplianceDocumentSignedUrl.mockReset();
  });

  it("resolves the exact entity_documents row and signs its storage_path via the existing compliance signer", async () => {
    const doc = makeDoc({ storage_path: "org-1/vehicle/vehicle-1/insurance_v3.pdf" });
    mockFrom.mockReturnValue(chainMock({ data: doc, error: null }));
    mockGetComplianceDocumentSignedUrl.mockResolvedValue({ url: "https://signed.example/insurance_v3.pdf", error: null });

    const { resolved } = await resolveVehicleDocumentSource("doc-1");
    expect(mockGetComplianceDocumentSignedUrl).toHaveBeenCalledWith(doc.storage_path);
    expect(resolved?.url).toBe("https://signed.example/insurance_v3.pdf");
    expect(resolved?.mimeGuess).toBe("application/pdf");
    expect(resolved?.document.id).toBe(doc.id);
  });

  it("errors clearly when the referenced version no longer resolves (row not found)", async () => {
    mockFrom.mockReturnValue(chainMock({ data: null, error: null }));
    const { error, resolved } = await resolveVehicleDocumentSource("doc-missing");
    expect(error).not.toBeNull();
    expect(resolved).toBeNull();
  });

  it("historical immutability: resolves the exact superseded (replaced) version by id, not the vehicle's current document", async () => {
    // A trip pinned Insurance v3 (source_entity_document_id = 'doc-v3'). The
    // vehicle has since been replaced with v4 — v3's row still exists with
    // status='replaced' and its own id, which is what the trip keeps
    // referencing. resolveVehicleDocumentSource queries by that exact id, so
    // it must return v3's data even though v3 is no longer "current".
    const supersededV3 = makeDoc({
      id: "doc-v3",
      status: "replaced",
      replaced_by_id: "doc-v4",
      storage_path: "org-1/vehicle/vehicle-1/insurance_v3.pdf",
    });
    mockFrom.mockReturnValue(chainMock({ data: supersededV3, error: null }));
    mockGetComplianceDocumentSignedUrl.mockResolvedValue({ url: "https://signed.example/v3.pdf", error: null });

    const { resolved } = await resolveVehicleDocumentSource("doc-v3");
    expect(resolved?.document.id).toBe("doc-v3");
    expect(resolved?.document.status).toBe("replaced");
    expect(mockGetComplianceDocumentSignedUrl).toHaveBeenCalledWith("org-1/vehicle/vehicle-1/insurance_v3.pdf");
  });
});

describe("resolvePinnedVehicleDocumentMeta — pinned to the exact reused version, not the vehicle's current document", () => {
  afterEach(() => mockFrom.mockReset());

  it("computes the version ordinal from the pinned document's own identity, ignoring any later replacement", async () => {
    const pinnedV3 = makeDoc({
      id: "doc-v3",
      organization_id: "org-1",
      entity_id: "vehicle-1",
      doc_type: "insurance",
      status: "replaced", // superseded by v4 since — must still resolve correctly
      expiry_date: "2027-03-18",
      created_at: "2026-01-01T00:00:00Z",
    });
    // First .from() call: fetch the pinned row by id. Second: the version-ordinal count query.
    mockFrom
      .mockReturnValueOnce(chainMock({ data: pinnedV3, error: null }))
      .mockReturnValueOnce(chainMock({ count: 3, error: null }));

    const { meta } = await resolvePinnedVehicleDocumentMeta("doc-v3");
    expect(meta?.document.id).toBe("doc-v3");
    expect(meta?.document.expiry_date).toBe("2027-03-18");
    expect(meta?.versionOrdinal).toBe(3);
  });

  it("errors clearly when the pinned document id no longer resolves", async () => {
    mockFrom.mockReturnValueOnce(chainMock({ data: null, error: null }));
    const { error, meta } = await resolvePinnedVehicleDocumentMeta("doc-missing");
    expect(error).not.toBeNull();
    expect(meta).toBeNull();
  });
});

describe("isReusableVehicleDocumentType", () => {
  it("accepts only rc/insurance — the only vehicle types trip_documents' CHECK constraint allows", () => {
    expect(isReusableVehicleDocumentType("rc")).toBe(true);
    expect(isReusableVehicleDocumentType("insurance")).toBe(true);
    expect(isReusableVehicleDocumentType("fitness")).toBe(false);
    expect(isReusableVehicleDocumentType("permit")).toBe(false);
  });
});

describe("resolveTripDocumentPreviewUrl", () => {
  afterEach(() => {
    mockFrom.mockReset();
    mockGetComplianceDocumentSignedUrl.mockReset();
    mockTryGetDocumentViewUrl.mockReset();
  });

  it("uses existing trip-documents signing for an ordinary upload (no source pin)", async () => {
    mockTryGetDocumentViewUrl.mockResolvedValue("https://signed.example/lr.pdf");
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "trip-1/lr/scan.pdf",
      sourceEntityDocumentId: null,
      organizationId: "org-1",
    });
    expect(url).toBe("https://signed.example/lr.pdf");
    expect(mockTryGetDocumentViewUrl).toHaveBeenCalledWith("trip-1/lr/scan.pdf");
    expect(mockGetComplianceDocumentSignedUrl).not.toHaveBeenCalled();
  });

  it("resolves a reused insurance document by exact source_entity_document_id via compliance signing", async () => {
    const pinned = makeDoc({ id: "doc-a", doc_type: "insurance" });
    mockFrom.mockReturnValue(chainMock({ data: pinned, error: null }));
    mockGetComplianceDocumentSignedUrl.mockResolvedValue({ url: "https://signed.example/insurance.pdf", error: null });
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:trip-1:insurance:doc-a",
      sourceEntityDocumentId: "doc-a",
      organizationId: "org-1",
    });
    expect(url).toBe("https://signed.example/insurance.pdf");
    expect(mockGetComplianceDocumentSignedUrl).toHaveBeenCalledWith(pinned.storage_path);
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
  });

  it("resolves a reused RC document by exact source_entity_document_id via compliance signing", async () => {
    const pinned = makeDoc({ id: "doc-rc", doc_type: "rc", storage_path: "org-1/vehicle/vehicle-1/rc.pdf" });
    mockFrom.mockReturnValue(chainMock({ data: pinned, error: null }));
    mockGetComplianceDocumentSignedUrl.mockResolvedValue({ url: "https://signed.example/rc.pdf", error: null });
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:trip-1:rc:doc-rc",
      sourceEntityDocumentId: "doc-rc",
      organizationId: "org-1",
    });
    expect(url).toBe("https://signed.example/rc.pdf");
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
  });

  it("keeps the historical source after that entity_documents row is marked replaced", async () => {
    const superseded = makeDoc({
      id: "doc-a",
      status: "replaced",
      replaced_by_id: "doc-b",
      storage_path: "org-1/vehicle/vehicle-1/insurance_vA.pdf",
    });
    mockFrom.mockReturnValue(chainMock({ data: superseded, error: null }));
    mockGetComplianceDocumentSignedUrl.mockResolvedValue({ url: "https://signed.example/vA.pdf", error: null });
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:trip-1:insurance:doc-a",
      sourceEntityDocumentId: "doc-a",
      organizationId: "org-1",
    });
    expect(url).toBe("https://signed.example/vA.pdf");
    expect(mockGetComplianceDocumentSignedUrl).toHaveBeenCalledWith("org-1/vehicle/vehicle-1/insurance_vA.pdf");
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
  });

  it("falls through to trip-documents signing when source_entity_document_id is missing on a normal path", async () => {
    mockTryGetDocumentViewUrl.mockResolvedValue("https://signed.example/invoice.pdf");
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "trip-1/invoice/file.pdf",
    });
    expect(url).toBe("https://signed.example/invoice.pdf");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("previews the replacement trip file, not the leftover rejected vault pin", async () => {
    mockTryGetDocumentViewUrl.mockResolvedValue("https://signed.example/new-invoice.pdf");
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "trip-1/invoice/new-scan.pdf",
      sourceEntityDocumentId: "rejected-entity-id",
      organizationId: "org-1",
    });
    expect(url).toBe("https://signed.example/new-invoice.pdf");
    expect(mockTryGetDocumentViewUrl).toHaveBeenCalledWith("trip-1/invoice/new-scan.pdf");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fails safely when the pinned entity_documents row is missing", async () => {
    mockFrom.mockReturnValue(chainMock({ data: null, error: null }));
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:trip-1:insurance:missing",
      sourceEntityDocumentId: "missing",
      organizationId: "org-1",
    });
    expect(url).toBeNull();
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
  });

  it("fails safely for a vehicle-document reference without a pinned source id (never trip-documents signing)", async () => {
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:not-a-valid-pin",
      sourceEntityDocumentId: null,
    });
    expect(url).toBeNull();
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
    expect(mockGetComplianceDocumentSignedUrl).not.toHaveBeenCalled();
  });

  it("fails safely for a cross-organization source even if the row is readable", async () => {
    const otherOrg = makeDoc({ id: "doc-a", organization_id: "org-other" });
    mockFrom.mockReturnValue(chainMock({ data: otherOrg, error: null }));
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: "ref:vehicle-document:trip-1:insurance:doc-a",
      sourceEntityDocumentId: "doc-a",
      organizationId: "org-1",
    });
    expect(url).toBeNull();
    expect(mockGetComplianceDocumentSignedUrl).not.toHaveBeenCalled();
    expect(mockTryGetDocumentViewUrl).not.toHaveBeenCalled();
  });
});

