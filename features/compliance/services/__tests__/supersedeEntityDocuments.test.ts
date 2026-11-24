import { listLiveEntityDocumentIds, supersedeEntityDocuments } from "../documents.service";

type Call = { op: string; args: unknown[] };
const calls: Call[] = [];
let mockError: { message: string } | null = null;
let mockRows: { id: string }[] = [];

function mockChain(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "update", "eq", "in", "not"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: mockRows, error: mockError });
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return mockChain();
    },
  }),
}));

beforeEach(() => {
  calls.length = 0;
  mockError = null;
  mockRows = [];
});

describe("supersedeEntityDocuments (replace keeps history)", () => {
  it("marks exactly the snapshot rows replaced, pointing at the new row; never deletes", async () => {
    const { error } = await supersedeEntityDocuments(["old-1", "old-2", "new"], "new");
    expect(error).toBeNull();
    const update = calls.find((c) => c.op === "update");
    expect(update?.args[0]).toMatchObject({ status: "replaced", replaced_by_id: "new" });
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["id", ["old-1", "old-2"]]);
    // Rows already replaced / rejected are left untouched.
    expect(calls.find((c) => c.op === "not")?.args).toEqual(["status", "in", "(replaced,rejected)"]);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("does nothing when there is nothing to retire", async () => {
    const { error } = await supersedeEntityDocuments([], "new");
    expect(error).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("reports a failed update instead of hiding it", async () => {
    mockError = { message: "permission denied" };
    const { error } = await supersedeEntityDocuments(["old-1"], null);
    expect(error?.message).toBe("permission denied");
  });
});

describe("listLiveEntityDocumentIds (replace snapshot)", () => {
  it("reads only live rows of one slot", async () => {
    mockRows = [{ id: "a" }, { id: "b" }];
    const { ids, error } = await listLiveEntityDocumentIds({
      orgId: "org",
      entityType: "vehicle",
      entityId: "veh",
      docType: "insurance",
    });
    expect(error).toBeNull();
    expect(ids).toEqual(["a", "b"]);
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([
      ["organization_id", "org"],
      ["entity_type", "vehicle"],
      ["entity_id", "veh"],
      ["doc_type", "insurance"],
    ]);
    expect(calls.find((c) => c.op === "not")?.args).toEqual(["status", "in", "(replaced,rejected)"]);
  });
});
