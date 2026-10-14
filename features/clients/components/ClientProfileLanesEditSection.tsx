import Theme from "@/constants/Theme";
import type {
  ClientLaneRate,
  ClientWarehouseExtended,
  LaneRateType,
} from "@/features/clients/types/clientManagement.types";
import {
  createClientLaneRate,
  deleteClientLaneRate,
  updateClientLaneRate,
} from "@/features/clients/services/clientLaneRates.service";
import { formatWarehouseLaneLabel } from "@/features/clients/utils/clientManagement.util";
import { ClientProfileDateField } from "@/features/clients/components/desktop/ClientProfileDateField";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { formatINRChip } from "@/lib/format";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import { getLaneDistanceKm, type LatLon } from "@/lib/routingService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

const RATE_TYPES: Array<{ value: LaneRateType; label: string }> = [
  { value: "per_trip", label: "Per Trip" },
  { value: "per_ton", label: "Per Ton" },
  { value: "per_kg", label: "Per Kg" },
  { value: "per_km", label: "Per Km" },
  { value: "fixed", label: "Fixed" },
];

type LaneDraft = {
  origin_warehouse_id: string | null;
  origin_label: string;
  destination_label: string;
  vehicle_type: string;
  /** Prefills Commodity step "Product type" on the trip wizard. */
  default_load_type: string;
  /** Prefills Commodity step "Tons" on the trip wizard. */
  default_load_tons: string;
  distance_km: string;
  valid_from: string;
  valid_to: string;
  rate: string;
  rate_type: LaneRateType;
  notes: string;
  /** Endpoint coords from the place picker — drive the road-distance auto-fill. */
  origin_coords: LatLon | null;
  destination_coords: LatLon | null;
};

const emptyDraft = (warehouses: ClientWarehouseExtended[]): LaneDraft => ({
  origin_warehouse_id: warehouses.length === 1 ? warehouses[0]!.id : null,
  /** "Name · City, State" — the origin is a place, not just the hub's name. */
  origin_label:
    warehouses.length === 1 ? formatWarehouseLaneLabel(warehouses[0]!) : "",
  destination_label: "",
  vehicle_type: "",
  default_load_type: "",
  default_load_tons: "",
  distance_km: "",
  valid_from: "",
  valid_to: "",
  rate: "",
  rate_type: "per_trip",
  notes: "",
  origin_coords:
    warehouses.length === 1 ? warehouseCoords(warehouses[0]!) : null,
  destination_coords: null,
});

/** Hub coords, when the hub has been geocoded. */
function warehouseCoords(
  warehouse: ClientWarehouseExtended | null | undefined,
): LatLon | null {
  const latitude = warehouse?.latitude;
  const longitude = warehouse?.longitude;
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function lanePrice(lane: ClientLaneRate): number {
  return Number(lane.rate ?? lane.base_rate ?? lane.per_mt_rate ?? 0) || 0;
}

function lanePricingType(lane: ClientLaneRate): "per_trip" | "per_ton" {
  if (lane.rate_type === "per_ton" || lane.rate_type === "per_kg" || lane.pricing_model === "per_ton" || lane.pricing_model === "per_mt_km") {
    return "per_ton";
  }
  return "per_trip";
}

function laneToDraft(
  lane: ClientLaneRate,
  warehouses: ClientWarehouseExtended[],
): LaneDraft {
  const price = lanePrice(lane);
  const hub = lane.origin_warehouse_id
    ? warehouses.find((w) => w.id === lane.origin_warehouse_id)
    : null;
  return {
    origin_warehouse_id: lane.origin_warehouse_id,
    // Stored labels are already canonical from the picker — re-normalizing here
    // would strip the locality off saved lanes on reopen.
    origin_label: hub ? formatWarehouseLaneLabel(hub) : lane.origin_label,
    destination_label: lane.destination_label,
    vehicle_type: lane.vehicle_type ?? "",
    default_load_type: lane.default_load_type ?? "",
    default_load_tons:
      lane.default_load_tons != null ? String(lane.default_load_tons) : "",
    distance_km: lane.distance_km != null ? String(lane.distance_km) : "",
    valid_from: lane.valid_from ?? "",
    valid_to: lane.valid_to ?? "",
    rate: price > 0 ? String(price) : "",
    rate_type: lane.rate_type,
    notes: lane.notes ?? "",
    /**
     * Lanes store labels, not coords. The hub side can be recovered; the
     * destination cannot, so an existing lane keeps its saved distance until
     * the user re-picks a place. No silent recompute on open.
     */
    origin_coords: warehouseCoords(hub),
    destination_coords: null,
  };
}

/** Lanes tied to the selected pickup hub (or custom / no-hub lanes). */
function lanesForHub(
  all: ClientLaneRate[],
  warehouseId: string | null,
  customSelected: boolean,
): ClientLaneRate[] {
  if (warehouseId) {
    return all.filter((l) => l.origin_warehouse_id === warehouseId);
  }
  if (customSelected) {
    return all.filter((l) => !l.origin_warehouse_id);
  }
  return [];
}

type Props = {
  laneRates: ClientLaneRate[];
  warehouses: ClientWarehouseExtended[];
  organizationId: string;
  clientId: string;
  onChanged: () => void;
};

export function ClientProfileLanesEditSection({
  laneRates: initialLanes,
  warehouses,
  organizationId,
  clientId,
  onChanged,
}: Props) {
  const [lanes, setLanes] = useState(initialLanes);
  const [addingLane, setAddingLane] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LaneDraft>(emptyDraft(warehouses));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Sidebar hub. Null is the optional Custom pickup. */
  const [navHubId, setNavHubId] = useState<string | null>(warehouses[0]?.id ?? null);
  const { width } = useWindowDimensions();
  const sideBySide = width >= 900;
  const dialogWide = width >= 720;

  useEffect(() => {
    setLanes(initialLanes);
  }, [initialLanes]);

  const resetDraft = () => {
    setDraft(emptyDraft(warehouses));
    setAddingLane(false);
    setEditingId(null);
  };

  const startAdd = (hubId: string | null = navHubId) => {
    distanceTouchedRef.current = false;
    setNavHubId(hubId);
    setEditingId(null);
    setAddingLane(true);
    setDraft({
      ...emptyDraft(warehouses),
      origin_warehouse_id: hubId,
      origin_label: hubOriginLabel(hubId),
      origin_coords: hubCoords(hubId),
    });
  };

  const startEdit = (lane: ClientLaneRate) => {
    setNavHubId(lane.origin_warehouse_id);
    setEditingId(lane.id);
    setDraft(laneToDraft(lane, warehouses));
    setAddingLane(false);
    distanceTouchedRef.current = lane.distance_km != null;
  };

  /** Origin label for a hub — "Name · City, State", matching the desktop form. */
  const hubOriginLabel = (warehouseId: string | null): string => {
    if (!warehouseId) return "";
    const wh = warehouses.find((w) => w.id === warehouseId);
    return wh ? formatWarehouseLaneLabel(wh) : "";
  };

  /** Hub coords keyed by id — the origin half of the distance lookup. */
  const hubCoords = (warehouseId: string | null): LatLon | null =>
    warehouseId
      ? warehouseCoords(warehouses.find((w) => w.id === warehouseId))
      : null;

  const selectNavHub = (warehouseId: string | null) => {
    setNavHubId(warehouseId);
    if (!addingLane || editingId) return;
    distanceTouchedRef.current = false;
    setDraft((d) => ({
      ...d,
      origin_warehouse_id: warehouseId,
      origin_label: hubOriginLabel(warehouseId),
      origin_coords: hubCoords(warehouseId),
    }));
  };

  /** Apply an existing hub lane into the form for update (management) or duplicate-as-new. */
  const applyLaneTag = (lane: ClientLaneRate) => {
    setEditingId(lane.id);
    setAddingLane(false);
    // A saved lane's distance is authoritative — treat it as user-set so the
    // auto-fill cannot overwrite it.
    distanceTouchedRef.current = lane.distance_km != null;
    setDraft(laneToDraft(lane, warehouses));
  };

  /** Valid To before Valid From would silently hide the lane from every picker. */
  const validityError = useMemo(() => {
    const from = draft.valid_from.trim();
    const to = draft.valid_to.trim();
    if (!from || !to) return null;
    return to < from ? "Valid To cannot be earlier than Valid From." : null;
  }, [draft.valid_from, draft.valid_to]);

  /**
   * Auto-fill Distance from the two picked endpoints.
   * Free path first (OSRM, no key/quota); falls back to an offline estimate.
   * Never overwrites a distance the user typed or edited by hand.
   */
  const [distanceStatus, setDistanceStatus] = useState<
    "idle" | "loading" | "road" | "estimate"
  >("idle");
  /** Set when the user edits Distance directly — locks out the auto-fill. */
  const distanceTouchedRef = useRef(false);
  const origin = draft.origin_coords;
  const destination = draft.destination_coords;

  useEffect(() => {
    if (!origin || !destination) {
      setDistanceStatus("idle");
      return;
    }
    if (distanceTouchedRef.current) return;

    let cancelled = false;
    setDistanceStatus("loading");
    getLaneDistanceKm(origin, destination)
      .then((result) => {
        if (cancelled || distanceTouchedRef.current) return;
        setDraft((d) => ({ ...d, distance_km: String(result.km) }));
        setDistanceStatus(result.source);
      })
      .catch(() => {
        if (!cancelled) setDistanceStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [
    origin?.latitude,
    origin?.longitude,
    destination?.latitude,
    destination?.longitude,
  ]);

  const onDistanceChange = useCallback((v: string) => {
    distanceTouchedRef.current = true;
    setDistanceStatus("idle");
    setDraft((d) => ({ ...d, distance_km: v }));
  }, []);

  const hubLanes = useMemo(
    () =>
      lanesForHub(
        lanes,
        navHubId,
        warehouses.length > 0 && navHubId == null,
      ),
    [lanes, navHubId, warehouses.length],
  );

  const navHubName =
    navHubId == null
      ? "Custom"
      : (warehouses.find((w) => w.id === navHubId)?.name ?? "Hub");
  const draftHubName =
    draft.origin_warehouse_id == null
      ? "Custom"
      : (warehouses.find((w) => w.id === draft.origin_warehouse_id)?.name ?? "Hub");

  const handleSave = async () => {
    const hub = draft.origin_warehouse_id
      ? warehouses.find((w) => w.id === draft.origin_warehouse_id)
      : null;
    const originLabel = hub
      ? formatWarehouseLaneLabel(hub)
      : draft.origin_label.trim();
    const destination = draft.destination_label.trim();
    if (!originLabel || !destination) {
      Alert.alert("Validation", "Pickup area and destination are required.");
      return;
    }
    const rateNum = draft.rate.trim() ? Number(draft.rate) : null;
    if (draft.rate.trim() && !Number.isFinite(rateNum)) {
      Alert.alert("Validation", "Rate must be a valid number.");
      return;
    }
    const tonsNum = draft.default_load_tons.trim()
      ? Number(draft.default_load_tons)
      : null;
    if (draft.default_load_tons.trim() && !Number.isFinite(tonsNum)) {
      Alert.alert("Validation", "Default tons must be a valid number.");
      return;
    }
    const distanceNum = draft.distance_km.trim()
      ? Number(draft.distance_km)
      : null;
    if (draft.distance_km.trim() && !Number.isFinite(distanceNum)) {
      Alert.alert("Validation", "Distance must be a valid number.");
      return;
    }
    if (validityError) {
      Alert.alert("Validation", validityError);
      return;
    }

    setSaving(true);
    const payload = {
      origin_warehouse_id: draft.origin_warehouse_id,
      /**
       * Save the label the picker produced. Re-normalizing here would keep only
       * the last two comma parts and drop the locality — e.g. "Pallavaram,
       * Chennai" collapsing to the parent district.
       */
      origin_label: originLabel,
      destination_label: destination,
      vehicle_type: draft.vehicle_type.trim() || null,
      /** Both feed the trip wizard's Commodity step via buildClientLanePrefill. */
      default_load_type: draft.default_load_type.trim() || null,
      default_load_tons: tonsNum,
      distance_km: distanceNum,
      valid_from: draft.valid_from.trim() || null,
      valid_to: draft.valid_to.trim() || null,
      rate: rateNum,
      rate_type: draft.rate_type,
      notes: draft.notes.trim() || null,
    };

    if (editingId) {
      const { error } = await updateClientLaneRate(editingId, payload);
      if (error) Alert.alert("Error", error.message);
      else {
        resetDraft();
        onChanged();
      }
    } else {
      const { error } = await createClientLaneRate(organizationId, clientId, payload);
      if (error) Alert.alert("Error", error.message);
      else {
        resetDraft();
        onChanged();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete lane", "Remove this lane contract?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingId(id);
          const { error } = await deleteClientLaneRate(id);
          if (error) Alert.alert("Error", error.message);
          else onChanged();
          setDeletingId(null);
        },
      },
    ]);
  };

  const showForm = addingLane || editingId != null;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.editSectionBarNavy} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>Route Contracts</Text>
          <Text style={styles.sectionHint}>
            {navHubName} · {hubLanes.length} lane{hubLanes.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={[styles.workspace, !sideBySide && styles.workspaceStack]}>
        <View style={[styles.sideNav, !sideBySide && styles.sideNavStack]}>
          <Text style={styles.sideNavLabel}>Pickup hub</Text>
          {warehouses.map((wh) => {
            const on = navHubId === wh.id;
            return (
              <View key={wh.id} style={[styles.navItem, on && styles.navItemOn]}>
                <TouchableOpacity
                  style={styles.navItemMain}
                  onPress={() => selectNavHub(wh.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.navItemText, on && styles.navItemTextOn]} numberOfLines={1}>
                    {wh.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.navPlus, on && styles.navPlusOn]}
                  onPress={() => startAdd(wh.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add lane for ${wh.name}`}
                  hitSlop={6}
                >
                  <FontAwesome
                    name="plus"
                    size={10}
                    color={on ? Theme.analyticsHeroBg : Theme.textOnPrimary}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
          {hubLanes.length === 0 ? (
            <Text style={styles.sideNavEmpty}>No lanes on this hub yet</Text>
          ) : (
            hubLanes.map((lane) => {
              const active = editingId === lane.id;
              const price = lanePrice(lane);
              return (
                <TouchableOpacity
                  key={lane.id}
                  style={[styles.navLane, active && styles.navLaneOn]}
                  onPress={() => applyLaneTag(lane)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.navLaneDest, active && styles.navLaneDestOn]} numberOfLines={1}>
                    {formatCityStateLabel(lane.destination_label) ||
                      (lane.destination_label ?? "").trim() ||
                      "Destination"}
                  </Text>
                  <Text style={[styles.navLaneMeta, active && styles.navLaneMetaOn]} numberOfLines={1}>
                    {(lane.vehicle_type ?? "").trim() || "Any vehicle"}
                    {" · "}
                    {price > 0 ? formatINRChip(price) : "TBD"}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.mainPane}>
        <View style={styles.tableWrap}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colPickup]}>Hub (Pickup)</Text>
            <Text style={[styles.th, styles.colDest]}>Destination</Text>
            <Text style={[styles.th, styles.colVehicle]}>Vehicle</Text>
            <Text style={[styles.th, styles.colTons]}>Tons</Text>
            <Text style={[styles.th, styles.colPricing]}>Pricing</Text>
            <Text style={[styles.th, styles.colRate]}>Lane Rate</Text>
            <Text style={[styles.th, styles.colActions]} />
          </View>
          {hubLanes.length === 0 ? (
            <Text style={styles.emptyMuted}>No lanes on this hub yet. Use + on the hub.</Text>
          ) : (
            hubLanes.map((lane) => {
              const vehicleLabel = (lane.vehicle_type ?? "").trim();
              const tons = lane.default_load_tons;
              const tonsLabel =
                tons != null && Number.isFinite(Number(tons))
                  ? `${Number(tons)} t`
                  : "—";
              return (
                <View key={lane.id} style={styles.tr}>
                  <Text style={[styles.td, styles.tdPickup, styles.colPickup]} numberOfLines={2}>
                    {formatCityStateLabel(lane.origin_label) || lane.origin_label}
                  </Text>
                  <Text style={[styles.td, styles.tdDest, styles.colDest]} numberOfLines={2}>
                    {formatCityStateLabel(lane.destination_label) || lane.destination_label}
                  </Text>
                  <Text style={[styles.td, styles.tdVehicle, styles.colVehicle]} numberOfLines={1}>
                    {vehicleLabel || "—"}
                  </Text>
                  <Text style={[styles.td, styles.tdTons, styles.colTons]} numberOfLines={1}>
                    {tonsLabel}
                  </Text>
                  <View style={[styles.colPricing, styles.pricingCol]}>
                    <View
                      style={[
                        styles.perPill,
                        lanePricingType(lane) === "per_trip" ? styles.perPillTrip : styles.perPillTon,
                      ]}
                    >
                      <Text
                        style={[
                          styles.perPillText,
                          lanePricingType(lane) === "per_trip"
                            ? styles.perPillTextTrip
                            : styles.perPillTextTon,
                        ]}
                      >
                        {lanePricingType(lane) === "per_trip" ? "Per trip" : "Per ton"}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.td, styles.laneRate, styles.colRate]} numberOfLines={1}>
                    ₹{Math.round(lanePrice(lane)).toLocaleString("en-IN")}
                  </Text>
                  <View style={[styles.colActions, styles.rowActions]}>
                    <TouchableOpacity
                      onPress={() => startEdit(lane)}
                      style={styles.rowIconBtn}
                      accessibilityLabel="Edit lane"
                    >
                      <FontAwesome name="pencil" size={12} color={Theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleDelete(lane.id)}
                      style={styles.rowIconBtn}
                      disabled={deletingId === lane.id}
                      accessibilityLabel="Delete lane"
                    >
                      {deletingId === lane.id ? (
                        <LoadingIndicator size="small" color={Theme.negative} />
                      ) : (
                        <FontAwesome name="trash-o" size={12} color={Theme.negative} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
        </View>
      </View>

      <Modal
        visible={showForm}
        transparent
        animationType="fade"
        onRequestClose={resetDraft}
      >
        <View style={styles.dialogBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={resetDraft}
            accessibilityLabel="Close lane dialog"
          />
          <View
            style={[
              styles.dialogCard,
              { width: Math.min(820, Math.max(320, width - 48)) },
            ]}
          >
          <View style={styles.formTitleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.formTitle}>{editingId ? "Edit Lane" : "New Lane Contract"}</Text>
              <Text style={styles.formSubtitle}>Pickup hub · {draftHubName}</Text>
            </View>
            <TouchableOpacity
              style={styles.formBackBtn}
              onPress={resetDraft}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={14} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
          </View>
          <View style={styles.dialogBody}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Route</Text>
          <View style={styles.formPair}>
          <View style={styles.formPairCell}>
          {draft.origin_warehouse_id ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Pickup Area *</Text>
              <View style={[styles.fieldInput, styles.fieldInputLocked]}>
                <Text style={styles.lockedFieldText} numberOfLines={1}>
                  {draft.origin_label || "—"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.mapFieldWrap}>
              <LocationSearchField
                label="Pickup Area *"
                placeholder="Search city or area"
                value={draft.origin_label}
                onChangeText={(v) => setDraft((d) => ({ ...d, origin_label: v }))}
                onSelectPlace={(label, coords) =>
                  setDraft((d) => ({
                    ...d,
                    origin_label: label,
                    origin_coords: { latitude: coords.lat, longitude: coords.lon },
                  }))
                }
                compact
                labelStyle={styles.fieldLabel}
                inputStyle={styles.fieldInput}
              />
            </View>
          )}
          </View>
          <View style={styles.formPairCell}>
          <View style={styles.mapFieldWrap}>
            <LocationSearchField
              label="Destination *"
              placeholder="Search city or area"
              value={draft.destination_label}
              onChangeText={(v) => setDraft((d) => ({ ...d, destination_label: v }))}
              onSelectPlace={(label, coords) =>
                setDraft((d) => ({
                  ...d,
                  destination_label: label,
                  destination_coords: { latitude: coords.lat, longitude: coords.lon },
                }))
              }
              compact
              labelStyle={styles.fieldLabel}
              inputStyle={styles.fieldInput}
            />
          </View>
          </View>
          </View>
          </View>

          <View style={dialogWide ? styles.formPair : styles.formStack}>
          <View style={[styles.sectionCard, styles.sectionCardSide]}>
            <Text style={styles.sectionCardTitle}>Load</Text>
          {/**
           * Vehicle type + product type + tons all come from the trip wizard's
           * own control, so the lane form offers the same dropdowns and the
           * same tons quick-pick chips (with free-text for custom weights)
           * instead of plain text boxes.
           */}
          <TripCommodityFields
            useVehicleCatalog
            vehicleType={draft.vehicle_type}
            loadType={draft.default_load_type}
            tons={draft.default_load_tons}
            onVehicleTypeChange={(v) => setDraft((d) => ({ ...d, vehicle_type: v }))}
            onLoadTypeChange={(v) => setDraft((d) => ({ ...d, default_load_type: v }))}
            onTonsChange={(v) => setDraft((d) => ({ ...d, default_load_tons: v }))}
            useFormChrome
            preferWebSelect={Platform.OS === "web"}
            fieldLabelStyle={styles.fieldLabel}
            fieldInputStyle={styles.fieldInput}
          />
          <Field
            label="Distance (km)"
            value={draft.distance_km}
            onChangeText={onDistanceChange}
            placeholder={
              distanceStatus === "loading" ? "Calculating…" : "e.g. 350"
            }
            keyboardType="decimal-pad"
          />
          {distanceStatus !== "idle" ? (
            <Text style={styles.distanceHint}>
              {distanceStatus === "loading"
                ? "Calculating road distance…"
                : distanceStatus === "road"
                  ? "Road distance filled automatically. Edit to override."
                  : "Approximate (routing unavailable). Edit to override."}
            </Text>
          ) : null}

          </View>
          <View style={[styles.sectionCard, styles.sectionCardSide]}>
            <Text style={styles.sectionCardTitle}>Commercial</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Rate Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {RATE_TYPES.map((rt) => (
                <TouchableOpacity
                  key={rt.value}
                  style={[styles.chip, draft.rate_type === rt.value && styles.chipSelected]}
                  onPress={() => setDraft((d) => ({ ...d, rate_type: rt.value }))}
                >
                  <Text
                    style={[styles.chipText, draft.rate_type === rt.value && styles.chipTextSelected]}
                  >
                    {rt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Field
            label="Lane Rate (₹)"
            value={draft.rate}
            onChangeText={(v) => setDraft((d) => ({ ...d, rate: v }))}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          {/** Blank = open-ended; isLaneCurrentlyValid() hides expired lanes from pickers. */}
          <View style={styles.dateFieldRow}>
            <ClientProfileDateField
              label="Valid From"
              value={draft.valid_from}
              onChange={(iso) => setDraft((d) => ({ ...d, valid_from: iso }))}
              fullWidth
            />
            <ClientProfileDateField
              label="Valid To"
              value={draft.valid_to}
              onChange={(iso) => setDraft((d) => ({ ...d, valid_to: iso }))}
              fullWidth
            />
          </View>
          {validityError ? (
            <Text style={styles.inlineErrorText}>{validityError}</Text>
          ) : (
            <Text style={styles.lockedFieldHint}>
              Leave blank for an open-ended lane
            </Text>
          )}
          <Field
            label="Notes"
            value={draft.notes}
            onChangeText={(v) => setDraft((d) => ({ ...d, notes: v }))}
            placeholder="Optional notes"
          />
          </View>
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetDraft} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <LoadingIndicator color={Theme.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? "Update Lane" : "Save Lane"}</Text>
              )}
            </TouchableOpacity>
          </View>
          </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad";
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textSection}
        style={styles.fieldInput}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", alignSelf: "stretch" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  editSectionBarNavy: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHint: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  smallCtaNavy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.textPrimaryDark,
  },
  smallCtaNavyText: { fontSize: 9, fontWeight: "700", color: Theme.textOnPrimary, textTransform: "uppercase", letterSpacing: 0.3 },
  backCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  backCtaText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableWrap: {
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    marginBottom: 10,
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  th: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  colPickup: { flex: 1.35, minWidth: 0 },
  colDest: { flex: 1.2, minWidth: 0 },
  colVehicle: { flex: 0.85, minWidth: 0 },
  colTons: { width: 64, flexGrow: 0, flexShrink: 0 },
  colPricing: { width: 92, flexGrow: 0, flexShrink: 0 },
  colRate: { width: 104, flexGrow: 0, flexShrink: 0, textAlign: "right" },
  colActions: {
    width: 72,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  emptyMuted: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, padding: 16 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  td: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdPickup: { fontWeight: "700" },
  tdDest: { fontWeight: "600", color: Theme.textRouteCard },
  tdVehicle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "none",
  },
  tdTons: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  pricingCol: { alignItems: "flex-start", justifyContent: "center" },
  perPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  perPillTrip: { backgroundColor: Theme.fiscalTabActiveBg, borderColor: Theme.aggregatePillBorder },
  perPillTon: { backgroundColor: Theme.warningMuted, borderColor: Theme.warning + "44" },
  perPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  perPillTextTrip: { color: Theme.aggregatePillText },
  perPillTextTon: { color: Theme.warning },
  laneRate: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  rowIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  workspace: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  workspaceStack: { flexDirection: "column" },
  sideNav: {
    width: 232,
    flexShrink: 0,
    padding: 10,
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  sideNavStack: { width: "100%" },
  sideNavLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sideNavDivider: {
    height: 1,
    backgroundColor: Theme.borderInput,
    marginVertical: 6,
  },
  sideNavHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideNavEmpty: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  navItem: {
    minHeight: 36,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navItemMain: { flex: 1, minWidth: 0, justifyContent: "center", minHeight: 28 },
  navPlus: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.analyticsHeroBg,
  },
  navPlusOn: { backgroundColor: Theme.cardWhite },
  navItemOn: {
    backgroundColor: Theme.analyticsHeroBg,
    borderColor: Theme.analyticsHeroBg,
  },
  navItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  navItemTextOn: { color: Theme.textOnPrimary },
  navNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Theme.analyticsHeroBg,
  },
  navNewBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  navLane: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    gap: 2,
  },
  navLaneOn: {
    borderColor: Theme.analyticsHeroBg,
    backgroundColor: Theme.cardWhite,
  },
  navLaneDest: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  navLaneDestOn: { color: Theme.analyticsHeroBg },
  navLaneMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  navLaneMetaOn: { color: Theme.textRouteCard },
  mainPane: { flex: 1, minWidth: 0, width: "100%" },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialogCard: {
    zIndex: 2,
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 12,
    gap: 8,
  },
  dialogBody: { width: "100%", gap: 8 },
  formSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  formCard: {
    marginTop: 4,
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    width: "100%",
    gap: 8,
  },
  formStack: { width: "100%", gap: 8 },
  formPair: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  formPairCell: { flex: 1, minWidth: 0 },
  sectionCard: {
    minWidth: 0,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    gap: 6,
  },
  sectionCardSide: { flex: 1 },
  sectionCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  formTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  formBackBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  fieldGroup: { marginBottom: 0, width: "100%", minWidth: 0 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    width: "100%",
    minHeight: 32,
  },
  fieldInputLocked: {
    backgroundColor: Theme.borderLight,
    justifyContent: "center",
    minHeight: 36,
  },
  lockedFieldText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  lockedFieldHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSection,
  },
  distanceHint: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSection,
  },
  mapFieldWrap: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  dateFieldRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 4,
  },
  inlineErrorText: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.negative,
  },
  chipScroll: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  chipSelected: { backgroundColor: Theme.textPrimaryDark, borderColor: Theme.textPrimaryDark },
  chipText: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  chipTextSelected: { color: Theme.textOnPrimary },
  laneTagBlock: {
    marginTop: 8,
    gap: 5,
  },
  laneTagLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  laneTagScroll: { flexGrow: 0 },
  laneTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  laneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  laneTagNew: {
    maxWidth: 72,
    gap: 4,
  },
  laneTagSelected: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  laneTagDest: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
    maxWidth: 96,
  },
  laneTagMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 1,
    maxWidth: 56,
  },
  laneTagMetaSelected: {
    color: "rgba(255,255,255,0.72)",
  },
  laneTagPrice: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  laneTagPriceSelected: {
    color: Theme.textOnPrimary,
  },
  laneTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  laneTagTextSelected: {
    color: Theme.textOnPrimary,
  },
  formActions: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  cancelBtnText: { fontSize: 11, fontWeight: "800", color: Theme.textMuted, textTransform: "uppercase" },
  saveBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 11, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
});
