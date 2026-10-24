import DateTimePicker from "@react-native-community/datetimepicker";
import { ArrowUpDown, ChevronRight, MapPin, Replace } from "lucide-react-native";
import { memo, useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { coordsOrUnset } from "@/lib/placeSearch.util";
import { TypewriterText } from "@/components/TypewriterText";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import type { RouteExtraStopDraft } from "@/features/trips/utils/routeExtraStops.util";

import { CreateTripPickupLocationPicker } from "./CreateTripPickupLocationPicker";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import { LocationSearchField } from "./LocationSearchField";
import { RouteExtraStopsEditor } from "./RouteExtraStopsEditor";
import type { PickupRecommendation } from "./pickupRecommendations.util";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return toISODate(new Date());
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function getDayAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
}

export type CreateTripRouteState = {
  pickupArea: string;
  dropLocation: string;
  pickupLat: number | null;
  pickupLon: number | null;
  dropLat: number | null;
  dropLon: number | null;
  tripStartDate: string;
};

export type CreateTripRouteSetters = {
  setPickupArea: (value: string) => void;
  setDropLocation: (value: string) => void;
  setPickupCoords: (lat: number | null, lon: number | null) => void;
  setDropCoords: (lat: number | null, lon: number | null) => void;
  setTripStartDate: (value: string) => void;
};

export type CreateTripDesktopRouteStepProps = {
  state: CreateTripRouteState;
  setters: CreateTripRouteSetters;
  fieldInvalid: (field: AddTripIssueField) => boolean;
  onPickupDropdownOpenChange: (open: boolean) => void;
  onDropDropdownOpenChange: (open: boolean) => void;
  /** Stack columns for mobile / narrow widths. */
  compact?: boolean;
  /** Client warehouse / office location cards for pickup. */
  pickupRecommendations?: readonly PickupRecommendation[];
  onSelectPickupRecommendation?: (rec: PickupRecommendation) => void;
  pickupLocationsLoading?: boolean;
  /**
   * When a contract lane is selected, pickup/drop are locked from the lane —
   * show a compact corridor summary and make trip date the primary focus.
   */
  contractRouteLocked?: boolean;
  /** Jump back to client / lane gate to pick a different contract lane. */
  onChangeLane?: () => void;
  /** FTL stops between pickup and drop. Omit both to hide "Add stop". */
  extraStops?: readonly RouteExtraStopDraft[];
  onExtraStopsChange?: Dispatch<SetStateAction<RouteExtraStopDraft[]>>;
  /** Show the per-stop supplier pay field (hide for own-fleet trips). */
  showExtraStopSupplierCharge?: boolean;
};

export const CreateTripDesktopRouteStep = memo(function CreateTripDesktopRouteStep({
  state,
  setters,
  fieldInvalid,
  onPickupDropdownOpenChange,
  onDropDropdownOpenChange,
  compact = false,
  pickupRecommendations = [],
  onSelectPickupRecommendation,
  pickupLocationsLoading = false,
  contractRouteLocked = false,
  onChangeLane,
  extraStops,
  onExtraStopsChange,
  showExtraStopSupplierCharge = true,
}: CreateTripDesktopRouteStepProps) {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  const quickDates = [
    { label: "Today", get: getToday },
    { label: "Tomorrow", get: getTomorrow },
    { label: "Day after", get: getDayAfter },
  ] as const;

  const swapLocations = useCallback(() => {
    const {
      pickupArea,
      dropLocation,
      pickupLat,
      pickupLon,
      dropLat,
      dropLon,
    } = state;
    setters.setPickupArea(dropLocation);
    setters.setDropLocation(pickupArea);
    if (dropLat != null && dropLon != null) {
      setters.setPickupCoords(dropLat, dropLon);
    }
    if (pickupLat != null && pickupLon != null) {
      setters.setDropCoords(pickupLat, pickupLon);
    }
  }, [setters, state]);

  const handleSelectRecommendation = useCallback(
    (rec: PickupRecommendation) => {
      onSelectPickupRecommendation?.(rec);
    },
    [onSelectPickupRecommendation],
  );

  const extraStopsEditor =
    extraStops && onExtraStopsChange ? (
      <RouteExtraStopsEditor
        stops={extraStops}
        onChange={onExtraStopsChange}
        compact={compact}
        showSupplierCharge={showExtraStopSupplierCharge}
        onDropdownOpenChange={onDropDropdownOpenChange}
      />
    ) : null;

  const pickupLabel = state.pickupArea.trim() || "—";
  const dropLabel = state.dropLocation.trim() || "—";

  const dateSection = (
    <View
      style={[
        s.stepSection,
        compact && s.compactStepSection,
        contractRouteLocked && s.routeDateSectionHero,
      ]}
    >
      <Text style={[s.sectionHeading, compact && s.compactSectionHeading]}>
        Trip date
      </Text>
      {contractRouteLocked ? (
        <Text style={s.routeDateHeroHint}>
          Contract corridor is locked — choose when this move should start.
        </Text>
      ) : null}
      <View style={s.routeDateSection}>
        <View
          style={[
            s.quickDateRow,
            compact && s.compactQuickDateRow,
            contractRouteLocked && s.quickDateRowHero,
          ]}
        >
          {quickDates.map(({ label, get }) => {
            const iso = get();
            const isActive = state.tripStartDate === iso;
            return (
              <Pressable
                key={label}
                style={[
                  s.quickDateChip,
                  compact && s.compactQuickDateChip,
                  contractRouteLocked && s.quickDateChipHero,
                  isActive && s.quickDateChipActive,
                ]}
                onPress={() => setters.setTripStartDate(iso)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    s.quickDateChipText,
                    contractRouteLocked && s.quickDateChipTextHero,
                    isActive && s.quickDateChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          style={[
            s.inputBoxClean,
            s.routeDateInputShell,
            compact && s.compactRouteDateInputShell,
            contractRouteLocked && s.routeDateInputShellHero,
            fieldInvalid("tripDate") && s.inputBoxCleanError,
          ]}
        >
          {Platform.OS === "web" ? (
            <TextInput
              style={[s.dateInput, contractRouteLocked && s.dateInputHero]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Theme.placeholder}
              value={state.tripStartDate}
              onChangeText={setters.setTripStartDate}
              autoCorrect={false}
            />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowStartDatePicker(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    s.routeDateNativeValue,
                    contractRouteLocked && s.routeDateNativeValueHero,
                  ]}
                >
                  {state.tripStartDate
                    ? new Date(`${state.tripStartDate}T12:00:00`).toLocaleDateString(
                        "en-IN",
                        {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "Tap to pick date"}
                </Text>
              </TouchableOpacity>
              {showStartDatePicker ? (
                Platform.OS === "android" ? (
                  <DateTimePicker
                    value={
                      state.tripStartDate
                        ? new Date(`${state.tripStartDate}T12:00:00`)
                        : new Date()
                    }
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      setShowStartDatePicker(false);
                      if (e.type === "set" && date) {
                        setters.setTripStartDate(toISODate(date));
                      }
                    }}
                  />
                ) : (
                  <Modal visible transparent animationType="slide">
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: Theme.overlayBackdrop }}
                      activeOpacity={1}
                      onPress={() => setShowStartDatePicker(false)}
                    >
                      <View
                        style={{
                          marginTop: "auto",
                          backgroundColor: Theme.cardWhite,
                          padding: 16,
                        }}
                      >
                        <DateTimePicker
                          value={
                            state.tripStartDate
                              ? new Date(`${state.tripStartDate}T12:00:00`)
                              : new Date()
                          }
                          mode="date"
                          display="spinner"
                          minimumDate={new Date()}
                          onChange={(_, date) =>
                            date && setters.setTripStartDate(toISODate(date))
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  </Modal>
                )
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );

  const contractCorridorSummary = (
    <View style={[s.stepSection, compact && s.compactStepSection, s.routeContractSummary]}>
      <View style={s.routeContractHeaderRow}>
        <Text style={[s.sectionHeading, compact && s.compactSectionHeading, s.routeContractHeaderTitle]}>
          Contract corridor
        </Text>
        {onChangeLane ? (
          <Pressable
            onPress={onChangeLane}
            style={({ pressed }) => [
              s.routeChangeLaneBtn,
              compact && s.routeChangeLaneBtnCompact,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change contract lane"
            hitSlop={8}
          >
            <Replace size={compact ? 12 : 13} color={Theme.primary} strokeWidth={2.4} />
            <Text style={[s.routeChangeLaneBtnText, compact && s.routeChangeLaneBtnTextCompact]}>
              Change lane
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={s.routeContractCard}>
        <View style={s.routeContractNode}>
          <View style={s.routeContractPin}>
            <MapPin size={14} color={Theme.primary} strokeWidth={2.5} />
          </View>
          <View style={s.routeContractNodeCopy}>
            <Text style={s.routeContractNodeLabel}>Pickup</Text>
            <Text style={s.routeContractNodeValue} numberOfLines={2}>
              {pickupLabel}
            </Text>
          </View>
        </View>
        <View style={s.routeContractDivider}>
          <View style={s.routeContractRule} />
          <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.5} />
          <View style={s.routeContractRule} />
        </View>
        <View style={s.routeContractNode}>
          <View style={[s.routeContractPin, s.routeContractPinDrop]}>
            <ChevronRight size={14} color={Theme.iconPrimary} strokeWidth={2.5} />
          </View>
          <View style={s.routeContractNodeCopy}>
            <Text style={s.routeContractNodeLabel}>Drop</Text>
            <Text style={s.routeContractNodeValue} numberOfLines={2}>
              {dropLabel}
            </Text>
          </View>
        </View>
      </View>
      <Text style={s.routeContractLockedHint}>
        From your selected contract lane. Use Change lane to pick a different corridor.
      </Text>
      {extraStopsEditor}
    </View>
  );

  const pickupDropSection = (
    <View style={[s.stepSection, compact && s.compactStepSection]}>
      <Text style={[s.sectionHeading, compact && s.compactSectionHeading]}>
        Pickup & drop
      </Text>
      <View style={[s.routeFieldsStack, compact && s.compactRouteFieldsStack]}>
        <CreateTripPickupLocationPicker
          recommendations={pickupRecommendations}
          selectedAddress={state.pickupArea}
          onSelect={handleSelectRecommendation}
          loading={pickupLocationsLoading}
          compact={compact}
        />

        <LocationSearchField
          label="Pickup *"
          placeholder={
            pickupRecommendations.length > 0
              ? "Or search another pickup location"
              : "Search or pick pickup location"
          }
          value={state.pickupArea}
          onChangeText={setters.setPickupArea}
          onSelectPlace={(_name, coords) => {
            const { lat, lon } = coordsOrUnset(coords);
            setters.setPickupCoords(lat, lon);
          }}
          leadingIcon={
            <MapPin size={16} color={Theme.textRouteCard} strokeWidth={2} />
          }
          presentation="desktopShell"
          compact={compact}
          labelStyle={s.desktopFieldLabel}
          inputStyle={fieldInvalid("pickup") ? s.inputBoxCleanError : undefined}
          onDropdownOpenChange={onPickupDropdownOpenChange}
        />

        {extraStopsEditor}

        <View style={[s.routeSwapRow, compact && s.compactRouteSwapRow]}>
          <Pressable
            onPress={swapLocations}
            style={s.routeSwapBtn}
            accessibilityRole="button"
            accessibilityLabel="Swap pickup and drop locations"
          >
            <ArrowUpDown size={14} color={Theme.textRouteCard} strokeWidth={2.5} />
          </Pressable>
        </View>

        <LocationSearchField
          label="Drop *"
          placeholder="Search or pick drop location"
          value={state.dropLocation}
          onChangeText={setters.setDropLocation}
          onSelectPlace={(_name, coords) => {
            const { lat, lon } = coordsOrUnset(coords);
            setters.setDropCoords(lat, lon);
          }}
          leadingIcon={
            <ChevronRight size={16} color={Theme.textRouteCard} strokeWidth={2.5} />
          }
          presentation="desktopShell"
          compact={compact}
          labelStyle={s.desktopFieldLabel}
          inputStyle={fieldInvalid("drop") ? s.inputBoxCleanError : undefined}
          onDropdownOpenChange={onDropDropdownOpenChange}
        />
      </View>

      {!compact ? (
        <View style={[s.infoBanner, s.routeInfoBannerBelowPickup]}>
          <View style={s.infoBannerIcon}>
            <ChevronRight size={16} color={Theme.iconPrimary} strokeWidth={2.5} />
          </View>
          <View style={s.infoBannerCopy}>
            <TypewriterText
              text="Update your route details"
              style={s.infoBannerTitle}
              msPerChar={36}
            />
            <Text style={s.infoBannerBody}>
              Add accurate pickup and drop points for better tracking and ETA
              forecasting.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  if (contractRouteLocked) {
    if (compact) {
      return (
        <View style={[s.stepBody, s.compactStepBody, s.compactRouteBody]}>
          {dateSection}
          {contractCorridorSummary}
        </View>
      );
    }
    return (
      <View style={s.stepBody}>
        <View style={s.routeStepGridContract}>
          <View style={s.routeStepColPrimary}>{dateSection}</View>
          <View style={s.routeStepColSecondary}>{contractCorridorSummary}</View>
        </View>
      </View>
    );
  }

  /** Mobile: dedicated vertical stack — never reuse desktop row grid (avoids RN Web overlap). */
  if (compact) {
    return (
      <View style={[s.stepBody, s.compactStepBody, s.compactRouteBody]}>
        {dateSection}
        {pickupDropSection}
      </View>
    );
  }

  return (
    <View style={s.stepBody}>
      <View style={s.routeStepGrid}>
        <View style={s.routeStepCol}>{pickupDropSection}</View>
        <View style={s.routeStepCol}>{dateSection}</View>
      </View>
    </View>
  );
});
