/** Predefined hard-copy POD couriers, plus names a user adds on this browser. */

export const HARD_COPY_POD_COURIERS = [
  "BlueDart",
  "DHL",
  "DTDC",
  "Delhivery",
  "FedEx",
  "Ecom Express",
  "Professional Couriers",
  "India Post",
  "Trackon",
  "ST Courier",
  "Franch Express",
  "Sree Mahavir Express",
  "Shree Tirupati",
  "Shree Maruti",
  "Shree Anjani",
  "GMS Worldwide Express",
  "Smart",
  "SkyKing",
  "Shree Nandan",
] as const;

const STORAGE_KEY = "pulse.hardCopyPodCouriers";

function readStorage(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function readExtraHardCopyPodCouriers(): string[] {
  const known = new Set(HARD_COPY_POD_COURIERS.map((name) => name.toLowerCase()));
  const extras: string[] = [];
  for (const name of readStorage()) {
    if (known.has(name.toLowerCase())) continue;
    if (extras.some((item) => item.toLowerCase() === name.toLowerCase())) continue;
    extras.push(name);
  }
  return extras;
}

/** Remember a courier that is not already in the predefined list. Returns the full option list. */
export function rememberHardCopyPodCourier(name: string): string[] {
  const trimmed = name.trim();
  const extras = readExtraHardCopyPodCouriers();
  const known = new Set([
    ...HARD_COPY_POD_COURIERS.map((item) => item.toLowerCase()),
    ...extras.map((item) => item.toLowerCase()),
  ]);
  if (trimmed && !known.has(trimmed.toLowerCase()) && typeof localStorage !== "undefined") {
    extras.push(trimmed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extras));
  }
  return hardCopyPodCourierOptions(trimmed, extras);
}

export function hardCopyPodCourierOptions(current = "", extras = readExtraHardCopyPodCouriers()): string[] {
  const names: string[] = [...HARD_COPY_POD_COURIERS, ...extras];
  const saved = current.trim();
  if (saved && !names.some((name) => name.toLowerCase() === saved.toLowerCase())) {
    names.unshift(saved);
  }
  return names;
}
