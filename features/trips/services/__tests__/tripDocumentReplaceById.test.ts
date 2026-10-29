const mockStorageUpload = jest.fn();
const mockStorageRemove = jest.fn();
const mockAuditInsert = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const queriedIds: string[] = [];

const EXISTING = {
  id: "b7cbfe36-b6df-4459-976d-1c7d6af7d40f",
  file_name: "RESUBMIT-TEST-1.png",
  storage_path: "7a274fd0-9958-4274-b9c3-90130f64ca14/other/823a9c10-old.png",
  document_number: null,
  uploaded_at: "2026-10-29T10:00:00.000Z",
  uploaded_by: "user-1",
  status: "rejected",
  verified_by: "reviewer-1",
  verified_at: "2026-10-29T17:28:48.000Z",
  rejection_reason: "PR54 resubmit preview test",
};

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trip_documents") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = (column: string, value: string) => {
          if (column === "id") queriedIds.push(value);
          return builder;
        };
        builder.order = chain;
        builder.limit = () =>
          Promise.resolve({
            data: queriedIds[queriedIds.length - 1] === EXISTING.id ? [EXISTING] : [],
            error: null,
          });
        builder.update = (patch: Record<string, unknown>) => {
          mockUpdate(patch);
          return {
            eq: (column: string, value: string) => {
              if (column === "id") queriedIds.push(`update:${value}`);
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: EXISTING.id,
                        trip_id: "7a274fd0-9958-4274-b9c3-90130f64ca14",
                        file_name: patch.file_name,
                        storage_path: patch.storage_path,
                        mime_type: patch.mime_type,
                        size_bytes: patch.size_bytes,
                        uploaded_at: "2026-10-29T18:00:00.000Z",
                        uploaded_by: patch.uploaded_by,
                        document_type: "other",
                        document_number: patch.document_number,
                      },
                      error: null,
                    }),
                }),
              };
            },
          };
        };
        builder.insert = (row: unknown) => {
          mockInsert(row);
          return { select: () => ({ single: () => Promise.resolve({ data: null, error: new Error("insert blocked") }) }) };
        };
        return builder;
      }
      if (table === "trips") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { organization_id: "org-1" }, error: null }) }),
          }),
        };
      }
      if (table === "document_audit_log") return { insert: mockAuditInsert };
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({ upload: mockStorageUpload, remove: mockStorageRemove }),
    },
  }),
}));

jest.mock("@/lib/platform/events/InProcessEventBus", () => ({
  getPlatformEventBus: () => ({ publish: jest.fn() }),
}));
jest.mock("@/features/trips/services/tripWorkflow.service", () => ({
  recordTripWorkflowEvent: jest.fn(),
}));
jest.mock("@/features/ocr/services/ocrJob.service", () => ({ listOcrJobsForTripDocuments: jest.fn() }));

import { uploadTripDocument } from "@/features/trips/services/tripDocuments.service";

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("uploadTripDocument — replaceDocumentId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queriedIds.length = 0;
    mockStorageUpload.mockResolvedValue({ error: null });
    mockAuditInsert.mockResolvedValue({ error: null });
  });

  it("updates the same trip_documents.id and does not insert a duplicate Other row", async () => {
    const { doc, error } = await uploadTripDocument(
      "7a274fd0-9958-4274-b9c3-90130f64ca14",
      "user-replacer",
      { arrayBuffer: new ArrayBuffer(8), fileName: "RESUBMIT-TEST-2.png", mimeType: "image/png" },
      "other",
      undefined,
      { replaceDocumentId: EXISTING.id, organizationId: "org-1" },
    );
    await flushMicrotasks();
    expect(error).toBeNull();
    expect(doc?.id).toBe(EXISTING.id);
    expect(doc?.storage_path).not.toBe(EXISTING.storage_path);
    expect(doc?.file_name).toBe("RESUBMIT-TEST-2.png");
    expect(queriedIds).toContain(EXISTING.id);
    expect(queriedIds).toContain(`update:${EXISTING.id}`);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: "RESUBMIT-TEST-2.png",
        status: "pending",
        rejection_reason: null,
        source_entity_document_id: null,
      }),
    );
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: EXISTING.id,
        action: "replaced",
        old_status: "rejected",
      }),
    );
  });

  it("fails closed when storage upload fails — no update, no insert, original id unchanged", async () => {
    mockStorageUpload.mockResolvedValue({ error: { message: "storage quota" } });
    const { doc, error } = await uploadTripDocument(
      "7a274fd0-9958-4274-b9c3-90130f64ca14",
      "user-replacer",
      { arrayBuffer: new ArrayBuffer(8), fileName: "RESUBMIT-TEST-2.png", mimeType: "image/png" },
      "other",
      undefined,
      { replaceDocumentId: EXISTING.id },
    );
    expect(doc).toBeNull();
    expect(error?.message).toMatch(/storage quota/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockAuditInsert).not.toHaveBeenCalled();
  });

  it("fails closed when the target row is gone — no insert of a new Other row", async () => {
    const { doc, error } = await uploadTripDocument(
      "7a274fd0-9958-4274-b9c3-90130f64ca14",
      "user-replacer",
      { arrayBuffer: new ArrayBuffer(8), fileName: "RESUBMIT-TEST-2.png", mimeType: "image/png" },
      "other",
      undefined,
      { replaceDocumentId: "00000000-0000-0000-0000-000000000000" },
    );
    expect(doc).toBeNull();
    expect(error?.message).toMatch(/no longer exists/i);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
