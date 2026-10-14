import {
  courierLrReceiptPlan,
  decodeCourierLrRemarks,
  encodeCourierLrRemarks,
  lrReceiptForTrip,
} from "@/features/trips/utils/lrReceiptStatus.util";
import type { HardCopyPodLrOption } from "@/features/trips/utils/hardCopyPodLrSelection.util";

function option(lrNumber: string, tripId: string, alreadyReceived = false): HardCopyPodLrOption {
  return { lrNumber, tripId, tripDisplayId: tripId, alreadyReceived };
}

describe("lr receipt status", () => {
  it("keeps a trip partial when 2 of 3 LRs are received", () => {
    expect(lrReceiptForTrip(["AI1", "AI2", "AI3"], ["AI1", "ai2"])).toEqual({
      received: ["AI1", "AI2"],
      pending: ["AI3"],
      kind: "partial",
    });
  });

  it("is complete only when every LR is received", () => {
    expect(lrReceiptForTrip(["AI1", "AI2", "AI3"], ["AI1", "AI2", "AI3"]).kind).toBe("complete");
    expect(lrReceiptForTrip(["AI1", "AI2", "AI3"], []).kind).toBe("none");
    expect(lrReceiptForTrip([], ["AI1"]).kind).toBe("none");
  });

  it("does not mark the trip received when a selected save still leaves an LR pending", () => {
    const plan = courierLrReceiptPlan({
      tripId: "trip-1",
      openedTripId: "trip-1",
      options: [option("AI1", "trip-1", true), option("AI2", "trip-1"), option("AI3", "trip-1")],
      selectedKeys: new Set(["trip-1::AI2"]),
      storedReceivedLrs: [],
    });
    expect(plan.complete).toBe(false);
    expect(plan.receivedLrs).toEqual(["AI1", "AI2"]);
  });

  it("marks the trip received once the last pending LR is included", () => {
    const plan = courierLrReceiptPlan({
      tripId: "trip-1",
      openedTripId: "trip-1",
      options: [option("AI1", "trip-1", true), option("AI2", "trip-1", true), option("AI3", "trip-1")],
      selectedKeys: new Set(["trip-1::AI3"]),
      storedReceivedLrs: ["AI1"],
    });
    expect(plan.complete).toBe(true);
    expect(plan.receivedLrs).toEqual(["AI1", "AI2", "AI3"]);
  });

  it("stores received LR numbers beside the operator remarks", () => {
    const encoded = encodeCourierLrRemarks({ text: "left at gate", receivedLrs: ["AI1", "AI2"] });
    expect(decodeCourierLrRemarks(encoded)).toEqual({
      text: "left at gate",
      receivedLrs: ["AI1", "AI2"],
    });
    expect(decodeCourierLrRemarks("plain note")).toEqual({
      text: "plain note",
      receivedLrs: [],
    });
  });
});
