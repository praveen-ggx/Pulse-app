import {
  normalizePartyName,
  partyMatchesAssigner,
  sortTagPartyOptions,
} from "../driverPartyTagRecommend.util";

describe("partyMatchesAssigner", () => {
  it("matches fleet names ignoring case and extra spaces", () => {
    expect(normalizePartyName("  Nihas  Logstos ")).toBe("nihas logstos");
    expect(partyMatchesAssigner("nihas logstos", "Nihas Logstos")).toBe(true);
    expect(partyMatchesAssigner("Godrej logs", "nihas logstos")).toBe(false);
  });
});

describe("sortTagPartyOptions", () => {
  const rows = [
    { name: "Godrej logs", linkedToTrip: true, matchesAssigner: false },
    { name: "Aero", linkedToTrip: false, matchesAssigner: false },
    { name: "nihas logstos", linkedToTrip: false, matchesAssigner: true },
  ];

  it("puts fleet first for non-DCO", () => {
    expect(sortTagPartyOptions(rows, true).map((r) => r.name)).toEqual([
      "nihas logstos",
      "Godrej logs",
      "Aero",
    ]);
  });

  it("puts the tagged party first for DCO", () => {
    expect(sortTagPartyOptions(rows, false).map((r) => r.name)).toEqual([
      "Godrej logs",
      "nihas logstos",
      "Aero",
    ]);
  });
});
