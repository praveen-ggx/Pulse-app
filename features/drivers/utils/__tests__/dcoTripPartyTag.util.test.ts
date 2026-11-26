import {
  applyDcoPartyTagToNotes,
  offlineEnteredBilled,
  offlineTripAmount,
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

  it("keeps existing yield when retagging without a new billed amount", () => {
    const first = applyDcoPartyTagToNotes(null, {
      id: "a",
      name: "A",
      billed: 2500,
    });
    const second = applyDcoPartyTagToNotes(first, { id: "b", name: "B" });
    expect(parseDcoPartyTagFromNotes(second)).toEqual({
      id: "b",
      name: "B",
      billed: 2500,
    });
  });
});

describe("offline amounts — tags saved before the entered flag", () => {
  const oldTag = (billed: number) =>
    `<!--pulse-dco-party:${JSON.stringify({ id: "c-1", name: "Ravi", billed })}-->`;
  const typedTag = (billed: number) =>
    applyDcoPartyTagToNotes(null, { id: "c-1", name: "Ravi", billed, entered: true });

  it("keeps an old amount the driver typed (not an app guess)", () => {
    expect(offlineEnteredBilled(oldTag(5000), [400, 4000])).toBe(5000);
    expect(offlineTripAmount(oldTag(5000), 0, [400, 4000])).toBe(5000);
  });

  it("drops an old amount that equals the app's guess or trip price", () => {
    expect(offlineEnteredBilled(oldTag(400), [400, 4000])).toBe(0);
    expect(offlineEnteredBilled(oldTag(4000), [400, 4000])).toBe(0);
  });

  it("captured money wins over an old untagged amount", () => {
    expect(offlineTripAmount(oldTag(2500), 2000, [400, 4000])).toBe(2000);
  });

  it("typed amount (entered) vs captured: the higher one", () => {
    expect(offlineTripAmount(typedTag(3000), 2000)).toBe(3000);
    expect(offlineTripAmount(typedTag(3000), 5000)).toBe(5000);
  });

  it("nothing typed, nothing captured → 0", () => {
    expect(offlineTripAmount(null, 0)).toBe(0);
  });
});
