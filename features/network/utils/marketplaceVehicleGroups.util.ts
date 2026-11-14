import type { LocationGroup } from "@/features/network/utils/marketplaceLocationGroups.util";
import type { PoolFieldOption } from "@/features/network/utils/pooledOpportunity.util";

type VehicleCategory = { key: string; title: string; tag: string };

/** Display order of the vehicle picker sections. */
const CATEGORIES: VehicleCategory[] = [
  { key: "light", title: "Light trucks", tag: "LCV" },
  { key: "medium", title: "Medium trucks", tag: "ICV" },
  { key: "heavy", title: "Heavy trucks", tag: "HCV" },
  { key: "multiAxle", title: "Multi-axle", tag: "MXL · SXL" },
  { key: "container", title: "Containers", tag: "Closed body" },
  { key: "open", title: "Open body", tag: "Open" },
  { key: "trailer", title: "Trailers", tag: "Long haul" },
  { key: "other", title: "Other vehicles", tag: "" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export type VehicleSize = { feet: number | null; tonnes: number | null; wheels: number | null };

function firstNumber(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : null;
}

export function vehicleSize(label: string): VehicleSize {
  const text = label.toLowerCase();
  return {
    feet: firstNumber(text, /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')/),
    tonnes: firstNumber(text, /(\d+(?:\.\d+)?)\s*(?:mt|tons?|tonnes?)\b/),
    wheels: firstNumber(text, /(\d+)\s*-?\s*wheel/),
  };
}

/** Body type wins over size; size decides light / medium / heavy. */
export function vehicleCategoryKey(label: string): string {
  const text = label.toLowerCase();
  if (/container|closed|\bcbt\b|\bbox\b/.test(text)) return "container";
  if (/trailer|flat\s*bed|low\s*bed|semi/.test(text)) return "trailer";
  if (/\bmxl\b|\bsxl\b|multi[\s-]*axle/.test(text)) return "multiAxle";
  if (/\bopen\b|tipper|dumper/.test(text)) return "open";
  const { feet, tonnes, wheels } = vehicleSize(label);
  if (feet == null && tonnes == null && wheels == null) return "other";
  if ((feet != null && feet <= 14) || (tonnes != null && tonnes <= 5) || (wheels != null && wheels <= 4)) {
    return "light";
  }
  if ((feet != null && feet <= 22) || (tonnes != null && tonnes <= 12) || (wheels != null && wheels <= 10)) {
    return "medium";
  }
  return "heavy";
}

function sizeRank(label: string): number {
  const { feet, tonnes, wheels } = vehicleSize(label);
  return feet ?? (tonnes != null ? tonnes * 2 : wheels != null ? wheels * 2 : Number.MAX_SAFE_INTEGER);
}

/**
 * Groups vehicle options into categories in a fixed, size-ascending order.
 * `query` also matches the category title and tag.
 */
export function groupVehicleOptions(
  options: readonly PoolFieldOption[],
  query = "",
): LocationGroup[] {
  const q = query.trim().toLowerCase();
  const rows = options
    .map((option) => ({ option, category: BY_KEY.get(vehicleCategoryKey(option.label))! }))
    .filter(({ option, category }) =>
      !q || [option.label, category.title, category.tag].some((t) => t.toLowerCase().includes(q)),
    );

  const counts = rows.map(({ option }) => option.count).sort((a, b) => b - a);
  const hotFloor = Math.max(2, counts[Math.min(2, counts.length - 1)] ?? Infinity);

  const groups = new Map<string, LocationGroup>();
  for (const { option, category } of rows) {
    let group = groups.get(category.key);
    if (!group) {
      group = { key: category.key, state: category.title, region: category.tag || null, total: 0, items: [] };
      groups.set(category.key, group);
    }
    group.total += option.count;
    group.items.push({
      ...option,
      place: option.label,
      hot: option.count >= hotFloor,
      labels: [option.label],
    });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => sizeRank(a.label) - sizeRank(b.label) || a.label.localeCompare(b.label));
  }
  return CATEGORIES.map((c) => groups.get(c.key)).filter((g): g is LocationGroup => Boolean(g));
}
