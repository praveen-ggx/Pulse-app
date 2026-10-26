const mockInsert = jest.fn();
let mockDraftSelectData: Array<{ trip_id: string; payload: unknown; created_at: string }> = [];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        in: () => ({
          eq: () => Promise.resolve({ data: mockDraftSelectData, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    }),
    rpc: jest.fn(async () => ({ error: null })),
  }),
}));

jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => {
  const actual = jest.requireActual("@/features/trips/services/tripDocumentLrPod.service");
  return {
    ...actual,
    markTripHardCopyPodReceived: jest.fn(async () => ({ error: null, alreadyReceived: false })),
  };
});

import {
  savePodValidationDraft,
  validateDebitControlPods,
} from "@/features/debit-control/services/debitControlPod.service";
import {
  EMPTY_CHARGE_LINES,
  POD_CHARGES_CHANGED_EVENT,
} from "@/features/debit-control/utils/debitControlPod.model";

describe("validateDebitControlPods", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockDraftSelectData = [];
  });

  it("stores the same validation event once per trip, deducting vendor exceptions from the vendor total", async () => {
    const result = await validateDebitControlPods({
      orgId: "org-1",
      actorId: "user-1",
      trips: [
        {
          tripId: "trip-a",
          remarks: "Checked docket",
          clientInvoiceNumber: "INV-9",
          client: { ...EMPTY_CHARGE_LINES, cost: 1000, loading: 50, delay: 80 },
          vendor: { ...EMPTY_CHARGE_LINES, cost: 700, damage: 20 },
        },
        {
          tripId: "trip-b",
          remarks: "",
          clientInvoiceNumber: null,
          client: { ...EMPTY_CHARGE_LINES, cost: 400 },
          vendor: { ...EMPTY_CHARGE_LINES, cost: 300 },
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.updatedIds).toEqual(["trip-a", "trip-b"]);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    const first = mockInsert.mock.calls[0][0] as {
      event_type: string;
      idempotency_key: string;
      payload: { total_client_value: number; total_vendor_value: number; remarks: string | null };
    };
    expect(first.event_type).toBe("pod.debit_control_validated");
    expect(first.idempotency_key).toBe("trip-a:pod.debit_control_validated");
    expect(first.payload.total_client_value).toBe(970);
    expect(first.payload.total_vendor_value).toBe(680);
    expect(first.payload.remarks).toBe("Checked docket");
  });

  it("saves charge drafts without marking the trip validated", async () => {
    const result = await savePodValidationDraft({
      orgId: "org-1",
      actorId: "user-1",
      trips: [
        {
          tripId: "trip-a",
          remarks: "",
          clientInvoiceNumber: null,
          client: { ...EMPTY_CHARGE_LINES, loading: 40 },
          vendor: { ...EMPTY_CHARGE_LINES, loading: 40 },
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.updatedIds).toEqual(["trip-a"]);
    const row = mockInsert.mock.calls.at(-1)?.[0] as { event_type: string; idempotency_key: string };
    expect(row.event_type).toBe("pod.debit_control_draft");
    expect(row.idempotency_key).toBe("trip-a:pod.debit_control_draft");
  });

  it("appends a charge-change event when later saves clear or update charges", async () => {
    mockDraftSelectData = [
      {
        trip_id: "trip-a",
        created_at: "2026-10-25T10:00:00.000Z",
        payload: {
          client: { ...EMPTY_CHARGE_LINES, delay: 200 },
          vendor: { ...EMPTY_CHARGE_LINES },
          no_debit: false,
        },
      },
    ];
    const result = await savePodValidationDraft({
      orgId: "org-1",
      actorId: "user-2",
      trips: [
        {
          tripId: "trip-a",
          remarks: "No debit",
          clientInvoiceNumber: null,
          noDebit: true,
          client: EMPTY_CHARGE_LINES,
          vendor: EMPTY_CHARGE_LINES,
        },
      ],
    });
    expect(result.error).toBeNull();
    const changed = mockInsert.mock.calls
      .map((call) => call[0] as { event_type: string; payload?: { action?: string } })
      .find((row) => row.event_type === POD_CHARGES_CHANGED_EVENT);
    expect(changed?.payload?.action).toBe("removed");
  });
});
