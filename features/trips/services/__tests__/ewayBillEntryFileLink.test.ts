/**
 * Prod 23 Nov, SAT812GOGTRIP003016: three e-way images, one saved number.
 * Edit on the 2nd / 3rd card (file, no number) "saved" but the typed details
 * were dropped: the editor only replaced an entry at that card's position,
 * and there was none. Each test runs the real round trip: cards -> Edit ->
 * save -> stored JSON -> cards again.
 */
import {
  buildEwayBillStripRows,
  ewayEntriesFromRows,
  nextEwayEntries,
  pairEwayEntriesWithFiles,
  serializeEwayFieldEntries,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "../ewayBillFields.util";

const F1 = "trip-1/eway_bill/f1.jpg";
const F2 = "trip-1/eway_bill/f2.jpg";
const F3 = "trip-1/eway_bill/f3.jpg";

const A = { ewayNo: "272334573679", createdDate: "22-Nov-26", validTill: "28-Nov-26", docNo: "262728995" };
const B = { ewayNo: "272334573680", createdDate: "22-Nov-26", validTill: "29-Nov-26", docNo: "262728996" };
const C = { ewayNo: "272334573681", createdDate: "22-Nov-26", validTill: "30-Nov-26", docNo: "262728997" };

function cards(entries: EwayFieldValues[], filePaths: string[] = [F1, F2, F3]): EwayBillStripRow[] {
  return buildEwayBillStripRows({
    ewayDoc: {
      id: "eway_bill",
      label: "Eway Bill",
      type: "JPG",
      status: "Uploaded",
      documentNumber: entries.length ? serializeEwayFieldEntries(entries) : null,
      storagePath: filePaths[0],
      files: filePaths.map((path, index) => ({
        id: `file-${index + 1}`,
        label: "Eway Bill",
        type: "JPG",
        storagePath: path,
      })),
    } as never,
  });
}

// Same mapping the editor uses (EwayBillVaultTab rowToDraft), on raw values.
const undash = (value: string) => (value === "—" ? "" : value);
function toFields(row: EwayBillStripRow): EwayFieldValues {
  return {
    ewayNo: undash(row.ewayNo),
    createdDate: undash(row.createdDate),
    validTill: undash(row.validTill),
    docNo: undash(row.docNo),
    ...(row.entryFilePath
      ? { filePath: row.entryFilePath }
      : row.entryIndex >= 0 && row.fileStoragePath
        ? { filePath: row.fileStoragePath }
        : {}),
  };
}

/** Press Edit on a card, type `typed`, Save. Returns the saved entries. */
function editCard(entries: EwayFieldValues[], cardIndex: number, typed: typeof A, filePaths?: string[]) {
  const rows = cards(entries, filePaths);
  const row = rows[cardIndex]!;
  const draft: EwayFieldValues = {
    ...toFields(row),
    ...typed,
    ...(row.fileStoragePath ? { filePath: row.fileStoragePath } : {}),
  };
  return nextEwayEntries({
    existing: ewayEntriesFromRows(rows, toFields),
    editingIndex: row.entryIndex < 0 ? "new" : row.entryIndex,
    draft,
    mode: "save",
  });
}

const shown = (entries: EwayFieldValues[], filePaths?: string[]) =>
  cards(entries, filePaths).map((row) => row.ewayNo);

describe("e-way number typed on a card stays on that card", () => {
  it("003016: Edit on the 2nd card saves its number (was silently dropped)", () => {
    const start = [A]; // first number saved before links existed
    expect(shown(start)).toEqual([A.ewayNo, "—", "—"]);
    const saved = editCard(start, 1, B);
    expect(saved.map((e) => e.ewayNo)).toEqual([A.ewayNo, B.ewayNo]);
    expect(shown(saved)).toEqual([A.ewayNo, B.ewayNo, "—"]);
  });

  it("filling the 3rd card before the 2nd keeps each number on its own card", () => {
    const afterThird = editCard([A], 2, C);
    expect(shown(afterThird)).toEqual([A.ewayNo, "—", C.ewayNo]);
    const afterSecond = editCard(afterThird, 1, B);
    expect(shown(afterSecond)).toEqual([A.ewayNo, B.ewayNo, C.ewayNo]);
  });

  it("saving one number keeps the other numbers' links and the saved order (primary stays first)", () => {
    const linked = editCard(editCard([A], 2, C), 1, B); // A, C(→f3), B(→f2)
    const reEditA = editCard(linked, 0, { ...A, docNo: "999" });
    expect(reEditA.map((e) => e.ewayNo)).toEqual([A.ewayNo, C.ewayNo, B.ewayNo]);
    expect(reEditA.find((e) => e.ewayNo === C.ewayNo)?.filePath).toBe(F3);
    expect(reEditA.find((e) => e.ewayNo === B.ewayNo)?.filePath).toBe(F2);
    expect(shown(reEditA)).toEqual([A.ewayNo, B.ewayNo, C.ewayNo]);
  });

  it("numbers saved before links existed still match files by position (no display change)", () => {
    expect(shown([A, B])).toEqual([A.ewayNo, B.ewayNo, "—"]);
    expect(pairEwayEntriesWithFiles([{}, {}], [F1, F2, F3])).toEqual([0, 1, null]);
  });

  it("a number whose image was removed keeps its own card instead of jumping onto another image", () => {
    const linked = editCard([A], 2, C); // C → f3
    const rows = cards(linked, [F1, F2]); // f3 removed
    expect(rows.map((r) => [r.ewayNo, r.fileStoragePath])).toEqual([
      [A.ewayNo, F1],
      ["—", F2],
      [C.ewayNo, null],
    ]);
  });

  it("Add e-way number (no card) still adds a number that fills the next free image", () => {
    const saved = nextEwayEntries({ existing: [A], editingIndex: "new", draft: { ...B }, mode: "save" });
    expect(shown(saved)).toEqual([A.ewayNo, B.ewayNo, "—"]);
  });
});

describe("nextEwayEntries", () => {
  it("replaces an existing entry in place", () => {
    expect(
      nextEwayEntries({ existing: [A, B], editingIndex: 1, draft: { ...C }, mode: "save" }).map((e) => e.ewayNo),
    ).toEqual([A.ewayNo, C.ewayNo]);
  });

  it("adds instead of dropping when the edited position has no entry", () => {
    expect(
      nextEwayEntries({ existing: [A], editingIndex: 2, draft: { ...C }, mode: "save" }).map((e) => e.ewayNo),
    ).toEqual([A.ewayNo, C.ewayNo]);
  });

  it("removes only the edited entry", () => {
    expect(
      nextEwayEntries({ existing: [A, B], editingIndex: 0, draft: { ...A }, mode: "remove" }).map((e) => e.ewayNo),
    ).toEqual([B.ewayNo]);
  });
});

describe("a new upload does not move an unlinked number", () => {
  it("before any save, an unlinked number shows on the newest file (old positional behaviour)", () => {
    // f0 is uploaded after the list was saved; cards are newest first.
    expect(shown([A], ["trip-1/eway_bill/f0.jpg", F1])).toEqual([A.ewayNo, "—"]);
  });

  it("after any save, every number is pinned to the file it was shown with", () => {
    const saved = editCard([A], 1, B); // A shown on f1, B typed on f2
    expect(saved.find((e) => e.ewayNo === A.ewayNo)?.filePath).toBe(F1);
    // A new upload f0 (newest) no longer takes A.
    expect(shown(saved, ["trip-1/eway_bill/f0.jpg", F1, F2, F3])).toEqual(["—", A.ewayNo, B.ewayNo, "—"]);
  });
});
