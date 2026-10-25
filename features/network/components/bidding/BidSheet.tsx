/**
 * BidSheet — story load bid entry on one page:
 * Amount ↔ Note field switch toggles DecimalKeypad ↔ PersonNameKeypad
 * (same keypad standards as indent amount + driver-name flows).
 * Layout mirrors FullscreenNumericEntry: mobile pay tray, tablet modal, desktop drawer.
 */
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { DecimalKeypad, PAY_KEYPAD_CELL_PAD, PAY_KEYPAD_INSET } from '@/components/mobile-input/DecimalKeypad';
import { triggerFeedback } from '@/components/mobile-input/feedback';
import {
  applyKeypadPress,
  isKeypadValueSubmittable,
  type KeypadKey,
} from '@/components/mobile-input/keypad';
import type { NumericEntryPartyPreview } from '@/components/mobile-input/NumericEntryPartyBanner';
import { NumericDisplay } from '@/components/mobile-input/NumericDisplay';
import { NumericEntryRecipientHero } from '@/components/mobile-input/NumericEntryRecipientHero';
import { BidVsTargetHint } from '@/components/mobile-input/BidVsTargetHint';
import { CancelBidChip } from '@/components/mobile-input/CancelBidChip';
import { MatchTargetLink } from '@/components/mobile-input/MatchTargetLink';
import { resolveBidVsTarget } from '@/components/mobile-input/bidVsTarget';
import { parseRawToNumber, toRawString } from '@/components/mobile-input';
import { useInputPlatform } from '@/components/mobile-input/useInputPlatform';
import { usePhysicalKeypadInput } from '@/components/mobile-input/usePhysicalKeypadInput';
import { KeypadDisplayValueWithCaret } from '@/components/party/keypad/KeypadDisplayValueWithCaret';
import { PersonNameKeypad } from '@/components/party/keypad/PersonNameKeypad';
import Theme from '@/constants/Theme';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  getBroadcastIndentTarget,
  getVisibleIndentById,
} from '@/features/indents/services/indents.service';
import { resolveCommercialOpportunity } from '@/features/marketplace/domain';
import { BidConfirmModal, type BidConfirmPhase } from '@/features/network/components/bidding/BidConfirmModal';
import { withdrawBid, type BidRow } from '@/features/network/services/bids.service';
import { type PostRow } from '@/features/network/services/posts.service';
import { formatINR } from '@/lib/format';
import { useSubmitBidMutation } from '@/lib/queries/useBidsQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MessageSquare } from 'lucide-react-native';
import { MotiView } from 'moti';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NOTE_MAX_LENGTH = 80;

interface BidSheetProps {
  visible: boolean;
  post: PostRow | null;
  orgId: string;
  existingBid?: BidRow | null;
  initialAmount?: number | null;
  initialNote?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function cityPart(label: string | null | undefined): string {
  const raw = (label ?? '').trim();
  if (!raw) return '';
  return raw.split(',')[0]?.trim() || raw;
}

/** Letter + space for optional bid note (alphabet keypad). */
function appendNoteKey(value: string, key: string, maxLength = NOTE_MAX_LENGTH): string {
  if (key === '⌫') return value.slice(0, -1);
  if (key === ' ') {
    if (!value.length || value.endsWith(' ')) return value;
    if (value.length >= maxLength) return value;
    return `${value} `;
  }
  if (!/^[A-Za-z]$/.test(key)) return value;
  if (value.length >= maxLength) return value;
  const atWordStart = value.length === 0 || value.endsWith(' ');
  const next = atWordStart ? key.toUpperCase() : key.toLowerCase();
  return `${value}${next}`;
}

type ActiveField = 'amount' | 'note';

export function BidSheet({
  visible,
  post,
  orgId,
  existingBid,
  initialAmount,
  initialNote,
  onClose,
  onSuccess,
}: BidSheetProps) {
  const insets = useSafeAreaInsets();
  const platform = useInputPlatform();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const [activeField, setActiveField] = useState<ActiveField>('amount');
  const [amountRaw, setAmountRaw] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState<BidConfirmPhase>('review');
  /** Freeze edit vs place for the confirm/success card while celebration runs. */
  const [confirmIsEditMode, setConfirmIsEditMode] = useState(false);
  const [confirmIntent, setConfirmIntent] = useState<'submit' | 'withdraw'>(
    'submit',
  );
  const pendingQuoteInvalidateRef = useRef<string | null>(null);
  /**
   * Blocks form reseed while review/success is showing. A ref (not only
   * confirmOpen state) so cache-driven re-renders cannot clear success before
   * the next paint commits confirmOpen=true.
   */
  const celebrationLockRef = useRef(false);

  const isEditMode = !!existingBid;
  const sourceIndentId = post?.source_indent_id ?? null;

  const linkedIndentQ = useQuery({
    queryKey: ['q', 'indents', 'bid-sheet-target', orgId, sourceIndentId],
    queryFn: async () => {
      const { indent, error } = await getVisibleIndentById(orgId, sourceIndentId!);
      if (error) throw error;
      if (indent?.supplier_target && Number(indent.supplier_target) > 0) return indent;
      const target = await getBroadcastIndentTarget(sourceIndentId);
      if (!target) return indent;
      return {
        ...(indent ?? {}),
        supplier_target: target.supplier_target,
        supplier_rate_basis:
          target.supplier_rate_basis ?? indent?.supplier_rate_basis ?? null,
        weight: target.weight ?? indent?.weight ?? null,
      };
    },
    enabled: visible && !!sourceIndentId && !!orgId,
    staleTime: 60_000,
  });

  const opportunity = useMemo(
    () =>
      resolveCommercialOpportunity({
        viewerOrgId: orgId || null,
        ownerOrgId: post?.organization_id ?? '',
        isLoad: post?.type === 'LOAD',
        indentStatus: linkedIndentQ.data?.status ?? null,
        postIsActive: post?.is_active,
        bidCount: post?.bid_count ?? (existingBid ? 1 : 0),
        supplierTarget: linkedIndentQ.data?.supplier_target,
        saleRateBasis: linkedIndentQ.data?.supplier_rate_basis ?? null,
        weightKg: linkedIndentQ.data?.weight ?? null,
        rateOffer: post?.rate_offer,
        myBidAmount: existingBid?.amount ?? null,
        myBidStatus: existingBid?.status ?? null,
        isSponsored: post?.is_sponsored,
        reachCampaignId: post?.reach_campaign_id,
      }),
    [
      orgId,
      post?.organization_id,
      post?.type,
      post?.is_active,
      post?.bid_count,
      post?.rate_offer,
      post?.is_sponsored,
      post?.reach_campaign_id,
      linkedIndentQ.data?.status,
      linkedIndentQ.data?.supplier_target,
      linkedIndentQ.data?.supplier_rate_basis,
      linkedIndentQ.data?.weight,
      existingBid?.amount,
      existingBid?.status,
    ],
  );

  const targetRate = opportunity.pricing.displayPrice;

  /**
   * Per-MT targets reach the bidder already multiplied out to a trip total, so
   * the bare figure hides the basis it was quoted on. Spell the multiply out —
   * the bid itself stays a trip total, which is what every comparison surface
   * and the award RPC treat it as.
   */
  const targetBasisNote = useMemo(() => {
    const { basis, unitRateInr, tonnes } = opportunity.pricing;
    if (basis !== "per_mt" || unitRateInr == null) return null;
    const perMt = `${formatINR(unitRateInr)}/MT`;
    return tonnes == null
      ? `Quoted ${perMt} — weight not set on this load`
      : `${perMt} × ${tonnes}T`;
  }, [opportunity.pricing]);
  const biddingAllowed =
    opportunity.permissions.canBid ||
    opportunity.permissions.canEditBid ||
    (isEditMode &&
      opportunity.bidding.hasBid &&
      opportunity.bidding.acceptsNewBids);

  const submitMutation = useSubmitBidMutation(post?.id ?? null, orgId);
  useEffect(() => {
    if (!visible) {
      celebrationLockRef.current = false;
      setConfirmOpen(false);
      setConfirmPhase('review');
      setConfirmIsEditMode(false);
      setConfirmIntent('submit');
      setSubmitting(false);
      return;
    }
    /**
     * Never reseeds / resets while the confirm or success celebration is open.
     * Update mutations refresh `existingBid.amount` in cache mid-flight — that
     * used to wipe `confirmPhase: 'success'` before the animation could play.
     */
    if (
      celebrationLockRef.current ||
      confirmOpen ||
      confirmPhase === 'success'
    ) {
      return;
    }

    setActiveField('amount');
    setValidationError(undefined);
    setSubmitting(false);
    setConfirmPhase('review');
    setConfirmIsEditMode(false);
    const seed =
      initialAmount && initialAmount > 0
        ? Math.round(initialAmount)
        : existingBid?.amount
          ? Math.round(existingBid.amount)
          : null;
    setAmountRaw(seed != null ? toRawString(seed) : '');
    setNote(existingBid?.note ?? initialNote ?? '');
  }, [
    visible,
    confirmOpen,
    confirmPhase,
    existingBid?.id,
    existingBid?.amount,
    existingBid?.note,
    initialAmount,
    initialNote,
  ]);

  const origin = cityPart(post?.origin);
  const destination = cityPart(post?.destination);
  const route =
    origin && destination
      ? `${origin} → ${destination}`
      : origin || destination || undefined;
  const vehicle = post?.vehicle_type?.trim() || undefined;
  const weight =
    post?.weight_tonnes != null ? `${post.weight_tonnes}T` : undefined;
  const material = post?.material?.trim() || undefined;

  const partySubtitle = useMemo(() => {
    const parts: string[] = [];
    if (route) parts.push(route);
    const specs = [vehicle, weight, material].filter(Boolean);
    if (specs.length > 0) parts.push(specs.join(' · '));
    if (targetRate != null) parts.push(`Target ${formatINR(targetRate)}`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [route, vehicle, weight, material, targetRate]);

  const partyPreview = useMemo((): NumericEntryPartyPreview | undefined => {
    if (!post) return undefined;
    return {
      name: (post.org_name ?? '').trim() || 'Load owner',
      subtitle: partySubtitle,
      entityType: 'supplier',
      organizationImageUrl: post.org_avatar_url ?? null,
      organizationAvatarSeed: post.org_avatar_seed ?? null,
    };
  }, [post, partySubtitle]);

  const invalidateQuoteCaches = useCallback(
    async (matchedIndentId: string) => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) }),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.indents.finite(orgId), 'my-direct-quotes'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['indents', matchedIndentId, 'direct-quotes'],
        }),
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === 'indents' &&
            (q.queryKey[1] === 'offer-counts' || q.queryKey[1] === 'quote-counts'),
        }),
      ]);
    },
    [orgId, queryClient],
  );

  const canSubmit =
    biddingAllowed &&
    isKeypadValueSubmittable(amountRaw) &&
    parseRawToNumber(amountRaw) > 0 &&
    !submitting;

  const handleAmountKey = useCallback((key: KeypadKey) => {
    setAmountRaw((prev) => applyKeypadPress(prev, key, { maxDecimalPlaces: 0 }));
    setValidationError(undefined);
  }, []);

  const handleNoteKey = useCallback((key: string) => {
    setNote((prev) => appendNoteKey(prev, key, NOTE_MAX_LENGTH));
  }, []);

  const requestConfirm = useCallback(() => {
    if (!post || !canSubmit) return;
    const amount = parseRawToNumber(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError('Enter an amount greater than 0.');
      setActiveField('amount');
      return;
    }
    if (!post.source_indent_id) {
      Alert.alert(
        'Cannot place bid',
        'This story is not linked to a load indent. Use Get Load to quote, or ask the publisher to broadcast from an indent.',
      );
      return;
    }
    setValidationError(undefined);
    celebrationLockRef.current = true;
    setConfirmIntent('submit');
    setConfirmIsEditMode(isEditMode);
    setConfirmPhase('review');
    setConfirmOpen(true);
  }, [post, canSubmit, amountRaw, isEditMode]);

  const matchTargetAndSubmit = useCallback(() => {
    if (targetRate == null || targetRate <= 0 || !post || submitting) return;
    setAmountRaw(toRawString(Math.round(targetRate)));
    setActiveField('amount');
    setValidationError(undefined);
    if (!post.source_indent_id) {
      Alert.alert(
        'Cannot place bid',
        'This story is not linked to a load indent. Use Get Load to quote, or ask the publisher to broadcast from an indent.',
      );
      return;
    }
    celebrationLockRef.current = true;
    setConfirmIntent('submit');
    setConfirmIsEditMode(isEditMode);
    setConfirmPhase('review');
    setConfirmOpen(true);
  }, [isEditMode, post, submitting, targetRate]);

  const finishAfterSuccess = useCallback(() => {
    const indentToInvalidate = pendingQuoteInvalidateRef.current;
    pendingQuoteInvalidateRef.current = null;
    celebrationLockRef.current = false;
    setConfirmOpen(false);
    setConfirmPhase('review');
    setConfirmIsEditMode(false);
    setConfirmIntent('submit');
    triggerFeedback('apply');
    if (indentToInvalidate) {
      void invalidateQuoteCaches(indentToInvalidate);
    }
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose, invalidateQuoteCaches]);

  const handleSubmit = useCallback(async () => {
    if (!post || !canSubmit) return;
    const amount = parseRawToNumber(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      celebrationLockRef.current = false;
      setConfirmOpen(false);
      setConfirmPhase('review');
      setValidationError('Enter an amount greater than 0.');
      setActiveField('amount');
      return;
    }
    if (!post.source_indent_id) {
      celebrationLockRef.current = false;
      setConfirmOpen(false);
      setConfirmPhase('review');
      Alert.alert(
        'Cannot place bid',
        'This story is not linked to a load indent. Use Get Load to quote, or ask the publisher to broadcast from an indent.',
      );
      return;
    }

    setSubmitting(true);
    setValidationError(undefined);
    const bidNote = note.trim();
    let submitError: Error | null = null;
    const indentIdForCache = post.source_indent_id;

    try {
      // New bid and edit share one RPC: it revises this org's pending bid and
      // its direct quote together, and refuses decided or countered quotes.
      const submitRes = await submitMutation.mutateAsync({
        amount,
        note: bidNote || undefined,
        orgName: currentOrganization?.name ?? '',
      });
      submitError = submitRes.error;
    } finally {
      setSubmitting(false);
    }

    if (submitError) {
      celebrationLockRef.current = false;
      pendingQuoteInvalidateRef.current = null;
      setConfirmOpen(false);
      setConfirmPhase('review');
      setValidationError(submitError.message);
      return;
    }

    // Celebrate first — quote list invalidation waits until Done so refetch
    // cannot tear down the success UI (especially on update).
    celebrationLockRef.current = true;
    pendingQuoteInvalidateRef.current = indentIdForCache;
    setConfirmIsEditMode(isEditMode);
    setConfirmPhase('success');
  }, [
    post,
    canSubmit,
    amountRaw,
    note,
    isEditMode,
    submitMutation,
    currentOrganization?.name,
  ]);

  const requestWithdraw = useCallback(() => {
    if (!existingBid || submitting) return;
    celebrationLockRef.current = true;
    setConfirmIntent('withdraw');
    setConfirmIsEditMode(true);
    setConfirmPhase('review');
    setConfirmOpen(true);
  }, [existingBid, submitting]);

  const handleWithdraw = useCallback(async () => {
    if (!existingBid || submitting) return;
    setSubmitting(true);
    setValidationError(undefined);
    const { error } = await withdrawBid(existingBid.id);
    setSubmitting(false);
    if (error) {
      celebrationLockRef.current = false;
      setConfirmOpen(false);
      setConfirmPhase('review');
      setConfirmIntent('submit');
      setValidationError(error.message);
      return;
    }
    celebrationLockRef.current = true;
    pendingQuoteInvalidateRef.current = post?.source_indent_id ?? null;
    setConfirmPhase('success');
  }, [existingBid, submitting, post?.source_indent_id]);

  usePhysicalKeypadInput({
    enabled: visible && activeField === 'amount' && !confirmOpen,
    onKey: handleAmountKey,
    onSubmit: () => {
      if (canSubmit) requestConfirm();
    },
    onClose,
    allowDecimal: false,
  });

  useEffect(() => {
    if (!visible || activeField !== 'note' || Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const { key } = event;
      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        handleNoteKey('⌫');
        return;
      }
      if (key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        handleNoteKey(' ');
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        handleNoteKey(key.toUpperCase());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, activeField, handleNoteKey]);

  // Must run before the `if (!post) return null` guard below — a hook
  // called only on some renders (e.g. this component staying mounted while
  // its owner navigates from one story's bid sheet to another, where `post`
  // is briefly null/undefined) throws "Rendered more hooks than during the
  // previous render."
  const confirmAmount = parseRawToNumber(amountRaw);
  const vsTarget = useMemo(
    () => resolveBidVsTarget(confirmAmount, targetRate),
    [confirmAmount, targetRate],
  );

  if (!post) return null;

  const isDesktop = platform === 'desktop';
  const isTablet = platform === 'tablet';
  const isMobile = platform === 'mobile';

  const title = isEditMode ? 'Update your bid' : 'Place your bid';
  const submitLabel = submitting
    ? isEditMode
      ? 'Updating…'
      : 'Submitting…'
    : isEditMode
      ? 'Update bid'
      : 'Submit bid';

  const notePreview = note.trim();
  const noteActive = activeField === 'note';

  const confirmModal = (
    <BidConfirmModal
      visible={confirmOpen}
      phase={confirmPhase}
      intent={confirmIntent}
      isEditMode={confirmIsEditMode}
      amount={confirmAmount > 0 ? confirmAmount : 0}
      ownerName={(post.org_name ?? '').trim() || 'Load owner'}
      origin={origin || undefined}
      destination={destination || undefined}
      vehicle={vehicle}
      weight={weight}
      material={material}
      targetRate={targetRate}
      note={notePreview || undefined}
      submitting={submitting}
      onCancel={() => {
        if (!submitting && confirmPhase === 'review') {
          celebrationLockRef.current = false;
          setConfirmOpen(false);
          setConfirmPhase('review');
          setConfirmIsEditMode(false);
          setConfirmIntent('submit');
        }
      }}
      onConfirm={() => {
        if (confirmIntent === 'withdraw') {
          void handleWithdraw();
          return;
        }
        void handleSubmit();
      }}
      onSuccessDone={finishAfterSuccess}
    />
  );

  const valueStage = (
    <View
      style={[
        styles.valueStage,
        !isMobile && styles.valueStageElevated,
      ]}
    >
      <Pressable
        onPress={() => setActiveField('amount')}
        accessibilityRole="button"
        accessibilityLabel="Edit bid amount"
        style={({ pressed }) => [
          styles.amountPress,
          pressed && activeField !== 'amount' && styles.amountPressDim,
        ]}
      >
        <NumericDisplay
          rawValue={amountRaw}
          type="currency"
          prefix="₹"
          placeholder="0"
          variant={isMobile ? 'hero' : 'default'}
          tone={vsTarget?.tone ?? 'default'}
        />
      </Pressable>

      {validationError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {validationError}
        </Text>
      ) : vsTarget ? (
        <BidVsTargetHint caption={vsTarget.caption} tone={vsTarget.tone} />
      ) : targetRate != null ? (
        <Text style={styles.hint}>
          Target {formatINR(targetRate)}
          {targetBasisNote ? ` (${targetBasisNote})` : ""}
        </Text>
      ) : (
        <View style={styles.hintSpacer} />
      )}

      <Pressable
        style={[
          styles.noteRow,
          noteActive && styles.noteRowActive,
          !isMobile && styles.noteRowElevated,
        ]}
        onPress={() => setActiveField('note')}
        accessibilityRole="button"
        accessibilityLabel={
          notePreview ? `Edit note: ${notePreview}` : 'Add optional note'
        }
        accessibilityState={{ selected: noteActive }}
      >
        <MessageSquare
          size={isMobile ? 15 : 16}
          color={noteActive ? Theme.buttonPrimaryText : Theme.iconMuted}
          strokeWidth={2.2}
          style={styles.noteIcon}
        />
        {noteActive ? (
          <KeypadDisplayValueWithCaret
            value={note}
            placeholder="Add a message with your bid"
            showCaret={note.length < NOTE_MAX_LENGTH}
            valueStyle={[styles.noteValue, !isMobile && styles.noteValueElevated]}
            placeholderStyle={styles.notePlaceholder}
            caretStyle={styles.noteCaret}
            fillRow
          />
        ) : (
          <Text
            style={[
              styles.noteIdleText,
              notePreview ? styles.noteIdleFilled : null,
            ]}
            numberOfLines={1}
          >
            {notePreview || 'Add note (optional)'}
          </Text>
        )}
      </Pressable>
      {noteActive ? (
        <Text style={styles.noteCounter}>
          {note.trim().length}/{NOTE_MAX_LENGTH}
        </Text>
      ) : null}
    </View>
  );

  const keypadBlock =
    activeField === 'amount' ? (
      <DecimalKeypad
        onKey={handleAmountKey}
        showDecimal={false}
        variant="pay"
        layout="phone"
        size={isDesktop ? 'compact' : 'default'}
        hapticsEnabled={false}
      />
    ) : (
      <PersonNameKeypad
        onKey={handleNoteKey}
        length={note.length}
        maxLength={NOTE_MAX_LENGTH}
      />
    );

  const partyBlock = partyPreview ? (
    <NumericEntryRecipientHero
      party={partyPreview}
      caption={
        partyPreview.name.trim().toLowerCase() === title.toLowerCase()
          ? undefined
          : title
      }
      nameInline={
        partyPreview.name.trim().toLowerCase() !== title.toLowerCase()
      }
      compact
      dense={!isMobile}
    />
  ) : (
    <Text style={styles.fallbackTitle}>{title}</Text>
  );

  /** Mobile: GPay-style pay tray + emerald continue FAB (FullscreenNumericEntry). */
  const mobileContent = (
    <View
      style={[
        styles.root,
        styles.rootPay,
        { paddingBottom: Math.max(insets.bottom, 6) },
      ]}
    >
      <View
        style={[
          styles.topBar,
          Platform.OS === 'ios' && { paddingTop: Math.max(insets.top, 8) },
          Platform.OS !== 'ios' && { paddingTop: Math.max(insets.top, 12) },
        ]}
      >
        <TouchableOpacity
          style={styles.closeBtnPay}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeTextPay}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bodyPay}>
        {partyBlock}
        {isEditMode ? (
          <View style={styles.cancelChipWrap}>
            <CancelBidChip onPress={requestWithdraw} disabled={submitting} />
          </View>
        ) : null}
        {valueStage}
      </View>

      <View style={styles.bottom}>
        {activeField === 'amount' && targetRate != null && targetRate > 0 ? (
          <MatchTargetLink
            amount={Math.round(targetRate)}
            onPress={matchTargetAndSubmit}
            disabled={submitting}
          />
        ) : null}
        <View style={styles.fabRow}>
          <View style={styles.fabCell} />
          <View style={styles.fabCell} />
          <View style={styles.fabCell}>
            <TouchableOpacity
              style={[styles.fabPay, !canSubmit && styles.fabPayDisabled]}
              onPress={requestConfirm}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              accessibilityState={{ disabled: !canSubmit }}
            >
              {submitting ? (
                <LoadingIndicator color="#ffffff" />
              ) : (
                <ArrowRight
                  size={22}
                  color={canSubmit ? '#ffffff' : Theme.textMuted}
                  strokeWidth={2.4}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
        {keypadBlock}
      </View>
    </View>
  );

  /** Tablet / desktop: header Apply CTA (Pulse buttonPrimary). */
  const elevatedContent = (
    <View
      style={[
        styles.root,
        styles.rootElevated,
        { paddingBottom: isDesktop || isTablet ? 20 : Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.headerElevated}>
        <TouchableOpacity
          style={styles.closeBtnElevated}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.closeTextElevated}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerLabel} numberOfLines={1}>
            {title}
          </Text>
          {partySubtitle ? (
            <Text style={styles.headerContext} numberOfLines={2}>
              {partySubtitle}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.applyBtn, !canSubmit && styles.applyBtnMuted]}
          onPress={requestConfirm}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <LoadingIndicator color={Theme.buttonPrimaryText} />
          ) : (
            <Text style={[styles.applyText, !canSubmit && styles.applyTextMuted]}>
              {isEditMode ? 'Update' : 'Submit'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.bodyElevated}>
        {partyPreview &&
        partyPreview.name.trim().toLowerCase() !== title.toLowerCase() ? (
          <NumericEntryRecipientHero
            party={partyPreview}
            dense
            compact
          />
        ) : null}
        {isEditMode ? (
          <View style={styles.cancelChipWrap}>
            <CancelBidChip onPress={requestWithdraw} disabled={submitting} />
          </View>
        ) : null}
        {valueStage}
      </View>

      <View style={styles.bottomElevated}>
        <TouchableOpacity
          style={[
            styles.submitBar,
            !canSubmit && styles.submitBarMuted,
          ]}
          onPress={requestConfirm}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          {submitting ? (
            <LoadingIndicator color={Theme.buttonPrimaryText} />
          ) : (
            <>
              <ArrowRight
                size={18}
                color={
                  canSubmit ? Theme.buttonPrimaryText : Theme.textSecondary
                }
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.submitBarText,
                  !canSubmit && styles.submitBarTextMuted,
                ]}
              >
                {submitLabel}
                {canSubmit && isKeypadValueSubmittable(amountRaw)
                  ? ` · ${formatINR(parseRawToNumber(amountRaw))}`
                  : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {activeField === 'amount' && targetRate != null && targetRate > 0 ? (
          <MatchTargetLink
            amount={Math.round(targetRate)}
            onPress={matchTargetAndSubmit}
            disabled={submitting}
          />
        ) : null}
        <View style={styles.keypadElevated}>{keypadBlock}</View>
      </View>
    </View>
  );

  if (isDesktop) {
    return (
      <>
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={onClose}
          statusBarTranslucent
        >
          <View style={styles.desktopOverlay}>
            <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
              <View style={StyleSheet.absoluteFillObject} />
            </TouchableWithoutFeedback>
            <MotiView
              from={{ translateX: 480 }}
              animate={{ translateX: 0 }}
              transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
              style={styles.desktopDrawer}
            >
              {elevatedContent}
            </MotiView>
          </View>
        </Modal>
        {confirmModal}
      </>
    );
  }

  if (isTablet) {
    return (
      <>
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={onClose}
          statusBarTranslucent
        >
          <View style={styles.tabletOverlay}>
            <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
              <View style={StyleSheet.absoluteFillObject} />
            </TouchableWithoutFeedback>
            <MotiView
              from={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={styles.tabletModal}
            >
              {elevatedContent}
            </MotiView>
          </View>
        </Modal>
        {confirmModal}
      </>
    );
  }

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        {mobileContent}
      </Modal>
      {confirmModal}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  rootPay: {
    justifyContent: 'space-between',
  },
  rootElevated: {
    minHeight: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    minHeight: 48,
  },
  closeBtnPay: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTextPay: {
    fontSize: 24,
    fontWeight: '300',
    color: Theme.textPrimary,
    lineHeight: 24,
  },
  bodyPay: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelChipWrap: {
    alignItems: 'center',
    paddingTop: 4,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    marginTop: 4,
  },
  valueStage: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    gap: 8,
    paddingBottom: 4,
  },
  valueStageElevated: {
    maxWidth: 400,
    paddingVertical: 8,
  },
  amountPress: {
    width: '100%',
    alignItems: 'center',
  },
  amountPressDim: {
    opacity: 0.72,
  },
  hint: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  hintSpacer: {
    height: 16,
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.teslaRed,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 44,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteRowElevated: {
    minHeight: 48,
    borderRadius: 14,
  },
  noteRowActive: {
    borderColor: Theme.buttonPrimaryBorder,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
  },
  noteIcon: {
    marginRight: 10,
  },
  noteIdleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  noteIdleFilled: {
    color: Theme.textPrimaryDark,
    fontWeight: '600',
  },
  noteValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  noteValueElevated: {
    fontSize: 15,
  },
  notePlaceholder: {
    fontSize: 13,
    fontWeight: '400',
    color: Theme.textMuted,
  },
  noteCaret: {
    height: 16,
    backgroundColor: Theme.buttonPrimaryBorder,
  },
  noteCounter: {
    alignSelf: 'flex-end',
    fontSize: 10,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  bottom: {
    width: '100%',
    flexShrink: 0,
    paddingTop: 2,
  },
  fabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAY_KEYPAD_INSET - PAY_KEYPAD_CELL_PAD,
    paddingTop: 2,
    paddingBottom: 2,
  },
  fabCell: {
    flex: 1,
    minWidth: 0,
    padding: PAY_KEYPAD_CELL_PAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.driverEmeraldDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  fabPayDisabled: {
    backgroundColor: 'rgba(148,163,184,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  headerElevated: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
    minHeight: 56,
    gap: 8,
  },
  closeBtnElevated: {
    width: 36,
    height: 36,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 8,
  },
  closeTextElevated: {
    fontSize: 15,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  headerMid: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerContext: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  applyBtn: {
    minWidth: 72,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  applyBtnMuted: {
    backgroundColor: Theme.borderLight,
    borderColor: Theme.borderMedium,
  },
  applyText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  applyTextMuted: {
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  bodyElevated: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  bottomElevated: {
    width: '100%',
    flexShrink: 0,
    paddingHorizontal: 16,
    gap: 10,
  },
  submitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  submitBarMuted: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
    opacity: 0.85,
  },
  submitBarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.2,
  },
  submitBarTextMuted: {
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  keypadElevated: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  desktopOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: Theme.overlayBackdrop,
  },
  desktopDrawer: {
    width: 480,
    maxWidth: '100%',
    backgroundColor: Theme.screenBackground,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 24,
  },
  tabletOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.overlayBackdrop,
    padding: 24,
  },
  tabletModal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
});
