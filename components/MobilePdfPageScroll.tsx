import Theme from "@/constants/Theme";
import {
  previewRequestFromFile,
  probePdfPageCount,
  requestPdfPreview,
} from "@/components/pdfEmbedCache.util";
import { MOBILE_PDF_PAGE_CAP } from "@/components/mobilePdfPreview.util";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * Full PDF preview for mobile web: stacked page rasters. iOS/Chrome will not
 * paint a blob/signed PDF inside an iframe.
 */
export function MobilePdfPageScroll({
  uri,
  page: _page,
  documentKey,
  documentVersion,
  style,
  onRetrySign,
}: {
  uri: string;
  page?: number;
  documentKey?: string | null;
  documentVersion?: string | null;
  style?: StyleProp<ViewStyle>;
  onRetrySign?: () => void;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setFailed(false);
    setPages([]);
    void (async () => {
      try {
        const count = Math.min(await probePdfPageCount(uri, controller.signal), MOBILE_PDF_PAGE_CAP);
        const next: string[] = [];
        for (let index = 1; index <= count; index += 1) {
          if (cancelled) return;
          const request = previewRequestFromFile({
            storagePath: documentKey ?? uri.split("?")[0],
            documentId: documentVersion,
            fileId: documentKey ?? uri.split("?")[0],
            signedUrl: uri,
            page: index,
            tier: "full",
          });
          if (!request) throw new Error("missing document identity");
          next.push(await requestPdfPreview(request, { signal: controller.signal }));
          if (!cancelled) setPages([...next]);
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [documentKey, documentVersion, retry, uri]);

  if (failed) {
    return (
      <View style={[styles.box, styles.centered, style]}>
        <Text style={styles.fallback}>PDF unavailable</Text>
        <Pressable
          onPress={() => {
            setFailed(false);
            setRetry((value) => value + 1);
            onRetrySign?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry document preview"
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.box, style]}
      contentContainerStyle={styles.content}
      accessibilityLabel="PDF preview"
    >
      {pages.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Theme.textMuted} />
        </View>
      ) : (
        pages.map((bitmap, index) => (
          <Image
            key={`${bitmap}-${index}`}
            source={{ uri: bitmap }}
            style={styles.page}
            resizeMode="contain"
            accessibilityLabel={`Page ${index + 1}`}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    width: "100%",
    minHeight: 280,
    backgroundColor: Theme.surface,
  },
  content: {
    paddingBottom: 16,
    gap: 8,
    flexGrow: 1,
  },
  page: {
    width: "100%",
    aspectRatio: 210 / 297,
    backgroundColor: Theme.cardWhite,
  },
  centered: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
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
});
