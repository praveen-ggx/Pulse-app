/**
 * Segment-aware Indian plate keypad — Apple iOS QWERTY / phone-pad chrome.
 * Non-functional keys (shift, space, mode toggle) render disabled for clear UX.
 */
import { memo, useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Delete } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { triggerFeedback } from "@/components/mobile-input/feedback";
import {
  INDIAN_VEHICLE_TOTAL_LENGTH,
  type IndianVehicleKeyboardKind,
} from "@/lib/indianVehicleInput.util";

/** iOS keyboard chrome (matches DecimalKeypad apple variant). */
const APPLE_KEYPAD_BG = "#D1D5DB";
const APPLE_KEY_BG = "#FFFFFF";
const APPLE_SPECIAL_BG = "#ACB3BC";
const APPLE_DISABLED_BG = "#B8BEC8";
const APPLE_DISABLED_TEXT = "#8E95A3";

const LETTER_ROW_1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"] as const;
const LETTER_ROW_2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"] as const;
const LETTER_ROW_3 = ["Z", "X", "C", "V", "B", "N", "M"] as const;

const NUMBER_ROWS: readonly (readonly string[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export type IndianVehicleKeypadKey = string;

export interface IndianVehicleRegistrationKeypadProps {
  kind: IndianVehicleKeyboardKind;
  onKey: (key: IndianVehicleKeypadKey) => void;
  disabled?: boolean;
  /** Current normalized plate length — gates delete at 0. */
  normalizedLength?: number;
  /** No legal next character (plate is at its maximum) — disables input keys. */
  atMaxLength?: boolean;
  /** Denser keys + tighter chrome for the bounded desktop/tablet wizard card. */
  compact?: boolean;
  /**
   * When both letters and digits are legal next, enable ABC/123 so the user can
   * finish a 2-digit district or a multi-letter series without being stuck.
   */
  canToggleMode?: boolean;
  onToggleMode?: () => void;
}

type KeyVariant = "char" | "special" | "disabled";

type KeyCellProps = {
  label?: string;
  icon?: "delete" | "shift";
  onPress?: () => void;
  disabled?: boolean;
  variant?: KeyVariant;
  flex?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: "letter" | "utility";
  compact?: boolean;
};

function KeyCell({
  label,
  icon,
  onPress,
  disabled = false,
  variant = "char",
  flex = 1,
  accessibilityLabel,
  style,
  textStyle = "letter",
  compact = false,
}: KeyCellProps) {
  const isDisabled = disabled || variant === "disabled";
  const isSpecial = variant === "special" || variant === "disabled";

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.key,
        compact && styles.keyCompact,
        { flex },
        isSpecial ? styles.keySpecial : styles.keyChar,
        isDisabled && styles.keyInactive,
        pressed && !isDisabled && styles.keyPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
    >
      {icon === "delete" ? (
        <Delete
          size={compact ? 18 : 22}
          color={isDisabled ? APPLE_DISABLED_TEXT : Theme.textPrimaryDark}
          strokeWidth={2}
        />
      ) : icon === "shift" ? (
        <Text
          style={[
            styles.keyText,
            compact && styles.keyTextCompact,
            styles.keyTextSpecial,
            isDisabled && styles.keyTextInactive,
          ]}
        >
          ⇧
        </Text>
      ) : label ? (
        <Text
          style={[
            styles.keyText,
            compact && styles.keyTextCompact,
            textStyle === "utility" && styles.keyTextUtility,
            isSpecial && styles.keyTextSpecial,
            isDisabled && styles.keyTextInactive,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RowSpacer({ flex = 0.5 }: { flex?: number }) {
  return <View style={{ flex }} pointerEvents="none" accessibilityElementsHidden />;
}

function ModeFooter({
  kind,
  canToggleMode,
  onToggleMode,
  compact,
}: {
  kind: IndianVehicleKeyboardKind;
  canToggleMode: boolean;
  onToggleMode?: () => void;
  compact: boolean;
}) {
  const modeToggleLabel = kind === "letters" ? "123" : "ABC";
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <KeyCell
        label={modeToggleLabel}
        variant={canToggleMode ? "special" : "disabled"}
        flex={1.25}
        textStyle="utility"
        compact={compact}
        onPress={canToggleMode ? onToggleMode : undefined}
        disabled={!canToggleMode}
        accessibilityLabel={
          canToggleMode
            ? kind === "letters"
              ? "Switch to numbers"
              : "Switch to letters"
            : kind === "letters"
              ? "Numbers switch automatic for this field"
              : "Letters switch automatic for this field"
        }
      />
      <KeyCell
        variant="disabled"
        flex={3.8}
        compact={compact}
        accessibilityLabel="Space not used for plates"
        style={styles.spaceKey}
      />
      <KeyCell
        label="return"
        variant="disabled"
        flex={1.25}
        textStyle="utility"
        compact={compact}
        accessibilityLabel="Return not used for plates"
        style={styles.returnKey}
      />
    </View>
  );
}

export const IndianVehicleRegistrationKeypad = memo(
  function IndianVehicleRegistrationKeypad({
    kind,
    onKey,
    disabled = false,
    normalizedLength = 0,
    atMaxLength,
    compact = false,
    canToggleMode = false,
    onToggleMode,
  }: IndianVehicleRegistrationKeypadProps) {
    const atMax =
      atMaxLength ?? normalizedLength >= INDIAN_VEHICLE_TOTAL_LENGTH;
    const canDelete = normalizedLength > 0 && !disabled;
    const inputLocked = disabled || atMax;

    const handlePress = useCallback(
      (key: string) => {
        if (disabled) return;
        if (key !== "⌫" && inputLocked) return;
        if (key === "⌫" && !canDelete) return;
        triggerFeedback(key === "⌫" ? "delete" : "keyPress");
        onKey(key);
      },
      [disabled, inputLocked, canDelete, onKey],
    );

    if (kind === "numbers") {
      return (
        <View style={[styles.wrap, compact && styles.wrapCompact]}>
          <View style={[styles.grid, compact && styles.gridCompact]}>
            {NUMBER_ROWS.map((row, rowIdx) => (
              <View key={`num-row-${rowIdx}`} style={[styles.row, compact && styles.rowCompact]}>
                {row.map((digit) => (
                  <KeyCell
                    key={digit}
                    label={digit}
                    onPress={() => handlePress(digit)}
                    disabled={inputLocked}
                    variant="char"
                    compact={compact}
                    accessibilityLabel={`Digit ${digit}`}
                  />
                ))}
              </View>
            ))}
            <View style={[styles.row, compact && styles.rowCompact]}>
              <View
                style={[styles.numPadSpacer, compact && styles.numPadSpacerCompact]}
                pointerEvents="none"
                accessibilityElementsHidden
              />
              <KeyCell
                label="0"
                onPress={() => handlePress("0")}
                disabled={inputLocked}
                variant="char"
                compact={compact}
                accessibilityLabel="Digit 0"
              />
              <KeyCell
                icon="delete"
                onPress={() => handlePress("⌫")}
                disabled={!canDelete}
                variant="special"
                compact={compact}
                accessibilityLabel="Delete"
              />
            </View>
            {canToggleMode ? (
              <ModeFooter
                kind={kind}
                canToggleMode={canToggleMode}
                onToggleMode={onToggleMode}
                compact={compact}
              />
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.wrap, compact && styles.wrapCompact]}>
        <View style={[styles.grid, compact && styles.gridCompact]}>
          <View style={[styles.row, compact && styles.rowCompact]}>
            {LETTER_ROW_1.map((letter) => (
              <KeyCell
                key={letter}
                label={letter}
                onPress={() => handlePress(letter)}
                disabled={inputLocked}
                variant="char"
                compact={compact}
                accessibilityLabel={`Letter ${letter}`}
              />
            ))}
          </View>

          <View style={[styles.row, styles.rowInset, compact && styles.rowCompact]}>
            <RowSpacer flex={0.45} />
            {LETTER_ROW_2.map((letter) => (
              <KeyCell
                key={letter}
                label={letter}
                onPress={() => handlePress(letter)}
                disabled={inputLocked}
                variant="char"
                compact={compact}
                accessibilityLabel={`Letter ${letter}`}
              />
            ))}
            <RowSpacer flex={0.45} />
          </View>

          <View style={[styles.row, compact && styles.rowCompact]}>
            <KeyCell
              icon="shift"
              variant="disabled"
              flex={1.35}
              compact={compact}
              accessibilityLabel="Shift not used for plates"
            />
            {LETTER_ROW_3.map((letter) => (
              <KeyCell
                key={letter}
                label={letter}
                onPress={() => handlePress(letter)}
                disabled={inputLocked}
                variant="char"
                flex={1}
                compact={compact}
                accessibilityLabel={`Letter ${letter}`}
              />
            ))}
            <KeyCell
              icon="delete"
              onPress={() => handlePress("⌫")}
              disabled={!canDelete}
              variant="special"
              flex={1.35}
              compact={compact}
              accessibilityLabel="Delete"
            />
          </View>

          {canToggleMode ? (
            <View style={[styles.row, compact && styles.rowCompact]}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
                <KeyCell
                  key={`mix-${digit}`}
                  label={digit}
                  onPress={() => handlePress(digit)}
                  disabled={inputLocked}
                  variant="char"
                  compact={compact}
                  accessibilityLabel={`Digit ${digit}`}
                />
              ))}
            </View>
          ) : null}

          <ModeFooter
            kind={kind}
            canToggleMode={canToggleMode}
            onToggleMode={onToggleMode}
            compact={compact}
          />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    backgroundColor: APPLE_KEYPAD_BG,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    ...Platform.select({
      web: { userSelect: "none" as const },
      default: {},
    }),
  },
  wrapCompact: {
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 5,
  },
  grid: {
    width: "100%",
    gap: 7,
  },
  gridCompact: {
    gap: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 6,
  },
  rowCompact: {
    gap: 5,
  },
  rowInset: {
    paddingHorizontal: 2,
  },
  key: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.28,
        shadowRadius: 0,
      },
      android: { elevation: 2 },
      web: {
        boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
        cursor: "pointer" as const,
      },
      default: {},
    }),
  },
  keyCompact: {
    minHeight: 34,
    borderRadius: 7,
  },
  keyChar: {
    backgroundColor: APPLE_KEY_BG,
  },
  keySpecial: {
    backgroundColor: APPLE_SPECIAL_BG,
    ...Platform.select({
      ios: { shadowOpacity: 0.18 },
      default: {},
    }),
  },
  keyInactive: {
    backgroundColor: APPLE_DISABLED_BG,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
      web: { boxShadow: "none", cursor: "default" as const },
      default: {},
    }),
  },
  keyTransparent: {
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  numPadSpacer: {
    flex: 1,
    minHeight: 44,
  },
  numPadSpacerCompact: {
    minHeight: 34,
  },
  keyPressed: {
    backgroundColor: "#E8EAED",
    transform: [{ scale: 0.98 }],
  },
  spaceKey: {
    borderRadius: 6,
  },
  returnKey: {
    borderRadius: 6,
  },
  keyText: {
    fontSize: 22,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    ...Platform.select({
      ios: { fontFamily: "System" },
      default: {},
    }),
  },
  keyTextCompact: {
    fontSize: 17,
  },
  keyTextUtility: {
    fontSize: 16,
    fontWeight: "400",
    textTransform: "lowercase",
  },
  keyTextSpecial: {
    fontSize: 20,
    fontWeight: "500",
    textTransform: "none",
  },
  keyTextInactive: {
    color: APPLE_DISABLED_TEXT,
    fontWeight: "400",
  },
});
