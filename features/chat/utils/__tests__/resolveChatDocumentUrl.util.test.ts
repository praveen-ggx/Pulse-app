const mockCreateSignedUrl = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockDownload = jest.fn();
const mockStorageFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    storage: {
      from: (bucket: string) => {
        mockStorageFrom(bucket);
        return {
          createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
          getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
          download: (...args: unknown[]) => mockDownload(...args),
        };
      },
    },
  }),
}));

import {
  resolveChatDocumentStorageUrl,
  resolveChatImageFullDisplayUrl,
  resolveChatImageThumbnail,
  tryChatDocumentBlobObjectUrl,
} from '../resolveChatDocumentUrl.util';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('in-flight request dedup — concurrent calls for the same path share one network call', () => {
  it('resolveChatDocumentStorageUrl: N concurrent calls before the cache is warm fire exactly one createSignedUrl', async () => {
    let resolveSignedUrl: (v: unknown) => void;
    mockCreateSignedUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveSignedUrl = resolve;
      }),
    );

    const path = 'trip_chat/conv-1/img.jpg';
    const calls = [
      resolveChatDocumentStorageUrl(path),
      resolveChatDocumentStorageUrl(path),
      resolveChatDocumentStorageUrl(path),
    ];

    // All three should be in flight against the same unresolved promise before we resolve it.
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);

    resolveSignedUrl!({ data: { signedUrl: 'https://signed.example/img.jpg' }, error: null });
    const results = await Promise.all(calls);

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      'https://signed.example/img.jpg',
      'https://signed.example/img.jpg',
      'https://signed.example/img.jpg',
    ]);
  });

  it('resolveChatImageThumbnail: concurrent calls for the same path share one createSignedUrl call', async () => {
    let resolveSignedUrl: (v: unknown) => void;
    mockCreateSignedUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveSignedUrl = resolve;
      }),
    );

    const path = 'trip_chat/conv-2/img.jpg';
    const calls = [
      resolveChatImageThumbnail(path, 300, 300, 70, 'cover'),
      resolveChatImageThumbnail(path, 300, 300, 70, 'cover'),
    ];

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);

    resolveSignedUrl!({ data: { signedUrl: 'https://signed.example/thumb.jpg' }, error: null });
    const results = await Promise.all(calls);

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['https://signed.example/thumb.jpg', 'https://signed.example/thumb.jpg']);
  });

  it('resolveChatImageThumbnail: every on-screen size collapses to one signed URL per object', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/thumb.jpg' },
      error: null,
    });

    const path = 'trip_chat/conv-3/img.jpg';
    const results = await Promise.all([
      resolveChatImageThumbnail(path, 300, 300, 70, 'cover'),
      resolveChatImageThumbnail(path, 800, 800, 70, 'cover'),
    ]);

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      'https://signed.example/thumb.jpg',
      'https://signed.example/thumb.jpg',
    ]);
  });

  it('never requests an imgproxy transform (403 FeatureNotEnabled on this tenant)', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/thumb.jpg' },
      error: null,
    });

    await resolveChatImageThumbnail('f16/chat/photo.jpg', 300, 300, 70, 'cover');
    await resolveChatImageFullDisplayUrl('f16/lr/receipt.jpg', 1280, 80);

    expect(mockCreateSignedUrl).toHaveBeenCalled();
    for (const args of mockCreateSignedUrl.mock.calls) {
      expect(args[2]).toBeUndefined();
    }
  });

  it('returns null rather than a public URL when signing fails (public URLs 400 on private buckets)', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'denied' } });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://pub.example/storage/v1/object/public/trip-documents/x.jpg' },
    });

    const url = await resolveChatDocumentStorageUrl('f16/chat/never-signed.jpg');

    expect(url).toBeNull();
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('tryChatDocumentBlobObjectUrl: concurrent calls for the same path share one download', async () => {
    let resolveDownload: (v: unknown) => void;
    mockDownload.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    const originalCreateObjectURL = (global as unknown as { URL: typeof URL }).URL?.createObjectURL;
    (URL as unknown as { createObjectURL: (b: unknown) => string }).createObjectURL = () =>
      'blob:mock-url';

    const path = 'trip_chat/conv-4/doc.pdf';
    const calls = [
      tryChatDocumentBlobObjectUrl(path),
      tryChatDocumentBlobObjectUrl(path),
    ];

    // trip_chat/ paths only hit trip-documents (sequential, single bucket).
    expect(mockDownload).toHaveBeenCalledTimes(1);
    resolveDownload!({ data: new Blob(['x']), error: null });
    const results = await Promise.all(calls);

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(results[0]?.url).toBe('blob:mock-url');
    expect(results[1]?.url).toBe('blob:mock-url');
    const revoke = jest.fn();
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = revoke;
    results[0]?.revoke();
    expect(revoke).not.toHaveBeenCalled();
    results[1]?.revoke();
    expect(revoke).toHaveBeenCalledWith('blob:mock-url');

    if (originalCreateObjectURL) {
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = originalCreateObjectURL;
    }
  });

  it('signs trip-documents exactly once for a POD path and never probes documents or pod-documents', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/pod.jpg' },
      error: null,
    });

    const url = await resolveChatDocumentStorageUrl('trip-uuid/pod/file.jpg');

    expect(url).toBe('https://signed.example/pod.jpg');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom.mock.calls.map((call) => call[0])).toEqual([
      'trip-documents',
    ]);
  });
});
