import { clearTripDocumentStorageFallbackCache, getDocumentsByTripId } from '../tripDocuments.service';

/**
 * Focused regression test for the Storage subfolder fan-out bound added to the
 * storage-fallback branch of getDocumentsByTripId (see the 2026-09-16 Trip
 * Document storage-fallback forensic report): the subfolder Promise.all was
 * unbounded (up to KNOWN_SUBFOLDER_TYPES.length concurrent Storage list()
 * calls per invocation); it is now bounded via the same runWithConcurrencyLimit
 * helper already committed for tripDocumentLrPod.service.ts (c621ed9f).
 */

const mockFrom = jest.fn();

let activeSubfolderListCalls = 0;
let maxActiveSubfolderListCalls = 0;
let subfolderListCallCount = 0;

const SIX_SUBFOLDER_TYPES = ['lr', 'pod', 'manifest', 'invoice', 'eway_bill', 'loading_slip'];

const mockStorageList = jest.fn(async (path: string) => {
  if (!path.includes('/')) {
    // Root listing: {tripId}/ — return one folder entry per known subfolder type.
    return {
      data: SIX_SUBFOLDER_TYPES.map((name) => ({ name })),
      error: null,
    };
  }
  // Subfolder listing: {tripId}/{type} — track how many are in flight at once.
  subfolderListCallCount++;
  activeSubfolderListCalls++;
  maxActiveSubfolderListCalls = Math.max(maxActiveSubfolderListCalls, activeSubfolderListCalls);
  await new Promise((resolve) => setTimeout(resolve, 10));
  activeSubfolderListCalls--;
  const type = path.split('/')[1];
  return {
    data: [{ name: `${type}.jpg`, id: `${type}-id`, updated_at: '2026-09-16T00:00:00.000Z' }],
    error: null,
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    storage: {
      from: () => ({ list: mockStorageList }),
    },
  }),
}));

function emptyTableBuilder() {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return builder;
}

beforeEach(() => {
  clearTripDocumentStorageFallbackCache();
  jest.clearAllMocks();
  activeSubfolderListCalls = 0;
  maxActiveSubfolderListCalls = 0;
  subfolderListCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'trip_documents') return emptyTableBuilder();
    throw new Error(`unexpected table: ${table}`);
  });
});

describe('getDocumentsByTripId — storage-fallback subfolder concurrency', () => {
  it('never runs more than 3 subfolder Storage list() calls at once, and still returns one row per subfolder', async () => {
    const { documents, error } = await getDocumentsByTripId('trip-1', {
      includeOcr: false,
      includeStorageFallback: true,
    });

    expect(error).toBeNull();
    expect(subfolderListCallCount).toBe(SIX_SUBFOLDER_TYPES.length);
    expect(maxActiveSubfolderListCalls).toBeLessThanOrEqual(3);
    expect(maxActiveSubfolderListCalls).toBeGreaterThan(0);

    const returnedTypes = documents.map((doc) => doc.document_type).sort();
    expect(returnedTypes).toEqual([...SIX_SUBFOLDER_TYPES].sort());
  });

  it('makes no subfolder list() calls when the root listing has no matching subfolders', async () => {
    mockStorageList.mockImplementationOnce(async () => ({ data: [], error: null }));

    const { documents, error } = await getDocumentsByTripId('trip-2', {
      includeOcr: false,
      includeStorageFallback: true,
    });

    expect(error).toBeNull();
    expect(documents).toEqual([]);
    expect(subfolderListCallCount).toBe(0);
  });

  it("does not list Storage when includeStorageFallback is false (trip-detail mount)", async () => {
    const { documents, error } = await getDocumentsByTripId("trip-3", {
      includeOcr: false,
      includeStorageFallback: false,
    });

    expect(error).toBeNull();
    expect(documents).toEqual([]);
    expect(mockStorageList).not.toHaveBeenCalled();
  });

  it('does not list Storage when the caller omits the fallback', async () => {
    const { documents, error } = await getDocumentsByTripId('trip-4');

    expect(error).toBeNull();
    expect(documents).toEqual([]);
    expect(mockStorageList).not.toHaveBeenCalled();
  });

  it('returns a trip_documents row without listing Storage, even after an empty legacy listing was cached', async () => {
    const tableRow = {
      id: 'doc-1',
      trip_id: 'trip-6',
      file_name: 'lr.jpg',
      storage_path: 'trip-6/lr/lr.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 12,
      uploaded_at: '2026-09-17T00:00:00.000Z',
      uploaded_by: null,
      document_type: 'lr',
    };
    let rows: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'trip_documents') throw new Error(`unexpected table: ${table}`);
      const builder: Record<string, unknown> = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        order: jest.fn(() => Promise.resolve({ data: rows, error: null })),
      };
      return builder;
    });
    mockStorageList.mockImplementationOnce(async () => ({ data: [], error: null }));

    const cachedEmpty = await getDocumentsByTripId('trip-6', {
      includeOcr: false,
      includeStorageFallback: true,
    });
    rows = [tableRow];
    const withTableRow = await getDocumentsByTripId('trip-6', {
      includeOcr: false,
      includeStorageFallback: true,
    });
    const alreadyPresent = await getDocumentsByTripId('trip-7', {
      includeOcr: false,
      includeStorageFallback: true,
    });

    expect(cachedEmpty.documents).toEqual([]);
    expect(withTableRow.documents).toEqual([tableRow]);
    expect(alreadyPresent.documents).toEqual([tableRow]);
    expect(mockStorageList).toHaveBeenCalledTimes(1);
  });

  it('lists a legacy folder once for concurrent callers and again only after the cache expires', async () => {
    const [first, second] = await Promise.all([
      getDocumentsByTripId('trip-5', { includeOcr: false, includeStorageFallback: true }),
      getDocumentsByTripId('trip-5', { includeOcr: false, includeStorageFallback: true }),
    ]);
    const listsAfterPair = mockStorageList.mock.calls.length;

    const third = await getDocumentsByTripId('trip-5', { includeOcr: false, includeStorageFallback: true });

    expect(first.error).toBeNull();
    expect(second.documents).toEqual(first.documents);
    expect(third.documents).toEqual(first.documents);
    expect(listsAfterPair).toBe(1 + SIX_SUBFOLDER_TYPES.length);
    expect(mockStorageList.mock.calls.length).toBe(listsAfterPair);
  });
});
