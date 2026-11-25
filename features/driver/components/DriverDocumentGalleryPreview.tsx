/**
 * Shared full-screen document image gallery (side-scroll + thumb strip).
 * Used by driver POD upload and trip history detail so preview UX stays aligned.
 */
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PdfViewer } from '@/components/PdfViewer';
import { FLOW_EMERALD, FLOW_MINT } from '@/components/driver/DriverTripSheetLayout';
import {
  canOpenPreviewExternally,
  isDriverDocImage,
  isDriverDocPdf,
} from '@/features/driver/utils/driverDocumentPreview.util';
import type * as tripDocumentsService from '@/features/trips/services/tripDocuments.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DriverDocumentGalleryPreviewProps = {
  visible: boolean;
  documents: tripDocumentsService.TripDocumentRow[];
  viewUrls: Record<string, string>;
  /** Index to open when `visible` becomes true. */
  initialIndex?: number;
  onClose: () => void;
  onResolvePreview: (
    doc: tripDocumentsService.TripDocumentRow,
    opts?: { force?: boolean },
  ) => Promise<string | null>;
  /** Fallback label when file_name is missing. */
  fallbackLabel?: string;
  /**
   * Fired when a document cannot be previewed (missing/deleted storage object).
   * Parent should drop the row so the gallery does not keep an empty page.
   */
  onUnusableDocument?: (doc: tripDocumentsService.TripDocumentRow) => void;
  /**
   * When true, render as an absolute overlay (parent already owns a Modal).
   * When false (default), wrap in a transparent Modal.
   */
  asOverlay?: boolean;
};

export function DriverDocumentGalleryPreview({
  visible,
  documents,
  viewUrls,
  initialIndex = 0,
  onClose,
  onResolvePreview,
  fallbackLabel = 'POD',
  onUnusableDocument,
  asOverlay = false,
}: DriverDocumentGalleryPreviewProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const swipeHint = useSharedValue(0);

  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewResolvingId, setPreviewResolvingId] = useState<string | null>(null);
  const [previewFailedIds, setPreviewFailedIds] = useState<Record<string, boolean>>({});
  const [hasSwipedPreview, setHasSwipedPreview] = useState(false);
  const galleryRef = useRef<FlatList<tripDocumentsService.TripDocumentRow>>(null);
  const thumbStripRef = useRef<ScrollView>(null);
  const openedForVisibleRef = useRef(false);
  const autoRetriedIdsRef = useRef<Set<string>>(new Set());

  const resetLocal = useCallback(() => {
    setPreviewResolvingId(null);
    setPreviewFailedIds({});
    setHasSwipedPreview(false);
    swipeHint.value = 0;
    openedForVisibleRef.current = false;
    autoRetriedIdsRef.current.clear();
  }, [swipeHint]);

  useEffect(() => {
    if (!visible) {
      resetLocal();
      return;
    }
    if (openedForVisibleRef.current) return;
    openedForVisibleRef.current = true;
    const safeIndex = Math.min(
      Math.max(0, initialIndex),
      Math.max(0, documents.length - 1),
    );
    setPreviewIndex(safeIndex);
    setHasSwipedPreview(false);
    if (documents.length > 1) {
      swipeHint.value = withSequence(
        withTiming(1, { duration: 280 }),
        withTiming(1, { duration: 1400 }),
        withTiming(0, { duration: 420 }),
      );
    }
  }, [visible, initialIndex, documents.length, resetLocal, swipeHint]);

  const ensurePreviewUrl = useCallback(
    async (
      doc: tripDocumentsService.TripDocumentRow,
      opts?: { force?: boolean },
    ) => {
      if (!opts?.force && viewUrls[doc.id]) return viewUrls[doc.id];
      setPreviewResolvingId(doc.id);
      try {
        const url = await onResolvePreview(doc, opts);
        if (!url) {
          setPreviewFailedIds((prev) => ({ ...prev, [doc.id]: true }));
          onUnusableDocument?.(doc);
          return null;
        }
        setPreviewFailedIds((prev) => {
          if (!prev[doc.id]) return prev;
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
        return url;
      } catch {
        setPreviewFailedIds((prev) => ({ ...prev, [doc.id]: true }));
        onUnusableDocument?.(doc);
        return null;
      } finally {
        setPreviewResolvingId((cur) => (cur === doc.id ? null : cur));
      }
    },
    [onResolvePreview, onUnusableDocument, viewUrls],
  );

  const retryPreview = useCallback(
    (doc: tripDocumentsService.TripDocumentRow) => {
      setPreviewFailedIds((prev) => {
        if (!prev[doc.id]) return prev;
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      void ensurePreviewUrl(doc, { force: true });
    },
    [ensurePreviewUrl],
  );

  useEffect(() => {
    if (!visible || documents.length === 0) return;
    const targets = [previewIndex - 1, previewIndex, previewIndex + 1]
      .filter((i) => i >= 0 && i < documents.length)
      .map((i) => documents[i])
      .filter(Boolean);
    for (const doc of targets) {
      void ensurePreviewUrl(doc);
    }
  }, [visible, previewIndex, documents, ensurePreviewUrl]);

  useEffect(() => {
    if (!visible) return;
    if (documents.length === 0) {
      onClose();
      return;
    }
    if (previewIndex >= documents.length) {
      setPreviewIndex(documents.length - 1);
    }
  }, [documents.length, previewIndex, visible, onClose]);

  useEffect(() => {
    if (!visible || documents.length < 2) return;
    const thumbW = 56;
    thumbStripRef.current?.scrollTo({
      x: Math.max(0, previewIndex * (thumbW + 8) - windowWidth / 2 + thumbW),
      animated: true,
    });
  }, [visible, previewIndex, documents.length, windowWidth]);

  const activeDoc =
    previewIndex >= 0 && previewIndex < documents.length
      ? documents[previewIndex]
      : null;
  const activeUrl = activeDoc ? viewUrls[activeDoc.id] ?? null : null;
  const canGoPrev = previewIndex > 0;
  const canGoNext = previewIndex < documents.length - 1;

  const goToPreviewIndex = useCallback(
    (index: number, animated = true) => {
      if (index < 0 || index >= documents.length) return;
      setPreviewIndex(index);
      galleryRef.current?.scrollToIndex({ index, animated });
      if (!hasSwipedPreview) {
        setHasSwipedPreview(true);
        swipeHint.value = withTiming(0, { duration: 200 });
      }
    },
    [documents.length, hasSwipedPreview, swipeHint],
  );

  const onGalleryScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(windowWidth, 1));
      if (next === previewIndex) return;
      if (next < 0 || next >= documents.length) return;
      setPreviewIndex(next);
      if (!hasSwipedPreview) {
        setHasSwipedPreview(true);
        swipeHint.value = withTiming(0, { duration: 200 });
      }
    },
    [documents.length, hasSwipedPreview, previewIndex, swipeHint, windowWidth],
  );

  const galleryGetItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: windowWidth,
      offset: windowWidth * index,
      index,
    }),
    [windowWidth],
  );

  const renderGalleryItem = useCallback(
    ({ item }: { item: tripDocumentsService.TripDocumentRow }) => {
      const url = viewUrls[item.id];
      const failed = !!previewFailedIds[item.id];
      const loading = !url && !failed && previewResolvingId === item.id;
      const asPdf = isDriverDocPdf(item);
      const asImage = isDriverDocImage(item) || (!asPdf && !!url);
      return (
        <View style={[styles.galleryPage, { width: windowWidth }]}>
          <View style={styles.galleryFrame}>
            {url && !failed && asPdf ? (
              <PdfViewer pdfUri={url} style={styles.previewImage} />
            ) : url && !failed && asImage ? (
              <Image
                source={{ uri: url }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => {
                  if (!autoRetriedIdsRef.current.has(item.id)) {
                    autoRetriedIdsRef.current.add(item.id);
                    void ensurePreviewUrl(item, { force: true });
                    return;
                  }
                  setPreviewFailedIds((prev) => ({ ...prev, [item.id]: true }));
                }}
              />
            ) : (
              <View style={styles.previewBody}>
                {failed ? (
                  <>
                    <Text style={styles.previewFallbackText}>
                      {asPdf
                        ? 'PDF preview not available.'
                        : 'Preview not available.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.previewBrowserBtn}
                      onPress={() => retryPreview(item)}
                    >
                      <Text style={styles.previewBrowserBtnText}>Retry</Text>
                    </TouchableOpacity>
                    {canOpenPreviewExternally(url) ? (
                      <TouchableOpacity
                        style={[styles.previewBrowserBtn, styles.previewBrowserBtnSecondary]}
                        onPress={() => void Linking.openURL(url)}
                      >
                        <Text style={styles.previewBrowserBtnText}>Open in browser</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : (
                  <>
                    <LoadingIndicator size="large" color={FLOW_EMERALD} />
                    <Text style={styles.previewLoadingText}>
                      {loading ? 'Loading…' : 'Opening…'}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      ensurePreviewUrl,
      previewFailedIds,
      previewResolvingId,
      retryPreview,
      viewUrls,
      windowWidth,
    ],
  );

  const previewCounterLabel = useMemo(() => {
    if (documents.length === 0) return '';
    return `${previewIndex + 1} / ${documents.length}`;
  }, [documents.length, previewIndex]);

  const swipeHintStyle = useAnimatedStyle(() => ({
    opacity: swipeHint.value,
    transform: [{ translateX: (1 - swipeHint.value) * -6 }],
  }));

  if (!visible) return null;

  const sheet = (
    <View style={styles.previewLayer} pointerEvents="box-none">
      <Pressable style={styles.previewBackdrop} onPress={onClose} />
      <View
        style={[
          styles.previewSheet,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            paddingTop: Math.max(insets.top, 8),
          },
        ]}
      >
        <View style={styles.previewTopBar}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityLabel="Close preview"
          >
            <FontAwesome name="times" size={14} color="#fff" />
            <Text style={styles.previewCloseText}>Close</Text>
          </TouchableOpacity>
          <View style={styles.previewCounterPill}>
            <Text style={styles.previewCounterText}>{previewCounterLabel}</Text>
          </View>
          {canOpenPreviewExternally(activeUrl) ? (
            <TouchableOpacity
              style={styles.previewOpenBtn}
              onPress={() => void Linking.openURL(activeUrl!)}
              accessibilityLabel="Open in browser"
            >
              <FontAwesome name="external-link" size={12} color={FLOW_MINT} />
            </TouchableOpacity>
          ) : (
            <View style={styles.previewOpenBtnGhost} />
          )}
        </View>

        <Text style={styles.previewFileName} numberOfLines={1}>
          {activeDoc?.file_name || fallbackLabel}
        </Text>

        <View style={styles.galleryWrap}>
          <FlatList
            key={`gallery-${documents.map((d) => d.id).join('|')}`}
            ref={galleryRef}
            data={documents}
            horizontal
            pagingEnabled
            bounces
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderGalleryItem}
            getItemLayout={galleryGetItemLayout}
            initialScrollIndex={Math.min(
              previewIndex,
              Math.max(0, documents.length - 1),
            )}
            onMomentumScrollEnd={onGalleryScrollEnd}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                galleryRef.current?.scrollToIndex({ index, animated: false });
              });
            }}
          />

          {documents.length > 1 ? (
            <>
              <TouchableOpacity
                style={[
                  styles.navChevron,
                  styles.navChevronLeft,
                  !canGoPrev && styles.navChevronDisabled,
                ]}
                disabled={!canGoPrev}
                onPress={() => goToPreviewIndex(previewIndex - 1)}
                accessibilityLabel="Previous document"
              >
                <ChevronLeft size={22} color="#fff" strokeWidth={2.4} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.navChevron,
                  styles.navChevronRight,
                  !canGoNext && styles.navChevronDisabled,
                ]}
                disabled={!canGoNext}
                onPress={() => goToPreviewIndex(previewIndex + 1)}
                accessibilityLabel="Next document"
              >
                <ChevronRight size={22} color="#fff" strokeWidth={2.4} />
              </TouchableOpacity>
            </>
          ) : null}

          {documents.length > 1 && !hasSwipedPreview ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.swipeHint, swipeHintStyle]}
            >
              <ChevronLeft size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.swipeHintText}>Swipe</Text>
              <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
            </Animated.View>
          ) : null}
        </View>

        {documents.length > 1 ? (
          <View style={styles.dotsRow}>
            {documents.map((doc, i) => (
              <Pressable
                key={doc.id}
                onPress={() => goToPreviewIndex(i)}
                hitSlop={6}
                style={[styles.dot, i === previewIndex ? styles.dotActive : null]}
              />
            ))}
          </View>
        ) : null}

        {documents.length > 1 ? (
          <ScrollView
            ref={thumbStripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStripContent}
            style={styles.thumbStrip}
          >
            {documents.map((doc, i) => {
              const thumb = viewUrls[doc.id];
              const active = i === previewIndex;
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => goToPreviewIndex(i)}
                  style={[styles.thumbChip, active && styles.thumbChipActive]}
                >
                  {thumb ? (
                    <Image
                      source={{ uri: thumb }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <FontAwesome
                        name="file-image-o"
                        size={12}
                        color="rgba(255,255,255,0.55)"
                      />
                    </View>
                  )}
                  {active ? <View style={styles.thumbActiveBar} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );

  if (asOverlay) return sheet;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>{sheet}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  previewLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 18, 14, 0.94)',
  },
  previewSheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 10,
  },
  previewClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  previewCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  previewCounterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,243,208,0.45)',
  },
  previewCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: FLOW_MINT,
    letterSpacing: 0.4,
  },
  previewOpenBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  previewOpenBtnGhost: {
    width: 40,
    height: 40,
  },
  previewFileName: {
    marginTop: 8,
    marginHorizontal: 18,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },
  galleryWrap: {
    flex: 1,
    marginTop: 10,
    justifyContent: 'center',
  },
  galleryPage: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  galleryFrame: {
    flex: 1,
    maxHeight: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  navChevron: {
    position: 'absolute',
    top: '46%',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.88)',
    zIndex: 5,
  },
  navChevronLeft: {
    left: 10,
  },
  navChevronRight: {
    right: 10,
  },
  navChevronDisabled: {
    opacity: 0.28,
  },
  swipeHint: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swipeHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    width: 16,
    backgroundColor: FLOW_EMERALD,
  },
  thumbStrip: {
    maxHeight: 64,
    marginBottom: 4,
  },
  thumbStripContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  thumbChip: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumbChipActive: {
    borderColor: FLOW_EMERALD,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActiveBar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: FLOW_EMERALD,
  },
  previewBody: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  previewLoadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0b1220',
  },
  previewFallbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  previewBrowserBtn: {
    backgroundColor: FLOW_EMERALD,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  previewBrowserBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  previewBrowserBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
