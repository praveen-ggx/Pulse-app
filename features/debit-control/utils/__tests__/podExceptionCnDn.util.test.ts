import { EMPTY_CHARGE_LINES } from "@/features/debit-control/utils/debitControlPod.model";
import {
  createdPodCnDnDrafts,
  pendingPodCnDnAlertMessage,
  pendingPodCnDnDrafts,
  podCnDnAdjustmentFor,
  podCnDnMissionKey,
  podCnDnProvisionPreset,
  podExceptionCnDnDrafts,
} from "@/features/debit-control/utils/podExceptionCnDn.util";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";

describe("podExceptionCnDn", () => {
  it("creates client DN for extras and CN for deductions, and the same on vendor", () => {
    const drafts = podExceptionCnDnDrafts({
      client: { ...EMPTY_CHARGE_LINES, loading: 11500, delay: 400 },
      vendor: { ...EMPTY_CHARGE_LINES, loading: 11500, damage: 200 },
    });

    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          party: "client",
          noteKind: "DN",
          type: "revenue",
          impact: "plus",
          chargeKey: "loading",
          amount: 11500,
        }),
        expect.objectContaining({
          party: "client",
          noteKind: "CN",
          type: "revenue",
          impact: "minus",
          chargeKey: "delay",
          amount: 400,
        }),
        expect.objectContaining({
          party: "vendor",
          noteKind: "DN",
          type: "cost",
          impact: "plus",
          chargeKey: "loading",
          amount: 11500,
        }),
        expect.objectContaining({
          party: "vendor",
          noteKind: "CN",
          type: "cost",
          impact: "minus",
          chargeKey: "damage",
          amount: 200,
        }),
      ]),
    );
    expect(drafts).toHaveLength(4);
    expect(drafts.find((d) => d.party === "client" && d.chargeKey === "delay")?.reason).toBe(
      "Late Delivery",
    );
    expect(drafts.find((d) => d.party === "vendor" && d.chargeKey === "loading")?.reason).toBe(
      "Loading Charges",
    );
  });

  it("seeds the provision wizard from the POD charge so CN/DN is not picked again", () => {
    const drafts = podExceptionCnDnDrafts({
      client: { ...EMPTY_CHARGE_LINES, delay: 400 },
      vendor: null,
    });
    expect(podCnDnProvisionPreset(drafts[0])).toEqual({
      type: "revenue",
      impact: "minus",
      reasonSeed: "Late Delivery",
      amountSeed: 400,
    });
  });

  it("maps vendor late delivery onto the cost Detention protocol", () => {
    const drafts = podExceptionCnDnDrafts({
      client: null,
      vendor: { ...EMPTY_CHARGE_LINES, delay: 400 },
    });
    expect(drafts).toEqual([
      expect.objectContaining({
        party: "vendor",
        type: "cost",
        impact: "minus",
        noteKind: "CN",
        reason: "Detention",
      }),
    ]);
  });

  it("ignores freight cost and zero exception amounts", () => {
    expect(
      podExceptionCnDnDrafts({
        client: { ...EMPTY_CHARGE_LINES, cost: 25000 },
        vendor: { ...EMPTY_CHARGE_LINES, cost: 20000, loading: 0 },
      }),
    ).toEqual([]);
  });

  it("skips drafts that already have a matching mission key", () => {
    const drafts = podExceptionCnDnDrafts({
      client: { ...EMPTY_CHARGE_LINES, loading: 100 },
      vendor: null,
    });
    const existing: TripAdjustment[] = [
      {
        id: "1",
        trip_id: "t1",
        type: "revenue",
        impact: "plus",
        amount: 100,
        reason: "Loading Charges",
        mission_key: podCnDnMissionKey("client", "loading"),
      },
    ];
    expect(pendingPodCnDnDrafts(drafts, existing)).toEqual([]);
    expect(createdPodCnDnDrafts(drafts, existing)).toHaveLength(1);
    expect(podCnDnAdjustmentFor(existing, podCnDnMissionKey("client", "loading"))?.id).toBe("1");
    expect(
      podCnDnAdjustmentFor(
        [{ ...existing[0], voided_at: "2026-10-25T00:00:00Z" }],
        podCnDnMissionKey("client", "loading"),
      ),
    ).toBeNull();
  });

  it("maps own-fleet cost extras to the driver, not a vendor AP", () => {
    const drafts = podExceptionCnDnDrafts({
      client: { ...EMPTY_CHARGE_LINES, loading: 11500 },
      vendor: { ...EMPTY_CHARGE_LINES, loading: 11500, damage: 200 },
      costParty: "driver",
    });
    expect(drafts.filter((d) => d.party === "vendor")).toEqual([]);
    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          party: "driver",
          partyLabel: "Driver",
          noteKind: "DN",
          type: "cost",
          reason: "Loading / unloading help",
          chargeKey: "loading",
        }),
        expect.objectContaining({
          party: "driver",
          noteKind: "CN",
          type: "cost",
          reason: "Damage to cargo",
          chargeKey: "damage",
        }),
      ]),
    );
  });

  it("treats a legacy vendor mission key as already posted for a driver draft", () => {
    const drafts = podExceptionCnDnDrafts({
      client: null,
      vendor: { ...EMPTY_CHARGE_LINES, loading: 100 },
      costParty: "driver",
    });
    const existing: TripAdjustment[] = [
      {
        id: "v1",
        trip_id: "t1",
        type: "cost",
        impact: "plus",
        amount: 100,
        reason: "Loading Charges",
        mission_key: podCnDnMissionKey("vendor", "loading"),
      },
    ];
    expect(pendingPodCnDnDrafts(drafts, existing)).toEqual([]);
    expect(createdPodCnDnDrafts(drafts, existing)).toHaveLength(1);
    expect(podCnDnAdjustmentFor(existing, podCnDnMissionKey("driver", "loading"))?.id).toBe("v1");
  });

  it("alerts pending CN / DN before proceeding to settlement", () => {
    expect(pendingPodCnDnAlertMessage([])).toMatch(/All CN \/ DN/);
    expect(
      pendingPodCnDnAlertMessage([
        {
          missionKey: "PODCNDN-CLIENT-DELAY",
          party: "client",
          partyLabel: "Client",
          chargeKey: "delay",
          label: "Late delivery",
          amount: 599,
          type: "revenue",
          impact: "minus",
          noteKind: "CN",
          reason: "Late Delivery",
        },
      ]),
    ).toMatch(/CN · Client · Late delivery/);
  });
});
