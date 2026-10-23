/**
 * Driver & vehicle assignment — notification-card chrome (same feed as the
 * in-app alerts drawer: avatar row, status pill, ghost / primary actions).
 */
import { type ReactNode, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import {
  AlertRegistrySignalCard,
  RegistryStatusPill,
} from "@/components/AlertRegistrySignalCard";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { aws, nws } from "./tripAssignmentWorkspace.styles";

export type AssignmentFulfillmentMode = "ASSET" | "MARKET";
export type AssignmentPanelAction = "EDIT" | "SWAP";

export type ChangeReasonCode =
  | "AD_HOC_SUBSTITUTION"
  | "DUTY_HOURS_EXCEEDED"
  | "VEHICLE_BREAKDOWN"
  | "CLIENT_REQUEST"
  | "DOCUMENT_EXPIRED";

const CHANGE_REASONS: { value: ChangeReasonCode; label: string }[] = [
  { value: "AD_HOC_SUBSTITUTION", label: "Ad-hoc Operational Substitution" },
  { value: "DUTY_HOURS_EXCEEDED", label: "Driver Duty Hours Exceeded" },
  { value: "VEHICLE_BREAKDOWN", label: "Vehicle Mechanical Failure / Repair" },
  { value: "CLIENT_REQUEST", label: "Client / Shipper Specific Requirement" },
  { value: "DOCUMENT_EXPIRED", label: "DL or RC Document Expiry Renewal" },
];

export type TripAssignmentWorkspaceProps = {
  trip: TripRow;
  organizationId?: string | null;
  supplierDisplayName?: string | null;
  driverDisplayName: string;
  driverPhoneDisplay?: string | null;
  vehicleDisplayLabel: string;
  vehicleCategory?: string | null;
  fulfillmentMode: AssignmentFulfillmentMode;
  onFulfillmentModeChange?: (mode: AssignmentFulfillmentMode) => void;
  fulfillmentModeEditable?: boolean;
  driverAction: AssignmentPanelAction;
  onDriverActionChange: (action: AssignmentPanelAction) => void;
  vehicleAction: AssignmentPanelAction;
  onVehicleActionChange: (action: AssignmentPanelAction) => void;
  driverPanelBody: ReactNode;
  vehiclePanelBody: ReactNode;
  changeReason: ChangeReasonCode;
  onChangeReasonChange: (reason: ChangeReasonCode) => void;
  changeRemarks: string;
  onChangeRemarksChange: (remarks: string) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  confirmHint?: string | null;
  confirmLabel?: string;
  onClose: () => void;
  toastMessage?: string | null;
  activityItems?: { time: string; title: string; body: string; tone?: "ok" | "info" }[];
};

function cityFromLocation(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const first =
    raw.split(/\s*[·|,/]\s*/)[0]?.trim() ||
    raw.split(",")[0]?.trim() ||
    raw;
  const upper = first.toUpperCase();
  return upper.length > 22 ? `${upper.slice(0, 20)}…` : upper;
}

function formatDistance(trip: TripRow): string {
  const d = trip.distance;
  if (d == null || d === "") return "—";
  const n = typeof d === "number" ? d : Number(String(d).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return String(d);
  return `${Math.round(n)} KM`;
}

function isNamed(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length > 0 && v !== "—" && !/^unassigned$/i.test(v) && !/^vehicle$/i.test(v);
}

export function TripAssignmentWorkspace({
  trip,
  organizationId,
  supplierDisplayName,
  driverDisplayName,
  driverPhoneDisplay,
  vehicleDisplayLabel,
  vehicleCategory,
  driverAction,
  onDriverActionChange,
  vehicleAction,
  onVehicleActionChange,
  driverPanelBody,
  vehiclePanelBody,
  changeReason,
  onChangeReasonChange,
  changeRemarks,
  onChangeRemarksChange,
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  confirmHint = null,
  confirmLabel = "Confirm & update",
  onClose,
  toastMessage = null,
  activityItems,
}: TripAssignmentWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  const tripLabel = getTripDisplayNumber(trip, organizationId ?? undefined);
  const statusLabel = (trip.status ?? "ASSIGNED").replace(/_/g, " ");
  const origin = cityFromLocation(trip.pickup_area);
  const destination = cityFromLocation(trip.drop_location);
  const clientName = (trip.client_name ?? "—").trim() || "—";
  const supplierName = (
    supplierDisplayName ??
    trip.supplier_name ??
    "—"
  ).trim();
  const eta = trip.estimated_duration?.trim() || "—";
  const range = formatDistance(trip);
  const driverAssigned = isNamed(driverDisplayName);
  const vehicleAssigned = isNamed(vehicleDisplayLabel);

  const defaultActivity = useMemo(
    () =>
      activityItems ?? [
        {
          time: "Just now",
          title: tripLabel,
          body: `${driverDisplayName || "Driver"} · ${vehicleDisplayLabel || "Vehicle"}`,
          tone: "ok" as const,
        },
        {
          time: "Route",
          title: `${origin} → ${destination}`,
          body: clientName,
          tone: "info" as const,
        },
      ],
    [
      activityItems,
      tripLabel,
      driverDisplayName,
      vehicleDisplayLabel,
      origin,
      destination,
      clientName,
    ],
  );

  return (
    <View style={[nws.root, { paddingTop: insets.top }]}>
      <View style={nws.header}>
        <View style={nws.headerInner}>
          <Text style={nws.headerTitle}>Assignment</Text>
          <View style={nws.headerActions}>
            <Pressable
              onPress={() => setShowAuditDrawer(true)}
              style={nws.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Activity"
              hitSlop={8}
            >
              <Text style={nws.activityLink}>Activity</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={nws.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Close assignment"
              hitSlop={8}
            >
              <X size={16} color={Theme.textMuted} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          nws.scroll,
          { paddingBottom: Math.max(28, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <View style={nws.tripMeta}>
          <Text style={nws.tripCode}>{tripLabel}</Text>
          <RegistryStatusPill label={statusLabel} tone="neutral" />
        </View>

        <AlertRegistrySignalCard
          avatar={{
            name: clientName,
            entityType: "client",
          }}
          actorName={clientName}
          actionText="needs a driver for"
          highlightText={tripLabel}
          detailTitle={`${origin} → ${destination}`}
          detailSubtitle={`${range} · ${eta}${supplierName !== "—" ? ` · ${supplierName}` : ""}`}
          timeLabel="Operations"
          contextLabel="Trip"
          tags={[{ label: vehicleAssigned && driverAssigned ? "assigned" : "unassigned" }]}
          statusPill={{
            label: driverAssigned ? "Assigned" : "Unassigned",
            tone: driverAssigned ? "success" : "warning",
          }}
          isUnread={!driverAssigned}
          variant="feed"
        />

        <View style={[nws.cardGrid, compact && nws.cardGridStack]}>
          <View style={nws.feedCard}>
            <View style={nws.feedHead}>
              <PartyAvatar
                name={driverDisplayName || "Driver"}
                entityType="driver"
                size={36}
                shape="circle"
              />
              <View style={nws.feedHeadCopy}>
                <Text style={nws.feedTitle} numberOfLines={1}>
                  {driverAssigned ? driverDisplayName : tripLabel}{" "}
                  <Text style={nws.feedAction}>
                    {driverAssigned ? "is assigned" : "needs a driver for"}{" "}
                  </Text>
                  <Text style={nws.feedHighlight}>{tripLabel}</Text>
                </Text>
                <Text style={nws.feedTime}>
                  {driverPhoneDisplay?.trim()
                    ? `${driverPhoneDisplay} · Operations`
                    : "Just now · Operations"}
                </Text>
              </View>
            </View>
            <View style={nws.quote}>
              <Text style={nws.quoteTitle}>{tripLabel}</Text>
              <Text style={nws.quoteBody}>
                {driverAssigned
                  ? `Assign a driver to continue`
                  : "Assign a driver to continue"}
              </Text>
            </View>
            <View style={nws.cardFooter}>
              <RegistryStatusPill
                label={driverAction === "SWAP" ? "Swap" : driverAssigned ? "Assigned" : "Unassigned"}
                tone={
                  driverAction === "SWAP"
                    ? "warning"
                    : driverAssigned
                      ? "success"
                      : "warning"
                }
              />
              <RegistryCardActions>
                <RegistryGhostButton
                  label="Edit details"
                  onPress={() => onDriverActionChange("EDIT")}
                />
                <RegistryPrimaryButton
                  label="New driver"
                  onPress={() => onDriverActionChange("SWAP")}
                />
              </RegistryCardActions>
            </View>
            <View style={nws.fields}>{driverPanelBody}</View>
          </View>

          <View style={nws.feedCard}>
            <View style={nws.feedHead}>
              <PartyAvatar
                name={vehicleDisplayLabel || "Vehicle"}
                entityType="vehicle"
                size={36}
                shape="circle"
              />
              <View style={nws.feedHeadCopy}>
                <Text style={nws.feedTitle} numberOfLines={2}>
                  {vehicleAssigned ? vehicleDisplayLabel : tripLabel}{" "}
                  <Text style={nws.feedAction}>
                    {vehicleAssigned ? "is on this trip" : "needs a vehicle for"}{" "}
                  </Text>
                  <Text style={nws.feedHighlight}>{tripLabel}</Text>
                </Text>
                <Text style={nws.feedTime}>
                  {vehicleCategory?.trim()
                    ? `${vehicleCategory} · Fleet`
                    : "Just now · Fleet"}
                </Text>
              </View>
            </View>
            <View style={nws.quote}>
              <Text style={nws.quoteTitle}>
                {vehicleAssigned ? vehicleDisplayLabel : tripLabel}
              </Text>
              <Text style={nws.quoteBody}>
                {vehicleAssigned
                  ? "Edit specs or swap the truck"
                  : "Add a registration number to continue"}
              </Text>
            </View>
            <View style={nws.cardFooter}>
              <RegistryStatusPill
                label={vehicleAction === "SWAP" ? "Swap" : vehicleAssigned ? "Assigned" : "Unassigned"}
                tone={
                  vehicleAction === "SWAP"
                    ? "warning"
                    : vehicleAssigned
                      ? "success"
                      : "warning"
                }
              />
              <RegistryCardActions>
                <RegistryGhostButton
                  label="Edit specs"
                  onPress={() => onVehicleActionChange("EDIT")}
                />
                <RegistryPrimaryButton
                  label="New truck"
                  onPress={() => onVehicleActionChange("SWAP")}
                />
              </RegistryCardActions>
            </View>
            <View style={nws.fields}>{vehiclePanelBody}</View>
          </View>
        </View>

        <View style={nws.feedCard}>
          <Text style={nws.sectionLabel}>Reason for substitution</Text>
          <View style={nws.reasonRow}>
            {CHANGE_REASONS.map((r) => {
              const active = changeReason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[nws.reasonChip, active && nws.reasonChipActive]}
                  onPress={() => onChangeReasonChange(r.value)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[nws.reasonChipText, active && nws.reasonChipTextActive]}
                    numberOfLines={1}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[nws.sectionLabel, { marginTop: 12 }]}>Notes</Text>
          <TextInput
            style={aws.input}
            value={changeRemarks}
            onChangeText={onChangeRemarksChange}
            placeholder="Add operational notes…"
            placeholderTextColor={Theme.textMuted}
          />
          {confirmHint ? <Text style={nws.hint}>{confirmHint}</Text> : null}
          <View style={nws.submitRow}>
            <View style={{ flex: 1 }}>
              <RegistryGhostButton label="Decline" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <RegistryPrimaryButton
                label={confirmLoading ? "Saving…" : confirmLabel}
                onPress={onConfirm}
                disabled={confirmDisabled || confirmLoading}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {toastMessage ? (
        <View style={nws.toast} pointerEvents="none">
          <Text style={nws.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <Modal
        visible={showAuditDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuditDrawer(false)}
      >
        <Pressable style={nws.drawerBackdrop} onPress={() => setShowAuditDrawer(false)}>
          <Pressable
            style={[nws.drawer, { paddingTop: insets.top + 12 }]}
            onPress={(e) => {
              if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
                e.stopPropagation();
              }
            }}
          >
            <View style={nws.drawerHeader}>
              <Text style={nws.headerTitle}>Activity</Text>
              <Pressable onPress={() => setShowAuditDrawer(false)} hitSlop={8}>
                <X size={16} color={Theme.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
            {defaultActivity.map((item, idx) => (
              <View key={`${item.title}-${idx}`} style={nws.activityRow}>
                <Text style={nws.feedTime}>{item.time}</Text>
                <Text style={nws.feedTitle}>{item.title}</Text>
                <Text style={nws.quoteBody}>{item.body}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
