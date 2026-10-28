/**
 * PDF page-1 rasters for vault embeds. Source PDFs stay in storage.
 * Cache identity is storage path + document version, not the signed URL.
 */

import {
  createDocumentPreviewPipeline,
  documentPreviewIdentity,
  PREVIEW_EDGE,
  type DocumentPreviewRequest,
  type PreviewTier,
} from "@/components/documentPreviewPipeline.util";

const PDFJS_VER = "3.11.174";
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
const JPEG_QUALITY = 0.72;

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: {
    url: string;
    withCredentials?: boolean;
    disableAutoFetch?: boolean;
    disableStream?: boolean;
  }) => {
    promise: Promise<{
      numPages: number;
      getPage: (page: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void>; cancel: () => void };
      }>;
      destroy: () => Promise<void>;
    }>;
  };
};

export type PdfPreviewRequest = DocumentPreviewRequest & {
  signedUrl: string;
};

let pdfjsLoading: Promise<PdfJsLib> | null = null;
const signedUrlByKey = new Map<string, string>();

function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF embed is web-only"));
  }
  const existing = (window as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib;
  if (existing) return Promise.resolve(existing);
  if (pdfjsLoading) return pdfjsLoading;
  pdfjsLoading = new Promise((resolve, reject) => {
    const finish = () => {
      const lib = (window as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib;
      if (!lib) {
        reject(new Error("pdf.js failed to load"));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(lib);
    };
    if (document.querySelector(`script[data-pulse-pdfjs="${PDFJS_VER}"]`)) {
      finish();
      return;
    }
    const script = document.createElement("script");
    script.src = PDFJS_SRC;
    script.async = true;
    script.dataset.pulsePdfjs = PDFJS_VER;
    script.onload = finish;
    script.onerror = () => reject(new Error("pdf.js failed to load"));
    document.head.appendChild(script);
  });
  return pdfjsLoading;
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
          return;
        }
        try {
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (error) {
          reject(error);
        }
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function disposePreviewUrl(url: string): void {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

const pipeline = createDocumentPreviewPipeline<string>({
  concurrency: 2,
  maxEntries: 40,
  dispose: disposePreviewUrl,
  async render(request, ctx) {
    const cacheKey = `${request.documentKey}|${request.version}|${request.page ?? 1}|${request.tier}`;
    const signedUrl = signedUrlByKey.get(cacheKey);
    if (!signedUrl) throw new Error("missing signed url");
    if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error("cancelled");
    const pdfjs = await loadPdfJs();
    if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error("cancelled");
    const doc = await pdfjs.getDocument({
      url: signedUrl.split("#")[0],
      withCredentials: false,
      disableAutoFetch: true,
      disableStream: false,
    }).promise;
    try {
      if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error("cancelled");
      const index = Math.min(Math.max(1, Math.round(request.page ?? 1)), doc.numPages);
      const pdfPage = await doc.getPage(index);
      const edge = PREVIEW_EDGE[request.tier];
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(edge / base.width, edge / base.height);
      const viewport = pdfPage.getViewport({ scale: Math.max(0.2, Math.min(scale, 2)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      return canvasToUrl(canvas);
    } finally {
      void doc.destroy();
    }
  },
});

export function previewRequestFromFile(input: {
  storagePath?: string | null;
  documentId?: string | null;
  fileId?: string | null;
  signedUrl: string;
  page?: number;
  tier: PreviewTier;
}): PdfPreviewRequest | null {
  const identity = documentPreviewIdentity(input);
  if (!identity) return null;
  return {
    ...identity,
    signedUrl: input.signedUrl,
    page: input.page ?? 1,
    tier: input.tier,
  };
}

export function peekPdfPreview(request: DocumentPreviewRequest): string | null {
  return pipeline.peek(request);
}

export function requestPdfPreview(
  request: PdfPreviewRequest,
  options?: { signal?: AbortSignal; priority?: number },
): Promise<string> {
  const cacheKey = `${request.documentKey}|${request.version}|${request.page ?? 1}|${request.tier}`;
  signedUrlByKey.set(cacheKey, request.signedUrl);
  return pipeline.get(request, options);
}

export function invalidatePdfPreview(documentKey: string): void {
  pipeline.invalidateDocument(documentKey);
  const prefix = `${documentKey.trim()}|`;
  for (const key of [...signedUrlByKey.keys()]) {
    if (key.startsWith(prefix)) signedUrlByKey.delete(key);
  }
}

export function pdfPreviewStats() {
  return pipeline.stats();
}

export function resetPdfPreviewStats(): void {
  pipeline.resetStats();
}

/** @deprecated identity is storage path + version; kept for old tests */
export function pdfEmbedCacheKey(uri: string, page: number, edge: number): string {
  const identity = documentPreviewIdentity({ storagePath: uri.split("#")[0], fileId: uri });
  const tier: PreviewTier = edge >= 1000 ? "full" : "thumb";
  return `${identity?.documentKey ?? uri}|${identity?.version ?? "0"}|${page}|${tier}`;
}

export function previewEdgeForBox(width: number, height: number): number {
  return Math.max(width, height) >= 280 ? PREVIEW_EDGE.full : PREVIEW_EDGE.thumb;
}

export function peekPdfEmbedBitmap(uri: string, page: number, edge: number): string | null {
  const identity = documentPreviewIdentity({ storagePath: uri.split("?")[0], fileId: uri });
  if (!identity) return null;
  return peekPdfPreview({
    ...identity,
    page,
    tier: edge >= 1000 ? "full" : "thumb",
  });
}

export async function probePdfPageCount(
  uri: string,
  signal?: AbortSignal,
): Promise<number> {
  const pdfjs = await loadPdfJs();
  if (signal?.aborted) throw signal.reason ?? new Error("cancelled");
  const doc = await pdfjs.getDocument({
    url: uri.split("#")[0],
    withCredentials: false,
    disableAutoFetch: true,
    disableStream: false,
  }).promise;
  try {
    return Math.max(1, doc.numPages);
  } finally {
    void doc.destroy();
  }
}

export async function rasterizePdfPage(uri: string, page: number, edge: number): Promise<string> {
  const identity = documentPreviewIdentity({ storagePath: uri.split("?")[0], fileId: uri });
  if (!identity) throw new Error("missing document identity");
  return requestPdfPreview({
    ...identity,
    signedUrl: uri,
    page,
    tier: edge >= 1000 ? "full" : "thumb",
  });
}
