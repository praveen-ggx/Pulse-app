import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  executeLogIncomingPods,
  fetchCourierPartners,
  fetchOrgDriversForLogPods,
  fetchOrgSuppliersForLogPods,
  fetchTripsForLogPods,
  ensureCustomCourierPartner,
  markSelectedTripsHardCopyPodReceived,
  type CourierPartnerRow,
  type LogPodsPayload,
  type LogPodsTripView,
  type MarkHardCopyPodsReceivedInput,
} from '@/features/log-pods/services/logPods.service';
import { queryKeys } from '@/lib/queryKeys';
import { syncHardCopyPodRecord } from '@/lib/queries/invalidateHardCopyPodCaches';
import { STALE } from '@/lib/queryClient';

export function useLogIncomingPodsTripsQuery(
  orgId: string | null,
  options?: { includeReceived?: boolean },
) {
  const includeReceived = Boolean(options?.includeReceived);
  return useQuery({
    queryKey: orgId
      ? includeReceived
        ? queryKeys.logPods.tripsIncludingReceived(orgId)
        : queryKeys.logPods.trips(orgId)
      : ['q', 'log-pods', 'trips', 'none'],
    queryFn: async () => {
      const { error, trips } = await fetchTripsForLogPods(orgId!, {
        includeReceived,
      });
      if (error) throw error;
      return trips;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useLogIncomingPodsSuppliersQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.logPods.suppliers(orgId)
      : ['q', 'log-pods', 'suppliers', 'none'],
    queryFn: async () => {
      const { error, suppliers } = await fetchOrgSuppliersForLogPods(orgId!);
      if (error) throw error;
      return suppliers;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
  });
}

export function useLogIncomingPodsDriversQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.logPods.drivers(orgId)
      : ['q', 'log-pods', 'drivers', 'none'],
    queryFn: async () => {
      const { error, drivers } = await fetchOrgDriversForLogPods(orgId!);
      if (error) throw error;
      return drivers;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
  });
}

export function useCourierPartnersQuery() {
  return useQuery({
    queryKey: queryKeys.logPods.courierPartners(),
    queryFn: async () => {
      const { error, partners } = await fetchCourierPartners();
      if (error) throw error;
      return partners;
    },
    staleTime: STALE.slow,
  });
}

export function useAddCourierPartnerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customName: string) => {
      const result = await ensureCustomCourierPartner('custom', customName);
      if (result.error) throw result.error;
      return result.partner;
    },
    onSuccess: (newPartner) => {
      if (newPartner) {
        queryClient.setQueryData(
          queryKeys.logPods.courierPartners(),
          (old: CourierPartnerRow[] | undefined) => {
            if (!old) return [newPartner];
            if (old.some(p => p.value === newPartner.value)) return old;
            return [...old, newPartner];
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.logPods.courierPartners() });
    },
  });
}

export function useLogIncomingPodsMutation(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LogPodsPayload) => {
      const result = await executeLogIncomingPods(payload);
      if (result.error) throw result.error;
      return result;
    },
    onSuccess: (_result, payload) => {
      const affectedTripIds = Object.keys(payload.selectedLRs).filter(
        (id) => payload.selectedLRs[id].length > 0,
      );
      void Promise.all(
        affectedTripIds.map((tripId) =>
          syncHardCopyPodRecord(queryClient, {
            tripId,
            organizationId: orgId,
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.logPods.courierPartners() });
    },
  });
}

export function useMarkHardCopyPodsReceivedMutation(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkHardCopyPodsReceivedInput) => {
      const result = await markSelectedTripsHardCopyPodReceived(input);
      if (result.error) throw result.error;
      return result;
    },
    onSuccess: (_result, input) => {
      void Promise.all(
        input.tripInternalIds.map((tripId) =>
          syncHardCopyPodRecord(queryClient, {
            tripId,
            organizationId: orgId,
          }),
        ),
      );
    },
  });
}

export type { LogPodsTripView };
