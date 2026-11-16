import type { LedgerRow } from "@/features/finance/services/finance.service";
import { rollupTripSettlementLedger } from "@/features/finance/utils/tripSettlement.util";
import { marketplaceFeeGateSatisfied } from "@/features/network/services/marketBids.service";
import type {
  MarketplaceConvertedTrip,
  MarketplaceTripReceipt,
  MyOrgMarketBidRow,
} from "@/features/network/services/findLoadsForOrg.service";

/**
 * Figures for the marketplace wallet. Fees count only while an award is still locked.
 * `ratesSent` counts every bid, including failed ones; it is not a transaction count.
 * A transaction exists only once an awarded bid is allocated to a trip.
 */
export function marketplaceWalletFigures(bids: readonly MyOrgMarketBidRow[]): {
  due: number;
  ratesSent: number;
  awarded: number;
} {
  const due = bids.reduce((sum, bid) => {
    if (bid.status !== "accepted") return sum;
    if (marketplaceFeeGateSatisfied(bid.fee_payment_status)) return sum;
    const fee = Number(bid.platform_fee_amount);
    return sum + (Number.isFinite(fee) && fee > 0 ? fee : 0);
  }, 0);
  return {
    due,
    ratesSent: bids.length,
    awarded: bids.filter((bid) => bid.status === "accepted").length,
  };
}

export type MarketplaceArLine = {
  id: string;
  lane: string;
  billed: number;
  received: number;
  due: number;
};

export type MarketplaceArBook = {
  trips: number;
  billed: number;
  received: number;
  due: number;
  lines: MarketplaceArLine[];
};

function laneLabel(bid: MyOrgMarketBidRow): string {
  const pickup = (bid.pickup_area ?? "Pickup").trim();
  const drop = (bid.drop_location ?? "Drop").trim();
  return `${pickup} → ${drop}`;
}

/** AR for awarded loads that already have a trip. Same split as the DCO marketplace book. */
export function marketplaceArBook(
  bids: readonly MyOrgMarketBidRow[],
  trips: readonly MarketplaceConvertedTrip[],
  receipts: readonly MarketplaceTripReceipt[],
  viewerOrgId: string,
): MarketplaceArBook {
  const tripByIndent = new Map<string, MarketplaceConvertedTrip>();
  for (const trip of trips) {
    if (!tripByIndent.has(trip.indentId)) tripByIndent.set(trip.indentId, trip);
  }
  const receiptsByTrip = new Map<string, MarketplaceTripReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByTrip.get(receipt.tripId);
    if (list) list.push(receipt);
    else receiptsByTrip.set(receipt.tripId, [receipt]);
  }

  const lines: MarketplaceArLine[] = [];
  const seenTrip = new Set<string>();
  for (const bid of bids) {
    if (bid.status !== "accepted") continue;
    const trip = tripByIndent.get(bid.indent_id);
    if (!trip || seenTrip.has(trip.id)) continue;
    seenTrip.add(trip.id);
    const partner = trip.organizationId == null || trip.organizationId !== viewerOrgId;
    const rate = partner ? Number(trip.supplierRate ?? 0) : Number(trip.clientPrice ?? 0);
    const billed = rate > 0 ? rate : Math.max(0, Number(bid.amount) || 0);
    const rollup = rollupTripSettlementLedger(
      (receiptsByTrip.get(trip.id) ?? []).map(
        (receipt) =>
          ({
            amount_in: receipt.amountIn,
            amount_out: receipt.amountOut,
            contact_type: receipt.contactType,
          }) as LedgerRow,
      ),
    );
    const received = partner
      ? Math.max(rollup.clientReceived, rollup.supplierOutflowTotal)
      : rollup.clientReceived;
    lines.push({
      id: trip.id,
      lane: laneLabel(bid),
      billed,
      received,
      due: Math.max(0, billed - received),
    });
  }

  let billed = 0;
  let received = 0;
  for (const line of lines) {
    billed += line.billed;
    received += line.received;
  }
  return {
    trips: lines.length,
    billed,
    received,
    due: Math.max(0, billed - received),
    lines,
  };
}
