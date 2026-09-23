/**
 * Phase 2A-1: durable invoice document snapshot contracts.
 * Serialization only. Does not query, calculate GST, or issue invoices.
 */

import type { InvoiceIssuerWorkspace } from '@/features/invoicing/services/invoiceIssuerIdentity.service';
import { sanitizeOptionalHttpLogoUrl } from '@/features/invoicing/services/invoiceIssuerIdentity.service';

export const INVOICE_LINE_TYPES = ['freight', 'fuel', 'additional', 'goods', 'plan'] as const;
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

/** Stored on public.invoices.issuer_snapshot */
export type InvoiceIssuerSnapshot = {
  legal_name: string;
  address_line: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  business_pan: string | null;
  gstin: string | null;
  gst_not_applicable: boolean;
  logo_url: string | null;
  org_id: string;
};

/** Stored on public.invoices.client_snapshot */
export type InvoiceClientSnapshot = {
  client_id: string | null;
  legal_name: string;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  state: string | null;
  email: string | null;
};

/** Stored as an element of public.invoices.line_items */
export type InvoiceLineSnapshot = {
  trip_id: string | null;
  trip_ref: string | null;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  taxable_value: number;
  line_type: InvoiceLineType;
  hsn_sac: string | null;
  tax_rate: number | null;
};

/**
 * Stored on public.invoices.tax_snapshot.
 * 2A-2 widens metadata; amounts stay on invoices numeric columns.
 */
export type InvoiceTaxSnapshot = {
  supply_type: string | null;
  place_of_supply: string | null;
  hsn_sac: string | null;
  determination: string | null;
  issuer_gstin?: string | null;
  client_gstin?: string | null;
  issuer_gst_not_applicable?: boolean;
  issuer_gstin_state_code?: string | null;
  client_gstin_state_code?: string | null;
  issuer_state?: string | null;
  client_state?: string | null;
  gst_rate?: number;
  include_gst?: boolean;
};

/** Nullable document payload matching additive invoices columns. */
export type InvoiceDocumentSnapshots = {
  issuer_snapshot: InvoiceIssuerSnapshot | null;
  client_snapshot: InvoiceClientSnapshot | null;
  line_items: InvoiceLineSnapshot[] | null;
  tax_snapshot: InvoiceTaxSnapshot | null;
  payment_terms: string | null;
};

const TRACKING_DEBUG_FIELD_KEYS = new Set([
  'notes',
  'details',
  'tracking',
  'updates',
  'statusLog',
  'status_log',
  'driverTracking',
  'realtime',
  'debug',
  'activity',
]);

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function isLineType(value: string): value is InvoiceLineType {
  return (INVOICE_LINE_TYPES as readonly string[]).includes(value);
}

/**
 * Maps active workspace fields to an issuer snapshot.
 * Branding company name is never used as legal_name.
 * Logo URL is taken from the workspace (Phase 1: branding may overlay logo later at issue).
 */
export function buildInvoiceIssuerSnapshot(
  workspace: InvoiceIssuerWorkspace,
): InvoiceIssuerSnapshot {
  const legal_name = trimOrNull(workspace.name);
  const org_id = trimOrNull(workspace.id);
  if (!legal_name || !org_id) {
    throw new Error('Issuer snapshot requires workspace id and name.');
  }
  return {
    legal_name,
    address_line: trimOrNull(workspace.address_line),
    locality: trimOrNull(workspace.locality),
    city: trimOrNull(workspace.city),
    state: trimOrNull(workspace.state),
    pincode: trimOrNull(workspace.pincode),
    business_pan: trimOrNull(workspace.business_pan),
    gstin: trimOrNull(workspace.gstin),
    gst_not_applicable: workspace.gst_not_applicable === true,
    logo_url: sanitizeOptionalHttpLogoUrl(workspace.logo_url),
    org_id,
  };
}

export function buildInvoiceClientSnapshot(input: {
  client_id?: string | null;
  legal_name: string;
  gstin?: string | null;
  pan?: string | null;
  billing_address?: string | null;
  state?: string | null;
  email?: string | null;
}): InvoiceClientSnapshot {
  const legal_name = trimOrNull(input.legal_name);
  if (!legal_name) {
    throw new Error('Client snapshot requires legal_name.');
  }
  return {
    client_id: trimOrNull(input.client_id),
    legal_name,
    gstin: trimOrNull(input.gstin),
    pan: trimOrNull(input.pan),
    billing_address: trimOrNull(input.billing_address),
    state: trimOrNull(input.state),
    email: trimOrNull(input.email),
  };
}

export function buildInvoiceLineSnapshot(input: {
  trip_id?: string | null;
  trip_ref?: string | null;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  taxable_value: number;
  line_type: InvoiceLineType;
  hsn_sac?: string | null;
  tax_rate?: number | null;
}): InvoiceLineSnapshot {
  const description = trimOrNull(input.description);
  const unit = trimOrNull(input.unit);
  if (!description || !unit) {
    throw new Error('Line snapshot requires description and unit.');
  }
  if (!isLineType(input.line_type)) {
    throw new Error('Line snapshot line_type must be freight, fuel, additional, goods, or plan.');
  }
  return {
    trip_id: trimOrNull(input.trip_id),
    trip_ref: trimOrNull(input.trip_ref),
    description,
    qty: input.qty,
    unit,
    rate: input.rate,
    taxable_value: input.taxable_value,
    line_type: input.line_type,
    hsn_sac: trimOrNull(input.hsn_sac),
    tax_rate: input.tax_rate ?? null,
  };
}

/** Drops tracking/debug keys so trip objects cannot be stored as line snapshots. */
export function omitNonInvoiceLineFields(
  candidate: Record<string, unknown>,
): Partial<InvoiceLineSnapshot> {
  const out: Partial<InvoiceLineSnapshot> = {};
  const allowed: (keyof InvoiceLineSnapshot)[] = [
    'trip_id',
    'trip_ref',
    'description',
    'qty',
    'unit',
    'rate',
    'taxable_value',
    'line_type',
    'hsn_sac',
    'tax_rate',
  ];
  for (const key of allowed) {
    if (key in candidate && !TRACKING_DEBUG_FIELD_KEYS.has(key)) {
      (out as Record<string, unknown>)[key] = candidate[key];
    }
  }
  return out;
}

export function buildInvoiceTaxSnapshot(input?: Partial<InvoiceTaxSnapshot>): InvoiceTaxSnapshot {
  const snapshot: InvoiceTaxSnapshot = {
    supply_type: trimOrNull(input?.supply_type),
    place_of_supply: trimOrNull(input?.place_of_supply),
    hsn_sac: trimOrNull(input?.hsn_sac),
    determination: trimOrNull(input?.determination),
  };
  if (!input) return snapshot;
  snapshot.issuer_gstin = trimOrNull(input.issuer_gstin);
  snapshot.client_gstin = trimOrNull(input.client_gstin);
  snapshot.issuer_gst_not_applicable = input.issuer_gst_not_applicable === true;
  snapshot.issuer_gstin_state_code = trimOrNull(input.issuer_gstin_state_code);
  snapshot.client_gstin_state_code = trimOrNull(input.client_gstin_state_code);
  snapshot.issuer_state = trimOrNull(input.issuer_state);
  snapshot.client_state = trimOrNull(input.client_state);
  if (input.gst_rate !== undefined) snapshot.gst_rate = input.gst_rate;
  if (input.include_gst !== undefined) snapshot.include_gst = input.include_gst;
  return snapshot;
}

export function emptyInvoiceDocumentSnapshots(): InvoiceDocumentSnapshots {
  return {
    issuer_snapshot: null,
    client_snapshot: null,
    line_items: null,
    tax_snapshot: null,
    payment_terms: null,
  };
}

export function isInvoiceLineType(value: unknown): value is InvoiceLineType {
  return typeof value === 'string' && isLineType(value);
}
