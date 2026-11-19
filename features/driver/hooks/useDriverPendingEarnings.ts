import { buildDriverTripSettlementView } from '@/features/driver/tripSettlement/driverTripSettlement.util';
import { buildDriverTripNumberMap } from '@/features/driver/utils/driverTripSequence.util';
import {
  buildCompensationSalaryLines,
  buildDriverInviteSalaryLines,
  type DriverInviteSalaryLine,
} from '@/features/drivers/utils/driverInviteOffer.util';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as salaryRequestsService from '@/features/drivers/services/salaryRequests.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { useAuth } from '@/contexts/AuthContext';
import { groupTripsByDateSection } from '@/features/driver/utils/pendingEarningsSections.util';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { showAppAlert } from '@/lib/appAlert';
import { resolveAgreedPayTerms } from '@/features/drivers/utils/driverPayTerms.util';

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

export type PendingEarningsTripItem = {
  trip: tripsService.TripRow;
  displayId: string;
  rawDate: string;
  time: string;
  from: string;
  to: string;
  provider: string;
  amount: number;
  expectedAmount: number;
  statusLabel: string;
  isFleetOwnerTrip: boolean;
  organizationImageUrl: string | null;
  organizationAvatarUrl: string | null;
  organizationAvatarSeed: string | null;
};

export type PendingEarningsEmployerDetail = {
  orgId: string;
  orgName: string;
  salaryLines: DriverInviteSalaryLine[];
};

export type PendingSalaryRequestItem = {
  request: salaryRequestsService.SalaryRequestRow;
  orgName: string;
  rawDate: string;
};

export function useDriverPendingEarnings() {
  const { profile } = useAuth();
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [salaryRequests, setSalaryRequests] = useState<salaryRequestsService.SalaryRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);

    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ])
      .then(([driversRes, invRes]) => {
        const drivers = driversRes.drivers ?? [];
        setLinkedDrivers(drivers);
        setInvites(invRes.invites ?? []);
        if (drivers.length === 0) {
          setTrips([]);
          setLedgerEntries([]);
          setSalaryRequests([]);
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
          return;
        }
        const driverIds = drivers.map((d) => d.id);
        return Promise.all([
          tripsService.getDriverUiTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
          salaryRequestsService.getSalaryRequestsByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes, salaryRes]) => {
          // A failed load used to show ₹0 / no trips. Keep the last good data
          // and tell the driver instead.
          if (tRes.error || ledgerRes.error || salaryRes.error) {
            showAppAlert("Couldn't refresh earnings", 'Check your connection and pull down to try again.');
          } else {
            setTrips(tRes.trips ?? []);
            setLedgerEntries(ledgerRes.entries ?? []);
            setSalaryRequests(salaryRes.requests ?? []);
          }
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
        });
      })
      .catch(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [profile?.uid]);

  // Reload every time the screen is shown — coming back from sending a
  // payment request used to still list those trips as unclaimed.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
  }, [load]);

  const completedTrips = useMemo(() => {
    return trips
      .filter((t) => isCompleted(t.status))
      .sort((a, b) => {
        const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
        return db - da;
      });
  }, [trips]);

  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(trips),
    [trips],
  );

  const receivedByTripId = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const e of ledgerEntries) {
      const tid = e.trip_id?.trim() || null;
      if (tid && e.type === 'settlement') {
        byTrip[tid] = (byTrip[tid] ?? 0) + (Number(e.amount) || 0);
      }
    }
    return byTrip;
  }, [ledgerEntries]);

  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    return linkedDrivers
      .filter((d) => !d.left_at && d.tracking_only !== true)  // exclude phone stubs
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || ''),
        );
        const inviteName =
          (inv as { from_org_name?: string | null } | undefined)?.from_org_name?.trim() ||
          null;
        const dbOrgName =
          (d.organizations as { name?: string } | null | undefined)?.name?.trim() || null;
        return {
          driverId: d.id,
          orgId: d.organization_id,
          orgName: inviteName ?? dbOrgName ?? 'Fleet',
        };
      });
  }, [linkedDrivers, invites]);

  const employerOrgIdSet = useMemo(() => {
    // Pay-arrangement gate: shippers can accept fleet invites for trip tracking
    // but they don't set salary/commission terms.
    const hasPayArrangement = (orgId: string): boolean => {
      if (linkedDrivers.some(
        (d) =>
          String(d.organization_id ?? '') === orgId &&
          (
            (d.payable_amount     != null && Number(d.payable_amount)     > 0) ||
            (d.commission_percent != null && Number(d.commission_percent) > 0) ||
            (d.commission_per_km  != null && Number(d.commission_per_km)  > 0)
          ),
      )) return true;
      return invites.some(
        (i) =>
          String(i.from_organization_id ?? '') === orgId &&
          (i.status || '').toLowerCase() === 'accepted' &&
          (
            (i.payable_amount     != null && Number(i.payable_amount)     > 0) ||
            (i.commission_percent != null && Number(i.commission_percent) > 0) ||
            (i.commission_per_km  != null && Number(i.commission_per_km)  > 0)
          ),
      );
    };

    const set = new Set<string>();
    // Path 1: accepted invite + pay arrangement
    invites
      .filter((i) => (i.status || '').toLowerCase() === 'accepted')
      .forEach((i) => {
        const orgId = String(i.from_organization_id ?? '');
        if (orgId && hasPayArrangement(orgId)) set.add(orgId);
      });
    // Path 2: non-tracking active row + pay arrangement
    linkedDrivers.forEach((d) => {
      if (d.left_at) return;
      if (d.tracking_only === true) return;
      const orgId = String(d.organization_id ?? '');
      if (orgId && hasPayArrangement(orgId)) set.add(orgId);
    });
    return set;
  }, [linkedDrivers, invites]);

  const pendingItems = useMemo((): PendingEarningsTripItem[] => {
    const pendingTrips = completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) === 0);

    return pendingTrips.map((trip) => {
      const isFleetOwnerTrip = employerOrgIdSet.has(String(trip.organization_id ?? ''));
      const fleetOrgName =
        salaryRequestOrgOptions.find(
          (o) =>
            String(o.orgId ?? '') === String(trip.organization_id ?? '') &&
            String(o.driverId ?? '') === String(trip.driver_id ?? ''),
        )?.orgName ??
        salaryRequestOrgOptions.find(
          (o) => String(o.orgId ?? '') === String(trip.organization_id ?? ''),
        )?.orgName ??
        null;

      const provider = isFleetOwnerTrip
        ? (fleetOrgName ?? 'Fleet')
        : (fleetOrgName ?? (trip.client_name?.trim() || 'Direct trip'));

      const acceptedInviteForTripOrg = invites.find(
        (inv) =>
          (inv.status || '').toLowerCase() === 'accepted' &&
          String(inv.from_organization_id ?? '') === String(trip.organization_id ?? ''),
      );
      const inviteForTripOrg =
        acceptedInviteForTripOrg ??
        invites.find(
          (inv) => String(inv.from_organization_id ?? '') === String(trip.organization_id ?? ''),
        ) ??
        null;
      const linkedDriverForTrip = linkedDrivers.find(
        (d) =>
          String(d.organization_id ?? '') === String(trip.organization_id ?? '') &&
          String(d.id ?? '') === String(trip.driver_id ?? ''),
      );
      const payoutTerms = resolveAgreedPayTerms(
        linkedDriverForTrip,
        acceptedInviteForTripOrg ?? null,
      );

      const view = buildDriverTripSettlementView({
        trip,
        ledgerEntries,
        fleetOrgName: provider,
        driverTripNumberById,
        tripCompleted: true,
        payoutTerms,
      });

      const rawDate = trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '';

      return {
        trip,
        displayId: view.displayId,
        rawDate,
        time: rawDate
          ? new Date(rawDate).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : '—',
        from: view.from,
        to: view.to,
        provider,
        // A trip with no agreed payout terms only has a 10% *estimate* — the
        // view does not zero it, so do it here (same as the wallet's gated
        // earnings). Otherwise "Pending earnings" is higher than the wallet.
        amount: view.isEstimated ? 0 : view.amount,
        expectedAmount: view.expectedAmount,
        statusLabel: view.statusLabel || 'To collect',
        isFleetOwnerTrip,
        organizationImageUrl: inviteForTripOrg?.from_org_logo_url ?? null,
        organizationAvatarUrl: inviteForTripOrg?.from_org_avatar_url ?? null,
        organizationAvatarSeed: inviteForTripOrg?.from_org_avatar_seed ?? null,
      };
    });
  }, [
    completedTrips,
    receivedByTripId,
    employerOrgIdSet,
    salaryRequestOrgOptions,
    ledgerEntries,
    driverTripNumberById,
    invites,
    linkedDrivers,
  ]);

  const employerDetails = useMemo((): PendingEarningsEmployerDetail[] => {
    const acceptedByOrg = new Map<string, driversService.DriverInviteRow>();
    invites.forEach((inv) => {
      if ((inv.status || '').toLowerCase() !== 'accepted') return;
      const orgId = String(inv.from_organization_id ?? '');
      if (!orgId) return;
      const prev = acceptedByOrg.get(orgId);
      const prevTs = prev ? new Date(prev.responded_at ?? prev.created_at).getTime() : 0;
      const nextTs = new Date(inv.responded_at ?? inv.created_at).getTime();
      if (!prev || nextTs > prevTs) acceptedByOrg.set(orgId, inv);
    });

    return linkedDrivers
      .filter((d) => !d.left_at)
      .map((d) => {
        const orgId = String(d.organization_id ?? '');
        if (!orgId) return null;
        const invite = acceptedByOrg.get(orgId) ?? null;
        const salaryLines = invite
          ? buildDriverInviteSalaryLines(invite)
          : buildCompensationSalaryLines({
              payableAmount: d.payable_amount ?? null,
              commissionPercent: d.commission_percent ?? null,
              commissionPerKm: d.commission_per_km ?? null,
            });
        if (salaryLines.length === 0) return null;
        const orgName =
          invite?.from_org_name?.trim() ||
          (d.organizations as { name?: string } | null | undefined)?.name?.trim() ||
          'Fleet';
        return { orgId, orgName, salaryLines };
      })
      .filter((row): row is PendingEarningsEmployerDetail => !!row)
      .sort((a, b) => a.orgName.localeCompare(b.orgName));
  }, [invites, linkedDrivers]);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    salaryRequestOrgOptions.forEach((opt) => {
      if (opt.orgId) map.set(String(opt.orgId), opt.orgName);
    });
    employerDetails.forEach((row) => map.set(row.orgId, row.orgName));
    return map;
  }, [employerDetails, salaryRequestOrgOptions]);

  const salaryRequestItems = useMemo((): PendingSalaryRequestItem[] => {
    return salaryRequests.map((request) => ({
      request,
      orgName: orgNameById.get(String(request.organization_id ?? '')) ?? 'Fleet',
      rawDate: request.created_at,
    }));
  }, [orgNameById, salaryRequests]);

  const salaryRequestSections = useMemo(
    () => groupTripsByDateSection(salaryRequestItems),
    [salaryRequestItems],
  );

  const pendingTotal = useMemo(
    () => pendingItems.reduce((sum, item) => sum + item.amount, 0),
    [pendingItems],
  );

  return {
    loading,
    refreshing,
    refresh,
    pendingItems,
    pendingTotal,
    tripCount: pendingItems.length,
    employerDetails,
    salaryRequestItems,
    salaryRequestSections,
    salaryRequestCount: salaryRequestItems.length,
  };
}
