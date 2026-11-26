import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  Calendar,
  Hash,
  MapPin,
  Scale,
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

const AVATAR_SIZE = 40;

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
      <View style={styles.statIconWell}>
        <Icon size={13} color={Theme.primary} strokeWidth={2.3} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statTileValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.statTileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
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

  const pickupFact =
    [pickupDateLabel, pickupTimeLabel].filter(Boolean).join(" · ") || "Date pending";
  const rateFact = awardAmountInr != null ? formatINR(awardAmountInr) : "Rate pending";
  const vehicleFact = vehicleType || "Vehicle required";
  const queueLabel = pageTotal > 1 ? `${pageNumber}/${pageTotal}` : null;
  const overdueCopy =
    timing.combinedLabel ||
    timing.dueByLabel ||
    "Pickup timing pending";

  return (
    <View style={styles.pagerPage}>
      <View style={styles.profileStack}>
        {/* Shipper + status — one compact row */}
        <View style={styles.identityRow}>
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
              size={AVATAR_SIZE}
              shape="rounded"
              style={styles.heroAvatar}
              borderStyle={styles.heroAvatar}
            />
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.heroShipperName} numberOfLines={1}>
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
        </View>

        <View style={styles.metaCard}>
          <MetaRow icon={MapPin} text={routeLabel} />
          <View style={styles.metaDivider} />
          <MetaRow icon={Calendar} text={`Pickup ${pickupFact}`} />
          <View style={styles.metaDivider} />
          <MetaRow
            icon={Hash}
            text={[indentNo || "Indent pending", vehicleFact].filter(Boolean).join(" · ")}
          />
          {timing.dueByLabel || timing.combinedLabel ? (
            <>
              <View style={styles.metaDivider} />
              <MetaRow
                icon={AlertTriangle}
                alert={timing.tone === "overdue"}
                text={
                  timing.tone === "overdue"
                    ? `${overdueCopy} — confirm with shipper`
                    : overdueCopy
                }
              />
            </>
          ) : null}
        </View>

        {/* Matching horizontal tiles — same shape, aligned */}
        <View style={styles.statsRow}>
          <StatTile icon={Wallet} value={rateFact} label="Agreed rate" />
          <StatTile
            icon={Scale}
            value={hasTons ? tonsToCarry : vehicleFact}
            label={hasTons ? "Tons to carry" : "Vehicle"}
          />
        </View>
      </View>
    </View>
  );
});
