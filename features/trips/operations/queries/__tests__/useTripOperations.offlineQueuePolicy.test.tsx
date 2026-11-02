/**
 * B1: a fuel / toll save uses one id for the online insert's idempotency_key and the
 * outbox item, and only failures an offline replay can fix are queued. Permission,
 * validation and business errors surface to the screen (which keeps the form).
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

import { useSaveTripFuelEntry, useSaveTripTollEntry } from "../useTripOperations";
import { createTripFuelEntry } from "../../fuel/fuel.service";
import { createTripTollEntry } from "../../toll/toll.service";
import { enqueueFuelMetadata, enqueueTollMetadata } from "../../offline/outbox";

let mockOnline = true;
jest.mock("@/contexts/NetworkContext", () => ({
  useIsOnline: () => mockOnline,
}));
jest.mock("../../offline/outbox", () => ({
  enqueueFuelMetadata: jest.fn(async () => "queued"),
  enqueueFuelPhoto: jest.fn(),
  enqueueTollMetadata: jest.fn(async () => "queued"),
  enqueueTollPhoto: jest.fn(),
  newOperationsQueueItemId: jest.fn(() => "ops_key_1"),
}));
jest.mock("@/features/ledger/vehicle", () => ({
  evaluateAndPostFuelEntry: jest.fn(),
  evaluateAndPostOtherExpenseEntry: jest.fn(),
  evaluateAndPostTollEntry: jest.fn(),
}));
jest.mock("@/features/ledger/vehicle/postingMessages.util", () => ({
  describeVehiclePostingFailure: jest.fn(),
  isVehiclePostingSuccess: jest.fn(),
}));
jest.mock("@/features/finance/projections/syncOperationalFinanceProjection", () => ({
  syncOperationalFinanceProjection: jest.fn(),
}));
jest.mock("@/features/trips/services/trips.service", () => ({
  getTripRowByIdLight: jest.fn(),
}));
jest.mock("../../other/otherExpense.service", () => ({
  createTripOtherExpense: jest.fn(async () => ({ error: null, entry: { id: "exp-1" } })),
  getTripOtherExpenses: jest.fn(),
  updateTripOtherExpense: jest.fn(),
  updateTripOtherExpenseApprovalState: jest.fn(),
  uploadOtherExpenseReceiptPhoto: jest.fn(),
}));
jest.mock("../../fuel/fuel.service", () => ({
  createTripFuelEntry: jest.fn(),
  getTripFuelEntries: jest.fn(),
  updateTripFuelApprovalState: jest.fn(),
  updateTripFuelEntry: jest.fn(),
  uploadFuelBillPhoto: jest.fn(),
}));
jest.mock("../../toll/toll.service", () => ({
  createTripTollEntry: jest.fn(),
  getTripTollEntries: jest.fn(),
  updateTripTollApprovalState: jest.fn(),
  updateTripTollEntry: jest.fn(),
  uploadTollReceiptPhoto: jest.fn(),
}));
jest.mock("../../uploads/photoUploads", () => ({
  compressOperationsPhoto: jest.fn(),
}));
jest.mock("../../timeline/timelineEvents.service", () => ({
  getTripOperationalTimelineEvents: jest.fn(),
}));
jest.mock("../../maintenance/maintenance.service", () => ({
  getVehicleMaintenanceEntries: jest.fn(),
}));
jest.mock("../../reimbursement/reimbursement.service", () => ({
  updateFuelReimbursementState: jest.fn(),
  updateOtherReimbursementState: jest.fn(),
  updateTollReimbursementState: jest.fn(),
}));
jest.mock("../../reimbursement/driverExpenseRequest.service", () => ({
  cancelDriverExpenseRequest: jest.fn(),
  parseDriverExpenseEventId: jest.fn(),
  remindDriverExpenseRequest: jest.fn(),
}));


const err = (fields: { message: string; code?: string; status?: number }) =>
  Object.assign(new Error(fields.message), { code: fields.code ?? "", status: fields.status ?? 0 });

const fuelInput = {
  tripId: "trip-1",
  amountInr: 1500,
  liters: 15,
  fuelType: null,
  stationName: null,
  notes: null,
  enteredBy: "user-1",
};
const tollInput = {
  tripId: "trip-1",
  amountInr: 120,
  plazaName: "Plaza",
  notes: null,
  isEstimated: false,
  enteredBy: "user-1",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function saveFuel() {
  const { result } = renderHook(() => useSaveTripFuelEntry(), { wrapper });
  let outcome: unknown;
  let thrown: unknown = null;
  await act(async () => {
    try {
      outcome = await result.current.mutateAsync(fuelInput as never);
    } catch (e) {
      thrown = e;
    }
  });
  return { outcome, thrown };
}

describe("fuel save: idempotency key and offline queue policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnline = true;
  });

  it("online success: saves with the key, queues nothing", async () => {
    (createTripFuelEntry as jest.Mock).mockResolvedValue({ error: null, entry: { id: "f1" } });
    const { outcome } = await saveFuel();
    expect(outcome).toEqual({ queued: false });
    expect(createTripFuelEntry).toHaveBeenCalledWith(expect.objectContaining({ queueItemId: "ops_key_1" }));
    expect(enqueueFuelMetadata).not.toHaveBeenCalled();
  });

  it("offline: queues with the same key the online insert would have used", async () => {
    mockOnline = false;
    const { outcome } = await saveFuel();
    expect(outcome).toEqual({ queued: true });
    expect(createTripFuelEntry).not.toHaveBeenCalled();
    expect(enqueueFuelMetadata).toHaveBeenCalledWith(expect.anything(), "ops_key_1");
  });

  it.each([
    ["timeout", err({ message: "TimeoutError: Request timed out" })],
    ["device offline", err({ message: "DeviceOfflineError: You're offline." })],
    ["transport failure", err({ message: "TypeError: Network request failed" })],
    ["5xx", err({ message: "Service Unavailable", status: 503 })],
    ["circuit open", err({ message: "ServiceUnavailableError: Service Unavailable 503" })],
    ["429", err({ message: "Too many requests", status: 429 })],
  ])("%s: queued with the SAME key, so a replay of a committed insert is a no-op", async (_label, error) => {
    (createTripFuelEntry as jest.Mock).mockResolvedValue({ error, entry: null });
    const { outcome, thrown } = await saveFuel();
    expect(thrown).toBeNull();
    expect(outcome).toEqual({ queued: true });
    const onlineKey = (createTripFuelEntry as jest.Mock).mock.calls[0][0].queueItemId;
    expect(enqueueFuelMetadata).toHaveBeenCalledWith(expect.anything(), onlineKey);
  });

  it.each([
    ["401", err({ message: "JWT expired", code: "PGRST301", status: 401 })],
    ["403 / RLS", err({ message: "new row violates row-level security policy", code: "42501", status: 403 })],
    ["400 validation", err({ message: "invalid input", code: "22P02", status: 400 })],
    ["check constraint", err({ message: "violates check constraint", code: "23514", status: 400 })],
    ["business rule", err({ message: "Trip is closed", code: "P0001", status: 400 })],
  ])("%s: surfaces the error, never 'saved offline'", async (_label, error) => {
    (createTripFuelEntry as jest.Mock).mockResolvedValue({ error, entry: null });
    const { outcome, thrown } = await saveFuel();
    expect(thrown).toBe(error);
    expect(outcome).toBeUndefined();
    expect(enqueueFuelMetadata).not.toHaveBeenCalled();
  });
});

describe("toll save: same policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnline = true;
  });

  async function saveToll() {
    const { result } = renderHook(() => useSaveTripTollEntry(), { wrapper });
    let outcome: unknown;
    let thrown: unknown = null;
    await act(async () => {
      try {
        outcome = await result.current.mutateAsync(tollInput as never);
      } catch (e) {
        thrown = e;
      }
    });
    return { outcome, thrown };
  }

  it("timeout: queued with the online key", async () => {
    (createTripTollEntry as jest.Mock).mockResolvedValue({
      error: err({ message: "TimeoutError: Request timed out" }),
      entry: null,
    });
    const { outcome } = await saveToll();
    expect(outcome).toEqual({ queued: true });
    expect(createTripTollEntry).toHaveBeenCalledWith(expect.objectContaining({ queueItemId: "ops_key_1" }));
    expect(enqueueTollMetadata).toHaveBeenCalledWith(expect.anything(), "ops_key_1");
  });

  it("RLS denial: surfaces, not queued", async () => {
    const denied = err({ message: "permission denied", code: "42501", status: 403 });
    (createTripTollEntry as jest.Mock).mockResolvedValue({ error: denied, entry: null });
    const { thrown } = await saveToll();
    expect(thrown).toBe(denied);
    expect(enqueueTollMetadata).not.toHaveBeenCalled();
  });
});
