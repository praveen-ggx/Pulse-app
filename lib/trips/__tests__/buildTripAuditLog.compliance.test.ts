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

describe("journey activity history", () => {
  const notes = [
    "[BISIM|in_progress|2026-11-12T04:20:00.000Z|11.6|75.8|Saravanan|assigned|Perambra, Kerala]",
    "[BISIM|in_transit|2026-11-12T04:20:00.000Z|11.6|75.8|Saravanan|in_progress|Perambra, Kerala]",
    "[BISIM_REVOKE|in_transit|in_progress|2026-11-20T06:14:00.000Z|11.6|75.8|Saravanan]",
    "[BISIM|in_transit|2026-11-12T04:20:00.000Z|11.6|75.8|Saravanan|in_progress|Perambra, Kerala]",
  ].join("\n");

  it("keeps every simulate and revoke with the person and the note time", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        notes,
        created_at: "2026-11-11T15:27:00.000Z",
        updated_at: "2026-11-20T06:16:00.000Z",
        status_change_origin: "business_simulation_revoked",
        assigned_by_user_id: "u-jeeva",
      } as TripRow,
      tripRef: "SAT812",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [
        {
          id: "status-assigned-fallback",
          kind: "status",
          changed_at: "2026-11-11T15:27:00.000Z",
          status_context: "assigned",
          status_label: "Assigned",
          detail_line: "SELVARAJU S · TN88L8183",
          actorUserId: "u-jeeva",
        } as DriverActivityTimelineRow,
        {
          id: "status-sim-in_progress-2026-11-12T04:20:00.000Z",
          kind: "status",
          changed_at: "2026-11-20T06:16:00.000Z",
          status_context: "pickup",
          status_label: "Pickup",
          actorUserId: "driver-uuid",
        } as DriverActivityTimelineRow,
        {
          id: "status-sim-revoke-in_transit-2026-11-20T06:14:00.000Z",
          kind: "status",
          changed_at: "2026-11-20T06:14:00.000Z",
          status_context: "sim_revoked",
          status_label: "Simulation revoked",
        } as DriverActivityTimelineRow,
      ],
      transactions: [],
      userDisplayById: { "u-jeeva": "Jeeva" },
    });

    const sims = entries.filter(
      (row) => row.id.startsWith("bisim-") && !row.id.startsWith("bisim-revoke-"),
    );
    const revokes = entries.filter((row) => row.id.startsWith("bisim-revoke-"));
    expect(sims).toHaveLength(3);
    expect(sims.every((row) => row.recordedBy === "Saravanan")).toBe(true);
    expect(sims.map((row) => row.title).sort()).toEqual([
      "simulated in transit",
      "simulated in transit",
      "simulated pickup",
    ]);
    expect(sims.every((row) => row.at === "2026-11-12T04:20:00.000Z")).toBe(true);
    expect(revokes).toHaveLength(1);
    expect(revokes[0]).toMatchObject({
      recordedBy: "Saravanan",
      title: "revoked a simulated stage",
      detail: "Reverted in transit → in progress",
      at: "2026-11-20T06:14:00.000Z",
    });
    expect(entries.find((row) => row.id === "status-assigned-fallback")).toBeUndefined();
    expect(entries.some((row) => row.title === "edited this trip")).toBe(false);
    expect(entries.some((row) => row.title === "arrived at pickup")).toBe(false);
  });

  it("names the account behind a generic simulation note and uses the save time", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        notes: "[BISIM|in_transit|2026-11-12T04:20:00.000Z|||Business|in_progress]",
        updated_at: "2026-11-20T06:10:00.000Z",
        assigned_by_user_id: "u-jeeva",
      } as TripRow,
      tripRef: "SAT812",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      userDisplayById: { "u-sara": "Saravanan", "u-jeeva": "Jeeva" },
      statusAuditRows: [
        {
          id: "a1",
          status_from: "in_progress",
          status_to: "in_transit",
          changed_by: "u-sara",
          changed_at: "2026-11-20T06:10:00.000Z",
        },
      ],
    });
    const sim = entries.find((row) => row.id.startsWith("bisim-"));
    expect(sim).toMatchObject({
      recordedBy: "Saravanan",
      title: "simulated in transit",
      at: "2026-11-20T06:10:00.000Z",
    });
    expect(sim?.detail).toContain("Stage time");
    expect(entries.some((row) => row.id.startsWith("status-audit-"))).toBe(false);
    expect(entries.some((row) => row.title === "edited this trip")).toBe(false);
    expect(entries.some((row) => row.recordedBy === "Jeeva")).toBe(false);
  });

  it("does not attribute a backdated simulation to the last assigner", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        notes: [
          "[BISIM|in_progress|2026-11-12T04:20:39.410Z|||Saravanan|assigned]",
          "[BISIM|in_transit|2026-11-12T04:20:43.966Z|||Saravanan|in_progress]",
          "[BISIM_REVOKE|in_transit|in_progress|2026-11-20T06:14:38.885Z|||Mohamed Asik Hussain]",
          "[BISIM|in_transit|2026-11-12T06:16:00.000Z|9.9312|76.2673|Mohamed Asik Hussain|in_progress|Perambra, Kerala]",
        ].join("\n"),
        created_at: "2026-11-11T15:27:54.836Z",
        created_by_user_id: "u-smk",
        updated_at: "2026-11-20T06:16:40.240Z",
        status_change_origin: null,
        assigned_by_user_id: "u-jeeva",
        status_updated_by: null,
      } as TripRow,
      tripRef: "SAT812GOGTRIP002336",
      assignmentAuditRows: [
        {
          id: "asg-0",
          trip_id: "t1",
          event_type: "assignment",
          changed_at: "2026-11-11T15:27:54.836Z",
          changed_by: "u-smk",
          driver_id_prev: null,
          driver_id_new: "d1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          driver_name_new: "SELVARAJU S",
          vehicle_number_new: "TN88L8183",
        },
        {
          id: "asg-1",
          trip_id: "t1",
          event_type: "reassignment",
          changed_at: "2026-11-11T15:49:16.220Z",
          changed_by: "u-jeeva",
          driver_id_prev: null,
          driver_id_new: "d1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          driver_name_new: "SELVARAJU S",
          vehicle_number_new: "TN88L8183",
        },
      ],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [
        {
          id: "status-created",
          kind: "status",
          changed_at: "2026-11-11T15:27:54.836Z",
          status_context: "created",
          status_label: "Trip Created",
          detail_line: "System generated trip SAT812GOGTRIP002336",
          actorUserId: "u-smk",
        } as DriverActivityTimelineRow,
        {
          id: "status-assigned-fallback",
          kind: "status",
          changed_at: "2026-11-11T15:27:54.836Z",
          status_context: "assigned",
          status_label: "Assigned",
          detail_line: "SELVARAJU S · TN88L8183",
          actorUserId: "u-jeeva",
        } as DriverActivityTimelineRow,
      ],
      transactions: [],
      userDisplayById: {
        "u-smk": "SMK LOGISTICS",
        "u-jeeva": "Jeeva",
        "u-sara": "Saravanan",
        "u-mohamed": "Mohamed Asik Hussain",
      },
      statusAuditRows: [
        {
          id: "a1",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-sara",
          changed_at: "2026-11-12T04:20:39.410Z",
        },
        {
          id: "a2",
          status_from: "in_progress",
          status_to: "in_transit",
          changed_by: "u-sara",
          changed_at: "2026-11-12T04:20:43.966Z",
        },
        {
          id: "a3",
          status_from: "in_transit",
          status_to: "in_progress",
          changed_by: "u-mohamed",
          changed_at: "2026-11-20T06:14:37.101Z",
        },
        {
          id: "a4",
          status_from: "in_progress",
          status_to: "in_transit",
          changed_by: "u-mohamed",
          changed_at: "2026-11-20T06:16:40.240Z",
        },
      ],
    });

    const sims = entries.filter((row) => row.id.startsWith("bisim-") && !row.id.startsWith("bisim-revoke-"));
    const revoke = entries.find((row) => row.id.startsWith("bisim-revoke-"));
    expect(sims.map((row) => `${row.recordedBy}|${row.title}|${row.at}`)).toEqual([
      "Mohamed Asik Hussain|simulated in transit|2026-11-20T06:16:40.240Z",
      "Saravanan|simulated in transit|2026-11-12T04:20:43.966Z",
      "Saravanan|simulated pickup|2026-11-12T04:20:39.410Z",
    ]);
    const mohamed = sims.find((row) => row.recordedBy === "Mohamed Asik Hussain");
    expect(mohamed?.detail).toContain("Perambra, Kerala");
    expect(mohamed?.detail).toContain("Stage time");
    expect(revoke).toMatchObject({
      recordedBy: "Mohamed Asik Hussain",
      title: "revoked a simulated stage",
      detail: "Reverted in transit → in progress",
      at: "2026-11-20T06:14:37.101Z",
    });
    expect(entries.find((row) => row.title === "created trip")).toMatchObject({
      recordedBy: "SMK LOGISTICS",
      at: "2026-11-11T15:27:54.836Z",
    });
    expect(entries.find((row) => row.id === "assign-asg-0")).toMatchObject({
      recordedBy: "SMK LOGISTICS",
      title: "assigned",
      at: "2026-11-11T15:27:54.836Z",
    });
    expect(entries.find((row) => row.title === "reassigned")).toMatchObject({
      recordedBy: "Jeeva",
      at: "2026-11-11T15:49:16.220Z",
    });
    expect(entries.some((row) => row.title === "assigned this trip")).toBe(false);
    expect(entries.some((row) => row.title === "edited this trip")).toBe(false);
  });

  it("keeps actual edit time and simulated Stage time separate for each Pickup", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        status: "in_progress",
        started_at: "2026-11-13T06:39:00.000Z",
        notes: [
          "[BISIM|in_progress|2026-11-12T06:34:00.000Z|9.93|76.26|Satham Hussain|assigned|Perambra, Kerala|2026-11-23T06:34:05.673Z]",
          "[BISIM_REVOKE|in_progress|assigned|2026-11-23T06:39:36.370Z|9.93|76.26|Satham Hussain]",
          "[BISIM|in_progress|2026-11-13T06:39:00.000Z|9.93|76.26|Satham Hussain|assigned|Perambra, Kerala|2026-11-23T06:39:57.214Z]",
        ].join("\n"),
        created_at: "2026-11-11T15:27:54.836Z",
        updated_at: "2026-11-23T06:39:57.214Z",
      } as TripRow,
      tripRef: "SAT812GOGTRIP002336",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      userDisplayById: { "u-satham": "Satham Hussain" },
      statusAuditRows: [
        {
          id: "a-old",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-satham",
          changed_at: "2026-11-23T06:34:05.413Z",
        },
        {
          id: "a-new",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-satham",
          changed_at: "2026-11-23T06:39:57.003Z",
        },
      ],
    });
    const pickups = entries.filter((row) => row.title === "simulated pickup");
    expect(pickups).toHaveLength(2);
    const latest = pickups.find((row) => row.at === "2026-11-23T06:39:57.003Z");
    expect(latest?.detail).toContain("Stage time");
    expect(latest?.detail).toMatch(/13 Nov 2026/i);
    expect(latest?.detail).not.toMatch(/12 Nov 2026/i);
    expect(pickups.find((row) => row.at === "2026-11-23T06:34:05.413Z")?.detail ?? "").not.toMatch(
      /13 Nov 2026/i,
    );
  });

  it("puts the latest Pickup edit first with its own Stage time, not a previous simulate", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        status: "in_progress",
        started_at: "2026-11-16T07:23:00.000Z",
        notes: [
          "[BISIM|in_progress|2026-11-14T10:33:00.000Z|9.93|76.26|Satham Hussain|assigned|Perambra, Kerala|2026-11-23T07:08:20.131Z]",
          "[BISIM_REVOKE|in_progress|assigned|2026-11-23T07:23:02.134Z|9.93|76.26|Satham Hussain]",
          "[BISIM|in_progress|2026-11-16T07:23:00.000Z|9.93|76.26|Satham Hussain|assigned|Perambra, Kerala|2026-11-23T07:23:09.240Z]",
        ].join("\n"),
        created_at: "2026-11-11T15:27:54.836Z",
        updated_at: "2026-11-23T07:23:08.996Z",
      } as TripRow,
      tripRef: "SAT812GOGTRIP002336",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      userDisplayById: { "u-satham": "Satham Hussain" },
      statusAuditRows: [
        {
          id: "a-prev",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-satham",
          changed_at: "2026-11-23T07:08:19.938Z",
        },
        {
          id: "a-latest",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-satham",
          changed_at: "2026-11-23T07:23:08.996Z",
        },
      ],
    });
    const pickups = entries.filter((row) => row.title === "simulated pickup");
    expect(pickups[0]?.at).toBe("2026-11-23T07:23:08.996Z");
    expect(pickups[0]?.recordedBy).toBe("Satham Hussain");
    expect(pickups[0]?.detail).toMatch(/16 Nov 2026/i);
    expect(pickups[0]?.detail).not.toMatch(/14 Nov 2026/i);
    expect(pickups[1]?.at).toBe("2026-11-23T07:08:19.938Z");
    expect(pickups[1]?.detail).toMatch(/14 Nov 2026/i);
  });

  it("stamps a real stage from status audit instead of the trip's latest update", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        notes: null,
        updated_at: "2026-11-20T06:16:00.000Z",
        created_at: "2026-11-11T15:27:00.000Z",
      } as TripRow,
      tripRef: "SAT812",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [
        {
          id: "status-in-transit",
          kind: "status",
          changed_at: "2026-11-20T06:16:00.000Z",
          status_context: "in_transit",
          status_label: "In-transit",
          detail_line: "Perambra, Kerala",
        } as DriverActivityTimelineRow,
      ],
      transactions: [],
      userDisplayById: { "u-driver-user": "SELVARAJU S" },
      statusAuditRows: [
        {
          id: "a2",
          status_from: "in_progress",
          status_to: "in_transit",
          changed_by: "u-driver-user",
          changed_at: "2026-11-12T04:20:00.000Z",
        },
      ],
    });
    expect(entries.find((row) => row.id === "status-in-transit")).toMatchObject({
      at: "2026-11-12T04:20:00.000Z",
      recordedBy: "SELVARAJU S",
      detail: "Perambra, Kerala",
    });
  });
});

describe("Ground Ops simulate Activity Log", () => {
  it("names the Ground Ops actor, uses edit time, and keeps picker Stage time", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...trip,
        status: "in_progress",
        started_at: "2026-11-14T10:33:00.000Z",
        notes:
          "[BISIM|in_progress|2026-11-14T10:33:00.000Z|||Satham Hussain|assigned||2026-11-23T10:46:00.000Z]",
        updated_at: "2026-11-23T10:46:00.500Z",
      } as TripRow,
      tripRef: "SAT812GOGTRIP002326",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      currentUserId: "u-satham",
      userDisplayById: { "u-satham": "Satham Hussain" },
      statusAuditRows: [
        {
          id: "go-1",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-satham",
          changed_at: "2026-11-23T10:46:00.200Z",
        },
      ],
    });
    const pickup = entries.find((row) => row.title === "simulated pickup");
    expect(pickup).toBeTruthy();
    expect(pickup?.recordedBy).toMatch(/Satham Hussain/i);
    expect(pickup?.at).toBe("2026-11-23T10:46:00.200Z");
    expect(pickup?.detail).toMatch(/Stage time/i);
    expect(pickup?.detail).toMatch(/14 Nov 2026/i);
    expect(entries.some((row) => row.title === "edited this trip")).toBe(false);
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
