import { uploadTripDocument } from '../tripDocuments.service';

const mockFrom = jest.fn();
const mockStorageUpload = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    storage: { from: () => ({ upload: mockStorageUpload }) },
  }),
}));

jest.mock('@/lib/platform/events/InProcessEventBus', () => ({
  getPlatformEventBus: () => ({ publish: mockPublish }),
}));

const file = {
  arrayBuffer: new ArrayBuffer(10),
  fileName: 'pod.jpg',
  mimeType: 'image/jpeg',
};

/**
 * `lookup` backs the post-insert recovery read: on a storage_path conflict
 * (23505) uploadTripDocument re-selects the existing row via
 * .select().eq('storage_path', ...).maybeSingle(). Without eq/maybeSingle here
 * that path throws "eq is not a function" instead of exercising the branch.
 */
function insertBuilder(
  result: { data: unknown; error: unknown },
  lookup: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const builder: Record<string, unknown> = {
    insert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(lookup)),
  };
  return builder;
}

function tripsLookupBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function workflowEventInsertBuilder(
  result: { data: unknown; error: unknown } = { data: { id: 'evt-1' }, error: null },
) {
  const builder: Record<string, unknown> = {
    insert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageUpload.mockResolvedValue({ error: null });
});

describe('uploadTripDocument — PODUploaded event', () => {
  it('publishes exactly one PODUploaded event when a pod document uploads successfully', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_documents') {
        return insertBuilder({
          data: {
            id: 'doc-1',
            trip_id: 'trip-1',
            file_name: 'pod.jpg',
            storage_path: 'trip-1/pod/uuid.jpg',
            mime_type: 'image/jpeg',
            size_bytes: 10,
            uploaded_at: '2026-07-10T12:00:00.000Z',
            uploaded_by: 'user-1',
            document_type: 'pod',
          },
          error: null,
        });
      }
      if (table === 'trips') {
        return tripsLookupBuilder({ data: { organization_id: 'org-1' }, error: null });
      }
      if (table === 'trip_workflow_events') {
        return workflowEventInsertBuilder();
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { doc, error } = await uploadTripDocument('trip-1', 'user-1', file, 'pod');
    expect(error).toBeNull();
    expect(doc).not.toBeNull();

    await flushPromises();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const published = mockPublish.mock.calls[0][0];
    expect(published.name).toBe('PODUploaded');
    expect(published.workspaceId).toBe('org-1');
    expect(published.payload).toEqual({
      tripId: 'trip-1',
      documentId: 'doc-1',
      storagePath: 'trip-1/pod/uuid.jpg',
      fileName: 'pod.jpg',
      uploadedBy: 'user-1',
    });
    expect(typeof published.correlationId).toBe('string');
    expect(published.correlationId.length).toBeGreaterThan(0);
  });

  it('also records a pod.uploaded workflow event alongside the platform event', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_documents') {
        return insertBuilder({
          data: {
            id: 'doc-1',
            trip_id: 'trip-1',
            file_name: 'pod.jpg',
            storage_path: 'trip-1/pod/uuid.jpg',
            mime_type: 'image/jpeg',
            size_bytes: 10,
            uploaded_at: '2026-07-10T12:00:00.000Z',
            uploaded_by: 'user-1',
            document_type: 'pod',
          },
          error: null,
        });
      }
      if (table === 'trips') {
        return tripsLookupBuilder({ data: { organization_id: 'org-1' }, error: null });
      }
      if (table === 'trip_workflow_events') {
        return workflowEventInsertBuilder();
      }
      throw new Error(`unexpected table: ${table}`);
    });

    await uploadTripDocument('trip-1', 'user-1', file, 'pod');
    await flushPromises();

    expect(mockFrom).toHaveBeenCalledWith('trip_workflow_events');
  });

  it('does not publish for a non-pod document type (e.g. manifest)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_documents') {
        return insertBuilder({
          data: {
            id: 'doc-2',
            trip_id: 'trip-1',
            file_name: 'manifest.pdf',
            storage_path: 'trip-1/manifest/uuid.pdf',
            mime_type: 'application/pdf',
            size_bytes: 10,
            uploaded_at: '2026-07-10T12:00:00.000Z',
            uploaded_by: 'user-1',
            document_type: 'manifest',
          },
          error: null,
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { error } = await uploadTripDocument(
      'trip-1',
      'user-1',
      { ...file, fileName: 'manifest.pdf' },
      'manifest',
    );
    expect(error).toBeNull();

    await flushPromises();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when the storage upload fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: { message: 'storage error' } });

    const { doc, error } = await uploadTripDocument('trip-1', 'user-1', file, 'pod');
    expect(error).not.toBeNull();
    expect(doc).toBeNull();

    await flushPromises();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not publish when the metadata insert fails for a reason other than a missing table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_documents') {
        // 23503 (FK violation), not 23505: 23505 is the storage_path conflict that
        // triggers the recovery lookup branch, which is a different case from the
        // plain "insert failed" this test is about.
        return insertBuilder({ data: null, error: { message: 'insert failed', code: '23503' } });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { doc, error } = await uploadTripDocument('trip-1', 'user-1', file, 'pod');
    expect(error).not.toBeNull();
    expect(doc).toBeNull();

    await flushPromises();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('still publishes via the storage-only fallback when the trip_documents table is unavailable', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_documents') {
        return insertBuilder({ data: null, error: { message: 'schema cache', code: 'PGRST205' } });
      }
      if (table === 'trips') {
        return tripsLookupBuilder({ data: { organization_id: 'org-1' }, error: null });
      }
      if (table === 'trip_workflow_events') {
        return workflowEventInsertBuilder();
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { doc, error } = await uploadTripDocument('trip-1', 'user-1', file, 'pod');
    expect(error).toBeNull();
    expect(doc).not.toBeNull();

    await flushPromises();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish.mock.calls[0][0].name).toBe('PODUploaded');
  });
});
