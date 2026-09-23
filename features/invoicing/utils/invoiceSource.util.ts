export type InvoiceBillingSource = "trip" | "order" | "manual" | "manual_plan";

export function invoiceSourceLabel(
  source: string | null | undefined,
): string {
  const normalized = (source ?? "").trim().toLowerCase();
  if (normalized === "order") return "Order";
  if (normalized === "manual" || normalized === "manual_plan") return "Manual";
  return "Trip";
}

export function invoiceSourceReference(args: {
  source?: string | null;
  orderNumber?: string | null;
  planName?: string | null;
  tripCount?: number;
}): string {
  const label = invoiceSourceLabel(args.source);
  if (label === "Order") {
    const n = (args.orderNumber ?? "").trim();
    return n || "Order";
  }
  if (label === "Manual") {
    return (args.planName ?? "").trim() || "Manual Invoice";
  }
  const count = args.tripCount ?? 0;
  return count > 0 ? `${count} trip${count === 1 ? "" : "s"}` : "Trip invoice";
}

/** Presentation for Finance history. Uses invoice_source only. */
export function financeInvoiceHistoryFields(args: {
  invoice_source?: string | null;
  sales_order_number?: string | null;
  trip_ids?: readonly string[] | null;
}): { source: string; reference: string } {
  const source = invoiceSourceLabel(args.invoice_source);
  return {
    source,
    reference: invoiceSourceReference({
      source: args.invoice_source,
      orderNumber: args.sales_order_number,
      tripCount: args.trip_ids?.length ?? 0,
    }),
  };
}

export function applySalesOrderNumbers<
  T extends { sales_order_id?: string | null; sales_order_number?: string | null },
>(rows: T[], numbersById: Record<string, string>): T[] {
  return rows.map((row) => {
    const id = (row.sales_order_id ?? "").trim();
    if (!id) return row;
    const number = numbersById[id];
    if (!number) return row;
    return { ...row, sales_order_number: number };
  });
}
