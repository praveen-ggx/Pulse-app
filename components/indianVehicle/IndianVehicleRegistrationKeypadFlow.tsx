/**
 * Full-page Indian plate entry: display + segment guide + custom keypad (no system keyboard).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Truck } from "lucide-react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
import { WizardActionBarHost } from "@/components/full-page-wizard/WizardActionBarContext";
import { KeypadDisplayValueWithCaret } from "@/components/party/keypad/KeypadDisplayValueWithCaret";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import { IndianVehicleRegistrationKeypad } from "@/components/indianVehicle/IndianVehicleRegistrationKeypad";
import { useIndianVehiclePhysicalKeypad } from "@/components/indianVehicle/useIndianVehiclePhysicalKeypad";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import {
  appendIndianVehicleChar,
  deleteIndianVehicleLastChar,
  getIndianVehicleAllowedNext,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardKind,
  getIndianVehicleNormalizedLength,
  getIndianVehicleSegmentGuide,
  isIndianVehiclePlateComplete,
  type IndianVehicleKeyboardKind,
} from "@/lib/indianVehicleInput.util";

export interface IndianVehicleRegistrationKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  testID?: string;
  wizardShell?: boolean;
  label?: string;
}

export const IndianVehicleRegistrationKeypadFlow = memo(
  function IndianVehicleRegistrationKeypadFlow({
    value,
    onChangeText,
    error = false,
    testID = "indian-vehicle-keypad-flow",
    wizardShell = false,
    label = "Registration",
  }: IndianVehicleRegistrationKeypadFlowProps) {
    const normLen = getIndianVehicleNormalizedLength(value);
    const preferredKind = getIndianVehicleKeyboardKind(value);
    const formatHint = useMemo(
      () => getIndianVehicleFormatHint(value),
      [value],
    );
    const segmentGuide = useMemo(() => getIndianVehicleSegmentGuide(value), [value]);
    const allowedNext = useMemo(() => getIndianVehicleAllowedNext(value), [value]);
    const canToggleMode = allowedNext.letters && allowedNext.digits;
    const [kindOverride, setKindOverride] = useState<IndianVehicleKeyboardKind | null>(
      null,
    );
    const prevPreferredRef = useRef(preferredKind);

    // Drop manual ABC/123 override when the segment preference moves on, or when
    // that character class is no longer legal.
    useEffect(() => {
      if (prevPreferredRef.current !== preferredKind) {
        prevPreferredRef.current = preferredKind;
        setKindOverride(null);
        return;
      }
      if (kindOverride === "letters" && !allowedNext.letters) setKindOverride(null);
      if (kindOverride === "numbers" && !allowedNext.digits) setKindOverride(null);
    }, [preferredKind, allowedNext.letters, allowedNext.digits, kindOverride]);

    const keyboardKind: IndianVehicleKeyboardKind = kindOverride ?? preferredKind;
    const displayValue = value.trim();
    // A 1-letter-series plate completes at 9 chars, a 2-letter one at 10 —
    // gate on completeness, not a fixed length, so the cursor doesn't linger
    // after a complete 9-char plate waiting for a 10th char that never comes.
    const showCursor = !isIndianVehiclePlateComplete(value);
    const inputPlatform = useInputPlatform();
    const { width } = useWindowDimensions();
    const isDesktopWeb = Platform.OS === "web" && inputPlatform === "desktop";
    // Bounded, content-sized wizard card (party flows on web ≥ 720): stack input +
    // keypad at the top instead of spreading them with space-between over a fixed
    // full-screen height, which leaves a large gap above the footer.
    const groupTop = Platform.OS === "web" && width >= 720 && !wizardShell;

    const handleKey = useCallback(
      (key: string) => {
        if (key === "⌫") {
          onChangeText(deleteIndianVehicleLastChar(value));
          return;
        }
        onChangeText(appendIndianVehicleChar(value, key));
      },
      [onChangeText, value],
    );

    const handleToggleMode = useCallback(() => {
      setKindOverride((prev) => {
        const current = prev ?? preferredKind;
        return current === "letters" ? "numbers" : "letters";
      });
    }, [preferredKind]);

    // Desktop: accept whichever classes are legal next — never lock out the
    // other class when both district digits and series letters are valid.
    useIndianVehiclePhysicalKeypad({
      enabled: isDesktopWeb,
      allowed: allowedNext,
      onKey: handleKey,
    });

    return (
      <View style={groupTop ? styles.rootGrouped : styles.root} testID={testID}>
        <View style={[styles.main, wizardShell && styles.mainWizard]}>
          <Text style={wizardShell ? fullPageWizardStyles.wizardFieldLabel : styles.regLabel}>
            {label}
          </Text>
          <Text style={styles.formatHint}>{formatHint}</Text>

          <View style={styles.formatMaskRow}>
            {segmentGuide.map((seg, i) => (
              <Text
                key={`${seg.label}-${i}`}
                style={[
                  styles.formatMaskSeg,
                  seg.done && styles.formatMaskSegDone,
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
              styles.displayRow,
              groupTop && styles.displayRowCompact,
              error && styles.displayRowError,
              isDesktopWeb && pressed && styles.displayRowPressed,
            ]}
            accessibilityRole={isDesktopWeb ? "button" : undefined}
            accessibilityLabel={
              isDesktopWeb
                ? "Vehicle registration. Type letters or numbers with your keyboard."
                : displayValue || "Vehicle registration number"
            }
          >
            <Truck size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
            <KeypadDisplayValueWithCaret
              value={displayValue}
              placeholder="e.g. TN 18 D 2522"
              showCaret={showCursor}
              valueStyle={[
                styles.displayValue,
                displayMono,
                groupTop && styles.displayValueCompact,
              ]}
              placeholderStyle={styles.displayPlaceholder}
              caretStyle={styles.cursor}
              accessibilityLabel={
                displayValue || "Vehicle registration number"
              }
            />
          </Pressable>
        </View>

        {wizardShell || !isDesktopWeb ? (
          <View style={wizardShell ? flow.bottomDock : undefined}>
            {wizardShell ? (
              <WizardActionBarHost style={flow.actionBarHost} />
            ) : null}

            {/* On desktop web the physical keyboard drives entry (useIndianVehiclePhysicalKeypad),
                so the on-screen QWERTY is hidden — it only dominates the layout on laptops/PCs. */}
            {isDesktopWeb ? null : (
              <View
                style={
                  wizardShell || groupTop
                    ? [
                        flow.keypadDockWizard,
                        flow.keypadDockWizardBleed,
                        flow.keypadDockSignIn,
                        flow.padDockFlush,
                      ]
                    : styles.keypadDock
                }
              >
                <IndianVehicleRegistrationKeypad
                  kind={keyboardKind}
                  onKey={handleKey}
                  normalizedLength={normLen}
                  atMaxLength={!allowedNext.letters && !allowedNext.digits}
                  compact={groupTop}
                  canToggleMode={canToggleMode}
                  onToggleMode={handleToggleMode}
                />
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  },
);

const displayMono = Platform.select({
  ios: { fontFamily: "Menlo" as const },
  android: { fontFamily: "monospace" as const },
  web: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" as const,
  },
  default: {},
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "flex-start",
    position: "relative",
  },
  rootGrouped: {
    width: "100%",
    justifyContent: "flex-start",
    gap: 16,
  },
  main: {
    flexShrink: 1,
    minHeight: 0,
    gap: 0,
  },
  mainWizard: {
    /** Match phone / rate keypad — pageRootKeypad is edge-to-edge. */
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 310,
  },
  regLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  formatHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  formatMaskRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  formatMaskSeg: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  formatMaskSegDone: {
    borderColor: Theme.positive,
    color: Theme.positive,
    backgroundColor: Theme.positiveMuted,
  },
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 14 : 16,
    minHeight: 56,
    backgroundColor: Theme.surfaceForm,
  },
  displayRowCompact: {
    paddingVertical: 10,
    minHeight: 46,
    borderRadius: 10,
  },
  displayRowError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  displayRowPressed: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  leadingIcon: {
    marginRight: 10,
  },
  displayValue: {
    flexGrow: 0,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Theme.textPrimaryDark,
  },
  displayValueCompact: {
    fontSize: 16,
    letterSpacing: 1,
  },
  displayPlaceholder: {
    color: Theme.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  cursor: {
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: Theme.positive,
    marginLeft: 4,
    flexShrink: 0,
  },
  keypadDock: {
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 10,
    paddingBottom: 4,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: "transparent",
  },
});
