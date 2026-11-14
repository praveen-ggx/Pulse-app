export type StandingLaneBid = {
  bidderOrganizationId: string;
  bidderOrganizationName: string;
  amount: number;
  alreadyOnIndent?: boolean;
};

const LANE_EDGE =
  /^[\t\n\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\t\n\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/g;

const CLOSED_LANE_STATUSES = new Set([
  "awarded",
  "completed",
  "cancelled",
  "closed",
  "expired",
  "draft",
]);

function lanePart(value: string | null | undefined): string {
  return (value ?? "").replace(LANE_EDGE, "").toLowerCase();
}

/** Same key as standing_lane_key: pickup, drop, and vehicle, or null when any part is blank. */
export function standingLaneKey(
  pickup: string | null | undefined,
  drop: string | null | undefined,
  vehicleType: string | null | undefined,
): string | null {
  const pickupPart = lanePart(pickup);
  const dropPart = lanePart(drop);
  const vehiclePart = lanePart(vehicleType);
  if (!pickupPart || !dropPart || !vehiclePart) return null;
  return `${pickupPart}|${dropPart}|${vehiclePart}`;
}

export function indentOpenForStandingLane(status: string | null | undefined): boolean {
  return !CLOSED_LANE_STATUSES.has(lanePart(status));
}

export type StandingLaneSourceBid = {
  indentId: string;
  shipperOrganizationId: string;
  pickup: string;
  drop: string;
  vehicleType: string;
  circulation: string | null;
  status: string;
  deleted: boolean;
  sponsored: boolean;
  bidderUserId: string;
  bidderOrganizationId: string;
  bidderType: string;
  bidStatus: string;
  amount: number;
  note: string | null;
  updatedAt: string;
};

export type StandingLaneTarget = {
  indentId: string;
  shipperOrganizationId: string;
  pickup: string;
  drop: string;
  vehicleType: string;
  circulation: string | null;
  status: string;
  deleted: boolean;
  sponsored: boolean;
  existingBidderUserIds: readonly string[];
  existingBidderOrganizationIds: readonly string[];
};

export type MaterializedLaneBid = {
  bidderUserId: string;
  bidderOrganizationId: string;
  amount: number;
  note: string | null;
};

function marketplaceCirculation(value: string | null | undefined): boolean {
  const circulation = lanePart(value);
  return circulation === "marketplace" || circulation === "both";
}

/**
 * Same selection the database trigger applies. Latest pending organization
 * rate per carrier, on an open unsponsored Marketplace load of the same lane.
 * Skips the shipper's organization and anyone who already has a bid.
 */
export function planStandingLaneMaterialization(
  target: StandingLaneTarget,
  sources: readonly StandingLaneSourceBid[],
): MaterializedLaneBid[] {
  const key = standingLaneKey(target.pickup, target.drop, target.vehicleType);
  if (
    !key ||
    target.deleted ||
    target.sponsored ||
    !marketplaceCirculation(target.circulation) ||
    !indentOpenForStandingLane(target.status)
  ) {
    return [];
  }

  const existingUsers = new Set(target.existingBidderUserIds);
  const existingOrgs = new Set(target.existingBidderOrganizationIds);
  const latest = new Map<string, StandingLaneSourceBid>();

  const eligible = sources
    .filter((source) => {
      if (source.indentId === target.indentId) return false;
      if (source.deleted || source.sponsored) return false;
      if (source.bidStatus !== "pending" || source.bidderType !== "organization") return false;
      if (!source.bidderOrganizationId || source.amount <= 0) return false;
      if (source.bidderOrganizationId === target.shipperOrganizationId) return false;
      if (!marketplaceCirculation(source.circulation)) return false;
      if (!indentOpenForStandingLane(source.status)) return false;
      return standingLaneKey(source.pickup, source.drop, source.vehicleType) === key;
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  for (const source of eligible) {
    if (!latest.has(source.bidderOrganizationId)) latest.set(source.bidderOrganizationId, source);
  }

  return [...latest.values()]
    .filter(
      (source) =>
        !existingUsers.has(source.bidderUserId) &&
        !existingOrgs.has(source.bidderOrganizationId),
    )
    .map((source) => ({
      bidderUserId: source.bidderUserId,
      bidderOrganizationId: source.bidderOrganizationId,
      amount: source.amount,
      note: source.note,
    }));
}

export function standingLaneBidLines(bids: readonly StandingLaneBid[]): string[] {
  return bids.map((bid) => {
    const name = bid.bidderOrganizationName.trim() || "Carrier";
    const rate = `${name} · ₹${Math.round(bid.amount).toLocaleString("en-IN")}`;
    return bid.alreadyOnIndent ? `Already on this load · ${rate}` : rate;
  });
}

export function standingLaneBidNotice(
  bids: readonly StandingLaneBid[],
  marketplaceOn: boolean,
): string | null {
  if (bids.length === 0) return null;
  const waiting = bids.filter((bid) => !bid.alreadyOnIndent);
  const attached = bids.length - waiting.length;
  if (waiting.length === 0) {
    return attached === 1
      ? "1 carrier rate is already on this load."
      : `${attached} carrier rates are already on this load.`;
  }
  const carriers = waiting.length === 1 ? "1 carrier has" : `${waiting.length} carriers have`;
  const attach = marketplaceOn
    ? "Sharing this load to Marketplace attaches these rates."
    : "Turn on Marketplace and these rates are attached to this load.";
  const already =
    attached === 0
      ? ""
      : attached === 1
        ? " 1 rate is already on this load."
        : ` ${attached} rates are already on this load.`;
  return `${carriers} already bid this lane. ${attach}${already}`;
}

export function standingLaneShareMessage(bids: readonly StandingLaneBid[]): string {
  const base =
    "This load will also become visible to verified fleet owners in the open Marketplace, alongside your supplier network.";
  const notice = standingLaneBidNotice(bids, true);
  if (!notice) return base;
  return `${base}\n\n${notice}\n${standingLaneBidLines(bids).join("\n")}`;
}
