/**
 * Read customer receipts posted by payment capture.
 * Does not change invoice totals.
 */
import { supabase } from "@/lib/supabase";
import {
  groupCustomerReceipts,
  type CustomerReceipt,
  type ReceiptLedgerRow,
} from "@/features/invoicing/utils/customerReceiptList.util";

const COLUMNS =
  "id, trip_id, party_name, description, amount_in, transaction_date, created_at, contact_id, ledger_category, payment_reference";

export async function fetchCustomerReceipts(args: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
}): Promise<{ error: string | null; receipts: CustomerReceipt[] }> {
  const clientId = args.clientId && !args.clientId.startsWith("name:") ? args.clientId : null;
  const clientName = args.clientName?.trim().toLowerCase() || null;
  let { data, error } = await supabase()
    .from("transactions")
    .select(COLUMNS)
    .eq("organization_id", args.orgId)
    .in("ledger_category", ["customer_receipt", "tds_receivable"])
    .order("transaction_date", { ascending: false })
    .limit(300);
  if (error && /payment_reference/i.test(error.message)) {
    const retry = await supabase()
      .from("transactions")
      .select(COLUMNS.replace(", payment_reference", ""))
      .eq("organization_id", args.orgId)
      .in("ledger_category", ["customer_receipt", "tds_receivable"])
      .order("transaction_date", { ascending: false })
      .limit(300);
    data = retry.data;
    error = retry.error;
  }
  if (error) return { error: error.message, receipts: [] };
  const rows: ReceiptLedgerRow[] = (data ?? []).flatMap((row) => {
    const item = row as Record<string, unknown>;
    const contact = typeof item.contact_id === "string" ? item.contact_id : null;
    const party = typeof item.party_name === "string" ? item.party_name.trim().toLowerCase() : "";
    const sameClient = clientId ? contact === clientId || (clientName != null && party === clientName) : clientName != null && party === clientName;
    if (!sameClient) return [];
    return [{
      id: String(item.id ?? ""),
      tripId: typeof item.trip_id === "string" ? item.trip_id : null,
      description: typeof item.description === "string" ? item.description : "",
      amount: Number(item.amount_in) || 0,
      date: typeof item.transaction_date === "string" ? item.transaction_date : "",
      createdAt: typeof item.created_at === "string" ? item.created_at : null,
      category: typeof item.ledger_category === "string" ? item.ledger_category : null,
      reference: typeof item.payment_reference === "string" ? item.payment_reference : null,
    }];
  });
  return { error: null, receipts: groupCustomerReceipts(rows) };
}
