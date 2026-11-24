/**
 * E-way lifecycle audit (24 Nov). Each block is one bug found on prod data:
 * - stale entry-list copies on other e-way rows (Trips hub tags / expiry and
 *   e-LR prefill read every row and showed changed or removed numbers);
 * - Trips hub update sheet wrote numbers onto file rows (hid the list);
 * - Compliance captions showed the list's first number on one file only;
 * - Upload on a card with a number but no file did not attach the file.
 */
import {
  applyEwayNumbersByFile,
  ewayEntryByFilePath,
  isEwayEntriesJson,
  serializeEwayFieldEntries,
  parseEwayFieldEntries,
  ewayFieldsSourceRow,
} from "../ewayBillFields.util";
import { linkEwayEntryToFile, saveEwayNumbersByFile, upsertEwayBillFields } from "../tripDocuments.service";
import { loadElrCanonicalPrefill } from "../elrPrefill.service";

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
const mockOps: string[] = [];
/** Row ids the database refuses to update (RLS: 0 rows, no error). */
let mockLocked: string[] = [];

function mockTable() {
  const filters: Record<string, unknown> = {};
  let inIds: string[] | null = null;
  let op: "select" | "update" | "insert" = "select";
  let payload: Record<string, unknown> = {};
  const match = (row: Row) =>
    Object.entries(filters).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v) &&
    (!inIds || inIds.includes(row.id));
  const run = () => {
    if (op === "update") {
      const hit = mockRows.filter(match).filter((row) => !mockLocked.includes(row.id));
      hit.forEach((row) => Object.assign(row, payload));
      mockOps.push(`update:${hit.map((r) => r.id).join(",")}`);
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    if (op === "insert") {
      mockRows.push({ id: "meta", uploaded_at: "2026-11-24T00:00:00Z", ...(payload as Partial<Row>) } as Row);
      mockOps.push("insert");
      return { data: null, error: null };
    }
    return { data: mockRows.filter(match).map((r) => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    in: (_k: string, ids: string[]) => {
      inIds = ids;
      return b;
    },
    update: (body: Record<string, unknown>) => {
      op = "update";
      payload = body;
      return b;
    },
    insert: (body: Record<string, unknown>) => {
      op = "insert";
      payload = body;
      return b;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return b;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: () => mockTable() }),
}));

const A = { ewayNo: "272334573679", createdDate: "22-Nov-26", validTill: "28-Nov-26", docNo: "262728995" };
const B = { ewayNo: "272334573680", createdDate: "22-Nov-26", validTill: "29-Nov-26", docNo: "262728996" };
const OLD = { ewayNo: "111111111111", createdDate: "01-Nov-26", validTill: "02-Nov-26", docNo: "1" };

function file(id: string, at: string, number: string | null = null): Row {
  return {
    id,
    trip_id: "trip-1",
    document_type: "eway_bill",
    storage_path: `trip-1/eway_bill/${id}.jpg`,
    file_name: `${id}.jpg`,
    uploaded_at: at,
    document_number: number,
  };
}
const path = (id: string) => `trip-1/eway_bill/${id}.jpg`;

beforeEach(() => {
  mockRows = [];
  mockOps.length = 0;
  mockLocked = [];
});

describe("stale entry-list copies", () => {
  it("a save clears older list copies on other rows but keeps a plain hub number", async () => {
    mockRows = [
      file("f1", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([OLD])), // stale copy
      file("f2", "2026-11-23T10:01:00Z", "999999999999"), // plain hub number
      file("f3", "2026-11-23T10:02:00Z", serializeEwayFieldEntries([A])), // current list
    ];
    const { error } = await upsertEwayBillFields({ tripId: "trip-1", uploadedBy: "u", values: [A, B] });
    expect(error).toBeNull();
    expect(mockOps).toEqual(["update:f3", "update:f1"]);
    expect(mockRows.find((r) => r.id === "f1")?.document_number).toBeNull();
    expect(mockRows.find((r) => r.id === "f2")?.document_number).toBe("999999999999");
    expect(isEwayEntriesJson("999999999999")).toBe(false);
  });

  it("e-LR prefill takes the number from the current list, not an older copy", async () => {
    mockRows = [
      file("f1", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([OLD])),
      file("f3", "2026-11-23T10:02:00Z", serializeEwayFieldEntries([A])),
    ];
    const prefill = await loadElrCanonicalPrefill({ tripId: "trip-1" } as never);
    expect(prefill.ewayBillNumber).toBe(A.ewayNo);
  });
});

describe("per-file numbers come from the one list", () => {
  it("pairs the list to files newest-first, like the Trip Detail cards, and never treats the details row as a file", () => {
    const rows = [
      file("old", "2026-11-23T10:00:00Z"),
      file("new", "2026-11-23T10:05:00Z", serializeEwayFieldEntries([A])),
      { ...file("meta", "2026-11-23T09:00:00Z"), storage_path: "trip-1/eway_bill/fields.json", file_name: "eway-fields.json" },
    ];
    const byPath = ewayEntryByFilePath(rows);
    expect(byPath.get(path("new"))?.ewayNo).toBe(A.ewayNo);
    expect(byPath.has(path("old"))).toBe(false);
    expect(byPath.has("trip-1/eway_bill/fields.json")).toBe(false);
  });

  it("hub numbers update the file's entry or add a linked one; blanks change nothing", () => {
    const res = applyEwayNumbersByFile({
      entries: [A],
      filePaths: [path("new"), path("old")],
      typedByPath: { [path("new")]: A.ewayNo, [path("old")]: B.ewayNo, other: "" },
    });
    expect(res.changed).toBe(true);
    expect(res.entries.map((e) => [e.ewayNo, e.filePath])).toEqual([
      [A.ewayNo, path("new")],
      [B.ewayNo, path("old")],
    ]);
    expect(applyEwayNumbersByFile({ entries: [A], filePaths: [path("x")], typedByPath: { [path("x")]: "" } }).changed).toBe(false);
  });

  it("hub save writes into the list, not onto the file rows", async () => {
    mockRows = [
      file("f1", "2026-11-23T10:00:00Z"),
      file("f2", "2026-11-23T10:05:00Z", serializeEwayFieldEntries([A])),
    ];
    const { error } = await saveEwayNumbersByFile({
      tripId: "trip-1",
      uploadedBy: "u",
      typedByPath: { [path("f2")]: A.ewayNo, [path("f1")]: B.ewayNo },
    });
    expect(error).toBeNull();
    expect(mockOps).toEqual(["update:f2"]);
    expect(mockRows.find((r) => r.id === "f1")?.document_number).toBeNull();
    const list = parseEwayFieldEntries(ewayFieldsSourceRow(mockRows)?.document_number);
    expect(list.map((e) => [e.ewayNo, e.filePath])).toEqual([
      [A.ewayNo, path("f2")],
      [B.ewayNo, path("f1")],
    ]);
  });
});

describe("Upload on a card that has a number but no file", () => {
  it("attaches the uploaded file to that number", async () => {
    mockRows = [file("f1", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([A, B]))];
    const res = await linkEwayEntryToFile({ tripId: "trip-1", uploadedBy: "u", entryIndex: 1, ewayNo: B.ewayNo, filePath: path("f9") });
    expect(res).toEqual({ error: null, linked: true });
    const list = parseEwayFieldEntries(mockRows[0]!.document_number);
    expect(list[1]?.filePath).toBe(path("f9"));
    expect(list[0]?.filePath).toBeUndefined();
  });

  it("changes nothing when the list changed meanwhile (different number at that position)", async () => {
    mockRows = [file("f1", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([A, OLD]))];
    const res = await linkEwayEntryToFile({ tripId: "trip-1", uploadedBy: "u", entryIndex: 1, ewayNo: B.ewayNo, filePath: path("f9") });
    expect(res.linked).toBe(false);
    expect(mockOps).toEqual([]);
  });
});

describe("save refused on the list's row (Ground Ops, locked trip)", () => {
  it("puts the whole list on the newest e-way row (their own upload), so it still shows", async () => {
    mockRows = [
      file("theirs", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([{ ...A, filePath: path("theirs") }])),
      file("mine", "2026-11-23T10:05:00Z"),
    ];
    mockLocked = ["theirs"];
    const { error } = await saveEwayNumbersByFile({
      tripId: "trip-1",
      uploadedBy: "u",
      typedByPath: { [path("mine")]: B.ewayNo },
    });
    expect(error).toBeNull();
    const shown = parseEwayFieldEntries(ewayFieldsSourceRow(mockRows)?.document_number);
    expect(shown.map((e) => e.ewayNo)).toEqual([A.ewayNo, B.ewayNo]);
  });

  it("reports the failure when no row can be written", async () => {
    mockRows = [file("theirs", "2026-11-23T10:00:00Z", serializeEwayFieldEntries([A]))];
    mockLocked = ["theirs"];
    const { error } = await upsertEwayBillFields({ tripId: "trip-1", uploadedBy: "u", values: [A, B] });
    expect(error?.message).toMatch(/was not saved/);
  });
});
