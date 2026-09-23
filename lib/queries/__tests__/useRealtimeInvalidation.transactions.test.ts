/**
 * Integration test (real QueryClient, per this repo's existing pattern in
 * features/finance/projections/__tests__/syncOperationalFinanceProjection.integration.test.ts)
 * for applyTransactionRealtimeEvent — the extracted handler behind
 * useRealtimeTransactionsInvalidation. Covers the Commit 2 fix: transactions.finite
 * must be patched correctly for INSERT/UPDATE/DELETE without a full-list refetch,
 * while transactions.infinite/.byContact keep their pre-existing invalidation and
 * transactions.finite/.all are no longer invalidated at all.
 *
 * toLedgerRow/getTripLedgerEmbed (finance.service.ts) are mocked out here — this file
 * tests the cache-patching orchestration this commit added, not toLedgerRow's own
 * (pre-existing, unchanged) field-derivation logic. Mocking also avoids finance.service.ts's
 * unrelated transitive import chain (avatarUpload -> AuthContext -> authEngine ->
 * crashReporter -> @sentry/react-native), which this project's Jest config can't parse.
 */
import { QueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { queryKeys } from '@/lib/queryKeys';
import {
  flushInvalidations,
  __resetInvalidationSchedulerForTests,
} from '@/lib/platform/moderator';
import { applyTransactionRealtimeEvent } from '../useRealtimeInvalidation';

const mockToLedgerRow = jest.fn((row: Record<string, unknown>) => ({ ...row, __transformed: true }));
const mockGetTripLedgerEmbed = jest.fn(async (tripId: string) => ({
  error: null,
  embed: { trip_number: `T-${tripId}`, display_trip_id: null, trip_code: null, trip_operational_code: null },
}));

jest.mock('@/features/finance/services/finance.service', () => ({
  toLedgerRow: (row: Record<string, unknown>) => mockToLedgerRow(row),
  getTripLedgerEmbed: (tripId: string) => mockGetTripLedgerEmbed(tripId),
}));

// applyTransactionRealtimeEvent doesn't use the registry directly (only the
// useRealtimeTransactionsInvalidation wrapper does), but useRealtimeInvalidation.ts
// imports it at module scope, which would otherwise pull in the real lib/supabase.ts
// and its native/AppState side effects (SecureStore, websocket setup) on import.
jest.mock('@/lib/realtimeRegistry', () => ({
  subscribeSharedPostgresChanges: jest.fn(),
}));

const orgId = 'org-1';
const financeKey = queryKeys.transactions.finite(orgId) as unknown as unknown[];

type Row = Record<string, unknown>;

function payload(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: Row | null,
  oldRow: Row | null = null,
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  return {
    eventType,
    new: newRow ?? {},
    old: oldRow ?? {},
    schema: 'public',
    table: 'transactions',
    commit_timestamp: '2026-09-03T00:00:00Z',
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>;
}

function isInvalidated(qc: QueryClient, key: unknown[]): boolean {
  return qc.getQueryState(key)?.isInvalidated === true;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Drop any invalidation window left pending by a previous test.
  __resetInvalidationSchedulerForTests();
});

describe('applyTransactionRealtimeEvent', () => {
  it('DELETE: removes the matching row from the cached list, leaves others untouched', async () => {
    const qc = new QueryClient();
    qc.setQueryData(financeKey, [{ id: 'tx-1' }, { id: 'tx-2' }]);

    await applyTransactionRealtimeEvent(qc, orgId, payload('DELETE', null, { id: 'tx-1' }));

    expect(qc.getQueryData(financeKey)).toEqual([{ id: 'tx-2' }]);
  });

  it('DELETE: no-op when the list is not currently cached (no crash)', async () => {
    const qc = new QueryClient();
    await expect(
      applyTransactionRealtimeEvent(qc, orgId, payload('DELETE', null, { id: 'tx-1' })),
    ).resolves.toBeUndefined();
    expect(qc.getQueryData(financeKey)).toBeUndefined();
  });

  it('INSERT: fetches the trip embed and prepends a fully transformed row', async () => {
    const qc = new QueryClient();
    qc.setQueryData(financeKey, [{ id: 'tx-existing', trip_id: 'trip-9' }]);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('INSERT', { id: 'tx-new', trip_id: 'trip-1', amount_in: 500 }),
    );

    expect(mockGetTripLedgerEmbed).toHaveBeenCalledWith('trip-1');
    expect(mockToLedgerRow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tx-new',
        trip_id: 'trip-1',
        trips: { trip_number: 'T-trip-1', display_trip_id: null, trip_code: null, trip_operational_code: null },
      }),
    );
    const list = qc.getQueryData<Row[]>(financeKey)!;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'tx-new', __transformed: true });
    expect(list[1]).toEqual({ id: 'tx-existing', trip_id: 'trip-9' });
  });

  it('INSERT: no trip_id -> builds the row without fetching an embed', async () => {
    const qc = new QueryClient();
    qc.setQueryData(financeKey, []);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('INSERT', { id: 'tx-cash', trip_id: null }),
    );

    expect(mockGetTripLedgerEmbed).not.toHaveBeenCalled();
    expect(mockToLedgerRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-cash', trips: null }));
  });

  it('INSERT: skips the trip-embed fetch entirely when nothing is watching this org\'s list', async () => {
    const qc = new QueryClient();
    // No setQueryData for financeKey at all -> getQueryData returns undefined.

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('INSERT', { id: 'tx-new', trip_id: 'trip-1' }),
    );

    expect(mockGetTripLedgerEmbed).not.toHaveBeenCalled();
    expect(mockToLedgerRow).not.toHaveBeenCalled();
    expect(qc.getQueryData(financeKey)).toBeUndefined();
  });

  it('UPDATE: trip_id unchanged -> reuses the cached trips embed, no new fetch, replaces in place', async () => {
    const qc = new QueryClient();
    const cachedTrips = { trip_number: 'CACHED-1', display_trip_id: null, trip_code: null, trip_operational_code: null };
    qc.setQueryData(financeKey, [
      { id: 'tx-a', trip_id: 'trip-1', trips: cachedTrips },
      { id: 'tx-b', trip_id: 'trip-2', trips: null },
    ]);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('UPDATE', { id: 'tx-a', trip_id: 'trip-1', amount_in: 999 }),
    );

    expect(mockGetTripLedgerEmbed).not.toHaveBeenCalled();
    expect(mockToLedgerRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-a', trips: cachedTrips }));
    const list = qc.getQueryData<Row[]>(financeKey)!;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'tx-a', __transformed: true });
    expect(list[1]).toEqual({ id: 'tx-b', trip_id: 'trip-2', trips: null }); // untouched, same position
  });

  it('UPDATE: trip_id changed -> fetches the new embed instead of reusing the stale one', async () => {
    const qc = new QueryClient();
    qc.setQueryData(financeKey, [{ id: 'tx-a', trip_id: 'trip-1', trips: { trip_number: 'OLD' } }]);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('UPDATE', { id: 'tx-a', trip_id: 'trip-2' }),
    );

    expect(mockGetTripLedgerEmbed).toHaveBeenCalledWith('trip-2');
  });

  it('UPDATE for a row not currently in the cached page: inserted at the front (matches prior behaviour)', async () => {
    const qc = new QueryClient();
    qc.setQueryData(financeKey, [{ id: 'tx-other', trip_id: null }]);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('UPDATE', { id: 'tx-not-cached', trip_id: null }),
    );

    const list = qc.getQueryData<Row[]>(financeKey)!;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'tx-not-cached' });
  });

  it('always invalidates transactions.infinite and transactions.byContact regardless of event type', async () => {
    const qc = new QueryClient();
    const infiniteKey = queryKeys.transactions.infinite(orgId, 20) as unknown as unknown[];
    const contactKey = queryKeys.transactions.byContact(orgId, 'contact-1') as unknown as unknown[];
    qc.setQueryData(infiniteKey, { pages: [], pageParams: [] });
    qc.setQueryData(contactKey, []);

    await applyTransactionRealtimeEvent(qc, orgId, payload('DELETE', null, { id: 'tx-1' }));
    // These two keys now go through the Moderator's invalidation debouncer, so
    // they land on the next flush rather than synchronously. Same keys, same
    // effect — just batched. @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
    flushInvalidations();

    expect(isInvalidated(qc, infiniteKey)).toBe(true);
    expect(isInvalidated(qc, contactKey)).toBe(true);
  });

  it('never invalidates transactions.finite or transactions.all (the core fix)', async () => {
    const qc = new QueryClient();
    const allKey = queryKeys.transactions.all(orgId) as unknown as unknown[];
    qc.setQueryData(financeKey, [{ id: 'tx-1' }]);
    qc.setQueryData(allKey, [{ id: 'tx-1' }]);

    await applyTransactionRealtimeEvent(
      qc,
      orgId,
      payload('UPDATE', { id: 'tx-1', trip_id: null }),
    );

    expect(isInvalidated(qc, financeKey)).toBe(false);
    expect(isInvalidated(qc, allKey)).toBe(false);
  });
});
