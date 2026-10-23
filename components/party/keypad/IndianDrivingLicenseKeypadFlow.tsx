/**
 * Full-page Indian driving licence entry with segment-aware custom keypad.
 * Desktop web: type with the physical keyboard (on-screen QWERTY hidden).
 * Mobile / tablet: on-screen keypad only.
 */
import { memo, useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CreditCard } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { InputFormatPicker } from "@/components/indianVehicle/InputFormatPicker";
import { IndianVehicleRegistrationKeypad } from "@/components/indianVehicle/IndianVehicleRegistrationKeypad";
import { useIndianVehiclePhysicalKeypad } from "@/components/indianVehicle/useIndianVehiclePhysicalKeypad";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import {
  partyKeypadDisplayMono,
  partyKeypadFlowStyles as flow,
} from "@/components/party/keypad/partyKeypadFlowStyles";
import { KeypadDisplayValueWithCaret } from "@/components/party/keypad/KeypadDisplayValueWithCaret";
import type { IndianVehicleKeyboardKind } from "@/lib/indianVehicleInput.util";
import {
  appendIndianDlChar,
  applyIndianDlKeystroke,
  deleteIndianDlLastChar,
  detectIndianDlFormat,
  getIndianDlFormatHint,
  getIndianDlKeyboardKind,
  getIndianDlNormalizedLength,
  INDIAN_DL_FORMATS,
  INDIAN_DL_MAX_LENGTH,
  type IndianDlFormat,
} from "@/lib/indianDrivingLicenseInput.util";

const SEGMENTS: Record<IndianDlFormat, readonly { label: string; doneAt: number }[]> = {
  standard: [
    { label: "AA", doneAt: 2 },
    { label: "00", doneAt: 4 },
    { label: "0000", doneAt: 8 },
    { label: "0000000", doneAt: 15 },
  ],
  rtoLetter: [
    { label: "AA", doneAt: 2 },
    { label: "00", doneAt: 4 },
    { label: "A", doneAt: 5 },
    { label: "0000", doneAt: 9 },
    { label: "0000000", doneAt: 16 },
  ],
  // Old / smart cards vary in shape — no fixed mask.
  other: [],
};

const OTHER_DL_MAX_LENGTH = 18;

export interface IndianDrivingLicenseKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  testID?: string;
}

export const IndianDrivingLicenseKeypadFlow = memo(
  function IndianDrivingLicenseKeypadFlow({
    value,
    onChangeText,
    error = false,
    testID = "indian-dl-keypad-flow",
  }: IndianDrivingLicenseKeypadFlowProps) {
    const [format, setFormat] = useState<IndianDlFormat>(
      () => detectIndianDlFormat(value) ?? "standard",
    );
    const normLen = getIndianDlNormalizedLength(value);
    const isOther = format === "other";
    // "other" mixes letters and digits freely, so the user switches with ABC/123.
    const [otherKind, setOtherKind] = useState<IndianVehicleKeyboardKind>("numbers");
    const keyboardKind = isOther
      ? otherKind
      : getIndianDlKeyboardKind(normLen, format);
    const formatHint = useMemo(
      () => getIndianDlFormatHint(normLen, format),
      [normLen, format],
    );
    const displayValue = value.trim();
    const showCursor = normLen < (isOther ? OTHER_DL_MAX_LENGTH : INDIAN_DL_MAX_LENGTH);
    const inputPlatform = useInputPlatform();
    const { width } = useWindowDimensions();
    const isDesktopWeb = Platform.OS === "web" && inputPlatform === "desktop";
    // Party wizard card on mid-width web: keep content top-stacked.
    const groupTop = Platform.OS === "web" && width >= 720;

    const handleKey = useCallback(
      (key: string) => {
        if (key === "⌫") {
          onChangeText(deleteIndianDlLastChar(value));
          return;
        }
        onChangeText(appendIndianDlChar(value, key, format));
      },
      [onChangeText, value, format],
    );

    const handleFormatChange = useCallback(
      (next: IndianDlFormat) => {
        setFormat(next);
        // Keep what still fits the new layout; drop the rest.
        onChangeText(applyIndianDlKeystroke(value, next));
      },
      [onChangeText, value],
    );

    // Same physical-key map as vehicle plates (letters → numbers by segment).
    useIndianVehiclePhysicalKeypad({
      enabled: isDesktopWeb,
      kind: keyboardKind,
      allowed: isOther ? { letters: true, digits: true } : undefined,
      onKey: handleKey,
    });

    return (
      <View
        style={groupTop ? styles.rootGrouped : flow.root}
        testID={Platform.OS === "web" ? undefined : testID}
      >
        <View style={flow.main}>
          <Text style={wizard.fieldLabel}>LICENCE NUMBER</Text>
          <InputFormatPicker
            options={INDIAN_DL_FORMATS}
            value={format}
            onChange={handleFormatChange}
            testID={`${testID}-format`}
          />
          <Text style={flow.formatHint}>{formatHint}</Text>
          {isDesktopWeb ? (
            <Text style={styles.typeHint}>Type with your keyboard</Text>
          ) : null}

          <View style={flow.formatMaskRow}>
            {SEGMENTS[format].map((seg, i) => (
              <Text
                key={`${seg.label}-${i}`}
                style={[
                  flow.formatMaskSeg,
                  normLen >= seg.doneAt && flow.formatMaskSegDone,
                ]}
              >
                {seg.label}
              </Text>
            ))}
          </View>

          <Pressable
            onPress={() => {
              if (!isDesktopWeb || typeof window === "undefined") return;
              window.focus();
            }}
            disabled={!isDesktopWeb}
            style={({ pressed }) => [
              flow.displayRow,
              error && flow.displayRowError,
              isDesktopWeb && pressed && styles.displayRowPressed,
            ]}
            accessibilityRole={isDesktopWeb ? "button" : undefined}
            accessibilityLabel={
              isDesktopWeb
                ? "Driving licence. Type letters then numbers with your keyboard."
                : displayValue || "Driving licence number"
            }
          >
            <CreditCard
              size={20}
              color={Theme.iconMuted}
              style={flow.leadingIcon}
            />
            <KeypadDisplayValueWithCaret
              value={displayValue}
              placeholder={
                INDIAN_DL_FORMATS.find((f) => f.id === format)?.example ??
                "TN01 20200001234"
              }
              showCaret={showCursor}
              valueStyle={[flow.displayValue, partyKeypadDisplayMono]}
              placeholderStyle={flow.displayPlaceholder}
              caretStyle={flow.cursor}
              accessibilityLabel={displayValue || "Driving licence number"}
            />
          </Pressable>
        </View>

        {/* Desktop: physical keyboard only. Mobile/tablet: on-screen keypad. */}
        {isDesktopWeb ? null : (
          <View style={groupTop ? flow.keypadDockWizard : flow.keypadDock}>
            <IndianVehicleRegistrationKeypad
              kind={keyboardKind}
              onKey={handleKey}
              normalizedLength={Math.min(normLen, 1)}
              canToggleMode={isOther}
              onToggleMode={() =>
                setOtherKind((k) => (k === "letters" ? "numbers" : "letters"))
              }
            />
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  rootGrouped: {
    width: "100%",
    justifyContent: "flex-start",
    gap: 16,
  },
  typeHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 8,
    marginTop: -4,
  },
  displayRowPressed: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
});
