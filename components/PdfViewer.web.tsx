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
  /** Browser PDF chrome. Off keeps the page itself in the frame. */
  showToolbar?: boolean;
  /** 1 = 100% of the file. The viewer does not fit-to-width on open. */
  zoom?: number;
  /**
   * `original` opens the PDF at that zoom (100% of the page).
   * `fit` scales the page to the frame, which is what the browser does by default.
   */
  sizing?: "original" | "fit";
  /** 1-based page. Omitted leaves the viewer on its default first page. */
  page?: number;
  /**
   * When false, the iframe ignores pointer events so a parent can own drag-pan
   * (needed after CSS rotate — browser PDF coords no longer match the cursor).
   */
  interactive?: boolean;
  /** Side scrollbar on the file. Off when a parent already draws its own rail. */
  scrollbar?: boolean;
}

function withPdfViewerHash(
  uri: string,
  showToolbar: boolean,
  zoom: number,
  sizing: "original" | "fit",
  page?: number,
  scrollbar?: boolean,
): string {
  if (uri.startsWith("data:")) return uri;
  const base = uri.split("#")[0];
  const toolbar = showToolbar ? "1" : "0";
  const percent = Math.max(10, Math.round(zoom * 100));
  // Numeric zoom with a page origin. Fit-to-width is what was opening notes at ~119%.
  const view = sizing === "original" ? `zoom=${percent},0,0` : "view=FitH";
  const pagePart = page && page > 0 ? `&page=${Math.round(page)}` : "";
  const scrollbarFlag = (scrollbar ?? showToolbar) ? "1" : "0";
  return `${base}#toolbar=${toolbar}&navpanes=0&scrollbar=${scrollbarFlag}&${view}${pagePart}`;
}

export function PdfViewer({
  pdfUri,
  style,
  showToolbar = true,
  zoom = 1,
  sizing = "fit",
  page,
  interactive = true,
  scrollbar,
}: PdfViewerProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pdfUri) {
      setSrc(null);
      setLoading(false);
      return;
    }

    // Signed storage URLs render directly; the hash (zoom/page/toolbar) is added
    // at render. Downloading the file into a blob first held the preview on a
    // spinner for the whole transfer, and Chrome drops #zoom/#page on blob: copies.
    setSrc(pdfUri);
    setLoading(false);
  }, [pdfUri]);

  if (!pdfUri) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  if (loading || !src) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <ActivityIndicator size="large" color={Theme.primary} />
        <Text style={styles.message}>Loading preview…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <iframe
        src={withPdfViewerHash(src, showToolbar, zoom, sizing, page, scrollbar)}
        key={`${page ?? 0}-${Math.round(zoom * 100)}`}
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
    minHeight: 140,
    maxHeight: "100%",
    position: "relative",
    backgroundColor: Theme.surface,
    overflow: "hidden",
    zIndex: 0,
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
