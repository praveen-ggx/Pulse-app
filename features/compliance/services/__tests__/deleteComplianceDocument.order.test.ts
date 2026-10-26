import { deleteComplianceDocument } from "../documents.service";

const calls: string[] = [];
let mockDbError: { message: string } | null = null;
let mockUnlinkError: { message: string } | null = null;
let mockStorageError: { message: string } | null = null;
let mockDeletedRows: { id: string }[] = [{ id: "doc-1" }];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => ({
      update: () => ({
        eq: async () => {
          calls.push("db.unlink");
          return { error: mockUnlinkError };
        },
      }),
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
          return { error: mockStorageError };
        },
      }),
    },
  }),
}));

beforeEach(() => {
  calls.length = 0;
  mockDbError = null;
  mockUnlinkError = null;
  mockStorageError = null;
  mockDeletedRows = [{ id: "doc-1" }];
});

describe("deleteComplianceDocument", () => {
  it("deletes the row, then the file", async () => {
    const { error } = await deleteComplianceDocument("doc-1", "org/driver/license.pdf");
    expect(error).toBeNull();
    expect(calls).toEqual(["db.unlink", "db.delete", "storage.remove"]);
  });

  it("stops before delete when a predecessor still points at this file", async () => {
    mockUnlinkError = {
      message:
        'update or delete on table "entity_documents" violates foreign key constraint "entity_documents_replaced_by_id_fkey"',
    };
    const { error } = await deleteComplianceDocument("doc-1", "org/driver/license.pdf");
    expect(error?.message).toMatch(/entity_documents_replaced_by_id_fkey/);
    expect(calls).toEqual(["db.unlink"]);
  });

  it("keeps the file and surfaces the audit FK error", async () => {
    mockDbError = {
      message:
        'insert or update on table "document_audit_log" violates foreign key constraint "document_audit_log_document_id_fkey"',
    };
    const { error } = await deleteComplianceDocument("doc-1", "org/driver/license.pdf");
    expect(error?.message).toMatch(/document_audit_log_document_id_fkey/);
    expect(calls).toEqual(["db.unlink", "db.delete"]);
  });

  it("does not claim cleanup when storage fails after the row is gone", async () => {
    mockStorageError = { message: "Object not removed" };
    const { error } = await deleteComplianceDocument("doc-1", "org/driver/license.pdf");
    expect(error?.message).toMatch(
      /record was removed[\s\S]*file may still be in storage[\s\S]*Object not removed/,
    );
    expect(calls).toEqual(["db.unlink", "db.delete", "storage.remove"]);
  });
});
