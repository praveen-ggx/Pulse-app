import {
  applyDocumentActorsToMilestones,
  displayMapFromProfiles,
  mergeLedgerCreatedBy,
  resolveActivityUserProfiles,
} from "@/lib/trips/hydrateTripActivityActors.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAuditMilestone } from "@/lib/trips/buildTripAuditLog.util";

describe("hydrateTripActivityActors", () => {
  it("fills missing payment created_by from the trip ledger map", () => {
    const rows = mergeLedgerCreatedBy(
      [
        { id: "tx1", created_by: null, party_name: "DAARI" } as LedgerRow,
        { id: "tx2", created_by: "already", party_name: "Acme" } as LedgerRow,
      ],
      { tx1: "user-dhira", tx2: "ignored" },
    );
    expect(rows[0]?.created_by).toBe("user-dhira");
    expect(rows[1]?.created_by).toBe("already");
  });

  it("attaches vault upload and verify actors onto unnamed milestones", () => {
    const miles: TripAuditMilestone[] = [
      {
        id: "vault-upload-doc-1",
        at: "2026-10-28T04:46:00.000Z",
        title: "uploaded LR",
        detail: "lr.pdf",
        lane: "document",
      },
      {
        id: "vault-verified-doc-1",
        at: "2026-10-28T05:00:00.000Z",
        title: "verified LR",
        detail: "lr.pdf",
        lane: "document",
      },
      {
        id: "doc-upload-doc-2",
        at: "2026-10-28T05:10:00.000Z",
        title: "uploaded POD",
        actorUserId: "keep-me",
        detail: "pod.jpg",
        lane: "document",
      },
    ];
    const filled = applyDocumentActorsToMilestones(
      miles,
      { "doc-1": "user-upload", "doc-2": "user-other" },
      { "doc-1": "user-verify" },
    );
    expect(filled[0]?.actorUserId).toBe("user-upload");
    expect(filled[1]?.actorUserId).toBe("user-verify");
    expect(filled[2]?.actorUserId).toBe("keep-me");
  });

  it("builds workspace display names from profiles", () => {
    expect(
      displayMapFromProfiles({
        u1: { full_name: "Dhira Ashok", phone: "999", email: "d@x.com" },
        u2: { full_name: null, phone: "888", email: null },
      }),
    ).toEqual({
      u1: "Dhira Ashok",
      u2: "888",
    });
  });

  it("keeps seeded activity profiles when no user ids are requested", async () => {
    const profiles = await resolveActivityUserProfiles({
      userIds: [],
      seedProfiles: {
        u1: { full_name: "Sivakozhunthu", avatar_seed: "user-3" },
      },
    });
    expect(profiles.u1?.full_name).toBe("Sivakozhunthu");
    expect(profiles.u1?.avatar_seed).toBe("user-3");
  });
});
