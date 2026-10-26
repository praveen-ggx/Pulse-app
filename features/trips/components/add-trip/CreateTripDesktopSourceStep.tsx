import { Building2, Truck } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { supplierToNumericPartyPreview } from "@/features/suppliers/utils/supplierNumericPartyPreview.util";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { PartnerRatesKeypadFlow } from "@/features/trips/components/allocation/PartnerRatesKeypadFlow";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";

import {
  CreateTripDesktopPartnerGrid,
  DesktopPartySearchField,
  DesktopPickerHeaderActions,
  filterPartnersByPartyQuery,
} from "./CreateTripDesktopPickers";
import { PartnerRateDesktopModal } from "./PartnerRateDesktopModal";
import {
  DesktopSectionHeading,
} from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

function formatInr(raw: string): string | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")}`;
}

export type CreateTripDesktopSourceStepProps = {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  invalid: (field: AddTripIssueField) => boolean;
  suppliers: SupplierRow[];
  suppliersLoading: boolean;
  partnerListExpanded: boolean;
  onExpandPartnerList: () => void;
  onTogglePartnerList: () => void;
  onSelectPartner: (supplier: SupplierRow) => void;
  onAddPartner?: () => void;
  /** Full-width source cards + stacked partner grid on mobile. */
  compact?: boolean;
  /** `source` = Asset vs Market only. `partner` = existing supplier + rate. */
  variant?: "source" | "partner";
  allowedSupplyModes?: readonly ("asset" | "aggregate")[];
};

export const CreateTripDesktopSourceStep = memo(function CreateTripDesktopSourceStep({
  state,
  setters,
  invalid,
  suppliers,
  suppliersLoading,
  partnerListExpanded,
  onExpandPartnerList,
  onTogglePartnerList,
  onSelectPartner,
  compact = false,
  variant = "source",
  allowedSupplyModes = ["asset", "aggregate"],
}: CreateTripDesktopSourceStepProps) {
  const isAsset = state.supplySource === "asset";
  const isAggregate = state.supplySource === "aggregate";
  const partnerOnly = variant === "partner";
  const sourceOnly = variant === "source";
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateDoneAttempted, setRateDoneAttempted] = useState(false);
  const [partySearch, setPartySearch] = useState("");

  const selectedSupplier = useMemo(
    () => suppliers.find((row) => row.id === state.supplierId) ?? null,
    [state.supplierId, suppliers],
  );

  const filteredSuppliers = useMemo(
    () => filterPartnersByPartyQuery(suppliers, partySearch),
    [suppliers, partySearch],
  );
  const partnerListOpen =
    partnerListExpanded || partySearch.trim().length > 0;

  const handlePartySearch = useCallback(
    (value: string) => {
      setPartySearch(value);
      if (value.trim()) onExpandPartnerList();
    },
    [onExpandPartnerList],
  );

  const showMobilePartnerRateKeypad =
    compact && (partnerOnly || isAggregate) && Boolean(state.supplierId) && !sourceOnly;

  const rateDisplay = formatInr(state.supplierRate);
  const advanceDisplay = formatInr(state.advancePaid);

  const handleSelectPartner = useCallback(
    (supplier: SupplierRow) => {
      onSelectPartner(supplier);
      if (!compact) {
        setRateDoneAttempted(false);
        setRateModalOpen(true);
      }
    },
    [compact, onSelectPartner],
  );

  const handleChangePartnerFromModal = useCallback(() => {
    setRateModalOpen(false);
    setRateDoneAttempted(false);
    setters.setSupplierSelection(null, "");
    onExpandPartnerList();
  }, [onExpandPartnerList, setters]);

  const handleRateDone = useCallback(() => {
    const rateOk = Boolean(formatInr(state.supplierRate));
    if (!rateOk) {
      setRateDoneAttempted(true);
      return;
    }
    setRateDoneAttempted(false);
    setRateModalOpen(false);
  }, [state.supplierRate]);

  if (showMobilePartnerRateKeypad) {
    return (
      <View style={s.sourcePartnerRateKeypadPage}>
        <PartnerRatesKeypadFlow
          wizardShell
          compact
          partnerRate={state.supplierRate}
          onPartnerRateChange={(v) => setters.setSupplierRate(v)}
          advancePaid={state.advancePaid}
          onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
          partyPreview={
            selectedSupplier
              ? supplierToNumericPartyPreview(selectedSupplier)
              : undefined
          }
          onPartyPress={() => {
            setters.setSupplierSelection(null, "");
            onExpandPartnerList();
          }}
          saleValue={state.clientPrice}
          hint="Enter the rate you will pay this partner for the trip."
          rateErrorMessage={
            invalid("partnerRate") ? "Enter partner rate" : undefined
          }
          advanceErrorMessage={
            invalid("advancePaid") ? "Invalid advance amount" : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={[s.stepBody, compact && s.compactStepBody]}>
      {!partnerOnly ? (
        <View style={s.stepSection}>
          {compact ? (
            <SupplyAllocationModeBar
              variant="wizard"
              layout="stack"
              mode={isAsset ? "asset" : "aggregate"}
              onModeChange={(mode) => setters.setSupplySource(mode)}
              assignLater={state.assignLater}
              onAssignLaterChange={setters.setAssignLater}
              showAssignLater={false}
              allowedModes={allowedSupplyModes}
              aggregateTitle="Market"
              aggregateSubtitle="Existing supplier or share for bidding"
            />
          ) : (
            <>
              <DesktopSectionHeading>Supply source *</DesktopSectionHeading>
              <View style={s.sourceModeRow}>
                {allowedSupplyModes.includes("asset") ? (
                  <Pressable
                    style={[s.sourceModeCard, isAsset && s.sourceModeCardActive]}
                    onPress={() => setters.setSupplySource("asset")}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isAsset }}
                  >
                    <View
                      style={[
                        s.sourceModeIcon,
                        isAsset && s.sourceModeIconActive,
                      ]}
                    >
                      <Truck
                        size={20}
                        color={isAsset ? Theme.textOnPrimary : Theme.textRouteCard}
                        strokeWidth={2.25}
                      />
                    </View>
                    <View style={s.sourceModeCopy}>
                      <Text
                        style={[
                          s.sourceModeTitle,
                          isAsset && s.sourceModeTitleActive,
                        ]}
                      >
                        Asset
                      </Text>
                      <Text style={s.sourceModeSub}>
                        Use your own drivers and vehicles
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                {allowedSupplyModes.includes("aggregate") ? (
                  <Pressable
                    style={[
                      s.sourceModeCard,
                      isAggregate && s.sourceModeCardActive,
                    ]}
                    onPress={() => setters.setSupplySource("aggregate")}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isAggregate }}
                  >
                    <View
                      style={[
                        s.sourceModeIcon,
                        isAggregate && s.sourceModeIconActive,
                      ]}
                    >
                      <Building2
                        size={20}
                        color={
                          isAggregate ? Theme.textOnPrimary : Theme.textRouteCard
                        }
                        strokeWidth={2.25}
                      />
                    </View>
                    <View style={s.sourceModeCopy}>
                      <Text
                        style={[
                          s.sourceModeTitle,
                          isAggregate && s.sourceModeTitleActive,
                        ]}
                      >
                        Market
                      </Text>
                      <Text style={s.sourceModeSub}>
                        Existing supplier or share for bidding
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      ) : null}

      {sourceOnly && isAsset ? (
        <View
          style={[
            s.sourceGuidanceBanner,
            compact && s.compactSourceGuidanceBanner,
          ]}
        >
          <Text
            style={[
              s.sourceGuidanceTitle,
              compact && s.compactSourceGuidanceTitle,
            ]}
          >
            Next: Allocation
          </Text>
          <Text
            style={[
              s.sourceGuidanceText,
              compact && s.compactSourceGuidanceText,
            ]}
          >
            On the next step you can assign a driver and vehicle, or choose
            Assign later and link them on the trip screen.
          </Text>
        </View>
      ) : null}

      {sourceOnly && isAggregate ? (
        <View
          style={[
            s.sourceGuidanceBanner,
            compact && s.compactSourceGuidanceBanner,
          ]}
        >
          <Text
            style={[
              s.sourceGuidanceTitle,
              compact && s.compactSourceGuidanceTitle,
            ]}
          >
            Next: Market
          </Text>
          <Text
            style={[
              s.sourceGuidanceText,
              compact && s.compactSourceGuidanceText,
            ]}
          >
            Choose an existing supplier or share this requirement for bidding.
          </Text>
        </View>
      ) : null}

      {partnerOnly ? (
        <View style={[s.sourceAggregatePanel, compact && { gap: 10 }]}>
          {compact ? (
            <View style={s.compactPartyToolbar}>
              <View style={s.compactPartyToolbarTop}>
                <Text style={[s.sectionHeading, s.compactSectionHeading]}>
                  Transport partner *
                </Text>
                <View style={s.desktopPickerHeaderActions}>
                  <DesktopPickerHeaderActions
                    showChange={Boolean(state.supplierId)}
                    changeExpanded={partnerListOpen}
                    onToggleChange={onTogglePartnerList}
                  />
                </View>
              </View>
              <DesktopPartySearchField
                compact
                value={partySearch}
                onChangeText={handlePartySearch}
                placeholder="Search partner"
                accessibilityLabel="Search transport partner"
              />
            </View>
          ) : (
            <View style={s.commodityClientHeaderRow}>
              <View style={s.commodityClientHeaderTitle}>
                <DesktopSectionHeading>Transport partner *</DesktopSectionHeading>
              </View>
              <DesktopPartySearchField
                value={partySearch}
                onChangeText={handlePartySearch}
                placeholder="Search partner"
                accessibilityLabel="Search transport partner"
              />
              <View style={s.desktopPickerHeaderActions}>
                <DesktopPickerHeaderActions
                  showChange={Boolean(state.supplierId)}
                  changeExpanded={partnerListOpen}
                  onToggleChange={onTogglePartnerList}
                />
              </View>
            </View>
          )}

          {suppliersLoading ? (
            <ActivityIndicator color={Theme.iconPrimary} style={{ marginVertical: 16 }} />
          ) : (
            <CreateTripDesktopPartnerGrid
              compact={compact}
              suppliers={filteredSuppliers}
              suppliersLoading={false}
              selectedSupplierId={state.supplierId}
              listExpanded={partnerListOpen}
              onExpandList={onExpandPartnerList}
              onSelectPartner={handleSelectPartner}
              hasError={invalid("partner")}
            />
          )}

          {state.supplierId && !compact ? (
            <View style={s.sourceRatesBlock}>
              <DesktopSectionHeading>Partner cost</DesktopSectionHeading>
              <Pressable
                style={[
                  s.sourceRateSummaryCard,
                  invalid("partnerRate") && s.sourceRateSummaryCardError,
                ]}
                onPress={() => {
                  setRateDoneAttempted(false);
                  setRateModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit partner rate"
              >
                <View style={s.sourceRateSummaryCopy}>
                  <Text style={s.sourceRateSummaryLabel}>Partner rate</Text>
                  {rateDisplay ? (
                    <Text style={s.sourceRateSummaryValue}>{rateDisplay}</Text>
                  ) : (
                    <Text style={s.sourceRateSummaryValueMuted}>
                      Tap to enter rate
                    </Text>
                  )}
                  {advanceDisplay ? (
                    <Text style={s.sourceRateSummaryAdvance}>
                      Advance {advanceDisplay}
                    </Text>
                  ) : null}
                  {invalid("partnerRate") ? (
                    <Text style={s.salePriceError}>Enter partner rate</Text>
                  ) : null}
                </View>
                <View style={s.sourceRateSummaryAction}>
                  <Text style={s.sourceRateSummaryActionText}>
                    {rateDisplay ? "Edit" : "Add rate"}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {!compact ? (
        <PartnerRateDesktopModal
          visible={rateModalOpen && Boolean(state.supplierId)}
          onClose={() => {
            setRateDoneAttempted(false);
            setRateModalOpen(false);
          }}
          onDone={handleRateDone}
          partnerRate={state.supplierRate}
          onPartnerRateChange={(v) => {
            setRateDoneAttempted(false);
            setters.setSupplierRate(v);
          }}
          advancePaid={state.advancePaid}
          onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
          partyPreview={
            selectedSupplier
              ? supplierToNumericPartyPreview(selectedSupplier)
              : undefined
          }
          onChangePartner={handleChangePartnerFromModal}
          rateError={rateDoneAttempted && !formatInr(state.supplierRate)}
          advanceError={invalid("advancePaid")}
          saleValue={state.clientPrice}
        />
      ) : null}
    </View>
  );
});
