import { getDocumentAuditLog } from "../documents.service";

let lastOrFilter: string | null = null;
let mockRows: Array<Record<string, unknown>> = [];
let mockError: { message: string } | null = null;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => ({
      select: () => ({
        or: (filter: string) => {
          lastOrFilter = filter;
          const chain = {
            order: () => chain,
            limit: () => chain,
            then: (
              resolve: (value: { data: unknown; error: unknown }) => unknown,
            ) => resolve({ data: mockError ? null : mockRows, error: mockError }),
          };
          return chain;
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  lastOrFilter = null;
  mockRows = [];
  mockError = null;
});

describe("getDocumentAuditLog", () => {
  it("looks up live document_id and NULL delete metadata", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    mockRows = [
      {
        id: "audit-1",
        document_id: null,
        organization_id: "org-1",
        entity_type: "driver",
        entity_id: "entity-1",
        action: "deleted",
        actor_id: null,
        old_status: "verified",
        new_status: null,
        notes: null,
        metadata: { document_id: id, doc_type: "license", storage_path: "org/d/l.pdf" },
        created_at: "2026-10-24T00:00:00Z",
      },
    ];
    const { error, entries } = await getDocumentAuditLog(id);
    expect(error).toBeNull();
    expect(lastOrFilter).toContain(`document_id.eq.${id}`);
    expect(lastOrFilter).toContain(`metadata->>document_id.eq.${id}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("deleted");
    expect(entries[0]?.documentId).toBeNull();
    expect(entries[0]?.entityId).toBe("entity-1");
    expect(entries[0]?.metadata).toEqual({
      document_id: id,
      doc_type: "license",
      storage_path: "org/d/l.pdf",
    });
  });

  it("does not query when the id would break the or-filter", async () => {
    const { error, entries } = await getDocumentAuditLog("id,document_id.eq.other");
    expect(error?.message).toMatch(/Invalid document id/);
    expect(entries).toEqual([]);
    expect(lastOrFilter).toBeNull();
  });
});
