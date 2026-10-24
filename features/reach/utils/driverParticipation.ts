/**
 * Boost V2 dual driver participation — derived from the EXISTING organization
 * membership relationship, never a stored driver_type flag. Behavior changes
 * automatically when a driver joins or leaves a fleet, with no extra sync:
 *
 *   employed     → active fleet membership: story CTA is "Recommend to Fleet
 *                  Owner" (reward-eligible; never bids directly).
 *   independent  → no active membership: story CTA is "Bid Now" via the
 *                  existing bid lifecycle. No recommendation reward — they're
 *                  already the bidder.
 *   invited      → membership pending: "Join your fleet to participate"
 *                  (growth loop; transitions to employed automatically).
 */

export type DriverParticipation =
  | { mode: 'employed'; fleetOrgId: string }
  | { mode: 'independent' }
  | { mode: 'invited'; fleetOrgId: string };

export interface DriverMembershipLike {
  organization_id: string;
  status: string;
  role: string;
}

/**
 * `marketplaceDco` is the server-resolved operating mode (get_my_driver_operating_mode
 * → marketplace_allowed). When true the server has already ruled the driver is not
 * employed, so roster memberships (e.g. ADR-010 backfilled `independent` links) must
 * not turn the CTA into Recommend.
 */
export function resolveDriverParticipation(
  memberships: DriverMembershipLike[],
  opts?: { marketplaceDco?: boolean },
): DriverParticipation {
  if (opts?.marketplaceDco) return { mode: 'independent' };
  const driverMemberships = memberships.filter((m) => m.role === 'driver');
  const active = driverMemberships.find((m) => m.status === 'active');
  if (active) return { mode: 'employed', fleetOrgId: active.organization_id };
  const pending = driverMemberships.find((m) => m.status === 'pending' || m.status === 'invited');
  if (pending) return { mode: 'invited', fleetOrgId: pending.organization_id };
  return { mode: 'independent' };
}

/**
 * A7.3 — which participation personas see the DCO Available surface (Home
 * when free of an active trip) instead of the legacy dispatcher-oriented
 * Home. Deliberately a named, single-seam mapping rather than an inline
 * `participation.mode === 'independent'` check scattered across call
 * sites -- if employed/invited semantics ever need DCO availability too,
 * this is the one place that changes.
 *
 * Never conflate this with availability itself: a DCO-eligible driver can
 * still be unavailable (active trip in progress) -- see
 * useDriverAvailabilityQuery / is_driver_available(). This function only
 * answers "which operating experience applies," not "can they bid right now."
 */
export function isDcoEligibleParticipation(participation: DriverParticipation): boolean {
  return participation.mode === 'independent';
}

/** Story CTA copy for a boosted LOAD, per persona. Same story UI — only the
 * call-to-action changes. */
export function driverStoryCta(
  participation: DriverParticipation,
  rewardAmount: number,
): { label: string; badge: string | null } {
  switch (participation.mode) {
    case 'employed':
      return {
        label: 'Recommend to Fleet Owner',
        badge: rewardAmount > 0 ? `Earn ₹${rewardAmount}` : null,
      };
    case 'invited':
      return { label: 'Join your fleet to participate', badge: null };
    default:
      return { label: 'Bid Now', badge: 'Can bid directly' };
  }
}
