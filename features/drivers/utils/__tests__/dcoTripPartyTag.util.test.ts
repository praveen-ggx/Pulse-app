import {
  applyDcoPartyTagToNotes,
  offlinePartiesFromTrips,
  offlinePartyId,
  parseDcoPartyTagFromNotes,
  stripDcoPartyTagFromNotes,
} from "../dcoTripPartyTag.util";

describe("dcoTripPartyTag notes marker", () => {
  it("round-trips a party tag and keeps other notes", () => {
    const next = applyDcoPartyTagToNotes("POD pending", {
      id: "c-1",
      name: "Ajio testing",
    });
    expect(parseDcoPartyTagFromNotes(next)).toEqual({
      id: "c-1",
      name: "Ajio testing",
    });
    expect(stripDcoPartyTagFromNotes(next)).toBe("POD pending");
  });

  it("stores a middleman receivable on the tag", () => {
    const next = applyDcoPartyTagToNotes(null, {
      id: "c-2",
      name: "Ajio testing",
      billed: 18500,
    });
    expect(parseDcoPartyTagFromNotes(next)).toEqual({
      id: "c-2",
      name: "Ajio testing",
      billed: 18500,
    });
  });

  it("builds a stable offline party id from phone", () => {
    expect(offlinePartyId("Ravi", "98765 43210")).toBe("offline:9876543210");
  });

  it("collects unique tagged parties from trips", () => {
    const parties = offlinePartiesFromTrips([
      { notes: applyDcoPartyTagToNotes(null, { id: "offline:1", name: "Ravi" }) },
      { client_id: "c-2", client_name: "Ajio" },
      { notes: applyDcoPartyTagToNotes(null, { id: "offline:1", name: "Ravi" }) },
    ]);
    expect(parties).toEqual([
      { id: "c-2", name: "Ajio" },
      { id: "offline:1", name: "Ravi" },
    ]);
  });

  it("replaces an existing tag", () => {
    const first = applyDcoPartyTagToNotes(null, { id: "a", name: "A" });
    const second = applyDcoPartyTagToNotes(first, { id: "b", name: "B" });
    expect(parseDcoPartyTagFromNotes(second)).toEqual({ id: "b", name: "B" });
    expect(second.match(/pulse-dco-party/g)).toHaveLength(1);
  });
});
