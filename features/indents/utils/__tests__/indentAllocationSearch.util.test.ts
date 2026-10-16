import {
  filterDriversByAllocationQuery,
  filterVehiclesByAllocationQuery,
} from "@/features/indents/utils/indentAllocationSearch.util";

const DRIVERS = [
  { id: "1", name: "Ravi Kumar", phone: "+91 98765 43210", email: "ravi@example.com" },
  { id: "2", name: "Suresh", phone: "9123456780", email: null },
  { id: "3", name: null, phone: null, email: "anon@fleet.in" },
];

const VEHICLES = [
  { id: "a", vehicle_number: "TN17AS2202", vehicle_type: "Truck", vehicle_body_type: "Open" },
  { id: "b", vehicle_number: "22BH1234AB", vehicle_type: "Trailer", vehicle_body_type: null },
  { id: "c", vehicle_number: "KA05MG1234", vehicle_type: null, vehicle_body_type: "Container" },
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("filterDriversByAllocationQuery", () => {
  it("returns everyone for an empty or blank query", () => {
    expect(ids(filterDriversByAllocationQuery(DRIVERS, ""))).toEqual(["1", "2", "3"]);
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "   "))).toEqual(["1", "2", "3"]);
  });

  it("matches name case-insensitively", () => {
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "ravi"))).toEqual(["1"]);
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "SUR"))).toEqual(["2"]);
  });

  it("matches phone digits ignoring spaces and +91 formatting", () => {
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "98765 432"))).toEqual(["1"]);
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "91234"))).toEqual(["2"]);
  });

  it("matches email", () => {
    expect(ids(filterDriversByAllocationQuery(DRIVERS, "fleet.in"))).toEqual(["3"]);
  });

  it("returns nothing when no field matches", () => {
    expect(filterDriversByAllocationQuery(DRIVERS, "zzz")).toEqual([]);
  });
});

describe("filterVehiclesByAllocationQuery", () => {
  it("returns every vehicle for an empty query", () => {
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, ""))).toEqual(["a", "b", "c"]);
  });

  it("matches plate ignoring spaces and case", () => {
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, "tn 17"))).toEqual(["a"]);
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, "22 BH"))).toEqual(["b"]);
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, "1234"))).toEqual(["b", "c"]);
  });

  it("matches vehicle type and body type", () => {
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, "trailer"))).toEqual(["b"]);
    expect(ids(filterVehiclesByAllocationQuery(VEHICLES, "container"))).toEqual(["c"]);
  });

  it("returns nothing when no field matches", () => {
    expect(filterVehiclesByAllocationQuery(VEHICLES, "xyz9")).toEqual([]);
  });
});
