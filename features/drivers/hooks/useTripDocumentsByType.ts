import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import type { TripDocumentType } from "@/features/trips/services/tripDocuments.service";
// expo-file-system SDK 54 moved readAsStringAsync/EncodingType to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export function useTripDocumentsByType(
  tripId: string | undefined,
  userId: string | undefined,
  documentType: TripDocumentType,
) {
  const [documents, setDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewUrls, setViewUrls] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState(false);

  const urlsRequestedRef = useRef<Set<string>>(new Set());
  const lastTripIdRef = useRef<string | null>(null);
  const uploadingRef = useRef(false);

  const loadDocuments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!tripId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const { documents: rows, error } = await tripDocumentsService.getDocumentsByTripId(tripId, {
        includeStorageFallback: true,
      });
      if (!error) {
        setDocuments(rows.filter((d) => d.document_type === documentType));
        lastTripIdRef.current = tripId;
      }
    } finally {
      setLoading(false);
    }
  }, [tripId, documentType]);

  const uploadDocument = useCallback(async (
    onSuccess?: (doc: tripDocumentsService.TripDocumentRow) => void,
    onError?: (msg: string) => void,
  ) => {
    if (!tripId || !userId || uploadingRef.current) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return onError?.("Permission to access photos is required");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const { uri, fileName, mimeType } = result.assets[0];
    uploadingRef.current = true;
    setUploading(true);

    try {
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });
        arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
      }

      if (!arrayBuffer?.byteLength) return onError?.("Could not read image file");

      const { doc, error } = await tripDocumentsService.uploadTripDocument(
        tripId,
        userId,
        {
          arrayBuffer,
          fileName: fileName ?? `${documentType}-${Date.now()}.jpg`,
          mimeType: mimeType ?? "image/jpeg",
        },
        documentType,
      );
      if (error) return onError?.(error.message);
      if (doc) {
        setDocuments((prev) => [doc, ...prev]);
        const url = await tripDocumentsService.getDocumentViewUrl(doc.storage_path);
        setViewUrls((prev) => ({ ...prev, [doc.id]: url }));
        onSuccess?.(doc);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Upload failed");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }, [tripId, userId, documentType]);

  useEffect(() => {
    documents.forEach((doc) => {
      if (urlsRequestedRef.current.has(doc.id)) return;
      urlsRequestedRef.current.add(doc.id);
      tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) =>
        setViewUrls((prev) => (prev[doc.id] ? prev : { ...prev, [doc.id]: url })),
      );
    });
  }, [documents]);

  return {
    documents,
    setDocuments,
    loading,
    uploading,
    viewUrls,
    setViewUrls,
    skipped,
    setSkipped,
    loadDocuments,
    uploadDocument,
    lastTripIdRef,
  };
}

/** POD uploads at drop-off. */
export function usePodDocuments(tripId: string | undefined, userId: string | undefined) {
  const hook = useTripDocumentsByType(tripId, userId, "pod");
  return {
    podDocuments: hook.documents,
    setPodDocuments: hook.setDocuments,
    podLoading: hook.loading,
    podUploading: hook.uploading,
    podViewUrls: hook.viewUrls,
    setPodViewUrls: hook.setViewUrls,
    podSkipped: hook.skipped,
    setPodSkipped: hook.setSkipped,
    loadPodDocuments: hook.loadDocuments,
    uploadPod: hook.uploadDocument,
    lastPodTripIdRef: hook.lastTripIdRef,
  };
}

/** LR (Lorry Receipt) uploads after pickup / loading. */
export function useLrDocuments(tripId: string | undefined, userId: string | undefined) {
  const hook = useTripDocumentsByType(tripId, userId, "lr");
  return {
    lrDocuments: hook.documents,
    setLrDocuments: hook.setDocuments,
    lrLoading: hook.loading,
    lrUploading: hook.uploading,
    lrViewUrls: hook.viewUrls,
    setLrViewUrls: hook.setViewUrls,
    lrSkipped: hook.skipped,
    setLrSkipped: hook.setSkipped,
    loadLrDocuments: hook.loadDocuments,
    uploadLr: hook.uploadDocument,
    lastLrTripIdRef: hook.lastTripIdRef,
  };
}
