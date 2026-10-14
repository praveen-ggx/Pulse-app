/**
 * Trips hub presentation for unallocated indents.
 * Reuses Give Load bid-count status derivation; does not invent DB statuses.
 */
import { resolveCommercialPricing } from "@/features/marketplace/domain/commercialPricing";
import {
  GIVE_LOAD_RECEIVING_BIDS_STATUS,
  giveLoadBidReceivedDisplayStatus,
} from "@/features/network/utils/loadCenter.model";

export type IndentHubSourceTag = "NETWORK" | "MARKETPLACE";

export type IndentHubLifecycleStatus =
  | "WAITING FOR BID"
  | "RECEIVING BIDS"
  | "AWARDED"
  | "FAILED";

/** Toolbar tags on the Trips indent stage. */
export type IndentHubStatusTag = "pending" | "bids" | "awarded" | "failed";

/**
 * Shipper circulation_target → compact source tags on the Trips ticket.
 *
 * Give Load never painted an OFFLINE chip — circulation_target only drove the
 * Marketplace toggle (`marketplace` | `both`). Do not invent an OFFLINE tag.
 * Missing target matches Give Load (`?? "integrated_supplier"`) → NETWORK.
 */
export function indentHubSourceTags(
  circulationTarget: string | null | undefined,
): IndentHubSourceTag[] {
  if (circulationTarget == null || !String(circulationTarget).trim()) {
    return ["NETWORK"];
  }
  const target = String(circulationTarget).trim().toLowerCase();
  if (target === "both") return ["NETWORK", "MARKETPLACE"];
  if (target === "marketplace") return ["MARKETPLACE"];
  if (target === "integrated_supplier") return ["NETWORK"];
  // `offline` (and any other stored value): no source chip. Product can add
  // an OFFLINE treatment later; Give Load had none.
  return [];
}

/**
 * Primary lifecycle label for an indent that has no trip yet.
 * Bid presence uses {@link giveLoadBidReceivedDisplayStatus} (same as My Load).
 */
export function indentHubLifecycleStatus(
  indentStatus: string | null | undefined,
  bidCount: number,
): IndentHubLifecycleStatus {
  const status = String(indentStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "expired") return "FAILED";
  const derived = giveLoadBidReceivedDisplayStatus(
    String(indentStatus ?? ""),
    bidCount,
  );
  if (derived === GIVE_LOAD_RECEIVING_BIDS_STATUS) return "RECEIVING BIDS";
  if (derived === "awarded") return "AWARDED";
  return "WAITING FOR BID";
}

/** Compact indent-stage tag: pending (waiting for bid), bids received, awarded. */
export function indentHubStatusTag(
  indentStatus: string | null | undefined,
  bidCount: number,
): IndentHubStatusTag {
  const status = String(indentStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "expired") return "failed";
  const life = indentHubLifecycleStatus(indentStatus, bidCount);
  if (life === "AWARDED") return "awarded";
  if (life === "RECEIVING BIDS") return "bids";
  return "pending";
}

/** Same trip-total as Give Load TARGET RATE (`resolveGiveLoadTicketCommerce`). */
export function indentHubTargetRateInr(load: {
  supplier_target?: number | null;
  supplier_rate_basis?: string | null;
  weight?: number | null;
}): number | null {
  const n = Number(
    resolveCommercialPricing({
      supplierTarget: load.supplier_target,
      saleRateBasis: load.supplier_rate_basis,
      weightKg: load.weight,
      bidCount: 0,
    }).displayPrice ?? 0,
  );
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatWeightChip(weightKg: number | null | undefined): string | null {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const tonnes = kg / 1000;
  if (tonnes >= 0.1) {
    const rounded = Math.round(tonnes * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} t`;
  }
  return `${Math.round(kg)} kg`;
}

/** Vehicle · weight · material — Load Center spec chips, one line. */
export function indentHubLoadSpecLine(load: {
  vehicle_type?: string | null;
  load_type?: string | null;
  weight?: number | null;
}): string | null {
  const parts = [
    (load.vehicle_type || "").trim() || null,
    formatWeightChip(load.weight),
    (load.load_type || "").trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Visible after revoke while the indent is open again for bidding. */
export function indentHasAwardRevokedTag(
  indentStatus: string | null | undefined,
  awardRevokedAt: string | null | undefined,
): boolean {
  if (!awardRevokedAt) return false;
  return String(indentStatus ?? "").trim().toLowerCase() !== "awarded";
}
