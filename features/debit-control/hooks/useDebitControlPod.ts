import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDebitControlBoard,
  fetchTripPodClientValidation,
  markPodInward,
  validateDebitControlPods,
  type AdvanceDocumentCostSource,
  type ValidatePodTripInput,
} from "@/features/debit-control/services/debitControlPod.service";
import type { PodInwardDraft } from "@/features/debit-control/utils/podInwardForm.util";
import { invalidateHardCopyPodCachesForTrips } from "@/lib/queries/invalidateHardCopyPodCaches";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export function useDebitControlBoardQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.debitControl.board(orgId) : ["q", "debit-control", "board", "none"],
    queryFn: async () => {
      const result = await fetchDebitControlBoard(orgId!);
      if (result.error) throw result.error;
      return { pending: result.pending, received: result.received };
    },
    enabled: Boolean(orgId),
    staleTime: STALE.moderate,
  });
}

export function usePodClientValidationQuery(
  orgId: string | null,
  tripId: string | null,
  documentCostSource?: AdvanceDocumentCostSource,
) {
  const sourceOrg = documentCostSource?.organizationId ?? "";
  const sourceRate = documentCostSource?.supplierRate ?? 0;
  const sourceBasis = documentCostSource?.supplierRateBasis ?? "";
  const sourceTons = documentCostSource?.loadTons ?? 0;
  return useQuery({
    queryKey:
      orgId && tripId
        ? ([
            ...queryKeys.debitControl.clientValidation(orgId, tripId),
            "advance-recorded",
            sourceOrg,
            sourceRate,
            sourceBasis,
            sourceTons,
          ] as const)
        : ["q", "debit-control", "client-validation", "none"],
    queryFn: async () => {
      const result = await fetchTripPodClientValidation(orgId!, tripId!);
      if (result.error) throw result.error;
      return result;
    },
    enabled: Boolean(orgId && tripId),
    staleTime: STALE.moderate,
  });
}

export function useMarkPodInwardMutation(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tripIds: string[]; draft: PodInwardDraft }) => markPodInward(input),
    onSuccess: async (result) => {
      if (!orgId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.debitControl.board(orgId) });
      if (result.updatedIds.length > 0) {
        invalidateHardCopyPodCachesForTrips(queryClient, {
          tripIds: result.updatedIds,
          organizationId: orgId,
        });
      }
    },
  });
}

export function useValidatePodsMutation(orgId: string | null, actorId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trips: ValidatePodTripInput[]) =>
      validateDebitControlPods({ orgId: orgId ?? "", actorId, trips }),
    onSuccess: async (result) => {
      if (!orgId) return;
      if (result.updatedIds.length > 0) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.debitControl.board(orgId) });
        await Promise.all(
          result.updatedIds.map((tripId) =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.debitControl.clientValidation(orgId, tripId),
            }),
          ),
        );
      }
    },
  });
}
