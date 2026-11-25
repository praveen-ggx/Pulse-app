/**
 * Full-screen stage attachment flow (POD at drop, or LR/order/pickup proof before transit).
 * Preview lives inside this Modal (sibling Modals sit under fullscreen → eye would do nothing).
 */
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import {
  FLOW_EMERALD,
  FLOW_EMERALD_DARK,
  FLOW_MINT,
  TRIP_SHEET_BODY_PAD,
  TRIP_SHEET_BTN_HEIGHT,
} from '@/components/driver/DriverTripSheetLayout';
import { DriverDocumentGalleryPreview } from '@/features/driver/components/DriverDocumentGalleryPreview';
import type * as tripDocumentsService from '@/features/trips/services/tripDocuments.service';
import { findOrgDuplicateLrNumberForTrip } from '@/features/trips/services/orgLrDuplicate.service';
import {
  normalizeOrgLrNumber,
  ORG_LR_DUPLICATE_MESSAGE,
} from '@/features/trips/services/orgLrNumber.util';
import { ThemedAlertModal } from '@/components/ThemedAlertModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, Route } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DriverStageAttachmentVariant = 'pod' | 'lr';

export type DriverPodCompletionPageProps = {
  visible: boolean;
  variant?: DriverStageAttachmentVariant;
  onCloseToMap: () => void;
  /** Destination context — drop for POD, pickup for LR. */
  placeLabel: string;
  earnings: string;
  /** Defaults to EST. EARNINGS. */
  earningsLabel?: string;
  documents: tripDocumentsService.TripDocumentRow[];
  viewUrls: Record<string, string>;
  docsLoading: boolean;
  uploading: boolean;
  skipped: boolean;
  deletingId: string | null;
  actionBusy?: boolean;
  stepError: string | null;
  onUpload: (source: 'camera' | 'library') => void;
  onCancelUpload: () => void;
  onSkip: () => void;
  /** LR number, entered before upload. Only rendered/used when variant='lr'. */
  lrNumber?: string;
  onChangeLrNumber?: (value: string) => void;
  tripId?: string | null;
  /** Resolves a signed preview URL (and caches on parent). Pass force to bypass cache. */
  onResolvePreview: (
    doc: tripDocumentsService.TripDocumentRow,
    opts?: { force?: boolean },
  ) => Promise<string | null>;
  onDelete: (doc: tripDocumentsService.TripDocumentRow) => void;
  /** Runs after user confirms Complete in the dialog. */
  onConfirmAction: () => void;
  /**
   * Optional informational slot above the action button — used by the
   * Compliance module (variant='lr' only) to show a non-blocking "Compliance
   * pending" notice. Purely additive: passing null/undefined renders nothing,
   * and this component has no compliance logic of its own.
   */
  complianceNotice?: React.ReactNode;
};

const VARIANT_COPY = {
  pod: {
    eyebrow: 'FINISH DELIVERY',
    title: 'Almost done',
    subtitle: (place: string) =>
      `At ${place || 'drop-off'} · upload POD (preferred), then complete`,
    section: 'PROOF OF DELIVERY',
    uploadTitle: 'Upload POD',
    uploadHintEmpty: 'Receipt, stamp, or package',
    uploadHintReady: 'Add another photo if needed',
    skip: 'Skip for now',
    skipped: 'Skipped for now',
    action: 'Complete delivery',
    actionBusyLabel: 'Completing…',
    confirmTitle: 'Complete delivery?',
    confirmMessage: 'Finish this trip and mark delivery complete.',
    confirmAction: 'Complete',
    footerHint: 'Upload POD (preferred), or skip for now to complete',
    actionIcon: 'check-circle' as const,
    steps: [
      { id: 'pickup', label: 'Pickup' },
      { id: 'transit', label: 'Transit' },
      { id: 'pod', label: 'POD' },
      { id: 'done', label: 'Done' },
    ],
  },
  lr: {
    eyebrow: 'START TRANSIT',
    title: 'Attach pickup proof',
    subtitle: (place: string) =>
      `At ${place || 'pickup'} · LR, order copy, or pickup photo`,
    section: 'LR / ORDER COPY / PICKUP PROOF',
    uploadTitle: 'Upload attachment',
    uploadHintEmpty: 'LR, order copy, or pickup photo',
    uploadHintReady: 'Add another, or hold to start transit',
    skip: 'Skip attachment',
    skipped: 'Skipped',
    action: 'Start transit',
    actionBusyLabel: 'Starting…',
    confirmTitle: 'Start transit?',
    confirmMessage: 'Leave pickup and begin the trip to drop-off.',
    confirmAction: 'Start transit',
    footerHint: 'Upload or skip attachment to unlock transit',
    actionIcon: 'truck' as const,
    steps: [
      { id: 'arrive', label: 'Arrive' },
      { id: 'collect', label: 'Collect' },
      { id: 'attach', label: 'Attach' },
      { id: 'transit', label: 'Transit' },
    ],
  },
} as const;

export function DriverPodCompletionPage({
  visible,
  variant = 'pod',
  onCloseToMap,
  placeLabel,
  earnings,
  earningsLabel = 'EST. EARNINGS',
  documents,
  viewUrls,
  docsLoading,
  uploading,
  skipped,
  deletingId,
  actionBusy = false,
  stepError,
  onUpload,
  onCancelUpload,
  onSkip,
  lrNumber = '',
  onChangeLrNumber,
  tripId,
  onResolvePreview,
  onDelete,
  onConfirmAction,
  complianceNotice,
}: DriverPodCompletionPageProps) {
  const insets = useSafeAreaInsets();
  const copy = VARIANT_COPY[variant];
  const canComplete = documents.length >= 1 || skipped;
  const flowSteps = copy.steps;
  const pulse = useSharedValue(0);

  /** Index into `documents` while gallery is open; null = closed. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [lrIsDuplicate, setLrIsDuplicate] = useState(false);
  const [lrDuplicateAlertVisible, setLrDuplicateAlertVisible] = useState(false);

  const closePreview = useCallback(() => {
    setPreviewIndex(null);
  }, []);

  useEffect(() => {
    if (!visible) closePreview();
  }, [visible, closePreview]);

  useEffect(() => {
    if (variant !== 'lr' || !visible) {
      setLrIsDuplicate(false);
      return;
    }
    const id = (tripId ?? '').trim();
    if (!id || !normalizeOrgLrNumber(lrNumber)) {
      setLrIsDuplicate(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void findOrgDuplicateLrNumberForTrip({ tripId: id, lrNumber }).then((duplicate) => {
        if (cancelled) return;
        const isDuplicate = Boolean(duplicate);
        setLrIsDuplicate(isDuplicate);
        if (isDuplicate) setLrDuplicateAlertVisible(true);
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [variant, visible, tripId, lrNumber]);

  const requestUpload = (source: 'camera' | 'library') => {
    if (variant === 'lr' && lrIsDuplicate) {
      setLrDuplicateAlertVisible(true);
      return;
    }
    onUpload(source);
  };

  useEffect(() => {
    if (!visible || canComplete) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [visible, canComplete, pulse]);

  const uploadPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.012 }],
  }));

  const openPreview = useCallback(
    (doc: tripDocumentsService.TripDocumentRow) => {
      const idx = documents.findIndex((d) => d.id === doc.id);
      setPreviewIndex(idx >= 0 ? idx : 0);
    },
    [documents],
  );

  const requestConfirmAction = useCallback(() => {
    if (actionBusy) return;
    const title = copy.confirmTitle;
    const message = copy.confirmMessage;
    if (Platform.OS === 'web') {
      const w =
        typeof globalThis !== 'undefined'
          ? (globalThis as { confirm?: (msg: string) => boolean }).confirm
          : undefined;
      if (typeof w === 'function' && w(`${title}\n\n${message}`)) {
        onConfirmAction();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Back', style: 'cancel' },
      {
        text: copy.confirmAction,
        onPress: () => onConfirmAction(),
      },
    ]);
  }, [
    actionBusy,
    copy.confirmAction,
    copy.confirmMessage,
    copy.confirmTitle,
    onConfirmAction,
  ]);

  const previewOpen = previewIndex != null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={previewOpen ? closePreview : onCloseToMap}
    >
      <View style={styles.root}>
        <StatusBar style="light" />
        <LinearGradient
          colors={[FLOW_EMERALD_DARK, FLOW_EMERALD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroChrome, { paddingTop: insets.top }]}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onCloseToMap}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to map"
              hitSlop={8}
            >
              <ChevronLeft size={20} color="#fff" strokeWidth={2.4} />
              <Text style={styles.backText}>Map</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Route size={11} color={FLOW_MINT} strokeWidth={2.5} />
              <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{copy.title}</Text>
            <Text style={styles.heroSubtitle} numberOfLines={2}>
              {copy.subtitle(placeLabel)}
            </Text>

            <View style={styles.flowRail}>
              {flowSteps.map((s, index) => {
                const done = index < 2 || (index === 2 && canComplete);
                const current = index === 2 && !canComplete;
                return (
                  <React.Fragment key={s.id}>
                    {index > 0 ? (
                      <View
                        style={[styles.flowLine, (done || current) && styles.flowLineOn]}
                      />
                    ) : null}
                    <View style={styles.flowStep}>
                      <View
                        style={[
                          styles.flowDot,
                          done && styles.flowDotDone,
                          current && styles.flowDotCurrent,
                          index === 3 && canComplete && styles.flowDotReady,
                        ]}
                      >
                        {done ? (
                          <Check size={10} color={FLOW_EMERALD} strokeWidth={3} />
                        ) : (
                          <Text
                            style={[
                              styles.flowDotNum,
                              current && styles.flowDotNumCurrent,
                            ]}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.flowLabel,
                          (done || current) && styles.flowLabelOn,
                        ]}
                      >
                        {s.label}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

          </View>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stepError ? (
            <View style={styles.errorWrap}>
              <FontAwesome name="exclamation-circle" size={12} color={Theme.negative} />
              <Text style={styles.errorText} numberOfLines={3}>
                {stepError}
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{copy.section}</Text>
            {docsLoading ? (
              <LoadingIndicator size="small" color={FLOW_EMERALD} />
            ) : (
              <Text style={styles.fileCount}>
                {documents.length} file{documents.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>

          <Text style={styles.uploadLead} numberOfLines={1}>
            {uploading
              ? 'Uploading…'
              : canComplete
                ? copy.uploadHintReady
                : copy.uploadHintEmpty}
          </Text>

          {variant === 'lr' ? (
            <View style={styles.lrNumberField}>
              <Text
                style={[
                  styles.lrNumberLabel,
                  lrIsDuplicate ? styles.lrNumberLabelError : null,
                ]}
              >
                LR NUMBER
              </Text>
              <TextInput
                value={lrNumber ?? ''}
                onChangeText={(value) => {
                  setLrIsDuplicate(false);
                  onChangeLrNumber?.(value);
                }}
                placeholder="Enter LR number (optional)"
                placeholderTextColor={Theme.textMuted}
                style={[
                  styles.lrNumberInput,
                  lrIsDuplicate ? styles.lrNumberInputError : null,
                ]}
                autoCapitalize="characters"
                editable={!uploading}
                returnKeyType="done"
              />
              {lrIsDuplicate ? (
                <Text style={styles.lrNumberDuplicateHint}>{ORG_LR_DUPLICATE_MESSAGE}</Text>
              ) : null}
            </View>
          ) : null}

          <Animated.View style={[styles.uploadTilesRow, uploadPulseStyle]}>
            <TouchableOpacity
              style={[styles.uploadTile, uploading && styles.uploadZoneBusy]}
              onPress={() => requestUpload('camera')}
              disabled={uploading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
            >
              <View style={styles.uploadIconPlate}>
                {uploading ? (
                  <LoadingIndicator size="small" color={FLOW_EMERALD} />
                ) : (
                  <FontAwesome name="camera" size={16} color={FLOW_EMERALD} />
                )}
              </View>
              <Text style={styles.uploadTitle}>Camera</Text>
              <Text style={styles.uploadHint} numberOfLines={1}>
                Live photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadTile, uploading && styles.uploadZoneBusy]}
              onPress={() => requestUpload('library')}
              disabled={uploading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Choose from photo library"
            >
              <View style={styles.uploadIconPlate}>
                {uploading ? (
                  <LoadingIndicator size="small" color={FLOW_EMERALD} />
                ) : (
                  <FontAwesome name="image" size={16} color={FLOW_EMERALD} />
                )}
              </View>
              <Text style={styles.uploadTitle}>Library</Text>
              <Text style={styles.uploadHint} numberOfLines={1}>
                Existing photo
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.secondaryActions}>
            {uploading ? (
              <TouchableOpacity onPress={onCancelUpload} style={styles.skipBtn} hitSlop={6}>
                <Text style={styles.skipMuted}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onSkip}
                style={styles.skipBtn}
                disabled={skipped}
                hitSlop={6}
              >
                <Text style={[styles.skipEm, skipped && { opacity: 0.45 }]}>
                  {skipped ? copy.skipped : copy.skip}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {documents.length > 0 ? (
            <View style={styles.fileList}>
              {documents.map((doc) => {
                const thumb = viewUrls[doc.id];
                return (
                  <View key={doc.id} style={styles.fileRow}>
                    <Pressable
                      onPress={() => openPreview(doc)}
                      style={styles.fileThumbWrap}
                      accessibilityLabel={`View ${doc.file_name || 'POD'}`}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.fileThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.fileThumbFallback}>
                          <FontAwesome
                            name="file-image-o"
                            size={13}
                            color={Theme.textMuted}
                          />
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.fileTextCol}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {doc.file_name || 'POD'}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {doc.document_number ? `LR #${doc.document_number}` : 'Ready'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openPreview(doc)}
                      style={styles.fileIconBtn}
                      accessibilityLabel="View POD"
                      hitSlop={4}
                    >
                      <FontAwesome name="eye" size={13} color={FLOW_EMERALD} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDelete(doc)}
                      style={[styles.fileIconBtn, styles.fileDeleteBtn]}
                      disabled={deletingId === doc.id}
                      accessibilityLabel="Delete POD"
                      hitSlop={4}
                    >
                      {deletingId === doc.id ? (
                        <LoadingIndicator size="small" color={Theme.negative} />
                      ) : (
                        <FontAwesome name="trash-o" size={13} color={Theme.negative} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              // Web keeps the floating driver tab dock above RN Modals; native
              // fullScreen covers it — only pad the dock height on web.
              paddingBottom:
                Math.max(insets.bottom, 10) +
                (Platform.OS === 'web' ? Layout.tabBarDockHeight + 8 : 12),
              backgroundColor: Theme.surface,
            },
          ]}
        >
          {complianceNotice}
          <View style={styles.footerEarnRow}>
            <View style={styles.earnIcon}>
              <FontAwesome name="money" size={12} color={FLOW_EMERALD} />
            </View>
            <View style={styles.earnTextCol}>
              <Text style={styles.earnLabel}>{earningsLabel}</Text>
              <Text style={styles.earnValue} numberOfLines={1}>
                {earnings}
              </Text>
            </View>
          </View>

          {canComplete ? (
            <TouchableOpacity
              onPress={requestConfirmAction}
              disabled={actionBusy}
              activeOpacity={0.9}
              style={[styles.primaryActionBtn, actionBusy && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={copy.action}
            >
              <LinearGradient
                colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryActionGradient}
              >
                {actionBusy ? (
                  <LoadingIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name={copy.actionIcon} size={16} color="#fff" />
                )}
                <Text style={styles.primaryActionText} numberOfLines={1}>
                  {actionBusy ? copy.actionBusyLabel : copy.action}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerHint}>
              <Text style={styles.footerHintText}>{copy.footerHint}</Text>
            </View>
          )}
        </View>

        <DriverDocumentGalleryPreview
          visible={previewOpen}
          asOverlay
          documents={documents}
          viewUrls={viewUrls}
          initialIndex={previewIndex ?? 0}
          onClose={closePreview}
          onResolvePreview={onResolvePreview}
          fallbackLabel={variant === 'lr' ? 'Attachment' : 'POD'}
        />
      </View>
      <ThemedAlertModal
        visible={lrDuplicateAlertVisible}
        title="LR already exists"
        message={ORG_LR_DUPLICATE_MESSAGE}
        okText="OK"
        variant="warning"
        onOk={() => setLrDuplicateAlertVisible(false)}
        onRequestClose={() => setLrDuplicateAlertVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: FLOW_EMERALD_DARK,
  },
  heroChrome: {
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    minWidth: 56,
    minHeight: 40,
  },
  backText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  headerEyebrow: {
    color: FLOW_MINT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSpacer: { minWidth: 56 },
  heroBody: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    gap: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FLOW_MINT,
    lineHeight: 18,
  },
  flowRail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  flowStep: {
    alignItems: 'center',
    gap: 4,
    minWidth: 40,
  },
  flowDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowDotDone: {
    backgroundColor: '#fff',
  },
  flowDotCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fff',
  },
  flowDotReady: {
    borderWidth: 2,
    borderColor: FLOW_MINT,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  flowDotNum: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
  },
  flowDotNumCurrent: {
    color: '#fff',
  },
  flowLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  flowLabelOn: {
    color: '#fff',
  },
  flowLine: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginTop: 10,
    marginHorizontal: 2,
  },
  flowLineOn: {
    backgroundColor: '#fff',
  },
  footerEarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  earnIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  earnValue: {
    fontSize: 17,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
  },
  earnLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.55,
    color: Theme.textMuted,
  },
  scroll: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scrollContent: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 14,
    gap: 10,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.negativeMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.negative,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: Theme.textMuted,
  },
  fileCount: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  uploadLead: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  lrNumberField: {
    gap: 4,
  },
  lrNumberLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Theme.textMuted,
  },
  lrNumberLabelError: {
    color: Theme.negative,
  },
  lrNumberInput: {
    borderWidth: 1.5,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  lrNumberInputError: {
    borderColor: Theme.negative,
    backgroundColor: Theme.negativeMuted,
    color: Theme.negative,
  },
  lrNumberDuplicateHint: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    color: Theme.negative,
  },
  uploadTilesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  uploadTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: FLOW_EMERALD,
    backgroundColor: Theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  uploadZoneBusy: {
    opacity: 0.72,
  },
  uploadIconPlate: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  uploadHint: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  skipBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: 6,
  },
  skipEm: {
    fontSize: 13,
    fontWeight: '700',
    color: FLOW_EMERALD,
  },
  skipMuted: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  fileList: {
    gap: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  fileThumbWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  fileThumb: {
    width: '100%',
    height: '100%',
  },
  fileThumbFallback: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  fileMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: FLOW_EMERALD,
  },
  fileIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.driverEmeraldMuted,
  },
  fileDeleteBtn: {
    backgroundColor: Theme.negativeMuted,
  },
  footer: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  primaryActionBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryActionGradient: {
    minHeight: TRIP_SHEET_BTN_HEIGHT + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
    color: '#fff',
  },
  footerHint: {
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
  },
  footerHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMuted,
    textAlign: 'center',
  },
  btnDisabled: { opacity: 0.7 },
});
