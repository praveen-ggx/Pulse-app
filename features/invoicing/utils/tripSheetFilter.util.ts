import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  displayOperationalField,
  tripListLrLabel,
} from "@/features/invoicing/utils/invoiceTripOperational.util";
import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";

export const TRIP_SHEET_COLUMNS = [
  "trip",
  "lr",
  "party",
  "route",
  "freight",
  "invoice",
  "pod",
] as const;

export type TripSheetColumn = (typeof TRIP_SHEET_COLUMNS)[number];

/** Checked values for a column. Missing means every value is visible. */
export type TripSheetFilters = Partial<Record<TripSheetColumn, readonly string[]>>;

export type TripSheetSort = { column: TripSheetColumn; direction: "asc" | "desc" } | null;

const BLANK = "(Blank)";

function shown(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text || text === "—") return BLANK;
  return text;
}

export function tripSheetCell(
  trip: InvoicingTripView,
  column: TripSheetColumn,
  invoiceLabel: (trip: InvoicingTripView) => string,
): string {
  switch (column) {
    case "trip":
      return shown(displayOperationalField(trip.id));
    case "lr":
      return shown(tripListLrLabel(trip));
    case "party":
      return shown(
        `${displayOperationalField(trip.supplier_name)} · ${displayOperationalField(trip.driver_name)}`,
      );
    case "route":
      return shown(trip.route);
    case "freight":
      return `₹${trip.amount.toLocaleString()}`;
    case "invoice":
      return shown(invoiceLabel(trip));
    case "pod":
      if (!tripIsDeliveredStatus(trip.tripStatus)) return BLANK;
      return [
        trip.digitalPodPresent ? "Soft received" : "Soft missing",
        trip.physicalPodReceived ? "Hard received" : "Hard pending",
      ].join(" · ");
    default:
      return BLANK;
  }
}

export function applyTripSheetFilters(
  trips: readonly InvoicingTripView[],
  filters: TripSheetFilters,
  invoiceLabel: (trip: InvoicingTripView) => string,
): InvoicingTripView[] {
  const active = TRIP_SHEET_COLUMNS.flatMap((column) => {
    const picked = filters[column];
    return picked ? [[column, new Set(picked)] as const] : [];
  });
  if (active.length === 0) return [...trips];
  return trips.filter((trip) =>
    active.every(([column, picked]) => picked.has(tripSheetCell(trip, column, invoiceLabel))),
  );
}

export function tripSheetChoices(
  trips: readonly InvoicingTripView[],
  column: TripSheetColumn,
  filters: TripSheetFilters,
  invoiceLabel: (trip: InvoicingTripView) => string,
): { value: string; count: number }[] {
  const rest = { ...filters };
  delete rest[column];
  const rows = applyTripSheetFilters(trips, rest, invoiceLabel);
  const counts = new Map<string, number>();
  rows.forEach((trip) => {
    const value = tripSheetCell(trip, column, invoiceLabel);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (a.value === BLANK) return 1;
      if (b.value === BLANK) return -1;
      return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" });
    });
}

export function sortTripSheet(
  trips: readonly InvoicingTripView[],
  sort: TripSheetSort,
  invoiceLabel: (trip: InvoicingTripView) => string,
): InvoicingTripView[] {
  if (!sort) return [...trips];
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...trips].sort((a, b) => {
    if (sort.column === "freight") return (a.amount - b.amount) * direction;
    return (
      tripSheetCell(a, sort.column, invoiceLabel).localeCompare(
        tripSheetCell(b, sort.column, invoiceLabel),
        undefined,
        { numeric: true, sensitivity: "base" },
      ) * direction
    );
  });
}

export function tripSheetFilterCount(filters: TripSheetFilters): number {
  return TRIP_SHEET_COLUMNS.filter((column) => filters[column] != null).length;
}
