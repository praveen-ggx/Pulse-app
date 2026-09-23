import { loadLrPodIndexByTripIds } from "@/features/trips/services/tripDocumentLrPod.service";

export type InvoiceTripOperationalSeed = {
  internal_id: string;
  id: string;
  client: string;
  client_id?: string | null;
  supplier_name: string;
  driver_name?: string | null;
  lr_number?: string | null;
  from?: string | null;
  to?: string | null;
};

export function displayOperationalField(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "—";
}

export function resolveInvoiceTripLrNumber(args: {
  bookingRef?: string | null;
  documentLrNumbers?: string[] | null;
}): string | null {
  const fromDocs = (args.documentLrNumbers ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (fromDocs.length > 0) return fromDocs[0] ?? null;
  const booking = (args.bookingRef ?? "").trim();
  return booking || null;
}

export function resolveInvoiceTripDriverName(args: {
  displayName?: string | null;
  lookupName?: string | null;
}): string | null {
  const display = (args.displayName ?? "").trim();
  if (display && display.toLowerCase() !== "unknown driver") return display;
  const lookup = (args.lookupName ?? "").trim();
  if (lookup && lookup.toLowerCase() !== "unknown driver") return lookup;
  return null;
}

export function resolveInvoiceTripSupplierName(args: {
  lookupName?: string | null;
}): string | null {
  const lookup = (args.lookupName ?? "").trim();
  if (lookup && lookup.toLowerCase() !== "unknown supplier") return lookup;
  return null;
}

export function invoiceTripOperationalSeedFromView(trip: {
  internal_id: string;
  id: string;
  client: string;
  client_id?: string | null;
  supplier_name: string;
  driver_name?: string | null;
  lr_number?: string | null;
  route?: string | null;
}): InvoiceTripOperationalSeed {
  const [pickup, drop] = (trip.route || "").split(/\s*➔\s*|\s*->\s*|\s*→\s*/);
  return {
    internal_id: trip.internal_id,
    id: trip.id,
    client: trip.client,
    client_id: trip.client_id,
    supplier_name: trip.supplier_name,
    driver_name: trip.driver_name ?? null,
    lr_number: trip.lr_number ?? null,
    from: pickup?.trim() || null,
    to: drop?.trim() || null,
  };
}

/** Bounded LR fill for Log POD only — never the POD tab's full trip list. */
export async function fillMissingInvoiceTripLrNumbers(
  seeds: InvoiceTripOperationalSeed[],
): Promise<InvoiceTripOperationalSeed[]> {
  const missing = seeds.filter((seed) => !(seed.lr_number ?? "").trim());
  if (missing.length === 0) return seeds;
  const index = await loadLrPodIndexByTripIds(
    missing.map((seed) => seed.internal_id),
  );
  return seeds.map((seed) => {
    if ((seed.lr_number ?? "").trim()) return seed;
    const lr = resolveInvoiceTripLrNumber({
      documentLrNumbers: index.get(seed.internal_id)?.lrNumbers ?? [],
    });
    return { ...seed, lr_number: lr };
  });
}
