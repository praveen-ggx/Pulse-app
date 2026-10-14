/**
 * Create Trip — commodity / load details step (vehicle, load type, tons).
 * Create Indent optionally shows vehicle count (N matching indent rows).
 */
import { memo } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import Theme from "@/constants/Theme";
import {
  INDENT_VEHICLE_COUNT_CHIPS,
  INDENT_VEHICLE_COUNT_ERROR,
  isValidIndentVehicleCount,
  sanitizeIndentVehicleCountInput,
} from "@/features/indents/utils/indentVehicleCount.util";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopCommodityStepProps = {
  vehicleType: string;
  loadType: string;
  tons: string;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  onTonsChange: (value: string) => void;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
  compact?: boolean;
  /** When set with onVehicleCountChange, shows "how many vehicles" (indent create). */
  vehicleCount?: string;
  onVehicleCountChange?: (value: string) => void;
  vehicleCountError?: boolean;
  vehicleCountErrorMessage?: string;
};

export const CreateTripDesktopCommodityStep = memo(
  function CreateTripDesktopCommodityStep({
    vehicleType,
    loadType,
    tons,
    onVehicleTypeChange,
    onLoadTypeChange,
    onTonsChange,
    vehicleTypeError,
    loadTypeError,
    tonsError,
    indentVehicleType,
    indentLoadType,
    compact = false,
    vehicleCount,
    onVehicleCountChange,
    vehicleCountError = false,
    vehicleCountErrorMessage,
  }: CreateTripDesktopCommodityStepProps) {
    const showVehicleCount =
      vehicleCount !== undefined && onVehicleCountChange != null;
    const liveInvalid =
      showVehicleCount && !isValidIndentVehicleCount(vehicleCount);
    const showVehicleCountError = vehicleCountError || liveInvalid;
    const vehicleCountErrorText =
      vehicleCountErrorMessage ||
      (showVehicleCountError ? INDENT_VEHICLE_COUNT_ERROR : "");
    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={[s.commodityClientSection, compact && { gap: 8 }]}>
          <Text style={[s.sectionHeading, compact && s.compactSectionHeading]}>
            Load details
          </Text>
          <View style={s.fieldSection}>
            <TripCommodityFields
              useVehicleCatalog
              vehicleType={vehicleType}
              loadType={loadType}
              tons={tons}
              onVehicleTypeChange={onVehicleTypeChange}
              onLoadTypeChange={onLoadTypeChange}
              onTonsChange={onTonsChange}
              vehicleTypeError={vehicleTypeError}
              loadTypeError={loadTypeError}
              tonsError={tonsError}
              indentVehicleType={indentVehicleType}
              indentLoadType={indentLoadType}
              isWide={false}
              useFormChrome
              preferWebSelect={Platform.OS === "web" && !compact}
              desktopChrome
              fieldLabelStyle={[
                s.desktopFieldLabel,
                compact && s.compactSectionHeading,
              ]}
              fieldInputStyle={[s.inputBoxClean, s.formFieldInput]}
            />
            {showVehicleCount ? (
              <View style={{ marginTop: 4 }}>
                <Text
                  style={[
                    s.desktopFieldLabel,
                    compact && s.compactSectionHeading,
                  ]}
                >
                  Vehicles
                </Text>
                <View
                  style={[
                    s.inputBoxClean,
                    s.formFieldInput,
                    { paddingVertical: 0, justifyContent: "center" },
                    showVehicleCountError ? s.inputBoxCleanError : null,
                  ]}
                >
                  <TextInput
                    value={vehicleCount}
                    onChangeText={(t) =>
                      onVehicleCountChange(sanitizeIndentVehicleCountInput(t))
                    }
                    placeholder="1"
                    placeholderTextColor={Theme.placeholder}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: Theme.textPrimaryDark,
                      padding: 0,
                      minHeight: 42,
                    }}
                    accessibilityLabel="Number of vehicles"
                  />
                </View>
                {showVehicleCountError && vehicleCountErrorText ? (
                  <Text style={[s.desktopInlineErrorText, { marginTop: 6 }]}>
                    {vehicleCountErrorText}
                  </Text>
                ) : (
                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: "500",
                      color: Theme.textMuted,
                    }}
                  >
                    Creates that many matching indents.
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {INDENT_VEHICLE_COUNT_CHIPS.map((value) => {
                    const selected = vehicleCount.trim() === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => onVehicleCountChange(value)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          minHeight: 36,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: selected
                            ? Theme.primary
                            : Theme.borderLight,
                          backgroundColor: selected
                            ? Theme.primaryLight
                            : Theme.cardWhite,
                          justifyContent: "center",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${value} vehicles`}
                        accessibilityState={{ selected }}
                        hitSlop={4}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: selected
                              ? Theme.primary
                              : Theme.textPrimaryDark,
                          }}
                        >
                          {value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  },
);
