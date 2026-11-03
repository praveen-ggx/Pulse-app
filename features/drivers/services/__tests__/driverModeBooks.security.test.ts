/**
 * Cross-workflow / security guards for the four driver money destinations.
 * Indie payments must never route through DCO Self or Fleet employer writers.
 */
import { captureDriverTripPayment } from "../driverCapturePayment.service";

const mockCollectDcoSelf = jest.fn(async () => ({ error: null, replayed: false }));
const mockCollectIndie = jest.fn(async () => ({ error: null, replayed: false }));
const mockGetDcoSelf = jest.fn(async () => ({
  error: null,
  receivable: { id: "self-rec-1" },
}));
const mockGetIndie = jest.fn(async () => ({
  error: null,
  receivable: { id: "indie-rec-1" },
}));
const mockCreateLedger = jest.fn(async () => ({ error: null, row: { id: "led-1" } }));
const mockFindLedger = jest.fn(async () => ({ row: null, error: null }));
const mockGetLedger = jest.fn(async () => ({
  error: null,
  entries: [{ id: "led-1", type: "settlement", amount: 1000 }],
}));
const mockClaimExchange = jest.fn(async () => ({ error: null }));

jest.mock("@/features/dco-self/services/dcoSelfReceivable.service", () => ({
  collectDcoSelfReceivable: (...args: unknown[]) => mockCollectDcoSelf(...args),
  getDcoSelfReceivableForTrip: (...args: unknown[]) => mockGetDcoSelf(...args),
}));

jest.mock("@/features/driver-indie/services/driverIndieReceivable.service", () => ({
  collectDriverIndieReceivable: (...args: unknown[]) => mockCollectIndie(...args),
  getDriverIndieReceivableForTrip: (...args: unknown[]) => mockGetIndie(...args),
}));

jest.mock("@/features/drivers/services/drivers.service", () => ({
  createDriverLedgerEntry: (...args: unknown[]) => mockCreateLedger(...args),
  findDriverLedgerByReference: (...args: unknown[]) => mockFindLedger(...args),
  getDriverLedgerByTripId: (...args: unknown[]) => mockGetLedger(...args),
}));

jest.mock("@/features/marketplace/services/exchangePayments.service", () => ({
  claimExchangePayment: (...args: unknown[]) => mockClaimExchange(...args),
}));

const base = {
  trip: { id: "trip-1", organization_id: "org-1" },
  amount: 1000,
  paymentModeId: "UPI",
  reference: "ref-1",
  paidOn: "2026-11-02",
  driverId: "drv-1",
  createdBy: "user-1",
  tripDisplay: "TRP001",
  lane: "shipper" as const,
};

describe("driver mode books security", () => {
  beforeEach(() => {
    mockCollectDcoSelf.mockClear();
    mockCollectIndie.mockClear();
    mockCreateLedger.mockClear();
    mockClaimExchange.mockClear();
  });

  it("routes independent DRIVER capture only to the indie book", async () => {
    const { error } = await captureDriverTripPayment({
      ...base,
      book: "driver_indie",
    });
    expect(error).toBeNull();
    expect(mockCollectIndie).toHaveBeenCalledTimes(1);
    expect(mockCollectDcoSelf).not.toHaveBeenCalled();
    expect(mockCreateLedger).not.toHaveBeenCalled();
    expect(mockClaimExchange).not.toHaveBeenCalled();
  });

  it("routes DCO Self capture only to the Self book", async () => {
    const { error } = await captureDriverTripPayment({
      ...base,
      book: "dco_self",
    });
    expect(error).toBeNull();
    expect(mockCollectDcoSelf).toHaveBeenCalledTimes(1);
    expect(mockCollectIndie).not.toHaveBeenCalled();
    expect(mockCreateLedger).not.toHaveBeenCalled();
  });

  it("routes employer shipper capture to fleet ledger, never Self/indie", async () => {
    const { error } = await captureDriverTripPayment({
      ...base,
      book: "employer",
    });
    expect(error).toBeNull();
    expect(mockCreateLedger).toHaveBeenCalledTimes(1);
    expect(mockCollectDcoSelf).not.toHaveBeenCalled();
    expect(mockCollectIndie).not.toHaveBeenCalled();
  });

  it("keeps marketplace claims on Exchange", async () => {
    const { error } = await captureDriverTripPayment({
      ...base,
      lane: "marketplace",
      book: "driver_indie",
    });
    expect(error).toBeNull();
    expect(mockClaimExchange).toHaveBeenCalledTimes(1);
    expect(mockCollectIndie).not.toHaveBeenCalled();
    expect(mockCollectDcoSelf).not.toHaveBeenCalled();
  });
});
