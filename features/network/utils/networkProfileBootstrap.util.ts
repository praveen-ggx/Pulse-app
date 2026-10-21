import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { memberSinceYearFromIso } from "@/features/network/services/networkProfileSnapshot.service";
import type { LinkedOrgDisplayProfile } from "@/lib/queries/linkedOrgDisplayCache";

export type NetworkProfileSeedInput = Pick<
  DiscoverOrg,
  | "id"
  | "name"
  | "connection_status"
  | "mutual_count"
  | "mutual_connections_count"
  | "rating"
  | "average_rating"
  | "location"
  | "city"
  | "state"
  | "avatar_url"
  | "avatar_seed"
  | "trip_count"
  | "vehicle_count"
  | "network_indent_count"
  | "phone"
  | "org_created_at"
  | "is_kyc_verified"
  | "operating_model"
> & {
  rating_value?: number | null;
  location_value?: string | null;
};

export type NetworkProfileSeedNode = {
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
  is_kyc_verified?: boolean;
  operating_model?: string | null;
  member_since_year?: number | null;
  vehicle_count?: number;
  indent_count?: number;
};

function connectionStatusFromDiscover(
  raw: string | null | undefined,
): NetworkProfileSeedNode["status"] {
  const normalized = String(raw ?? "").toLowerCase();
  if (normalized === "approved") return "CONNECTED";
  if (normalized === "pending") return "REQUEST SENT";
  return "LIVE";
}

export function buildNetworkProfileSeed(
  org: NetworkProfileSeedInput,
  cached?: LinkedOrgDisplayProfile | null,
): { node: NetworkProfileSeedNode; totalTrips: number | null } {
  const tripCount =
    typeof org.trip_count === "number"
      ? org.trip_count
      : typeof cached?.tripCount === "number"
        ? cached.tripCount
        : null;
  const vehicleCount =
    typeof org.vehicle_count === "number"
      ? org.vehicle_count
      : typeof cached?.vehicleCount === "number"
        ? cached.vehicleCount
        : undefined;
  const indentCount =
    typeof org.network_indent_count === "number"
      ? org.network_indent_count
      : typeof cached?.networkIndentCount === "number"
        ? cached.networkIndentCount
        : undefined;
  const phone = (org.phone ?? cached?.phone ?? "").trim() || null;
  const rating =
    org.rating_value ??
    org.rating ??
    org.average_rating ??
    (typeof cached?.averageRating === "number" ? cached.averageRating : null);
  const location =
    org.location_value?.trim() ||
    org.location?.trim() ||
    [org.city, org.state].filter(Boolean).join(", ").trim() ||
    "Not available";
  const memberSinceYear =
    memberSinceYearFromIso(cached?.ownerSignedUpAt) ??
    memberSinceYearFromIso(cached?.orgCreatedAt) ??
    memberSinceYearFromIso(org.org_created_at);

  return {
    node: {
      id: org.id,
      name: org.name,
      type: "SUPPLIER",
      location,
      status: connectionStatusFromDiscover(org.connection_status),
      rating,
      mutuals: org.mutual_count ?? org.mutual_connections_count ?? 0,
      avatar_url: org.avatar_url ?? cached?.avatarUrl ?? null,
      avatar_seed: org.avatar_seed ?? cached?.avatarSeed ?? null,
      is_kyc_verified: org.is_kyc_verified ?? false,
      operating_model: org.operating_model ?? null,
      ...(phone ? { phone } : {}),
      ...(memberSinceYear != null ? { member_since_year: memberSinceYear } : {}),
      ...(vehicleCount !== undefined ? { vehicle_count: vehicleCount } : {}),
      ...(indentCount !== undefined ? { indent_count: indentCount } : {}),
    },
    totalTrips: tripCount,
  };
}

export function preferProfileConnectionStatus(
  previous: NetworkProfileSeedNode["status"] | undefined,
  incoming: NetworkProfileSeedNode["status"] | undefined,
): NetworkProfileSeedNode["status"] | undefined {
  if (previous === "CONNECTED" || previous === "REQUEST SENT") return previous;
  return incoming ?? previous;
}

export function hasSeededNetworkProfileHeroStats(input: {
  totalTrips?: number | null;
  vehicleCount?: number;
  indentCount?: number;
  phone?: string | null;
}): boolean {
  return (
    typeof input.totalTrips === "number" ||
    typeof input.vehicleCount === "number" ||
    typeof input.indentCount === "number" ||
    Boolean(input.phone?.trim())
  );
}
