import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Match issued invoices to a partner by client_id first, then display name. */
export function issuedInvoicesForClient(
  invoices: readonly IssuedInvoiceListRow[],
  args: { clientId?: string | null; clientName?: string | null },
): IssuedInvoiceListRow[] {
  const clientId = (args.clientId ?? "").trim();
  if (clientId) {
    const byId = invoices.filter((row) => (row.client_id ?? "").trim() === clientId);
    if (byId.length > 0) return byId;
  }
  const name = normalizeName(args.clientName);
  if (!name) return [];
  return invoices.filter((row) => normalizeName(row.client_name) === name);
}
