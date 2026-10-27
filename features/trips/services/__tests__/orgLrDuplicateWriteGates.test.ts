/**
 * LR write paths must fail closed: when the org duplicate check cannot run,
 * the LR number is not saved (it used to be treated as "no duplicate").
 * The advisory hub reads keep their tolerant behaviour.
 */
import { createFakePostgrest } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

const mockCheck = jest.fn();
jest.mock("@/features/trips/services/orgLrDuplicate.service", () => {
  const actual = jest.requireActual("@/features/trips/services/orgLrDuplicate.service");
  return {
    ...actual,
    checkOrgDuplicateLrNumbersForTrip: (input: unknown) => mockCheck(input),
    invalidateOrgLrIndexForTrip: jest.fn(),
  };
});

import { OrgLrIndexUnavailableError } from "@/features/trips/services/orgLrDuplicate.service";
import {
  __resetTripDocumentLrPodRpcProbeForTests,
  loadLrDocumentRowsByTripIds,
  loadLrPodIndexByTripIds,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { updateTripDocumentNumber, upsertTripLrNumbers } from "@/features/trips/services/tripDocuments.service";
import { ORG_LR_CHECK_UNAVAILABLE_MESSAGE, ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";

beforeEach(() => {
  mockCheck.mockReset();
  mockServer.requests.length = 0;
  mockServer.state.failRequest = null;
  mockServer.tables.trip_documents = [
    { id: "doc-1", trip_id: "trip-1", document_type: "lr", document_number: "LR-OLD" },
  ];
  __resetTripDocumentLrPodRpcProbeForTests();
});

const updates = () => mockServer.requests.filter((r) => r.update);

describe("updateTripDocumentNumber (LR)", () => {
  it("does not save when the duplicate check cannot run", async () => {
    mockCheck.mockRejectedValue(new OrgLrIndexUnavailableError());
    const error = await updateTripDocumentNumber("doc-1", "LR-NEW");
    expect(error?.message).toBe(ORG_LR_CHECK_UNAVAILABLE_MESSAGE);
    expect(updates()).toHaveLength(0);
    expect(mockServer.tables.trip_documents[0].document_number).toBe("LR-OLD");
  });

  it("does not save a duplicate", async () => {
    mockCheck.mockResolvedValue({ tripId: "trip-2", lrNumber: "LR-NEW" });
    const error = await updateTripDocumentNumber("doc-1", "LR-NEW");
    expect(error?.message).toBe(ORG_LR_DUPLICATE_MESSAGE);
    expect(updates()).toHaveLength(0);
  });

  it("saves when the check passes", async () => {
    mockCheck.mockResolvedValue(null);
    expect(await updateTripDocumentNumber("doc-1", "LR-NEW")).toBeNull();
    expect(mockServer.tables.trip_documents[0].document_number).toBe("LR-NEW");
  });
});

describe("upsertTripLrNumbers", () => {
  it("returns the check error and writes nothing when the index is unavailable", async () => {
    mockCheck.mockRejectedValue(new OrgLrIndexUnavailableError());
    const result = await upsertTripLrNumbers({ tripId: "trip-1", uploadedBy: "u1", lrInput: "LR-7" });
    expect(result.error?.message).toBe(ORG_LR_CHECK_UNAVAILABLE_MESSAGE);
    expect(result.lrNumbers).toEqual([]);
    expect(mockServer.requests.filter((r) => r.table === "trip_documents")).toHaveLength(0);
  });
});

describe("LR row loaders (REST fallback)", () => {
  it("loadLrDocumentRowsByTripIds (duplicate check) throws when a chunk fails", async () => {
    mockServer.state.failRequest = (req) => req.table === "trip_documents";
    await expect(loadLrDocumentRowsByTripIds(["trip-1", "trip-2"])).rejects.toThrow("fake page failure");
  });

  it("hub LR/POD index stays tolerant of a failed chunk (unchanged)", async () => {
    mockServer.state.failRequest = (req) => req.table === "trip_documents";
    await expect(loadLrPodIndexByTripIds(["trip-1"])).resolves.toBeInstanceOf(Map);
  });
});
