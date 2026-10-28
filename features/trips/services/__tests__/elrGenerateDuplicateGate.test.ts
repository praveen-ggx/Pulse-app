/**
 * e-LR generate is an LR write path: when the strict org duplicate-LR check
 * cannot run, no PDF is built and nothing is uploaded.
 */
import { createFakePostgrest } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

const mockCheck = jest.fn();
jest.mock("@/features/trips/services/orgLrDuplicate.service", () => {
  const actual = jest.requireActual("@/features/trips/services/orgLrDuplicate.service");
  return { ...actual, checkOrgDuplicateLrNumbersForTrip: (input: unknown) => mockCheck(input) };
});

const mockUpload = jest.fn();
jest.mock("@/features/trips/services/tripDocuments.service", () => ({
  uploadTripDocument: (...args: unknown[]) => mockUpload(...args),
}));

const mockPdf = jest.fn(() => new ArrayBuffer(8));
jest.mock("@/features/trips/services/elrPdf.util", () => ({
  generateElrPdfBytes: () => mockPdf(),
}));

jest.mock("@/features/trips/services/elrCompletion.util", () => ({
  isCompleteElrSnapshot: () => false,
  buildCompletedElrSnapshot: () => ({ ok: true, snapshot: { lrNumber: "LR-555", vehicle: { registrationNumber: "TN18AH7051" } } }),
}));

import { generateOrOpenElr } from "@/features/trips/services/elrGenerate.service";
import { OrgLrIndexUnavailableError } from "@/features/trips/services/orgLrDuplicate.service";
import { ORG_LR_CHECK_UNAVAILABLE_MESSAGE, ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";

function generate() {
  return generateOrOpenElr({
    source: { tripId: "trip-1" } as never,
    uploadedBy: "u1",
    completion: {} as never,
    existing: null,
  });
}

beforeEach(() => {
  mockCheck.mockReset();
  mockUpload.mockReset();
  mockPdf.mockClear();
  mockServer.tables.trips = [{ id: "trip-1", vehicle_id: "veh-1", vehicle_display_number: "TN18AH7051", status: "completed" }];
});

describe("generateOrOpenElr duplicate-LR gate", () => {
  it("refuses to save when the strict duplicate check cannot run — no PDF, no upload", async () => {
    mockCheck.mockRejectedValue(new OrgLrIndexUnavailableError());
    await expect(generate()).resolves.toEqual({ ok: false, reason: "save", message: ORG_LR_CHECK_UNAVAILABLE_MESSAGE });
    expect(mockCheck).toHaveBeenCalledWith({ tripId: "trip-1", lrNumbers: ["LR-555"] });
    expect(mockPdf).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a duplicate LR number", async () => {
    mockCheck.mockResolvedValue({ tripId: "trip-2", lrNumber: "LR-555" });
    await expect(generate()).resolves.toEqual({ ok: false, reason: "save", message: ORG_LR_DUPLICATE_MESSAGE });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uploads when the check passes", async () => {
    mockCheck.mockResolvedValue(null);
    mockUpload.mockResolvedValue({ doc: { storage_path: "trip-1/lr/x.pdf" }, error: null });
    const result = await generate();
    expect(result.ok).toBe(true);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});
