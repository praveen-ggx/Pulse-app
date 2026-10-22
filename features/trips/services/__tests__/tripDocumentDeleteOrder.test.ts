import { deleteTripDocument, type TripDocumentRow } from "../tripDocuments.service";

/**
 * The row is deleted before the stored file. When the database refuses the
 * delete (approved / Ground Ops-locked document), the file must stay.
 */

const calls: string[] = [];
let mockDbError: { message: string; code?: string } | null = null;
let mockDeletedRows: { id: string }[] = [{ id: "doc-1" }];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => ({
      delete: () => ({
        eq: () => ({
          select: async () => {
            calls.push("db.delete");
            return { data: mockDbError ? null : mockDeletedRows, error: mockDbError };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        remove: async () => {
          calls.push("storage.remove");
          return { error: null };
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
  mockDeletedRows = [{ id: "doc-1" }];
});

describe("deleteTripDocument", () => {
  it("deletes the row, then the file", async () => {
    const { error } = await deleteTripDocument(DOC);
    expect(error).toBeNull();
    expect(calls).toEqual(["db.delete", "storage.remove"]);
  });

  it("keeps the file when the database refuses the delete", async () => {
    mockDbError = {
      message: "Ground Ops cannot change this document: trip is in transit",
      code: "42501",
    };
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(/Ground Ops cannot change/);
    expect(calls).toEqual(["db.delete"]);
  });

  it("removes only the file for storage-fallback rows", async () => {
    const { error } = await deleteTripDocument({ ...DOC, id: "storage-trip-1/lr/lr.pdf" });
    expect(error).toBeNull();
    expect(calls).toEqual(["storage.remove"]);
  });

  it("keeps the file when row access silently deletes nothing", async () => {
    mockDeletedRows = [];
    const { error } = await deleteTripDocument(DOC);
    expect(error?.message).toMatch(/could not be deleted/);
    expect(calls).toEqual(["db.delete"]);
  });
});
