import { PdfViewer } from "@/components/PdfViewer";
import {
  Image,
  Platform,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  uri: string;
  isPdf: boolean;
  style?: StyleProp<ViewStyle | ImageStyle>;
  accessibilityLabel?: string;
  showToolbar?: boolean;
  /** 1 renders the file at its own pixel size. */
  zoom?: number;
  sizing?: "original" | "fit" | "cover";
  /** 1-based PDF page. Ignored for images. */
  page?: number;
  /** Pass-through to PdfViewer — false when a parent owns drag-pan. */
  interactive?: boolean;
  /** Pass-through to PdfViewer. Omitted keeps the file scrollbar off. */
  scrollbar?: boolean;
  documentKey?: string | null;
  documentVersion?: string | null;
  previewTier?: "thumb" | "full";
  lazy?: boolean;
  priority?: number;
  onRetrySign?: () => void;
};

/** Renders an uploaded vault file: PDF via PdfViewer, images via Image. */
export function TripVaultFilePreview({
  uri,
  isPdf,
  style,
  accessibilityLabel,
  showToolbar = false,
  zoom = 1,
  sizing = "fit",
  page,
  interactive = true,
  scrollbar = false,
  documentKey,
  documentVersion,
  previewTier,
  lazy,
  priority,
  onRetrySign,
}: Props) {
  if (isPdf) {
    return (
      <View style={style as StyleProp<ViewStyle>}>
        <PdfViewer
          pdfUri={uri}
          showToolbar={showToolbar}
          zoom={zoom}
          sizing={sizing}
          page={page}
          interactive={interactive}
          scrollbar={scrollbar}
          documentKey={documentKey}
          documentVersion={documentVersion}
          previewTier={previewTier}
          lazy={lazy}
          priority={priority}
          onRetrySign={onRetrySign}
        />
      </View>
    );
  }

  const resize = sizing === "cover" ? "cover" : "contain";
  return (
    <Image
      source={{ uri }}
      style={[
        style as StyleProp<ImageStyle>,
        Platform.OS === "web" ? ({ objectFit: resize } as ImageStyle) : null,
      ]}
      resizeMode={resize}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
