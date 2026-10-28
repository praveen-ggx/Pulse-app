/**
 * Advance Processed table: one payment row per trip with the supplier's bank
 * details, approver and Finance payment reference. Builds on the already-loaded
 * `ComplianceTripSummary` (amount, mode, UTR, date) and only fetches what the
 * summary does not carry.
 */
import { supabase } from "@/lib/supabase";
import { getSupplierBankAccount } from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { getSupplierById, getSupplierDetails } from "@/features/suppliers/services/suppliers.service";
import { resolveBankBranch } from "@/features/suppliers/utils/ifscDirectory.util";
import { resolveComplianceActorNames } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { toPaymentSummary } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary, CompliancePaymentSummary } from "@/features/tripCompliance/tripCompliance.types";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import { mapWithConcurrency } from "@/features/tripCompliance/utils/mapWithConcurrency.util";

const EXPORT_FETCH_CONCURRENCY = 4;

const FINANCE_RECEIPT_PREFIX = "amount-paid:";

export type AdvanceProcessedEnrichment = {
  /** Finance transaction the UTR is saved on; null when no ledger row exists. */
  transactionId: string | null;
  /** Edit target for `updateCompliancePaymentReference`. */
  utrCategory: "compliance_advance" | "finance_receipt";
  /** Mode / UTR / date from the actual Finance receipt when the advance came from Finance. */
  payment: CompliancePaymentSummary | null;
  /** Extra Finance receipts beyond the one shown (amount_paid made of several). */
  extraReceipts: number;
  /** Payment request ID saved on the ledger description (editable). */
  requestId: string;
  supplierName: string;
  beneficiaryName: string;
  approvedBy: string;
  bankName: string;
  ifsc: string;
  accountNumber: string;
  branch: string;
};

export type SupplierBank = {
  name: string;
  beneficiary: string;
  bankName: string;
  ifsc: string;
  accountNumber: string;
  branch: string;
};

type SupplierNameFields = { name?: string | null; company_name?: string | null; contact_person?: string | null } | null;

function firstFilled(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Supplier = registered company; beneficiary = the party the transfer is addressed to. */
function supplierNames(row: SupplierNameFields) {
  return {
    supplier: firstFilled(row?.company_name, row?.name, row?.contact_person),
    beneficiary: firstFilled(row?.name, row?.company_name, row?.contact_person),
  };
}

async function loadSupplierBank(orgId: string, supplierId: string, fallback: string): Promise<SupplierBank> {
  const [details, bank] = await Promise.all([getSupplierDetails(supplierId), getSupplierBankAccount(orgId, supplierId)]);
  let names = supplierNames(details.supplier);
  if (!names.supplier) names = supplierNames((await getSupplierById(orgId, supplierId)).supplier);
  const ifsc = String(bank.account?.ifsc_code ?? "").trim().toUpperCase();
  return {
    name: names.supplier || fallback.trim(),
    // Beneficiary is the account holder only — never the supplier name.
    beneficiary: bank.account?.beneficiary_name?.trim() || "",
    bankName: bank.account?.bank_name?.trim() || "",
    ifsc,
    accountNumber: String(bank.account?.account_number ?? "").trim(),
    branch: await resolveBankBranch(bank.account?.branch_name, ifsc),
  };
}

type TxnRow = {
  id: string;
  trip_id: string | null;
  amount_in: number;
  amount_out: number;
  description: string | null;
  transaction_date: string;
  created_by: string | null;
  ledger_category: string | null;
  payment_reference: string | null;
};

export type TripPaymentRequest = { requestNo: string; status: string; approvedAmount: number | null };

/**
 * Live advance request per trip (`payment_requests`, issued at advance approval).
 * The request number is the Request ID everywhere — never text on the ledger row.
 */
const REST_IN_CHUNK = 40;

function chunkIds(ids: string[], size: number): string[][] {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export async function fetchAdvanceRequestsForTrips(tripIds: string[]): Promise<Record<string, TripPaymentRequest>> {
  const chunks = chunkIds(tripIds, REST_IN_CHUNK);
  if (chunks.length === 0) return {};
  const parts = await mapWithConcurrency(chunks, EXPORT_FETCH_CONCURRENCY, async (chunk) => {
    const { data, error } = await supabase()
      .from("payment_requests")
      .select("trip_id, request_no, status, approved_amount")
      .in("trip_id", chunk)
      .eq("payment_type", "advance")
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      trip_id: string;
      request_no: string;
      status: string;
      approved_amount: number | null;
    }[];
  });
  const out: Record<string, TripPaymentRequest> = {};
  for (const row of parts.flat()) {
    out[row.trip_id] = {
      requestNo: row.request_no,
      status: row.status,
      approvedAmount: row.approved_amount == null ? null : Number(row.approved_amount),
    };
  }
  return out;
}

/** Payout bank for one trip's supplier (cached per supplier). Own-fleet trips have no supplier. */
async function resolveTripPayeeBank(
  orgId: string,
  trip: ComplianceTripSummary["trip"],
  cache: Map<string, Promise<SupplierBank>>,
): Promise<SupplierBank> {
  const tripOrgId = (trip.organization_id ?? orgId).trim() || orgId;
  const supplierId = trip.supplier_id?.trim() || "";
  const tripSupplier = (trip.supplier_name ?? "").trim();
  const fallback: SupplierBank = { name: tripSupplier, beneficiary: "", bankName: "", ifsc: "", accountNumber: "", branch: "" };
  if (supplierId) {
    let pending = cache.get(supplierId);
    if (!pending) {
      pending = loadSupplierBank(tripOrgId, supplierId, trip.supplier_name ?? "").catch(() => fallback);
      cache.set(supplierId, pending);
    }
    return pending;
  }
  if (getTripExecutionModel(trip) === "asset") return { ...fallback, name: "Own fleet" };
  return fallback;
}

/** Payout banks for trips not yet paid (Advance Payment → Pending export). */
export async function fetchAdvancePayeeBanks(
  orgId: string,
  summaries: ComplianceTripSummary[],
): Promise<Record<string, SupplierBank>> {
  const cache = new Map<string, Promise<SupplierBank>>();
  const entries = await mapWithConcurrency(
    summaries,
    EXPORT_FETCH_CONCURRENCY,
    async (summary): Promise<[string, SupplierBank]> => [
      summary.trip.id,
      await resolveTripPayeeBank(orgId, summary.trip, cache),
    ],
  );
  return Object.fromEntries(entries);
}

/** Not org-filtered: receipts on shared trips can sit in the partner org; RLS scopes reads. */
async function fetchAdvanceTransactions(tripIds: string[]): Promise<TxnRow[]> {
  const chunks = chunkIds(tripIds, REST_IN_CHUNK);
  if (chunks.length === 0) return [];
  const parts = await mapWithConcurrency(chunks, EXPORT_FETCH_CONCURRENCY, async (chunk) => {
    const { data, error } = await supabase()
      .from("transactions")
      .select(
        "id, trip_id, amount_in, amount_out, description, transaction_date, created_by, ledger_category, payment_reference",
      )
      .in("trip_id", chunk)
      // Client receipts are money in; compliance advance / balance are supplier
      // payouts (money out) — match both, not only amount_in.
      .or("amount_in.gt.0,ledger_category.in.(compliance_advance,compliance_balance)")
      .order("transaction_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TxnRow[];
  });
  return parts.flat();
}

export async function fetchAdvanceProcessedEnrichment(
  orgId: string,
  summaries: ComplianceTripSummary[],
): Promise<Record<string, AdvanceProcessedEnrichment>> {
  const withAdvance = summaries.filter((s) => s.advance);
  if (withAdvance.length === 0) return {};

  const [txns, requests] = await Promise.all([
    fetchAdvanceTransactions(withAdvance.map((s) => s.trip.id)),
    fetchAdvanceRequestsForTrips(withAdvance.map((s) => s.trip.id)),
  ]);
  const txnsByTrip = new Map<string, TxnRow[]>();
  for (const row of txns) {
    if (!row.trip_id) continue;
    const list = txnsByTrip.get(row.trip_id) ?? [];
    list.push(row);
    txnsByTrip.set(row.trip_id, list);
  }

  const approverIds = withAdvance.map((s) => s.complianceVerifiedBy ?? s.advance?.actorId ?? null);
  const supplierCache = new Map<string, Promise<SupplierBank>>();
  const [approverNames] = await Promise.all([resolveComplianceActorNames(approverIds, orgId)]);

  const entries = await mapWithConcurrency(
    withAdvance,
    EXPORT_FETCH_CONCURRENCY,
    async (summary): Promise<[string, AdvanceProcessedEnrichment]> => {
      const trip = summary.trip;
      const advance = summary.advance!;
      const fromFinance = advance.transactionId.startsWith(FINANCE_RECEIPT_PREFIX);
      const rows = txnsByTrip.get(trip.id) ?? [];
      const receipts = rows.filter(
        (row) => row.ledger_category !== "compliance_advance" && row.ledger_category !== "compliance_balance",
      );
      const ledgerRow = fromFinance
        ? receipts[receipts.length - 1] ?? null
        : rows.find((row) => row.id === advance.transactionId) ?? null;

      const bank = await resolveTripPayeeBank(orgId, trip, supplierCache);
      const approverId = summary.complianceVerifiedBy ?? advance.actorId ?? "";

      return [
        trip.id,
        {
          transactionId: ledgerRow?.id ?? null,
          utrCategory: fromFinance ? "finance_receipt" : "compliance_advance",
          payment: ledgerRow ? toPaymentSummary([ledgerRow]) : null,
          extraReceipts: fromFinance ? Math.max(0, receipts.length - 1) : 0,
          requestId: requests[trip.id]?.requestNo ?? "",
          supplierName: bank.name,
          beneficiaryName: bank.beneficiary,
          approvedBy: (approverId && approverNames[approverId]) || "",
          bankName: bank.bankName,
          ifsc: bank.ifsc,
          accountNumber: bank.accountNumber,
          branch: bank.branch,
        },
      ];
    },
  );
  return Object.fromEntries(entries);
}
