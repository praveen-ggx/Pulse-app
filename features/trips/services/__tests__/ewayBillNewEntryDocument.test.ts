/**
 * Preprod 24 Nov, SAT812GOGTRIP002240 (Ashick): e-way bills 3 and 4 were
 * added with "Add e-way number" and had no document, yet their cards showed
 * the trip's first e-way image — it looked like bill 1's image was copied.
 * Now: such a card shows no image, and a new e-way bill is added together
 * with its own document (file uploaded, number linked to it).
 */
import {
  buildEwayBillStripRows,
  ewayFieldsSourceRow,
  parseEwayFieldEntries,
  serializeEwayFieldEntries,
} from "../ewayBillFields.util";
import { addEwayBillWithFile } from "../tripDocuments.service";

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
let mockStorageError: { message: string } | null = null;
let mockRefuseUpdate = false;
const mockOps: string[] = [];

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
      if (mockRefuseUpdate) return { data: [], error: null };
      const hit = mockRows.filter(match);
      hit.forEach((row) => Object.assign(row, payload));
      mockOps.push(`update:${hit.map((r) => r.id).join(",")}`);
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    if (op === "insert") {
      const row = { id: `new-${mockRows.length}`, uploaded_at: "2026-11-24T06:00:00Z", ...(payload as Partial<Row>) } as Row;
      mockRows.push(row);
      mockOps.push(`insert:${row.document_type}`);
      return { data: { ...row }, error: null };
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
    single: async () => run(),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return b;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => mockTable(),
    auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
    storage: {
      from: () => ({
        upload: async () => {
          mockOps.push("storage.upload");
          return { error: mockStorageError };
        },
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

jest.mock("@/lib/platform/events/InProcessEventBus", () => ({
  getPlatformEventBus: () => ({ publish: async () => undefined }),
}));

const A = { ewayNo: "122608979624", createdDate: "09-Nov-26", validTill: "10-Nov-26", docNo: "TS2026705580" };
const C = { ewayNo: "123456789124", createdDate: "24-Nov-26", validTill: "30-Nov-26", docNo: "D3" };
const P1 = "trip-1/eway_bill/p1.pdf";

function pdf(id: string, at: string, number: string | null = null): Row {
  return {
    id,
    trip_id: "trip-1",
    document_type: "eway_bill",
    storage_path: `trip-1/eway_bill/${id}.pdf`,
    file_name: `${id}.pdf`,
    uploaded_at: at,
    document_number: number,
  };
}

beforeEach(() => {
  mockRows = [];
  mockOps.length = 0;
  mockStorageError = null;
  mockRefuseUpdate = false;
});

describe("a number without its own document", () => {
  it("shows no image instead of the trip's first e-way image (002240)", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldEntries([{ ...A, filePath: P1 }, C]),
        storagePath: P1,
        files: [{ id: "file-1", label: "Eway Bill", type: "PDF", storagePath: P1 }],
      } as never,
    });
    expect(rows.map((r) => [r.ewayNo, r.previewPath, r.canView])).toEqual([
      [A.ewayNo, P1, true],
      [C.ewayNo, null, false],
    ]);
  });

  it("a single-file e-way slot with no file list keeps showing that file (no change)", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldEntries([A]),
        storagePath: P1,
      } as never,
    });
    expect(rows[0]?.previewPath).toBe(P1);
  });
});

describe("addEwayBillWithFile: a new e-way bill comes with its own document", () => {
  const file = { arrayBuffer: new Uint8Array([1, 2, 3]).buffer, fileName: "ewb3.pdf", mimeType: "application/pdf" };

  it("uploads the file and adds the number linked to it, keeping the existing numbers", async () => {
    mockRows = [pdf("p1", "2026-11-11T11:13:00Z", serializeEwayFieldEntries([{ ...A, filePath: P1 }]))];
    const { error } = await addEwayBillWithFile({ tripId: "trip-1", uploadedBy: "u", entry: C, file });
    expect(error).toBeNull();
    expect(mockOps[0]).toBe("storage.upload");
    expect(mockOps[1]).toBe("insert:eway_bill");
    const uploaded = mockRows.find((r) => r.file_name === "ewb3.pdf")!;
    const list = parseEwayFieldEntries(ewayFieldsSourceRow(mockRows)?.document_number);
    expect(list.map((e) => [e.ewayNo, e.filePath])).toEqual([
      [A.ewayNo, P1],
      [C.ewayNo, uploaded.storage_path],
    ]);
  });

  it("adds nothing when the file upload fails", async () => {
    mockRows = [pdf("p1", "2026-11-11T11:13:00Z", serializeEwayFieldEntries([{ ...A, filePath: P1 }]))];
    mockStorageError = { message: "Upload refused" };
    const { error } = await addEwayBillWithFile({ tripId: "trip-1", uploadedBy: "u", entry: C, file });
    expect(error).not.toBeNull();
    expect(parseEwayFieldEntries(mockRows[0]!.document_number).map((e) => e.ewayNo)).toEqual([A.ewayNo]);
  });

  it("says plainly when the file was saved but the number was not", async () => {
    mockRows = [pdf("p1", "2026-11-11T11:13:00Z", serializeEwayFieldEntries([{ ...A, filePath: P1 }]))];
    mockRefuseUpdate = true;
    const { error } = await addEwayBillWithFile({ tripId: "trip-1", uploadedBy: "u", entry: C, file });
    expect(error?.message).toMatch(/document was uploaded, but the e-way number was not saved/);
  });
});
