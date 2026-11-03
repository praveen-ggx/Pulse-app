/**
 * Global vehicle type catalog — the single source of truth for vehicle type
 * selection across the app (category → type/length → passing ton).
 *
 * `vehicle_type` columns store category + size only, e.g. "Open 20 Feet",
 * "LCV Container 32 Feet SXL". The passing ton is not stored in the name — it
 * fills / bounds the load tons (MT) field instead.
 * Use `formatVehicleTypeSelection` / `parseVehicleTypeSelection` to convert.
 */

export type VehicleCategoryKey = "open" | "container" | "lcv" | "trailer" | "tipper" | "tanker" | "bulker" | "reefer" | "car_carrier";
export type LcvSubCategoryKey = "lcv_open" | "lcv_container";

export type VehicleCategory = {
  key: VehicleCategoryKey;
  name: string;
  capacityRange: string;
};

export const VEHICLE_MAIN_CATEGORIES: VehicleCategory[] = [
  { key: "trailer", name: "Trailer", capacityRange: "1 - 100 Ton" },
  { key: "open", name: "Open", capacityRange: "7.5 - 43 Ton" },
  { key: "container", name: "Container", capacityRange: "7 - 26 Ton" },
  { key: "lcv", name: "LCV", capacityRange: "0.75 - 7 Ton" },
  { key: "tipper", name: "Tipper", capacityRange: "5 - 35 Ton" },
  { key: "tanker", name: "Tanker", capacityRange: "5 - 25 Ton" },
  { key: "bulker", name: "Bulker", capacityRange: "15 - 30 Ton" },
  { key: "reefer", name: "Reefer", capacityRange: "2 - 18 Ton" },
  { key: "car_carrier", name: "Car Carrier", capacityRange: "6 - 12 Cars" },
];

export const OPEN_VEHICLE_TYPES = [
  "17 Feet",
  "19 Feet",
  "20 Feet",
  "22 Feet",
  "24 Feet",
  "32 Feet",
  "40 Feet",
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
  "16 Wheeler": ["29-30 Ton", "31-35 Ton"],
  "18 Wheeler": ["36-40 Ton", "41-43 Ton"],
  "32 Feet": ["16-20 Ton", "21-25 Ton"],
  "40 Feet": ["20-24 Ton"],
};

export const CONTAINER_VEHICLE_TYPES = [
  "19 Feet",
  "20 Feet",
  "22 Feet",
  "24 Feet",
  "32 Feet SXL",
  "32 Feet MXL",
  "40 Feet",
  "40 Feet High Cube",
] as const;

export const CONTAINER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "19 Feet": ["7.5-10 Ton"],
  "20 Feet": ["7.5-10 Ton"],
  "22 Feet": ["7.5-10 Ton", "11-15 Ton"],
  "24 Feet": ["7.5-10 Ton", "11-15 Ton"],
  "32 Feet SXL": ["7-9 Ton"],
  "32 Feet MXL": ["15-18 Ton"],
  "40 Feet": ["20-26 Ton"],
  "40 Feet High Cube": ["20-26 Ton"],
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
    passingTonsByLength: {
      "32 Feet SXL": ["7-9 Ton"],
    },
    passingTonOptions: ["3 Ton"],
  },
};

export const TRAILER_VEHICLE_TYPES = [
  "40 Feet Flatbed",
  "High Bed",
  "Semi Low Bed",
  "Low Bed",
  "Hydraulic Modular",
] as const;

export const TRAILER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "40 Feet Flatbed": ["10-24 Ton", "25-35 Ton"],
  "High Bed": ["20-35 Ton"],
  "Semi Low Bed": ["30+ Ton"],
  "Low Bed": ["30+ Ton"],
  "Hydraulic Modular": ["60+ Ton"],
};

export const TIPPER_VEHICLE_TYPES = [
  "Mini Tipper",
  "Medium Tipper",
  "Heavy Tipper",
] as const;

export const TIPPER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "Mini Tipper": ["5-10 Ton"],
  "Medium Tipper": ["14-20 Ton"],
  "Heavy Tipper": ["25-35 Ton"],
};

export const TANKER_VEHICLE_TYPES = [
  "Fuel Tanker",
  "Chemical Tanker",
  "Milk/Water Tanker",
  "Bitumen Tanker",
] as const;

export const TANKER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "Fuel Tanker": ["10-20 Ton"],
  "Chemical Tanker": ["15-25 Ton"],
  "Milk/Water Tanker": ["5-16 Ton"],
  "Bitumen Tanker": ["15-20 Ton"],
};

export const BULKER_VEHICLE_TYPES = [
  "Cement Bulker",
  "Dry Bulker",
] as const;

export const BULKER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "Cement Bulker": ["20-30 Ton"],
  "Dry Bulker": ["15-25 Ton"],
};

export const REEFER_VEHICLE_TYPES = [
  "Small Reefer",
  "Large Reefer",
] as const;

export const REEFER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "Small Reefer": ["2-7 Ton"],
  "Large Reefer": ["10-18 Ton"],
};

export const CAR_CARRIER_VEHICLE_TYPES = [
  "Single Deck",
  "Multi Deck",
] as const;

export const CAR_CARRIER_TYPE_PASSING_TONS: Record<string, string[]> = {
  "Single Deck": ["6-8 Cars"],
  "Multi Deck": ["8-12 Cars"],
};

/** Group label written as the first word(s) of the stored string. */
export type VehicleGroupLabel = "Open" | "Container" | "LCV Open" | "LCV Container" | "Trailer" | "Tipper" | "Tanker" | "Bulker" | "Reefer" | "Car Carrier";

/** What `vehicle_type` stores: category + size only, e.g. "Open 20 Feet". */
export type VehicleTypeSelection = {
  group: VehicleGroupLabel;
  /** Feet / wheeler / truck length. */
  type: string;
};

/** Types offered for a group. */
export function vehicleTypesForGroup(group: VehicleGroupLabel): string[] {
  if (group === "Trailer") return [...TRAILER_VEHICLE_TYPES];
  if (group === "Open") return [...OPEN_VEHICLE_TYPES];
  if (group === "Container") return [...CONTAINER_VEHICLE_TYPES];
  if (group === "LCV Open") return LCV_CATALOG.lcv_open.truckLengths;
  if (group === "LCV Container") return LCV_CATALOG.lcv_container.truckLengths;
  if (group === "Tipper") return [...TIPPER_VEHICLE_TYPES];
  if (group === "Tanker") return [...TANKER_VEHICLE_TYPES];
  if (group === "Bulker") return [...BULKER_VEHICLE_TYPES];
  if (group === "Reefer") return [...REEFER_VEHICLE_TYPES];
  if (group === "Car Carrier") return [...CAR_CARRIER_VEHICLE_TYPES];
  return [];
}

/** Passing ton options valid for a group + type. */
export function passingTonsFor(group: VehicleGroupLabel, type: string | null): string[] {
  if (!type) return [];
  if (group === "Trailer") return TRAILER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Open") return OPEN_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Container") return CONTAINER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "LCV Open") {
    return LCV_CATALOG.lcv_open.passingTonsByLength?.[type] ?? LCV_CATALOG.lcv_open.passingTonOptions;
  }
  if (group === "LCV Container") {
    return (
      LCV_CATALOG.lcv_container.passingTonsByLength?.[type] ??
      LCV_CATALOG.lcv_container.passingTonOptions
    );
  }
  if (group === "Tipper") return TIPPER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Tanker") return TANKER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Bulker") return BULKER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Reefer") return REEFER_TYPE_PASSING_TONS[type] ?? [];
  if (group === "Car Carrier") return CAR_CARRIER_TYPE_PASSING_TONS[type] ?? [];
  return [];
}

export function formatVehicleTypeSelection(sel: VehicleTypeSelection): string {
  return `${sel.group} ${sel.type}`;
}

/**
 * Capacity shown inside the closed vehicle-type field. Not part of the stored
 * name, and not shown on the option tiles.
 */
const SELECTED_FIELD_CAPACITY_MT: Record<string, string> = {
  "Open 40 Feet": "20 MT",
  "Container 32 Feet SXL": "7-9 MT",
  "Container 32 Feet MXL": "15-18 MT",
  "LCV Container 32 Feet SXL": "7-9 MT",
};

/** Stored catalog value plus its MT capacity, for the selected-field label only. */
export function formatSelectedVehicleTypeLabel(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const capacity = SELECTED_FIELD_CAPACITY_MT[raw];
  if (!capacity || raw.endsWith(capacity)) return raw;
  return `${raw} · ${capacity}`;
}

/** Longest group names first so "LCV Open 8 Feet" isn't read as group "Open". */
const GROUPS: VehicleGroupLabel[] = ["LCV Container", "LCV Open", "Car Carrier", "Container", "Trailer", "Tipper", "Tanker", "Bulker", "Reefer", "Open"];

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

/** Numeric bounds of a passing ton label, e.g. "11-15 Ton" → {min: 11, max: 15}, "3 Ton" → {min: 3, max: 3}, "30+ Ton" → {min: 30, max: Infinity}. */
export function passingTonRange(label: string | null | undefined): { min: number; max: number } | null {
  const m = (label ?? "").match(/^\s*([\d.]+)\s*(?:(\+)|-\s*([\d.]+))?\s*Ton\s*$/i);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === "+" ? Infinity : m[3] ? Number(m[3]) : min;
  return Number.isFinite(min) && (Number.isFinite(max) || max === Infinity) ? { min, max } : null;
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
  const effectiveMax = Number.isFinite(range.max) ? range.max : range.min + 20;
  const values = new Set<number>([range.min]);
  for (let t = Math.ceil(range.min); t <= effectiveMax; t += 1) values.add(t);
  if (Number.isFinite(range.max)) values.add(range.max);
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
  if (!Number.isFinite(n) || n <= 0) return null;
  return null;
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
  const inRange = (current ?? "").trim() !== "" && Number.isFinite(n) && n >= range.min && (range.max === Infinity || n <= range.max);
  if (inRange) return null;
  return Number.isFinite(range.max) ? String(range.max) : String(range.min);
}
