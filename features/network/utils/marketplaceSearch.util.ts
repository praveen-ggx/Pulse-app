/** Flight-style Marketplace search — no RPC until from / to / vehicle are set. */

export const MARKETPLACE_SEARCH_MIN_CHARS = 2;

export type MarketplaceLoadSearch = {
  pickup: string;
  drop: string;
  vehicleType: string;
};

export function normalizeMarketplaceSearchField(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeMarketplaceSearch(
  draft: Partial<MarketplaceLoadSearch> | null | undefined,
): MarketplaceLoadSearch {
  return {
    pickup: normalizeMarketplaceSearchField(draft?.pickup),
    drop: normalizeMarketplaceSearchField(draft?.drop),
    vehicleType: normalizeMarketplaceSearchField(draft?.vehicleType),
  };
}

export function isMarketplaceSearchReady(
  search: Partial<MarketplaceLoadSearch> | null | undefined,
): search is MarketplaceLoadSearch {
  const n = normalizeMarketplaceSearch(search);
  return (
    n.pickup.length >= MARKETPLACE_SEARCH_MIN_CHARS &&
    n.drop.length >= MARKETPLACE_SEARCH_MIN_CHARS &&
    n.vehicleType.length >= 1
  );
}

export function marketplaceSearchKey(search: MarketplaceLoadSearch): string {
  const n = normalizeMarketplaceSearch(search);
  return `${n.pickup.toLowerCase()}|${n.drop.toLowerCase()}|${n.vehicleType.toLowerCase()}`;
}

export function marketplaceSearchSummary(search: MarketplaceLoadSearch): string {
  const n = normalizeMarketplaceSearch(search);
  return `${n.pickup} → ${n.drop} · ${n.vehicleType}`;
}

export type MarketplaceSearchLane = {
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  load_count: number;
  /** Lowest supplier target on the lane. Null when none is set. */
  target_rate_min?: number | null;
  /** Highest supplier target on the lane. Null when none is set. */
  target_rate_max?: number | null;
};

export function positiveLaneTarget(value: number | string | null | undefined): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

export function combineLaneTarget(
  current: number | null | undefined,
  next: number | string | null | undefined,
  mode: "min" | "max",
): number | null {
  const left = positiveLaneTarget(current);
  const right = positiveLaneTarget(next);
  if (left == null) return right;
  if (right == null) return left;
  return mode === "min" ? Math.min(left, right) : Math.max(left, right);
}

export type MarketplaceSearchOption = {
  label: string;
  count: number;
};

function includesNorm(hay: string, needle: string): boolean {
  if (!needle) return true;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function exactAmong(
  lanes: readonly MarketplaceSearchLane[],
  field: "pickup" | "drop" | "vehicle",
  value: string,
): string | null {
  const n = value.trim().toLowerCase();
  if (!n) return null;
  const hit = lanes.some((lane) => {
    const raw =
      field === "pickup"
        ? lane.pickup_area
        : field === "drop"
          ? lane.drop_location
          : lane.vehicle_type;
    return raw.toLowerCase() === n;
  });
  return hit ? n : null;
}

export function filterMarketplaceOptions(
  lanes: readonly MarketplaceSearchLane[],
  draft: MarketplaceLoadSearch,
  field: "pickup" | "drop" | "vehicle",
  menuQuery = "",
): MarketplaceSearchOption[] {
  const pickupExact = exactAmong(lanes, "pickup", draft.pickup);
  const dropExact = exactAmong(lanes, "drop", draft.drop);
  const counts = new Map<string, { label: string; count: number }>();

  for (const lane of lanes) {
    if (field !== "pickup" && pickupExact && lane.pickup_area.toLowerCase() !== pickupExact) {
      continue;
    }
    if (field === "vehicle" && dropExact && lane.drop_location.toLowerCase() !== dropExact) {
      continue;
    }
    if (field === "drop" && draft.pickup && !pickupExact) continue;
    if (field === "vehicle" && draft.pickup && !pickupExact) continue;
    if (field === "vehicle" && draft.drop && !dropExact) continue;

    const label =
      field === "pickup"
        ? lane.pickup_area
        : field === "drop"
          ? lane.drop_location
          : lane.vehicle_type;
    if (!label || !includesNorm(label, menuQuery)) continue;
    const key = label.toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.count += lane.load_count;
    else counts.set(key, { label, count: lane.load_count });
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function loadMatchesMarketplaceSearch(
  load: {
    pickup_area?: string | null;
    drop_location?: string | null;
    vehicle_type?: string | null;
  },
  search: MarketplaceLoadSearch,
): boolean {
  const n = normalizeMarketplaceSearch(search);
  return (
    includesNorm(load.pickup_area ?? "", n.pickup) &&
    includesNorm(load.drop_location ?? "", n.drop) &&
    includesNorm(load.vehicle_type ?? "", n.vehicleType)
  );
}

export function lanesFromMarketplaceLoads(
  loads: readonly {
    pickup_area?: string | null;
    drop_location?: string | null;
    vehicle_type?: string | null;
    rate_offer?: number | null;
  }[],
): MarketplaceSearchLane[] {
  const counts = new Map<string, MarketplaceSearchLane>();
  for (const load of loads) {
    const pickup_area = (load.pickup_area ?? "").trim();
    const drop_location = (load.drop_location ?? "").trim();
    const vehicle_type = (load.vehicle_type ?? "").trim();
    if (!pickup_area || !drop_location) continue;
    const key = `${pickup_area.toLowerCase()}|${drop_location.toLowerCase()}|${vehicle_type.toLowerCase()}`;
    const prev = counts.get(key);
    if (prev) {
      prev.load_count += 1;
      prev.target_rate_min = combineLaneTarget(prev.target_rate_min, load.rate_offer, "min");
      prev.target_rate_max = combineLaneTarget(prev.target_rate_max, load.rate_offer, "max");
    } else {
      const rate = positiveLaneTarget(load.rate_offer);
      counts.set(key, {
        pickup_area,
        drop_location,
        vehicle_type,
        load_count: 1,
        target_rate_min: rate,
        target_rate_max: rate,
      });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.load_count - a.load_count || a.pickup_area.localeCompare(b.pickup_area),
  );
}

export function isUnsupportedMarketplaceSearchRpc(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    m.includes("pgrst202") ||
    m.includes("42883") ||
    m.includes("list_marketplace_search_lanes") ||
    m.includes("p_pickup") ||
    m.includes("p_offset") ||
    m.includes("p_vehicle_type")
  );
}

export function isMarketplaceLaneSelected(
  lanes: readonly MarketplaceSearchLane[],
  search: Partial<MarketplaceLoadSearch> | null | undefined,
): boolean {
  if (!isMarketplaceSearchReady(search)) return false;
  const n = normalizeMarketplaceSearch(search);
  return lanes.some(
    (lane) =>
      lane.pickup_area.toLowerCase() === n.pickup.toLowerCase() &&
      lane.drop_location.toLowerCase() === n.drop.toLowerCase() &&
      lane.vehicle_type.toLowerCase() === n.vehicleType.toLowerCase(),
  );
}
