import { captureDriverTripPayment } from "../driverCapturePayment.service";
import { stableDriverCaptureKey } from "../../utils/driverCapturePayment.util";

const mockClaim = jest.fn();
const mockFindRef = jest.fn();
const mockCreateLedger = jest.fn();
const mockGetReceivable = jest.fn();
const mockCollectSelf = jest.fn();
const mockGetIndie = jest.fn();
const mockCollectIndie = jest.fn();

jest.mock("@/features/marketplace/services/exchangePayments.service", () => ({
  claimExchangePayment: (...args: unknown[]) => mockClaim(...args),
}));

const mockGetLedger = jest.fn();

jest.mock("@/features/drivers/services/drivers.service", () => ({
  findDriverLedgerByReference: (...args: unknown[]) => mockFindRef(...args),
  createDriverLedgerEntry: (...args: unknown[]) => mockCreateLedger(...args),
  getDriverLedgerByTripId: (...args: unknown[]) => mockGetLedger(...args),
}));

jest.mock("@/features/dco-self/services/dcoSelfReceivable.service", () => ({
  getDcoSelfReceivableForTrip: (...args: unknown[]) => mockGetReceivable(...args),
  collectDcoSelfReceivable: (...args: unknown[]) => mockCollectSelf(...args),
}));

jest.mock("@/features/driver-indie/services/driverIndieReceivable.service", () => ({
  getDriverIndieReceivableForTrip: (...args: unknown[]) => mockGetIndie(...args),
  collectDriverIndieReceivable: (...args: unknown[]) => mockCollectIndie(...args),
}));

beforeEach(() => {
  mockClaim.mockReset();
  mockFindRef.mockReset();
  mockCreateLedger.mockReset();
  mockGetLedger.mockReset();
  mockGetLedger.mockResolvedValue({
    error: null,
    entries: [{ id: "led-1", type: "settlement", amount: 2500 }],
  });
  mockGetReceivable.mockReset();
  mockCollectSelf.mockReset();
  mockGetIndie.mockReset();
  mockCollectIndie.mockReset();
});

const base = {
  trip: { id: "trip-1", organization_id: "org-1" },
  amount: 2500,
  paymentModeId: "UPI",
  reference: "UTR1",
  paidOn: "2026-11-01",
  driverId: "drv-1",
  createdBy: "user-1",
  tripDisplay: "TRP001",
};

describe("captureDriverTripPayment", () => {
  it("reuses one Exchange key after a timeout", async () => {
    const key = stableDriverCaptureKey({
      lane: "marketplace",
      tripId: "trip-1",
      amount: 2500,
      paymentModeId: "UPI",
      reference: "UTR1",
      paidOn: "2026-11-01",
    });
    mockClaim
      .mockResolvedValueOnce({ error: new Error("network timeout"), payment: null })
      .mockResolvedValueOnce({ error: null, payment: { id: "xp-1" } });

    await captureDriverTripPayment({ ...base, lane: "marketplace" });
    await captureDriverTripPayment({ ...base, lane: "marketplace" });

    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(mockClaim.mock.calls[0][0].idempotencyKey).toBe(key);
    expect(mockClaim.mock.calls[1][0].idempotencyKey).toBe(key);
  });

  it("does not insert a second ledger row for the same capture", async () => {
    mockFindRef
      .mockResolvedValueOnce({ error: null, row: null })
      .mockResolvedValueOnce({ error: null, row: { id: "led-1" } });
    mockCreateLedger.mockResolvedValue({ error: null, row: { id: "led-1" } });

    await captureDriverTripPayment({ ...base, lane: "shipper" });
    await captureDriverTripPayment({ ...base, lane: "shipper" });

    expect(mockCreateLedger).toHaveBeenCalledTimes(1);
    expect(mockCreateLedger.mock.calls[0][4]).toMatchObject({
      referenceType: "dco_capture",
      referenceId: expect.stringMatching(/^dco-capture:shipper:trip-1:2500:UPI:utr1:2026-11-01$/),
    });
  });

  it("collapses a double-tap into one in-flight insert", async () => {
    let resolveFind: (value: { error: null; row: null }) => void = () => undefined;
    mockFindRef.mockReturnValue(
      new Promise((resolve) => {
        resolveFind = resolve;
      }),
    );
    mockCreateLedger.mockResolvedValue({ error: null, row: { id: "led-2" } });

    const first = captureDriverTripPayment({ ...base, lane: "shipper" });
    const second = captureDriverTripPayment({ ...base, lane: "shipper" });
    resolveFind({ error: null, row: null });
    await Promise.all([first, second]);

    expect(mockCreateLedger).toHaveBeenCalledTimes(1);
  });

  it("collects DCO Self without writing the employer ledger", async () => {
    mockGetReceivable.mockResolvedValue({
      error: null,
      receivable: { id: "recv-1", billed_amount: 2500, status: "issued" },
    });
    mockCollectSelf.mockResolvedValue({ error: null, replayed: false });

    const { error } = await captureDriverTripPayment({
      ...base,
      lane: "shipper",
      book: "dco_self",
    });

    expect(error).toBeNull();
    expect(mockCollectSelf).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: "recv-1",
        amount: 2500,
        paymentMode: "UPI",
      }),
    );
    expect(mockCreateLedger).not.toHaveBeenCalled();
  });

  it("uses a screen-resolved indie receivableId without re-fetching (offline-safe)", async () => {
    mockCollectIndie.mockResolvedValue({ error: null, replayed: false, pending: true });

    const { error } = await captureDriverTripPayment({
      ...base,
      lane: "shipper",
      book: "driver_indie",
      receivableId: "indie-recv-cached",
    });

    expect(error).toBeNull();
    expect(mockGetIndie).not.toHaveBeenCalled();
    expect(mockCollectIndie).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: "indie-recv-cached",
        amount: 2500,
      }),
    );
  });
});
