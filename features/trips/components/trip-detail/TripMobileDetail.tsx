/**
 * Mobile trip detail — Flipkart/Ajio order chrome.
 *
 * Flow (top → bottom), left edge locked to PAD:
 * 1. Status hero
 * 2. Route / freight card (inset)
 * 3. Progress timeline + Driver / Trip ID
 * 4. Track (+ Change assets)
 * 5. Delivery address
 * 6. Nested ops (live tracking / ratings)
 * 7. Footer Trip ID · Placed On
 * Money breakup lives on Finance (View Breakup).
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import { Feather } from "@expo/vector-icons";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getManifestCurrentStepIndex } from "@/features/trips/utils/manifestJourneyLog.util";
import { formatIndianVehicleNumber, formatINR } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phoneLookup";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { memo, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const WEB_COPY = Platform.select({
  web: { whiteSpace: "pre-wrap" as const, letterSpacing: 0 },
  default: {},
});

import * as Clipboard from "expo-clipboard";

const LINK = "#2874F0";
const TEAL = "#008C8C";
const CANVAS = "#F5F5F5";
const MUTED = "#9E9E9E";
const BODY = "#616161";
const INK = "#212121";
const PAD = 14;
const DOT = 9;
const _RAIL = 16;
const _ROW = 36;
const BTN_H = 40;
const PARTY_FACE = 36;

export type TripMobilePartyFace = {
  name: string;
  roleLabel: string;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
};

export type TripMobileStageAction = {
  key: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export type TripMobileDetailProps = {
  tripIdLabel: string;
  status: string;
  statusLabel: string;
  payoutModeLabel?: string;
  createdAtIso: string | null;
  pickupDateIso: string | null;
  completedAtIso?: string | null;
  startedAtIso?: string | null;
  origin: string;
  destination: string;
  vehicleLabel: string;
  vehicleType?: string;
  loadTonsLabel?: string;
  distanceLabel?: string | null;
  etaLabel?: string | null;
  clientName: string;
  driverName: string;
  driverPhone?: string | null;
  supplierName?: string;
  /** Client face on the route card (right stack). */
  clientParty?: TripMobilePartyFace | null;
  /** Supplier or driver face paired with the client on the route card. */
  costParty?: TripMobilePartyFace | null;
  saleInr: number;
  costInr: number;
  adjustedSaleInr?: number;
  adjustedCostInr?: number;
  marginInr: number;
  marginBasisLabel?: string;
  costLabel?: string;
  saleLabel?: string;
  canTrack?: boolean;
  onTrack?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  canChangeAssets?: boolean;
  onChangeAssets?: () => void;
  onOpenFinance?: () => void;
  /** Trip stage buttons (simulate / Ground Ops Reached pickup · Start trip / undo). */
  stageActions?: readonly TripMobileStageAction[];
  /** One log per timeline stage — who, when, and a one-line note. */
  stageLogs?: Array<StageLog | null | undefined>;
  children?: ReactNode;
};

export type StageLog = {
  actor?: string;
  time?: string;
  detail?: string;
  location?: string;
  simulated?: boolean;
  history?: Array<{ time: string; actor: string; action: string }>;
};

type Step = {
  key: string;
  label: string;
  date?: string;
  done: boolean;
  log?: StageLog | null;
};

function readableLabel(label: string): string {
  return label.replace(/ /g, "\u00A0");
}

function norm(v: string): string {
  return v.trim().toLowerCase();
}

function shortDate(iso: string | null | undefined): string | undefined {
  if (!iso?.trim()) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return undefined;
  }
}

/** True when the calendar day of `iso` is strictly before today (local). */
function isDeadlineExceeded(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const deadlineDay = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    ).getTime();
    const today = new Date();
    const todayDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    return todayDay > deadlineDay;
  } catch {
    return false;
  }
}

function shortDateTime(iso: string | null | undefined): string | undefined {
  if (!iso?.trim()) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return undefined;
  }
}

function tripStageIndex(
  status: string,
  completed: boolean,
  startedAtIso: string | null | undefined,
  completedAtIso: string | null | undefined,
): number {
  return getManifestCurrentStepIndex({
    status,
    started_at: startedAtIso ?? null,
    completed_at: completed || completedAtIso ? completedAtIso ?? null : null,
    updated_at: null,
  });
}

function tripHeadline(
  status: string,
  pickupIso: string | null,
  completed: boolean,
  etaLabel: string | null | undefined,
): { text: string; overdue: boolean } {
  const s = norm(status);
  const pickupLabel = shortDate(pickupIso);
  const pickupOverdue = isDeadlineExceeded(pickupIso);

  if (
    completed ||
    s.includes("complet") ||
    s.includes("deliver") ||
    s === "done"
  ) {
    const done = pickupLabel;
    return {
      text: done ? `Delivered · ${done}` : "Delivered successfully",
      overdue: false,
    };
  }
  if (s.includes("cancel")) {
    return { text: "Trip cancelled", overdue: false };
  }
  if (
    s.includes("arriv") ||
    s.includes("destination") ||
    s === "at_drop" ||
    s === "at_destination"
  ) {
    if (pickupOverdue && pickupLabel) {
      return {
        text: `Delivery deadline exceeded · ${pickupLabel}`,
        overdue: true,
      };
    }
    return { text: "Arrived at drop-off", overdue: false };
  }
  if (s.includes("transit") || s === "dispatched") {
    if (pickupOverdue && pickupLabel) {
      return {
        text: `Arrival deadline exceeded · ${pickupLabel}`,
        overdue: true,
      };
    }
    if (etaLabel?.trim()) {
      return { text: `In-transit · ${etaLabel.trim()}`, overdue: false };
    }
    return {
      text: pickupLabel ? `In-transit · due ${pickupLabel}` : "In-transit",
      overdue: false,
    };
  }
  if (s.includes("in_progress") || s.includes("pickup") || s === "picked_up") {
    if (pickupOverdue && pickupLabel) {
      return {
        text: `In transit — pickup was due ${pickupLabel}`,
        overdue: true,
      };
    }
    return { text: "Picked up — en route soon", overdue: false };
  }

  // Confirmed / assigned / pending — pickup window is the deadline.
  if (pickupLabel) {
    if (pickupOverdue) {
      return {
        text: `Pickup deadline exceeded · ${pickupLabel}`,
        overdue: true,
      };
    }
    return { text: `Pickup by ${pickupLabel}`, overdue: false };
  }
  if (
    s === "assigned" ||
    s === "confirmed" ||
    s === "pending" ||
    s === "draft"
  ) {
    return { text: "Trip confirmed", overdue: false };
  }
  return { text: "Trip in progress", overdue: false };
}

function buildTripSteps(args: {
  status: string;
  completed: boolean;
  createdAtIso: string | null;
  pickupDateIso: string | null;
  startedAtIso: string | null | undefined;
  completedAtIso: string | null | undefined;
  stageLogs?: Array<StageLog | null | undefined>;
}): Step[] {
  const {
    status,
    completed,
    createdAtIso,
    pickupDateIso: _pickupDateIso,
    startedAtIso,
    completedAtIso,
  } = args;
  const s = norm(status);
  if (s.includes("cancel")) {
    return [
      {
        key: "c0",
        label: "Confirmed",
        date: shortDate(createdAtIso),
        done: true,
      },
      {
        key: "c1",
        label: "Cancelled",
        date: shortDate(completedAtIso ?? createdAtIso),
        done: true,
      },
    ];
  }

  const idx = tripStageIndex(status, completed, startedAtIso, completedAtIso);
  const placed = shortDate(createdAtIso);
  const started = shortDate(startedAtIso);
  const delivered = shortDate(completedAtIso);

  const labels = [
    "Assigned",
    "Driver accepted",
    "Pickup",
    "In-transit",
    "Arrived at drop-off",
    "Delivered",
  ];
  const dates = [
    placed,
    idx >= 1 ? started ?? placed : undefined,
    idx >= 2 ? started ?? placed : undefined,
    idx >= 3 ? started : undefined,
    idx >= 4 ? started : undefined,
    idx >= 5 ? delivered : undefined,
  ];
  const logs = args.stageLogs ?? [];

  return labels.map((label, i) => ({
    key: `t${i}`,
    label,
    date: dates[i],
    done: i <= idx,
    log: logs[i] ?? null,
  }));
}

function Timeline({
  steps,
  endSlot,
}: {
  steps: Step[];
  endSlot?: ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const currentIdx = (() => {
    let last = -1;
    steps.forEach((st, i) => {
      if (st.done) last = i;
    });
    return last;
  })();

  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const next = steps[i + 1];
        const segComplete = step.done && !!next?.done;
        const isCurrent = i === currentIdx && step.done;
        const open = openKey === step.key;
        const log = step.log;
        const canOpen = step.done || Boolean(log?.actor || log?.time || log?.detail);
        return (
          <View key={step.key} style={styles.tlRow}>
            <View style={styles.tlRail}>
              <TouchableOpacity
                onPress={() => {
                  if (!canOpen) return;
                  setOpenKey((current) => (current === step.key ? null : step.key));
                }}
                disabled={!canOpen}
                hitSlop={Layout.touchTargetHitSlop}
                accessibilityRole="button"
                accessibilityLabel={`${step.label} log`}
                style={[
                  styles.tlDotHit,
                  open && styles.tlDotHitOpen,
                ]}
              >
                <View
                  style={[
                    styles.tlDot,
                    step.done ? styles.tlDotOn : styles.tlDotOff,
                    open && styles.tlDotOpen,
                  ]}
                />
              </TouchableOpacity>
              {!isLast ? (
                segComplete ? (
                  <View style={styles.tlStemOn} />
                ) : (
                  <View style={styles.tlStemOffWrap}>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <View key={n} style={styles.tlDash} />
                    ))}
                  </View>
                )
              ) : null}
            </View>
            <View style={styles.tlBodyCol}>
              <View style={styles.tlBody}>
                <TouchableOpacity
                  style={styles.tlLabelHit}
                  onPress={() => {
                    if (!canOpen) return;
                    setOpenKey((current) => (current === step.key ? null : step.key));
                  }}
                  disabled={!canOpen}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.tlLabel,
                      WEB_COPY,
                      !step.done && styles.tlLabelOff,
                      step.done && !isCurrent && styles.tlLabelOn,
                      isCurrent && styles.tlLabelCurrent,
                    ]}
                    numberOfLines={1}
                  >
                    {readableLabel(step.label)}
                  </Text>
                </TouchableOpacity>
                <View style={styles.tlRight}>
                  {i === currentIdx && endSlot ? endSlot : null}
                  {step.date ? (
                    <Text style={[styles.tlDate, WEB_COPY]} numberOfLines={1}>
                      {step.date}
                    </Text>
                  ) : null}
                </View>
              </View>
              {(log?.history?.length ?? 0) > 0 ? (
                <View style={styles.tlHistoryAlways}>
                  {log!.history!.map((line, hi) => (
                    <Text
                      key={`${line.time}-${hi}`}
                      style={[styles.tlHistoryAlwaysLine, WEB_COPY]}
                    >
                      {line.time} · {line.actor} · {line.action}
                    </Text>
                  ))}
                </View>
              ) : null}
              {open ? (
                <View style={styles.tlLog}>
                  <View style={styles.tlLogAccent} />
                  <View style={styles.tlLogInner}>
                    <Text style={[styles.tlLogEyebrow, WEB_COPY]}>
                      {log?.simulated ? "SIMULATION" : "STAGE LOG"}
                    </Text>
                    <View style={styles.tlLogWhoRow}>
                      <Feather
                        name={log?.simulated ? "zap" : "user"}
                        size={10}
                        color={log?.simulated ? Theme.warning : TEAL}
                      />
                      <Text style={[styles.tlLogWho, WEB_COPY]} numberOfLines={1}>
                        {log?.actor
                          ? `${log.simulated ? "Simulated by" : "Updated by"} ${log.actor}`
                          : step.done
                            ? "Recorded on this trip"
                            : "Not recorded yet"}
                      </Text>
                    </View>
                    {log?.time ? (
                      <View style={styles.tlLogWhoRow}>
                        <Feather name="clock" size={10} color={TEAL} />
                        <Text style={[styles.tlLogTime, WEB_COPY]} numberOfLines={1}>
                          {log.time}
                        </Text>
                      </View>
                    ) : null}
                    {log?.location ? (
                      <Text style={[styles.tlLogMeta, WEB_COPY]} numberOfLines={2}>
                        {log.location}
                      </Text>
                    ) : null}
                    {log?.detail ? (
                      <Text style={[styles.tlLogMeta, WEB_COPY]} numberOfLines={2}>
                        {log.detail}
                      </Text>
                    ) : null}
                    {(log?.history?.length ?? 0) > 0 ? (
                      <View style={styles.tlLogHistory}>
                        {log!.history!.map((line, hi) => (
                          <Text
                            key={`${line.time}-${hi}`}
                            style={[styles.tlLogHistoryLine, WEB_COPY]}
                          >
                            {line.time} · {line.actor} · {line.action}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export const TripMobileDetail = memo(function TripMobileDetail({
  tripIdLabel,
  status,
  statusLabel,
  payoutModeLabel,
  createdAtIso,
  pickupDateIso,
  completedAtIso,
  startedAtIso,
  origin,
  destination,
  vehicleLabel,
  vehicleType = "",
  loadTonsLabel,
  distanceLabel,
  etaLabel,
  clientName,
  driverName,
  driverPhone,
  supplierName,
  clientParty,
  costParty,
  saleInr,
  adjustedSaleInr,
  marginInr,
  saleLabel = "Client rate",
  canTrack = true,
  onTrack,
  secondaryActionLabel,
  onSecondaryAction,
  canChangeAssets,
  onChangeAssets,
  onOpenFinance,
  stageActions,
  stageLogs,
  children,
}: TripMobileDetailProps) {
  const completed =
    norm(status).includes("complet") ||
    norm(status).includes("deliver") ||
    norm(status) === "done" ||
    !!completedAtIso;

  const headline = tripHeadline(status, pickupDateIso, completed, etaLabel);

  const steps = useMemo(
    () =>
      buildTripSteps({
        status,
        completed,
        createdAtIso,
        pickupDateIso,
        startedAtIso,
        completedAtIso,
        stageLogs,
      }),
    [
      status,
      completed,
      createdAtIso,
      pickupDateIso,
      startedAtIso,
      completedAtIso,
      stageLogs,
    ],
  );

  const displaySale =
    adjustedSaleInr != null && Number.isFinite(adjustedSaleInr)
      ? adjustedSaleInr
      : saleInr;

  const driverVehiclePlate = (() => {
    const raw = vehicleLabel?.trim() ?? "";
    if (!raw || raw === "—" || raw === "Pending") return "";
    const plate = raw.split(/[·•]/)[0]?.trim() ?? raw;
    return formatIndianVehicleNumber(plate).trim() || plate;
  })();
  const specLine = [vehicleType || vehicleLabel, loadTonsLabel, distanceLabel]
    .filter((v) => v && v !== "—" && String(v).trim())
    .join(" · ");

  const cardAmount =
    displaySale > 0
      ? formatINR(displaySale)
      : saleInr > 0
        ? formatINR(saleInr)
        : "—";

  const createdLabel = shortDate(createdAtIso) ?? "—";
  const partyName = clientName?.trim() || "—";
  const courierName =
    driverName?.trim() && driverName !== "Unassigned"
      ? driverName.trim()
      : supplierName?.trim() || "Unassigned";
  const phoneDisplay = formatPhoneForDisplay(driverPhone) || "";

  const copyText = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert("Copied", `${label} copied.`);
    } catch {
      Alert.alert("Copy failed", `Could not copy ${label}.`);
    }
  };

  const primaryLabel = canTrack && onTrack ? "Track" : "View details";
  const showPrimary = Boolean(onTrack || primaryLabel);
  const handleSecondary = onSecondaryAction ?? onChangeAssets;
  const secondaryLabel =
    secondaryActionLabel ??
    (canChangeAssets && onChangeAssets ? "Change assets" : undefined);
  const showSecondary = Boolean(secondaryLabel && handleSecondary);

  const clientFace =
    clientParty?.name?.trim() && clientParty.name.trim() !== "—"
      ? clientParty
      : null;
  const costFace =
    costParty?.name?.trim() && costParty.name.trim() !== "—"
      ? costParty
      : null;

  return (
    <View style={styles.root}>
      {/* ── A. Status + route summary ─────────────────────────────────────── */}
      <View style={[styles.block, styles.blockFirst]}>
        <Text
          style={[styles.heroTitle, headline.overdue && styles.heroTitleOverdue]}
        >
          {headline.text}
        </Text>
        <Text style={styles.heroSub} numberOfLines={1}>
          {headline.overdue ? "Deadline exceeded · " : ""}
          {statusLabel}
          {payoutModeLabel && payoutModeLabel !== "—"
            ? ` · ${payoutModeLabel}`
            : ""}
        </Text>

        <View style={styles.card}>
          <View style={styles.itemRow}>
            {clientFace ? (
              <View
                style={styles.partyCol}
                accessibilityLabel={`Client: ${clientFace.name}`}
              >
                <View style={styles.partyAvatarSlot}>
                  <EntityAvatar
                    name={clientFace.name}
                    entityType="client"
                    size={PARTY_FACE}
                    avatarUrl={clientFace.avatarUrl}
                    avatarSeed={clientFace.avatarSeed}
                    organizationImageUrl={clientFace.organizationImageUrl}
                    organizationAvatarSeed={clientFace.organizationAvatarSeed}
                    isIntegrated={clientFace.isIntegrated}
                    showIntegrationBadge={false}
                  />
                </View>
                <Text style={styles.partyRole} numberOfLines={1}>
                  Client
                </Text>
                <Text style={styles.partyName} numberOfLines={2}>
                  {clientFace.name}
                </Text>
              </View>
            ) : (
              <View style={styles.partyColSpacer} />
            )}

            <View style={styles.itemBody}>
              <Text style={styles.itemBrand} numberOfLines={2}>
                {origin || "—"}
              </Text>
              <Text style={styles.itemDesc} numberOfLines={2}>
                To {destination || "—"}
              </Text>
              {specLine ? (
                <Text style={styles.itemSpec} numberOfLines={2}>
                  {specLine}
                </Text>
              ) : null}
            </View>

            {costFace ? (
              <View
                style={styles.partyCol}
                accessibilityLabel={`${costFace.roleLabel}: ${costFace.name}`}
              >
                <View style={styles.partyAvatarSlot}>
                  <EntityAvatar
                    name={costFace.name}
                    entityType={costFace.entityType}
                    size={PARTY_FACE}
                    avatarUrl={costFace.avatarUrl}
                    avatarSeed={costFace.avatarSeed}
                    organizationImageUrl={costFace.organizationImageUrl}
                    organizationAvatarSeed={costFace.organizationAvatarSeed}
                    isIntegrated={costFace.isIntegrated}
                    showIntegrationBadge={false}
                  />
                </View>
                <Text style={styles.partyRole} numberOfLines={1}>
                  {costFace.roleLabel}
                </Text>
                <Text style={styles.partyName} numberOfLines={2}>
                  {costFace.name}
                </Text>
                {costFace.entityType === "driver" && driverVehiclePlate ? (
                  <Text style={styles.partyVehicle} numberOfLines={1}>
                    {driverVehiclePlate}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.partyColSpacer} />
            )}
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <Text style={styles.price}>
                {cardAmount}
                <Text style={styles.priceHint}>
                  {" "}
                  (
                  {adjustedSaleInr != null &&
                  Number.isFinite(adjustedSaleInr) &&
                  Math.abs(adjustedSaleInr - saleInr) >= 0.005
                    ? `revised ${saleLabel.toLowerCase()}`
                    : saleLabel}
                  )
                </Text>
              </Text>
              {adjustedSaleInr != null &&
              Number.isFinite(adjustedSaleInr) &&
              Math.abs(adjustedSaleInr - saleInr) >= 0.005 &&
              saleInr > 0 ? (
                <Text style={styles.priceActualHint} numberOfLines={1}>
                  Actual {formatINR(saleInr)}
                  {" · "}
                  CN/DN{" "}
                  {adjustedSaleInr - saleInr > 0 ? "+" : "−"}
                  {formatINR(Math.abs(adjustedSaleInr - saleInr))}
                </Text>
              ) : null}
              {marginInr > 0 ? (
                <Text style={styles.saved}>
                  You saved {formatINR(marginInr)}
                </Text>
              ) : marginInr < 0 ? (
                <Text style={[styles.saved, styles.savedWarn]}>
                  Margin {formatINR(marginInr)}
                </Text>
              ) : null}
            </View>
            {onOpenFinance ? (
              <TouchableOpacity
                onPress={onOpenFinance}
                hitSlop={Layout.touchTargetHitSlop}
                accessibilityRole="button"
                accessibilityLabel="View finance breakup"
                style={styles.breakupHit}
              >
                <Text style={styles.link}>View Breakup</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── B. Progress → actions (reference tracking page) ─────────────── */}
      <View style={styles.blockGap}>
        <View style={styles.block}>
          <Timeline
            steps={steps}
            endSlot={
              stageActions && stageActions.length > 0 ? (
                <View style={styles.simRow}>
                  {stageActions.map((action) => {
                    const ghost = action.key === "revoke";
                    return (
                      <TouchableOpacity
                        key={action.key}
                        style={[styles.simBtn, ghost ? styles.simBtnGhost : styles.simBtnFill]}
                        onPress={action.onPress}
                        disabled={action.disabled}
                        activeOpacity={0.88}
                        hitSlop={Layout.touchTargetHitSlop}
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                      >
                        <Text
                          style={[styles.simBtnText, ghost ? styles.simBtnGhostText : styles.simBtnFillText, WEB_COPY]}
                          numberOfLines={1}
                        >
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null
            }
          />

          <View style={styles.metaGrid}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Driver</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {courierName}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Trip ID</Text>
              <View style={styles.metaValueRow}>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {tripIdLabel}
                </Text>
                <TouchableOpacity
                  onPress={() => void copyText("Trip ID", tripIdLabel)}
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <Text style={styles.link}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {showPrimary || showSecondary ? (
            <View style={styles.actionRow}>
              {showPrimary ? (
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    showSecondary ? styles.actionBtnFlex : styles.actionBtnFull,
                  ]}
                  onPress={onTrack}
                  disabled={!onTrack}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                </TouchableOpacity>
              ) : null}
              {showSecondary ? (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    showPrimary ? styles.actionBtnFlex : styles.actionBtnFull,
                  ]}
                  onPress={handleSecondary}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.secondaryBtnText} numberOfLines={1}>
                    {secondaryLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}


          <View style={styles.footRow}>
            <Text style={styles.footMuted} numberOfLines={2}>
              {completed
                ? "Trip completed"
                : canChangeAssets
                  ? "Reassign before delivery if needed"
                  : "Asset changes are not available"}
            </Text>
          </View>
        </View>
      </View>

      {/* ── C. Address ──────────────────────────────────────────────────── */}
      <View style={styles.blockGap}>
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Delivery address</Text>
          <Text style={styles.addrName}>{partyName}</Text>
          <Text style={styles.addrKicker}>Pickup</Text>
          <Text style={styles.addrBody}>{origin || "—"}</Text>
          <Text style={[styles.addrKicker, styles.addrGap]}>Drop</Text>
          <Text style={styles.addrBody}>{destination || "—"}</Text>
          {phoneDisplay ? (
            <Text style={styles.addrMeta}>Phone : {phoneDisplay}</Text>
          ) : null}
          {pickupDateIso ? (
            <Text style={styles.addrMeta}>
              Pickup window · {shortDateTime(pickupDateIso) ?? "—"}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Payment breakup lives on Finance tab — avoid duplicating rates here. */}

      {/* ── D. Live ops / ratings ───────────────────────────────────────── */}
      {children ? <View style={styles.children}>{children}</View> : null}

      {/* ── F. Footer ───────────────────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => void copyText("Trip ID", tripIdLabel)}
          hitSlop={Layout.touchTargetHitSlop}
          style={styles.bottomIdHit}
        >
          <Text style={styles.bottomText} numberOfLines={1}>
            Trip ID: <Text style={styles.bottomStrong}>{tripIdLabel}</Text>
          </Text>
          <Text style={styles.link}>Copy</Text>
        </TouchableOpacity>
        <Text style={styles.bottomTextEnd} numberOfLines={1}>
          Placed On: <Text style={styles.bottomStrong}>{createdLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const shadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: CANVAS,
  },
  /** Full-bleed white section; content locked to PAD. */
  block: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: PAD,
    paddingTop: 12,
    paddingBottom: 14,
  },
  /** First block sits flush under tabs (no double top gap). */
  blockFirst: {
    paddingTop: 10,
  },
  /** Canvas gutter between white sections. */
  blockGap: {
    marginTop: 8,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: INK,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  heroTitleOverdue: {
    color: Theme.teslaRed,
  },
  heroSub: {
    marginTop: 3,
    marginBottom: 12,
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
  },
  /** Inset card — same PAD left/right as block so edges align with screen. */
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    ...shadow,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingTop: 2,
    justifyContent: "center",
    minHeight: PARTY_FACE + 36,
  },
  partyCol: {
    width: 64,
    alignItems: "center",
    flexShrink: 0,
  },
  partyColSpacer: {
    width: 64,
    flexShrink: 0,
  },
  partyAvatarSlot: {
    width: PARTY_FACE,
    height: PARTY_FACE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  partyRole: {
    fontSize: 9,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
    width: "100%",
    lineHeight: 11,
  },
  partyName: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: INK,
    textAlign: "center",
    width: "100%",
    lineHeight: 14,
  },
  partyVehicle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: MUTED,
    textAlign: "center",
    width: "100%",
    lineHeight: 12,
  },
  itemBrand: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
    lineHeight: 17,
    textAlign: "center",
  },
  itemDesc: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "400",
    color: BODY,
    lineHeight: 15,
    textAlign: "center",
  },
  itemSpec: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 13,
    textAlign: "center",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEEEEE",
    marginTop: 12,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  priceCol: { flex: 1, minWidth: 0 },
  breakupHit: {
    paddingVertical: 4,
    paddingLeft: 8,
    flexShrink: 0,
  },
  price: {
    fontSize: 12,
    fontWeight: "500",
    color: INK,
  },
  priceHint: {
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
  },
  priceActualHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
  },
  saved: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: TEAL,
  },
  savedWarn: {
    color: Theme.teslaRed,
  },
  link: {
    fontSize: 11,
    fontWeight: "500",
    color: LINK,
  },

  timeline: {
    marginBottom: 2,
  },
  tlRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  simRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 4,
  },
  simBtn: {
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  simBtnGhost: {
    borderWidth: 1,
    borderColor: Theme.warning,
    backgroundColor: "transparent",
  },
  simBtnFill: {
    backgroundColor: Theme.actionBtnInk,
  },
  simBtnText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 12,
  },
  simBtnGhostText: {
    color: Theme.warning,
  },
  simBtnFillText: {
    color: Theme.buttonDarkText,
  },
  tlRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  tlRail: {
    width: 28,
    alignItems: "center",
  },
  tlDotHit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tlDotHitOpen: {
    borderRadius: 14,
    backgroundColor: "rgba(16,185,129,0.10)",
  },
  tlDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  tlDotOn: {
    backgroundColor: Theme.positive,
  },
  tlDotOff: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: "#BDBDBD",
  },
  tlDotOpen: {
    transform: [{ scale: 1.15 }],
  },
  tlStemOn: {
    width: 2,
    flex: 1,
    marginTop: 2,
    backgroundColor: Theme.positive,
  },
  tlStemOffWrap: {
    flex: 1,
    marginTop: 3,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 2,
    gap: 3,
  },
  tlDash: {
    width: 2,
    height: 3,
    borderRadius: 1,
    backgroundColor: "#BDBDBD",
  },
  tlBodyCol: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 10,
  },
  tlBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingLeft: 6,
    paddingTop: 4,
    gap: 8,
  },
  tlLabelHit: {
    flex: 1,
    minWidth: 0,
  },
  tlLog: {
    marginTop: 6,
    marginLeft: 6,
    marginRight: 2,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    flexDirection: "row",
  },
  tlLogAccent: {
    width: 3,
    backgroundColor: TEAL,
  },
  tlLogInner: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  tlLogEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 0.6,
  },
  tlLogWhoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tlLogWho: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: INK,
    letterSpacing: 0,
  },
  tlLogTime: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    color: TEAL,
    letterSpacing: 0,
  },
  tlLogMeta: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    lineHeight: 14,
    letterSpacing: 0,
  },
  tlLogHistory: {
    marginTop: 6,
    gap: 2,
  },
  tlLogHistoryLine: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0,
  },
  tlHistoryAlways: {
    marginTop: 2,
    marginBottom: 4,
    gap: 1,
  },
  tlHistoryAlwaysLine: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0,
  },
  tlLabel: {
    fontSize: 13,
    flex: 1,
    letterSpacing: 0,
  },
  tlLabelOn: {
    fontWeight: "400",
    color: BODY,
  },
  tlLabelCurrent: {
    fontWeight: "600",
    color: INK,
  },
  tlLabelOff: {
    fontWeight: "400",
    color: MUTED,
  },
  tlDate: {
    fontSize: 12,
    fontWeight: "400",
    color: MUTED,
    flexShrink: 0,
    textAlign: "right",
    minWidth: 84,
    letterSpacing: 0,
  },

  metaGrid: {
    flexDirection: "row",
    gap: 20,
    marginTop: 2,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEEEE",
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
    marginBottom: 3,
  },
  metaValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
    flexShrink: 1,
  },

  actionRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtnFlex: {
    flex: 1,
    minWidth: 0,
  },
  actionBtnFull: {
    flex: 1,
    width: "100%",
  },
  primaryBtn: {
    height: BTN_H,
    borderRadius: 6,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  secondaryBtn: {
    height: BTN_H,
    borderRadius: 6,
    backgroundColor: "#EEEEEE",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: BODY,
  },
  footRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    minHeight: 16,
  },
  footMuted: {
    flex: 1,
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
  },

  addrName: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
    marginBottom: 8,
  },
  addrKicker: {
    fontSize: 12,
    fontWeight: "500",
    color: INK,
  },
  addrGap: { marginTop: 10 },
  addrBody: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "400",
    color: BODY,
    lineHeight: 16,
  },
  addrMeta: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "400",
    color: BODY,
  },

  children: {
    marginTop: 8,
  },
  bottomBar: {
    marginTop: 8,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: PAD,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  bottomIdHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  bottomText: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
  },
  bottomTextEnd: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
    textAlign: "right",
  },
  bottomStrong: {
    fontWeight: "500",
    color: INK,
  },
});
