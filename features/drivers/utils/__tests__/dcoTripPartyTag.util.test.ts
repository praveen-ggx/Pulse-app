import {
  applyDcoPartyTagToNotes,
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

  it("replaces an existing tag", () => {
    const first = applyDcoPartyTagToNotes(null, { id: "a", name: "A" });
    const second = applyDcoPartyTagToNotes(first, { id: "b", name: "B" });
    expect(parseDcoPartyTagFromNotes(second)).toEqual({ id: "b", name: "B" });
    expect(second.match(/pulse-dco-party/g)).toHaveLength(1);
  });
});
