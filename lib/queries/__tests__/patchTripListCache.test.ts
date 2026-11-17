import { mergeTripRowIntoList } from "@/lib/queries/patchTripListCache";

describe("mergeTripRowIntoList", () => {
  it("patches the matching trip and leaves the list when the id is absent", () => {
    const rows = [{ id: "a", status: "open" }, { id: "b", status: "open" }];
    const next = mergeTripRowIntoList(rows, "a", { status: "closed" });
    expect(next).toEqual([
      { id: "a", status: "closed" },
      { id: "b", status: "open" },
    ]);
    expect(mergeTripRowIntoList(rows, "missing", { status: "closed" })).toBe(rows);
    expect(mergeTripRowIntoList(null, "a", { status: "closed" })).toBeNull();
  });
});
