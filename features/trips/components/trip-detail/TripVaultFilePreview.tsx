import { PdfViewer } from "@/components/PdfViewer";
import {
  Image,
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
  sizing?: "original" | "fit";
  /** 1-based PDF page. Ignored for images. */
  page?: number;
  /** Pass-through to PdfViewer — false when a parent owns drag-pan. */
  interactive?: boolean;
  /** Pass-through to PdfViewer. Omitted keeps the file scrollbar off. */
  scrollbar?: boolean;
};

/** Renders an uploaded vault file: PDF via PdfViewer, images via Image. */
export function TripVaultFilePreview({
  uri,
  isPdf,
  style,
  accessibilityLabel,
  showToolbar = true,
  zoom = 1,
  sizing = "fit",
  page,
  interactive = true,
  scrollbar = false,
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
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style as StyleProp<ImageStyle>}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
