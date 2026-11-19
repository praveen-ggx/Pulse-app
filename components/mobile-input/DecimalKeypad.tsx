import Theme from '@/constants/Theme';
import { Delete } from 'lucide-react-native';
import React, { memo, useCallback, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { triggerFeedback } from './feedback';
import type { KeypadKey } from './keypad';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

const PHONE_ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/** iOS Phone / Calculator keypad chrome */
const APPLE_KEYPAD_BG = '#D1D5DB';
const APPLE_KEY_BG = '#FFFFFF';

const LONG_PRESS_DELETE_INTERVAL_MS = 60;
const LONG_PRESS_DELETE_DELAY_MS = 400;

const KEY_H = 64;
const KEY_H_PAY = 54;
const KEY_H_PAY_COMPACT = 40;

/**
 * Shared with FullscreenNumericEntry so the → FAB sits in the same
 * 3-column grid as the pay keys (equal left/right margins + gutters).
 */
export const PAY_KEYPAD_INSET = 16;
/** Half-gutter on each key cell → 10px visual gap between keys. */
export const PAY_KEYPAD_CELL_PAD = 5;

interface DecimalKeypadProps {
  onKey: (key: KeypadKey) => void;
  showDecimal?: boolean;
  variant?: 'default' | 'pay' | 'apple';
  size?: 'default' | 'compact';
  layout?: 'decimal' | 'phone';
  hapticsEnabled?: boolean;
  /** Page color behind the keys. Keys themselves stay unchanged. */
  canvasColor?: string;
}

export const DecimalKeypad = memo(function DecimalKeypad({
  onKey,
  showDecimal = true,
  variant = 'default',
  size = 'default',
  layout = 'decimal',
  hapticsEnabled = true,
  canvasColor,
}: DecimalKeypadProps) {
  const isApple = variant === 'apple';
  const isPay = variant === 'pay';
  const isCompact = size === 'compact' && !isApple;
  const isPhoneLayout = layout === 'phone' || isApple;
  const keyHeight = isApple
    ? 52
    : isPay
      ? isCompact
        ? KEY_H_PAY_COMPACT
        : KEY_H_PAY
      : KEY_H;
  const keyTextSize = isApple ? 28 : isCompact ? 22 : 24;
  const keyActiveOpacity = !hapticsEnabled ? 0.92 : isApple ? 0.45 : 0.55;
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRapidDelete = useCallback(() => {
    if (deleteIntervalRef.current !== null) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
    if (deleteTimeoutRef.current !== null) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
  }, []);

  const handleDeleteLongPress = useCallback(() => {
    if (hapticsEnabled) triggerFeedback('delete');
    deleteTimeoutRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(() => {
        onKey('⌫');
        if (hapticsEnabled) triggerFeedback('delete');
      }, LONG_PRESS_DELETE_INTERVAL_MS);
    }, LONG_PRESS_DELETE_DELAY_MS);
  }, [onKey, hapticsEnabled]);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (hapticsEnabled) {
        triggerFeedback(key === '⌫' ? 'delete' : 'keyPress');
      }
      onKey(key);
    },
    [onKey, hapticsEnabled],
  );

  const renderPayKey = (key: KeypadKey, options?: { blank?: boolean }) => {
    if (options?.blank) {
      return <View key="blank" style={styles.payCell} />;
    }

    if (key === '.' && !showDecimal) {
      return <View key="dot-disabled" style={styles.payCell} />;
    }

    const isBackspace = key === '⌫';

    return (
      <View key={key} style={styles.payCell}>
        <TouchableOpacity
          style={[styles.payKeyFace, { height: keyHeight }]}
          onPress={() => handleKey(isBackspace ? '⌫' : key)}
          onLongPress={isBackspace ? handleDeleteLongPress : undefined}
          onPressOut={isBackspace ? stopRapidDelete : undefined}
          delayLongPress={isBackspace ? LONG_PRESS_DELETE_DELAY_MS : undefined}
          delayPressIn={0}
          activeOpacity={keyActiveOpacity}
          accessibilityRole="button"
          accessibilityLabel={isBackspace ? 'Delete last digit' : `Key ${key}`}
        >
          {isBackspace ? (
            <View style={styles.payIconWrap}>
              <Delete size={22} color={Theme.textSecondary} strokeWidth={2.2} />
            </View>
          ) : (
            <Text style={[styles.payKeyText, { fontSize: keyTextSize }]}>{key}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const keyBase = (isSpecial: boolean) => [
    styles.key,
    { height: keyHeight, minHeight: Math.min(44, keyHeight) },
    isApple && styles.keyApple,
    !isPay && !isApple && isSpecial && styles.keySpecial,
  ];

  const rowGapStyle = [
    styles.row,
    isApple && styles.rowApple,
    isCompact && !isApple && !isPay && styles.rowCompact,
  ];

  const renderDigitKey = (key: KeypadKey, isSpecial: boolean) => {
    const isBackspace = key === '⌫';
    if (isBackspace) {
      return (
        <TouchableOpacity
          key={key}
          style={keyBase(true)}
          onPress={() => handleKey('⌫')}
          onLongPress={handleDeleteLongPress}
          onPressOut={stopRapidDelete}
          delayLongPress={LONG_PRESS_DELETE_DELAY_MS}
          activeOpacity={keyActiveOpacity}
          accessibilityRole="button"
          accessibilityLabel="Delete last digit"
          accessibilityHint="Hold to delete multiple digits"
        >
          {isApple ? (
            <Delete size={24} color={Theme.textPrimaryDark} strokeWidth={2} />
          ) : (
            <Delete size={22} color={Theme.textSecondary} strokeWidth={2.1} />
          )}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={key}
        style={keyBase(isSpecial)}
        onPress={() => handleKey(key)}
        activeOpacity={keyActiveOpacity}
        accessibilityRole="button"
        accessibilityLabel={`Key ${key}`}
      >
        <Text
          style={[
            styles.keyText,
            isApple && styles.keyTextApple,
            !isApple && isSpecial && styles.keyTextSpecial,
            { fontSize: isSpecial && !isApple ? keyTextSize - 4 : keyTextSize },
          ]}
        >
          {key}
        </Text>
      </TouchableOpacity>
    );
  };

  if (isPay) {
    const digitRows = isPhoneLayout ? PHONE_ROWS : ROWS.slice(0, 3);

    return (
      <View
        style={[
          styles.gridPay,
          isCompact && styles.gridPayCompact,
          canvasColor ? { backgroundColor: canvasColor } : null,
        ]}
      >
        {digitRows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.payRow}>
            {row.map((key) => renderPayKey(key))}
          </View>
        ))}
        <View style={styles.payRow}>
          {isPhoneLayout ? (
            <>
              {renderPayKey('0', { blank: true })}
              {renderPayKey('0')}
              {renderPayKey('⌫')}
            </>
          ) : (
            ROWS[3]!.map((key) => renderPayKey(key))
          )}
        </View>
      </View>
    );
  }

  const rows = isPhoneLayout ? PHONE_ROWS : ROWS.slice(0, 3);

  return (
    <View style={[styles.grid, isApple && styles.gridApple]}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={rowGapStyle}>
          {row.map((key) => renderDigitKey(key, false))}
        </View>
      ))}

      {isPhoneLayout ? (
        <View style={rowGapStyle}>
          <View
            style={[keyBase(true), styles.keyAppleSpacer, { height: keyHeight }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {renderDigitKey('0', false)}
          {renderDigitKey('⌫', true)}
        </View>
      ) : (
        <View style={rowGapStyle}>
          {ROWS[3]!.map((key) => {
            if (key === '.' && !showDecimal) {
              return (
                <TouchableOpacity
                  key="double-zero"
                  style={keyBase(true)}
                  onPress={() => {
                    handleKey('0');
                    handleKey('0');
                  }}
                  activeOpacity={keyActiveOpacity}
                  accessibilityRole="button"
                  accessibilityLabel="Key 00"
                >
                  <Text
                    style={[
                      styles.keyText,
                      styles.keyTextSpecial,
                      { fontSize: keyTextSize - 4 },
                    ]}
                  >
                    00
                  </Text>
                </TouchableOpacity>
              );
            }
            const isSpecial = key === '.' || key === '⌫';
            return renderDigitKey(key, isSpecial);
          })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    paddingHorizontal: 10,
    gap: 4,
  },
  gridApple: {
    width: '100%',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 7,
    backgroundColor: APPLE_KEYPAD_BG,
  },
  gridPay: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: PAY_KEYPAD_INSET - PAY_KEYPAD_CELL_PAD,
    paddingTop: PAY_KEYPAD_CELL_PAD,
    paddingBottom: Math.max(10, PAY_KEYPAD_CELL_PAD + 4),
  },
  gridPayCompact: {
    backgroundColor: 'transparent',
    paddingBottom: PAY_KEYPAD_CELL_PAD,
  },
  payRow: {
    flexDirection: 'row',
    width: '100%',
  },
  payCell: {
    flex: 1,
    minWidth: 0,
    padding: PAY_KEYPAD_CELL_PAD,
  },
  payKeyFace: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  payIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payKeyText: {
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] },
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    alignItems: 'stretch',
  },
  rowApple: {
    gap: 7,
  },
  rowCompact: {
    gap: 8,
  },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    minWidth: 0,
  },
  keyApple: {
    backgroundColor: APPLE_KEY_BG,
    borderRadius: 13,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 0,
      },
      android: { elevation: 2 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
    }),
  },
  keyAppleSpacer: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  keySpecial: {
    backgroundColor: Theme.surfaceGray,
  },
  keyDisabled: {
    backgroundColor: 'transparent',
    opacity: 0,
  },
  keyText: {
    fontWeight: '500',
    color: Theme.textPrimary,
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  keyTextApple: {
    fontWeight: '400',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] },
      default: {},
    }),
  },
  keyTextSpecial: {
    color: Theme.textBody,
  },
});
