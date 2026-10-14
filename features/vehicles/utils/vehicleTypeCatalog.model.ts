/**
 * Global vehicle type catalog — the single source of truth for vehicle type
 * selection across the app (category → type/length → passing ton).
 *
 * `vehicle_type` columns store category + size only, e.g. "Open 20 Feet",
 * "LCV Container 32 Feet SXL". The passing ton is not stored in the name — it
 * fills / bounds the load tons (MT) field instead.
 * Use `formatVehicleTypeSelection` / `parseVehicleTypeSelection` to convert.
 */

export type VehicleCategoryKey = "open" | "container" | "lcv";
export type LcvSubCategoryKey = "lcv_open" | "lcv_container";

export type VehicleCategory = {
  key: VehicleCategoryKey;
  name: string;
  capacityRange: string;
};

export const VEHICLE_MAIN_CATEGORIES: VehicleCategory[] = [
  { key: "open", name: "Open", capacityRange: "7.5 - 43 Ton" },
  { key: "container", name: "Container", capacityRange: "7.5 - 30 Ton" },
  { key: "lcv", name: "LCV", capacityRange: "0.75 - 7 Ton" },
];

export const OPEN_VEHICLE_TYPES = [
  "17 Feet",
  "19 Feet",
  "20 Feet",
  "22 Feet",
  "24 Feet",
  "10 Wheeler",
  "12 Wheeler",
  "14 Wheeler",
  "16 Wheeler",
  "18 Wheeler",
] as const;

export const OPEN_PASSING_TON_OPTIONS = [
  "7-10 Ton",
  "11-15 Ton",
  "16-20 Ton",
  "21-23 Ton",
  "24-25 Ton",
  "26-28 Ton",
  "29-30 Ton",
  "31-35 Ton",
  "36-40 Ton",
  "41-43 Ton",
] as const;

export const OPEN_TYPE_PASSING_TONS: Record<string, string[]> = {
  "17 Feet": ["7-10 Ton"],
  "19 Feet": ["7-10 Ton"],
  "20 Feet": ["7-10 Ton", "11-15 Ton"],
  "22 Feet": ["7-10 Ton", "11-15 Ton"],
  "24 Feet": ["7-10 Ton", "11-15 Ton"],
  "10 Wheeler": ["11-15 Ton", "16-20 Ton"],
  "12 Wheeler": ["16-20 Ton", "21-23 Ton", "24-25 Ton"],
  "14 Wheeler": ["24-25 Ton", "26-28 Ton", "29-30 Ton"],
  "16 Wheeler": ["31-35 Ton"],
  "18 Wheeler": ["36-40 Ton", "41-43 Ton"],
};

export const CONTAINER_VEHICLE_TYPES = [
  "19 Feet",
  "20 Feet",
  "22 Feet",
  "24 Feet",
  "32 Feet SXL",
  "32 Feet MXL",
] as const;

export const CONTAINER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "19 Feet": ["7.5-10 Ton"],
  "20 Feet": ["7.5-10 Ton"],
  "22 Feet": ["7.5-10 Ton", "11-15 Ton"],
  "24 Feet": ["7.5-10 Ton", "11-15 Ton"],
  "32 Feet SXL": ["7.5-10 Ton", "11-15 Ton"],
  "32 Feet MXL": ["16-20 Ton", "21-25 Ton", "26-30 Ton"],
};

export const LCV_SUB_CATEGORIES: { key: LcvSubCategoryKey; name: string }[] = [
  { key: "lcv_open", name: "LCV Open" },
  { key: "lcv_container", name: "LCV Container" },
];

export const LCV_CATALOG: Record<
  LcvSubCategoryKey,
  {
    truckLengths: string[];
    passingTonOptions: string[];
    /** Lengths with their own ton range instead of the shared options. */
    passingTonsByLength?: Record<string, string[]>;
  }
> = {
  lcv_open: {
    truckLengths: ["8 Feet", "10 Feet", "14 Feet", "17 Feet", "19 Feet", "20 Feet", "22 Feet", "24 Feet"],
    passingTonsByLength: {
      "8 Feet": ["0.75-1 Ton"],
      "10 Feet": ["1.5-2 Ton"],
    },
    passingTonOptions: [
      "2.5 Ton",
      "3 Ton",
      "3.5 Ton",
      "4 Ton",
      "4.5 Ton",
      "5 Ton",
      "5.5 Ton",
      "6 Ton",
      "7 Ton",
    ],
  },
  lcv_container: {
    truckLengths: ["14 Feet", "17 Feet", "19 Feet", "20 Feet", "22 Feet", "24 Feet", "32 Feet SXL"],
    passingTonOptions: ["3 Ton"],
  },
};

/** Group label written as the first word(s) of the stored string. */
export type VehicleGroupLabel = "Open" | "Container" | "LCV Open" | "LCV Container";

/** What `vehicle_type` stores: category + size only, e.g. "Open 20 Feet". */
export type VehicleTypeSelection = {
  group: VehicleGroupLabel;
  /** Feet / wheeler / truck length. */
  type: string;
};

/** Types offered for a group. */
export function vehicleTypesForGroup(group: VehicleGroupLabel): string[] {
  if (group === "Open") return [...OPEN_VEHICLE_TYPES];
  if (group === "Container") return [...CONTAINER_VEHICLE_TYPES];
  if (group === "LCV Open") return LCV_CATALOG.lcv_open.truckLengths;
  if (group === "LCV Container") return LCV_CATALOG.lcv_container.truckLengths;
  return [];
}

/** Passing ton options valid for a group + type. */
export function passingTonsFor(group: VehicleGroupLabel, type: string | null): string[] {
  if (!type) return [];
  if (group === "Open") return OPEN_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Container") return CONTAINER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "LCV Open") {
    return LCV_CATALOG.lcv_open.passingTonsByLength?.[type] ?? LCV_CATALOG.lcv_open.passingTonOptions;
  }
  if (group === "LCV Container") return LCV_CATALOG.lcv_container.passingTonOptions;
  return [];
}

export function formatVehicleTypeSelection(sel: VehicleTypeSelection): string {
  return `${sel.group} ${sel.type}`;
}

/** Longest group names first so "LCV Open 8 Feet" isn't read as group "Open". */
const GROUPS: VehicleGroupLabel[] = ["LCV Container", "LCV Open", "Container", "Open"];

/** Parse a stored value; returns null for legacy/free-text values not in the catalog. */
export function parseVehicleTypeSelection(
  value: string | null | undefined,
): VehicleTypeSelection | null {
  // Drop an early-format " · <ton>" suffix ("Open · 20 Feet · 7-10 Ton").
  const raw = (value ?? "").split(" · ").slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const group = GROUPS.find((g) => raw === g || raw.startsWith(`${g} `));
  if (!group) return null;
  const type = raw.slice(group.length).trim();
  return vehicleTypesForGroup(group).includes(type) ? { group, type } : null;
}

/** Numeric bounds of a passing ton label, e.g. "11-15 Ton" → {min: 11, max: 15}, "3 Ton" → {min: 3, max: 3}. */
export function passingTonRange(label: string | null | undefined): { min: number; max: number } | null {
  const m = (label ?? "").match(/^\s*([\d.]+)\s*(?:-\s*([\d.]+))?\s*Ton\s*$/i);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/** Full load range of a catalog vehicle type: lowest to highest of its passing tons. */
export function vehicleTonRange(
  vehicleType: string | null | undefined,
): { min: number; max: number } | null {
  const sel = parseVehicleTypeSelection(vehicleType);
  if (!sel) return null;
  const ranges = passingTonsFor(sel.group, sel.type)
    .map(passingTonRange)
    .filter((r): r is { min: number; max: number } => r != null);
  if (ranges.length === 0) return null;
  return {
    min: Math.min(...ranges.map((r) => r.min)),
    max: Math.max(...ranges.map((r) => r.max)),
  };
}

/** Passing ton of a vehicle type that contains `tons` (first match), for preselecting the picker. */
export function passingTonForTons(
  sel: VehicleTypeSelection,
  tons: string | null | undefined,
): string | null {
  const n = Number((tons ?? "").trim());
  if (!(tons ?? "").trim() || !Number.isFinite(n)) return null;
  return (
    passingTonsFor(sel.group, sel.type).find((label) => {
      const r = passingTonRange(label);
      return r != null && n >= r.min && n <= r.max;
    }) ?? null
  );
}

/** Load-weight suggestions inside a passing ton range: the bounds plus whole tons between. */
export function tonSuggestionsForRange(range: { min: number; max: number }): string[] {
  const values = new Set<number>([range.min]);
  for (let t = Math.ceil(range.min); t <= range.max; t += 1) values.add(t);
  values.add(range.max);
  return [...values].sort((a, b) => a - b).map((v) => String(v));
}

/** The vehicle's load range when `tons` falls outside it, else null. */
export function tonsOutsideVehicleRange(
  vehicleType: string | null | undefined,
  tons: string | null | undefined,
): { min: number; max: number } | null {
  const raw = (tons ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const range = vehicleTonRange(vehicleType);
  return range && (n < range.min || n > range.max) ? range : null;
}

/**
 * Capacity to apply after a passing ton pick: the range max when `current` is
 * empty or outside the range, else null (keep the user's value). Accepts "10",
 * "10T", "10 TON".
 */
export function capacityForPassingTon(
  passingTon: string | null | undefined,
  current: string | null | undefined,
): string | null {
  const range = passingTonRange(passingTon);
  if (!range) return null;
  const n = Number((current ?? "").replace(/\s*(t|ton|tons)\s*$/i, "").trim());
  const inRange = (current ?? "").trim() !== "" && Number.isFinite(n) && n >= range.min && n <= range.max;
  return inRange ? null : String(range.max);
}
