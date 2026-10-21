import { serializeEwayFieldEntries } from "../ewayBillFields.util";
import { serializeElrDocumentNumber, type ElrSnapshot } from "../elrSnapshot.util";
import {
  __resetTripDocumentLrPodRpcProbeForTests,
  loadHubLrLabelsByTripIds,
  loadHubTripDocumentLabelsByTripIds,
  loadHubPodReceiptFlags,
  loadLrPodIndexByTripIds,
} from "../tripDocumentLrPod.service";

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

type QueryResult = { data: unknown; error: unknown };

function thenable(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = jest.fn(self);
  builder.in = jest.fn(self);
  builder.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("loadHubPodReceiptFlags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetTripDocumentLrPodRpcProbeForTests();
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function missing" },
    });
  });

  it("queries trip_documents only and does not re-select trips.pod_received_at", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trip_documents") {
        return thenable({
          data: [{ trip_id: "t1", document_type: "pod" }],
          error: null,
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const flags = await loadHubPodReceiptFlags(["t1", "t2"]);

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("trip_documents");
    expect(flags.softTripIds).toEqual(["t1"]);
    expect(flags.hardTripIds).toEqual([]);
  });

  it("prefers get_trip_documents_lr_pod_batch RPC for UUID trip ids", async () => {
    const tripA = "11111111-1111-4111-8111-111111111111";
    const tripB = "22222222-2222-4222-8222-222222222222";
    mockRpc.mockResolvedValue({
      data: [
        { trip_id: tripA, document_type: "pod", document_number: null },
        { trip_id: tripB, document_type: "lr", document_number: "LR1" },
      ],
      error: null,
    });

    const flags = await loadHubPodReceiptFlags([tripA, tripB]);

    expect(mockRpc).toHaveBeenCalledWith("get_trip_documents_lr_pod_batch", {
      p_trip_ids: expect.arrayContaining([tripA, tripB]),
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(flags.softTripIds).toEqual([tripA]);
    expect(flags.hardTripIds).toEqual([]);
  });

  it("reads e-way expiry from the batch RPC rows alongside soft POD", async () => {
    const tripA = "11111111-1111-4111-8111-111111111111";
    const tripB = "22222222-2222-4222-8222-222222222222";
    const eway = serializeEwayFieldEntries([
      { ewayNo: "EWB1", createdDate: "", validTill: "2020-01-01", docNo: "" },
    ]);
    mockRpc.mockResolvedValue({
      data: [
        { trip_id: tripA, document_type: "pod", document_number: null },
        { trip_id: tripB, document_type: "eway_bill", document_number: eway },
      ],
      error: null,
    });

    const flags = await loadHubPodReceiptFlags([tripA, tripB]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(flags.softTripIds).toEqual([tripA]);
    expect(flags.ewayExpiryByTripId[tripB]).toEqual(expect.any(String));
    expect(flags.ewayExpiryByTripId[tripA]).toBeUndefined();
  });
});

describe("loadLrPodIndexByTripIds", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores eway_bill rows returned by the batch RPC", async () => {
    const tripA = "11111111-1111-4111-8111-111111111111";
    const tripC = "33333333-3333-4333-8333-333333333333";
    mockRpc.mockResolvedValue({
      data: [
        { trip_id: tripA, document_type: "pod", document_number: null },
        { trip_id: tripC, document_type: "eway_bill", document_number: "{}" },
      ],
      error: null,
    });

    const index = await loadLrPodIndexByTripIds([tripA, tripC]);

    expect(index.get(tripA)).toEqual({ lrNumbers: [], hasPodDocument: true });
    expect(index.has(tripC)).toBe(false);
  });

  it("maps vault LR document numbers onto hub card labels", async () => {
    const tripA = "11111111-1111-4111-8111-111111111111";
    mockRpc.mockResolvedValue({
      data: [
        { trip_id: tripA, document_type: "lr", document_number: "AI3583" },
        { trip_id: tripA, document_type: "pod", document_number: null },
      ],
      error: null,
    });

    const labels = await loadHubLrLabelsByTripIds([tripA]);
    expect(labels[tripA]).toBe("AI3583");
  });

  it("shows E-LR on the hub only after a completed receipt exists", async () => {
    const tripA = "11111111-1111-4111-8111-111111111111";
    const tripB = "22222222-2222-4222-8222-222222222222";
    const party = {
      name: "Acme",
      address: "1 Road",
      city: "Chennai",
      state: "TN",
      pin: "600001",
      gstStatus: "unregistered" as const,
    };
    const complete: ElrSnapshot = {
      tripId: tripA,
      lrNumber: "ELR-COMPLETE-1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      consignor: party,
      consignee: party,
      transporter: party,
      vehicle: { registrationNumber: "TN01AB1234", type: "LCV" },
      route: { origin: "A", destination: "B" },
      trip: { tripId: tripA, tripNumber: "AJI862AJITRIP0001", tripDate: "2026-01-01" },
      cargo: {
        description: "Coils",
        quantity: 1,
        unit: "Nos",
        weight: 10,
        weightUnit: "tons",
      },
      commercial: {
        goodsValue: 1000,
        sourceDocument: { type: "tax_invoice", number: "INV1", date: "2026-01-01" },
      },
    };
    const incomplete: ElrSnapshot = {
      tripId: tripB,
      lrNumber: "ELR-AJI862AJITRIP0001",
      generatedAt: "2026-01-01T00:00:00.000Z",
      consignor: { name: "Acme" },
      transporter: { name: "Fleet" },
      vehicle: { registrationNumber: "TN01AB1234" },
      route: { origin: "A", destination: "B" },
      trip: { tripId: tripB, tripNumber: "AJI862AJITRIP0001", tripDate: "2026-01-01" },
    };
    mockRpc.mockResolvedValue({
      data: [
        {
          trip_id: tripA,
          document_type: "lr",
          document_number: serializeElrDocumentNumber(complete),
        },
        {
          trip_id: tripB,
          document_type: "lr",
          document_number: serializeElrDocumentNumber(incomplete),
        },
      ],
      error: null,
    });

    const labels = await loadHubTripDocumentLabelsByTripIds([tripA, tripB]);
    expect(labels.elrLabels[tripA]).toBe("ELR-COMPLETE-1");
    expect(labels.lrLabels[tripA]).toBeUndefined();
    expect(labels.elrLabels[tripB]).toBeUndefined();
    expect(labels.lrLabels[tripB]).toBeUndefined();
  });
});
