import Theme from "@/constants/Theme";
import { previewTierForBox, type PreviewTier } from "@/components/documentPreviewPipeline.util";
import {
  peekPdfPreview,
  previewRequestFromFile,
  requestPdfPreview,
} from "@/components/pdfEmbedCache.util";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

interface PdfViewerProps {
  pdfUri: string | null;
  style?: StyleProp<ViewStyle>;
  /** Native browser PDF chrome (zoom/print). Full-page preview only. */
  showToolbar?: boolean;
  /** 1 = 100% of the file. The viewer does not fit-to-width on open. */
  zoom?: number;
  /**
   * `original` opens the PDF at that zoom (100% of the page).
   * `fit` letterboxes the page in the frame.
   * `cover` fills the frame (card thumbs).
   */
  sizing?: "original" | "fit" | "cover";
  /** 1-based page. Omitted leaves the viewer on its default first page. */
  page?: number;
  /**
   * When false, the iframe ignores pointer events so a parent can own drag-pan
   * (needed after CSS rotate — browser PDF coords no longer match the cursor).
   */
  interactive?: boolean;
  /** Side scrollbar on the file. Off when a parent already draws its own rail. */
  scrollbar?: boolean;
  documentKey?: string | null;
  documentVersion?: string | null;
  previewTier?: PreviewTier;
  lazy?: boolean;
  priority?: number;
  onRetrySign?: () => void;
}

function withPdfViewerHash(
  uri: string,
  showToolbar: boolean,
  zoom: number,
  sizing: "original" | "fit" | "cover",
  page?: number,
  scrollbar?: boolean,
): string {
  if (uri.startsWith("data:")) return uri;
  const base = uri.split("#")[0];
  const toolbar = showToolbar ? "1" : "0";
  const percent = Math.max(10, Math.round(zoom * 100));
  const view = sizing === "original" ? `zoom=${percent},0,0` : "view=FitH";
  const pagePart = page && page > 0 ? `&page=${Math.round(page)}` : "";
  const scrollbarFlag = (scrollbar ?? showToolbar) ? "1" : "0";
  return `${base}#toolbar=${toolbar}&navpanes=0&scrollbar=${scrollbarFlag}&${view}${pagePart}`;
}

/** Cached first-page JPEG — no Safari/Chrome PDF plugin on vault thumbs. */
function PdfEmbedPage({
  uri,
  page = 1,
  style,
  sizing = "fit",
  documentKey,
  documentVersion,
  previewTier,
  lazy = false,
  priority = 0,
  onRetrySign,
}: {
  uri: string;
  page?: number;
  style?: StyleProp<ViewStyle>;
  sizing?: "fit" | "cover";
  documentKey?: string | null;
  documentVersion?: string | null;
  previewTier?: PreviewTier;
  lazy?: boolean;
  priority?: number;
  onRetrySign?: () => void;
}) {
  const boxRef = useRef<View>(null);
  const onRetrySignRef = useRef(onRetrySign);
  onRetrySignRef.current = onRetrySign;
  const retriedSignKey = useRef<string | null>(null);
  const [visible, setVisible] = useState(!lazy);
  const [tier, setTier] = useState<PreviewTier>(previewTier ?? "thumb");
  const [retry, setRetry] = useState(0);
  const request = useMemo(
    () =>
      previewRequestFromFile({
        storagePath: documentKey ?? uri.split("?")[0],
        documentId: documentVersion,
        fileId: documentKey ?? uri.split("?")[0],
        signedUrl: uri,
        page,
        tier,
      }),
    [documentKey, documentVersion, page, tier, uri],
  );
  const [bitmap, setBitmap] = useState<string | null>(() =>
    request ? peekPdfPreview(request) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (previewTier) {
      setTier(previewTier);
      return;
    }
    const node = boxRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setTier(previewTierForBox(box.width || 160, box.height || 160));
  }, [previewTier]);

  useEffect(() => {
    if (!lazy) {
      setVisible(true);
      return;
    }
    const node = boxRef.current as unknown as HTMLElement | null;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!visible || !request) return;
    const cached = peekPdfPreview(request);
    if (cached) {
      setBitmap(cached);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setFailed(false);
    void requestPdfPreview(request, { signal: controller.signal, priority })
      .then((url) => setBitmap(url))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setFailed(true);
        if (error instanceof Error && /401|403|expired/i.test(error.message)) {
          const key = request.documentKey || request.signedUrl || "";
          if (retriedSignKey.current !== key) {
            retriedSignKey.current = key;
            onRetrySignRef.current?.();
          }
        }
      });
    return () => controller.abort();
  }, [priority, request, retry, visible]);

  if (failed) {
    return (
      <View style={[styles.container, styles.centered, styles.embed, style]}>
        <Text style={styles.embedFallback}>PDF unavailable</Text>
        <Pressable
          onPress={() => {
            setFailed(false);
            setRetry((value) => value + 1);
            onRetrySign?.();
          }}
          accessibilityRole="none"
          accessibilityLabel="Retry document preview"
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      ref={boxRef}
      style={[styles.container, styles.embed, style]}
      accessibilityLabel="PDF page preview"
    >
      {bitmap ? (
        <Image
          source={{ uri: bitmap }}
          style={[
            styles.bitmap,
            { objectFit: sizing === "cover" ? "cover" : "contain" } as never,
          ]}
          resizeMode={sizing === "cover" ? "cover" : "contain"}
        />
      ) : (
        <View style={styles.skeleton} accessibilityLabel="Loading document preview">
          <ActivityIndicator color={Theme.textMuted} size="small" />
        </View>
      )}
    </View>
  );
}

export function PdfViewer({
  pdfUri,
  style,
  showToolbar = false,
  zoom = 1,
  sizing = "fit",
  page,
  interactive = true,
  scrollbar,
  documentKey,
  documentVersion,
  previewTier,
  lazy,
  priority,
  onRetrySign,
}: PdfViewerProps) {
  if (!pdfUri) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  // Raster thumbs stay on PdfEmbedPage. A reading preview (vault full viewer,
  // Compliance DocumentScreen) must use a live iframe so the wheel/scrollbar
  // can move through pages. `showToolbar={false}` only hides Chrome chrome —
  // it must not collapse the file to a single JPEG.
  const useBitmapPage =
    !showToolbar && previewTier !== "full" && !scrollbar;

  if (useBitmapPage) {
    return (
      <PdfEmbedPage
        uri={pdfUri}
        page={page ?? 1}
        style={style}
        sizing={sizing === "cover" ? "cover" : "fit"}
        documentKey={documentKey}
        documentVersion={documentVersion}
        previewTier={previewTier}
        lazy={lazy}
        priority={priority}
        onRetrySign={onRetrySign}
      />
    );
  }

  return (
    <View style={[styles.container, style]}>
      <iframe
        src={withPdfViewerHash(pdfUri, showToolbar, zoom, sizing, page, scrollbar ?? true)}
        key={`${page ?? 0}-${Math.round(zoom * 100)}-${showToolbar ? "chrome" : "read"}`}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          border: "none",
          background: Theme.surface,
          overflow: "hidden",
          pointerEvents: interactive ? "auto" : "none",
        }}
        title="PDF Preview"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    minHeight: 0,
    maxHeight: "100%",
    position: "relative",
    backgroundColor: Theme.surface,
    overflow: "hidden",
    zIndex: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  embed: {
    minHeight: 0,
  },
  bitmap: {
    width: "100%",
    height: "100%",
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  retry: {
    marginTop: 8,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  retryText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.actionBtnInk,
  },
  embedFallback: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    marginTop: 10,
    color: Theme.textSecondary,
    fontSize: 16,
    textAlign: "center",
  },
});
