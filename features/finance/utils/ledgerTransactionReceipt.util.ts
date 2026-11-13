import type { LedgerEntryReceiptDetailRow, LedgerEntryReceiptPartyAvatar } from "@/components/ledger/LedgerEntryReceiptCard";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export function formatLedgerReceiptDate(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.trim();
  if (!t) return "—";

  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

  // Primary path: ISO-like strings (YYYY-MM-DD...).
  if (t.length >= 10 && t[4] === "-" && t[7] === "-") {
    const d = t.slice(0, 10);
    const [y, m, day] = d.split("-");
    const mi = Number(m);
    if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
    return `${day} ${months[mi - 1]} ${y}`;
  }

  // Fallback: whatever Date can parse (e.g. already formatted dates).
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return "—";

  const dayNum = parsed.getDate();
  const monthIdx = parsed.getMonth();
  const yearNum = parsed.getFullYear();
  const dayStr = String(dayNum).padStart(2, "0");

  if (monthIdx < 0 || monthIdx > 11) return "—";
  return `${dayStr} ${months[monthIdx]} ${yearNum}`;
}

export function ledgerReceiptTitle(tx: LedgerRow): string {
  const label = getDoubleEntryDisplayLabel(tx);
  if (label) return label;
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (Number(tx.amount_in ?? 0) > 0 && tx.contact_type === "client") {
    return "Customer payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "supplier") {
    return "Supplier payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "driver") {
    return "Driver payment";
  }
  return Number(tx.amount_in ?? 0) > 0 ? "Cash in" : "Cash out";
}

export function buildLedgerReceiptDetails(
  tx: LedgerRow,
): LedgerEntryReceiptDetailRow[] {
  const party = (tx.party_name ?? "").trim() || "—";
  const tripNumber = (tx.trip_number ?? "").trim();
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Payment date",
      value: formatLedgerReceiptDate(tx.transaction_date ?? tx.created_at),
    },
    { label: "Party", value: party },
  ];
  if (tripNumber) {
    details.push({ label: "Trip", value: tripNumber });
  }
  details.push(
    {
      label: "Payment mode",
      value: tx.payment_mode?.trim() || "—",
    },
    {
      label: "Reference",
      value: tx.payment_reference?.trim() || "—",
    },
  );
  // Never show the machine `[[QMETA:{…}]]` tag, even if a caller passes a raw row.
  const metaIdx = (tx.description ?? "").lastIndexOf("[[QMETA:");
  const note = (metaIdx >= 0 ? (tx.description ?? "").slice(0, metaIdx) : tx.description ?? "").trim();
  if (note) {
    details.push({
      label: "Note",
      value: note,
      multiline: true,
    });
  }
  return details;
}

export type LedgerReceiptTripDetail = {
  trip_number?: string;
  pickup_area?: string | null;
  drop_location?: string | null;
  pickup_date?: string | null;
};

export type LedgerReceiptTripDetailMap = Record<string, LedgerReceiptTripDetail>;

/** Sync enrichment from already-loaded trip maps (no modal fetch). */
export function enrichLedgerReceiptDetails(
  details: LedgerEntryReceiptDetailRow[],
  tripDetail?: LedgerReceiptTripDetail | null,
): LedgerEntryReceiptDetailRow[] {
  if (!tripDetail) return details;

  let next = [...details];
  const tripNum = (tripDetail.trip_number ?? "").trim();
  if (tripNum) {
    const tripIdx = next.findIndex((r) => r.label === "Trip");
    if (tripIdx >= 0) {
      next[tripIdx] = { ...next[tripIdx], value: tripNum };
    } else {
      const partyIdx = next.findIndex((r) => r.label === "Party");
      next.splice(partyIdx >= 0 ? partyIdx + 1 : 1, 0, {
        label: "Trip",
        value: tripNum,
      });
    }
  }

  if (next.some((r) => r.label === "Route")) return next;

  const route = [tripDetail.pickup_area, tripDetail.drop_location]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" → ");
  const tripDate = tripDetail.pickup_date ?? null;
  const tripIdx = next.findIndex((r) => r.label === "Trip");
  const insertAt =
    tripIdx >= 0
      ? tripIdx + 1
      : next.findIndex((r) => r.label === "Payment mode");

  if (route) {
    next.splice(insertAt >= 0 ? insertAt : next.length, 0, {
      label: "Route",
      value: route,
    });
  }
  if (tripDate) {
    next.splice(
      (insertAt >= 0 ? insertAt : next.length) + (route ? 1 : 0),
      0,
      { label: "Trip date", value: formatLedgerReceiptDate(tripDate) },
    );
  }
  return next;
}

export function ledgerReceiptFromRow(tx: LedgerRow) {
  const inAmt = Number(tx.amount_in ?? 0);
  const outAmt = Number(tx.amount_out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;
  const partyName = (tx.party_name ?? "").trim();
  const partyAvatar: LedgerEntryReceiptPartyAvatar | undefined = partyName
    ? {
        name: partyName,
        entityType: (tx.contact_type as PartyEntityType) ?? "client",
        avatarUrl: (tx.profileImageUrl ?? undefined) as string | undefined,
      }
    : undefined;

  return {
    statusLabel: tx.is_pending_request
      ? "Payment pending"
      : isIn
        ? "Payment received"
        : "Payment sent",
    title: ledgerReceiptTitle(tx),
    amount,
    isIn,
    details: buildLedgerReceiptDetails(tx),
    tripId: tx.trip_id ?? null,
    partyAvatar,
  };
}

export function ledgerReceiptFromFinancialRowData(data: FinancialRowData) {
  const inAmt = Number(data.in ?? 0);
  const outAmt = Number(data.out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;
  const party = (data.name ?? "").trim() || "—";
  const tripDisplay = (data.msn ?? "").trim();
  const td = data.tripDetail;
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Payment date",
      value: formatLedgerReceiptDate(data.transaction_date),
    },
    { label: "Party", value: party },
  ];
  if (tripDisplay && tripDisplay !== "General") {
    details.push({ label: "Trip", value: tripDisplay });
  }
  if (td) {
    const route = [td.pickup_area, td.drop_location]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" → ");
    if (route) details.push({ label: "Route", value: route });
    if (td.pickup_date) {
      details.push({ label: "Trip date", value: formatLedgerReceiptDate(td.pickup_date) });
    }
  }
  details.push(
    {
      label: "Payment mode",
      value: data.paymentMode?.trim() || "—",
    },
    {
      label: "Reference",
      value: data.paymentReference?.trim() || "—",
    },
  );
  const note = [data.category, data.desc].filter(Boolean).join(" · ").trim();
  if (note && note !== "GENERAL") {
    details.push({ label: "Note", value: note, multiline: true });
  }
  const partyAvatar: LedgerEntryReceiptPartyAvatar | undefined = party && party !== "—"
    ? {
        name: party,
        entityType: (data.ledgerPartyType as PartyEntityType) ?? "client",
        avatarUrl: data.profileImageUrl ?? undefined,
        avatarSeed: data.avatarSeed ?? undefined,
        organizationImageUrl: data.organizationImageUrl ?? undefined,
        organizationAvatarSeed: data.organizationAvatarSeed ?? undefined,
        isIntegrated:
          data.counterpartyIntegrated ?? data.is_integrated ?? undefined,
      }
    : undefined;

  return {
    statusLabel: isIn ? "Payment received" : "Payment sent",
    title: data.transactionTypeLabel?.trim() || party || "Transaction",
    amount,
    isIn,
    details,
    tripId: data.tripId ?? null,
    partyAvatar,
  };
}
