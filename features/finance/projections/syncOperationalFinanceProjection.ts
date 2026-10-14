import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateLedgerState,
  invalidateOperationalIdentity,
  invalidateReconciliationState,
  invalidateTripOperationalState,
} from "@/lib/queries/operationalInvalidation";
import { invalidateComplianceSettlementCaches } from "@/lib/queries/syncFinanceComplianceCaches";

export function syncOperationalFinanceProjection(input: {
  queryClient: QueryClient;
  organizationId: string;
  tripId: string;
  vehicleId?: string | null;
}) {
  invalidateTripOperationalState({
    queryClient: input.queryClient,
    tripId: input.tripId,
    organizationId: input.organizationId,
  });
  invalidateLedgerState({
    queryClient: input.queryClient,
    organizationId: input.organizationId,
    tripId: input.tripId,
    vehicleId: input.vehicleId,
  });
  invalidateReconciliationState({
    queryClient: input.queryClient,
    organizationId: input.organizationId,
    tripId: input.tripId,
  });
  invalidateOperationalIdentity({
    queryClient: input.queryClient,
    organizationId: input.organizationId,
    tripId: input.tripId,
  });
  // Trip-linked finance writes can move Compliance Settlement stages / tab counts.
  invalidateComplianceSettlementCaches(
    input.queryClient,
    input.organizationId,
    input.tripId,
  );
}
