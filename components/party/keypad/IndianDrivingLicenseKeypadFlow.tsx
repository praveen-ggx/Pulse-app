/**
 * Full-page Indian driving licence entry with segment-aware custom keypad.
 * Desktop web: type with the physical keyboard (on-screen QWERTY hidden).
 * Mobile / tablet: on-screen keypad only.
 */
import { memo, useCallback, useMemo } from "react";
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
import { IndianVehicleRegistrationKeypad } from "@/components/indianVehicle/IndianVehicleRegistrationKeypad";
import { useIndianVehiclePhysicalKeypad } from "@/components/indianVehicle/useIndianVehiclePhysicalKeypad";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import {
  partyKeypadDisplayMono,
  partyKeypadFlowStyles as flow,
} from "@/components/party/keypad/partyKeypadFlowStyles";
import { KeypadDisplayValueWithCaret } from "@/components/party/keypad/KeypadDisplayValueWithCaret";
import {
  appendIndianDlChar,
  deleteIndianDlLastChar,
  getIndianDlFormatHint,
  getIndianDlKeyboardKind,
  getIndianDlNormalizedLength,
  INDIAN_DL_MAX_LENGTH,
} from "@/lib/indianDrivingLicenseInput.util";

const SEGMENT_LABELS = ["AA", "00", "0000", "0000000"] as const;
const SEGMENT_DONE_AT = [2, 4, 8, 15] as const;

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
    const normLen = getIndianDlNormalizedLength(value);
    const keyboardKind = getIndianDlKeyboardKind(normLen);
    const formatHint = useMemo(
      () => getIndianDlFormatHint(normLen),
      [normLen],
    );
    const displayValue = value.trim();
    const showCursor = normLen < INDIAN_DL_MAX_LENGTH;
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
        onChangeText(appendIndianDlChar(value, key));
      },
      [onChangeText, value],
    );

    // Same physical-key map as vehicle plates (letters → numbers by segment).
    useIndianVehiclePhysicalKeypad({
      enabled: isDesktopWeb,
      kind: keyboardKind,
      onKey: handleKey,
    });

    return (
      <View
        style={groupTop ? styles.rootGrouped : flow.root}
        testID={Platform.OS === "web" ? undefined : testID}
      >
        <View style={flow.main}>
          <Text style={wizard.fieldLabel}>LICENCE NUMBER</Text>
          <Text style={flow.formatHint}>{formatHint}</Text>
          {isDesktopWeb ? (
            <Text style={styles.typeHint}>Type with your keyboard</Text>
          ) : null}

          <View style={flow.formatMaskRow}>
            {SEGMENT_LABELS.map((seg, i) => (
              <Text
                key={seg}
                style={[
                  flow.formatMaskSeg,
                  normLen >= SEGMENT_DONE_AT[i]! && flow.formatMaskSegDone,
                ]}
              >
                {seg}
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
              placeholder="TN01 20200001234"
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
