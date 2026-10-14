import { Theme } from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  HARD_COPY_POD_PHOTO_TYPES,
  hardCopyPodPhotoRejectionMessage,
  isHardCopyPodPhoto,
  shortHardCopyPodPhotoName,
} from "@/features/trips/components/trip-detail/hardCopyPodPhotos.util";
import { adjacentZoom, clampZoom, panForZoom } from "@/features/trips/components/trip-detail/podPreviewZoom.util";
import { VAULT_DOC_MAX_BYTES, VAULT_DOC_MAX_MB } from "@/features/trips/components/trip-detail/tripDocTypes";
import {
  deleteTripDocument,
  getDocumentsByTripId,
  getDocumentViewUrls,
  uploadTripDocument,
  type TripDocumentRow,
} from "@/features/trips/services/tripDocuments.service";
import { PdfViewer } from "@/components/PdfViewer";
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, Upload, X } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PodPhotoItem = {
  key: string;
  fileName: string;
  previewUri: string | null;
  document: TripDocumentRow | null;
  uploading: boolean;
};

async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as const,
  });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

function fileIsPdf(name: string, mimeType?: string | null): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  return mime.includes("pdf") || name.toLowerCase().endsWith(".pdf");
}

function isPodPreviewDocument(doc: TripDocumentRow): boolean {
  if (doc.document_type !== "pod") return false;
  if (fileIsPdf(doc.file_name, doc.mime_type)) return true;
  return isHardCopyPodPhoto({ name: doc.file_name, mimeType: doc.mime_type });
}

export function HardCopyPodPhotoUpload({
  tripId,
  canEdit,
  variant = "embed",
}: {
  tripId: string;
  canEdit: boolean;
  variant?: "embed" | "pane";
}) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PodPhotoItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PodPhotoItem | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const droppedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const { documents } = await getDocumentsByTripId(tripId, {
        includeOcr: false,
        includeStorageFallback: true,
      });
      if (cancelled) return;
      const images = documents.filter(isPodPreviewDocument).slice().reverse();
      const urls = await getDocumentViewUrls(images.map((doc) => doc.storage_path));
      if (cancelled) return;
      setPhotos((current) => {
        const saved: PodPhotoItem[] = images.map((doc) => ({
          key: doc.id,
          fileName: doc.file_name,
          previewUri: urls[doc.storage_path] ?? null,
          document: doc,
          uploading: false,
        }));
        const savedIds = new Set(saved.map((item) => item.key));
        const pending = current.filter(
          (item) => item.uploading || (item.document != null && !savedIds.has(item.document.id)),
        );
        return [...saved, ...pending.filter((item) => !savedIds.has(item.key))];
      });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const uploadOne = useCallback(
    async (key: string, uri: string, fileName: string, mimeType: string) => {
      const uploaderId = user?.uid;
      if (!uploaderId) {
        setPhotos((current) => current.filter((item) => item.key !== key));
        setValidationMessage("Sign in to upload POD photos.");
        return;
      }
      try {
        const arrayBuffer = await readFileAsArrayBuffer(uri);
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          setPhotos((current) => current.filter((item) => item.key !== key));
          setValidationMessage(`Could not read ${fileName}.`);
          return;
        }
        if (arrayBuffer.byteLength > VAULT_DOC_MAX_BYTES) {
          setPhotos((current) => current.filter((item) => item.key !== key));
          setValidationMessage(
            `${fileName} exceeds ${VAULT_DOC_MAX_MB} MB. Each photo must be ${VAULT_DOC_MAX_MB} MB or smaller.`,
          );
          return;
        }
        const { doc, error } = await uploadTripDocument(
          tripId,
          uploaderId,
          { arrayBuffer, fileName, mimeType },
          "pod",
        );
        if (droppedRef.current.has(key)) {
          if (doc) await deleteTripDocument(doc);
          return;
        }
        if (error || !doc) {
          setPhotos((current) => current.filter((item) => item.key !== key));
          setValidationMessage(error?.message || `Could not upload ${fileName}.`);
          return;
        }
        const signed = await getDocumentViewUrls([doc.storage_path]);
        setActiveKey((current) => (current === key ? doc.id : current));
        setPhotos((current) =>
          current.map((item) =>
            item.key === key
              ? {
                  ...item,
                  key: doc.id,
                  fileName: doc.file_name || fileName,
                  previewUri: signed[doc.storage_path] || item.previewUri,
                  document: doc,
                  uploading: false,
                }
              : item,
          ),
        );
      } catch (err) {
        if (droppedRef.current.has(key)) return;
        setPhotos((current) => current.filter((item) => item.key !== key));
        setValidationMessage(err instanceof Error ? err.message : `Could not upload ${fileName}.`);
      }
    },
    [tripId, user?.uid],
  );

  const pickPhotos = useCallback(async () => {
    if (!canEdit) return;
    setValidationMessage(null);
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: [...HARD_COPY_POD_PHOTO_TYPES],
    });
    if (res.canceled || !res.assets?.length) return;

    const rejection = hardCopyPodPhotoRejectionMessage(res.assets);
    const accepted = res.assets.filter(
      (asset) =>
        isHardCopyPodPhoto(asset) &&
        !(typeof asset.size === "number" && asset.size > VAULT_DOC_MAX_BYTES),
    );
    if (rejection) setValidationMessage(rejection);
    if (accepted.length === 0) return;

    const batch = accepted.map((asset, index) => ({
      key: `local-${Date.now()}-${index}-${asset.name ?? "pod"}`,
      fileName: asset.name?.trim() || `pod-${index + 1}.jpg`,
      previewUri: asset.uri,
      mimeType: asset.mimeType || "image/jpeg",
      uri: asset.uri,
    }));

    setActiveKey(batch[0]?.key ?? null);
    setPhotos((current) => [
      ...current,
      ...batch.map((item) => ({
        key: item.key,
        fileName: item.fileName,
        previewUri: item.previewUri,
        document: null,
        uploading: true,
      })),
    ]);

    for (const item of batch) {
      void uploadOne(item.key, item.uri, item.fileName, item.mimeType);
    }
  }, [canEdit, uploadOne]);

  const removePhoto = useCallback(async (item: PodPhotoItem) => {
    droppedRef.current.add(item.key);
    if (item.document) droppedRef.current.add(item.document.id);
    setPhotos((current) => current.filter((photo) => photo.key !== item.key));
    setPreview((current) => (current?.key === item.key ? null : current));
    if (!item.document) return;
    const { error } = await deleteTripDocument(item.document);
    if (error) {
      Alert.alert("Could not remove photo", error.message);
      setPhotos((current) =>
        current.some((photo) => photo.key === item.key) ? current : [...current, item],
      );
    }
  }, []);

  const active = photos.find((item) => item.key === activeKey) ?? photos[0] ?? null;

  if (variant === "pane") {
    return (
      <View style={styles.pane}>
        <Text style={styles.label}>Uploaded POD</Text>
        {canEdit ? (
          <Pressable
            style={styles.paneUpload}
            onPress={() => void pickPhotos()}
            accessibilityRole="button"
            accessibilityLabel="Upload POD"
          >
            <Upload size={14} color={Theme.textPrimaryDark} />
            <Text style={styles.paneUploadText}>Upload POD</Text>
          </Pressable>
        ) : null}
        <View style={styles.paneStage}>
          {!loaded && photos.length === 0 ? (
            <ActivityIndicator color={Theme.analyticsHeroBg} />
          ) : active?.previewUri && fileIsPdf(active.fileName, active.document?.mime_type) ? (
            <Pressable
              style={styles.paneFile}
              onPress={() => setPreview(active)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Preview ${active.fileName}`}
            >
              <PdfViewer pdfUri={active.previewUri} style={styles.paneFile} />
            </Pressable>
          ) : active?.previewUri ? (
            <Pressable
              style={styles.paneFile}
              onPress={() => setPreview(active)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Preview ${active.fileName}`}
            >
              <Image
                source={{ uri: active.previewUri }}
                style={styles.paneImage}
                resizeMode="contain"
                accessibilityLabel={active.fileName}
              />
            </Pressable>
          ) : (
            <Text style={styles.paneEmpty}>Uploaded POD image will show here</Text>
          )}
          {active?.uploading ? (
            <View style={styles.paneBusy}>
              <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
            </View>
          ) : null}
          {canEdit && active && !active.uploading ? (
            <Pressable
              style={styles.paneRemove}
              onPress={() => void removePhoto(active)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${active.fileName}`}
            >
              <X size={12} color={Theme.textPrimaryDark} />
            </Pressable>
          ) : null}
        </View>
        {active ? (
          <Text style={styles.fileName} numberOfLines={1}>
            {shortHardCopyPodPhotoName(active.fileName)}
          </Text>
        ) : null}
        {photos.length > 1 ? (
          <View style={styles.paneThumbs}>
            {photos.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setActiveKey(item.key)}
                style={[styles.paneThumb, item.key === active?.key && styles.paneThumbOn]}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Show ${item.fileName}`}
                accessibilityState={{ selected: item.key === active?.key }}
              >
                {item.previewUri && !fileIsPdf(item.fileName, item.document?.mime_type) ? (
                  <Image source={{ uri: item.previewUri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={styles.pdfThumb}>
                    <Text style={styles.pdfThumbText}>PDF</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
        {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}
        <PodFilePreview item={preview} onClose={() => setPreview(null)} />
      </View>
    );
  }

  if (!canEdit && !loaded) return null;
  if (!canEdit && photos.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Upload POD</Text>

      {canEdit ? (
        <Pressable
          style={styles.uploadCard}
          onPress={() => void pickPhotos()}
          accessibilityRole="button"
          accessibilityLabel="Upload POD"
          accessibilityHint="Upload one or more photos of the physical POD"
        >
          <Upload size={18} color={Theme.textPrimaryDark} />
          <Text style={styles.uploadTitle} numberOfLines={1}>
            Upload POD
          </Text>
        </Pressable>
      ) : null}
      <Text style={styles.helper}>Upload one or more photos of the physical POD</Text>

      {photos.length > 0 ? (
        <View style={styles.uploadedBlock}>
          <Text style={styles.uploadedLabel}>Uploaded PODs</Text>
          <View style={styles.grid}>
            {photos.map((item) => (
              <View key={item.key} style={styles.tile}>
                <Pressable
                  onPress={() => {
                    if (item.previewUri) setPreview(item);
                  }}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Preview ${item.fileName}`}
                  style={styles.thumbPress}
                >
                  {fileIsPdf(item.fileName, item.document?.mime_type) ? (
                    <View style={styles.pdfThumb}>
                      <Text style={styles.pdfThumbText}>PDF</Text>
                    </View>
                  ) : item.previewUri ? (
                    <Image source={{ uri: item.previewUri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbFallback} />
                  )}
                  {item.uploading ? (
                    <View style={styles.uploadingBadge}>
                      <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
                    </View>
                  ) : null}
                </Pressable>
                {canEdit ? (
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => void removePhoto(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.fileName}`}
                  >
                    <X size={12} color={Theme.textPrimaryDark} />
                  </Pressable>
                ) : null}
                <Text style={styles.fileName} numberOfLines={1}>
                  {shortHardCopyPodPhotoName(item.fileName)}
                </Text>
              </View>
            ))}
          </View>
          {canEdit ? (
            <Pressable
              style={styles.addMore}
              onPress={() => void pickPhotos()}
              accessibilityRole="button"
              accessibilityLabel="Add more photos"
            >
              <Upload size={16} color={Theme.textPrimaryDark} />
              <Text style={styles.addMoreText}>Add more photos</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}

      <PodFilePreview
        item={preview}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, gap: 6 },
  pane: { flex: 1, minWidth: 0, minHeight: 0, gap: 6 },
  paneUpload: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
  },
  paneUploadText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  paneStage: {
    flex: 1,
    minHeight: 160,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  paneFile: { flex: 1, width: "100%", height: "100%" },
  paneImage: { width: "100%", height: "100%" },
  paneEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  paneBusy: {
    position: "absolute",
    left: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  paneRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  paneThumbs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  paneThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
  },
  paneThumbOn: { borderColor: Theme.analyticsHeroBg, borderWidth: 2 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
    textAlign: "left",
  },
  uploadCard: {
    minHeight: 44,
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  uploadTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  uploadedBlock: { gap: 8, marginTop: 4 },
  uploadedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    width: "31%",
    minWidth: 96,
    maxWidth: 140,
    gap: 4,
  },
  thumbPress: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    height: 84,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  pdfThumb: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  pdfThumbText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textPrimaryDark,
  },
  thumbFallback: {
    flex: 1,
    backgroundColor: Theme.border,
  },
  uploadingBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  fileName: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  addMore: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  addMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  validation: {
    fontSize: 11,
    color: Theme.warning,
    fontWeight: "600",
  },
  previewRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  previewPanel: {
    height: "100%",
    backgroundColor: Theme.cardWhite,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    paddingHorizontal: 16,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previewTools: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
  },
  previewTool: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  previewToolHover: {
    backgroundColor: Theme.complianceIconWash,
    borderColor: Theme.complianceBulk,
  },
  previewPercent: {
    minWidth: 48,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previewHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  previewStage: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.compliancePageBg,
  },
  previewZoom: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  previewFile: {
    width: "100%",
    height: "100%",
  },
  previewGesture: {
    ...StyleSheet.absoluteFillObject,
  },
  previewPdfPage: {
    top: 56,
  },
  previewDismiss: { flex: 1 },
});

function PreviewIconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (node) node.title = label;
  }, [label]);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        styles.previewTool,
        hover && styles.previewToolHover,
        Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

function PodFilePreview({
  item,
  onClose,
}: {
  item: PodPhotoItem | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const openWidth = Math.min(640, Math.max(340, Math.round(windowWidth * 0.44)));
  const slide = useRef(new Animated.Value(0)).current;
  const stageRef = useRef<View>(null);
  const [stageNode, setStageNode] = useState<HTMLElement | null>(null);
  const setStageRef = useCallback((node: View | null) => {
    stageRef.current = node;
    if (Platform.OS !== "web") return;
    setStageNode(node as unknown as HTMLElement | null);
  }, []);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isPdf = item ? fileIsPdf(item.fileName, item.document?.mime_type) : false;
  const panelWidth = expanded ? windowWidth : openWidth;

  const commitView = (nextScale: number, nextPan: { x: number; y: number }) => {
    scaleRef.current = nextScale;
    panRef.current = nextPan;
    setScale(nextScale);
    setPan(nextPan);
  };

  const applyZoom = useCallback((nextRaw: number, point?: { x: number; y: number }) => {
    const prev = scaleRef.current;
    const next = clampZoom(nextRaw);
    const prevPan = panRef.current;
    let cursor: { x: number; y: number } | undefined;
    if (point) {
      const node = stageRef.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
      const rect = node?.getBoundingClientRect?.();
      if (rect) {
        cursor = {
          x: point.x - (rect.left + rect.width / 2),
          y: point.y - (rect.top + rect.height / 2),
        };
      }
    }
    commitView(next, panForZoom(prev, prevPan, next, cursor));
  }, []);

  const resetZoom = useCallback(() => {
    commitView(1, { x: 0, y: 0 });
  }, []);

  useEffect(() => {
    commitView(1, { x: 0, y: 0 });
    setExpanded(false);
    setDragging(false);
    if (!item) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [item, slide]);

  useEffect(() => {
    if (Platform.OS !== "web" || !item || !stageNode?.addEventListener) return;
    const node = stageNode;
    const onWheel = (event: WheelEvent) => {
      const rect = node.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "IFRAME" && !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const notch = event.deltaMode !== 0 || Math.abs(delta) >= 40;
      const next = notch
        ? adjacentZoom(scaleRef.current, delta < 0 ? 1 : -1)
        : scaleRef.current * Math.exp(-delta * 0.002);
      applyZoom(next, { x: event.clientX, y: event.clientY });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyZoom, item, stageNode]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => scaleRef.current > 1,
      onPanResponderGrant: () => {
        dragOrigin.current = panRef.current;
        setDragging(true);
      },
      onPanResponderMove: (_, gesture) => {
        const nextPan = {
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        };
        panRef.current = nextPan;
        setPan(nextPan);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-openWidth, 0],
  });
  const zoomStyle = {
    transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
    ...(Platform.OS === "web"
      ? ({
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 140ms ease",
        } as ViewStyle)
      : null),
  };
  const stageCursor =
    Platform.OS === "web"
      ? ({
          cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in",
          userSelect: "none",
          touchAction: "none",
        } as unknown as ViewStyle)
      : null;
  const keepPdfChrome = isPdf && scale <= 1 && !dragging;

  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewRoot}>
        <Animated.View
          style={[
            styles.previewPanel,
            {
              width: panelWidth,
              maxHeight: windowHeight,
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateX }],
              ...(Platform.OS === "web" ? ({ transition: "width 220ms ease" } as ViewStyle) : null),
            },
          ]}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {item ? shortHardCopyPodPhotoName(item.fileName) : ""}
            </Text>
            <View style={styles.previewTools}>
              <PreviewIconButton label="Zoom out" onPress={() => applyZoom(adjacentZoom(scale, -1))}>
                <Minus size={16} color={Theme.textPrimaryDark} />
              </PreviewIconButton>
              <Text style={styles.previewPercent}>{Math.round(scale * 100)}%</Text>
              <PreviewIconButton label="Zoom in" onPress={() => applyZoom(adjacentZoom(scale, 1))}>
                <Plus size={16} color={Theme.textPrimaryDark} />
              </PreviewIconButton>
              <PreviewIconButton label="Reset zoom" onPress={resetZoom}>
                <RotateCcw size={15} color={Theme.textPrimaryDark} />
              </PreviewIconButton>
              <PreviewIconButton
                label={expanded ? "Exit full screen" : "Full screen"}
                onPress={() => setExpanded((current) => !current)}
              >
                {expanded ? (
                  <Minimize2 size={15} color={Theme.textPrimaryDark} />
                ) : (
                  <Maximize2 size={15} color={Theme.textPrimaryDark} />
                )}
              </PreviewIconButton>
              <PreviewIconButton label="Close preview" onPress={onClose}>
                <X size={16} color={Theme.textPrimaryDark} />
              </PreviewIconButton>
            </View>
          </View>
          <Text style={styles.previewHint}>Scroll to zoom. Drag to move when zoomed.</Text>
          <View ref={setStageRef} style={[styles.previewStage, stageCursor]}>
            {item?.previewUri ? (
              <View style={[styles.previewZoom, zoomStyle]} pointerEvents={keepPdfChrome ? "box-none" : "none"}>
                {isPdf ? (
                  <PdfViewer pdfUri={item.previewUri} style={styles.previewFile} />
                ) : (
                  <Image
                    source={{ uri: item.previewUri }}
                    style={styles.previewFile}
                    resizeMode="contain"
                    accessibilityLabel={item.fileName}
                  />
                )}
              </View>
            ) : null}
            <View
              style={[styles.previewGesture, keepPdfChrome && styles.previewPdfPage]}
              pointerEvents="auto"
              {...panResponder.panHandlers}
            />
          </View>
        </Animated.View>
        {expanded ? null : (
          <Pressable style={styles.previewDismiss} onPress={onClose} accessibilityLabel="Close preview" />
        )}
      </View>
    </Modal>
  );
}

