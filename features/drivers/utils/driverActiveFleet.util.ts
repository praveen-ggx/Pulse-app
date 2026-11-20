import * as driversService from "@/features/drivers/services/drivers.service";

export type DriverActiveFleet = { orgId: string; name: string };

type LinkedRow = {
  organization_id?: string | null;
  tracking_only?: boolean | null;
  left_at?: string | null;
  relationship_status?: string | null;
  relationship_origin?: string | null;
  organizations?: { name?: string | null } | null;
};

/**
 * The fleet this driver works under right now, or null. Only an
 * `active_employee` row counts; phone/tracking stubs, `independent` roster
 * rows, marketplace awards and left/disconnected rows are not a connection.
 */
export function pickActiveFleet(rows: readonly LinkedRow[]): DriverActiveFleet | null {
  for (const row of rows) {
    const orgId = String(row.organization_id ?? "").trim();
    if (!orgId) continue;
    if (row.tracking_only === true) continue;
    if (row.left_at != null && String(row.left_at).trim() !== "") continue;
    if (String(row.relationship_origin ?? "").trim().toLowerCase() === "market_award") continue;
    // 'independent' means no employer yet (roster/phone row) — not a fleet.
    if (String(row.relationship_status ?? "").trim() !== "active_employee") continue;
    const name = String(row.organizations?.name ?? "").trim() || "My fleet";
    return { orgId, name };
  }
  return null;
}

export async function getMyActiveFleet(
  userId: string | null | undefined,
): Promise<DriverActiveFleet | null> {
  if (!userId) return null;
  const { error, drivers } = await driversService.getLinkedDriversForCurrentUser(userId);
  if (error) return null;
  return pickActiveFleet(drivers as unknown as LinkedRow[]);
}
