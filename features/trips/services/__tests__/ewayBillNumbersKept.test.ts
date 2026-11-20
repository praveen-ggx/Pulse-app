/**
 * E-way numbers must survive removing an e-way file, and a save must land on
 * the row the screens read. Prod 20 Nov (SAT812GOGTRIP002926): the numbers
 * were written onto an uploaded file row, the file was removed, and every
 * e-way number saved with it was deleted.
 *
 * The fake table applies update / insert / delete for real, so each test
 * checks the resulting rows, not just which calls were made.
 */
import { deleteEwayBillDocument, upsertEwayBillFields, type TripDocumentRow } from "../tripDocuments.service";
import { ewayFieldsSourceRow, parseEwayFieldEntries } from "../ewayBillFields.util";

type Row = {
  id: string;
  trip_id: string;
  document_type: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string | null;
  document_number: string | null;
};

let mockRows: Row[] = [];
let mockRefuseUpdate = false;
const mockOps: string[] = [];

function mockTable() {
  const filters: Record<string, unknown> = {};
  let op: "select" | "update" | "insert" | "delete" = "select";
  let payload: Record<string, unknown> = {};
  const match = (row: Row) =>
    Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value);
  const run = () => {
    if (op === "update") {
      if (mockRefuseUpdate) return { data: [], error: null };
      const hit = mockRows.filter(match);
      hit.forEach((row) => Object.assign(row, payload));
      mockOps.push(`update:${hit.map((r) => r.id).join(",")}`);
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    if (op === "insert") {
      mockRows.push({ id: "meta-new", uploaded_at: "2026-11-20T10:00:00Z", ...(payload as Partial<Row>) } as Row);
      mockOps.push("insert");
      return { data: null, error: null };
    }
    if (op === "delete") {
      const hit = mockRows.filter(match);
      mockRows = mockRows.filter((row) => !match(row));
      mockOps.push(`delete:${hit.map((r) => r.id).join(",")}`);
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    return { data: mockRows.filter(match).map((r) => ({ ...r })), error: null };
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (key: string, value: unknown) => {
      filters[key] = value;
      return builder;
    },
    update: (body: Record<string, unknown>) => {
      op = "update";
      payload = body;
      return builder;
    },
    insert: (body: Record<string, unknown>) => {
      op = "insert";
      payload = body;
      return builder;
    },
    delete: () => {
      op = "delete";
      return builder;
    },
    then: (resolve: (value: unknown) => void) => resolve(run()),
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trip_documents") return mockTable();
      // Audit snapshot before delete; not under test here.
      return { insert: async () => ({ error: null }) };
    },
    storage: {
      from: () => ({
        remove: async () => {
          mockOps.push("storage.remove");
          return { error: null };
        },
      }),
    },
  }),
}));

const A = { ewayNo: "262333030309", createdDate: "20-Nov-26", validTill: "26-Nov-26", docNo: "262728650" };
const B = { ewayNo: "262333030310", createdDate: "20-Nov-26", validTill: "27-Nov-26", docNo: "262728651" };
const json = (...entries: (typeof A)[]) => JSON.stringify({ ...entries[0], entries });

function eway(id: string, uploadedAt: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    trip_id: "trip-1",
    document_type: "eway_bill",
    storage_path: `trip-1/eway_bill/${id}.pdf`,
    file_name: `${id}.pdf`,
    uploaded_at: uploadedAt,
    document_number: null,
    ...extra,
  };
}

const META = (numbers: string | null) =>
  eway("meta", "2026-11-20T07:42:28Z", {
    storage_path: "trip-1/eway_bill/fields.json",
    file_name: "eway-fields.json",
    document_number: numbers,
  });

const shownNumbers = () =>
  parseEwayFieldEntries(ewayFieldsSourceRow(mockRows)?.document_number).map((entry) => entry.ewayNo);

const asDoc = (row: Row) => ({ ...row, uploaded_by: "u", mime_type: null, size_bytes: null }) as unknown as TripDocumentRow;

beforeEach(() => {
  mockRows = [];
  mockOps.length = 0;
  mockRefuseUpdate = false;
});

describe("upsertEwayBillFields writes where the screens read", () => {
  it("adds a 2nd number onto the row that already holds the numbers, not onto an arbitrary file", async () => {
    // File rows listed first, numbers on the details row (002926's starting point).
    mockRows = [eway("file-old", "2026-11-20T07:30:00Z"), META(json(A)), eway("file-new", "2026-11-20T09:05:00Z")];
    const { error } = await upsertEwayBillFields({ tripId: "trip-1", uploadedBy: "u", values: [A, B] });
    expect(error).toBeNull();
    expect(mockOps).toEqual(["update:meta"]);
    expect(shownNumbers()).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("with no numbers yet, writes onto the newest uploaded file", async () => {
    mockRows = [eway("file-old", "2026-11-20T07:30:00Z"), eway("file-new", "2026-11-20T09:05:00Z")];
    await upsertEwayBillFields({ tripId: "trip-1", uploadedBy: "u", values: [A] });
    expect(mockOps).toEqual(["update:file-new"]);
    expect(shownNumbers()).toEqual([A.ewayNo]);
  });

  it("with no e-way rows at all, creates the details row", async () => {
    await upsertEwayBillFields({ tripId: "trip-1", uploadedBy: "u", values: [A] });
    expect(mockOps).toEqual(["insert"]);
    expect(shownNumbers()).toEqual([A.ewayNo]);
  });
});

describe("deleteEwayBillDocument keeps the numbers", () => {
  it("removing the file that holds the numbers moves them first, then deletes the file", async () => {
    mockRows = [META(json(A)), eway("file-1", "2026-11-20T07:45:00Z", { document_number: json(A, B) })];
    const { error } = await deleteEwayBillDocument(asDoc(mockRows[1]!), "u");
    expect(error).toBeNull();
    expect(mockOps).toEqual(["update:meta", "delete:file-1", "storage.remove"]);
    expect(shownNumbers()).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("moves them to the newest remaining row (where the screens look next)", async () => {
    mockRows = [
      META(json(A)),
      eway("file-2", "2026-11-20T08:00:00Z"),
      eway("file-1", "2026-11-20T09:00:00Z", { document_number: json(A, B) }),
    ];
    await deleteEwayBillDocument(asDoc(mockRows[2]!), "u");
    expect(mockOps[0]).toBe("update:file-2");
    expect(shownNumbers()).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("removing the only e-way file creates a details row with its numbers", async () => {
    mockRows = [eway("file-1", "2026-11-20T07:45:00Z", { document_number: json(A, B) })];
    await deleteEwayBillDocument(asDoc(mockRows[0]!), "u");
    expect(mockOps).toEqual(["insert", "delete:file-1", "storage.remove"]);
    expect(shownNumbers()).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("removing a file that does not hold the shown numbers just deletes it", async () => {
    mockRows = [META(json(A, B)), eway("file-1", "2026-11-20T07:45:00Z")];
    await deleteEwayBillDocument(asDoc(mockRows[1]!), "u");
    expect(mockOps).toEqual(["delete:file-1", "storage.remove"]);
    expect(shownNumbers()).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("when the numbers cannot be moved, nothing is deleted", async () => {
    mockRows = [META(json(A)), eway("file-1", "2026-11-20T07:45:00Z", { document_number: json(A, B) })];
    mockRefuseUpdate = true;
    const { error } = await deleteEwayBillDocument(asDoc(mockRows[1]!), "u");
    expect(error?.message).toMatch(/Nothing was removed/);
    expect(mockOps).toEqual([]);
    expect(mockRows.map((r) => r.id)).toEqual(["meta", "file-1"]);
  });
});
