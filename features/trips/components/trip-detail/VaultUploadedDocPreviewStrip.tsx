import { Theme } from "@/constants/Theme";
import {
  isPdfTripDoc,
  type TripDocFile,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

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
              <VaultDocThumb
                uri={uri}
                isPdf={pdf}
                fileName={fileLabel(file)}
                sizing="cover"
                style={styles.thumbFill}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.side, { width: sideW, height: sideH }]}>
        <VaultDocThumb
          uri={selectedUri}
          isPdf={selectedIsPdf}
          fileName={selectedFile ? fileLabel(selectedFile) : "Selected document"}
          sizing="cover"
          style={styles.sideFill}
        />
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
});
