import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  peekChatGallerySlideUrl,
  resolveChatGallerySlideUrl,
  type ChatGallerySlide,
} from "@/features/chat/utils/chatMediaGallery.util";
import { tryChatDocumentBlobObjectUrl } from "@/features/chat/utils/resolveChatDocumentUrl.util";
import { Image } from "expo-image";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  loadImageNaturalSize,
  resolveFitImageLayout,
} from "@/features/chat/utils/fitImageInViewport.util";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";

type GalleryLoadPass = "default" | "signed" | "blob";

async function loadGallerySlideUri(
  slide: ChatGallerySlide,
  pass: GalleryLoadPass,
): Promise<string | null> {
  return resolveChatGallerySlideUrl(slide, { signedOnly: pass === "signed" });
}

const CHROME_TOP = 52;
const CHROME_BOTTOM = 56;
const H_PAD = 16;

function GallerySlidePage({
  slide,
  width,
  viewportHeight,
}: {
  slide: ChatGallerySlide;
  width: number;
  viewportHeight: number;
}) {
  const [uri, setUri] = useState<string | null>(() => peekChatGallerySlideUrl(slide));
  const [loading, setLoading] = useState(() => !peekChatGallerySlideUrl(slide));
  const [error, setError] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const loadPassRef = useRef<GalleryLoadPass>("default");
  const blobRevokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPassRef.current = "default";
    setNaturalSize(null);
    const peek = peekChatGallerySlideUrl(slide);
    setUri(peek);
    setError(false);
    if (peek) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      const url = await loadGallerySlideUri(slide, "default");
      if (cancelled) return;
      if (url) {
        loadPassRef.current = "default";
        setUri(url);
        setLoading(false);
        return;
      }
      if (slide.storagePath && Platform.OS === "web") {
        const blobUrl = await loadGallerySlideUri(slide, "blob");
        if (cancelled) return;
        if (blobUrl) {
          loadPassRef.current = "blob";
          setUri(blobUrl);
          setLoading(false);
          return;
        }
      }
      setError(true);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slide.key, slide.storagePath, slide.previewUrl]);

  const onImageError = useCallback(() => {
    const path = String(slide.storagePath ?? "").trim();
    if (!path || loadPassRef.current === "blob") {
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);

    void (async () => {
      if (Platform.OS === "web") {
        const blobUrl = await loadGallerySlideUri(slide, "blob");
        if (blobUrl) {
          loadPassRef.current = "blob";
          setUri(blobUrl);
          setLoading(false);
          return;
        }
        const blob = await tryChatDocumentBlobObjectUrl(path);
        if (blob?.url) {
          blobRevokeRef.current?.();
          blobRevokeRef.current = blob.revoke;
          loadPassRef.current = "blob";
          setUri(blob.url);
          loadPassRef.current = "signed";
          setUri(signed);
          setLoading(false);
          return;
        }
      }
      setError(true);
      setLoading(false);
    })();
  }, [slide]);

  useEffect(() => {
    if (!uri || loading || error) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    void loadImageNaturalSize(uri).then((size) => {
      if (cancelled || !size) return;
      setNaturalSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, loading, error]);

  const imageLayout = naturalSize
    ? resolveFitImageLayout(naturalSize, width, viewportHeight, {
        horizontal: H_PAD,
        top: CHROME_TOP,
        bottom: CHROME_BOTTOM,
      })
    : null;

  return (
    <View style={[styles.page, { width, height: viewportHeight }]}>
      {loading ? (
        <View style={styles.pageCenter}>
          <LoadingIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.pageCenter}>
          <Text style={styles.errorText}>Could not load this file</Text>
        </View>
      ) : null}
      {uri && !error ? (
        naturalSize ? (
          <ScrollView
            style={styles.slideScroll}
            contentContainerStyle={[
              styles.slideScrollContent,
              {
                minHeight: viewportHeight,
                justifyContent: imageLayout?.scrollable ? "flex-start" : "center",
                paddingTop: CHROME_TOP,
                paddingBottom: CHROME_BOTTOM,
              },
            ]}
            showsVerticalScrollIndicator={imageLayout?.scrollable ?? false}
            centerContent={!imageLayout?.scrollable}
            nestedScrollEnabled
            bounces
          >
            <Image
              source={{ uri }}
              style={
                imageLayout
                  ? {
                      width: imageLayout.width,
                      height: imageLayout.height,
                      maxWidth: width - H_PAD * 2,
                      maxHeight: viewportHeight - CHROME_TOP - CHROME_BOTTOM,
                    }
                  : undefined
              }
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={`${slide.key}-${uri}`}
              transition={180}
              onError={onImageError}
            />
          </ScrollView>
        ) : (
          <View style={styles.pageCenter}>
            <Image
              source={{ uri }}
              style={styles.measureImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={`${slide.key}-${uri}-measure`}
              onLoad={(event) => {
                const w = event.source.width;
                const h = event.source.height;
                if (w > 0 && h > 0) setNaturalSize({ width: w, height: h });
              }}
              onError={onImageError}
            />
          </View>
        )
      ) : null}
      {slide.fileName ? (
        <Text style={styles.caption} numberOfLines={2}>
          {slide.fileName}
        </Text>
      ) : null}
    </View>
  );
}

export type ChatMediaGalleryLightboxProps = {
  visible: boolean;
  slides: ChatGallerySlide[];
  initialIndex?: number;
  onClose: () => void;
};

/**
 * Full-screen gallery: swipe between images + transparent prev/next controls.
 */
export function ChatMediaGalleryLightbox({
  visible,
  slides,
  initialIndex = 0,
  onClose,
}: ChatMediaGalleryLightboxProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportHeight = Math.max(1, height - insets.top - insets.bottom);
  const listRef = useRef<FlatList<ChatGallerySlide>>(null);
  const [index, setIndex] = useState(initialIndex);
  const safeInitial = Math.min(Math.max(initialIndex, 0), Math.max(slides.length - 1, 0));

  useEffect(() => {
    if (!visible) return;
    setIndex(safeInitial);
    const t = setTimeout(() => {
      if (slides.length === 0) return;
      listRef.current?.scrollToIndex({ index: safeInitial, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [visible, safeInitial, slides.length]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
      setIndex(Math.min(Math.max(next, 0), slides.length - 1));
    },
    [slides.length, width],
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= slides.length) return;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setIndex(nextIndex);
    },
    [slides.length],
  );

  if (!visible || slides.length === 0) return null;

  const canPrev = index > 0;
  const canNext = index < slides.length - 1;

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          Platform.OS === "web" ? (WEB_APP_VIEWPORT_STYLE as object) : null,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close gallery"
        >
          <X size={22} color="#fff" strokeWidth={2.2} />
        </Pressable>

        {slides.length > 1 ? (
          <Text style={[styles.counter, { top: insets.top + 14 }]}>
            {index + 1} / {slides.length}
          </Text>
        ) : null}

        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          bounces={slides.length > 1}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          initialScrollIndex={slides.length > 1 ? safeInitial : 0}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
              });
            }, 80);
          }}
          renderItem={({ item }) => (
            <GallerySlidePage slide={item} width={width} viewportHeight={viewportHeight} />
          )}
          style={styles.list}
          {...(Platform.OS === "web"
            ? { snapToInterval: width, decelerationRate: "fast" as const }
            : {})}
        />

        {canPrev ? (
          <Pressable
            style={[styles.navBtn, styles.navBtnLeft]}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous image"
          >
            <ChevronLeft size={28} color="#fff" strokeWidth={2.4} />
          </Pressable>
        ) : null}

        {canNext ? (
          <Pressable
            style={[styles.navBtn, styles.navBtnRight]}
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next image"
          >
            <ChevronRight size={28} color="#fff" strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

export function useChatMediaGallery() {
  const [state, setState] = useState<{
    slides: ChatGallerySlide[];
    index: number;
  } | null>(null);

  const open = useCallback((slides: ChatGallerySlide[], index = 0) => {
    if (slides.length === 0) return;
    setState({ slides, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  const node = state ? (
    <ChatMediaGalleryLightbox
      visible
      slides={state.slides}
      initialIndex={state.index}
      onClose={close}
    />
  ) : null;

  return { open, close, node, isOpen: state != null };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  list: {
    flex: 1,
  },
  page: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  pageCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  slideScroll: {
    flex: 1,
    width: "100%",
  },
  slideScrollContent: {
    alignItems: "center",
    paddingHorizontal: H_PAD,
  },
  measureImage: {
    width: 1,
    height: 1,
    opacity: 0,
    position: "absolute",
  },
  caption: {
    position: "absolute",
    bottom: 12,
    left: 20,
    right: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 20,
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.3,
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -28,
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },
  navBtnLeft: {
    left: 8,
  },
  navBtnRight: {
    right: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    color: "#fca5a5",
    fontWeight: "600",
    paddingHorizontal: 24,
    textAlign: "center",
  },
});
