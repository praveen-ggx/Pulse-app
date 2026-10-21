/** FTL stop between pickup and drop, as edited in the route step. Charges are raw input text. */
export type RouteExtraStopDraft = {
  key: string;
  location: string;
  lat: number | null;
  lon: number | null;
  clientCharge: string;
  supplierCharge: string;
};

/** Saved stop, ready to insert. */
export type RouteExtraStopInput = {
  location: string;
  latitude: number | null;
  longitude: number | null;
  clientCharge: number;
  supplierCharge: number;
};

export type RouteExtraStopSummary = {
  count: number;
  clientCharge: number;
  supplierCharge: number;
};

export const EMPTY_ROUTE_EXTRA_STOP_SUMMARY: RouteExtraStopSummary = {
  count: 0,
  clientCharge: 0,
  supplierCharge: 0,
};

export const ROUTE_EXTRA_STOPS_MAX = 5;

let draftSeq = 0;

export function newRouteExtraStopDraft(): RouteExtraStopDraft {
  draftSeq += 1;
  return {
    key: `stop-${Date.now()}-${draftSeq}`,
    location: "",
    lat: null,
    lon: null,
    clientCharge: "",
    supplierCharge: "",
  };
}

export function parseStopCharge(raw: string): number {
  const n = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Drafts with a location, in order. Empty rows are dropped. */
export function routeExtraStopInputs(
  drafts: readonly RouteExtraStopDraft[] | null | undefined,
): RouteExtraStopInput[] {
  return (drafts ?? [])
    .filter((d) => d.location.trim().length > 0)
    .map((d) => ({
      location: d.location.trim(),
      latitude: d.lat,
      longitude: d.lon,
      clientCharge: parseStopCharge(d.clientCharge),
      supplierCharge: parseStopCharge(d.supplierCharge),
    }));
}

export function summarizeRouteExtraStops(
  stops: readonly Pick<RouteExtraStopInput, "clientCharge" | "supplierCharge">[],
): RouteExtraStopSummary {
  return stops.reduce<RouteExtraStopSummary>(
    (acc, s) => ({
      count: acc.count + 1,
      clientCharge: acc.clientCharge + s.clientCharge,
      supplierCharge: acc.supplierCharge + s.supplierCharge,
    }),
    EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  );
}

/** True when a draft row has a charge but no location yet (it would be dropped on save). */
export function routeExtraStopDraftIncomplete(d: RouteExtraStopDraft): boolean {
  return (
    d.location.trim().length === 0 &&
    (parseStopCharge(d.clientCharge) > 0 || parseStopCharge(d.supplierCharge) > 0)
  );
}

/**
 * Freight totals saved on the indent / trip: base + stop charges.
 * A supplier amount of 0 means "not set", so stop charges are not added to it.
 */
export function freightWithExtraStops(
  base: { client: number; supplier: number },
  summary: RouteExtraStopSummary,
): { client: number; supplier: number } {
  return {
    client: base.client > 0 ? base.client + summary.clientCharge : base.client,
    supplier: base.supplier > 0 ? base.supplier + summary.supplierCharge : base.supplier,
  };
}

export function extraStopChipLabel(count: number): string | null {
  if (count <= 0) return null;
  return `+${count} stop${count === 1 ? "" : "s"}`;
}

/** Distinct stop places in sequence order — what a bidder should see on the lane. */
export function uniqueViaStopLocations(
  rows: readonly { location: string; sequence?: number }[],
): string[] {
  const ordered = [...rows].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of ordered) {
    const location = row.location.trim();
    if (!location) continue;
    const key = location.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(location);
  }
  return out;
}

export function viaStopLocationsByParentId(
  rows: readonly {
    location: string;
    sequence?: number;
    indent_id?: string | null;
    trip_id?: string | null;
  }[],
  parentKey: "indent_id" | "trip_id",
): Map<string, string[]> {
  const grouped = new Map<string, { location: string; sequence?: number }[]>();
  for (const row of rows) {
    const id = row[parentKey];
    if (!id) continue;
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  const out = new Map<string, string[]>();
  for (const [id, list] of grouped) {
    out.set(id, uniqueViaStopLocations(list));
  }
  return out;
}

export function viaStopLocationsForMemberIds(
  memberIds: readonly string[],
  byParent: ReadonlyMap<string, readonly string[]>,
): string[] {
  return uniqueViaStopLocations(
    memberIds.flatMap((id, index) =>
      (byParent.get(id) ?? []).map((location, stopIndex) => ({
        location,
        sequence: index * 100 + stopIndex,
      })),
    ),
  );
}

/**
 * "incl. ₹X extra paid" for the side the viewer prices on. Owners see the
 * client charge; bidders and suppliers only ever see the supplier charge.
 */
export function extraStopPaidLabel(
  summary: RouteExtraStopSummary,
  side: "client" | "supplier",
  formatAmount: (n: number) => string,
): string | null {
  const amount = side === "client" ? summary.clientCharge : summary.supplierCharge;
  if (summary.count <= 0 || amount <= 0) return null;
  return `incl. ${formatAmount(amount)} extra paid`;
}

/** Rebuild editor rows from saved stops (charges as plain strings). */
export function routeExtraStopDraftsFromRows(
  rows: readonly {
    location: string;
    latitude: number | null;
    longitude: number | null;
    client_charge: number;
    supplier_charge: number;
  }[],
): RouteExtraStopDraft[] {
  return rows.map((r) => ({
    ...newRouteExtraStopDraft(),
    location: r.location,
    lat: r.latitude,
    lon: r.longitude,
    clientCharge: r.client_charge > 0 ? String(r.client_charge) : "",
    supplierCharge: r.supplier_charge > 0 ? String(r.supplier_charge) : "",
  }));
}
