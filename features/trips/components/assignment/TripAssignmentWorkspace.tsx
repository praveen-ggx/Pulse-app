/**
 * Full-page Driver & Vehicle Assignment workspace —
 * recreates the manifest management layout (hero, tabs, dual panels, audit footer).
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { AlertRegistrySignalCard, RegistryStatusPill } from "@/components/AlertRegistrySignalCard";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { aws } from "./tripAssignmentWorkspace.styles";

export type AssignmentFulfillmentMode = "ASSET" | "MARKET";
export type AssignmentPanelAction = "PREVIEW" | "EDIT" | "SWAP";

export type ChangeReasonCode =
  | "AD_HOC_SUBSTITUTION"
  | "DUTY_HOURS_EXCEEDED"
  | "VEHICLE_BREAKDOWN"
  | "CLIENT_REQUEST"
  | "DOCUMENT_EXPIRED";

const CHANGE_REASONS: { value: ChangeReasonCode; label: string; short: string }[] = [
  { value: "AD_HOC_SUBSTITUTION", label: "Ad-hoc substitution", short: "Ad-hoc" },
  { value: "DUTY_HOURS_EXCEEDED", label: "Duty hours exceeded", short: "Hours" },
  { value: "VEHICLE_BREAKDOWN", label: "Vehicle breakdown", short: "Breakdown" },
  { value: "CLIENT_REQUEST", label: "Client request", short: "Client" },
  { value: "DOCUMENT_EXPIRED", label: "Document expired", short: "Documents" },
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
  /** When false, mode toggle is display-only (locked to trip type). */
  fulfillmentModeEditable?: boolean;
  driverAction: AssignmentPanelAction;
  onDriverActionChange: (action: AssignmentPanelAction) => void;
  vehicleAction: AssignmentPanelAction;
  onVehicleActionChange: (action: AssignmentPanelAction) => void;
  /** Body under driver Edit/Swap (existing reassign sections / forms). */
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
  /** Primary CTA label (default: Save assignment). */
  confirmLabel?: string;
  /** Inline preview + Edit / Confirm (no overlay). */
  confirmPreview?: {
    driverName: string;
    driverPhone?: string;
    vehiclePlate: string;
    vehicleType?: string;
    onEdit: () => void;
    onConfirm: () => void;
    scope?: "driver" | "vehicle" | "both";
  } | null;
  onClose: () => void;
  toastMessage?: string | null;
  /** Optional activity timeline entries for the drawer. */
  activityItems?: { time: string; title: string; body: string; tone?: "ok" | "info" }[];
  /** `popup` = notification-card modal (change-driver). `page` = full workspace. */
  layout?: "page" | "popup";
  /** Manifest Change opens one party only. */
  panelScope?: "driver" | "vehicle" | "both";
  /** Stepped wizard: details first, reason + save second. Omit to show both. */
  wizardStep?: "details" | "reason";
  onContinue?: () => void;
  continueLabel?: string;
  onWizardBack?: () => void;
};

function ReasonChipsRow({
  value,
  onChange,
}: {
  value: ChangeReasonCode;
  onChange: (reason: ChangeReasonCode) => void;
}) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={aws.reasonChipsScroll}
      contentContainerStyle={aws.reasonChips}
    >
      {CHANGE_REASONS.map((r) => {
        const active = value === r.value;
        return (
          <TouchableOpacity
            key={r.value}
            style={[aws.reasonChip, active && aws.reasonChipActive]}
            onPress={() => onChange(r.value)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={r.label}
          >
            <Text
              style={[aws.reasonChipText, active && aws.reasonChipTextActive]}
              numberOfLines={1}
            >
              {r.short}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function cityFromLocation(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  // Prefer first segment when locations use commas, middots, or pipes.
  const first =
    raw.split(/\s*[·|,/]\s*/)[0]?.trim() ||
    raw.split(",")[0]?.trim() ||
    raw;
  const upper = first.toUpperCase();
  // Keep hero labels readable — long warehouse names were overlapping DEST.
  return upper.length > 22 ? `${upper.slice(0, 20)}…` : upper;
}

function AssignmentPartySignalCard({
  kind,
  name,
  meta,
  tripLabel,
  assigned,
  action,
  desktop,
  onEdit,
  onSwap,
}: {
  kind: "driver" | "vehicle";
  name: string;
  meta?: string | null;
  tripLabel: string;
  assigned: boolean;
  action: AssignmentPanelAction;
  desktop?: boolean;
  onEdit: () => void;
  onSwap: () => void;
}) {
  const isDriver = kind === "driver";
  const displayName = name.trim() || "Unassigned";
  const editing = action === "EDIT";
  const swapping = action === "SWAP";
  const iconSize = desktop ? 13 : 12;
  return (
    <View style={[aws.notifyCard, desktop && aws.notifyCardDesktop]}>
      <View style={aws.notifyTop}>
        <PartyAvatar
          name={displayName}
          entityType={isDriver ? "driver" : "vehicle"}
          initialsColorSeed={name || tripLabel}
          size={desktop ? 40 : 28}
          shape="circle"
        />
        <View style={aws.notifyCopy}>
          <Text style={[aws.notifyKicker, desktop && aws.notifyKickerDesktop]} numberOfLines={1}>
            {isDriver ? "Driver on this trip" : "Vehicle on this trip"}
          </Text>
          <Text style={[aws.notifyName, desktop && aws.notifyNameDesktop]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[aws.notifyMeta, desktop && aws.notifyMetaDesktop]} numberOfLines={1}>
            {meta?.trim() ||
              (isDriver ? "Contact and licence" : "RC, Fastag, specs")}
          </Text>
        </View>
        <View style={aws.notifyIconCluster}>
          <RegistryStatusPill
            label={assigned ? "Assigned" : "Needed"}
            tone={assigned ? "success" : "warning"}
          />
          <View style={aws.notifyIconRow}>
            <Pressable
              onPress={onEdit}
              hitSlop={6}
              style={aws.notifyIconItem}
              accessibilityRole="button"
              accessibilityState={{ selected: editing }}
              accessibilityLabel={isDriver ? "Edit driver details" : "Edit vehicle specs"}
            >
              <View style={[aws.notifyIconBtn, editing && aws.notifyIconBtnActive]}>
                <FontAwesome
                  name="pencil"
                  size={iconSize}
                  color={editing ? Theme.actionBtnInk : Theme.textSecondary}
                />
              </View>
              <Text style={[aws.notifyIconCaption, editing && aws.notifyIconCaptionActive]}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={onSwap}
              hitSlop={6}
              style={aws.notifyIconItem}
              accessibilityRole="button"
              accessibilityState={{ selected: swapping }}
              accessibilityLabel={isDriver ? "Replace driver" : "Replace vehicle"}
            >
              <View style={[aws.notifyIconBtn, swapping && aws.notifyIconBtnActive]}>
                <FontAwesome
                  name="exchange"
                  size={iconSize}
                  color={swapping ? Theme.actionBtnInk : Theme.textSecondary}
                />
              </View>
              <Text style={[aws.notifyIconCaption, swapping && aws.notifyIconCaptionActive]}>
                Replace
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function formatDistance(trip: TripRow): string {
  const d = trip.distance;
  if (d == null || d === "") return "—";
  const n = typeof d === "number" ? d : Number(String(d).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return String(d);
  return `${Math.round(n)} KM`;
}

export function TripAssignmentWorkspace({
  trip,
  organizationId,
  supplierDisplayName,
  driverDisplayName,
  driverPhoneDisplay,
  vehicleDisplayLabel,
  vehicleCategory,
  fulfillmentMode,
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
  confirmLabel = "Save assignment",
  confirmPreview = null,
  onClose,
  toastMessage = null,
  activityItems,
  layout = "page",
  panelScope = "both",
  wizardStep,
  onContinue,
  continueLabel = "Continue",
  onWizardBack,
}: TripAssignmentWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const pageScrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const compact = width < 720;
  const phone = width < 480;
  const resolvedWizardStep =
    wizardStep ?? (panelScope !== "both" ? "details" : undefined);
  const stepped = resolvedWizardStep === "details" || resolvedWizardStep === "reason";
  const showPartyPanels = !stepped || resolvedWizardStep === "details";
  const showReasonStep = !stepped || resolvedWizardStep === "reason";

  useEffect(() => {
    if (!confirmPreview && resolvedWizardStep !== "reason") return;
    const id = setTimeout(() => {
      if (resolvedWizardStep === "reason") {
        pageScrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      pageScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(id);
  }, [confirmPreview, resolvedWizardStep]);
  const mobileFullPage = width < 768;
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  const tripLabel = getTripDisplayNumber(trip, organizationId ?? undefined);
  const statusLabel = (trip.status ?? "ASSIGNED").replace(/_/g, " ").toUpperCase();
  const origin = cityFromLocation(trip.pickup_area);
  const destination = cityFromLocation(trip.drop_location);
  const clientName = (trip.client_name ?? "—").toUpperCase();
  const supplierName = (
    supplierDisplayName ??
    trip.supplier_name ??
    "—"
  ).toUpperCase();
  const eta = trip.estimated_duration?.trim() || "—";
  const range = formatDistance(trip);
  const driverInitial = (driverDisplayName.trim().charAt(0) || "?").toUpperCase();

  const defaultActivity = useMemo(
    () =>
      activityItems ?? [
        {
          time: "RECENT",
          title: `Manifest open · ${tripLabel}`,
          body: `${driverDisplayName || "Driver"} · ${vehicleDisplayLabel || "Vehicle"}`,
          tone: "ok" as const,
        },
        {
          time: "ROUTE",
          title: `${origin} → ${destination}`,
          body: `Client ${clientName}${supplierName !== "—" ? ` · Supplier ${supplierName}` : ""}`,
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
      supplierName,
    ],
  );

  if (layout === "popup") {
    const hasDriver = Boolean((trip.driver_id ?? "").trim());
    const popupConfirmLabel =
      confirmLabel === "Save assignment" ? "Save" : confirmLabel;
    return (
      <View style={aws.popupRoot}>
        <TouchableOpacity
          style={aws.popupClose}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          activeOpacity={0.85}
        >
          <FontAwesome name="close" size={13} color={Theme.textMuted} />
        </TouchableOpacity>

        <AlertRegistrySignalCard
          variant="tile"
          isUnread
          avatar={{
            name: driverDisplayName || clientName,
            entityType: hasDriver ? "driver" : "client",
            initialsColorSeed: trip.driver_id ?? trip.client_id ?? tripLabel,
          }}
          actorName={tripLabel}
          actionText="needs a driver change for"
          highlightText={clientName}
          detailTitle={tripLabel}
          detailSubtitle="Change driver to continue"
          timeLabel="Now"
          contextLabel="Operations"
          statusPill={{
            label: hasDriver ? "Assigned" : "Unassigned",
            tone: hasDriver ? "success" : "warning",
          }}
          footer={
            <RegistryCardActions>
              <RegistryGhostButton label="Later" onPress={onClose} />
              <RegistryPrimaryButton
                label={confirmLoading ? "Saving…" : popupConfirmLabel}
                onPress={onConfirm}
                disabled={confirmDisabled || confirmLoading}
              />
            </RegistryCardActions>
          }
        />

        <ScrollView
          style={aws.popupScroll}
          contentContainerStyle={aws.popupScrollContent}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          <View style={aws.popupSection}>
            <View style={aws.popupSectionHead}>
              <Text style={aws.popupSectionTitle}>Current driver</Text>
              <View style={aws.notifyIconRow}>
                <Pressable
                  onPress={() =>
                    onDriverActionChange(driverAction === "EDIT" ? "PREVIEW" : "EDIT")
                  }
                  hitSlop={8}
                  style={[aws.notifyIconBtn, driverAction === "EDIT" && aws.notifyIconBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit driver details"
                >
                  <FontAwesome
                    name="pencil"
                    size={12}
                    color={driverAction === "EDIT" ? Theme.actionBtnInk : Theme.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() =>
                    onDriverActionChange(driverAction === "SWAP" ? "PREVIEW" : "SWAP")
                  }
                  hitSlop={8}
                  style={[aws.notifyIconBtn, driverAction === "SWAP" && aws.notifyIconBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel="Swap driver"
                >
                  <FontAwesome
                    name={fulfillmentMode === "ASSET" ? "exchange" : "plus"}
                    size={12}
                    color={driverAction === "SWAP" ? Theme.actionBtnInk : Theme.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
            <View style={aws.popupPartyRow}>
              <View style={aws.snapshotAvatarDriver}>
                <Text style={aws.snapshotAvatarText}>{driverInitial}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={aws.snapshotName} numberOfLines={1}>
                  {driverDisplayName || "Unassigned"}
                </Text>
                {driverPhoneDisplay ? (
                  <Text style={aws.snapshotMeta} numberOfLines={1}>
                    {driverPhoneDisplay}
                  </Text>
                ) : null}
              </View>
            </View>
            {driverAction !== "PREVIEW" ? driverPanelBody : null}
          </View>

          <View style={aws.popupSection}>
            <View style={aws.popupSectionHead}>
              <Text style={aws.popupSectionTitle}>Current vehicle</Text>
              <View style={aws.notifyIconRow}>
                <Pressable
                  onPress={() =>
                    onVehicleActionChange(vehicleAction === "EDIT" ? "PREVIEW" : "EDIT")
                  }
                  hitSlop={8}
                  style={[aws.notifyIconBtn, vehicleAction === "EDIT" && aws.notifyIconBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit vehicle specs"
                >
                  <FontAwesome
                    name="pencil"
                    size={12}
                    color={vehicleAction === "EDIT" ? Theme.actionBtnInk : Theme.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() =>
                    onVehicleActionChange(vehicleAction === "SWAP" ? "PREVIEW" : "SWAP")
                  }
                  hitSlop={8}
                  style={[aws.notifyIconBtn, vehicleAction === "SWAP" && aws.notifyIconBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel="Swap truck"
                >
                  <FontAwesome
                    name={fulfillmentMode === "ASSET" ? "exchange" : "plus"}
                    size={12}
                    color={vehicleAction === "SWAP" ? Theme.actionBtnInk : Theme.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
            <View style={aws.popupPartyRow}>
              <View style={aws.snapshotAvatarVehicle}>
                <FontAwesome name="truck" size={16} color={Theme.cardWhite} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={aws.snapshotName} numberOfLines={1}>
                  {vehicleDisplayLabel || "Unassigned"}
                </Text>
                {vehicleCategory ? (
                  <Text style={aws.snapshotMeta} numberOfLines={1}>
                    {vehicleCategory}
                  </Text>
                ) : null}
              </View>
            </View>
            {vehicleAction !== "PREVIEW" ? vehiclePanelBody : null}
          </View>

          <View style={aws.popupSection}>
            <Text style={aws.popupSectionTitle}>Reason</Text>
            <ReasonChipsRow
              value={changeReason}
              onChange={onChangeReasonChange}
            />
            <TextInput
              style={aws.popupRemarks}
              value={changeRemarks}
              onChangeText={onChangeRemarksChange}
              placeholder="Operational notes…"
              placeholderTextColor={Theme.textMuted}
              multiline
            />
            {confirmHint ? (
              <Text style={aws.popupHint}>{confirmHint}</Text>
            ) : null}
          </View>
        </ScrollView>

        {toastMessage ? (
          <View style={aws.toast} pointerEvents="none">
            <FontAwesome
              name="check-circle"
              size={16}
              color={Theme.networkHubListCardOnlineDot}
            />
            <Text style={aws.toastText}>{toastMessage}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[aws.root, mobileFullPage && aws.rootMobileFullPage, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[aws.header, compact && aws.headerMobile]}>
        <View
          style={[
            aws.headerInner,
            compact && aws.headerInnerMobile,
            { paddingBottom: compact ? 10 : 8 },
          ]}
        >
          <View style={[aws.headerLeft, compact && aws.headerLeftMobile]}>
            <TouchableOpacity
              style={aws.iconBtn}
              onPress={onClose}
              accessibilityLabel="Close"
              activeOpacity={0.85}
            >
              <FontAwesome name="chevron-left" size={12} color={Theme.textSecondary} />
            </TouchableOpacity>
            <View style={{ minWidth: 0, flex: 1 }}>
              {!phone ? (
                <Text style={aws.eyebrow} numberOfLines={1}>
                  {panelScope === "vehicle"
                    ? "Assign vehicle"
                    : panelScope === "driver"
                      ? "Assign driver"
                      : "Assign driver & vehicle"}
                </Text>
              ) : (
                <Text style={aws.eyebrow} numberOfLines={1}>
                  Driver & vehicle
                </Text>
              )}
              <View style={aws.tripTitleRow}>
                <Text
                  style={[aws.tripCode, phone && aws.tripCodePhone]}
                  numberOfLines={1}
                >
                  {tripLabel}
                </Text>
                <View style={[aws.statusPill, phone && aws.statusPillPhone]}>
                  <Text style={aws.statusPillText} numberOfLines={1}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[aws.headerRight, compact && aws.headerRightMobile]}>
            {driverPhoneDisplay && !phone ? (
              <View style={[aws.phoneChip, compact && { maxWidth: 132 }]}>
                <FontAwesome name="phone" size={12} color={Theme.networkHubListCardOnlineDot} />
                <Text style={aws.phoneChipText} numberOfLines={1}>
                  {driverPhoneDisplay}
                </Text>
              </View>
            ) : null}
            {!phone ? (
              <TouchableOpacity
                style={[aws.activityBtn, compact && aws.iconBtn]}
                onPress={() => setShowAuditDrawer(true)}
                activeOpacity={0.85}
                accessibilityLabel="Activity"
              >
                <FontAwesome name="history" size={12} color={Theme.textMuted} />
                {wide ? <Text style={aws.activityBtnText}>Activity</Text> : null}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        ref={pageScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[
          aws.main,
          compact && aws.mainMobile,
          { paddingBottom: Math.max(24, insets.bottom + 16) },
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        {/* Dark route hero — matches desktop: route + metrics only */}
        <View style={[aws.hero, compact && aws.heroMobile]}>
          <View style={[aws.heroRow, compact && aws.heroRowMobile]}>
            <View style={[aws.heroRouteBlock, compact && aws.heroRouteBlockMobile]}>
              {!phone ? (
                <View style={[aws.heroMetaRow, compact && aws.heroMetaRowMobile]}>
                  <View style={[aws.heroMetaItem, compact && aws.heroMetaItemMobile]}>
                    <View style={aws.heroMetaIcon}>
                      <FontAwesome name="briefcase" size={10} color={Theme.primaryLight} />
                    </View>
                    <Text style={aws.heroMetaLabel} numberOfLines={1}>
                      CLIENT: <Text style={aws.heroMetaValue}>{clientName}</Text>
                    </Text>
                  </View>
                  <View style={[aws.heroMetaItem, compact && aws.heroMetaItemMobile]}>
                    <View style={aws.heroMetaIcon}>
                      <FontAwesome
                        name="user"
                        size={10}
                        color={Theme.networkHubListCardOnlineDot}
                      />
                    </View>
                    <Text style={aws.heroMetaLabel} numberOfLines={1}>
                      SUPPLIER: <Text style={aws.heroMetaValue}>{supplierName}</Text>
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={[aws.routeRow, phone && aws.routeRowPhone]}>
                <View
                  style={[
                    aws.routeEndpoint,
                    phone && aws.routeEndpointPhone,
                  ]}
                >
                  <Text
                    style={[aws.routeCity, phone && aws.routeCityMobile]}
                    numberOfLines={1}
                  >
                    {origin}
                  </Text>
                  <Text style={aws.routeSub}>ORIGIN</Text>
                </View>
                <View style={[aws.routeCenter, phone && aws.routeCenterPhone]}>
                  <View style={[aws.routeLine, phone && aws.routeLinePhone]}>
                    <View style={aws.routeLineFill} />
                    <View style={[aws.routeDot, phone && aws.routeDotPhone]}>
                      <Text style={[aws.routeDotText, phone && { fontSize: 10 }]}>
                        {driverInitial}
                      </Text>
                    </View>
                  </View>
                </View>
                <View
                  style={[
                    aws.routeEndpoint,
                    aws.routeEndpointEnd,
                    phone && aws.routeEndpointPhone,
                  ]}
                >
                  <Text
                    style={[
                      aws.routeCity,
                      aws.routeCityEnd,
                      phone && aws.routeCityMobile,
                    ]}
                    numberOfLines={1}
                  >
                    {destination}
                  </Text>
                  <Text style={[aws.routeSub, aws.routeSubEnd]}>DESTINATION</Text>
                </View>
              </View>
            </View>

            <View style={[aws.metricsBox, compact && aws.metricsBoxMobile]}>
              <View style={[aws.metricCell, compact && aws.metricCellMobile]}>
                <Text style={aws.metricLabel}>Range</Text>
                <Text style={aws.metricValue} numberOfLines={1}>
                  {range}
                </Text>
              </View>
              <View style={[aws.metricCell, compact && aws.metricCellMobile]}>
                <Text style={aws.metricLabel}>ETA</Text>
                <Text style={aws.metricValue} numberOfLines={1}>
                  {eta}
                </Text>
              </View>
              <View
                style={[
                  aws.metricCell,
                  aws.metricCellLast,
                  compact && aws.metricCellMobile,
                ]}
              >
                <Text style={aws.metricLabel}>Status</Text>
                <Text style={aws.metricValueWarn} numberOfLines={1}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

            {showPartyPanels ? (
            <View style={[aws.dualGrid, mobileFullPage ? aws.dualGridMobile : aws.dualGridDesktop, panelScope !== "both" && aws.dualGridSingle]}>
              {panelScope !== "vehicle" ? (
              <View style={[aws.panel, mobileFullPage ? aws.panelMobile : aws.panelDesktop, panelScope === "driver" && aws.panelSingle]}>
                <AssignmentPartySignalCard
                  kind="driver"
                  name={driverDisplayName}
                  meta={driverPhoneDisplay}
                  tripLabel={tripLabel}
                  action={driverAction}
                  desktop={wide}
                  assigned={
                    Boolean((trip.driver_id ?? "").trim()) ||
                    Boolean(
                      driverDisplayName.trim() &&
                        !["unassigned", "select driver"].includes(
                          driverDisplayName.trim().toLowerCase(),
                        ),
                    )
                  }
                  onEdit={() => {
                    const next = driverAction === "EDIT" ? "PREVIEW" : "EDIT";
                    onDriverActionChange(next);
                    if (panelScope === "both" && next !== "PREVIEW") {
                      onVehicleActionChange("PREVIEW");
                    }
                  }}
                  onSwap={() => {
                    const next = driverAction === "SWAP" ? "PREVIEW" : "SWAP";
                    onDriverActionChange(next);
                    if (panelScope === "both" && next !== "PREVIEW") {
                      onVehicleActionChange("PREVIEW");
                    }
                  }}
                />
                {driverAction !== "PREVIEW" ? (
                <View style={[aws.panelBody, wide && aws.panelBodyDesktop]}>
                  <View style={aws.fieldsArea}>
                    {driverPanelBody}
                  </View>
                </View>
                ) : null}
              </View>
              ) : null}

              {panelScope !== "driver" ? (
              <View style={[aws.panel, mobileFullPage ? aws.panelMobile : aws.panelDesktop, panelScope === "vehicle" && aws.panelSingle]}>
                <AssignmentPartySignalCard
                  kind="vehicle"
                  name={vehicleDisplayLabel}
                  meta={vehicleCategory}
                  tripLabel={tripLabel}
                  action={vehicleAction}
                  desktop={wide}
                  assigned={
                    Boolean((trip.vehicle_id ?? "").trim()) ||
                    Boolean(
                      vehicleDisplayLabel.trim() &&
                        !["unassigned", "select vehicle"].includes(
                          vehicleDisplayLabel.trim().toLowerCase(),
                        ),
                    )
                  }
                  onEdit={() => {
                    const next = vehicleAction === "EDIT" ? "PREVIEW" : "EDIT";
                    onVehicleActionChange(next);
                    if (panelScope === "both" && next !== "PREVIEW") {
                      onDriverActionChange("PREVIEW");
                    }
                  }}
                  onSwap={() => {
                    const next = vehicleAction === "SWAP" ? "PREVIEW" : "SWAP";
                    onVehicleActionChange(next);
                    if (panelScope === "both" && next !== "PREVIEW") {
                      onDriverActionChange("PREVIEW");
                    }
                  }}
                />
                {vehicleAction !== "PREVIEW" ? (
                <View style={[aws.panelBody, wide && aws.panelBodyDesktop]}>
                  <View style={aws.fieldsArea}>
                    {vehiclePanelBody}
                  </View>
                </View>
                ) : null}
              </View>
              ) : null}
            </View>
            ) : null}

            {resolvedWizardStep === "details" ? (
              <View style={[aws.auditCard, compact && aws.auditCardMobile]}>
                <View style={[aws.auditSubmitWrap, compact && aws.auditSubmitWrapMobile]}>
                  <TouchableOpacity
                    style={[
                      aws.confirmBtn,
                      compact && aws.confirmBtnMobile,
                      (confirmDisabled || confirmLoading) && aws.confirmBtnDisabled,
                    ]}
                    onPress={onContinue}
                    disabled={confirmDisabled || confirmLoading || !onContinue}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={continueLabel}
                  >
                    <Text
                      style={[aws.confirmBtnText, phone && aws.confirmBtnTextPhone]}
                    >
                      {continueLabel}
                    </Text>
                  </TouchableOpacity>
                  {confirmHint ? (
                    <Text
                      style={[
                        aws.infoBody,
                        { marginTop: 8, color: Theme.textMuted },
                        phone && aws.confirmHintPhone,
                      ]}
                    >
                      {confirmHint}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {showReasonStep ? (
            <View style={[aws.auditCard, compact && aws.auditCardMobile]}>
              <View style={[aws.auditHeader, compact && aws.auditHeaderMobile]}>
                <View style={aws.auditTitleRow}>
                  <FontAwesome
                    name="check-square-o"
                    size={14}
                    color={Theme.assignmentVehicleAccent}
                  />
                  <Text style={[aws.auditTitle, compact && aws.auditTitleMobile]}>
                    Why this change
                  </Text>
                </View>
                {!phone ? (
                  <Text style={aws.auditId}>{tripLabel}</Text>
                ) : null}
              </View>

              {resolvedWizardStep === "reason" ? (
                <View style={{ gap: 10, marginBottom: 12 }}>
                  {onWizardBack ? (
                    <TouchableOpacity
                      onPress={onWizardBack}
                      accessibilityRole="button"
                      accessibilityLabel="Back to edit"
                      style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Theme.primary }}>
                        Back
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <View
                    style={{
                      borderRadius: 12,
                      backgroundColor: Theme.surface,
                      padding: 12,
                      gap: 4,
                    }}
                  >
                    {panelScope !== "vehicle" ? (
                      <>
                        <Text style={{ fontSize: 12, color: Theme.textSecondary }}>Driver</Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: Theme.textPrimaryDark,
                          }}
                        >
                          {driverDisplayName}
                        </Text>
                        {driverPhoneDisplay ? (
                          <Text style={{ fontSize: 13, color: Theme.textSecondary }}>
                            {driverPhoneDisplay}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                    {panelScope !== "driver" ? (
                      <>
                        <Text
                          style={{
                            fontSize: 12,
                            color: Theme.textSecondary,
                            marginTop: panelScope === "both" ? 8 : 0,
                          }}
                        >
                          Vehicle
                        </Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: Theme.textPrimaryDark,
                          }}
                        >
                          {vehicleDisplayLabel}
                        </Text>
                        {vehicleCategory ? (
                          <Text style={{ fontSize: 13, color: Theme.textSecondary }}>
                            {vehicleCategory}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View style={aws.auditReasonBlock}>
                <Text style={aws.fieldLabel}>Reason</Text>
                <View style={aws.selectLike}>
                  <Text style={aws.selectLikeText} numberOfLines={1}>
                    {CHANGE_REASONS.find((r) => r.value === changeReason)?.label}
                  </Text>
                </View>
                <ReasonChipsRow
                  value={changeReason}
                  onChange={onChangeReasonChange}
                />
              </View>

              <View style={[aws.auditGrid, compact && aws.auditGridMobile]}>
                <View style={[aws.auditRemarks, compact && aws.auditFieldMobile]}>
                  <Text style={aws.fieldLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[aws.input, compact && aws.inputMobile]}
                    value={changeRemarks}
                    onChangeText={onChangeRemarksChange}
                    placeholder="Optional note for the team"
                    placeholderTextColor={Theme.textMuted}
                    multiline={compact}
                    numberOfLines={compact ? 3 : 1}
                  />
                </View>

                <View style={[aws.auditSubmitWrap, compact && aws.auditSubmitWrapMobile]}>
                  {confirmPreview && resolvedWizardStep !== "reason" ? (
                    <View style={{ gap: 10, width: "100%" }}>
                      <Text style={aws.fieldLabel}>Preview</Text>
                      <View
                        style={{
                          borderRadius: 12,
                          backgroundColor: Theme.surface,
                          padding: 12,
                          gap: 8,
                        }}
                      >
                        {confirmPreview.scope !== "vehicle" ? (
                          <>
                        <Text style={{ fontSize: 13, color: Theme.textSecondary }}>
                          Driver
                        </Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: Theme.textPrimaryDark,
                          }}
                        >
                          {confirmPreview.driverName}
                        </Text>
                        {confirmPreview.driverPhone ? (
                          <Text style={{ fontSize: 13, color: Theme.textSecondary }}>
                            {confirmPreview.driverPhone}
                          </Text>
                        ) : null}
                          </>
                        ) : null}
                        {confirmPreview.scope !== "driver" ? (
                          <>
                        <Text
                          style={{
                            fontSize: 13,
                            color: Theme.textSecondary,
                            marginTop: confirmPreview.scope === "vehicle" ? 0 : 4,
                          }}
                        >
                          Vehicle
                        </Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: Theme.textPrimaryDark,
                          }}
                        >
                          {confirmPreview.vehiclePlate}
                        </Text>
                        {confirmPreview.vehicleType ? (
                          <Text style={{ fontSize: 13, color: Theme.textSecondary }}>
                            {confirmPreview.vehicleType}
                          </Text>
                        ) : null}
                          </>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity
                          onPress={confirmPreview.onEdit}
                          style={[
                            aws.confirmBtn,
                            { flex: 1, backgroundColor: Theme.cardWhite },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Edit assignment"
                        >
                          <Text
                            style={[aws.confirmBtnText, { color: Theme.textPrimaryDark }]}
                          >
                            Edit
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={confirmPreview.onConfirm}
                          disabled={confirmLoading}
                          style={[
                            aws.confirmBtn,
                            { flex: 1 },
                            confirmLoading && aws.confirmBtnDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm assignment"
                        >
                          <Text style={aws.confirmBtnText}>
                            {confirmLoading ? "Saving…" : "Confirm"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {confirmHint ? (
                        <Text
                          style={[
                            aws.infoBody,
                            { marginTop: 4, color: Theme.textMuted },
                            phone && aws.confirmHintPhone,
                          ]}
                        >
                          {confirmHint}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <>
                  <TouchableOpacity
                    style={[
                      aws.confirmBtn,
                      compact && aws.confirmBtnMobile,
                      (confirmDisabled || confirmLoading) && aws.confirmBtnDisabled,
                    ]}
                    onPress={onConfirm}
                    disabled={confirmDisabled || confirmLoading}
                    activeOpacity={0.9}
                  >
                    <FontAwesome
                      name="save"
                      size={14}
                      color={Theme.networkHubListCardOnlineDot}
                    />
                    <Text
                      style={[aws.confirmBtnText, phone && aws.confirmBtnTextPhone]}
                      numberOfLines={2}
                    >
                      {confirmLoading ? "Saving…" : confirmLabel}
                    </Text>
                  </TouchableOpacity>
                  {confirmHint ? (
                    <Text
                      style={[
                        aws.infoBody,
                        { marginTop: 8, color: Theme.textMuted },
                        phone && aws.confirmHintPhone,
                      ]}
                    >
                      {confirmHint}
                    </Text>
                  ) : null}
                    </>
                  )}
                </View>
              </View>
            </View>
            ) : null}
      </ScrollView>

      {toastMessage ? (
        <View style={aws.toast} pointerEvents="none">
          <FontAwesome
            name="check-circle"
            size={16}
            color={Theme.networkHubListCardOnlineDot}
          />
          <Text style={aws.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <Modal
        visible={showAuditDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuditDrawer(false)}
      >
        <Pressable
          style={aws.drawerBackdrop}
          onPress={() => setShowAuditDrawer(false)}
        >
          <Pressable
            style={[aws.drawer, { paddingTop: insets.top + 12 }]}
            onPress={(e) => {
              // Prevent backdrop close when interacting with drawer content (web).
              if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
                e.stopPropagation();
              }
            }}
          >
            <View>
              <View style={aws.drawerHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={aws.iconBtn}>
                    <FontAwesome name="history" size={14} color={Theme.textSecondary} />
                  </View>
                  <View>
                    <Text style={aws.drawerTitle}>{tripLabel} activity log</Text>
                    <Text style={aws.drawerSub}>Recent assignment changes</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={aws.iconBtn}
                  onPress={() => setShowAuditDrawer(false)}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="close" size={14} color={Theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={aws.timeline}>
                {defaultActivity.map((item, idx) => (
                  <View key={`${item.title}-${idx}`} style={{ position: "relative" }}>
                    <View
                      style={[
                        aws.timelineDot,
                        {
                          backgroundColor:
                            item.tone === "ok"
                              ? Theme.networkHubListCardOnlineDot
                              : Theme.assignmentVehicleAccent,
                        },
                      ]}
                    />
                    <Text style={aws.timelineTime}>{item.time}</Text>
                    <Text style={aws.timelineTitle}>{item.title}</Text>
                    <Text style={aws.timelineBody}>{item.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={aws.drawerClose}
              onPress={() => setShowAuditDrawer(false)}
              activeOpacity={0.85}
            >
              <Text style={aws.drawerCloseText}>Close activity window</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
