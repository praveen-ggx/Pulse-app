/**
 * Full-screen step-by-step driver wizard (mobile / narrow).
 */
import { memo, useCallback, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { BookUser } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { IndianDrivingLicenseKeypadFlow } from "@/components/party/keypad/IndianDrivingLicenseKeypadFlow";
import { PhoneNumberKeypadFlow } from "@/components/party/keypad/PhoneNumberKeypadFlow";
import { PartyMobileWizardShell } from "./PartyMobileWizardShell";
import {
  PARTY_WIZARD_DESKTOP_MIN_WIDTH,
  partyMobileWizardStyles as styles,
} from "./partyMobileWizardStyles";

export type PartyDriverWizardStep =
  | "source"
  | "name"
  | "phone"
  | "license"
  | "extras";

export const DRIVER_WIZARD_STEPS: PartyDriverWizardStep[] = [
  "source",
  "name",
  "phone",
  "license",
  "extras",
];

export function nextStepAfterDriverImport(
  name: string,
  phone: string,
  license: string,
): PartyDriverWizardStep {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    if (license.trim()) return "extras";
    return "license";
  }
  if (name.trim().length >= 2) return "phone";
  return "name";
}

function stepIndex(step: PartyDriverWizardStep): number {
  return DRIVER_WIZARD_STEPS.indexOf(step);
}

export interface PartyDriverMobileWizardProps {
  entityTitle: string;
  wizardStep: PartyDriverWizardStep;
  onWizardStepChange: (step: PartyDriverWizardStep) => void;
  onClose: () => void;

  driverName: string;
  onDriverNameChange: (value: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  phoneMaxLength?: number;
  driverDl: string;
  onDriverDlChange: (value: string) => void;
  driverEmail: string;
  onDriverEmailChange: (value: string) => void;
  driverPayableAmount: number | null;
  onDriverPayableAmountChange: (value: number | null) => void;
  driverCommissionPercent: number | null;
  onDriverCommissionPercentChange: (value: number | null) => void;
  driverCommissionPerKm: number | null;
  onDriverCommissionPerKmChange: (value: number | null) => void;

  importLoading: boolean;
  contactPickerAvailable: boolean;
  importError: string | null;
  onImportContacts: () => void;

  formError: string | null;
  noOrganizationBanner?: ReactNode;
  phoneStepExtras?: ReactNode;

  canAdvance: boolean;
  onAdvance: () => void;
  advanceLabel?: string;
}

export const PartyDriverMobileWizard = memo(function PartyDriverMobileWizard({
  entityTitle,
  wizardStep,
  onWizardStepChange,
  onClose,
  driverName,
  onDriverNameChange,
  driverPhone,
  onDriverPhoneChange,
  phoneMaxLength = 10,
  driverDl,
  onDriverDlChange,
  driverEmail,
  onDriverEmailChange,
  driverPayableAmount,
  onDriverPayableAmountChange,
  driverCommissionPercent,
  onDriverCommissionPercentChange,
  driverCommissionPerKm,
  onDriverCommissionPerKmChange,
  importLoading,
  contactPickerAvailable,
  importError,
  onImportContacts,
  formError,
  noOrganizationBanner,
  phoneStepExtras,
  canAdvance,
  onAdvance,
  advanceLabel = "Continue",
}: PartyDriverMobileWizardProps) {
  const { width } = useWindowDimensions();
  const isDesktop =
    Platform.OS === "web" && width >= PARTY_WIZARD_DESKTOP_MIN_WIDTH;
  const isPhoneStep = wizardStep === "phone";
  const isLicenseStep = wizardStep === "license";
  const isKeypadStep = isPhoneStep || isLicenseStep;

  const handleBack = useCallback(() => {
    const idx = stepIndex(wizardStep);
    if (idx <= 0) {
      onClose();
      return;
    }
    onWizardStepChange(DRIVER_WIZARD_STEPS[idx - 1]!);
  }, [wizardStep, onClose, onWizardStepChange]);

  const stepTitle = (() => {
    switch (wizardStep) {
      case "source":
        return "How do you want to add them?";
      case "name":
        return "Driver name";
      case "phone":
        return "Mobile number";
      case "license":
        return "Driving licence";
      case "extras":
        return "Pay & contact (optional)";
      default:
        return "";
    }
  })();

  const stepHint = (() => {
    switch (wizardStep) {
      case "source":
        return "Import from contacts or enter details manually.";
      case "name":
        return "Legal name as on the driving licence.";
      case "phone":
        return "10-digit Indian mobile. We can look up existing driver accounts.";
      case "license":
        return "Format like TN01 20200001234.";
      case "extras":
        return "Email and salary or commission — skip anything you do not use.";
      default:
        return "";
    }
  })();

  const stepBody = (() => {
    switch (wizardStep) {
      case "source":
        return (
          <View style={[styles.sourceCard, isDesktop && styles.sourceCardDesktop]}>
            <View
              style={[
                styles.sourceBlock,
                isDesktop && styles.sourceBlockDesktop,
              ]}
            >
              <Pressable
                style={[
                  styles.importPrimary,
                  isDesktop && styles.importPrimaryDesktop,
                  (!contactPickerAvailable || importLoading) &&
                    styles.importPrimaryDim,
                ]}
                onPress={onImportContacts}
                disabled={!contactPickerAvailable || importLoading}
              >
                <BookUser size={18} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={styles.importPrimaryText}>
                  {importLoading ? "Opening contacts…" : "Import from contacts"}
                </Text>
              </Pressable>
              {importError ? (
                <Text
                  style={[
                    styles.importError,
                    isDesktop && styles.importErrorDesktop,
                  ]}
                >
                  {importError}
                </Text>
              ) : null}
              {!contactPickerAvailable ? (
                <Text
                  style={[
                    styles.importHint,
                    isDesktop && styles.importHintDesktop,
                  ]}
                >
                  Contact import is not available on this device. Use manual entry
                  below.
                </Text>
              ) : null}
              <View
                style={[
                  styles.sourceDivider,
                  isDesktop && styles.sourceDividerDesktop,
                ]}
              />
              <Pressable
                style={[
                  styles.manualLink,
                  isDesktop && styles.manualLinkDesktop,
                ]}
                onPress={() => onWizardStepChange("name")}
              >
                <FontAwesome name="pencil" size={13} color={Theme.primary} />
                <Text style={styles.manualLinkText}>Enter manually</Text>
              </Pressable>
            </View>
          </View>
        );
      case "name":
        return (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Legal name"
              placeholderTextColor={Theme.textMuted}
              value={driverName}
              onChangeText={onDriverNameChange}
              autoFocus
              testID="party-driver-name-input"
            />
          </View>
        );
      case "phone":
        return (
          <PhoneNumberKeypadFlow
            value={driverPhone}
            onChangeText={onDriverPhoneChange}
            maxLength={phoneMaxLength}
            label="MOBILE (+91)"
            placeholder="10-digit number"
            error={Boolean(formError)}
            testID="party-driver-phone-input"
            footerExtras={phoneStepExtras}
          />
        );
      case "license":
        return (
          <IndianDrivingLicenseKeypadFlow
            value={driverDl}
            onChangeText={onDriverDlChange}
            error={Boolean(formError)}
            testID="party-driver-dl-input"
          />
        );
      case "extras":
        return (
          <View style={{ gap: 20 }}>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor={Theme.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={driverEmail}
                onChangeText={onDriverEmailChange}
                testID="party-driver-email-input"
              />
            </View>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>FIXED SALARY (₹)</Text>
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 25000"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
                value={
                  driverPayableAmount != null && driverPayableAmount !== 0
                    ? String(driverPayableAmount)
                    : ""
                }
                onChangeText={(v) => {
                  const n =
                    v.trim() === ""
                      ? null
                      : parseFloat(v.replace(/[^0-9.]/g, ""));
                  onDriverPayableAmountChange(
                    n != null && !Number.isNaN(n) ? n : null,
                  );
                }}
              />
            </View>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>COMMISSION (%)</Text>
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
                value={
                  driverCommissionPercent != null &&
                  driverCommissionPercent !== 0
                    ? String(driverCommissionPercent)
                    : ""
                }
                onChangeText={(v) => {
                  const n =
                    v.trim() === ""
                      ? null
                      : parseFloat(v.replace(/[^0-9.]/g, ""));
                  const val =
                    n != null && !Number.isNaN(n)
                      ? Math.min(100, Math.max(0, n))
                      : null;
                  onDriverCommissionPercentChange(val);
                }}
              />
            </View>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>PER KM (₹/KM)</Text>
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 8"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
                value={
                  driverCommissionPerKm != null &&
                  driverCommissionPerKm !== 0
                    ? String(driverCommissionPerKm)
                    : ""
                }
                onChangeText={(v) => {
                  const n =
                    v.trim() === ""
                      ? null
                      : parseFloat(v.replace(/[^0-9.]/g, ""));
                  onDriverCommissionPerKmChange(
                    n != null && !Number.isNaN(n) && n >= 0 ? n : null,
                  );
                }}
              />
            </View>
          </View>
        );
      default:
        return null;
    }
  })();

  return (
    <PartyMobileWizardShell
      entityTitle={entityTitle}
      stepIds={DRIVER_WIZARD_STEPS}
      currentStep={wizardStep}
      onStepBack={handleBack}
      onClose={onClose}
      stepTitle={stepTitle}
      stepHint={stepHint}
      showEntitySubtitle={wizardStep === "source"}
      bodyLayout={isKeypadStep ? "keypad" : "default"}
      formError={formError}
      noOrganizationBanner={noOrganizationBanner}
      hideFooter={wizardStep === "source"}
      canAdvance={canAdvance}
      onAdvance={onAdvance}
      advanceLabel={advanceLabel}
    >
      {stepBody}
    </PartyMobileWizardShell>
  );
});
