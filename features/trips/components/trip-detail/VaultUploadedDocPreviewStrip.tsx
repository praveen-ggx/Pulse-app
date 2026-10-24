import { Theme } from "@/constants/Theme";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import {
  isPdfTripDoc,
  type TripDocFile,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  files: TripDocFile[];
  compact?: boolean;
};

function fileLabel(file: TripDocFile): string {
  return (file.fileName || file.label || "Document").trim();
}

export function VaultUploadedDocPreviewStrip({ files, compact = false }: Props) {
  const paths = useMemo(
    () => [...new Set(files.map((file) => file.storagePath.trim()).filter(Boolean))],
    [files],
  );
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (paths.length === 0) {
      setUrls({});
      setSelectedPath(null);
      return;
    }
    let cancelled = false;
    void getDocumentViewUrls(paths).then((next) => {
      if (cancelled) return;
      setUrls(next);
      setSelectedPath((current) =>
        current && next[current] ? current : paths[0] ?? null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  const selectedFile = files.find((file) => file.storagePath === selectedPath) ?? files[0];
  const selectedUri = selectedFile ? urls[selectedFile.storagePath] : null;
  const selectedIsPdf = selectedFile
    ? isPdfTripDoc({
        type: selectedFile.type,
        fileName: selectedFile.fileName,
        storagePath: selectedFile.storagePath,
      })
    : false;

  if (paths.length === 0) return null;

  const thumbH = compact ? 56 : 64;
  const thumbW = compact ? 42 : 48;
  const sideW = compact ? 88 : 108;
  const sideH = compact ? 118 : 136;

  return (
    <View style={styles.row} accessibilityLabel="Uploaded document previews">
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        {files.map((file) => {
          const uri = urls[file.storagePath];
          const selected = file.storagePath === selectedPath;
          const pdf = isPdfTripDoc({
            type: file.type,
            fileName: file.fileName,
            storagePath: file.storagePath,
          });
          return (
            <Pressable
              key={file.id}
              onPress={() => setSelectedPath(file.storagePath)}
              style={[
                styles.thumb,
                { width: thumbW, height: thumbH },
                selected ? styles.thumbSelected : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${fileLabel(file)}`}
              accessibilityState={{ selected }}
            >
              {uri && !pdf ? (
                <Image
                  source={{ uri }}
                  style={styles.thumbFill}
                  resizeMode="cover"
                  accessibilityLabel={fileLabel(file)}
                />
              ) : (
                <View style={styles.pdfTile}>
                  <View style={styles.pdfTileBar} />
                  <Feather name="file-text" size={compact ? 14 : 16} color={Theme.textSecondary} />
                  <Text style={styles.pdfTileCaption} numberOfLines={1}>
                    PDF
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.side, { width: sideW, height: sideH }]}>
        {selectedUri && !selectedIsPdf ? (
          <TripVaultFilePreview
            uri={selectedUri}
            isPdf={false}
            showToolbar={false}
            sizing="fit"
            style={styles.sideFill}
            accessibilityLabel={selectedFile?.fileName || "Selected document"}
          />
        ) : selectedFile ? (
          <View style={styles.sidePdf}>
            <View style={styles.sidePdfBar} />
            <Feather name="file-text" size={22} color={Theme.textSecondary} />
            <Text style={styles.sidePdfTitle} numberOfLines={2}>
              {fileLabel(selectedFile)}
            </Text>
            <Text style={styles.sidePdfMeta}>Page 1 · PDF</Text>
          </View>
        ) : (
          <View style={styles.sideFill} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 2,
  },
  strip: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  stripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  thumb: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  thumbSelected: {
    borderColor: Theme.primary,
    borderWidth: 2,
  },
  thumbFill: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surface,
  },
  pdfTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    paddingHorizontal: 4,
  },
  pdfTileBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: Theme.brandBlueInk,
  },
  pdfTileCaption: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  side: {
    flexShrink: 0,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  sideFill: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    backgroundColor: Theme.surface,
  },
  sidePdf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surface,
  },
  sidePdfBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: Theme.brandBlueInk,
  },
  sidePdfTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 14,
  },
  sidePdfMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
