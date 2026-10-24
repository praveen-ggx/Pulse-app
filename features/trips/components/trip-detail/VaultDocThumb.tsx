/**
 * Tiny document thumb — images as-is, PDFs show cached page 1 (no viewer chrome).
 */
import Theme from "@/constants/Theme";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  uri?: string | null;
  isPdf?: boolean;
  fileName?: string | null;
  style?: StyleProp<ViewStyle>;
  documentKey?: string | null;
  documentVersion?: string | null;
  lazy?: boolean;
  priority?: number;
  onRetrySign?: () => void;
};

export function VaultDocThumb({
  uri,
  isPdf = false,
  fileName,
  style,
  documentKey,
  documentVersion,
  lazy = false,
  priority = 0,
  onRetrySign,
}: Props) {
  if (uri && isPdf) {
    return (
      <View style={[styles.frame, style]} pointerEvents="box-none">
        <TripVaultFilePreview
          uri={uri}
          isPdf
          page={1}
          showToolbar={false}
          interactive={false}
          scrollbar={false}
          sizing="fit"
          previewTier="thumb"
          documentKey={documentKey}
          documentVersion={documentVersion}
          lazy={lazy}
          priority={priority}
          onRetrySign={onRetrySign}
          style={styles.pdf}
          accessibilityLabel={fileName || "PDF page 1"}
        />
      </View>
    );
  }
  if (uri) {
    return (
      <TripVaultFilePreview
        uri={uri}
        isPdf={false}
        style={[styles.frame, style]}
        accessibilityLabel={fileName || "Document"}
      />
    );
  }
  return (
    <View style={[styles.frame, styles.empty, style]}>
      <Feather name="file-text" size={12} color={Theme.actionBtnInk} />
      {onRetrySign ? (
        <Pressable onPress={onRetrySign} accessibilityRole="button" accessibilityLabel="Retry preview">
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  pdf: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    maxHeight: "100%",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  retry: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.actionBtnInk,
  },
});
