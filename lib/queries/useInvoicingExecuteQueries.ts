import type { InvoicePayload } from '@/features/invoicing/services/invoicing.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchClientInvoicePodPolicies } from '@/features/clients/services/clients.service';
import {
  fetchDigitalPodTripIdsForInvoice,
  fetchInvoicingTrips,
  fetchPodReconciliationSummary,
  executeInvoiceCreation,
  type InvoicingTripView,
  type PodReconciliationSummary,
} from '@/features/invoicing/services/invoicing.service';
import {
  fetchDraftInvoicesForOrg,
  fetchIssuedInvoicesForOrg,
} from '@/features/invoicing/services/invoiceList.service';
import { queryKeys } from '@/lib/queryKeys';
import { useMemo } from 'react';

export function useIssuedInvoicesQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.issued(orgId) : ['q', 'invoicing', 'issued', 'none'],
    queryFn: async () => {
      const { error, invoices } = await fetchIssuedInvoicesForOrg(orgId!);
      if (error) throw error;
      return invoices;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function useDraftInvoicesQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.drafts(orgId) : ['q', 'invoicing', 'drafts', 'none'],
    queryFn: async () => {
      const { error, invoices } = await fetchDraftInvoicesForOrg(orgId!);
      if (error) throw error;
      return invoices;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function useInvoicingExecuteTripsQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.trips(orgId) : ['q', 'invoicing', 'trips', 'none'],
    queryFn: async () => {
      const { error, trips } = await fetchInvoicingTrips(orgId!);
      if (error) throw error;
      return trips;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function usePodReconciliationSummaryQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.summary(orgId) : ['q', 'invoicing', 'summary', 'none'],
    queryFn: async () => {
      const { error, summary } = await fetchPodReconciliationSummary(orgId);
      if (error) throw error;
      return summary;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function useInvoiceClientPodPoliciesQuery(
  orgId: string | null,
  clientIds: string[],
) {
  const ids = useMemo(
    () => Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean))).sort(),
    [clientIds],
  );
  const idsKey = ids.join(',');
  return useQuery({
    queryKey:
      orgId && idsKey
        ? queryKeys.invoicing.clientPodPolicies(orgId, idsKey)
        : ['q', 'invoicing', 'client-pod-policies', 'none'],
    queryFn: async () => {
      const { error, policies } = await fetchClientInvoicePodPolicies(orgId!, ids);
      if (error) throw error;
      return policies;
    },
    enabled: Boolean(orgId) && ids.length > 0,
    staleTime: 60_000,
  });
}

/** Persist dehydrates Set as an array; always expose a Set to callers. */
export function asDigitalPodTripIdSet(data: unknown): Set<string> {
  if (data instanceof Set) {
    return data;
  }
  if (Array.isArray(data)) {
    return new Set(
      data.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  }
  return new Set();
}

export function useInvoiceDigitalPodTripIdsQuery(
  orgId: string | null,
  tripIds: string[],
  enabled: boolean,
) {
  const ids = useMemo(
    () => Array.from(new Set(tripIds.map((id) => id.trim()).filter(Boolean))).sort(),
    [tripIds],
  );
  const idsKey = ids.join(',');
  return useQuery({
    queryKey:
      orgId && idsKey
        ? queryKeys.invoicing.digitalPods(orgId, idsKey)
        : ['q', 'invoicing', 'digital-pods', 'none'],
    queryFn: () => fetchDigitalPodTripIdsForInvoice(ids),
    select: asDigitalPodTripIdSet,
    enabled: Boolean(orgId) && enabled && ids.length > 0,
    staleTime: 60_000,
  });
}

export function useExecuteInvoiceMutation(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      internalIds,
      payload,
      requirePod,
    }: {
      internalIds: string[];
      payload?: InvoicePayload;
      requirePod?: boolean;
    }) => {
      const result = await executeInvoiceCreation(
        internalIds,
        payload,
        requirePod === undefined ? undefined : { requirePod },
      );
      if (result.error) throw result.error;
      return result;
    },
    onSuccess: (_result, { internalIds }) => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.trips(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.summary(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.issued(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.drafts(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
      }
      for (const tripId of internalIds) {
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
      }
    },
  });
}

export type { InvoicingTripView, PodReconciliationSummary };
