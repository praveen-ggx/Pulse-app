import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, Pressable } from "react-native";
import { useInvoicingExecuteTripsQuery } from "@/lib/queries/useInvoicingExecuteQueries";
import { useLogIncomingPodsTripsQuery } from "@/lib/queries/useLogIncomingPodsQueries";
import { readUntilVisibleTripPage, TRIP_LIST_EMPTY_PAGE_HOPS } from "@/features/trips/utils/tripKeysetCursor.util";

const mockFetchInvoicingTrips = jest.fn();
const mockFetchTripsForLogPods = jest.fn();

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/features/invoicing/services/invoicing.service", () => ({
  fetchInvoicingTrips: (...args: unknown[]) => mockFetchInvoicingTrips(...args),
  fetchPodReconciliationSummary: jest.fn(),
  fetchDigitalPodTripIdsForInvoice: jest.fn(),
  executeInvoiceCreation: jest.fn(),
}));
jest.mock("@/features/log-pods/services/logPods.service", () => ({
  fetchTripsForLogPods: (...args: unknown[]) => mockFetchTripsForLogPods(...args),
  fetchOrgSuppliersForLogPods: jest.fn(),
  fetchOrgDriversForLogPods: jest.fn(),
  fetchCourierPartners: jest.fn(),
  ensureCustomCourierPartner: jest.fn(),
  executeLogIncomingPods: jest.fn(),
  markSelectedTripsHardCopyPodReceived: jest.fn(),
}));

type Row = { created_at: string; id: string; eligible: boolean };

function rowsForSimulation(): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < 2500; index += 1) {
    const sameStamp = index < 400;
    rows.push({
      created_at: sameStamp
        ? "2026-11-11T08:00:00.000Z"
        : new Date(Date.UTC(2026, 10, 11, 8, 0, 0) - index * 1000).toISOString(),
      id: `id-${String(3000 - index).padStart(4, "0")}`,
      eligible: index >= 250 && index !== 2100 ? index % 17 === 0 || index === 2499 : index === 2499,
    });
  }
  rows[2499].eligible = true;
  return rows;
}

function pageOf(rows: Row[], cursor: { createdAt: string; id: string } | null) {
  const start = cursor
    ? rows.findIndex(
        (row) =>
          row.created_at < cursor.createdAt ||
          (row.created_at === cursor.createdAt && row.id < cursor.id),
      )
    : 0;
  const slice = rows.slice(start < 0 ? rows.length : start, (start < 0 ? rows.length : start) + 100);
  const last = slice[slice.length - 1];
  return {
    visible: slice.filter((row) => row.eligible),
    nextCursor:
      slice.length < 100 || !last
        ? null
        : { createdAt: last.created_at, id: last.id },
  };
}

function InvoiceList() {
  const query = useInvoicingExecuteTripsQuery("org-1");
  const ids = (query.data ?? []).map((trip) => trip.id);
  return (
    <>
      <Text>{query.isError ? "invoice-error" : "invoice-ok"}</Text>
      <Text>{ids.join(",")}</Text>
      <Pressable onPress={() => void query.fetchNextPage()}>
        <Text>invoice-more</Text>
      </Pressable>
    </>
  );
}

function renderQuery(child: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}

describe("invoice and POD page append", () => {
  beforeEach(() => {
    mockFetchInvoicingTrips.mockReset();
    mockFetchTripsForLogPods.mockReset();
  });

  it("appends the next invoice page without repeating ids", async () => {
    mockFetchInvoicingTrips
      .mockResolvedValueOnce({
        error: null,
        trips: [{ id: "A" }, { id: "B" }],
        nextCursor: { createdAt: "2026-11-11T08:00:00.000Z", id: "B" },
      })
      .mockResolvedValueOnce({
        error: null,
        trips: [{ id: "C" }],
        nextCursor: null,
      });
    const view = renderQuery(<InvoiceList />);
    await waitFor(() => expect(view.getByText("A,B")).toBeTruthy());
    fireEvent.press(view.getByText("invoice-more"));
    await waitFor(() => expect(view.getByText("A,B,C")).toBeTruthy());
    expect(view.getByText("A,B,C").props.children).toBe("A,B,C");
  });

  it("surfaces an invoice page error instead of an empty list", async () => {
    mockFetchInvoicingTrips.mockResolvedValue({
      error: new Error("invoice failed"),
      trips: [],
      nextCursor: null,
    });
    const view = renderQuery(<InvoiceList />);
    await waitFor(() => expect(view.getByText("invoice-error")).toBeTruthy());
    expect(view.queryByText("invoice-ok")).toBeNull();
  });

  it("walks 2,500 raw rows, keeps the cursor after 20 empty pages, and reaches the later eligible row", async () => {
    const rows = rowsForSimulation();
    const eligibleIds = rows.filter((row) => row.eligible).map((row) => row.id);
    const seen: string[] = [];
    let cursor: { createdAt: string; id: string } | null = null;
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const page = await readUntilVisibleTripPage({
        initialCursor: cursor,
        maxPages: TRIP_LIST_EMPTY_PAGE_HOPS,
        fetchPage: async (current) => {
          const next = pageOf(rows, current);
          return { error: null, visible: next.visible, nextCursor: next.nextCursor };
        },
      });
      expect(page.error).toBeNull();
      seen.push(...page.trips.map((row) => row.id));
      if (page.trips.length === 0 && page.nextCursor == null && seen.length === 0) {
        throw new Error("pagination ended before any eligible row");
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(eligibleIds);
    expect(seen).toContain(rows[2499].id);
  });

  it("uses the POD hook cursor to continue past a run of ineligible rows", async () => {
    const rows = rowsForSimulation().slice(0, 350);
    mockFetchTripsForLogPods.mockImplementation(async (_org: string, opts?: { cursor?: { createdAt: string; id: string } | null }) => {
      const next = pageOf(rows, opts?.cursor ?? null);
      return { error: null, trips: next.visible.map((row) => ({ id: row.id })), nextCursor: next.nextCursor };
    });
    function PodList() {
      const query = useLogIncomingPodsTripsQuery("org-1");
      return (
        <>
          <Text>{(query.data ?? []).map((trip) => trip.id).join(",")}</Text>
          <Pressable onPress={() => void query.fetchNextPage()}>
            <Text>pod-more</Text>
          </Pressable>
        </>
      );
    }
    const view = renderQuery(<PodList />);
    await waitFor(() => expect(view.getByText(/id-/)).toBeTruthy());
    const first = String(view.getByText(/id-/).props.children);
    expect(new Set(first.split(",")).size).toBe(first.split(",").filter(Boolean).length);
    fireEvent.press(view.getByText("pod-more"));
    await waitFor(() => {
      const text = String(view.getByText(/id-/).props.children);
      expect(text.split(",").length).toBeGreaterThan(first.split(",").length);
    });
    const combined = String(view.getByText(/id-/).props.children).split(",");
    expect(new Set(combined).size).toBe(combined.length);
  });
});
