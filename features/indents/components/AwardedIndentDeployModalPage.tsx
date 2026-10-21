import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ClipboardList,
  Clock3,
  MapPin,
  Package,
  Scale,
  Truck,
  Wallet,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { deployModalStyles as styles } from "@/features/indents/components/AwardedIndentDeployModal.styles";
import { useIndentClientEntityAvatar } from "@/features/indents/hooks/useIndentClientEntityAvatar";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";
import {
  buildIndentDeployTiming,
  type IndentBidAlertTone,
} from "@/features/indents/utils/bidding/indentBidAlert.util";
import { formatINR, formatIndentTonsToCarry } from "@/lib/format";

const NEXT_STEPS = [
  "Assign driver and vehicle to put this trip on your books",
  "Other invitations wait until you finish this deploy",
] as const;

function dueTextStyle(tone: IndentBidAlertTone) {
  switch (tone) {
    case "overdue":
      return styles.timingDueOverdue;
    case "urgent":
      return styles.timingDueUrgent;
    case "soon":
      return styles.timingDueSoon;
    default:
      return styles.timingDueNeutral;
  }
}

function MetaRow({
  icon: Icon,
  text,
  tone = "default",
}: {
  icon: LucideIcon;
  text: string;
  tone?: "default" | "alert";
}) {
  return (
    <View style={styles.metaRow}>
      <View style={[styles.iconWell, tone === "alert" && styles.iconWellAlert]}>
        <Icon
          size={12}
          color={tone === "alert" ? Theme.negative : Theme.textSecondary}
          strokeWidth={2.2}
        />
      </View>
      <Text
        style={[styles.metaRowText, tone === "alert" && styles.metaRowTextAlert]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
}

export type AwardedIndentDeployModalPageProps = {
  item: PendingAwardedDeployItem;
  pageNumber: number;
  pageTotal: number;
  enabled: boolean;
};

export const AwardedIndentDeployModalPage = memo(function AwardedIndentDeployModalPage({
  item,
  pageNumber,
  pageTotal,
  enabled,
}: AwardedIndentDeployModalPageProps) {
  const { currentOrganization } = useOrganization();
  const viewerOrgId = currentOrganization?.id ?? null;
  const { indent, quote, shipperName, awardAmountInr } = item;

  const { fields: clientAvatar } = useIndentClientEntityAvatar({
    clientId: indent.client_id,
    ownerOrgId: viewerOrgId,
    shipperOrgId: indent.organization_id,
    isOwner: false,
    enabled,
  });

  const indentNo = getIndentDisplayNumber(indent);
  const origin = indent.pickup_area || "—";
  const dest = indent.drop_location || "—";
  const vehicleType = indent.vehicle_type ? indent.vehicle_type.toUpperCase() : null;
  const tonsToCarry = formatIndentTonsToCarry(indent.weight);
  const hasTons = indent.weight != null && indent.weight > 0;
  const tonsTileAmount = hasTons ? tonsToCarry : (vehicleType ?? "—");
  const loadType = indent.load_type ? indent.load_type : null;

  const detailChips: string[] = [];
  if (loadType) detailChips.push(loadType);
  if (vehicleType && hasTons) detailChips.push(vehicleType);
  if (!hasTons && !loadType && vehicleType) detailChips.push(vehicleType);

  const pickupDateLabel = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, [indent.created_at, indent.pickup_date]);

  const pickupMeta = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return indentNo;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return indentNo;
      const time = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const date = d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      return `${indentNo} · ${time} · ${date}`;
    } catch {
      return indentNo;
    }
  }, [indent.created_at, indent.pickup_date, indentNo]);

  const timing = useMemo(
    () => buildIndentDeployTiming(quote, indent),
    [quote, indent],
  );

  const showTimingCard = Boolean(
    timing.dueByLabel || timing.awardedDurationLabel || timing.transitDurationLabel,
  );

  return (
    <View style={styles.pagerPage}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          {pageTotal > 1 ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueText}>
                {pageNumber}/{pageTotal}
              </Text>
            </View>
          ) : (
            <View />
          )}
        </View>

        <View style={styles.avatarStack}>
          <View style={styles.heroAvatarRing}>
            <PartyAvatar
              name={shipperName}
              avatarUrl={clientAvatar.avatarUrl}
              avatarSeed={clientAvatar.avatarSeed}
              organizationImageUrl={clientAvatar.organizationImageUrl}
              organizationAvatarSeed={clientAvatar.organizationAvatarSeed}
              initialsColorSeed={indent.organization_id ?? shipperName}
              entityType="client"
              size={72}
              shape="circle"
              style={styles.heroAvatar}
              borderStyle={styles.heroAvatar}
            />
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            Trip awarded to you
          </Text>
          <Text style={styles.heroShipperName} numberOfLines={2}>
            {shipperName}
          </Text>
          <View style={styles.heroPillRow}>
            <View style={styles.heroPillAccent}>
              <Text style={styles.heroPillAccentText}>Action required</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>Vehicle deploy</Text>
            </View>
            {detailChips.map((chip) => (
              <View key={chip} style={styles.heroPill}>
                <Text style={styles.heroPillText}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.metaCard}>
          <MetaRow icon={Package} text={shipperName} />
          <View style={styles.metaDivider} />
          <MetaRow icon={MapPin} text={`${origin} → ${dest}`} />
          <View style={styles.metaDivider} />
          <MetaRow
            icon={Calendar}
            text={pickupDateLabel ? `Pickup ${pickupDateLabel}` : "Pickup date pending"}
          />
          <View style={styles.metaDivider} />
          <MetaRow icon={ClipboardList} text={pickupMeta} />
          <View style={styles.metaDivider} />
          <MetaRow icon={Truck} text="Vehicle required" />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Wallet size={14} color={Theme.primary} strokeWidth={2.2} />
            <Text style={styles.statTileValue} numberOfLines={1}>
              {awardAmountInr != null ? formatINR(awardAmountInr) : "—"}
            </Text>
            <Text style={styles.statTileLabel}>Agreed rate</Text>
          </View>
          <View style={styles.statTile}>
            <Scale size={14} color={Theme.primary} strokeWidth={2.2} />
            <Text style={styles.statTileValue} numberOfLines={1}>
              {tonsTileAmount}
            </Text>
            <Text style={styles.statTileLabel}>
              {hasTons ? "Tons to carry" : "Vehicle type"}
            </Text>
          </View>
        </View>

        {showTimingCard ? (
          <View style={[styles.metaCard, timing.tone === "overdue" && styles.metaCardAlert]}>
            {timing.combinedLabel ? (
              <>
                <MetaRow
                  icon={timing.tone === "overdue" ? AlertTriangle : Clock3}
                  text={timing.combinedLabel}
                  tone={timing.tone === "overdue" ? "alert" : "default"}
                />
                {timing.tone === "overdue" || timing.transitDurationLabel ? (
                  <View style={styles.metaDivider} />
                ) : null}
              </>
            ) : null}
            {timing.tone === "overdue" ? (
              <>
                <MetaRow
                  icon={AlertTriangle}
                  text="Contact shipper to confirm — pickup window has passed"
                  tone="alert"
                />
                {timing.transitDurationLabel ? <View style={styles.metaDivider} /> : null}
              </>
            ) : null}
            {timing.transitDurationLabel ? (
              <View style={styles.metaRow}>
                <View style={styles.iconWell}>
                  <Truck size={12} color={Theme.textSecondary} strokeWidth={2.2} />
                </View>
                <Text style={[styles.metaRowText, dueTextStyle(timing.tone)]} numberOfLines={1}>
                  {timing.transitDurationLabel}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.metaCard}>
          <Text style={styles.nextTitle}>What happens next</Text>
          {NEXT_STEPS.map((step, index) => (
            <View key={step}>
              {index > 0 ? <View style={styles.metaDivider} /> : null}
              <View style={styles.metaRow}>
                <View style={styles.iconWell}>
                  <ArrowRight size={12} color={Theme.textSecondary} strokeWidth={2.4} />
                </View>
                <Text style={styles.metaRowText}>{step}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.statusRow}>
          {pickupDateLabel ? (
            <View style={styles.statusPill}>
              <Calendar size={11} color={Theme.textSecondary} strokeWidth={2.4} />
              <Text style={styles.statusPillText}>Pickup {pickupDateLabel}</Text>
            </View>
          ) : null}
          <View style={styles.statusPillLive}>
            <Truck size={11} color={Theme.textOnPrimary} strokeWidth={2.4} />
            <Text style={styles.statusPillLiveText}>Vehicle required</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
