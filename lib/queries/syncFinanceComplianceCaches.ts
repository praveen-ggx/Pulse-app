/**
 * Bidirectional cache sync between Finance Hub / Ledger and Compliance Settlement.
 *
 * Source of truth stays `transactions` (+ trip flags). This only keeps TanStack
 * caches honest so tab counts, advance state, UTR/Paid at, and ledger rows move
 * together without duplicate data models.
 */
import { clearDomainCacheMeta } from "@/lib/cache/cacheMetadataStore";
import { scheduleInvalidation } from "@/lib/platform/moderator";
import { queryKeys } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

/** Finance Hub + Ledger + party Finance Statement observers. */
export function invalidateFinanceLedgerCaches(
  queryClient: QueryClient,
  organizationId: string,
): void {
  void clearDomainCacheMeta("transactions", organizationId);
  // Prefix `transactions.all` also covers byContact / byDriver / totals.
  scheduleInvalidation(queryClient, queryKeys.transactions.all(organizationId));
  scheduleInvalidation(queryClient, queryKeys.transactions.finite(organizationId));
  scheduleInvalidation(queryClient, queryKeys.transactions.totals(organizationId));
  scheduleInvalidation(queryClient, ["q", "transactions", organizationId, "infinite"]);
  scheduleInvalidation(queryClient, ["q", "transactions", organizationId, "contact"]);
  scheduleInvalidation(queryClient, ["q", "finance-pro"]);
}

/**
 * Compliance Settlement pipeline (stage tabs/counts), detail panel, and Advance
 * Processed enrichment. Prefer a tripId so detail invalidation stays surgical.
 */
export function invalidateComplianceSettlementCaches(
  queryClient: QueryClient,
  organizationId: string,
  tripId?: string | null,
): void {
  scheduleInvalidation(queryClient, queryKeys.tripCompliance.pipeline(organizationId));
  scheduleInvalidation(queryClient, ["q", "tripCompliance", "advanceProcessed"]);
  if (tripId) {
    scheduleInvalidation(queryClient, queryKeys.tripCompliance.detail(organizationId, tripId));
    scheduleInvalidation(
      queryClient,
      queryKeys.tripCompliance.advanceFinance(organizationId, tripId),
    );
  } else {
    scheduleInvalidation(queryClient, ["q", "tripCompliance", "detail", "v1", organizationId]);
    scheduleInvalidation(queryClient, ["q", "tripCompliance", "advanceFinance", "v1", organizationId]);
  }
}

/**
 * After a payment / ledger / settlement-relevant write: refresh both sides so
 * Finance Hub, Ledger, and Compliance Settlement stay on the same trip state.
 */
export function syncFinanceComplianceCaches(input: {
  queryClient: QueryClient;
  organizationId: string;
  tripId?: string | null;
  /** When false, only bust Compliance (e.g. Finance write already refreshed ledger). */
  includeFinance?: boolean;
  /** When false, only bust Finance (e.g. Compliance already patched its pipeline). */
  includeCompliance?: boolean;
}): void {
  const includeFinance = input.includeFinance !== false;
  const includeCompliance = input.includeCompliance !== false;
  if (includeFinance) {
    invalidateFinanceLedgerCaches(input.queryClient, input.organizationId);
  }
  if (includeCompliance) {
    invalidateComplianceSettlementCaches(
      input.queryClient,
      input.organizationId,
      input.tripId,
    );
  }
  if (input.tripId) {
    scheduleInvalidation(input.queryClient, queryKeys.trips.detail(input.tripId));
    scheduleInvalidation(input.queryClient, queryKeys.trips.bundle(input.tripId));
  }
  scheduleInvalidation(input.queryClient, queryKeys.trips.finite(input.organizationId));
}
