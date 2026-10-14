import {
  searchIndentsByCodeForTrips,
  tripsIndentCodeSearchOrFilter,
} from "../indents.service";

const mockLimit = jest.fn();
const mockOrder = jest.fn(() => ({ limit: mockLimit }));
const mockOr = jest.fn(() => ({ order: mockOrder }));
const mockEq = jest.fn(() => ({ or: mockOr }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockTripIn = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trips") {
        return { select: () => ({ in: mockTripIn }) };
      }
      return { select: mockSelect };
    },
  }),
}));

const older = {
  id: "older",
  organization_id: "gogovan",
  indent_operational_code: "SAT812GOGIND000788",
  indent_code: "SAT812-IND-787",
  indent_number: "IND787",
  status: "awarded",
  client_name: "Bluestar",
  pickup_area: "Chennai",
  drop_location: "Coimbatore",
  created_at: "2026-09-23T09:24:04.188Z",
};

beforeEach(() => {
  mockLimit.mockReset();
  mockOrder.mockClear();
  mockOr.mockClear();
  mockEq.mockClear();
  mockSelect.mockClear();
  mockTripIn.mockReset();
  mockLimit.mockResolvedValue({ data: [older], error: null });
  mockTripIn.mockResolvedValue({ data: [], error: null });
});

describe("tripsIndentCodeSearchOrFilter", () => {
  it("matches operational code, indent code, and indent number", () => {
    expect(tripsIndentCodeSearchOrFilter("  SAT812GOGIND000788 ")).toBe(
      [
        "indent_operational_code.ilike.%SAT812GOGIND000788%",
        "indent_code.ilike.%SAT812GOGIND000788%",
        "indent_number.ilike.%SAT812GOGIND000788%",
      ].join(","),
    );
  });

  it("does not build a filter for a blank search", () => {
    expect(tripsIndentCodeSearchOrFilter("   ")).toBeNull();
  });
});

describe("searchIndentsByCodeForTrips", () => {
  it("does not query when the toolbar search is empty", async () => {
    const res = await searchIndentsByCodeForTrips("gogovan", "  ");
    expect(res).toEqual({ error: null, indents: [] });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("looks up this org by the three code columns, oldest first, and keeps the row", async () => {
    const res = await searchIndentsByCodeForTrips("gogovan", "SAT812GOGIND000788");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("organization_id", "gogovan");
    expect(mockOr).toHaveBeenCalledWith(
      tripsIndentCodeSearchOrFilter("SAT812GOGIND000788"),
    );
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(res.error).toBeNull();
    expect(res.indents.map((row) => row.id)).toEqual(["older"]);
    expect(res.indents[0]?.indent_operational_code).toBe("SAT812GOGIND000788");
  });
});
