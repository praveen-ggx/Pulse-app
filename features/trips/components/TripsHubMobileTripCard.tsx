/**
 * Mobile trips hub — MakeMyTrip “My Trips” ticket card (single white surface, no nested panels).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  DriverOfflineGlow,
  TripHubDriverPresenceBadge,
} from "@/features/trips/components/TripHubDriverPresenceBadge";
import { TripPodStatusTags } from "@/features/trips/components/TripPodStatusTags";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  HUB_GRID_CARD_MIN_HEIGHT,
  HUB_GRID_DIVIDER_MARGIN_BOTTOM,
  HUB_GRID_DIVIDER_MARGIN_TOP,
  HUB_CARD_HEAD_AVATAR,
  HUB_CARD_PARTY_CHIP_AVATAR,
  HUB_CARD_HEAD_LEFT_GAP,
  HUB_GRID_HEAD_MARGIN_BOTTOM,
  HUB_GRID_PARTY_MIN_HEIGHT,
  HUB_GRID_ROUTE_MIN_HEIGHT,
} from "@/components/hub/hubGridCardLayout";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { formatIndianVehicleNumber } from "@/lib/format";
import { assignedVehiclePlate } from "@/features/trips/utils/tripAssignmentVehicle.util";
import type { ReactNode } from "react";
import { memo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

const WEB_TRANSITION: ViewStyle | null =
  Platform.OS === "web"
    ? ({
        transitionDuration: "140ms",
        transitionProperty: "background-color, border-color, box-shadow, transform",
        transitionTimingFunction: "ease",
      } as ViewStyle)
    : null;

function isHovered(state: HoverPressState): boolean {
  return Boolean(state.hovered) || state.pressed;
}

import {
  HUB_MOBILE_LIST_CANVAS_BG,
  HUB_MOBILE_TICKET_REF,
  HubMobileListCanvas,
  hubMobileListCanvasStyles,
} from "@/components/hub";

/** Page/list strip — transparent (cards provide their own white surface). */
export const MOBILE_TRIP_CANVAS_BG = HUB_MOBILE_LIST_CANVAS_BG;

const REF = HUB_MOBILE_TICKET_REF;
const ROUTE_ARROW_TOP = 2;
const ROUTE_VIA_CAPTION_LINE = 12;
const ROUTE_PIN_SIZE = 8;
const CHIP_AVATAR = HUB_CARD_PARTY_CHIP_AVATAR;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function HubCardRefMeta({
  tripNo,
  scheduleLine,
  secondaryLabel,
}: {
  tripNo: string;
  scheduleLine: string;
  secondaryLabel?: string | null;
}) {
  return (
    <View
      style={styles.refBlock}
      accessibilityLabel={`${tripNo}, ${scheduleLine}`}
    >
      <Text style={styles.refId} numberOfLines={1}>
        {tripNo}
      </Text>
      <Text style={styles.refMuted} numberOfLines={1}>
        {scheduleLine}
        {secondaryLabel ? ` · ${asLabel(secondaryLabel)}` : ""}
      </Text>
    </View>
  );
}

function HubLrChip({
  lrLabel,
  canEditLr,
  onPressLr,
}: {
  lrLabel?: string | null;
  canEditLr?: boolean;
  onPressLr?: () => void;
}) {
  const lrText = (lrLabel ?? "").trim();
  if (!lrText && !canEditLr) return null;
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPressLr?.();
      }}
      {...(Platform.OS === "web"
        ? {
            onClick: (event: { stopPropagation: () => void }) => {
              event.stopPropagation();
            },
          }
        : null)}
      disabled={!canEditLr && !lrText}
      style={({ pressed }) => [
        styles.lrChip,
        canEditLr && WEB_POINTER,
        pressed && canEditLr && styles.lrSlotPressed,
      ]}
      accessibilityRole={canEditLr ? "button" : "text"}
      accessibilityLabel={
        lrText ? `LR ${lrText}${canEditLr ? ", update" : ""}` : "Add LR number"
      }
    >
      <Text style={styles.lrChipKicker}>LR</Text>
      <Text style={[styles.lrChipValue, !lrText && styles.lrValueEmpty]} numberOfLines={1}>
        {lrText || "Add LR"}
      </Text>
    </Pressable>
  );
}

/** Asset label under client only; supplier/driver use the chip row. */
export function mobileTripClientSubline(isAssetTrip: boolean, typeLabel: string): string | null {
  if (!isAssetTrip) return null;
  const type = asLabel(typeLabel);
  return type === "—" ? null : type;
}

/** Left party chip on asset trips — assigned vehicle plate, not the ASSET type label. */
export function mobileTripAssetVehicleChipLabel(
  trip: Pick<TripRow, "vehicle_display_number">,
  unassignedLabel: string,
): string {
  const formatted = formatIndianVehicleNumber(
    trip.vehicle_display_number ?? "",
  ).trim();
  if (formatted) return formatted;
  const raw = String(trip.vehicle_display_number ?? "").trim();
  if (raw) return raw;
  return unassignedLabel;
}

export function mobileTripSupplierChipLabel(
  options: {
    isAssetTrip: boolean;
    typeLabel: string;
    supplierName?: string;
    showSupplierParty?: boolean;
    awaitingLabel: string;
    trip?: Pick<TripRow, "vehicle_display_number">;
    vehicleUnassignedLabel?: string;
  },
): string {
  if (options.isAssetTrip && options.trip) {
    return mobileTripAssetVehicleChipLabel(
      options.trip,
      options.vehicleUnassignedLabel ?? options.awaitingLabel,
    );
  }
  if (options.isAssetTrip) return asLabel(options.typeLabel);
  if (options.showSupplierParty) {
    const supplier = asLabel(options.supplierName);
    if (supplier !== "—") return supplier;
    return options.awaitingLabel;
  }
  return asLabel(options.typeLabel);
}

export function mobileTripDriverChipLabel(
  trip: TripRow,
  displayDriverName: string | undefined,
  unassignedLabel: string,
): string {
  const resolved = asLabel(displayDriverName);
  if (resolved !== "—" && !/^driver$/i.test(resolved.trim())) return resolved;
  const fromTrip = asLabel(trip.driver_display_name);
  if (fromTrip !== "—" && !/^driver$/i.test(fromTrip.trim())) return fromTrip;
  return unassignedLabel;
}

function formatPartyName(value: string): string {
  return asLabel(value).toUpperCase();
}

function PartyChip({
  name,
  entityType,
  avatarUrl,
  avatarSeed,
  initialsColorSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  isIntegrated,
  alignEnd,
  presencePing,
  vehiclePlate,
}: {
  name: string;
  entityType: "supplier" | "driver";
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  initialsColorSeed?: string;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  alignEnd?: boolean;
  presencePing?: TripHubInTransitPingMeta | null;
  vehiclePlate?: string | null;
}) {
  const label = formatPartyName(name);
  const plate = (vehiclePlate ?? "").trim();
  const showPlate = Boolean(plate);
  const stacked = showPlate;

  return (
    <View
      style={[
        styles.chip,
        alignEnd && styles.chipEnd,
        stacked ? styles.chipStacked : styles.chipSingle,
      ]}
    >
      <DriverOfflineGlow
        active={entityType === "driver" && Boolean(presencePing) && !presencePing?.isOnline}
        size={CHIP_AVATAR}
      >
        <PartyAvatar
          name={label}
          initialsColorSeed={initialsColorSeed}
          organizationImageUrl={organizationImageUrl}
          organizationAvatarSeed={organizationAvatarSeed}
          avatarUrl={avatarUrl}
          avatarSeed={avatarSeed}
          entityType={entityType}
          isIntegrated={isIntegrated}
          size={CHIP_AVATAR}
        />
      </DriverOfflineGlow>
      <View
        style={[
          styles.chipCopy,
          alignEnd && styles.chipCopyEnd,
          stacked ? styles.chipCopyStacked : styles.chipCopySingle,
        ]}
      >
        <Text
          style={[styles.chipName, alignEnd && styles.chipNameEnd]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {showPlate ? (
          <Text
            style={[styles.chipPlate, alignEnd && styles.chipNameEnd]}
            numberOfLines={1}
            accessibilityLabel={`Vehicle ${plate}`}
          >
            {plate}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export { splitTripLocationParts } from "@/features/trips/utils/tripLocationDisplay.util";

/** Matches a date-only value (`YYYY-MM-DD`) with no time component. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatMobileTripSchedule(iso: string | null | undefined): {
  /** Empty when the source value carries no time of day. */
  time: string;
  dateLine: string;
  /** Pre-joined `time · date` (or just the date when there is no time). */
  scheduleLine: string;
} {
  const raw = iso?.trim();
  if (!raw) return { time: "—", dateLine: "—", scheduleLine: "—" };
  try {
    // A bare `YYYY-MM-DD` parses as midnight UTC, which renders as 05:30 in
    // en-IN. Those columns hold no time of day, so parse as local and omit it.
    const dateOnly = DATE_ONLY_RE.test(raw);
    const d = dateOnly ? new Date(`${raw}T00:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime()))
      return { time: "—", dateLine: "—", scheduleLine: "—" };
    const time = dateOnly
      ? ""
      : d.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
    const dateLine = d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
    return {
      time,
      dateLine,
      scheduleLine: time ? `${time} · ${dateLine}` : dateLine,
    };
  } catch {
    return { time: "—", dateLine: "—", scheduleLine: "—" };
  }
}

/** @deprecated Use `HubMobileListCanvas` from `@/components/hub`. */
export function TripsHubMobileTripListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <HubMobileListCanvas style={style}>{children}</HubMobileListCanvas>;
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
  dense,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
  dense?: boolean;
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text
            style={[
              styles.legCity,
              dense && styles.legCityDense,
              end && styles.textEnd,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              dense && styles.legStateDense,
              end && styles.textEnd,
              !state && styles.legStatePlaceholder,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state || "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

export type TripsHubMobileTripCardProps = {
  trip: TripRow;
  displayClientName: string;
  displaySupplierName?: string;
  displayDriverName?: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientAvatarFallbackSeed?: string;
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierAvatarFallbackSeed?: string;
  supplierOrganizationImageUrl?: string | null;
  supplierOrganizationAvatarSeed?: string | null;
  clientIntegrated?: boolean;
  supplierIntegrated?: boolean;
  driverAvatarUrl?: string | null;
  driverAvatarSeed?: string | null;
  driverAvatarFallbackSeed?: string;
  stageLabel: string;
  /** Hub asset vs aggregate pill (`tripAsset` / `tripAggregate`). */
  isAssetTrip?: boolean;
  typeLabel?: string;
  showSupplierParty?: boolean;
  missionStatus?: string;
  pickupIso?: string | null;
  origin: string;
  dest: string;
  onPress: () => void;
  tr: (key: string) => string;
  /** Footer slot (grid toolbar) — outside pressable body. */
  actions?: ReactNode;
  dense?: boolean;
  fillGrid?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Viewer org id — used to show BKG ref instead of TRP001 for cross-org supplier trips. */
  viewerOrgId?: string | null;
  /** Distinguishes mover asset job vs shipper settlement tile (same TRP code). */
  secondaryLabel?: string | null;
  /** Last ping time / offline for in-transit trips (no location line). */
  inTransitPing?: TripHubInTransitPingMeta | null;
  softPodReceived?: boolean;
  hardPodReceived?: boolean;
  /** Override origin tags (e.g. NETWORK / MARKETPLACE on unallocated indents). */
  originTags?: string[];
  /** Override the ref line (indent operational code). */
  displayNumber?: string;
  /** Hide supplier/driver chips for pre-trip indent cards. */
  hidePartyRow?: boolean;
  /** Load spec under the route (vehicle · weight · material). */
  specLine?: string | null;
  /** Small caption above the route arrow, e.g. "+1 stop" for multi-stop FTL. */
  routeViaLabel?: string | null;
  /** Stop names under the arrow, shown only with `routeViaLabel`. */
  routeViaDetail?: string | null;
  /** Vault LR number(s) for the bottom-right slot. */
  lrLabel?: string | null;
  /** Completed E-LR number — omitted until the receipt is generated. */
  elrLabel?: string | null;
  canEditLr?: boolean;
  onPressLr?: () => void;
  /** Last trip the viewer opened — outlined so ops can find their place. */
  highlighted?: boolean;
};

export const TripsHubMobileTripCard = memo(function TripsHubMobileTripCard({
  trip,
  displayClientName,
  displaySupplierName = "",
  displayDriverName = "",
  clientAvatarUrl,
  clientAvatarSeed,
  clientAvatarFallbackSeed,
  clientOrganizationImageUrl,
  clientOrganizationAvatarSeed,
  supplierAvatarUrl,
  supplierAvatarSeed,
  supplierAvatarFallbackSeed,
  supplierOrganizationImageUrl,
  supplierOrganizationAvatarSeed,
  clientIntegrated,
  supplierIntegrated,
  driverAvatarUrl,
  driverAvatarSeed,
  driverAvatarFallbackSeed,
  stageLabel,
  isAssetTrip = false,
  typeLabel = "",
  showSupplierParty = false,
  pickupIso,
  origin,
  dest,
  onPress,
  tr,
  actions,
  dense = false,
  fillGrid = false,
  style,
  viewerOrgId,
  secondaryLabel = null,
  inTransitPing,
  softPodReceived = false,
  hardPodReceived = false,
  originTags,
  displayNumber,
  hidePartyRow = false,
  specLine = null,
  routeViaLabel = null,
  routeViaDetail = null,
  lrLabel = null,
  elrLabel = null,
  canEditLr = false,
  onPressLr,
  highlighted = false,
}: TripsHubMobileTripCardProps) {
  const tripNo = asLabel(
    displayNumber?.trim() || getTripDisplayNumber(trip, viewerOrgId),
  );
  const schedule = formatMobileTripSchedule(
    pickupIso ?? trip.pickup_date ?? trip.created_at,
  );
  const clientName = asLabel(displayClientName);
  const resolvedTypeLabel = typeLabel || tr("tripAggregate");
  const clientSubline = mobileTripClientSubline(isAssetTrip, resolvedTypeLabel);
  const supplierChipName = mobileTripSupplierChipLabel({
    isAssetTrip,
    typeLabel: resolvedTypeLabel,
    supplierName: displaySupplierName,
    showSupplierParty,
    awaitingLabel: tr("tripsHubAwaitingData"),
    trip,
    vehicleUnassignedLabel: tr("unassigned"),
  });
  const driverChipName = mobileTripDriverChipLabel(
    trip,
    displayDriverName,
    tr("unassigned"),
  );
  const driverVehiclePlate = (() => {
    const raw = assignedVehiclePlate({
      vehicleDisplayNumber: trip.vehicle_display_number,
      vehicleNumber: (trip as { vehicle_number?: string | null }).vehicle_number,
    });
    if (!raw) return "";
    return formatIndianVehicleNumber(raw).trim() || raw;
  })();
  const elrNumber = (elrLabel ?? "").trim() || null;
  const clientFb =
    (clientAvatarFallbackSeed ?? "").trim() ||
    (trip.client_id
      ? `client-entity:${String(trip.client_id).trim()}`
      : `client-trip:${trip.id}`);
  const supplierFb =
    (supplierAvatarFallbackSeed ?? "").trim() ||
    (trip.supplier_id
      ? `supplier-entity:${String(trip.supplier_id).trim()}`
      : `supplier-trip:${trip.id}`);
  const vehicleFb = trip.vehicle_id
    ? `vehicle-entity:${String(trip.vehicle_id).trim()}`
    : `vehicle-trip:${trip.id}`;
  const leftChipEntityType = isAssetTrip ? "driver" : "supplier";
  const leftChipAvatarUrl = isAssetTrip ? undefined : supplierAvatarUrl;
  const leftChipAvatarSeed = isAssetTrip ? undefined : supplierAvatarSeed;
  const leftChipInitialsSeed = isAssetTrip ? vehicleFb : supplierFb;
  const leftChipOrgImageUrl = isAssetTrip
    ? undefined
    : supplierOrganizationImageUrl;
  const leftChipOrgAvatarSeed = isAssetTrip
    ? undefined
    : supplierOrganizationAvatarSeed;
  const driverFb =
    (driverAvatarFallbackSeed ?? "").trim() ||
    (trip.driver_id
      ? `driver-entity:${String(trip.driver_id).trim()}`
      : `driver-trip:${trip.id}`);
  const stageUpper = asLabel(stageLabel).toUpperCase();
  /** Product term: Indent = created from indent→trip; Direct = created as a trip. */
  const fromIndent = isLoadBasedTrip(trip);
  const originTagItems = (
    originTags !== undefined
      ? originTags
      : [fromIndent ? tr("tripOriginIndent") : tr("tripOriginDirect")]
  ).map((label) => asLabel(label).toUpperCase());
  const originTagJoined = originTagItems.join(" ");
  const showFooterBar = Boolean(actions);
  const refMeta = (
    <HubCardRefMeta
      tripNo={tripNo}
      scheduleLine={schedule.scheduleLine}
      secondaryLabel={secondaryLabel}
    />
  );
  const bottomRef = (
    <View style={styles.refRow}>
      {refMeta}
      <HubLrChip lrLabel={lrLabel} canEditLr={canEditLr} onPressLr={onPressLr} />
    </View>
  );

  const [hovered, setHovered] = useState(false);
  const cardActive = hovered;

  return (
    <View
      style={[
        styles.cardWrap,
        fillGrid && styles.cardWrapGrid,
        style,
      ]}
    >
      <View
        style={[
          styles.card,
          WEB_TRANSITION,
          fillGrid && styles.cardGrid,
          fillGrid && styles.cardGridElevated,
          cardActive && styles.cardHover,
          highlighted && styles.cardHighlighted,
        ]}
      >
        <Pressable
          onPress={onPress}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={(state: HoverPressState) => [
            styles.body,
            WEB_POINTER,
            dense && styles.bodyDense,
            fillGrid && styles.bodyGrid,
            showFooterBar && styles.bodyWithFooter,
            isHovered(state) && styles.bodyPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${tripNo} ${clientName}, ${originTagJoined}, ${asLabel(origin)} to ${asLabel(dest)}${routeViaLabel ? `, ${routeViaLabel} in between${routeViaDetail ? `: ${routeViaDetail}` : ""}` : ""}`}
        >
          <View style={[styles.head, fillGrid && styles.headGrid]}>
            <View
              style={[
                styles.headLeft,
                clientSubline || originTagItems.length > 0
                  ? styles.headLeftStacked
                  : styles.headLeftSingle,
              ]}
            >
              <PartyAvatar
                name={clientName}
                initialsColorSeed={clientFb}
                organizationImageUrl={clientOrganizationImageUrl}
                organizationAvatarSeed={clientOrganizationAvatarSeed}
                avatarUrl={clientAvatarUrl}
                avatarSeed={clientAvatarSeed}
                entityType="client"
                isIntegrated={clientIntegrated}
                size={HUB_CARD_HEAD_AVATAR}
              />
              <View
                style={[
                  styles.headText,
                  clientSubline || originTagItems.length > 0
                    ? styles.headTextStacked
                    : styles.headTextSingle,
                ]}
              >
                <Text style={styles.brand} numberOfLines={1}>
                  {formatPartyName(clientName)}
                </Text>
                {clientSubline ? (
                  <Text style={styles.partnerSubline} numberOfLines={1}>
                    {formatPartyName(clientSubline)}
                  </Text>
                ) : null}
                {originTagItems.length > 0 ? (
                  <View style={styles.originTagsRow}>
                    {originTagItems.map((tag) => {
                      const indentLook = tag === "INDENT" || tag === "NETWORK";
                      return (
                        <View
                          key={tag}
                          style={[
                            styles.originTag,
                            indentLook
                              ? styles.originTagIndent
                              : styles.originTagDirect,
                          ]}
                          accessibilityLabel={`Created from ${tag}`}
                        >
                          <Text
                            style={[
                              styles.originTagText,
                              indentLook
                                ? styles.originTagTextIndent
                                : styles.originTagTextDirect,
                            ]}
                            numberOfLines={1}
                          >
                            {tag}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <View style={styles.headMetaRow}>
                {elrNumber ? (
                  <View style={styles.elrChip} accessibilityLabel={`E-LR ${elrNumber}`}>
                    <Text style={styles.elrChipKicker}>E-LR</Text>
                    <Text style={styles.elrChipValue} numberOfLines={1}>
                      {elrNumber}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.headStatusCluster}>
                  <Text style={styles.headMeta} numberOfLines={1}>
                    {stageUpper}
                  </Text>
                  {inTransitPing ? (
                    <TripHubDriverPresenceBadge ping={inTransitPing} />
                  ) : null}
                </View>
              </View>
              {trip.is_commerce ? (
                <View style={styles.commerceTag} accessibilityLabel="Originated from Pulse Commerce">
                  <Text style={styles.commerceTagText} numberOfLines={1}>
                    COMMERCE
                  </Text>
                </View>
              ) : null}
              {tripIsDeliveredStatus(trip.status, stageLabel) ? (
                <TripPodStatusTags
                  compact
                  softCopyReceived={softPodReceived}
                  hardCopyReceived={hardPodReceived}
                />
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.route,
              dense && styles.routeDense,
              fillGrid && styles.routeGrid,
              routeViaLabel ? styles.routeWithVia : null,
            ]}
          >
            <RouteLeg
              location={origin}
              variant="origin"
              align="left"
              dense={dense || fillGrid}
            />
            <View style={[styles.routeMid, routeViaLabel ? styles.routeMidVia : null]}>
              {routeViaLabel ? (
                <Text style={styles.routeViaCaption} numberOfLines={1}>
                  {routeViaLabel}
                </Text>
              ) : null}
              <Text style={styles.routeArrow}>→</Text>
              {routeViaLabel && routeViaDetail ? (
                <Text style={styles.routeViaDetail} numberOfLines={2}>
                  {routeViaDetail}
                </Text>
              ) : null}
            </View>
            <RouteLeg
              location={dest}
              variant="dest"
              align="right"
              dense={dense || fillGrid}
            />
          </View>
          {specLine ? (
            <Text style={styles.specLine} numberOfLines={1}>
              {specLine}
            </Text>
          ) : null}

          {showFooterBar ? null : (
          <View style={[styles.divider, fillGrid && styles.dividerGrid]} />
          )}

          {fillGrid ? (
            <View style={styles.metaBlockGrid}>
              <View style={styles.metaBlockGridGrow} />
              {showFooterBar ? null : bottomRef}
              {hidePartyRow ? null : (
                <View style={[styles.partyRow, styles.partyRowGrid]}>
                  <PartyChip
                    name={supplierChipName}
                    entityType={leftChipEntityType}
                    avatarUrl={leftChipAvatarUrl}
                    avatarSeed={leftChipAvatarSeed}
                    initialsColorSeed={leftChipInitialsSeed}
                    organizationImageUrl={leftChipOrgImageUrl}
                    organizationAvatarSeed={leftChipOrgAvatarSeed}
                    isIntegrated={
                      leftChipEntityType === "supplier"
                        ? supplierIntegrated
                        : undefined
                    }
                  />
                  <PartyChip
                    name={driverChipName}
                    entityType="driver"
                    avatarUrl={driverAvatarUrl}
                    avatarSeed={driverAvatarSeed}
                    initialsColorSeed={driverFb}
                    alignEnd
                    presencePing={inTransitPing}
                    vehiclePlate={driverVehiclePlate}
                  />
                </View>
              )}
            </View>
          ) : (
            <>
              {showFooterBar ? null : bottomRef}
              {hidePartyRow ? null : (
                <View style={styles.partyRow}>
                  <PartyChip
                    name={supplierChipName}
                    entityType={leftChipEntityType}
                    avatarUrl={leftChipAvatarUrl}
                    avatarSeed={leftChipAvatarSeed}
                    initialsColorSeed={leftChipInitialsSeed}
                    organizationImageUrl={leftChipOrgImageUrl}
                    organizationAvatarSeed={leftChipOrgAvatarSeed}
                    isIntegrated={
                      leftChipEntityType === "supplier"
                        ? supplierIntegrated
                        : undefined
                    }
                  />
                  <PartyChip
                    name={driverChipName}
                    entityType="driver"
                    avatarUrl={driverAvatarUrl}
                    avatarSeed={driverAvatarSeed}
                    initialsColorSeed={driverFb}
                    alignEnd
                    presencePing={inTransitPing}
                    vehiclePlate={driverVehiclePlate}
                  />
                </View>
              )}
            </>
          )}
        </Pressable>
        {showFooterBar ? (
          <View
            style={[
              styles.cardFooter,
              dense && styles.cardFooterDense,
              fillGrid && styles.cardFooterGrid,
            ]}
          >
            <Pressable
              onPress={onPress}
              onHoverIn={() => setHovered(true)}
              onHoverOut={() => setHovered(false)}
              style={[styles.refBlockPress, WEB_POINTER]}
              accessibilityRole="button"
              accessibilityLabel={`${tripNo} ${clientName}, ${schedule.scheduleLine}`}
            >
              {refMeta}
            </Pressable>
            <View style={styles.actionsSlotFooter}>{actions}</View>
            <HubLrChip lrLabel={lrLabel} canEditLr={canEditLr} onPressLr={onPressLr} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
  },
  cardWrap: {
    ...hubMobileListCanvasStyles.cardWrap,
  },
  cardWrapGrid: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
  },
  cardHover: {
    backgroundColor: Theme.complianceSelectedWash,
  },
  cardHighlighted: {
    borderColor: Theme.primary,
    borderWidth: 2,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardGrid: {
    flex: 1,
    width: "100%",
    minHeight: HUB_GRID_CARD_MIN_HEIGHT,
    flexDirection: "column",
  },
  cardGridElevated: {
    borderRadius: 14,
    borderColor: "rgba(15, 23, 42, 0.08)",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        boxShadow:
          "0 12px 32px rgba(15, 23, 42, 0.09), 0 2px 8px rgba(15, 23, 42, 0.04)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.09,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  bodyDense: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  bodyGrid: {
    flex: 1,
    flexDirection: "column",
    paddingBottom: 12,
  },
  bodyWithFooter: {
    paddingBottom: 10,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: REF.hairline,
  },
  cardFooterDense: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  cardFooterGrid: {
    flexShrink: 0,
    marginTop: "auto",
  },
  refBlockPress: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  refRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },
  refBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  lrSlot: {
    flexShrink: 0,
    maxWidth: "46%",
    alignItems: "flex-end",
    gap: 2,
  },
  lrSlotPressed: { opacity: 0.75 },
  lrEyebrow: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0,
    color: REF.muted,
    textAlign: "right",
  },
  lrValue: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    color: REF.ink,
    textAlign: "right",
  },
  lrValueEmpty: {
    fontWeight: "500",
    color: Theme.primary,
  },
  actionsSlotFooter: {
    flexShrink: 0,
    alignSelf: "center",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionsSlot: {
    marginTop: "auto",
    width: "100%",
    minWidth: 0,
  },
  actionsSlotGrid: {
    flexShrink: 0,
    marginTop: 0,
  },
  metaBlockGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  metaBlockGridGrow: {
    flex: 1,
    minHeight: 0,
  },
  bodyPressed: {
    opacity: 0.98,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headGrid: {
    marginBottom: HUB_GRID_HEAD_MARGIN_BOTTOM,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: HUB_CARD_HEAD_LEFT_GAP,
  },
  headLeftSingle: {
    alignItems: "center",
  },
  headLeftStacked: {
    alignItems: "flex-start",
  },
  headText: {
    flex: 1,
    minWidth: 0,
    minHeight: HUB_CARD_HEAD_AVATAR,
  },
  headTextSingle: {
    justifyContent: "center",
  },
  headTextStacked: {
    justifyContent: "flex-start",
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  partnerSubline: {
    ...FinanceTxnTypography.partyTitle,
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 12,
    color: REF.muted,
    letterSpacing: 0.35,
    fontWeight: "400",
  },
  headMetaCol: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
    gap: 5,
  },
  headMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: "100%",
    minWidth: 0,
  },
  headStatusCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    minWidth: 0,
    flexShrink: 1,
    height: 16,
  },
  headMeta: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "500",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  lrElrRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 10,
    maxWidth: "100%",
    alignSelf: "flex-end",
  },
  lrChip: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 0,
    maxWidth: 120,
    gap: 1,
  },
  lrChipKicker: {
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 10,
    color: REF.muted,
    letterSpacing: 0,
  },
  lrChipValue: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    color: REF.ink,
    letterSpacing: 0,
    textAlign: "right",
  },
  elrChip: {
    alignItems: "flex-end",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 148,
    gap: 1,
  },
  elrChipKicker: {
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 10,
    color: Theme.primary,
    letterSpacing: 0,
  },
  elrChipValue: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    color: Theme.primary,
    letterSpacing: 0,
    textAlign: "right",
  },
  originTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    maxWidth: "100%",
    alignSelf: "flex-start",
  },
  originTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Indent = inverse of Direct: brown fill + blue border. */
  originTagIndent: {
    backgroundColor: Theme.primary,
    borderColor: Theme.brandBlue,
  },
  /** Direct = primary CTA language: blue fill + brown border. */
  originTagDirect: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
  },
  originTagText: {
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  originTagTextIndent: {
    color: Theme.textOnPrimary,
  },
  originTagTextDirect: {
    color: Theme.buttonPrimaryText,
  },
  /** Marks a Trip that originated from a Commerce execution plan. Text-based — not color-only. */
  commerceTag: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.muted,
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
  },
  commerceTagText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
    color: REF.muted,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  routeDense: {
    gap: 3,
  },
  routeGrid: {
    minHeight: HUB_GRID_ROUTE_MIN_HEIGHT,
    flexShrink: 0,
  },
  specLine: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: REF.muted,
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
    overflow: "hidden",
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: "flex-end",
  },
  legText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    ...Platform.select({
      web: { width: "100%" } as ViewStyle,
      default: {},
    }),
  },
  legTextEnd: {
    alignItems: "flex-end",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: REF.accent,
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
  legCity: {
    fontSize: 12,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.1,
    lineHeight: 15,
    textTransform: "uppercase",
    width: "100%",
  },
  legCityDense: {
    fontSize: 10,
    lineHeight: 13,
  },
  legState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    width: "100%",
  },
  legStateDense: {
    fontSize: 8,
    lineHeight: 11,
  },
  legStatePlaceholder: {
    opacity: 0,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    paddingTop: ROUTE_ARROW_TOP,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
  routeWithVia: {
    paddingTop: ROUTE_VIA_CAPTION_LINE,
  },
  routeMidVia: {
    width: 76,
    paddingTop: 0,
    marginTop: ROUTE_ARROW_TOP - ROUTE_VIA_CAPTION_LINE,
  },
  routeViaCaption: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: ROUTE_VIA_CAPTION_LINE,
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  routeViaDetail: {
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 11,
    color: REF.muted,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
    marginTop: 12,
    marginBottom: 10,
  },
  dividerGrid: {
    marginTop: HUB_GRID_DIVIDER_MARGIN_TOP,
    marginBottom: HUB_GRID_DIVIDER_MARGIN_BOTTOM,
    flexShrink: 0,
  },
  refId: {
    fontSize: 11,
    fontWeight: "600",
    color: REF.inkMid,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
  refMuted: {
    fontSize: 10,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 13,
    fontVariant: ["tabular-nums"],
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    minHeight: CHIP_AVATAR,
  },
  partyRowGrid: {
    marginTop: 4,
    minHeight: HUB_GRID_PARTY_MIN_HEIGHT,
    flexShrink: 0,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 6,
  },
  chipSingle: {
    alignItems: "center",
  },
  chipStacked: {
    alignItems: "center",
  },
  chipEnd: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
  },
  chipCopy: {
    flex: 1,
    minWidth: 0,
  },
  chipCopySingle: {
    justifyContent: "center",
  },
  chipCopyStacked: {
    justifyContent: "center",
  },
  chipCopyEnd: {
    alignItems: "flex-end",
  },
  chipName: {
    ...FinanceTxnTypography.partyTitle,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  chipNameEnd: {
    textAlign: "right",
  },
  chipPlate: {
    marginTop: 1,
    alignSelf: "stretch",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
});
