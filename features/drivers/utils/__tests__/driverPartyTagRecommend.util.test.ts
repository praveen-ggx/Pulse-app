import {
  normalizePartyName,
  partyMatchesAssigner,
  sortTagPartyOptions,
  tagPartyListDetail,
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

  it("hides linked-org placeholder phones and keeps a real contact", () => {
    expect(
      tagPartyListDetail({
        phone: "linked-398a89ee-19a7-4d11-9ed1-d67c1f038c83",
        linkedOrganizationId: "398a89ee-19a7-4d11-9ed1-d67c1f038c83",
      }),
    ).toBe("Linked on Pulse");
    expect(
      tagPartyListDetail({
        phone: "+917777777777",
        contactPerson: "Pen",
      }),
    ).toBe("Pen · +917777777777");
  });

  it("puts the tagged party first for DCO", () => {
    expect(sortTagPartyOptions(rows, false).map((r) => r.name)).toEqual([
      "Godrej logs",
      "nihas logstos",
      "Aero",
    ]);
  });
});
