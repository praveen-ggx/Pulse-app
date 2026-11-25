import {
  collectAllOperationSignals,
  selectOperationsShelfItems,
} from "@/lib/globalSync/priorityEngine.util";

const H = 3600_000;
const NOW = Date.parse("2026-11-24T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function trip(over: Record<string, unknown>) {
  return {
    trip_id: "T57",
    trip_number: "TRP057",
    display_trip_id: "TRP057",
    status: "assigned",
    pickup_area: "Mumbai",
    drop_location: "Hyderabad",
    driver_display_name: null,
    vehicle_display_number: "TN34JR6616",
    driver_id: null,
    supplier_id: null,
    client_id: null,
    created_at: iso(NOW - 10 * 60_000),
    total_unread: 0,
    recent_events: [],
    ...over,
  } as never;
}

const snap = (t: unknown) =>
  ({
    activeTrips: [t],
    alertRows: [],
    notificationRows: [],
    clientOperationsRibbon: null,
    dismissedOperationKeys: {},
  }) as never;

describe("syntheticUnassigned decline / assigned-without-driver", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("fires immediately for assigned status with no driver (no 30m wait)", () => {
    const a = selectOperationsShelfItems(snap(trip({}))).find(
      (x) => x.category === "unassigned_trip",
    );
    expect(a).toBeDefined();
    expect(a!.title).toBe("Driver declined");
    expect(a!.subtitle).toContain("Update driver details");
    expect(a!.priority_weight).toBe(118);
  });

  it("uses decline copy when recent_events mention a decline", () => {
    const a = selectOperationsShelfItems(
      snap(
        trip({
          status: "in_transit",
          created_at: iso(NOW - 2 * H),
          recent_events: [
            {
              id: "e1",
              content: "Vasanth declined or was removed from this trip.",
              message_type: "assignment_update",
              sender_role: "system",
              sender_name: "Trip System",
              created_at: iso(NOW - 60_000),
              metadata: null,
            },
          ],
        }),
      ),
    ).find((x) => x.category === "unassigned_trip");
    expect(a).toBeDefined();
    expect(a!.title).toBe("Driver declined");
    expect(a!.subtitle).toBe("TRP057 · Update driver details");
  });

  it("still waits 30m for generic young unassigned trips", () => {
    const all = collectAllOperationSignals(
      snap(
        trip({
          status: "quoted",
          created_at: iso(NOW - 5 * 60_000),
          recent_events: [],
        }),
      ),
    );
    expect(all.find((x) => x.category === "unassigned_trip")).toBeUndefined();
  });
});
