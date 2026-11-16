import INDIA_LOCATIONS from "@/lib/data/indiaLocations.json";
import type { PoolFieldOption } from "@/features/network/utils/pooledOpportunity.util";

type LocationRow = { city: string; state: string; zone: string };

export type LocationPlace = {
  /** Display text without the state, e.g. "Chennai Warehouse, Chennai". */
  place: string;
  state: string | null;
  region: string | null;
};

export type LocationGroupItem = PoolFieldOption & {
  place: string;
  /** Among the busiest locations in the current list. */
  hot: boolean;
  /**
   * Every pool label shown as this one place ("Delhi" and "Delhi, NCR").
   * `label` is the busiest of them; selecting the item selects all.
   */
  labels: string[];
};

export type LocationGroup = {
  key: string;
  state: string;
  region: string | null;
  total: number;
  items: LocationGroupItem[];
};

export const OTHER_LOCATIONS = "Other locations";

const ZONE_LABEL: Record<string, string> = {
  NORTH: "North",
  SOUTH: "South",
  EAST: "East",
  WEST: "West",
  NORTHEAST: "Northeast",
};

const STATE_ALIASES: Record<string, string> = {
  ncr: "Delhi",
  "delhi ncr": "Delhi",
  "new delhi": "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  "jammu & kashmir": "Jammu and Kashmir",
};

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Karnataka",
  banglore: "Karnataka",
  bengaluru: "Karnataka",
  bombay: "Maharashtra",
  madras: "Tamil Nadu",
  calcutta: "West Bengal",
  gurgaon: "Haryana",
  gurugram: "Haryana",
  noida: "Uttar Pradesh",
};

/** One display name per city, so spellings and old names land on one chip. */
const CITY_CANONICAL: Record<string, string> = {
  bangalore: "Bengaluru",
  banglore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  madras: "Chennai",
  calcutta: "Kolkata",
  gurgaon: "Gurugram",
};

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type Lookup = {
  stateByKey: Map<string, string>;
  zoneByState: Map<string, string | null>;
  stateByCity: Map<string, string | null>;
};

let lookup: Lookup | null = null;

function getLookup(): Lookup {
  if (lookup) return lookup;
  const stateByKey = new Map<string, string>();
  const zoneByState = new Map<string, string | null>();
  const stateByCity = new Map<string, string | null>();
  for (const row of INDIA_LOCATIONS as LocationRow[]) {
    stateByKey.set(norm(row.state), row.state);
    if (!zoneByState.has(row.state)) zoneByState.set(row.state, ZONE_LABEL[row.zone] ?? null);
    const city = norm(row.city);
    const seen = stateByCity.get(city);
    stateByCity.set(city, seen === undefined || seen === row.state ? row.state : null);
  }
  lookup = { stateByKey, zoneByState, stateByCity };
  return lookup;
}

function stateFromText(text: string): string | null {
  const key = norm(text);
  const alias = STATE_ALIASES[key];
  if (alias) return alias;
  return getLookup().stateByKey.get(key) ?? null;
}

function stateFromCity(text: string): string | null {
  const key = norm(text);
  return CITY_ALIASES[key] ?? getLookup().stateByCity.get(key) ?? null;
}

/** "CHennai" → "Chennai", "warehouse" → "Warehouse"; all-caps words like "NCR" stay. */
function tidyPart(part: string): string {
  return part
    .split(/\s+/)
    .map((word) => {
      const letters = word.replace(/[^A-Za-z]/g, "");
      if (letters.length > 1 && letters === letters.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** "Bhandara · Bhandara, Maharashtra · 441904" → "Bhandara, Maharashtra". */
function primaryText(raw: string): string {
  const value = raw.trim();
  if (!value.includes("·")) return value;
  const segments = value.split("·").map((part) => part.trim()).filter(Boolean);
  return segments.find((part) => part.includes(",")) ?? segments[0] ?? "";
}

export function locationPlace(label: string): LocationPlace {
  const primary = primaryText(label);
  const parts = primary
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => norm(part) !== "india");

  let state: string | null = null;
  let stateIndex = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const found = stateFromText(parts[i]);
    if (found) {
      state = found;
      stateIndex = i;
      break;
    }
  }
  if (!state) {
    for (const part of parts) {
      const found = stateFromCity(part);
      if (found) {
        state = found;
        break;
      }
    }
  }

  const seen = new Set<string>();
  const placeParts: string[] = [];
  parts.forEach((part, i) => {
    if (i === stateIndex && parts.length > 1) return;
    const canonical = CITY_CANONICAL[norm(part)];
    const key = norm(canonical ?? part);
    if ([...seen].some((kept) => ` ${kept} `.includes(` ${key} `))) return;
    seen.add(key);
    placeParts.push(canonical ?? tidyPart(part));
  });

  return {
    place: placeParts.join(", ") || tidyPart(primary) || label,
    state,
    region: state ? getLookup().zoneByState.get(state) ?? null : null,
  };
}

/**
 * Groups pickup / drop options by state, busiest state first, with unresolved
 * places last. `query` also matches the state or region name.
 *
 * `mergeSamePlace` folds options that read as one place into one item. Only for
 * pickers that can hold several values: a single-value picker could select just
 * one label, hiding the rest. Unmerged look-alikes show their full label instead.
 */
export function groupLocationOptions(
  options: readonly PoolFieldOption[],
  query = "",
  { mergeSamePlace = true }: { mergeSamePlace?: boolean } = {},
): LocationGroup[] {
  const q = norm(query);
  const resolved = options
    .map((option) => ({ option, ...locationPlace(option.label) }))
    .filter(({ option, state, region, place }) => {
      if (!q) return true;
      return [option.label, place, state ?? "", region ?? ""].some((text) => norm(text).includes(q));
    });

  const groups = new Map<string, LocationGroup>();
  const leadCount = new Map<LocationGroupItem, number>();
  for (const { option, place, state, region } of resolved) {
    const name = state ?? OTHER_LOCATIONS;
    let group = groups.get(name);
    if (!group) {
      group = { key: name, state: name, region: state ? region : null, total: 0, items: [] };
      groups.set(name, group);
    }
    group.total += option.count;
    const same = mergeSamePlace
      ? group.items.find((item) => norm(item.place) === norm(place))
      : undefined;
    if (same) {
      same.labels.push(option.label);
      if (option.count > (leadCount.get(same) ?? 0)) {
        same.label = option.label;
        leadCount.set(same, option.count);
      }
      same.count += option.count;
    } else {
      const item: LocationGroupItem = { ...option, place, hot: false, labels: [option.label] };
      leadCount.set(item, option.count);
      group.items.push(item);
    }
  }

  if (!mergeSamePlace) {
    for (const group of groups.values()) {
      const seen = new Map<string, number>();
      for (const item of group.items) seen.set(norm(item.place), (seen.get(norm(item.place)) ?? 0) + 1);
      for (const item of group.items) {
        if ((seen.get(norm(item.place)) ?? 0) > 1) item.place = tidyPart(primaryText(item.label));
      }
    }
  }

  const items = [...groups.values()].flatMap((group) => group.items);
  const counts = items.map((item) => item.count).sort((a, b) => b - a);
  const hotFloor = Math.max(2, counts[Math.min(2, counts.length - 1)] ?? Infinity);
  for (const item of items) item.hot = item.count >= hotFloor;

  for (const group of groups.values()) {
    group.items.sort((a, b) => b.count - a.count || a.place.localeCompare(b.place));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.state === OTHER_LOCATIONS) return 1;
    if (b.state === OTHER_LOCATIONS) return -1;
    return b.total - a.total || a.state.localeCompare(b.state);
  });
}
