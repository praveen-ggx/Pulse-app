import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import {
  listMyDriverKycDocuments,
  latestDriverKycDocument,
  getMyDriverKycSubmission,
  submitDriverKycForVerification,
  listDriverKycDocRequirements,
  withdrawDriverKycDocument,
  MANDATORY_DRIVER_KYC_DOC_TYPES,
  DCO_REQUIRED_KYC_DOC_TYPES,
  type DriverKycDocType,
  type DriverKycDocument,
  type DriverKycSubmission,
  type DriverKycDocRequirement,
} from '@/features/drivers/services/driverKycDocuments.service';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { showAppAlert } from '@/lib/appAlert';
import {
  useDriverKycDocUpload,
} from '@/features/drivers/hooks/useDriverKycDocUpload';
import { useCallback, useEffect, useMemo, useState } from 'react';

const DOC_DEFS: { key: DriverKycDocType; label: string; icon: keyof typeof FontAwesome.glyphMap }[] = [
  { key: 'license', label: 'Driving license', icon: 'car' },
  { key: 'aadhaar', label: 'Aadhaar', icon: 'id-card' },
  { key: 'pan', label: 'PAN', icon: 'credit-card' },
  { key: 'selfie', label: 'Selfie', icon: 'user-circle' },
];

function statusLabel(doc: DriverKycDocument | undefined): string {
  if (!doc?.storage_path) return 'Not added';
  switch (doc.status) {
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected — tap to re-upload';
    case 'expired':
      return 'Expired — tap to re-upload';
    default:
      return 'Pending review';
  }
}

function statusColor(doc: DriverKycDocument | undefined, colors: { emerald: string; textMuted: string }): string {
  if (!doc?.storage_path) return colors.textMuted;
  if (doc.status === 'verified') return colors.emerald;
  if (doc.status === 'rejected' || doc.status === 'expired') return Theme.negative;
  return Theme.accentGold;
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const [documents, setDocuments] = useState<DriverKycDocument[]>([]);
  const [submission, setSubmission] = useState<DriverKycSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requirements, setRequirements] = useState<DriverKycDocRequirement[]>([]);
  const [rejectedOptionalSheet, setRejectedOptionalSheet] = useState<{
    docId: string;
    docType: DriverKycDocType;
    label: string;
    reason: string | null;
  } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  /** Mandatory types from the server when available, constant as fallback. */
  const mandatoryTypes: readonly DriverKycDocType[] = requirements.length
    ? requirements.filter((r) => r.is_mandatory).map((r) => r.doc_type)
    : MANDATORY_DRIVER_KYC_DOC_TYPES;
  const isOptionalDoc = (type: DriverKycDocType) => !mandatoryTypes.includes(type);

  // This screen is driver documents only. DCO documents (PAN, bank proof) are
  // uploaded on the DCO status screen; once a driver has a DCO request, PAN is
  // managed there so the two lists never show the same document.
  const { status: dcoStatus } = useDcoStatusQuery(profile?.uid);
  const onDcoPath = dcoStatus !== 'NONE';
  const dcoTypes: readonly DriverKycDocType[] = requirements.length
    ? requirements.filter((r) => r.required_for_dco).map((r) => r.doc_type)
    : DCO_REQUIRED_KYC_DOC_TYPES;
  const isDcoRequiredDoc = (type: DriverKycDocType) =>
    onDcoPath && isOptionalDoc(type) && dcoTypes.includes(type);

  const docsByType = useMemo(() => {
    const map = new Map<DriverKycDocType, DriverKycDocument>();
    for (const def of DOC_DEFS) {
      const latest = latestDriverKycDocument(documents, def.key);
      if (latest) map.set(def.key, latest);
    }
    return map;
  }, [documents]);
  const driverDocDefs = DOC_DEFS.filter(
    (d) => !isDcoRequiredDoc(d.key),
  );
  const uploadedCount = driverDocDefs.filter((d) => docsByType.get(d.key)?.storage_path).length;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  };

  const loadDocuments = useCallback(async () => {
    // On a failed load keep what is on screen. Replacing it with an empty list
    // told the driver "Not added" for documents they had already uploaded.
    const { documents: docs, error: docsError } = await listMyDriverKycDocuments();
    const { submission: sub, error: subError } = await getMyDriverKycSubmission();
    if (docsError || subError) {
      showAppAlert(
        "Couldn't load your documents",
        'Check your connection and open this screen again. Your uploaded documents are safe.',
      );
      return;
    }
    setDocuments(docs);
    setSubmission(sub);
    setRequirements(await listDriverKycDocRequirements());
  }, []);
  const { uploadingDocKey, uploadDocumentFrom, promptUpload } = useDriverKycDocUpload(loadDocuments);

  // Submit unlocks only when every mandatory doc is uploaded and none is still
  // carrying a rejection — the same rule the RPC enforces server-side. A doc
  // the driver has replaced is back to 'pending', so it no longer blocks.
  // Only rejected MANDATORY documents block submission — same rule the RPC
  // enforces. A rejected optional doc can be re-uploaded or withdrawn, so it
  // must not gate the button.
  const rejectedDocTypes = mandatoryTypes.filter(
    (type) => docsByType.get(type)?.status === 'rejected',
  );
  const rejectedOptionalTypes = DOC_DEFS.map((d) => d.key).filter(
    (type) =>
      isOptionalDoc(type) && !isDcoRequiredDoc(type) && docsByType.get(type)?.status === 'rejected',
  );
  // Only mandatory documents gate submission, so a driver with no PAN card
  // can still get verified.
  const missingDocCount = mandatoryTypes.filter(
    (type) => !docsByType.get(type)?.storage_path,
  ).length;
  const allMandatoryReady = missingDocCount === 0 && rejectedDocTypes.length === 0;

  const awaitingReview = submission?.review_status === 'submitted';
  const isApproved = submission?.review_status === 'approved';
  const wasRejected = submission?.review_status === 'rejected';
  // Approved is terminal; awaiting review has nothing to do. Everything else —
  // including a rejected submission — must be able to submit again, otherwise
  // a rejected driver is locked out of the queue permanently.
  const canSubmitAgain = !awaitingReview && !isApproved;

  const submitLabel = (): string => {
    if (submitting) return 'Submitting...';
    if (missingDocCount > 0) {
      return `Upload ${missingDocCount} more required document${missingDocCount === 1 ? '' : 's'}`;
    }
    if (rejectedDocTypes.length > 0) return 'Replace the rejected documents first';
    return wasRejected ? 'Re-submit for verification' : 'Submit for verification';
  };

  const handleSubmitForVerification = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await submitDriverKycForVerification();
      if (error) {
        Alert.alert('Could not submit', error.message);
        return;
      }
      await loadDocuments();
      Alert.alert('Submitted', 'Your documents are now with our team for verification.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Realtime: admin approves/rejects → driver sees it immediately, no polling.
  // Shared channel keyed per-driver so re-mounting this screen doesn't open a
  // second subscription for the same user (registry dedupes by key).
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeSharedPostgresChanges(
      `driver-kyc-docs:${profile.uid}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'driver_kyc_documents',
          filter: `driver_user_id=eq.${profile.uid}`,
        },
      ],
      () => {
        void loadDocuments();
      },
    );
    return unsubscribe;
  }, [profile?.uid, loadDocuments]);

  const handleWithdraw = async (documentId: string, label: string) => {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      const { error } = await withdrawDriverKycDocument(documentId);
      if (error) {
        Alert.alert('Could not remove', error.message);
        return;
      }
      setRejectedOptionalSheet(null);
      await loadDocuments();
      Alert.alert('Removed', `${label} removed. You can submit without it.`);
    } finally {
      setWithdrawing(false);
    }
  };

  const onDocumentPress = (docType: DriverKycDocType, label: string) => {
    const doc = docsByType.get(docType);

    // A rejected OPTIONAL document must be escapable: a driver who uploaded the
    // wrong file because they have no PAN at all would otherwise be stuck
    // forever, unable to fix it and unable to remove it. Needs three choices,
    // so it gets a real sheet rather than a two-button Alert/confirm.
    if (doc?.id && doc.status === 'rejected' && isOptionalDoc(docType) && !isDcoRequiredDoc(docType)) {
      setRejectedOptionalSheet({
        docId: doc.id,
        docType,
        label,
        reason: doc.rejection_notes ?? null,
      });
      return;
    }

    promptUpload(doc, docType, label);
  };

  const renderDocRow = (
    def: (typeof DOC_DEFS)[number],
    idx: number,
  ) => {
    const doc = docsByType.get(def.key);
    return (
      <TouchableOpacity
        key={def.key}
        style={[styles.docRow, idx === 0 ? { borderTopWidth: 0 } : { borderTopColor: colors.border }]}
        onPress={() => onDocumentPress(def.key, def.label)}
        activeOpacity={0.7}
        disabled={uploadingDocKey != null}
      >
        <View style={styles.docRowLeft}>
          <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
            <FontAwesome name={def.icon} size={14} color={colors.emerald} />
          </View>
          <View style={styles.docRowLabelCol}>
            <View style={styles.docRowLabelLine}>
              <Text style={[styles.docRowLabel, { color: colors.text }]}>
                {def.label}
                {/* Asterisk marks required; "Optional" marks the rest.
                    Both stated explicitly so neither is inferred. */}
                {!isOptionalDoc(def.key) ? (
                  <Text style={styles.docRowRequiredStar}> *</Text>
                ) : null}
              </Text>
              {isOptionalDoc(def.key) ? (
                <Text style={[styles.docRowOptional, { color: colors.textMuted }]}>
                  Optional
                </Text>
              ) : null}
            </View>
            {/* The reviewer's reason has to be readable without tapping —
                a driver who can't see why it failed can't fix it. */}
            {doc?.status === 'rejected' && doc.rejection_notes ? (
              <Text style={[styles.docRowReason, { color: Theme.negative }]}>
                {doc.rejection_notes}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.docRowRight}>
          <Text
            style={[styles.docRowStatus, { color: statusColor(doc, colors) }]}
            numberOfLines={1}
          >
            {uploadingDocKey === def.key ? 'Uploading...' : statusLabel(doc)}
          </Text>
          <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="KYC & documents" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: insets.bottom + 80,
          paddingTop: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLead, { color: colors.text }]}>Verification upgrade</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Upload and verify your proof of identity. One place for all driver compliance.
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          {mandatoryTypes.length - missingDocCount}/{mandatoryTypes.length} required uploaded
          {uploadedCount > mandatoryTypes.length - missingDocCount
            ? ` · ${uploadedCount - (mandatoryTypes.length - missingDocCount)} optional`
            : ''}
        </Text>
        <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>ID & proof</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {driverDocDefs.map(renderDocRow)}
        </View>

        {submission ? (
          <View style={[styles.submitStatusCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Text style={[styles.submitStatusTitle, { color: colors.text }]}>
              {submission.review_status === 'approved'
                ? 'Verification approved'
                : submission.review_status === 'rejected'
                  ? 'Verification rejected'
                  : 'Awaiting verification'}
            </Text>
            <Text style={[styles.submitStatusBody, { color: colors.textMuted }]}>
              {submission.review_status === 'submitted'
                ? 'Our team is reviewing your documents. You will be notified once done.'
                : submission.review_notes || 'Reviewed by our verification team.'}
            </Text>
            {wasRejected && rejectedDocTypes.length > 0 ? (
              <Text style={[styles.submitStatusAction, { color: Theme.negative }]}>
                Tap to re-upload:{' '}
                {rejectedDocTypes
                  .map((t) => DOC_DEFS.find((d) => d.key === t)?.label ?? t)
                  .join(', ')}
              </Text>
            ) : null}
            {wasRejected && rejectedDocTypes.length === 0 ? (
              <Text style={[styles.submitStatusAction, { color: colors.emerald }]}>
                Documents replaced — re-submit below.
              </Text>
            ) : null}
          </View>
        ) : null}

        {rejectedOptionalTypes.length > 0 ? (
          <Text style={[styles.optionalHint, { color: colors.textMuted }]}>
            {rejectedOptionalTypes
              .map((t) => DOC_DEFS.find((d) => d.key === t)?.label ?? t)
              .join(', ')}{' '}
            was rejected but isn&apos;t required — tap it to upload a new file, or to remove it
            if you don&apos;t have one.
          </Text>
        ) : null}

        {canSubmitAgain ? (
          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: allMandatoryReady ? colors.emerald : colors.border,
                opacity: submitting ? 0.6 : 1,
              },
            ]}
            onPress={() => void handleSubmitForVerification()}
            activeOpacity={0.85}
            disabled={!allMandatoryReady || submitting}
          >
            <Text
              style={[
                styles.submitBtnText,
                { color: allMandatoryReady ? '#fff' : colors.textMuted },
              ]}
            >
              {submitLabel()}
            </Text>
          </TouchableOpacity>
        ) : null}

      </ScrollView>

      {/* Rejected optional document → three real choices, not a browser confirm. */}
      <Modal
        visible={rejectedOptionalSheet !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectedOptionalSheet(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 },
            ]}
          >
            <View style={[styles.sheetIcon, { backgroundColor: Theme.negativeMuted }]}>
              <FontAwesome name="exclamation" size={16} color={Theme.negative} />
            </View>

            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {rejectedOptionalSheet?.label} was rejected
            </Text>

            {rejectedOptionalSheet?.reason ? (
              <Text style={[styles.sheetReason, { color: Theme.negative }]}>
                {rejectedOptionalSheet.reason}
              </Text>
            ) : null}

            <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
              This document is optional. Upload a corrected copy, or remove it if you
              don&apos;t have one — either way you can continue.
            </Text>

            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { backgroundColor: colors.emerald }]}
              activeOpacity={0.85}
              disabled={withdrawing}
              onPress={() => {
                const sheet = rejectedOptionalSheet;
                setRejectedOptionalSheet(null);
                if (sheet) void uploadDocumentFrom(sheet.docType, sheet.label, 'gallery');
              }}
            >
              <Text style={styles.sheetPrimaryBtnText}>Upload a new file</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]}
              activeOpacity={0.85}
              disabled={withdrawing}
              onPress={() => {
                if (rejectedOptionalSheet) {
                  void handleWithdraw(
                    rejectedOptionalSheet.docId,
                    rejectedOptionalSheet.label,
                  );
                }
              }}
            >
              <Text style={[styles.sheetSecondaryBtnText, { color: Theme.negative }]}>
                {withdrawing
                  ? 'Removing...'
                  : `I don't have a ${rejectedOptionalSheet?.label ?? 'document'}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              activeOpacity={0.7}
              disabled={withdrawing}
              onPress={() => setRejectedOptionalSheet(null)}
            >
              <Text style={[styles.sheetCancelBtnText, { color: colors.textMuted }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  submitBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  submitStatusCard: {
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  submitStatusTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  submitStatusBody: { fontSize: 12, lineHeight: 17 },
  submitStatusAction: { fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 6 },
  optionalHint: { fontSize: 12, lineHeight: 17, marginTop: 14, paddingHorizontal: 2 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    alignItems: 'center',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sheetReason: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  sheetBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  sheetPrimaryBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetPrimaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  sheetSecondaryBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 10,
  },
  sheetSecondaryBtnText: { fontSize: 14, fontWeight: '700' },
  sheetCancelBtn: { paddingVertical: 14, marginTop: 4 },
  sheetCancelBtnText: { fontSize: 13, fontWeight: '600' },
  sectionLead: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
    paddingHorizontal: 2,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  docRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  docRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRowLabelCol: { flex: 1, minWidth: 0, gap: 2 },
  docRowLabelLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  docRowLabel: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary },
  docRowOptional: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  docRowRequiredStar: { fontSize: 15, fontWeight: '700', color: Theme.negative },
  docRowReason: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
  docRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '45%' },
  docRowStatus: { fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
