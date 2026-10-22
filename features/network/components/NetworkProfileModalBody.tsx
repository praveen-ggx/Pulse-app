/**
 * Network profile modal body — hub hex hero layout (aligned with org network page).
 */
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { NetworkProfileHubHero } from "@/features/network/components/NetworkProfileHubHero";
import { isOrgKycVerified, resolveOrgVerificationState } from "@/features/network/utils/orgVerification.util";
import { useMutualConnectionsQuery } from "@/lib/queries/useMutualConnectionsQuery";
import {
    Building2,
    Globe,
    MapPin,
    ShieldCheck,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

export type NetworkProfileModalNode = {
  id: string;
  name: string;
  type: "CLIENT" | "SUPPLIER" | "DRIVER";
  location: string;
  status: "CONNECTED" | "REQUEST SENT" | "LIVE";
  rating: number | null;
  mutuals: number;
  phone?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  is_integrated?: boolean;
  /** Admin / KYC verified (`organizations.verification_status = verified`). */
  is_kyc_verified?: boolean;
  /** Enriched from snapshot */
  registered_address?: string | null;
  branch_count?: number;
  sector?: string | null;
  website?: string | null;
  gstin?: string | null;
  operating_model?: string | null;
  member_since_year?: number | null;
  vehicle_count?: number;
  indent_count?: number;
};

export type NetworkProfileModalBodyProps = {
  node: NetworkProfileModalNode;
  /** Viewer org — used to load the live mutual-connection count. */
  viewerOrgId?: string | null;
  /** @deprecated Modal is always compact; kept for call-site compatibility. */
  isMobile?: boolean;
  profileStatsLoading: boolean;
  totalTrips: number;
  onClose?: () => void;
};

function formatConnectionStatus(status: NetworkProfileModalNode["status"]): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityTypeFromRole(
  type: NetworkProfileModalNode["type"],
): "client" | "supplier" | "driver" {
  if (type === "DRIVER") return "driver";
  if (type === "SUPPLIER") return "supplier";
  return "client";
}

function shouldShowRegisteredAddress(
  location: string,
  registeredAddress: string | null | undefined,
): boolean {
  const address = registeredAddress?.trim();
  if (!address) return false;
  const loc = location.trim().toLowerCase();
  const addr = address.toLowerCase();
  if (!loc) return true;
  if (addr === loc) return false;
  if (addr.includes(loc) || loc.includes(addr)) return false;
  return true;
}

export function NetworkProfileModalBody({
  node,
  viewerOrgId = null,
  profileStatsLoading,
  totalTrips,
  onClose,
}: NetworkProfileModalBodyProps) {
  const connectionLabel = formatConnectionStatus(node.status);
  const ratingNum = node.rating;
  const tripsValue = profileStatsLoading ? "…" : String(totalTrips);
  const mutualsQuery = useMutualConnectionsQuery(
    viewerOrgId,
    node.id,
    Boolean(
      viewerOrgId &&
        node.id &&
        viewerOrgId !== node.id &&
        !(typeof node.mutuals === "number" && node.mutuals > 0),
    ),
  );
  const seededMutuals =
    typeof node.mutuals === "number" && Number.isFinite(node.mutuals)
      ? Math.max(0, Math.floor(node.mutuals))
      : 0;
  const fetchedMutuals = mutualsQuery.isSuccess
    ? mutualsQuery.data.length
    : null;
  const mutualsKnown = fetchedMutuals ?? seededMutuals;
  const mutualsValue =
    mutualsQuery.isLoading && fetchedMutuals == null && seededMutuals <= 0
      ? "…"
      : String(mutualsKnown);
  const inApp =
    node.is_integrated ?? (node.status === "CONNECTED" || node.status === "LIVE");
  const isKycVerified = isOrgKycVerified(node);
  const verificationState = resolveOrgVerificationState(node);
  const memberSinceYear = node.member_since_year ?? null;
  const showRegisteredAddress = shouldShowRegisteredAddress(
    node.location,
    node.registered_address,
  );

  const hasEnrichedData =
    showRegisteredAddress ||
    (node.branch_count ?? 0) > 0 ||
    node.sector ||
    node.website ||
    node.gstin ||
    node.operating_model;

  return (
    <View style={{ width: "100%", borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
      <NetworkProfileHubHero
        name={node.name}
        roleLabel={node.type}
        location={node.location}
        phone={node.phone ?? null}
        entityType={entityTypeFromRole(node.type)}
        avatarUrl={node.avatar_url}
        avatarSeed={node.avatar_seed}
        showVerified={isKycVerified}
        verificationState={verificationState}
        isSignedIn={inApp}
        memberSinceYear={memberSinceYear}
        connectionStatus={connectionLabel}
        vehicleCount={node.vehicle_count ?? 0}
        indentCount={node.indent_count ?? 0}
        profileStatsLoading={profileStatsLoading}
        onClose={onClose}
        compact
        ratingValue={ratingNum}
        stats={[
          { value: tripsValue, label: "trips" },
          { value: mutualsValue, label: "mutuals" },
        ]}
      />

      {hasEnrichedData ? (
        <View style={s.enrichedSection}>
          {node.sector ? (
            <View style={s.enrichedRow}>
              <Building2 size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Sector</Text>
              <Text style={s.enrichedValue}>{node.sector}</Text>
            </View>
          ) : null}
          {node.operating_model ? (
            <View style={s.enrichedRow}>
              <ShieldCheck size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Model</Text>
              <Text style={s.enrichedValue}>{node.operating_model.replace(/_/g, " ")}</Text>
            </View>
          ) : null}
          {(node.branch_count ?? 0) > 0 ? (
            <View style={s.enrichedRow}>
              <MapPin size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Offices</Text>
              <Text style={s.enrichedValue}>
                {node.branch_count} location{(node.branch_count ?? 0) > 1 ? "s" : ""}
              </Text>
            </View>
          ) : null}
          {showRegisteredAddress ? (
            <View style={s.enrichedRow}>
              <MapPin size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Address</Text>
              <Text style={[s.enrichedValue, { flex: 1 }]} numberOfLines={3}>
                {node.registered_address}
              </Text>
            </View>
          ) : null}
          {node.gstin ? (
            <View style={s.enrichedRow}>
              <ShieldCheck size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>GSTIN</Text>
              <Text style={s.enrichedValue}>{node.gstin}</Text>
            </View>
          ) : null}
          {node.website ? (
            <View style={s.enrichedRow}>
              <Globe size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Website</Text>
              <Text style={[s.enrichedValue, { color: "#3E97FF" }]} numberOfLines={1}>
                {node.website}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  enrichedSection: {
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  enrichedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  enrichedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
    width: 64,
    flexShrink: 0,
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  enrichedValue: {
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
    flex: 1,
    flexShrink: 1,
    lineHeight: 18,
  },
});
