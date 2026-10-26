import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Hash,
  MapPin,
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
import { buildIndentDeployTiming } from "@/features/indents/utils/bidding/indentBidAlert.util";
import { formatINR, formatIndentTonsToCarry } from "@/lib/format";

function MetaRow({
  icon: Icon,
  text,
  alert,
}: {
  icon: LucideIcon;
  text: string;
  alert?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={[styles.iconWell, alert && styles.iconWellAlert]}>
        <Icon
          size={12}
          color={alert ? Theme.negative : Theme.textSecondary}
          strokeWidth={2.2}
        />
      </View>
      <Text
        style={[styles.metaRowText, alert && styles.metaRowTextAlert]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={styles.iconWell}>
        <Icon size={12} color={Theme.primary} strokeWidth={2.2} />
      </View>
      <Text style={styles.statTileValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statTileLabel}>{label}</Text>
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
  const loadType = indent.load_type ? indent.load_type : null;
  const routeLabel = `${origin} → ${dest}`;

  const pickupDateLabel = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch {
      return null;
    }
  }, [indent.created_at, indent.pickup_date]);

  const pickupTimeLabel = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return null;
    }
  }, [indent.created_at, indent.pickup_date]);

  const timing = useMemo(
    () => buildIndentDeployTiming(quote, indent),
    [quote, indent],
  );

  const pickupFact = [pickupDateLabel, pickupTimeLabel].filter(Boolean).join(" · ") || "Date pending";
  const rateFact = awardAmountInr != null ? formatINR(awardAmountInr) : "Rate pending";
  const vehicleFact = vehicleType || "Vehicle required";
  const queueLabel = pageTotal > 1 ? `${pageNumber}/${pageTotal}` : null;

  return (
    <View style={styles.pagerPage}>
      <View style={styles.profileStack}>
        <View style={styles.avatarStack}>
          <View style={styles.heroAvatarRing}>
            <PartyAvatar
              name={shipperName}
              entityType="client"
              organizationImageUrl={clientAvatar.organizationImageUrl}
              organizationAvatarSeed={clientAvatar.organizationAvatarSeed}
              avatarUrl={clientAvatar.avatarUrl}
              avatarSeed={clientAvatar.avatarSeed}
              isIntegrated={
                clientAvatar.isIntegrated === null
                  ? undefined
                  : clientAvatar.isIntegrated
              }
              initialsColorSeed={indent.organization_id ?? shipperName}
              size={72}
              shape="circle"
              style={styles.heroAvatar}
              borderStyle={styles.heroAvatar}
            />
          </View>
          <Text style={styles.heroShipperName} numberOfLines={2}>
            {shipperName}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusPillVerified}>
              <Text style={styles.statusPillTextOnDark}>Action required</Text>
            </View>
            <View style={styles.statusPillRecommended}>
              <Text style={styles.statusPillTextRecommended}>
                {queueLabel ? `Deploy ${queueLabel}` : "Deploy"}
              </Text>
            </View>
            {loadType ? (
              <View style={styles.statusPillSince}>
                <Text style={styles.statusPillTextSince}>{loadType}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.metaCard}>
          <MetaRow icon={MapPin} text={routeLabel} />
          <View style={styles.metaDivider} />
          <MetaRow icon={Calendar} text={`Pickup ${pickupFact}`} />
          <View style={styles.metaDivider} />
          <MetaRow icon={Hash} text={indentNo || "Indent pending"} />
          <View style={styles.metaDivider} />
          <MetaRow icon={Truck} text={vehicleFact} />
          {timing.dueByLabel || timing.combinedLabel ? (
            <>
              <View style={styles.metaDivider} />
              <MetaRow
                icon={AlertTriangle}
                alert={timing.tone === "overdue"}
                text={
                  timing.combinedLabel ||
                  timing.dueByLabel ||
                  "Pickup timing pending"
                }
              />
            </>
          ) : null}
          {timing.tone === "overdue" ? (
            <>
              <View style={styles.metaDivider} />
              <MetaRow
                icon={ClipboardList}
                alert
                text="Contact the shipper to confirm — the pickup window has passed"
              />
            </>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <StatTile icon={Wallet} value={rateFact} label="Agreed rate" />
          <StatTile
            icon={Scale}
            value={hasTons ? tonsToCarry : vehicleFact}
            label={hasTons ? "Tons to carry" : "Vehicle"}
          />
        </View>

        <View style={styles.statusRow}>
          {pickupDateLabel ? (
            <View style={styles.statusPillSince}>
              <Calendar size={11} color={Theme.textSecondary} strokeWidth={2.4} />
              <Text style={styles.statusPillTextSince}>{pickupDateLabel}</Text>
            </View>
          ) : null}
          <View style={styles.statusPillLive}>
            <Text style={styles.statusPillLiveText}>{vehicleFact}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
