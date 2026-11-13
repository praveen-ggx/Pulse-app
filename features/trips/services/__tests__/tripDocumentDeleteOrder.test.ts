import { deleteTripDocument, type TripDocumentRow } from "../tripDocuments.service";

/**
 * The row is deleted before the stored file. When the database refuses the
 * delete (approved / Ground Ops-locked document), the file must stay.
 * A `document_audit_log` 'deleted' row is written first (best-effort) so Trip
 * Activity can show who removed the document after the row is gone.
 */

const calls: string[] = [];
let mockDbError: { message: string; code?: string } | null = null;
let mockStorageError: { message: string } | null = null;
let mockDeletedRows: { id: string }[] = [{ id: "doc-1" }];
const mockAuditInsert = jest.fn(async () => {
  calls.push("audit.insert");
  return { error: null };
});

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "document_audit_log") {
        return { insert: mockAuditInsert };
      }
      if (table === "trips") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { organization_id: "org-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "trip_documents") {
        return {
          delete: () => ({
            eq: () => ({
              select: async () => {
                calls.push("db.delete");
                return { data: mockDbError ? null : mockDeletedRows, error: mockDbError };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "user-deleter" } }, error: null }),
    },
    storage: {
      from: () => ({
        remove: async () => {
          calls.push("storage.remove");
          return { error: mockStorageError };
        },
      }),
    },
  }),
}));

const DOC = {
  id: "doc-1",
  trip_id: "trip-1",
  file_name: "lr.pdf",
  storage_path: "trip-1/lr/lr.pdf",
  mime_type: "application/pdf",
  size_bytes: 10,
  uploaded_at: "2026-10-22T00:00:00Z",
  uploaded_by: "user-1",
  document_type: "lr",
} as TripDocumentRow;

beforeEach(() => {
  calls.length = 0;
  mockDbError = null;
  mockStorageError = null;
  mockDeletedRows = [{ id: "doc-1" }];
  mockAuditInsert.mockClear();
});

describe("deleteTripDocument", () => {
  it("audits, deletes the row, then the file", async () => {
    const { error } = await deleteTripDocument(DOC);
    expect(error).toBeNull();
    expect(calls).toEqual(["audit.insert", "db.delete", "storage.remove"]);
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: null,
        organization_id: "org-1",
        entity_type: "trip_document",
        entity_id: "trip-1",
        action: "deleted",
        actor_id: "user-deleter",
        metadata: expect.objectContaining({
          trip_document_id: "doc-1",
          document_type: "lr",
          file_name: "lr.pdf",
        }),
      }),
    );
  });

  it("keeps the file when the database refuses the delete", async () => {
    mockDbError = {
      message: "insert or update on table \"document_audit_log\" violates foreign key constraint \"document_audit_log_document_id_fkey\"",
      code: "23503",
    };
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(/document_audit_log_document_id_fkey/);
    expect(calls).toEqual(["audit.insert", "db.delete"]);
  });

  it("keeps the file when Ground Ops may not change the document", async () => {
    mockDbError = {
      message: "Ground Ops cannot change this document: trip is in transit",
      code: "42501",
    };
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(/Ground Ops cannot change/);
    expect(calls).toEqual(["audit.insert", "db.delete"]);
  });

  it("removes only the file for storage-fallback rows (still audits)", async () => {
    const { error } = await deleteTripDocument({ ...DOC, id: "storage-trip-1/lr/lr.pdf" });
    expect(error).toBeNull();
    expect(calls).toEqual(["audit.insert", "storage.remove"]);
  });

  it("keeps the file when row access silently deletes nothing", async () => {
    mockDeletedRows = [];
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(/could not be deleted/);
    expect(calls).toEqual(["audit.insert", "db.delete"]);
  });

  it("does not claim cleanup when storage fails after the row is gone", async () => {
    mockStorageError = { message: "Object not removed" };
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(
      /record was removed[\s\S]*file may still be in storage[\s\S]*Object not removed/,
    );
    expect(calls).toEqual(["audit.insert", "db.delete", "storage.remove"]);
  });
});
