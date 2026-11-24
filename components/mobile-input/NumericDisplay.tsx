import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Theme from '@/constants/Theme';
import { formatEntryDisplay } from './formatters';
import type { SmartInputType } from './types';

export type DisplayType = SmartInputType;

interface NumericDisplayProps {
  rawValue: string;
  type?: DisplayType;
  /** Override the default prefix (currency → '₹'). Pass '' to suppress. */
  prefix?: string;
  /** Override the default suffix (percentage → '%'). Pass '' to suppress. */
  suffix?: string;
  placeholder?: string;
  /** Larger centered amount (mobile pay-style sheet). */
  variant?: "default" | "hero" | "wizard" | "wizardCompact";
  /**
   * Bid vs target colouring — `over` turns the amount red when above target.
   * Only applied when the field has a value.
   */
  tone?: "default" | "over" | "under" | "match";
  /** Driver-expense emerald on the currency mark and caret. */
  accentPrefix?: boolean;
  /** Light typography for amount on a green pay sheet. */
  onGreenSurface?: boolean;
}

function computeLargeDisplayTypography(
  display: string,
  variant: 'hero' | 'wizard' | 'wizardCompact',
) {
  const len = display.replace(/,/g, '').replace(/\./g, '').length;
  const base =
    variant === 'hero'
      ? { amount: 72, lineHeight: 76, suffix: 38, prefix: 48, cursor: 54 }
      : variant === 'wizardCompact'
        ? { amount: 40, lineHeight: 44, suffix: 22, prefix: 26, cursor: 32 }
        : { amount: 52, lineHeight: 56, suffix: 28, prefix: 34, cursor: 42 };

  let scale = 1;
  if (len > 4) scale = 0.9;
  if (len > 5) scale = 0.8;
  if (len > 6) scale = 0.72;
  if (len > 7) scale = 0.64;
  if (len > 8) scale = 0.58;

  return {
    amount: Math.round(base.amount * scale),
    lineHeight: Math.round(base.lineHeight * scale),
    suffix: Math.round(base.suffix * scale),
    prefix: Math.round(base.prefix * scale),
    cursor: Math.round(base.cursor * scale),
  };
}

export function NumericDisplay({
  rawValue,
  type = 'currency',
  prefix,
  suffix,
  placeholder = '0',
  variant = 'default',
  tone = 'default',
  accentPrefix = false,
  onGreenSurface = false,
}: NumericDisplayProps) {
  const isHero = variant === 'hero';
  const isWizard = variant === 'wizard' || variant === 'wizardCompact';
  const isWizardCompact = variant === 'wizardCompact';
  const isLarge = isHero || isWizard;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 530, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  const resolvedPrefix = prefix !== undefined ? prefix : type === 'currency' ? '₹' : '';
  const resolvedSuffix = suffix !== undefined ? suffix : type === 'percentage' ? '%' : '';
  const isEmpty = !rawValue;
  const display = isEmpty ? placeholder : formatEntryDisplay(rawValue, type);

  const toneColor =
    !isEmpty && tone === 'over'
      ? Theme.negative
      : !isEmpty && tone === 'under'
        ? Theme.positive
        : !isEmpty && tone === 'match'
          ? Theme.driverEmeraldDark
          : undefined;

  const largeTypography = useMemo(() => {
    if (!isLarge) return null;
    // Empty placeholder ("Enter amount") must scale down — hero 72px truncates the string.
    const typographySource = isEmpty ? '0' : display;
    return computeLargeDisplayTypography(
      typographySource,
      isHero ? 'hero' : isWizardCompact ? 'wizardCompact' : 'wizard',
    );
  }, [display, isEmpty, isHero, isLarge, isWizardCompact]);

  return (
    <View
      style={[
        styles.root,
        isHero && styles.rootHero,
        isWizard && styles.rootWizard,
        isWizardCompact && styles.rootWizardCompact,
      ]}
    >
      <View
        style={[
          styles.row,
          isHero && styles.rowHero,
          isWizard && styles.rowWizard,
          isWizardCompact && styles.rowWizardCompact,
        ]}
      >
        {resolvedPrefix ? (
          <Text
            style={[
              styles.prefix,
              isHero && styles.prefixHero,
              isWizard && styles.prefixWizard,
              isWizardCompact && styles.prefixWizardCompact,
              largeTypography && {
                fontSize: largeTypography.prefix,
                lineHeight: largeTypography.lineHeight,
              },
              isEmpty && !accentPrefix && !onGreenSurface && styles.dim,
              accentPrefix && !onGreenSurface && styles.prefixAccent,
              onGreenSurface && styles.prefixOnGreen,
              toneColor ? { color: toneColor } : null,
            ]}
            allowFontScaling={false}
          >
            {resolvedPrefix}
          </Text>
        ) : null}

        <Text
          style={[
            styles.amount,
            isHero && styles.amountHero,
            isWizard && styles.amountWizard,
            isWizardCompact && styles.amountWizardCompact,
            largeTypography && {
              fontSize: isEmpty
                ? Math.min(largeTypography.amount, isHero ? 36 : 32)
                : largeTypography.amount,
              lineHeight: isEmpty
                ? Math.min(largeTypography.lineHeight, isHero ? 42 : 38)
                : largeTypography.lineHeight,
            },
            isEmpty && styles.amountPlaceholder,
            isEmpty && isLarge && styles.amountPlaceholderHero,
            isEmpty && accentPrefix && !onGreenSurface && styles.amountPlaceholderAccent,
            isEmpty && onGreenSurface && styles.amountPlaceholderOnGreen,
            !isEmpty && onGreenSurface && styles.amountOnGreen,
            // Only let the empty placeholder flex-shrink — valued amounts must
            // keep hero/wizard size. adjustsFontSizeToFit on a flex-shrunk Text
            // collapses the digits to a speck on RN Web.
            isEmpty && !isLarge && styles.amountFlexible,
            toneColor ? { color: toneColor } : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit={!isLarge && !isEmpty}
          minimumFontScale={0.65}
          allowFontScaling={false}
        >
          {display}
        </Text>

        {resolvedSuffix ? (
          <Text
            style={[
              styles.suffix,
              isHero && styles.suffixHero,
              isWizard && styles.suffixWizard,
              isWizardCompact && styles.suffixWizardCompact,
              largeTypography && {
                fontSize: largeTypography.suffix,
                lineHeight: largeTypography.lineHeight,
              },
              isEmpty && styles.dim,
              onGreenSurface && styles.suffixOnGreen,
            ]}
            allowFontScaling={false}
          >
            {resolvedSuffix}
          </Text>
        ) : null}

        <Animated.View
          style={[
            styles.cursor,
            isHero && styles.cursorHero,
            isWizard && styles.cursorWizard,
            isWizardCompact && styles.cursorWizardCompact,
            largeTypography && { height: largeTypography.cursor },
            accentPrefix && !onGreenSurface && styles.cursorAccent,
            onGreenSurface && styles.cursorOnGreen,
            { opacity: blink },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  rootHero: {
    flex: 0,
    flexGrow: 0,
    paddingVertical: 20,
    minHeight: 112,
  },
  rootWizard: {
    flex: 0,
    flexGrow: 0,
    paddingVertical: 10,
    minHeight: 84,
  },
  rootWizardCompact: {
    flex: 0,
    flexGrow: 0,
    paddingVertical: 6,
    minHeight: 68,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  rowHero: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '96%',
  },
  rowWizard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '96%',
  },
  rowWizardCompact: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '96%',
  },
  prefix: {
    fontSize: 22,
    fontWeight: '500',
    color: Theme.textPrimary,
    marginRight: 4,
    flexShrink: 0,
  },
  prefixHero: {
    fontSize: 48,
    fontWeight: '400',
    letterSpacing: 0,
  },
  prefixWizard: {
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: 0,
  },
  prefixWizardCompact: {
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: 0,
  },
  amount: {
    fontSize: 44,
    fontWeight: '600',
    color: Theme.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    lineHeight: 48,
    flexShrink: 0,
    flexGrow: 0,
    textAlign: 'center',
  },
  amountFlexible: {
    flexShrink: 1,
    minWidth: 0,
  },
  amountHero: {
    fontSize: 72,
    fontWeight: '600',
    lineHeight: 76,
    letterSpacing: -1.2,
  },
  amountWizard: {
    fontSize: 52,
    fontWeight: '600',
    lineHeight: 56,
    letterSpacing: -0.8,
  },
  amountWizardCompact: {
    fontSize: 40,
    fontWeight: '600',
    lineHeight: 44,
    letterSpacing: -0.6,
  },
  amountPlaceholder: {
    color: Theme.textMuted,
    fontWeight: '400',
  },
  amountPlaceholderHero: {
    fontWeight: '500',
  },
  suffix: {
    fontSize: 20,
    fontWeight: '500',
    color: Theme.textSecondary,
    marginLeft: 6,
    flexShrink: 0,
  },
  suffixHero: {
    fontSize: 38,
  },
  suffixWizard: {
    fontSize: 28,
  },
  suffixWizardCompact: {
    fontSize: 22,
  },
  prefixAccent: {
    color: Theme.driverEmeraldDark,
    fontWeight: '700',
  },
  prefixOnGreen: {
    color: '#ffffff',
    fontWeight: '700',
  },
  amountPlaceholderAccent: {
    color: Theme.textPrimaryDark,
    fontWeight: '700',
  },
  amountPlaceholderOnGreen: {
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '700',
  },
  amountOnGreen: {
    color: '#ffffff',
    fontWeight: '700',
  },
  suffixOnGreen: {
    color: 'rgba(255,255,255,0.85)',
  },
  dim: {
    color: Theme.textMuted,
  },
  cursorAccent: {
    backgroundColor: Theme.driverEmeraldDark,
  },
  cursorOnGreen: {
    backgroundColor: '#ffffff',
  },
  cursor: {
    width: 2,
    height: 36,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 2,
    marginLeft: 4,
    alignSelf: 'center',
  },
  cursorHero: {
    height: 54,
    width: 3,
  },
  cursorWizard: {
    height: 42,
    width: 2,
  },
  cursorWizardCompact: {
    height: 32,
    width: 2,
  },
});
