import { getIdentityDb as getSupabase } from '@/lib/supabase';

export type OrderInvoiceRow = {
  id: string;
  status: string | null;
  invoice_number: string | null;
  invoice_source: string | null;
};

/** One bounded lookup for Order Detail. Do not call per row on the order list. */
export async function fetchActiveInvoiceForSalesOrder(args: {
  organizationId: string;
  salesOrderId: string;
}): Promise<OrderInvoiceRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('invoices')
    .select('id, status, invoice_number, invoice_source')
    .eq('org_id', args.organizationId)
    .eq('sales_order_id', args.salesOrderId)
    .not('status', 'in', '(void,cancelled)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    status: data.status ?? null,
    invoice_number: data.invoice_number ?? null,
    invoice_source: data.invoice_source ?? null,
  };
}
