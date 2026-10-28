/**
 * Last hub ticket opened from the Trips list.
 * Survives the mobile remount when trip/indent detail is pushed on top.
 */

export type LastOpenedHubTripFilter = "Active" | "History";

export type LastOpenedHubItem = {
  id: string;
  tripFilter?: LastOpenedHubTripFilter;
  metricTab?: string;
  historyMetricTab?: string | null;
};

const STORAGE_KEY = "pulse.lastOpenedHubItem";

let memory: LastOpenedHubItem | null = null;

function storage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    if (!("sessionStorage" in globalThis)) return null;
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

function persist(item: LastOpenedHubItem | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (!item) store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, JSON.stringify(item));
  } catch {
    /* private mode / quota */
  }
}

function readPersisted(): LastOpenedHubItem | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastOpenedHubItem;
    const id = typeof parsed?.id === "string" ? parsed.id.trim() : "";
    if (!id) return null;
    return {
      id,
      tripFilter:
        parsed.tripFilter === "History" || parsed.tripFilter === "Active"
          ? parsed.tripFilter
          : undefined,
      metricTab:
        typeof parsed.metricTab === "string" && parsed.metricTab.trim()
          ? parsed.metricTab.trim()
          : undefined,
      historyMetricTab:
        parsed.historyMetricTab === null
          ? null
          : typeof parsed.historyMetricTab === "string"
            ? parsed.historyMetricTab
            : undefined,
    };
  } catch {
    return null;
  }
}

export function setLastOpenedHubItem(
  item: LastOpenedHubItem | string | null | undefined,
): void {
  if (item == null || item === "") {
    memory = null;
    persist(null);
    return;
  }
  const incoming =
    typeof item === "string"
      ? { id: item.trim() }
      : { ...item, id: (item.id ?? "").trim() };
  if (!incoming.id) return;
  memory = memory ? { ...memory, ...incoming, id: incoming.id } : incoming;
  persist(memory);
}

export function getLastOpenedHubItem(): LastOpenedHubItem | null {
  if (memory?.id) return memory;
  const stored = readPersisted();
  if (stored) memory = stored;
  return memory;
}

export function getLastOpenedHubItemId(): string | null {
  return getLastOpenedHubItem()?.id ?? null;
}
