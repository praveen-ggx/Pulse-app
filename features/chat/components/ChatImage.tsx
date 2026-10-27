/**
 * ChatImage — inline chat / inbox thumbnails.
 *
 * trip-documents is RLS-gated: public `/render/image/public/…` URLs 403.
 * 1. Cached signed transform (peek + resolveChatImageThumbnail)
 * 2. metadata.thumb_url / preferredUrl when they are signed or object URLs
 * 3. web blob download — when signed URL is blocked by CORS on `<Image>`
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { chatPreviewFetchForDisplay } from "@/features/chat/utils/chatPreviewTransform.util";
import {
  appendImageTransformQuery,
  isDirectChatImageHttpUrl,
} from "@/features/chat/utils/storageRenderImageUrl";
import { extractThinImagePayload } from "@/features/chat/utils/thinImageMetadata";
import { Image } from "expo-image";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, type ImageStyle, type StyleProp } from "react-native";
import type { TripMessageRow } from "../types/chat.types";
import {
  normalizeTripDocumentsStoragePath,
  peekChatImageThumbnailUrl,
  resolveChatImageThumbnail,
  tryChatDocumentBlobObjectUrl,
} from "../utils/resolveChatDocumentUrl.util";

const DEFAULT_INLINE_W = 300;
const DEFAULT_INLINE_H = 180;
const DEFAULT_THUMB_W = 156;
const DEFAULT_THUMB_H = 96;

interface ChatImageProps {
  storagePath: string;
  style?: StyleProp<ImageStyle>;
  thumbnail?: boolean;
  /** On-screen width — used to size the CDN transform (DPR-aware). */
  displayWidth?: number;
  /** On-screen height — used to size the CDN transform (DPR-aware). */
  displayHeight?: number;
  contentFit?: "cover" | "contain";
  /** Pre-built HTTPS URL — signed/object URLs only (public render URLs are ignored). */
  preferredUrl?: string | null;
  /** Optional message metadata (thumb_url, blurhash) for zero-RPC first paint. */
  message?: Pick<TripMessageRow, "metadata"> | null;
}

function resolveKey(
  storagePath: string,
  w: number,
  h: number,
  q: number,
  resize: "cover" | "contain",
): string {
  return `${storagePath}|${w}|${h}|${q}|${resize}`;
}

function readDisplaySize(
  style: StyleProp<ImageStyle> | undefined,
  thumbnail: boolean | undefined,
  displayWidth?: number,
  displayHeight?: number,
): { w: number; h: number } {
  if (displayWidth && displayHeight) {
    return { w: displayWidth, h: displayHeight };
  }
  const flat = StyleSheet.flatten(style);
  const w = typeof flat?.width === "number" ? flat.width : thumbnail ? DEFAULT_THUMB_W : DEFAULT_INLINE_W;
  const h = typeof flat?.height === "number" ? flat.height : thumbnail ? DEFAULT_THUMB_H : DEFAULT_INLINE_H;
  return { w, h };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

/** Object key for Storage signing — never a render/signed HTTPS URL. */
export function resolveChatImageStorageKey(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (isHttpUrl(trimmed)) return "";
  return normalizeTripDocumentsStoragePath(trimmed);
}

function tuneDirectUrl(url: string | null | undefined, width: number, quality: number): string | null {
  const raw = String(url ?? "").trim();
  if (!isDirectChatImageHttpUrl(raw)) return null;
  return appendImageTransformQuery(raw, width, quality);
}

export function ChatImage({
  storagePath,
  style,
  thumbnail,
  displayWidth,
  displayHeight,
  contentFit,
  preferredUrl = null,
  message = null,
}: ChatImageProps) {
  const display = readDisplaySize(style, thumbnail, displayWidth, displayHeight);
  const resize = contentFit ?? (thumbnail ? "cover" : "contain");
  const fetch = useMemo(
    () => chatPreviewFetchForDisplay(display.w, display.h, resize),
    [display.w, display.h, resize],
  );

  const objectKey = useMemo(() => resolveChatImageStorageKey(storagePath), [storagePath]);
  const directHttpUrl = useMemo(() => {
    const raw = String(storagePath ?? "").trim();
    return isDirectChatImageHttpUrl(raw) ? raw : null;
  }, [storagePath]);

  const thin = useMemo(() => extractThinImagePayload(message ?? undefined), [message]);

  const metadataThumb = useMemo(
    () => tuneDirectUrl(thin.thumbUrl, fetch.width, fetch.quality),
    [thin.thumbUrl, fetch.width, fetch.quality],
  );

  const tunedPreferred = useMemo(
    () => tuneDirectUrl(preferredUrl, fetch.width, fetch.quality),
    [preferredUrl, fetch.width, fetch.quality],
  );

  const peekSigned = useMemo(() => {
    if (!objectKey) return null;
    return peekChatImageThumbnailUrl(
      objectKey,
      fetch.width,
      fetch.height,
      fetch.quality,
      resize,
    );
  }, [objectKey, fetch.width, fetch.height, fetch.quality, resize]);

  const instantUri = useMemo(
    () =>
      directHttpUrl ??
      peekSigned ??
      metadataThumb ??
      tunedPreferred ??
      null,
    [directHttpUrl, peekSigned, metadataThumb, tunedPreferred],
  );

  const inFlightRef = useRef<string | null>(null);
  const [uri, setUri] = useState<string | null>(instantUri);
  const [loading, setLoading] = useState(
    () => Boolean(objectKey && !instantUri),
  );
  const [loadError, setLoadError] = useState(false);
  const blobRevokeRef = useRef<(() => void) | null>(null);
  const _adoptBlob = useCallback((blob: { url: string; revoke: () => void }) => {
    blobRevokeRef.current?.();
    blobRevokeRef.current = blob.revoke;
    setUri(blob.url);
    setLoading(false);
    setLoadError(false);
  }, []);
  useEffect(() => () => {
    blobRevokeRef.current?.();
    blobRevokeRef.current = null;
  }, []);

  useEffect(() => {
    setLoadError(false);
    inFlightRef.current = null;
  }, [storagePath, preferredUrl, objectKey, fetch.width, fetch.height, fetch.quality, resize, message]);

  useEffect(() => {
    if (instantUri) {
      setUri(instantUri);
      setLoading(false);
      void Image.prefetch(instantUri, "memory-disk").catch(() => {});
    } else if (!objectKey) {
      setUri(null);
      setLoading(false);
      setLoadError(!directHttpUrl);
      return;
    } else {
      setLoading(true);
    }

    if (!objectKey) return;

    const key = resolveKey(objectKey, fetch.width, fetch.height, fetch.quality, resize);
    if (inFlightRef.current === key) return;
    inFlightRef.current = key;
    let cancelled = false;

    void resolveChatImageThumbnail(
      objectKey,
      fetch.width,
      fetch.height,
      fetch.quality,
      resize,
    ).then((signedUrl) => {
      if (cancelled || inFlightRef.current !== key) return;
      inFlightRef.current = null;
      if (signedUrl) {
        setUri(signedUrl);
        setLoading(false);
        setLoadError(false);
        void Image.prefetch(signedUrl, "memory-disk").catch(() => {});
        return;
      }
      if (!instantUri) {
        setLoading(false);
        setLoadError(true);
      }
    });

    return () => {
      cancelled = true;
      inFlightRef.current = null;
    };
  }, [
    objectKey,
    fetch.width,
    fetch.height,
    fetch.quality,
    resize,
    instantUri,
    directHttpUrl,
  ]);

  const onError = useCallback(() => {
    if (!objectKey) {
      setLoadError(true);
      return;
    }

    if (Platform.OS === "web") {
      setLoading(true);
      void tryChatDocumentBlobObjectUrl(objectKey).then((blob) => {
        if (blob?.url) {
          setUri(blob.url);
          setLoading(false);
          setLoadError(false);
        } else {
          setLoading(false);
          setLoadError(true);
        }
      });
      return;
    }

    setLoadError(true);
  }, [objectKey]);

  if (loadError) {
    return (
      <View style={[s.placeholder, thumbnail && s.thumbnailPlaceholder, style as object]}>
        <FontAwesome name="image" size={thumbnail ? 16 : 22} color="#94a3b8" />
        {!thumbnail ? <Text style={s.removedText}>Photo unavailable</Text> : null}
      </View>
    );
  }

  if (loading || !uri) {
    return (
      <View style={[s.placeholder, thumbnail && s.thumbnailPlaceholder, style as object]}>
        <LoadingIndicator size="small" color="#94a3b8" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={resize}
      transition={100}
      cachePolicy="memory-disk"
      recyclingKey={`${objectKey || uri}|${fetch.width}`}
      onError={onError}
      accessibilityLabel="Document preview"
    />
  );
}

const s = StyleSheet.create({
  placeholder: {
    width: "100%",
    height: 160,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
  },
  removedText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
});
