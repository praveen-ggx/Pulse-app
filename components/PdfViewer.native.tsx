import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import {
  nativePdfViewerHtml,
  uint8ToBase64,
} from "@/components/mobilePdfPreview.util";
import Theme from "@/constants/Theme";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface PdfViewerProps {
  pdfUri: string | null;
  style?: StyleProp<ViewStyle>;
  showToolbar?: boolean;
  zoom?: number;
  sizing?: "original" | "fit" | "cover";
  page?: number;
  interactive?: boolean;
  scrollbar?: boolean;
  documentKey?: string | null;
  documentVersion?: string | null;
  previewTier?: "thumb" | "full";
  lazy?: boolean;
  priority?: number;
  onRetrySign?: () => void;
}

/**
 * Native PDF preview. WKWebView / Android WebView will not paint a raw
 * application/pdf URI, so the file is fetched and rendered with pdf.js.
 */
export function PdfViewer({ pdfUri, style }: PdfViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pdfUri) {
      setHtml(null);
      setFailed(false);
      return;
    }
    if (pdfUri.trim().startsWith("<") || pdfUri.includes("<!DOCTYPE")) {
      setHtml(pdfUri);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch(pdfUri.split("#")[0]);
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0) throw new Error("empty");
        const next = nativePdfViewerHtml(uint8ToBase64(bytes));
        if (!cancelled) setHtml(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUri]);

  if (!pdfUri) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.message}>Could not open this PDF.</Text>
      </View>
    );
  }

  if (!html) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator color={Theme.textMuted} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <NativeHtmlWebView html={html} style={styles.pdf} startInLoadingState docPreview />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  message: {
    color: Theme.textSecondary,
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surface,
  },
});
