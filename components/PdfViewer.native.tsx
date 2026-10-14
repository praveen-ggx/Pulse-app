import React from "react";
import {
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import Theme from "@/constants/Theme";

interface PdfViewerProps {
  pdfUri: string | null;
  style?: StyleProp<ViewStyle>;
  showToolbar?: boolean;
  zoom?: number;
  sizing?: "original" | "fit";
  page?: number;
  interactive?: boolean;
  scrollbar?: boolean;
}

/**
 * Native PDF preview via WebView (Expo Go–compatible; no react-native-pdf).
 * Supports file:// URIs from expo-print and https:// URLs.
 */
export function PdfViewer({ pdfUri, style }: PdfViewerProps) {
  if (!pdfUri) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  const isHtml =
    pdfUri.trim().startsWith("<") || pdfUri.includes("<!DOCTYPE");

  return (
    <View style={[styles.container, style]}>
      <NativeHtmlWebView
        html={isHtml ? pdfUri : undefined}
        uri={isHtml ? undefined : pdfUri}
        style={styles.pdf}
        startInLoadingState
        docPreview
      />
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
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surface,
  },
});
