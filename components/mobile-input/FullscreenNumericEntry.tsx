/**
 * Platform-adaptive focused numeric entry.
 *
 * Mobile / web-mobile  → full-screen modal (slide up)
 * Tablet               → centered modal, max 480 wide
 * Desktop (web ≥1024)  → right-side drawer, max 480 wide
 *
 * Uses a custom DecimalKeypad — no native keyboard for financial inputs.
 */
import React, { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { ArrowRight, X } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import { PulsePillButton } from '@/components/PulsePillButton';
import { formatINR } from '@/lib/format';
import { DecimalKeypad, PAY_KEYPAD_CELL_PAD, PAY_KEYPAD_INSET } from './DecimalKeypad';
import { BidVsTargetHint } from './BidVsTargetHint';
import { MatchTargetLink } from './MatchTargetLink';
import { resolveBidVsTarget } from './bidVsTarget';
import { NumericDisplay } from './NumericDisplay';
import type { NumericEntryPartyPreview } from './NumericEntryPartyBanner';
import { NumericEntryRecipientHero } from './NumericEntryRecipientHero';
import {
  applyKeypadPress,
  parseRawToNumber,
  rawToSubmitValue,
  isKeypadValueSubmittable,
  toRawString,
} from './keypad';
import { triggerFeedback } from './feedback';
import { useInputPlatform } from './useInputPlatform';
import { usePhysicalKeypadInput } from './usePhysicalKeypadInput';
import type { KeypadKey, KeypadOptions } from './keypad';
import type { SmartInputType } from './types';

export interface FullscreenNumericEntryProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the raw submit string ("45000", "7.5", etc.) */
  onSubmit: (value: string) => void;
  /** Pre-fill the entry with this value (stripped of formatting) */
  initialValue?: string;
  /** Header label, e.g. "Supplier Cost" */
  label: string;
  /** Secondary context shown below the label, e.g. "Trip: BLR → CHN" */
  contextLine?: string;
  /** Client / supplier row above the amount (avatar + name). */
  partyPreview?: NumericEntryPartyPreview;
  type?: SmartInputType;
  /** Override default prefix (currency → '₹') */
  prefix?: string;
  /** Override default suffix (percentage → '%') */
  suffix?: string;
  placeholder?: string;
  allowDecimal?: boolean;
  /** Maximum decimal places (0 = integer-only). */
  maxDecimalPlaces?: 0 | 1 | 2;
  submitLabel?: string;
  /** Inline validation error to display below the amount (from parent validation). */
  validationError?: string;
  /**
   * Shipper / load target rate — when set, amount turns red if over target
   * and a tiny ± vs target caption appears under the value.
   */
  targetRate?: number | null;
  /**
   * Optional override above the keypad (e.g. "Match counter").
   * When omitted, a target rate shows “Match target”. Tap fills and submits.
   */
  quickFill?: { label: string; amount: number } | null;
  /** Drawn above the keypad inside this modal (e.g. confirm sheet). Avoids a second RN Modal. */
  overlay?: ReactNode;
  /** Text chip under the load card (e.g. Cancel bid), not a filled CTA. */
  footerLink?: ReactNode;
}

export function FullscreenNumericEntry({
  visible,
  onClose,
  onSubmit,
  initialValue = '',
  label,
  contextLine,
  partyPreview,
  type = 'currency',
  prefix,
  suffix,
  placeholder,
  allowDecimal = true,
  maxDecimalPlaces,
  submitLabel = 'Apply',
  validationError,
  targetRate = null,
  quickFill = null,
  overlay = null,
  footerLink = null,
}: FullscreenNumericEntryProps) {
  const [raw, setRaw] = useState(initialValue);
  const platform = useInputPlatform();
  const insets = useSafeAreaInsets();
  const isDesktop = platform === 'desktop';
  const isTablet = platform === 'tablet';
  const isPayLayout = platform === 'mobile';

  // iOS Safari: the visual viewport shifts when the toolbar collapses/expands
  // mid-interaction, but this modal's fixed positioning (from RN Web's Modal)
  // doesn't reflow with it — pin height to the live visual viewport instead.
  const [webViewportHeight, setWebViewportHeight] = useState<number | undefined>(
    Platform.OS === 'web' ? window.visualViewport?.height : undefined,
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setWebViewportHeight(vv.height);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [visible]);

  const keypadOpts: KeypadOptions = useMemo(() => ({
    maxDecimalPlaces: allowDecimal === false ? 0 : (maxDecimalPlaces ?? 2),
  }), [allowDecimal, maxDecimalPlaces]);

  // Sync initial value each time the modal opens
  useEffect(() => {
    if (visible) {
      setRaw(initialValue);
    }
  }, [visible, initialValue]);

  const handleKey = useCallback((key: KeypadKey) => {
    setRaw((prev) => applyKeypadPress(prev, key, keypadOpts));
  }, [keypadOpts]);

  const handleSubmit = useCallback(() => {
    if (!isKeypadValueSubmittable(raw)) return;
    triggerFeedback('apply');
    onSubmit(rawToSubmitValue(raw));
  }, [raw, onSubmit]);

  const matchOffer = useMemo(() => {
    if (type !== 'currency') return null;
    if (
      quickFill != null &&
      Number.isFinite(quickFill.amount) &&
      quickFill.amount > 0
    ) {
      return {
        label: quickFill.label.trim() || 'Match target',
        amount: Math.round(quickFill.amount),
      };
    }
    if (targetRate != null && Number.isFinite(targetRate) && targetRate > 0) {
      return { label: 'Match target', amount: Math.round(targetRate) };
    }
    return null;
  }, [quickFill, targetRate, type]);

  const handleMatchTarget = useCallback(() => {
    if (matchOffer == null) return;
    const next = toRawString(matchOffer.amount);
    setRaw(next);
    triggerFeedback('apply');
    onSubmit(rawToSubmitValue(next));
  }, [matchOffer, onSubmit]);

  usePhysicalKeypadInput({
    enabled: visible && (isDesktop || isTablet),
    onKey: handleKey,
    onSubmit: handleSubmit,
    onClose,
    allowDecimal,
  });

  const hasValue = isKeypadValueSubmittable(raw);

  const payDisplayVariant =
    type === 'currency' ? 'hero' : 'wizard';
  const resolvedPlaceholder =
    placeholder ?? (type === 'distance' || type === 'quantity' ? '0' : undefined);

  const vsTarget = useMemo(() => {
    if (type !== 'currency') return null;
    return resolveBidVsTarget(parseRawToNumber(raw), targetRate);
  }, [raw, targetRate, type]);

  const amountDisplay = (
    <View style={styles.amountStack}>
      <NumericDisplay
        rawValue={raw}
        type={type}
        prefix={prefix}
        suffix={suffix}
        placeholder={resolvedPlaceholder}
        variant={isPayLayout ? payDisplayVariant : 'default'}
        tone={vsTarget?.tone ?? 'default'}
      />
      {vsTarget ? (
        <BidVsTargetHint caption={vsTarget.caption} tone={vsTarget.tone} />
      ) : targetRate != null && targetRate > 0 && type === 'currency' ? (
        <Text style={styles.targetFallback}>Target {formatINR(targetRate)}</Text>
      ) : null}
    </View>
  );

  const matchTargetLink = matchOffer ? (
    <MatchTargetLink
      amount={matchOffer.amount}
      label={matchOffer.label}
      onPress={handleMatchTarget}
    />
  ) : null;

  const validationBlock = validationError ? (
    <Text
      style={[styles.validationError, isPayLayout && styles.validationErrorPay]}
      accessibilityRole="alert"
    >
      {validationError}
    </Text>
  ) : null;

  const innerContent = isPayLayout ? (
    <View
      style={[
        styles.inner,
        styles.innerPay,
        { paddingBottom: Math.max(insets.bottom, 6) },
      ]}
    >
      <View
        style={[
          styles.payTopBar,
          Platform.OS === 'ios' && { paddingTop: Math.max(insets.top, 8) },
        ]}
      >
        <TouchableOpacity
          style={styles.payCloseBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.payCloseText}>✕</Text>
        </TouchableOpacity>
        {footerLink ? <View style={styles.headerTrailing}>{footerLink}</View> : null}
      </View>

      <View style={styles.payBody}>
        <View style={styles.payMeta}>
          {partyPreview ? (
            <NumericEntryRecipientHero
              party={partyPreview}
              caption={
                partyPreview.name.trim().toLowerCase() === label.trim().toLowerCase()
                  ? undefined
                  : label
              }
              // Stack “Spend” above shipper when we have route/date hero lines.
              nameInline={
                !partyPreview.heroLine &&
                partyPreview.name.trim().toLowerCase() !== label.trim().toLowerCase()
              }
              compact
            />
          ) : (
            <View style={styles.payLabelOnly}>
              <Text style={styles.payLabelOnlyText}>{label}</Text>
              {contextLine ? (
                <Text style={styles.payContextLine} numberOfLines={2}>
                  {contextLine}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        <View style={styles.payAmountStage}>
          {amountDisplay}
          {validationBlock}
        </View>
      </View>

      <View style={styles.payBottom}>
        {matchTargetLink}
        <View style={styles.payFabRow}>
          <View style={styles.payFabCell} />
          <View style={styles.payFabCell} />
          <View style={styles.payFabCell}>
            <TouchableOpacity
              style={[styles.payFab, !hasValue && styles.payFabDisabled]}
              onPress={handleSubmit}
              disabled={!hasValue}
              delayPressIn={0}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              accessibilityState={{ disabled: !hasValue }}
            >
              <ArrowRight
                size={22}
                color={hasValue ? '#ffffff' : Theme.textMuted}
                strokeWidth={2.4}
              />
            </TouchableOpacity>
          </View>
        </View>
        <DecimalKeypad onKey={handleKey} showDecimal={allowDecimal} variant="pay" />
      </View>
      {overlay ? <View style={styles.entryOverlay}>{overlay}</View> : null}
    </View>
  ) : (
    <View
      style={[
        styles.inner,
        isDesktop && styles.innerDesktop,
        isTablet && styles.innerTablet,
      ]}
    >
      <View style={[styles.header, styles.headerElevated]}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerMid}>
          <Text style={styles.headerLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>

        <View style={styles.headerTrailing}>
          {footerLink}
          <PulsePillButton
            label={submitLabel}
            size="compact"
            onPress={handleSubmit}
            disabled={!hasValue}
            accessibilityLabel={submitLabel}
          />
        </View>
      </View>

      {partyPreview ? (
        <View style={styles.summaryCard}>
          <NumericEntryRecipientHero
            party={partyPreview}
            dense
            compact
          />
          {targetRate != null && targetRate > 0 ? (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipLabel}>Target</Text>
              <Text style={styles.targetChipValue}>{formatINR(targetRate)}</Text>
            </View>
          ) : null}
        </View>
      ) : contextLine ? (
        <Text style={styles.elevatedPartySubtitle} numberOfLines={3}>
          {contextLine}
        </Text>
      ) : null}

      <View style={styles.amountStage}>
        {amountDisplay}
        {validationBlock}
      </View>

      <View
        style={[
          styles.keypadDock,
          { paddingBottom: isDesktop || isTablet ? 20 : Math.max(insets.bottom, 16) },
        ]}
      >
        {matchTargetLink}
        <DecimalKeypad onKey={handleKey} showDecimal={allowDecimal} />
      </View>
      {overlay ? <View style={styles.entryOverlay}>{overlay}</View> : null}
    </View>
  );

  // ── Desktop: right drawer with spring slide-in ────────────────────────
  if (isDesktop) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
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
            {innerContent}
          </MotiView>
        </View>
      </Modal>
    );
  }

  // ── Tablet: centered modal with spring scale-in ────────────────────────
  if (isTablet) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
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
            {innerContent}
          </MotiView>
        </View>
      </Modal>
    );
  }

  // ── Mobile: full-screen (overFullScreen so a confirm overlay can receive taps) ──
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
      accessibilityViewIsModal
    >
      <View
        style={[
          styles.mobileContainer,
          Platform.OS === 'android' && { paddingTop: insets.top },
          Platform.OS === 'web' && webViewportHeight
            ? { height: webViewportHeight }
            : null,
        ]}
      >
        {innerContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Mobile ──
  mobileContainer: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  inner: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  innerDesktop: {
    flex: 1,
    minHeight: 0,
  },
  innerTablet: {
    overflow: 'hidden',
    minHeight: 520,
  },
  innerPay: {
    justifyContent: 'space-between',
  },
  entryOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  payTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 4,
    minHeight: 48,
  },
  payCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payCloseText: {
    fontSize: 24,
    fontWeight: '300',
    color: Theme.textPrimary,
    lineHeight: 24,
  },
  payBody: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  payMeta: {
    flexShrink: 0,
    paddingTop: 4,
  },
  payAmountStage: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  payLabelOnly: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 6,
  },
  payLabelOnlyText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  payContextLine: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    color: Theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  amountStack: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  targetFallback: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  quickFillChip: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.warningMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentGoldBorder,
    maxWidth: '88%',
  },
  quickFillChipMatched: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  quickFillChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.warning,
    letterSpacing: 0.15,
  },
  quickFillChipTextMatched: {
    color: Theme.success,
  },
  payBottom: {
    flexShrink: 0,
  },
  payFabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Match keypad: outer inset minus cell pad so cell centers line up with keys.
    paddingHorizontal: PAY_KEYPAD_INSET - PAY_KEYPAD_CELL_PAD,
    paddingTop: 2,
    paddingBottom: 2,
  },
  payFabCell: {
    flex: 1,
    minWidth: 0,
    padding: PAY_KEYPAD_CELL_PAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payFab: {
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
  payFabDisabled: {
    backgroundColor: 'rgba(148,163,184,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  validationErrorPay: {
    paddingTop: 4,
    paddingBottom: 0,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    minHeight: 64,
    gap: 12,
  },
  headerElevated: {
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeBtnText: {
    fontSize: 15,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  headerMid: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  headerTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerContext: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    alignItems: 'center',
    gap: 8,
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlue,
  },
  targetChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  targetChipValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.primary,
  },
  amountStage: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  keypadDock: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingTop: 8,
  },
  elevatedPartySubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    minWidth: 68,
    alignItems: 'center',
    flexShrink: 0,
  },
  applyBtnMuted: {
    backgroundColor: Theme.borderLight,
  },
  applyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.buttonPrimaryText,
  },
  applyTextMuted: {
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  validationError: {
    fontSize: 13,
    color: Theme.negative,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // ── Desktop right drawer ──
  desktopOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: Theme.overlayBackdrop,
  },
  desktopDrawer: {
    width: 480,
    height: '100%',
    maxHeight: '100%',
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.primaryText,
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 24,
  },

  // ── Tablet centered modal ──
  tabletOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.overlayBackdrop,
    padding: 32,
  },
  tabletModal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
    maxHeight: '85%' as unknown as number,
  },
});
