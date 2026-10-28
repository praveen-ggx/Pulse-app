/**
 * Fleet assign UI — same TripAssignmentWorkspace chrome as reassign,
 * with Swap = pick from org roster and Confirm = save assignment.
 *
 * Selection is owned locally so parent auto-preview effects cannot clobber taps.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Plus } from "lucide-react-native";
import { useRouter } from "expo-router";

import Theme from "@/constants/Theme";
import { type DriverRow } from "@/features/drivers/services/drivers.service";
import { type VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  TripAssignmentWorkspace,
  type AssignmentPanelAction,
  type ChangeReasonCode,
} from "@/features/trips/components/assignment/TripAssignmentWorkspace";
import { aws } from "@/features/trips/components/assignment/tripAssignmentWorkspace.styles";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  suggestedNameForPhoneLookup,
  trimDriverLabel,
} from "@/features/trips/utils/driverDisplayName.util";
import {
  lookupDriversByPhoneVariants,
  normalizeIndianMobileLast10,
} from "@/features/trips/utils/driverPhoneLookup.util";
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";

type Props = {
  trip: TripRow;
  organizationId: string;
  drivers: DriverRow[];
  vehicles: VehicleRow[];
  driversLoading?: boolean;
  vehiclesLoading?: boolean;
  activeDriverIds: Set<string>;
  activeVehicleIds: Set<string>;
  activeDriverTripLabelById: Record<string, string>;
  activeVehicleTripLabelById: Record<string, string>;
  /** Initial selection (trip current or parent preview). */
  initialDriverId?: string | null;
  initialVehicleId?: string | null;
  saving: boolean;
  onConfirm: (
    driverId: string,
    vehicleId: string | null,
    extras?: {
      driverName?: string | null;
      vehiclePlate?: string | null;
      vehicleType?: string | null;
    },
  ) => void | boolean | Promise<void | boolean>;
  /** Persist a swap immediately so the outgoing driver/vehicle leaves this trip. */
  onLiveSwap?: (
    next: {
      driverId: string;
      vehicleId: string | null;
      driverName?: string | null;
      vehiclePlate?: string | null;
      vehicleType?: string | null;
    },
  ) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  /** Parent shows the confirm/edit preview so it is not buried in the assign modal. */
  onPreviewRequest?: (draft: {
    driverId: string;
    vehicleId: string | null;
    driverName: string;
    driverPhone: string;
    vehiclePlate: string;
    vehicleType: string;
  }) => void;
  onBeforeRegisterNavigate?: () => void;
  focus?: "driver" | "vehicle";
};

function pilotCode(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  const a = (p[0]?.[0] ?? "?").toUpperCase();
  const b = (p[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function vehicleCode(v: VehicleRow) {
  const plate = formatIndianVehicleNumber(v.vehicle_number).replace(/\s/g, "");
  return plate.slice(-3).toUpperCase() || "V";
}

/** Nested fleet roster list — must use a bounded scrollport (RN Web ignores overflowY on View). */
function AssetPickList({ children }: { children: ReactNode }) {
  if (Platform.OS === "web") {
    return (
      <div
        data-fleet-pick-list="1"
        style={{
          width: "100%",
          height: 260,
          maxHeight: 260,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 4,
          boxSizing: "border-box",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
        onWheel={(e) => {
          const el = e.currentTarget;
          // Only trap wheel when the list can actually scroll.
          if (el.scrollHeight > el.clientHeight + 1) {
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <ScrollView
      style={styles.listScroll}
      contentContainerStyle={styles.listStack}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  );
}

export function FleetAssignWorkspace({
  trip,
  organizationId,
  drivers,
  vehicles,
  driversLoading = false,
  vehiclesLoading = false,
  activeDriverIds,
  activeVehicleIds,
  activeDriverTripLabelById,
  activeVehicleTripLabelById,
  initialDriverId = null,
  initialVehicleId = null,
  saving,
  onConfirm,
  onLiveSwap: _onLiveSwap,
  onClose,
  onPreviewRequest: _onPreviewRequest,
  onBeforeRegisterNavigate,
  focus = "driver",
}: Props) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 720;
  const [driverAction, setDriverAction] = useState<AssignmentPanelAction>(() =>
    focus === "driver" ? "EDIT" : "PREVIEW",
  );
  const [vehicleAction, setVehicleAction] = useState<AssignmentPanelAction>(() =>
    focus === "vehicle" ? "EDIT" : "PREVIEW",
  );
  const [driverSearch, setDriverSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [changeReason, setChangeReason] =
    useState<ChangeReasonCode>("AD_HOC_SUBSTITUTION");
  const [changeRemarks, setChangeRemarks] = useState("");
  const [toast, _setToast] = useState<string | null>(null);

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    initialDriverId ?? trip.driver_id ?? null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialVehicleId ?? trip.vehicle_id ?? null,
  );
  const [editDriverName, setEditDriverName] = useState("");
  const [editDriverPhone, setEditDriverPhone] = useState("");
  const [editVehiclePlate, setEditVehiclePlate] = useState("");
  const [editVehicleType, setEditVehicleType] = useState("");
  const [wizardStep, setWizardStep] = useState<"details" | "reason">("details");

  // Seed once when roster arrives (do not fight later user taps).
  useEffect(() => {
    if (selectedDriverId) return;
    const seed = initialDriverId ?? trip.driver_id;
    if (seed && drivers.some((d) => d.id === seed)) {
      setSelectedDriverId(seed);
    }
  }, [drivers, initialDriverId, trip.driver_id, selectedDriverId]);

  useEffect(() => {
    if (selectedVehicleId) return;
    const seed = initialVehicleId ?? trip.vehicle_id;
    if (seed && vehicles.some((v) => v.id === seed)) {
      setSelectedVehicleId(seed);
    }
  }, [vehicles, initialVehicleId, trip.vehicle_id, selectedVehicleId]);

  useEffect(() => {
    if (focus === "vehicle") {
      setDriverAction("PREVIEW");
      setVehicleAction((prev) => (prev === "PREVIEW" ? "EDIT" : prev));
      return;
    }
    setVehicleAction("PREVIEW");
    setDriverAction((prev) => (prev === "PREVIEW" ? "EDIT" : prev));
  }, [focus]);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId],
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const seededDriverIdRef = useRef<string | null>(null);
  const seededVehicleIdRef = useRef<string | null>(null);
  const [suggestedAppName, setSuggestedAppName] = useState<string | null>(null);
  const nameOwnedLocallyRef = useRef(false);
  const nameOwnedForLast10Ref = useRef("");

  useEffect(() => {
    if (selectedDriverId === seededDriverIdRef.current) return;
    seededDriverIdRef.current = selectedDriverId;
    const localName = trip.driver_display_name?.trim() || "";
    const appName = selectedDriver?.name?.trim() || "";
    setEditDriverName(localName || appName);
    if (localName && localName !== appName) {
      nameOwnedLocallyRef.current = true;
      nameOwnedForLast10Ref.current = normalizeIndianMobileLast10(
        selectedDriver?.phone ?? "",
      );
    }
    setSuggestedAppName(appName || null);
    setEditDriverPhone(
      selectedDriver?.phone ? formatMobileNumber(selectedDriver.phone) : "",
    );
  }, [selectedDriver, selectedDriverId, trip.driver_display_name]);

  useEffect(() => {
    const seedKey = selectedVehicleId ?? `plate:${trip.vehicle_display_number ?? ""}`;
    if (seedKey === seededVehicleIdRef.current) return;
    seededVehicleIdRef.current = seedKey;
    const isCurrentTripVehicle =
      !!selectedVehicleId &&
      (selectedVehicleId === trip.vehicle_id || selectedVehicleId === initialVehicleId);
    const localPlate = trip.vehicle_display_number?.trim()
      ? formatIndianVehicleNumber(trip.vehicle_display_number)
      : "";
    const rosterPlate = selectedVehicle
      ? formatIndianVehicleNumber(selectedVehicle.vehicle_number)
      : "";
    setEditVehiclePlate(
      (isCurrentTripVehicle && localPlate ? localPlate : "") ||
        rosterPlate ||
        localPlate,
    );
    setEditVehicleType(selectedVehicle?.vehicle_type?.trim() || "");
  }, [
    initialVehicleId,
    selectedVehicle,
    selectedVehicleId,
    trip.vehicle_display_number,
    trip.vehicle_id,
  ]);

  useEffect(() => {
    const last10 = normalizeIndianMobileLast10(editDriverPhone);
    if (last10.length < 10) {
      setSuggestedAppName(null);
      return;
    }
    if (nameOwnedForLast10Ref.current !== last10) {
      nameOwnedLocallyRef.current = false;
    }
    let cancelled = false;
    void lookupDriversByPhoneVariants(last10).then(({ matches }) => {
      if (cancelled) return;
      const match = matches[0] ?? null;
      const appName = trimDriverLabel(match?.full_name);
      setSuggestedAppName(appName);
      if (match) {
        const matchPhone = normalizeIndianMobileLast10(match.phone);
        const fleet = drivers.find((d) => {
          if (d.left_at || d.tracking_only) return false;
          if (match.user_id && d.user_id === match.user_id) return true;
          return (
            matchPhone.length >= 10 &&
            normalizeIndianMobileLast10(d.phone ?? "") === matchPhone
          );
        });
        if (fleet) {
          seededDriverIdRef.current = fleet.id;
          setSelectedDriverId(fleet.id);
        }
      }
      setEditDriverName((current) =>
        suggestedNameForPhoneLookup({
          currentName: current,
          suggestedAppName: appName,
          nameOwnedLocally: nameOwnedLocallyRef.current,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [drivers, editDriverPhone]);

  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        (d.name ?? "").toLowerCase().includes(q) ||
        (d.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [drivers, driverSearch]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const plate = formatIndianVehicleNumber(v.vehicle_number).toLowerCase();
      const type = (v.vehicle_type ?? "").toLowerCase();
      return plate.includes(q) || type.includes(q);
    });
  }, [vehicles, vehicleSearch]);

  const isDriverBusy = useCallback(
    (id: string) =>
      activeDriverIds.has(id) && id !== trip.driver_id && id !== selectedDriverId,
    [activeDriverIds, selectedDriverId, trip.driver_id],
  );
  const isVehicleBusy = useCallback(
    (id: string) =>
      activeVehicleIds.has(id) && id !== trip.vehicle_id && id !== selectedVehicleId,
    [activeVehicleIds, selectedVehicleId, trip.vehicle_id],
  );

  const driverDisplayName =
    editDriverName.trim() ||
    selectedDriver?.name?.trim() ||
    trip.driver_display_name?.trim() ||
    "Select driver";
  const driverPhoneDisplay =
    editDriverPhone.trim() ||
    (selectedDriver?.phone ? formatMobileNumber(selectedDriver.phone) : null);
  const vehicleDisplayLabel =
    editVehiclePlate.trim() ||
    (selectedVehicle
      ? formatIndianVehicleNumber(selectedVehicle.vehicle_number)
      : trip.vehicle_display_number
        ? formatIndianVehicleNumber(trip.vehicle_display_number)
        : "Select vehicle");
  const vehicleTypeDisplay = editVehicleType.trim() || selectedVehicle?.vehicle_type || null;

  const vehicleReady = !!(
    selectedVehicleId ||
    trip.vehicle_id ||
    String(trip.vehicle_display_number ?? "").trim() ||
    editVehiclePlate.trim()
  );
  const persistDriverId = selectedDriverId ?? trip.driver_id ?? null;
  const canConfirmDriver =
    !!persistDriverId && !isDriverBusy(persistDriverId);
  const canConfirmVehicle =
    vehicleReady && !(selectedVehicleId && isVehicleBusy(selectedVehicleId));
  const canConfirm =
    focus === "vehicle"
      ? canConfirmVehicle && !!persistDriverId
      : focus === "driver"
        ? canConfirmDriver
        : canConfirmDriver && canConfirmVehicle;

  const assignmentDraft = useCallback(() => {
    if (!persistDriverId) return null;
    return {
      driverId: persistDriverId,
      vehicleId: selectedVehicleId ?? trip.vehicle_id ?? null,
      driverName:
        editDriverName.trim() ||
        selectedDriver?.name?.trim() ||
        trip.driver_display_name?.trim() ||
        "Driver",
      driverPhone: editDriverPhone.trim(),
      vehiclePlate:
        formatIndianVehicleNumber(editVehiclePlate).trim() ||
        (selectedVehicle
          ? formatIndianVehicleNumber(selectedVehicle.vehicle_number)
          : trip.vehicle_display_number?.trim() || "Vehicle"),
      vehicleType:
        editVehicleType.trim() || selectedVehicle?.vehicle_type?.trim() || "",
    };
  }, [
    editDriverName,
    editDriverPhone,
    editVehiclePlate,
    editVehicleType,
    persistDriverId,
    selectedDriver,
    selectedVehicle,
    selectedVehicleId,
    trip.driver_display_name,
    trip.vehicle_display_number,
    trip.vehicle_id,
  ]);

  const goToReason = useCallback(() => {
    if (!canConfirm || !assignmentDraft()) return;
    setWizardStep("reason");
  }, [assignmentDraft, canConfirm]);

  const saveAssignment = useCallback(() => {
    const draft = assignmentDraft();
    if (!draft || !canConfirm) return;
    void Promise.resolve(
      onConfirm(draft.driverId, draft.vehicleId, {
        driverName: draft.driverName,
        vehiclePlate: draft.vehiclePlate,
        vehicleType: draft.vehicleType,
      }),
    )
      .then((ok) => {
        if (ok !== false) onClose();
      })
      .catch(() => undefined);
  }, [assignmentDraft, canConfirm, onClose, onConfirm]);

  const openAddDriver = () => {
    onClose();
    onBeforeRegisterNavigate?.();
    router.push("/(modals)/add-driver");
  };
  const openAddVehicle = () => {
    onClose();
    onBeforeRegisterNavigate?.();
    router.push("/(modals)/add-vehicle");
  };

  const selectDriver = (id: string) => {
    if (saving || isDriverBusy(id)) return;
    const picked = drivers.find((d) => d.id === id);
    setSelectedDriverId(id);
    nameOwnedLocallyRef.current = false;
    nameOwnedForLast10Ref.current = normalizeIndianMobileLast10(picked?.phone ?? "");
    setSuggestedAppName(picked?.name?.trim() || null);
    setEditDriverName(picked?.name?.trim() || "");
    setEditDriverPhone(picked?.phone ? formatMobileNumber(picked.phone) : "");
    setDriverAction("EDIT");
  };

  const selectVehicle = (id: string) => {
    if (saving || isVehicleBusy(id)) return;
    const picked = vehicles.find((v) => v.id === id);
    setSelectedVehicleId(id);
    setEditVehiclePlate(
      picked ? formatIndianVehicleNumber(picked.vehicle_number) : "",
    );
    setEditVehicleType(picked?.vehicle_type?.trim() || "");
    setVehicleAction("EDIT");
  };

  const driverPanelBody =
    driverAction === "SWAP" ? (
      <View style={styles.panelStack}>
        {!isCompact ? (
          <Text style={aws.sectionHint}>Select on-duty fleet driver</Text>
        ) : null}
        <View style={styles.searchWrap}>
          <FontAwesome
            name="search"
            size={12}
            color={Theme.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={driverSearch}
            onChangeText={setDriverSearch}
            placeholder="Search name or phone…"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
        <Pressable
          onPress={openAddDriver}
          style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.rowPressed]}
        >
          <View style={styles.addIcon}>
            <Plus size={18} color={Theme.textMuted} strokeWidth={3} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              Add new driver
            </Text>
            {!isCompact ? (
              <Text style={styles.rowSub} numberOfLines={2}>
                Opens a short form; they appear in your fleet next time.
              </Text>
            ) : null}
          </View>
        </Pressable>
        {driversLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginVertical: 16 }} />
        ) : (
          <AssetPickList>
            {filteredDrivers.map((d) => {
              const busy = isDriverBusy(d.id);
              const selected = selectedDriverId === d.id;
              return (
                <Pressable
                  key={d.id}
                  disabled={busy}
                  onPress={() => selectDriver(d.id)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelectedDriver,
                    busy && styles.rowBusy,
                    pressed && !busy && styles.rowPressed,
                  ]}
                >
                  <View style={[aws.snapshotAvatarDriver, styles.avatarSm]}>
                    <Text style={[aws.snapshotAvatarText, { fontSize: 13 }]}>
                      {pilotCode(d.name ?? "?")}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {d.name ?? "—"}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {busy
                        ? `Already in ${activeDriverTripLabelById[d.id] ?? "another trip"}`
                        : d.phone
                          ? formatMobileNumber(d.phone)
                          : "Ready"}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome
                      name="check-circle"
                      size={18}
                      color={Theme.networkHubListCardConnectedText}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {filteredDrivers.length === 0 ? (
              <Text style={styles.emptyText}>No drivers match your search.</Text>
            ) : null}
          </AssetPickList>
        )}
      </View>
    ) : (
      <View style={styles.panelStack}>
        <View style={[styles.fieldStack, isCompact && aws.fieldsGridPhone]}>
          <View style={isCompact ? aws.fieldPhone : undefined}>
            <Text style={aws.fieldLabel}>Name</Text>
            <TextInput
              style={aws.input}
              value={editDriverName}
              onChangeText={(value) => {
                nameOwnedLocallyRef.current = true;
                nameOwnedForLast10Ref.current =
                  normalizeIndianMobileLast10(editDriverPhone);
                setEditDriverName(value);
              }}
              placeholder="Driver name"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {suggestedAppName &&
            editDriverName.trim() !== suggestedAppName ? (
              <Pressable
                onPress={() => {
                  nameOwnedLocallyRef.current = false;
                  setEditDriverName(suggestedAppName);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use app name ${suggestedAppName}`}
              >
                <Text style={styles.rowSub}>
                  App name: {suggestedAppName}. Tap to use.
                </Text>
              </Pressable>
            ) : suggestedAppName ? (
              <Text style={styles.rowSub}>
                Existing driver matched by phone. Name on this trip can stay
                different.
              </Text>
            ) : normalizeIndianMobileLast10(editDriverPhone).length >= 10 ? (
              <Text style={styles.rowSub}>
                New number. This name is saved on this trip only.
              </Text>
            ) : null}
          </View>
          <View style={isCompact ? aws.fieldPhone : undefined}>
            <Text style={aws.fieldLabel}>Phone</Text>
            <TextInput
              style={aws.input}
              value={editDriverPhone}
              onChangeText={(value) => setEditDriverPhone(formatMobileNumber(value))}
              placeholder="Phone number"
              placeholderTextColor={Theme.textMuted}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
          </View>
        </View>
      </View>
    );

  const vehiclePanelBody =
    vehicleAction === "SWAP" ? (
      <View style={styles.panelStack}>
        {!isCompact ? (
          <Text style={aws.sectionHint}>Select available registered truck</Text>
        ) : null}
        <View style={styles.searchWrap}>
          <FontAwesome
            name="search"
            size={12}
            color={Theme.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={vehicleSearch}
            onChangeText={setVehicleSearch}
            placeholder="Search reg no or type…"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
        <Pressable
          onPress={openAddVehicle}
          style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.rowPressed]}
        >
          <View style={styles.addIcon}>
            <Plus size={18} color={Theme.textMuted} strokeWidth={3} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              Add new vehicle
            </Text>
            {!isCompact ? (
              <Text style={styles.rowSub} numberOfLines={2}>
                Opens a short form; they appear in your fleet next time.
              </Text>
            ) : null}
          </View>
        </Pressable>
        {vehiclesLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginVertical: 16 }} />
        ) : (
          <AssetPickList>
            {filteredVehicles.map((v) => {
              const busy = isVehicleBusy(v.id);
              const selected = selectedVehicleId === v.id;
              const plate = formatIndianVehicleNumber(v.vehicle_number);
              return (
                <Pressable
                  key={v.id}
                  disabled={busy}
                  onPress={() => selectVehicle(v.id)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelectedVehicle,
                    busy && styles.rowBusy,
                    pressed && !busy && styles.rowPressed,
                  ]}
                >
                  <View style={[aws.snapshotAvatarVehicle, styles.avatarSm]}>
                    <Text style={[aws.snapshotAvatarText, { fontSize: 11 }]}>
                      {vehicleCode(v)}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {plate}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {busy
                        ? `Already in ${activeVehicleTripLabelById[v.id] ?? "another trip"}`
                        : v.vehicle_type ?? "Available"}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome
                      name="check-circle"
                      size={18}
                      color={Theme.assignmentVehicleAccent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {filteredVehicles.length === 0 ? (
              <Text style={styles.emptyText}>No vehicles match your search.</Text>
            ) : null}
          </AssetPickList>
        )}
      </View>
    ) : (
      <View style={styles.panelStack}>
        <View style={[styles.fieldStack, isCompact && aws.fieldsGridPhone]}>
          <View style={isCompact ? aws.fieldPhone : undefined}>
            <Text style={aws.fieldLabel}>Plate</Text>
            <TextInput
              style={[aws.input, { fontWeight: "700" }]}
              value={editVehiclePlate}
              onChangeText={(value) =>
                setEditVehiclePlate(formatIndianVehicleNumber(value))
              }
              placeholder="Registration number"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <View style={isCompact ? aws.fieldPhone : undefined}>
            <Text style={aws.fieldLabel}>Type</Text>
            <TextInput
              style={aws.input}
              value={editVehicleType}
              onChangeText={setEditVehicleType}
              placeholder="e.g. Mini Truck / LCV"
              placeholderTextColor={Theme.textMuted}
              autoCorrect={false}
            />
          </View>
        </View>
      </View>
    );

  return (
    <View style={[styles.root, !isCompact && styles.rootDesktop]}>
      <TripAssignmentWorkspace
        trip={trip}
        organizationId={organizationId}
        driverDisplayName={driverDisplayName}
        driverPhoneDisplay={driverPhoneDisplay}
        vehicleDisplayLabel={vehicleDisplayLabel}
        vehicleCategory={vehicleTypeDisplay}
        fulfillmentMode="ASSET"
        fulfillmentModeEditable={false}
        driverAction={driverAction}
        onDriverActionChange={(next) => {
          if (next === "EDIT") {
            const seed = selectedDriverId ?? initialDriverId ?? trip.driver_id;
            if (seed) setSelectedDriverId(seed);
          }
          setDriverAction(next);
        }}
        vehicleAction={vehicleAction}
        onVehicleActionChange={(next) => {
          if (next === "EDIT") {
            const seed = selectedVehicleId ?? initialVehicleId ?? trip.vehicle_id;
            if (seed) setSelectedVehicleId(seed);
          }
          setVehicleAction(next);
        }}
        driverPanelBody={driverPanelBody}
        vehiclePanelBody={vehiclePanelBody}
        changeReason={changeReason}
        onChangeReasonChange={setChangeReason}
        changeRemarks={changeRemarks}
        onChangeRemarksChange={setChangeRemarks}
        onConfirm={saveAssignment}
        onContinue={goToReason}
        onWizardBack={() => setWizardStep("details")}
        wizardStep={wizardStep}
        continueLabel="Continue"
        confirmDisabled={!canConfirm || saving}
        confirmLoading={saving}
        panelScope={focus === "vehicle" ? "vehicle" : "driver"}
        confirmLabel="Save assignment"
        confirmHint={
          wizardStep === "reason"
            ? saving
              ? "Saving these details to the trip…"
              : "Pick a reason, then save to update the trip."
            : focus === "vehicle"
              ? !vehicleReady
                ? "Edit the plate or tap Replace to pick a vehicle."
                : !persistDriverId
                  ? "This trip needs a driver before the vehicle can be saved."
                  : !canConfirm
                    ? "That truck is already on another trip."
                    : null
              : !persistDriverId
                ? "Tap Replace to pick a driver."
                : !canConfirm
                  ? "That person is already on another trip."
                  : null
        }
        onClose={onClose}
        toastMessage={toast}
      />
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    width: "100%" as const,
    height: "100%" as const,
    maxWidth: "100%" as const,
    alignSelf: "stretch" as const,
    position: "relative" as const,
  },
  rootDesktop: {
    maxWidth: Platform.OS === "web" ? 1360 : undefined,
    alignSelf: "center" as const,
  },
  panelStack: {
    gap: 10,
    width: "100%" as const,
    flexGrow: 1,
    minHeight: 0,
  },
  searchWrap: {
    width: "100%" as const,
    position: "relative" as const,
  },
  searchIcon: {
    position: "absolute" as const,
    left: 12,
    top: 13,
    zIndex: 2,
  },
  searchInput: {
    ...aws.input,
    width: "100%" as const,
    paddingLeft: 34,
  },
  listScroll: {
    width: "100%" as const,
    height: 260,
    flexGrow: 0,
    flexShrink: 0,
  },
  listStack: {
    gap: 8,
    width: "100%" as const,
    paddingBottom: 4,
  },
  row: {
    width: "100%" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    backgroundColor: Theme.surface,
    minHeight: 56,
  },
  addRow: {
    backgroundColor: Theme.cardWhite,
  },
  rowSelectedDriver: {
    borderColor: Theme.networkHubListCardConnectedText,
    backgroundColor: Theme.networkHubListCardConnectedBg,
  },
  rowSelectedVehicle: {
    borderColor: Theme.assignmentVehicleAccent,
    backgroundColor: Theme.assignmentVehicleAccentSoft,
  },
  rowBusy: {
    opacity: 0.5,
  },
  rowPressed: {
    opacity: 0.85,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600" as const,
    color: Theme.textPrimaryDark,
  },
  rowSub: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    paddingVertical: 8,
  },
  fieldStack: {
    gap: 12,
    width: "100%" as const,
  },
  readOnly: {
    opacity: 0.9,
  },
  switchLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
  },
  switchLinkText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Theme.networkHubListCardConnectedText,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  confirmCard: {
    width: "100%" as const,
    maxWidth: 400,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    padding: 22,
    gap: 10,
    alignItems: "center" as const,
  },
  confirmIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.networkHubListCardConnectedBg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    textAlign: "center" as const,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center" as const,
  },
  confirmBtn: {
    marginTop: 8,
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Theme.assignmentHeroBg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.cardWhite,
  },
  previewCard: {
    width: "100%" as const,
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    padding: 22,
    gap: 12,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    textAlign: "center" as const,
  },
  previewHint: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: "center" as const,
  },
  previewRow: {
    borderRadius: 12,
    backgroundColor: Theme.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: Theme.textMuted,
  },
  previewValue: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
  },
  previewMeta: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  previewActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 4,
  },
  previewEditBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Theme.cardWhite,
  },
  previewEditText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
  },
  previewConfirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Theme.assignmentHeroBg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  previewConfirmText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.cardWhite,
  },
};
