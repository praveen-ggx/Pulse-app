import {
  locationLabelFromStop,
  summarizeStopsByType,
  type StopLocationInput,
} from "@/lib/platform/orchestration/summarizeStopLocations";

export type PlanStopLocationRow = {
  execution_plan_id: string;
  stop_type: string | null;
  sequence?: number | string | null;
  label: string | null;
  city: string | null;
  state: string | null;
  address_line: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  warehouse?:
    | {
        name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
      }
    | {
        name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
      }[]
    | null;
};

export type ExecutionPlanRouteStop = {
  sequence: number;
  kind: "pickup" | "drop";
  kindIndex: number;
  caption: string;
  place: string;
  latitude: number | null;
  longitude: number | null;
};

export type ExecutionPlanRouteSummary = {
  pickup: string;
  drop: string;
  stops: ExecutionPlanRouteStop[];
};

function firstWarehouse(
  warehouse: PlanStopLocationRow["warehouse"],
): {
  address?: string | null;
  city?: string | null;
  state?: string | null;
} | null {
  if (!warehouse) return null;
  return Array.isArray(warehouse) ? (warehouse[0] ?? null) : warehouse;
}

function asSequence(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asCoord(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function planStopToLocationInput(row: PlanStopLocationRow): StopLocationInput | null {
  const type = row.stop_type === "pickup" || row.stop_type === "drop" ? row.stop_type : null;
  if (!type) return null;
  const warehouse = firstWarehouse(row.warehouse);
  return {
    type,
    label: row.label,
    address: {
      line1: row.address_line || warehouse?.address || null,
      city: row.city || warehouse?.city || null,
      state: row.state || warehouse?.state || null,
    },
  };
}

export function isMultiOrderExecutionPlan(
  summary: ExecutionPlanRouteSummary | null | undefined,
): boolean {
  const stops = summary?.stops;
  if (!stops?.length) return false;
  const pickups = stops.filter((s) => s.kind === "pickup").length;
  const drops = stops.filter((s) => s.kind === "drop").length;
  return pickups > 1 || drops > 1;
}

export type CommerceRouteHierarchy = {
  pickupPlace: string | null;
  finalDropPlace: string | null;
  intermediateCount: number;
  intermediatePlaces: string[];
};

function trimmedPlace(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t ? t : null;
}

/**
 * Card route hierarchy from already-ordered execution stops.
 * Final destination is the last drop by sequence — not a joined drop list.
 */
export function buildCommerceRouteHierarchy(
  stops: readonly ExecutionPlanRouteStop[] | null | undefined,
): CommerceRouteHierarchy {
  const ordered = [...(stops ?? [])].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.kindIndex - b.kindIndex;
  });
  const pickupStop = ordered.find((s) => s.kind === "pickup") ?? null;
  const drops = ordered.filter((s) => s.kind === "drop");
  const finalDrop = drops.length > 0 ? drops[drops.length - 1]! : null;
  const intermediates = ordered.filter((s) => {
    if (pickupStop && s === pickupStop) return false;
    if (finalDrop && s === finalDrop) return false;
    return true;
  });
  const pickupPlace = trimmedPlace(pickupStop?.place);
  const finalDropPlace = trimmedPlace(finalDrop?.place);
  const intermediatePlaces = [
    ...new Set(
      intermediates
        .map((s) => trimmedPlace(s.place))
        .filter((p): p is string => !!p && p !== pickupPlace && p !== finalDropPlace),
    ),
  ];
  return {
    pickupPlace,
    finalDropPlace,
    intermediateCount: intermediates.length,
    intermediatePlaces,
  };
}

export function groupPlanStopsToRouteSummaries(
  rows: PlanStopLocationRow[],
): Record<string, ExecutionPlanRouteSummary> {
  const byPlan = new Map<
    string,
    Array<{
      input: StopLocationInput;
      sequence: number;
      latitude: number | null;
      longitude: number | null;
    }>
  >();

  rows.forEach((row, index) => {
    const mapped = planStopToLocationInput(row);
    if (!mapped) return;
    const planId = String(row.execution_plan_id ?? "").trim();
    if (!planId) return;
    const list = byPlan.get(planId) ?? [];
    list.push({
      input: mapped,
      sequence: asSequence(row.sequence, index + 1),
      latitude: asCoord(row.latitude),
      longitude: asCoord(row.longitude),
    });
    byPlan.set(planId, list);
  });

  const out: Record<string, ExecutionPlanRouteSummary> = {};
  for (const [planId, raw] of byPlan) {
    const ordered = [...raw].sort((a, b) => a.sequence - b.sequence);
    let pickupN = 0;
    let dropN = 0;
    const stops: ExecutionPlanRouteStop[] = ordered.map((item) => {
      if (item.input.type === "drop") {
        dropN += 1;
        return {
          sequence: item.sequence,
          kind: "drop",
          kindIndex: dropN,
          caption: `Drop ${dropN}`,
          place: locationLabelFromStop(item.input),
          latitude: item.latitude,
          longitude: item.longitude,
        };
      }
      pickupN += 1;
      return {
        sequence: item.sequence,
        kind: "pickup",
        kindIndex: pickupN,
        caption: `Pickup ${pickupN}`,
        place: locationLabelFromStop(item.input),
        latitude: item.latitude,
        longitude: item.longitude,
      };
    });
    const inputs = ordered.map((item) => item.input);
    out[planId] = {
      pickup: summarizeStopsByType(inputs, "pickup"),
      drop: summarizeStopsByType(inputs, "drop"),
      stops,
    };
  }
  return out;
}

export function indentRoutePlan(
  load: { execution_plan_id?: unknown },
  byPlanId: Record<string, ExecutionPlanRouteSummary> | undefined,
): ExecutionPlanRouteSummary | undefined {
  const planId =
    typeof load.execution_plan_id === "string" ? load.execution_plan_id.trim() : "";
  return planId ? byPlanId?.[planId] : undefined;
}

export function indentDisplayOriginDest(
  // Widened from Pick<IndentRow, ...>: IndentRow types these as plain strings,
  // but story/marketplace sources carry them as nullable. The body already
  // tolerates missing values (it falls back to "—").
  load: {
    pickup_area?: string | null;
    drop_location?: string | null;
    execution_plan_id?: unknown;
  },
  byPlanId: Record<string, ExecutionPlanRouteSummary> | undefined,
): { origin: string; dest: string } {
  const overlay = indentRoutePlan(load, byPlanId);
  return {
    origin: overlay?.pickup || load.pickup_area || "—",
    dest: overlay?.drop || load.drop_location || "—",
  };
}
