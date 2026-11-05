import { classifyPayment, paymentTagLabel } from "@/lib/globalSync/registryPaymentLane.util";
import {
  entryAllowedByAccess,
  indentPrimaryAction,
  REGISTRY_ACCESS_NONE,
} from "@/lib/alertRegistry/registryNotificationAccess.util";
import { entryMatchesRegistryFilter, type RegistryFeedEntry } from "@/lib/globalSync/registryFeed.util";

describe("payment lane", () => {
  it("treats an inbound client capture as received", () => {
    const classified = classifyPayment({
      content: "Godrej India received ₹22500 · Trip Payment",
      metadata: { flow: "in", category: "Trip Payment" },
    });
    expect(classified.lane).toBe("received");
    expect(paymentTagLabel(classified)).toBe("Payment received");
  });

  it("does not label a payable as received", () => {
    const classified = classifyPayment({
      content: "Godrej India paid ₹36000 to nihas logs · Trip Payment",
      metadata: { flow: "out", category: "Trip Payment" },
    });
    expect(classified.lane).toBe("paid");
    expect(paymentTagLabel(classified)).toBe("Payment paid");
  });

  it("marks an advance separately from other payments", () => {
    const classified = classifyPayment({
      content: "Godrej India paid ₹5000 to nihas logs · Advance",
      metadata: { flow: "out", category: "Advance" },
    });
    expect(classified.kind).toBe("advance");
    expect(paymentTagLabel(classified)).toBe("Advance paid");
  });

  it("puts paid and received on different tabs", () => {
    const paid: RegistryFeedEntry = {
      id: "ops:paid",
      kind: "ops",
      sortKey: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      ops: {
        id: "ev:t:1",
        priority_weight: 1,
        kind: "success",
        category: "payment_paid",
        trip_id: "t",
        trip_number: "TRP021",
        title: "Payment activity",
        subtitle: null,
        amount: 36000,
        created_at: "2026-11-01T00:00:00.000Z",
        source: "trip_recent_event",
      },
    };
    const received: RegistryFeedEntry = {
      ...paid,
      id: "ops:in",
      ops: { ...paid.ops!, id: "ev:t:2", category: "payment_received" },
    };
    expect(entryMatchesRegistryFilter(paid, "payment")).toBe(true);
    expect(entryMatchesRegistryFilter(paid, "received")).toBe(false);
    expect(entryMatchesRegistryFilter(received, "received")).toBe(true);
    expect(entryMatchesRegistryFilter(received, "payment")).toBe(false);
    expect(entryMatchesRegistryFilter(paid, "trip")).toBe(false);
  });
});

describe("notification access", () => {
  it("hides indent bids without indent view", () => {
    const entry: RegistryFeedEntry = {
      id: "network:1",
      kind: "network",
      sortKey: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    expect(entryAllowedByAccess(entry, REGISTRY_ACCESS_NONE)).toBe(false);
    expect(entryAllowedByAccess(entry, { ...REGISTRY_ACCESS_NONE, indents: true })).toBe(true);
  });

  it("keeps Place bid behind the bid surface", () => {
    expect(indentPrimaryAction("bid_received", { ...REGISTRY_ACCESS_NONE, indents: true }).label).toBe(
      "View indent",
    );
    expect(
      indentPrimaryAction("bid_received", {
        ...REGISTRY_ACCESS_NONE,
        indents: true,
        indentAward: true,
      }).label,
    ).toBe("Review bid");
  });
});
