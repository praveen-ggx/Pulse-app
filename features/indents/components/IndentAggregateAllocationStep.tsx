/**
 * Single-step UI for aggregate (partner supply) indent deploy wizard.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { User } from "lucide-react-native";

import { IndianVehicleRegistrationKeypadFlow } from "@/components/indianVehicle/IndianVehicleRegistrationKeypadFlow";
import { DriverNameKeypadFlow } from "@/components/party/keypad/DriverNameKeypadFlow";
import { PhoneNumberKeypadFlow } from "@/components/party/keypad/PhoneNumberKeypadFlow";
import { PartnerRatesKeypadFlow } from "@/features/trips/components/allocation/PartnerRatesKeypadFlow";
import { TripPartnerPickerSection } from "@/features/trips/components/add-trip/TripPartnerPickerSection";
import { supplierToNumericPartyPreview } from "@/features/suppliers/utils/supplierNumericPartyPreview.util";
import Theme from "@/constants/Theme";
import { formatMobileNumber } from "@/lib/format";
import { normalizeIndianMobileLast10 } from "@/features/trips/utils/driverPhoneLookup.util";
import type { StaffHandshakeResult } from "@/features/network/hooks/useStaffHandshake";
import { DriverPhoneRecommendations } from "@/features/trips/components/add-trip/DriverPhoneRecommendations";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { IndentAggregateStep } from "@/features/indents/components/indentAllocationWizardSteps";

export type IndentAggregateAllocationStepProps = {
  step: IndentAggregateStep;
  suppliers: SupplierRow[];
  /** Load-chain loop guard: suppliers that cannot take this load, with reasons. */
  blockedReasonBySupplierId?: Record<string, string>;
  state: StaffHandshakeResult["state"];
  set: StaffHandshakeResult["set"];
  onAddPartner?: () => void;
  /** After a partner tile is tapped — parent advances to Rates. */
  onPartnerSelected?: () => void;
  /**
   * What THIS org itself bid & won on the indent (its own receivable from
   * whoever awarded it) — shown as a fixed "You won" reference next to the
   * payable rate being typed for its own sub-supplier, never written into
   * the rate field itself (the two figures are legitimately different).
   */
  awardedRate?: number | null;
};

export const IndentAggregateAllocationStep = memo(function IndentAggregateAllocationStep({
  step,
  suppliers,
  blockedReasonBySupplierId,
  state,
  set,
  onPartnerSelected,
  awardedRate,
}: IndentAggregateAllocationStepProps) {
  const {
    subcontractSupplierId,
    subcontractRate,
    aggregateAdvancePaid,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    aggregatePhoneMatches,
    aggregatePhoneLookupLoading,
    aggregatePhoneSelectedUserId,
    aggregatePhoneInTrip,
  } = state;

  const phoneLast10 = useMemo(
    () => normalizeIndianMobileLast10(aggregateDriverPhone),
    [aggregateDriverPhone],
  );
  const phoneComplete = phoneLast10.length >= 10;

  const [partnerListExpanded, setPartnerListExpanded] = useState(
    () => !subcontractSupplierId,
  );

  useEffect(() => {
    if (!subcontractSupplierId) setPartnerListExpanded(true);
  }, [subcontractSupplierId]);

  const handleSelectPartner = useCallback(
    (supplier: SupplierRow) => {
      set.subcontractSupplierId(supplier.id);
      setPartnerListExpanded(false);
      onPartnerSelected?.();
    },
    [set, onPartnerSelected],
  );

  const handleClearPartner = useCallback(() => {
    set.subcontractSupplierId(null);
  }, [set]);

  const handlePhoneChange = useCallback(
    (value: string) => {
      set.aggregateDriverPhone(formatMobileNumber(value));
    },
    [set],
  );

  const handleNameChange = useCallback(
    (value: string) => {
      set.aggregateDriverNameManualRef.current = true;
      set.aggregateDriverTrackingName(value);
    },
    [set],
  );

  const phoneFooterExtras = useMemo(
    () => (
      <>
        {aggregatePhoneInTrip ? (
          <Text style={styles.phoneBusy}>
            This driver is already on an active trip — use another number.
          </Text>
        ) : (
          <DriverPhoneRecommendations
            matches={aggregatePhoneMatches}
            loading={aggregatePhoneLookupLoading}
            selectedUserId={aggregatePhoneSelectedUserId}
            onSelect={set.applyAggregatePhoneMatch}
            phoneComplete={phoneComplete}
            compact
          />
        )}
      </>
    ),
    [
      aggregatePhoneInTrip,
      aggregatePhoneMatches,
      aggregatePhoneLookupLoading,
      aggregatePhoneSelectedUserId,
      phoneComplete,
      set,
    ],
  );

  const nameFooterExtras = useMemo(() => {
    const suggestedName = aggregatePhoneMatches.find(
      (m) => m.user_id === aggregatePhoneSelectedUserId,
    )?.full_name?.trim();
    const showSuggestion =
      suggestedName &&
      suggestedName !== aggregateDriverTrackingName.trim();

    if (!showSuggestion) return null;

    return (
      <Pressable
        style={styles.suggestRow}
        onPress={() => {
          set.aggregateDriverNameManualRef.current = false;
          set.aggregateDriverTrackingName(suggestedName);
        }}
        accessibilityRole="button"
      >
        <View style={styles.suggestAvatar}>
          <User size={16} color={Theme.iconPrimary} />
        </View>
        <View style={styles.suggestText}>
          <Text style={styles.suggestLabel}>Use suggested name</Text>
          <Text style={styles.suggestName} numberOfLines={1}>
            {suggestedName}
          </Text>
        </View>
      </Pressable>
    );
  }, [
    aggregatePhoneMatches,
    aggregatePhoneSelectedUserId,
    aggregateDriverTrackingName,
    set,
  ]);

  if (step === "partner") {
    return (
      <TripPartnerPickerSection
        suppliers={suppliers}
        suppliersLoading={false}
        blockedReasonBySupplierId={blockedReasonBySupplierId}
        supplierId={subcontractSupplierId}
        partnerListExpanded={partnerListExpanded}
        setPartnerListExpanded={setPartnerListExpanded}
        onSelectPartner={handleSelectPartner}
        onClearPartner={handleClearPartner}
        onAddPartner={undefined}
        wizardMode
        listMaxHeight={420}
      />
    );
  }

  if (step === "rates") {
    const selectedPartner = suppliers.find((s) => s.id === subcontractSupplierId);
    return (
      <PartnerRatesKeypadFlow
        partnerRate={subcontractRate}
        onPartnerRateChange={set.subcontractRate}
        advancePaid={aggregateAdvancePaid}
        onAdvancePaidChange={set.aggregateAdvancePaid}
        // Reference only — what THIS org bid & won on the indent (its own
        // receivable). The rate typed above is what it pays its own
        // sub-supplier, a separate, smaller-or-larger figure by design; the
        // margin strip shows the difference live as the dispatcher types.
        saleValue={awardedRate != null ? String(awardedRate) : undefined}
        saleLabel="You won"
        partyPreview={
          selectedPartner ? supplierToNumericPartyPreview(selectedPartner) : undefined
        }
        /** Parent WizardPartyContextRow already shows partner. */
        suppressPartyPreview
        wizardShell
      />
    );
  }

  if (step === "driverPhone") {
    return (
      <PhoneNumberKeypadFlow
        label="Driver phone (tracking) *"
        placeholder="10-digit number"
        value={aggregateDriverPhone}
        onChangeText={handlePhoneChange}
        footerExtras={phoneFooterExtras}
        testID="indent-allocation-driver-phone"
        wizardShell
      />
    );
  }

  if (step === "driverName") {
    return (
      <DriverNameKeypadFlow
        label="Driver name (tracking) *"
        placeholder="e.g. Suresh Kumar"
        value={aggregateDriverTrackingName}
        onChangeText={handleNameChange}
        footerExtras={nameFooterExtras}
        testID="indent-allocation-driver-name"
        wizardShell
      />
    );
  }

  if (step === "vehicleReg") {
    return (
      <IndianVehicleRegistrationKeypadFlow
        label="Vehicle number *"
        value={assignVehicleRegistration}
        onChangeText={set.assignVehicleRegistration}
        testID="indent-allocation-vehicle-keypad"
        wizardShell
      />
    );
  }

  return null;
});

const styles = StyleSheet.create({
  phoneBusy: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.destructive,
    lineHeight: 17,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.cardWhite,
  },
  suggestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestText: {
    flex: 1,
    minWidth: 0,
  },
  suggestLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  suggestName: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});
