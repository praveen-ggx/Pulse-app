/**
 * A7.3 — Driver Home entry point, now a routing decision rather than a
 * direct re-export.
 *
 * Legacy DriverHomeScreen (dispatcher-oriented: Online/Offline via
 * drivers.status, DriverTripFlowCard for an active trip) stays completely
 * unmodified and is still what renders for:
 *   - any driver whose participation isn't DCO-eligible (employed/invited)
 *   - a DCO-eligible driver who currently has an active trip (unavailable)
 *   - a DCO-eligible driver with an incoming assignment / pending OTP claim
 *   - while participation/availability/incoming trips are still loading
 *     (fail safe to Home rather than flash Available over an accept popup)
 *
 * DriverAvailableScreen (new, A7.2-approved) renders only for a DCO-eligible
 * driver who is currently available (is_driver_available() === true) and has
 * no linked assigned-not-started trip and no pending OTP claim.
 *
 * Participation is fetched locally here (not via a shared hook) rather than
 * touching features/reach/screens/DriverStoriesScreen.tsx's own inline
 * fetch of the same data -- Marketplace/Reach discovery code is explicitly
 * out of scope for A7.3.
 */
import { useAuth } from '@/contexts/AuthContext';
import DriverAvailableScreen from '@/features/drivers/screens/DriverAvailableScreen';
import DriverHomeScreen from '@/features/drivers/screens/DriverHomeScreen';
import {
  hasIncomingAssignableTrips,
  shouldShowDriverAvailableSurface,
} from '@/features/driver/utils/driverIncomingAssignment.util';
import { useDriverAvailabilityQuery } from '@/lib/queries/useDriverAvailabilityQuery';
import { useDriverUiTripsQuery } from '@/lib/queries/useDriverUiTripsQuery';
import { usePendingOtpTripsQuery } from '@/lib/queries/usePendingOtpTripsQuery';
import { getDriverFleetMemberships } from '@/features/reach/services/driverReferrals.service';
import {
  isDcoEligibleParticipation,
  resolveDriverParticipation,
  type DriverMembershipLike,
} from '@/features/reach/utils/driverParticipation';
import { useEffect, useMemo, useState } from 'react';

export default function DriverIndexRoute() {
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';

  const [memberships, setMemberships] = useState<DriverMembershipLike[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setMemberships(null);
      return;
    }
    void getDriverFleetMemberships()
      .then(({ memberships: m }) => {
        if (!cancelled) setMemberships(m);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const { available, isLoading: availabilityLoading, isError: availabilityError } =
    useDriverAvailabilityQuery(uid);
  const tripsQuery = useDriverUiTripsQuery(uid || null);
  const pendingOtpQuery = usePendingOtpTripsQuery(uid || null);

  const participationKnown = memberships !== null;
  const isDcoEligible = participationKnown
    ? isDcoEligibleParticipation(resolveDriverParticipation(memberships))
    : false;

  const hasIncomingAssignment = useMemo(() => {
    if (hasIncomingAssignableTrips(tripsQuery.trips)) return true;
    return (pendingOtpQuery.pendingTrips?.length ?? 0) > 0;
  }, [tripsQuery.trips, pendingOtpQuery.pendingTrips]);

  // Trips query stays disabled until linked drivers fetch; treat "no linked
  // drivers yet" as known empty. Pending OTP is known once that query fetches.
  const incomingAssignmentKnown =
    (tripsQuery.linkedFetched || tripsQuery.isFetched || tripsQuery.isError) &&
    (pendingOtpQuery.isFetched || pendingOtpQuery.isError);

  const showAvailableSurface = shouldShowDriverAvailableSurface({
    participationKnown,
    availabilityLoading,
    availabilityError,
    isDcoEligible,
    available,
    hasIncomingAssignment,
    incomingAssignmentKnown,
  });

  return showAvailableSurface ? <DriverAvailableScreen /> : <DriverHomeScreen />;
}
