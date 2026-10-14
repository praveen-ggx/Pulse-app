const mockInsert = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row);
        return Promise.resolve({ error: null });
      },
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

import { validateDebitControlPods } from "@/features/debit-control/services/debitControlPod.service";
import { EMPTY_CHARGE_LINES } from "@/features/debit-control/utils/debitControlPod.model";

describe("validateDebitControlPods", () => {
  beforeEach(() => {
    mockInsert.mockClear();
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
});
