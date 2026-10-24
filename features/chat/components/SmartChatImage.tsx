/**
 * SmartChatImage — thin WhatsApp-style chat image pipeline.
 *
 * - Prefers **metadata.thumb_url** when it is a signed/object URL (public render URLs 403 — ignored).
 * - Else cached **signed transform** via resolveChatImageThumbnail (single flight + module TTL cache).
 * - Never uses `/storage/v1/render/image/public/…` — trip-documents is RLS-gated.
 * - Resets lightbox state when `storagePath` changes so list virtualization cannot leak URLs across rows.
 * - **expo-image** disk+memory cache + optional **blurhash** / data-URI placeholder to avoid layout jump.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { recordImageOpened, recordImageOpenFailed } from "@/lib/chatPerf";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { X, ZoomIn } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { TripMessageRow } from "../types/chat.types";
import {
  peekChatImageFullDisplayUrl,
  peekChatImageThumbnailUrl,
  resolveChatDocumentStorageUrl,
  resolveChatImageFullDisplayUrl,
  resolveChatImageThumbnail,
  tryChatDocumentBlobObjectUrl,
} from "../utils/resolveChatDocumentUrl.util";
import {
  appendImageTransformQuery,
  isDirectChatImageHttpUrl,
} from "../utils/storageRenderImageUrl";
import { extractThinImagePayload } from "../utils/thinImageMetadata";
import {
  loadImageNaturalSize,
  resolveFitImageLayout,
} from "../utils/fitImageInViewport.util";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";
import { chatPreviewFetchForDisplay } from "../utils/chatPreviewTransform.util";

const PLACEHOLDER_TINT = "rgba(148, 163, 184, 0.35)";
const THUMB_DISPLAY_H = 180;
const THUMB_RESIZE = "contain" as const;

/** Lightbox max edge — keep in sync with {@link resolveChatImageFullDisplayUrl} default. */
const FULL_DISPLAY_MAX_EDGE = 1280;
const FULL_DISPLAY_QUALITY = 80;

export interface SmartChatImageProps {
  storagePath: string;
  isOwn?: boolean;
  /** When set, thumb_url / blurhash from metadata avoid extra work on Realtime insert. */
  message?: Pick<TripMessageRow, "metadata"> | null;
  thumbWidth?: number;
  thumbHeight?: number;
  thumbQuality?: number;
}

type LoadState = "idle" | "loading" | "ready" | "error";

function thumbKey(path: string, w: number, h: number, q: number): string {
  return `${path}|${w}|${h}|${q}`;
}

export function SmartChatImage({
  storagePath,
  isOwn = false,
  message = null,
  thumbWidth: thumbWidthProp,
  thumbHeight: thumbHeightProp,
  thumbQuality: thumbQualityProp,
}: SmartChatImageProps) {
  const { width: screenW } = useWindowDimensions();
  const displayW = Math.min(340, Math.max(240, screenW * 0.68));
  const fetch = useMemo(
    () => chatPreviewFetchForDisplay(displayW, THUMB_DISPLAY_H, THUMB_RESIZE),
    [displayW],
  );
  const thumbWidth = thumbWidthProp ?? fetch.width;
  const thumbHeight = thumbHeightProp ?? fetch.height;
  const thumbQuality = thumbQualityProp ?? fetch.quality;

  const thin = useMemo(() => extractThinImagePayload(message ?? undefined), [message]);

  // Public `/render/image/public/…` URLs always 403 on RLS-gated trip-documents —
  // only accept signed / object HTTPS thumbs from metadata.
  const prebuiltThumb = useMemo(() => {
    if (!thin.thumbUrl || !isDirectChatImageHttpUrl(thin.thumbUrl)) return null;
    return appendImageTransformQuery(thin.thumbUrl, thumbWidth, thumbQuality);
  }, [thin.thumbUrl, thumbWidth, thumbQuality]);

  const cachedSignedThumb = storagePath
    ? peekChatImageThumbnailUrl(
        storagePath,
        thumbWidth,
        thumbHeight,
        thumbQuality,
        THUMB_RESIZE,
      )
    : null;

  const initialThumb = cachedSignedThumb ?? prebuiltThumb;

  const [thumbUri, setThumbUri] = useState<string | null>(initialThumb);
  const [thumbState, setThumbState] = useState<LoadState>(() => {
    if (!storagePath) return "error";
    return initialThumb ? "ready" : "idle";
  });
  const [fullUri, setFullUri] = useState<string | null>(() =>
    storagePath ? peekChatImageFullDisplayUrl(storagePath) : null,
  );
  const [fullState, setFullState] = useState<LoadState>("idle");
  const [modalVisible, setModalVisible] = useState(false);
  const [prebuiltFailed, setPrebuiltFailed] = useState(false);

  const inFlightRef = useRef<string | null>(null);
  const blobRevokeRef = useRef<(() => void) | null>(null);
  const adoptBlob = useCallback((blob: { url: string; revoke: () => void }) => {
    blobRevokeRef.current?.();
    blobRevokeRef.current = blob.revoke;
    return blob.url;
  }, []);
  useEffect(() => () => {
    blobRevokeRef.current?.();
    blobRevokeRef.current = null;
  }, []);
  /** Invalidates in-flight lightbox loads when `storagePath` changes (list recycle). */
  const fullLightboxGenRef = useRef(0);

  // List virtualization can reuse this row for a different message — reset lightbox
  // state so we never show another row's URL or skip `createSignedUrl` incorrectly.
  useEffect(() => {
    fullLightboxGenRef.current += 1;
    setPrebuiltFailed(false);
    if (!storagePath) {
      setFullUri(null);
      setFullState("idle");
      setModalVisible(false);
      return;
    }
    const peekFull = peekChatImageFullDisplayUrl(storagePath, FULL_DISPLAY_MAX_EDGE, FULL_DISPLAY_QUALITY);
    setFullUri(peekFull);
    setFullState(peekFull ? "ready" : "idle");
    setModalVisible(false);
  }, [storagePath]);

  useEffect(() => {
    if (!storagePath) {
      setThumbState("error");
      setThumbUri(null);
      return;
    }
    const key = thumbKey(storagePath, thumbWidth, thumbHeight, thumbQuality);
    const fromPeek = peekChatImageThumbnailUrl(
      storagePath,
      thumbWidth,
      thumbHeight,
      thumbQuality,
      THUMB_RESIZE,
    );
    const instant =
      fromPeek ??
      cachedSignedThumb ??
      (!prebuiltFailed ? prebuiltThumb : null);

    if (instant) {
      setThumbUri(instant);
      setThumbState("ready");
      void Image.prefetch(instant, "memory-disk").catch(() => {});
    } else {
      setThumbState("loading");
    }

    if (inFlightRef.current === key) return;
    inFlightRef.current = key;
    let cancelled = false;

    void resolveChatImageThumbnail(
      storagePath,
      thumbWidth,
      thumbHeight,
      thumbQuality,
      THUMB_RESIZE,
    ).then(async (url) => {
      if (cancelled || inFlightRef.current !== key) return;
      inFlightRef.current = null;
      if (url) {
        setThumbUri(url);
        setThumbState("ready");
        void Image.prefetch(url, "memory-disk").catch(() => {});
        return;
      }
      if (Platform.OS === "web") {
        const blob = await tryChatDocumentBlobObjectUrl(storagePath);
        if (cancelled) return;
        if (blob?.url) {
          setThumbUri(blob.url);
          setThumbState("ready");
          return;
        }
      }
      if (!instant) setThumbState("error");
    });
    return () => {
      cancelled = true;
      inFlightRef.current = null;
    };
  }, [
    storagePath,
    thumbWidth,
    thumbHeight,
    thumbQuality,
    prebuiltThumb,
    prebuiltFailed,
    cachedSignedThumb,
  ]);

  const onThumbError = useCallback(() => {
    if (prebuiltThumb && thumbUri === prebuiltThumb && !prebuiltFailed) {
      setPrebuiltFailed(true);
      setThumbState("loading");
      return;
    }
    if (Platform.OS === "web" && storagePath) {
      setThumbState("loading");
      void tryChatDocumentBlobObjectUrl(storagePath).then((blob) => {
        if (blob?.url) {
          setThumbUri(adoptBlob(blob));
          setThumbState("ready");
        } else {
          setThumbState("error");
        }
      });
      return;
    }
    setThumbState("error");
  }, [prebuiltThumb, thumbUri, prebuiltFailed, storagePath, adoptBlob]);

  const placeholderSource = useMemo(() => {
    if (thin.thumbhash) return { thumbhash: thin.thumbhash };
    if (thin.blurhash) {
      return { blurhash: thin.blurhash, width: thumbWidth, height: thumbHeight };
    }
    if (thin.thumbDataUri) return { uri: thin.thumbDataUri };
    return undefined;
  }, [thin.blurhash, thin.thumbhash, thin.thumbDataUri, thumbWidth, thumbHeight]);

  const loadFullSize = useCallback(async () => {
    recordImageOpened();
    const gen = ++fullLightboxGenRef.current;
    const instant = peekChatImageFullDisplayUrl(storagePath, FULL_DISPLAY_MAX_EDGE, FULL_DISPLAY_QUALITY);
    if (instant) {
      setFullUri(instant);
      setFullState("ready");
      setModalVisible(true);
      return;
    }

    setModalVisible(true);
    setFullState("loading");
    setFullUri(null);

    const transformed = await resolveChatImageFullDisplayUrl(storagePath);
    if (gen !== fullLightboxGenRef.current) return;
    if (transformed) {
      setFullUri(transformed);
      setFullState("ready");
      return;
    }
    const raw = await resolveChatDocumentStorageUrl(storagePath);
    if (gen !== fullLightboxGenRef.current) return;
    if (raw) {
      setFullUri(raw);
      setFullState("ready");
    } else {
      recordImageOpenFailed();
      setFullState("error");
    }
  }, [storagePath]);

  const { width: windowW, height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportHeight = Math.max(1, windowH - insets.top - insets.bottom);
  const [fullNaturalSize, setFullNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!modalVisible) setFullNaturalSize(null);
  }, [modalVisible]);

  useEffect(() => {
    if (!fullUri || fullState !== "ready") {
      setFullNaturalSize(null);
      return;
    }
    let cancelled = false;
    void loadImageNaturalSize(fullUri).then((size) => {
      if (cancelled || !size) return;
      setFullNaturalSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [fullUri, fullState]);

  const fullImageLayout = fullNaturalSize
    ? resolveFitImageLayout(fullNaturalSize, windowW, viewportHeight, {
        horizontal: 16,
        top: 56,
        bottom: 24,
      })
    : null;

  if (thumbState === "error") {
    return (
      <View style={[s.placeholder, isOwn && s.placeholderOwn]}>
        <Text style={s.errorText}>Image unavailable</Text>
      </View>
    );
  }

  const showBlurMatte =
    (thumbState === "loading" || thumbState === "idle") && !placeholderSource;

  return (
    <>
      <TouchableOpacity
        style={s.thumbWrap}
        onPress={() => { void loadFullSize(); }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="View full image"
      >
        <View style={s.thumbFrame}>
          {showBlurMatte ? (
            <View style={[s.blurMatte, { pointerEvents: "none" }]} />
          ) : null}
          {thumbState === "loading" || thumbState === "idle" ? (
            <View style={s.loaderOverlay}>
              <LoadingIndicator size="small" color={isOwn ? "#e0e7ff" : "#64748b"} />
            </View>
          ) : null}
          {thumbUri ? (
            <Image
              source={{ uri: thumbUri }}
              style={s.thumb}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={thumbUri}
              placeholder={placeholderSource}
              placeholderContentFit="contain"
              onError={() => { onThumbError(); }}
              accessibilityLabel="Chat image thumbnail"
            />
          ) : null}
        </View>
        <View style={s.zoomBadge}>
          <ZoomIn size={12} color="#fff" strokeWidth={2.5} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <SafeAreaView
          style={[
            s.modalBg,
            Platform.OS === "web" ? (WEB_APP_VIEWPORT_STYLE as object) : null,
          ]}
        >
          <TouchableOpacity
            style={s.modalClose}
            onPress={() => setModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>

          {fullState === "loading" && (
            <View style={s.modalLoading}>
              <LoadingIndicator size="large" color="#fff" />
              <Text style={s.modalLoadingText}>Loading full image…</Text>
            </View>
          )}

          {fullState === "ready" && fullUri && fullNaturalSize && fullImageLayout ? (
            <ScrollView
              style={s.modalScroll}
              contentContainerStyle={[
                s.modalScrollContent,
                {
                  minHeight: viewportHeight,
                  justifyContent: fullImageLayout.scrollable ? "flex-start" : "center",
                },
              ]}
              showsVerticalScrollIndicator={fullImageLayout.scrollable}
              centerContent={!fullImageLayout.scrollable}
            >
              <Pressable onPress={() => setModalVisible(false)}>
                <Image
                  source={{ uri: fullUri }}
                  style={{
                    width: fullImageLayout.width,
                    height: fullImageLayout.height,
                    maxWidth: windowW - 32,
                    maxHeight: viewportHeight - 80,
                  }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={fullUri}
                  accessibilityLabel="Full-size chat image"
                />
              </Pressable>
            </ScrollView>
          ) : null}

          {fullState === "ready" && fullUri && !fullNaturalSize ? (
            <View style={s.modalMeasure}>
              <Image
                source={{ uri: fullUri }}
                style={s.modalMeasureImg}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={`${fullUri}-measure`}
                onLoad={(event) => {
                  const w = event.source.width;
                  const h = event.source.height;
                  if (w > 0 && h > 0) setFullNaturalSize({ width: w, height: h });
                }}
                accessibilityLabel="Full-size chat image"
              />
            </View>
          ) : null}

          {fullState === "error" && (
            <View style={s.modalLoading}>
              <Text style={[s.modalLoadingText, { color: "#fca5a5" }]}>Could not load full image</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  placeholder: {
    width: "100%",
    height: 160,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderOwn: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  errorText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  thumbWrap: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  thumbFrame: {
    width: "100%",
    height: 180,
    position: "relative",
    backgroundColor: "rgba(226, 232, 240, 0.5)",
  },
  blurMatte: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PLACEHOLDER_TINT,
    zIndex: 1,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  thumb: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  zoomBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  modalClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    flex: 1,
    width: "100%",
  },
  modalScrollContent: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 56,
  },
  modalMeasure: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalMeasureImg: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  modalLoading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flex: 1,
  },
  modalLoadingText: {
    fontSize: 13,
    color: Theme.textMuted,
    fontWeight: "600",
  },
});
