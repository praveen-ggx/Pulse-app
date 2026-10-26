import { CircleDot, Plus, X } from "lucide-react-native";
import { memo, useCallback, type Dispatch, type SetStateAction } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Theme from "@/constants/Theme";
import { coordsOrUnset } from "@/lib/placeSearch.util";
import { formatINR } from "@/lib/format";
import {
  newRouteExtraStopDraft,
  ROUTE_EXTRA_STOPS_MAX,
  routeExtraStopDraftIncomplete,
  routeExtraStopInputs,
  summarizeRouteExtraStops,
  type RouteExtraStopDraft,
} from "@/features/trips/utils/routeExtraStops.util";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import { LocationSearchField } from "./LocationSearchField";

export type RouteExtraStopsEditorProps = {
  stops: readonly RouteExtraStopDraft[];
  onChange: Dispatch<SetStateAction<RouteExtraStopDraft[]>>;
  compact?: boolean;
  /** Own-fleet trips have no supplier to pay; hide that column. */
  showSupplierCharge?: boolean;
  onDropdownOpenChange?: (open: boolean) => void;
};

function ChargeField({
  label,
  value,
  onChangeText,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.chargeField}>
      <Text style={s.desktopFieldLabel}>{label}</Text>
      <View style={[s.inputBoxClean, styles.chargeShell]}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.chargeInput}
          value={value}
          onChangeText={(v) => onChangeText(v.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          placeholderTextColor={Theme.placeholder}
          keyboardType="decimal-pad"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    </View>
  );
}

/** "Add stop" between pickup and drop, with the extra client and supplier charge per stop. */
export const RouteExtraStopsEditor = memo(function RouteExtraStopsEditor({
  stops,
  onChange,
  compact = false,
  showSupplierCharge = true,
  onDropdownOpenChange,
}: RouteExtraStopsEditorProps) {
  const update = useCallback(
    (key: string, patch: Partial<RouteExtraStopDraft>) => {
      onChange((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    },
    [onChange],
  );
  const remove = useCallback(
    (key: string) => onChange((prev) => prev.filter((d) => d.key !== key)),
    [onChange],
  );
  const add = useCallback(
    () =>
      onChange((prev) =>
        prev.length >= ROUTE_EXTRA_STOPS_MAX ? prev : [...prev, newRouteExtraStopDraft()],
      ),
    [onChange],
  );

  const summary = summarizeRouteExtraStops(routeExtraStopInputs(stops));
  const canAdd = stops.length < ROUTE_EXTRA_STOPS_MAX;

  return (
    <View style={styles.wrap}>
      {stops.map((stop, index) => (
        <View key={stop.key} style={styles.stopCard}>
          <View style={styles.stopHeader}>
            <View style={styles.stopBadge}>
              <CircleDot size={12} color={Theme.primary} strokeWidth={2.5} />
              <Text style={styles.stopBadgeText}>Stop {index + 1} · en route</Text>
            </View>
            <Pressable
              onPress={() => remove(stop.key)}
              hitSlop={12}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove stop ${index + 1}`}
            >
              <X size={14} color={Theme.textRouteCard} strokeWidth={2.5} />
            </Pressable>
          </View>
          <LocationSearchField
            label="Stop location *"
            placeholder="Search or pick stop location"
            value={stop.location}
            onChangeText={(v) => update(stop.key, { location: v })}
            onSelectPlace={(name, coords) => {
              const { lat, lon } = coordsOrUnset(coords);
              update(stop.key, {
                location: name,
                lat,
                lon,
              });
            }}
            leadingIcon={<CircleDot size={14} color={Theme.textRouteCard} strokeWidth={2} />}
            presentation="desktopShell"
            compact={compact}
            labelStyle={s.desktopFieldLabel}
            onDropdownOpenChange={onDropdownOpenChange}
          />
          <View style={[styles.chargeRow, compact && styles.chargeRowCompact]}>
            <ChargeField
              label="Client pays extra"
              value={stop.clientCharge}
              onChangeText={(v) => update(stop.key, { clientCharge: v })}
              accessibilityLabel={`Extra client charge for stop ${index + 1}`}
            />
            {showSupplierCharge ? (
              <ChargeField
                label="Supplier paid extra"
                value={stop.supplierCharge}
                onChangeText={(v) => update(stop.key, { supplierCharge: v })}
                accessibilityLabel={`Extra supplier pay for stop ${index + 1}`}
              />
            ) : null}
          </View>
          {routeExtraStopDraftIncomplete(stop) ? (
            <Text style={styles.warn}>Add a location, or this stop will not be saved.</Text>
          ) : null}
        </View>
      ))}

      <Pressable
        onPress={add}
        disabled={!canAdd}
        style={({ pressed }) => [
          styles.addBtn,
          !canAdd && styles.addBtnDisabled,
          pressed && canAdd && styles.addBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add stop between pickup and drop"
      >
        <Plus size={14} color={Theme.primary} strokeWidth={2.5} />
        <Text style={styles.addBtnText}>
          {canAdd ? "Add stop" : `Up to ${ROUTE_EXTRA_STOPS_MAX} stops`}
        </Text>
      </Pressable>

      {summary.count > 0 ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            +{summary.count} stop{summary.count === 1 ? "" : "s"} in between
          </Text>
          <Text style={styles.summaryBody}>
            Client +{formatINR(summary.clientCharge)}
            {showSupplierCharge ? ` · Supplier +${formatINR(summary.supplierCharge)}` : ""}
            {" "}— added to the freight total.
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  stopCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stopBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stopBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  chargeRow: {
    flexDirection: "row",
    gap: 10,
  },
  chargeRowCompact: {
    flexDirection: "column",
  },
  chargeField: {
    flex: 1,
    minWidth: 0,
  },
  chargeShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  rupee: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textRouteCard,
    marginRight: 6,
  },
  chargeInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 10,
  },
  warn: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.warning,
  },
  addBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.primary,
  },
  addBtnPressed: {
    opacity: 0.8,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  summary: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.surface,
    gap: 2,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  summaryBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textRouteCard,
  },
});
