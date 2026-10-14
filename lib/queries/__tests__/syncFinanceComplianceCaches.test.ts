import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  flushInvalidations,
  __resetInvalidationSchedulerForTests,
} from "@/lib/platform/moderator";
import {
  invalidateComplianceSettlementCaches,
  invalidateFinanceLedgerCaches,
  syncFinanceComplianceCaches,
} from "../syncFinanceComplianceCaches";

jest.mock("@/lib/cache/cacheMetadataStore", () => ({
  clearDomainCacheMeta: jest.fn(() => Promise.resolve()),
}));

const orgId = "org-sync";
const tripId = "trip-1";

function isInvalidated(qc: QueryClient, key: readonly unknown[]): boolean {
  return qc.getQueryState(key as unknown[])?.isInvalidated === true;
}

beforeEach(() => {
  __resetInvalidationSchedulerForTests();
});

describe("syncFinanceComplianceCaches", () => {
  it("invalidates Finance ledger list keys", async () => {
    const qc = new QueryClient();
    const contactId = "party-1";
    qc.setQueryData(queryKeys.transactions.finite(orgId), []);
    qc.setQueryData(queryKeys.transactions.all(orgId), []);
    qc.setQueryData(queryKeys.transactions.byContact(orgId, contactId), []);
    invalidateFinanceLedgerCaches(qc, orgId);
    await flushInvalidations();
    expect(isInvalidated(qc, queryKeys.transactions.finite(orgId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.transactions.all(orgId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.transactions.byContact(orgId, contactId))).toBe(true);
  });

  it("invalidates Compliance pipeline + trip detail", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.tripCompliance.pipeline(orgId), []);
    qc.setQueryData(queryKeys.tripCompliance.detail(orgId, tripId), null);
    qc.setQueryData(queryKeys.tripCompliance.advanceFinance(orgId, tripId), null);
    invalidateComplianceSettlementCaches(qc, orgId, tripId);
    await flushInvalidations();
    expect(isInvalidated(qc, queryKeys.tripCompliance.pipeline(orgId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.tripCompliance.detail(orgId, tripId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.tripCompliance.advanceFinance(orgId, tripId))).toBe(true);
  });

  it("syncs both directions for a trip-linked payment", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.transactions.finite(orgId), []);
    qc.setQueryData(queryKeys.tripCompliance.pipeline(orgId), []);
    qc.setQueryData(queryKeys.trips.detail(tripId), { id: tripId });
    syncFinanceComplianceCaches({ queryClient: qc, organizationId: orgId, tripId });
    await flushInvalidations();
    expect(isInvalidated(qc, queryKeys.transactions.finite(orgId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.tripCompliance.pipeline(orgId))).toBe(true);
    expect(isInvalidated(qc, queryKeys.trips.detail(tripId))).toBe(true);
  });

  it("can skip one side when the caller already refreshed it", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.transactions.finite(orgId), []);
    qc.setQueryData(queryKeys.tripCompliance.pipeline(orgId), []);
    syncFinanceComplianceCaches({
      queryClient: qc,
      organizationId: orgId,
      tripId,
      includeFinance: false,
    });
    await flushInvalidations();
    expect(isInvalidated(qc, queryKeys.transactions.finite(orgId))).toBe(false);
    expect(isInvalidated(qc, queryKeys.tripCompliance.pipeline(orgId))).toBe(true);
  });
});
