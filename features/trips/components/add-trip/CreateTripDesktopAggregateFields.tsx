import { memo } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import { WizardEntitySummaryCard } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import type { DriverRow, ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import { DriverPhoneRecommendations } from "@/features/trips/components/add-trip/DriverPhoneRecommendations";
import { normalizeIndianMobileLast10 } from "@/features/trips/utils/driverPhoneLookup.util";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleTextInputKeyboardType,
} from "@/lib/indianVehicleInput.util";
import { formatMobileNumber } from "@/lib/format";
import type { AddTripIssueField } from "./useAddTripForm";

import {
  DesktopFieldLabel,
  DesktopInputShell,
  DesktopSectionHeading,
} from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopAggregateFieldsProps = {
  partnerRate: string;
  onPartnerRateChange: (value: string) => void;
  advancePaid: string;
  onAdvancePaidChange: (value: string) => void;
  /** Aggregate driver commission % as raw text (optional — blank means no agreed terms). */
  driverCommissionPercent: string;
  onDriverCommissionPercentChange: (value: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  suppressPartyPreview?: boolean;
  rateError?: boolean;
  advanceError?: boolean;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  vehicleText: string;
  onVehicleTextChange: (value: string) => void;
  invalid: (field: AddTripIssueField) => boolean;
  driverPhoneMatches?: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading?: boolean;
  selectedDriverMatchId?: string | null;
  onSelectDriverMatch?: (match: ExistingDriverMatch) => void;
  driverPhoneInTrip?: boolean;
  fleetDrivers?: readonly DriverRow[];
  /** When true, hide partner rate/advance (already captured on Source step). */
  fleetOnly?: boolean;
  /** Stack phone + lookup and rate columns on mobile. */
  compact?: boolean;
};

export const CreateTripDesktopAggregateFields = memo(
  function CreateTripDesktopAggregateFields({
    partnerRate,
    onPartnerRateChange,
    advancePaid,
    onAdvancePaidChange,
    driverCommissionPercent,
    onDriverCommissionPercentChange,
    partyPreview,
    suppressPartyPreview = false,
    rateError = false,
    advanceError = false,
    driverName,
    onDriverNameChange,
    driverPhone,
    onDriverPhoneChange,
    vehicleText,
    onVehicleTextChange,
    invalid,
    driverPhoneMatches = [],
    driverPhoneLookupLoading = false,
    selectedDriverMatchId = null,
    onSelectDriverMatch,
    driverPhoneInTrip = false,
    fleetDrivers = [],
    fleetOnly = false,
    compact = false,
  }: CreateTripDesktopAggregateFieldsProps) {
    const phoneLast10 = normalizeIndianMobileLast10(driverPhone);
    const phoneComplete = phoneLast10.length >= 10;
    const vehicleKeyboard = getIndianVehicleTextInputKeyboardType(vehicleText);

    const currencyInputProps = Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    });

    return (
      <View style={s.allocationForm}>
        {partyPreview && !suppressPartyPreview ? (
          <View style={s.summaryCardFull}>
            <WizardEntitySummaryCard
              label="Partner"
              name={partyPreview.name}
              subtitle={partyPreview.subtitle ?? null}
              entityType={partyPreview.entityType ?? "supplier"}
              avatarUrl={partyPreview.avatarUrl ?? null}
              avatarSeed={partyPreview.avatarSeed ?? null}
            />
          </View>
        ) : null}

        {fleetOnly ? (
          <DesktopSectionHeading>Fleet details</DesktopSectionHeading>
        ) : (
          <DesktopSectionHeading>Partner rates & fleet details</DesktopSectionHeading>
        )}
        {!fleetOnly ? (
        <View style={compact ? s.compactStackTight : s.allocationFormRow}>
          <View style={compact ? s.compactCol : s.allocationFormCol}>
            <DesktopFieldLabel>Partner rate (₹) *</DesktopFieldLabel>
            <DesktopInputShell error={rateError}>
              <View style={s.salePriceInputShell}>
                <Text style={s.aggregateCurrency}>₹</Text>
                <TextInput
                  style={s.aggregateAmountInput}
                  placeholder="42000"
                  placeholderTextColor={Theme.placeholder}
                  value={partnerRate}
                  onChangeText={onPartnerRateChange}
                  keyboardType="numeric"
                  {...currencyInputProps}
                />
              </View>
            </DesktopInputShell>
            {rateError ? (
              <Text style={s.salePriceError}>Enter partner rate</Text>
            ) : null}
          </View>
          <View style={compact ? s.compactCol : s.allocationFormCol}>
            <DesktopFieldLabel>Advance paid (₹)</DesktopFieldLabel>
            <DesktopInputShell error={advanceError}>
              <View style={s.salePriceInputShell}>
                <Text style={s.aggregateCurrency}>₹</Text>
                <TextInput
                  style={s.aggregateAmountInput}
                  placeholder="10000"
                  placeholderTextColor={Theme.placeholder}
                  value={advancePaid}
                  onChangeText={onAdvancePaidChange}
                  keyboardType="numeric"
                  {...currencyInputProps}
                />
              </View>
            </DesktopInputShell>
            {advanceError ? (
              <Text style={s.salePriceError}>Invalid advance amount</Text>
            ) : null}
          </View>
        </View>
        ) : null}

        <View
          style={
            compact
              ? s.compactStackTight
              : [s.allocationFormRow, s.allocationFormRowTop, s.allocationPhoneAlertRow]
          }
        >
          <View style={compact ? s.compactCol : s.allocationFormCol}>
            <DesktopFieldLabel>Driver phone *</DesktopFieldLabel>
            <DesktopInputShell error={invalid("driverPhone") || driverPhoneInTrip}>
              <View style={s.inPhoneFieldRow}>
                <View style={s.inPhoneCcBlock} accessibilityLabel="India +91">
                  <IndiaFlagIcon width={20} height={14} />
                  <Text style={s.inPhoneCcText}>+91</Text>
                </View>
                <TextInput
                  style={s.inPhoneDigitsInput}
                  placeholder="98765 43210"
                  placeholderTextColor={Theme.placeholder}
                  value={phoneLast10}
                  onChangeText={(v) => onDriverPhoneChange(formatMobileNumber(v))}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  maxLength={10}
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  {...currencyInputProps}
                />
              </View>
            </DesktopInputShell>
            {phoneLast10.length > 0 && phoneLast10.length < 10 ? (
              <Text style={s.inPhoneDigitHint}>{phoneLast10.length}/10 digits</Text>
            ) : null}
            {driverPhoneInTrip && !invalid("driverPhone") ? (
              <Text style={[s.allocationWarnCompactText, { marginTop: 6, flex: 0 }]}>
                Driver is on another trip — ask them to finish it before assigning here.
              </Text>
            ) : null}
          </View>

          <View
            style={
              compact
                ? s.compactCol
                : [s.allocationFormCol, s.allocationPhoneAlertCol]
            }
          >
            {compact ? null : (
              <Text
                style={[s.desktopFieldLabel, s.allocationPhoneAlertSpacer]}
                accessibilityElementsHidden
              >
                Lookup
              </Text>
            )}
            {onSelectDriverMatch ? (
              <DriverPhoneRecommendations
                matches={driverPhoneMatches}
                loading={driverPhoneLookupLoading}
                selectedUserId={selectedDriverMatchId}
                onSelect={onSelectDriverMatch}
                phoneComplete={phoneComplete}
                layout={compact ? "stack" : "aside"}
                emptyHint="Enter the driver’s real name in the field below, or invite them to Pulse first."
                fleetDrivers={fleetDrivers}
              />
            ) : null}
          </View>
        </View>

        <View style={s.allocationFieldBlockFull}>
          <DesktopFieldLabel>Vehicle number *</DesktopFieldLabel>
          <DesktopInputShell error={invalid("vehicleNumber")}>
            <TextInput
              style={s.desktopPlainInput}
              placeholder="e.g. TN 18 D 2522"
              placeholderTextColor={Theme.placeholder}
              value={vehicleText}
              onChangeText={(v) => onVehicleTextChange(applyIndianVehicleKeystroke(v))}
              keyboardType={Platform.OS === "web" ? "default" : vehicleKeyboard}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              inputMode="text"
              {...currencyInputProps}
            />
          </DesktopInputShell>
        </View>

        <View style={s.allocationFieldBlockFull}>
          <DesktopFieldLabel>Driver commission (%)</DesktopFieldLabel>
          <DesktopInputShell>
            <View style={s.salePriceInputShell}>
              <TextInput
                style={s.aggregateAmountInput}
                placeholder="0"
                placeholderTextColor={Theme.placeholder}
                value={driverCommissionPercent}
                onChangeText={(v) =>
                  onDriverCommissionPercentChange(v.replace(/[^0-9.]/g, ""))
                }
                keyboardType="numeric"
                maxLength={5}
                {...currencyInputProps}
              />
              <Text style={s.aggregateCurrency}>%</Text>
            </View>
          </DesktopInputShell>
        </View>

        <View style={s.allocationFieldBlockFull}>
          <DesktopFieldLabel>Driver name *</DesktopFieldLabel>
          <DesktopInputShell error={invalid("driverName")}>
            <TextInput
              style={s.desktopPlainInput}
              placeholder="Enter driver’s full name"
              placeholderTextColor={Theme.placeholder}
              value={driverName}
              onChangeText={onDriverNameChange}
              autoCapitalize="words"
              {...currencyInputProps}
            />
          </DesktopInputShell>
        </View>
      </View>
    );
  },
);
