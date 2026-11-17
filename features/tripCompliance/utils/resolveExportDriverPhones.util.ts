import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { mapWithConcurrency } from "@/features/tripCompliance/utils/mapWithConcurrency.util";

/** Stay under the app's data-fetch cap. The export service passes the same limit. */
export const EXPORT_DRIVER_PHONE_CONCURRENCY = 4;

/**
 * Phones for the export. A failed bulk read stops the report. Gap-fill runs only
 * after that read succeeds, and only for drivers it did not return, a few at a time.
 */
export async function resolveExportDriverPhones(
  summaries: ComplianceTripSummary[],
  orgId: string,
  bulk: { error: Error | null; phoneByDriverId: Map<string, string> },
  loadOne: (driverOrgId: string, driverId: string) => Promise<{ error: Error | null; phone: string }>,
  concurrency = EXPORT_DRIVER_PHONE_CONCURRENCY,
): Promise<Map<string, string>> {
  if (bulk.error) {
    throw new Error(
      `Couldn't load driver phone numbers (${bulk.error.message}). The report was not created.`,
    );
  }
  const phones = new Map(bulk.phoneByDriverId);
  const missing: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const summary of summaries) {
    const driverId = summary.trip.driver_id?.trim() || "";
    if (!driverId || phones.get(driverId) || seen.has(driverId)) continue;
    seen.add(driverId);
    missing.push([driverId, (summary.trip.organization_id ?? orgId).trim() || orgId]);
  }
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrency(missing, concurrency, async ([driverId, driverOrgId]) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const { error, phone } = await loadOne(driverOrgId, driverId);
      if (error) {
        throw new Error(
          `Couldn't load a driver phone number (${error.message}). The report was not created.`,
        );
      }
      const trimmed = phone.trim();
      if (trimmed) phones.set(driverId, trimmed);
    } finally {
      inFlight -= 1;
    }
  });
  if (maxInFlight > concurrency) {
    throw new Error("Driver phone lookup exceeded its concurrency limit.");
  }
  return phones;
}
