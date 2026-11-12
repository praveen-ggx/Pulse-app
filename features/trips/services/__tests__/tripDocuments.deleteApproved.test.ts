import { deleteTripDocument, type TripDocumentRow } from '../tripDocuments.service';

const mockFrom = jest.fn();
const mockRemove = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    storage: { from: () => ({ remove: mockRemove }) },
  }),
}));

function doc(status: string): TripDocumentRow {
  return {
    id: 'doc-1',
    trip_id: 'trip-1',
    document_type: 'pod',
    file_name: 'pod.jpg',
    storage_path: 'trip-1/pod/pod.jpg',
    status,
  } as unknown as TripDocumentRow;
}

beforeEach(() => jest.clearAllMocks());

describe('deleteTripDocument on an approved document', () => {
  it('refuses without touching the database, storage, or the audit log', async () => {
    const { error } = await deleteTripDocument(doc('verified'));
    expect(error?.message).toBe("Approved documents can't be deleted.");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('does not write a deleted audit row when the database refuses', async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      const builder: Record<string, unknown> = {
        delete: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        select: jest.fn(() =>
          Promise.resolve({ data: null, error: { code: '42501', message: 'locked' } }),
        ),
      };
      return builder;
    });
    const { error } = await deleteTripDocument(doc('pending'));
    expect(error?.message).toBe('locked');
    expect(tables).toEqual(['trip_documents']);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
