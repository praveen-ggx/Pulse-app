import {
  buildTripAuditLog,
  dedupeTripAuditEntries,
  matchesTripAuditTab,
  resolveTripActivityParty,
  resolveTripActivityUserLabel,
} from "@/lib/trips/buildTripAuditLog.util";
import type { TripAuditLogEntry } from "@/lib/trips/tripAuditLog.types";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";

const trip = {
  id: "t1",
  organization_id: "o1",
  created_at: "2026-10-20T10:00:00.000Z",
  created_by_user_id: "u1",
} as TripRow;

const timeline: DriverActivityTimelineRow[] = [
  {
    id: "status-created",
    kind: "status",
    changed_at: "2026-10-20T10:00:00.000Z",
    status_context: "created",
    status_label: "created trip",
  } as DriverActivityTimelineRow,
  {
    id: "status-transit",
    kind: "status",
    changed_at: "2026-10-21T08:00:00.000Z",
    status_context: "in_transit",
    status_label: "marked in transit",
  } as DriverActivityTimelineRow,
];

describe("buildTripAuditLog compliance scope", () => {
  it("keeps card milestones and drops trip created / in-transit", () => {
    const entries = buildTripAuditLog({
      trip,
      tripRef: "SAT1",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: timeline,
      transactions: [],
      scope: "compliance",
      milestones: [
        {
          id: "doc-1",
          at: "2026-10-22T09:00:00.000Z",
          title: "uploaded LR",
          detail: "lr.pdf",
          contextLabel: "Document Upload",
          lane: "document",
          actorUserId: "u2",
        },
      ],
    });
    expect(entries.map((row) => row.title)).toEqual(["uploaded LR"]);
    expect(entries[0].category).toBe("document");
    expect(matchesTripAuditTab(entries[0], "documents")).toBe(true);
    expect(matchesTripAuditTab(entries[0], "activity")).toBe(true);
    expect(
      matchesTripAuditTab(
        { ...entries[0], category: "assignment" },
        "activity",
      ),
    ).toBe(true);
    expect(
      matchesTripAuditTab({ ...entries[0], category: "payment" }, "activity"),
    ).toBe(true);
    expect(
      matchesTripAuditTab({ ...entries[0], category: "status" }, "activity"),
    ).toBe(true);
  });

  it("attaches the actor user profile image to compliance milestones", () => {
    const entries = buildTripAuditLog({
      trip,
      tripRef: "SAT1",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      currentUserId: "u2",
      userProfileById: {
        u2: {
          full_name: "Youval",
          avatar_url: "users/u2/me.jpg",
          avatar_seed: "user-3",
        },
      },
      scope: "compliance",
      milestones: [
        {
          id: "pod-1",
          at: "2026-10-22T09:00:00.000Z",
          title: "validated POD",
          detail: "POD verification completed",
          contextLabel: "POD Verification",
          lane: "activity",
          actorUserId: "u2",
        },
      ],
    });
    expect(entries[0].recordedBy).toBe("Youval (you)");
    expect(entries[0].actorAvatar.avatarUrl).toBe("users/u2/me.jpg");
    expect(entries[0].actorAvatar.avatarSeed).toBe("user-3");
  });

  it("shows the workspace member name on vault document uploads", () => {
    const entries = buildTripAuditLog({
      trip,
      tripRef: "SAT1",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      currentUserId: "u1",
      userDisplayById: {
        u9: "Priya Nair",
      },
      scope: "compliance",
      milestones: [
        {
          id: "vault-upload-d1",
          at: "2026-10-22T09:00:00.000Z",
          title: "uploaded LR",
          detail: "lr-copy.pdf",
          contextLabel: "Document Upload",
          lane: "document",
          category: "document",
          actorUserId: "u9",
        },
      ],
    });
    expect(entries[0].recordedBy).toBe("Priya Nair");
    expect(entries[0].title).toBe("uploaded LR");
    expect(entries[0].detailLines).toEqual(["lr-copy.pdf"]);
    expect(matchesTripAuditTab(entries[0], "documents")).toBe(true);
  });
});

describe("resolveTripActivityParty", () => {
  it("keeps the party name and adds trip org when they differ", () => {
    expect(
      resolveTripActivityParty({
        partyName: "Anjaneya Desk",
        contactType: "supplier",
        tripSupplierName: "DAARRI ANJANEYA ROAD LINES",
        tripClientName: "Acme Steel",
      }),
    ).toEqual({
      name: "Anjaneya Desk",
      role: "Supplier",
      orgLabel: "DAARRI ANJANEYA ROAD LINES",
    });
  });

  it("does not repeat the org when the party already is the company", () => {
    expect(
      resolveTripActivityParty({
        partyName: "DAARRI ANJANEYA ROAD LINES",
        contactType: "supplier",
        tripSupplierName: "Daarri Anjaneya Road Lines",
      }),
    ).toEqual({
      name: "DAARRI ANJANEYA ROAD LINES",
      role: "Supplier",
      orgLabel: null,
    });
  });
});

describe("payment activity actors", () => {
  it("names the ledger user and the supplier party, not the trip owner", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        owner_user_id: "owner-1",
        created_by_user_id: "owner-1",
        client_name: "Acme Steel",
        supplier_name: "DAARRI ANJANEYA ROAD LINES",
      } as TripRow,
      tripRef: "TRP001667",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [
        {
          id: "tx1",
          organization_id: "o1",
          trip_id: "t1",
          party_name: "DAARRI ANJANEYA ROAD LINES",
          description: "Supplier hire",
          amount_in: 0,
          amount_out: 36400,
          transaction_date: "2026-10-28",
          created_at: "2026-10-28T04:46:00.000Z",
          created_by: "u-praveen",
          contact_type: "supplier",
        } as never,
      ],
      currentUserId: "u1",
      userDisplayById: {
        "owner-1": "Trip Owner",
        "u-praveen": "Praveen R",
      },
    });
    const payment = entries.find((row) => row.id === "payment-tx1");
    expect(payment?.recordedBy).toBe("Praveen R");
    expect(payment?.headlineTarget).toBe("DAARRI ANJANEYA ROAD LINES");
    expect(payment?.people?.[0]).toMatchObject({
      name: "DAARRI ANJANEYA ROAD LINES",
      role: "Supplier",
    });
    expect(payment?.detailLines).toEqual(
      expect.arrayContaining(["Supplier: DAARRI ANJANEYA ROAD LINES"]),
    );
  });
});

describe("resolveTripActivityUserLabel", () => {
  it("prefers the workspace profile name over Staff", () => {
    expect(
      resolveTripActivityUserLabel("u9", "u1", { u9: "Priya Nair" }, "Staff"),
    ).toBe("Priya Nair");
    expect(
      resolveTripActivityUserLabel(
        "u9",
        "u1",
        {},
        "Staff",
        { u9: { full_name: "Priya Nair" } },
      ),
    ).toBe("Priya Nair");
    expect(resolveTripActivityUserLabel("u9", "u9", { u9: "Priya Nair" })).toBe(
      "Priya Nair (you)",
    );
  });
});

describe("dedupeTripAuditEntries", () => {
  const avatar = {
    name: "Staff",
    entityType: "client" as const,
    avatarUrl: null,
    avatarSeed: null,
    initialsColorSeed: "s",
  };

  function row(
    partial: Partial<TripAuditLogEntry> & Pick<TripAuditLogEntry, "id" | "title" | "at">,
  ): TripAuditLogEntry {
    return {
      category: "status",
      categoryLabel: "Journey",
      recordedAtLabel: partial.at,
      recordedBy: "Staff",
      actorAvatar: avatar,
      detail: partial.title,
      ...partial,
    };
  }

  it("keeps one delivered row when workflow and status both fired", () => {
    const rows = dedupeTripAuditEntries([
      row({
        id: "a",
        title: "completed trip",
        at: "2026-10-27T17:01:00.000Z",
        recordedBy: "Rithwik",
        detail: "trip.completed",
      }),
      row({
        id: "b",
        title: "marked delivered",
        at: "2026-10-27T17:01:20.000Z",
        recordedBy: "Staff",
        detail: "Maheshwaram",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recordedBy).toBe("Rithwik");
  });
});
