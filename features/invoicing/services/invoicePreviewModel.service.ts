/**
 * Phase 2A-3: canonical DRAFT invoice document model.
 * Pure. No database client, no allocator, no invoice insert.
 */

import type { InvoicePdfData, InvoicePdfItem, InvoicePdfTaxRow } from '@/components/InvoicePdf.types';
import type { InvoiceLineSnapshot } from '@/features/invoicing/services/invoiceDocumentSnapshot.service';
import { buildInvoiceLineSnapshot } from '@/features/invoicing/services/invoiceDocumentSnapshot.service';
import type { InvoiceIssuerIdentity } from '@/features/invoicing/services/invoiceIssuerIdentity.service';
import {
  computeInvoiceTax,
  round2,
  type InvoiceTaxClientInput,
  type InvoiceTaxResult,
} from '@/features/invoicing/services/invoiceTax.service';
import type { AdditionalCharge, InvoiceConfig, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import type { InvoiceDraftClientRow } from '@/features/invoicing/services/invoicePreviewClients.service';
import { splitChargesForInvoiceTrips } from '@/features/invoicing/services/invoiceCnDn.service';

export const INVOICE_DRAFT_NUMBER_LABEL = 'DRAFT' as const;
export const INVOICE_DRAFT_NUMBER_CAPTION = 'Invoice number assigned on issue';

export type InvoiceDraftClientView = {
  client_id: string | null;
  legal_name: string | null;
  display_name: string;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  state: string | null;
  email: string | null;
};

export type InvoiceDraftModel = {
  document_kind: 'draft' | 'issued';
  invoice_number_label: string;
  preview_date: string;
  indicative_due_date: string | null;
  payment_terms: string | null;
  notes: string | null;
  issuer: InvoiceIssuerIdentity;
  client: InvoiceDraftClientView;
  lines: InvoiceLineSnapshot[];
  tax: InvoiceTaxResult;
};

export type InvoiceDraftTaxDisplayRow = {
  key: string;
  label: string;
  value: string;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function formatInr(amount: number): string {
  return (
    '₹' +
    amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatHalfRate(gstRate: number): string {
  const half = round2(gstRate / 2);
  return Number.isInteger(half) ? String(half) : half.toFixed(2);
}

export function invoicingClientGroupKey(trip: {
  client_id?: string | null;
  client: string;
}): string {
  const id = trimOrNull(trip.client_id);
  if (id) return id;
  return `name:${trip.client}`;
}

export function formatInvoicePreviewDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function displayInvoicePreviewDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function parsePaymentTermDays(paymentTerms: string | null | undefined): number | null {
  const raw = trimOrNull(paymentTerms);
  if (!raw) return null;
  if (/due on receipt/i.test(raw)) return 0;
  const match = /(?:net\s*)?(\d+)/i.exec(raw);
  if (!match) return null;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : null;
}

export function indicativeDueDateFromPreview(
  previewDate: string,
  paymentTerms: string | null | undefined,
): string | null {
  const days = parsePaymentTermDays(paymentTerms);
  if (days == null) return null;
  const d = new Date(`${previewDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return formatInvoicePreviewDate(d);
}

export function taxBlockReasonCopy(reason: InvoiceTaxResult['block_reason']): string {
  switch (reason) {
    case 'multiple_clients':
      return 'GST cannot be calculated: selected trips belong to more than one tax client. Turn GST off, or select trips for a single client.';
    case 'insufficient_tax_state':
      return 'GST cannot be calculated: issuer and client GSTIN state codes or declared states are missing.';
    case 'cross_org_client':
      return 'GST cannot be calculated: the client belongs to a different workspace.';
    case 'cross_org_trips':
      return 'GST cannot be calculated: selected trips are not all in the active workspace.';
    default:
      return 'GST cannot be calculated for this draft.';
  }
}

export function invoiceDraftTaxDisplay(tax: InvoiceTaxResult): {
  rows: InvoiceDraftTaxDisplayRow[];
  warning: string | null;
} {
  const taxable: InvoiceDraftTaxDisplayRow = {
    key: 'taxable',
    label: 'Taxable amount',
    value: formatInr(tax.taxable_base),
  };

  if (tax.status === 'blocked') {
    return {
      warning: taxBlockReasonCopy(tax.block_reason),
      rows: [taxable],
    };
  }

  if (tax.supply_type === 'not_applicable') {
    return {
      warning: null,
      rows: [
        taxable,
        { key: 'gst', label: 'GST', value: 'Not applicable' },
      ],
    };
  }

  if (tax.supply_type === 'gst_off') {
    return {
      warning: null,
      rows: [
        taxable,
        { key: 'gst', label: 'GST', value: formatInr(0) },
      ],
    };
  }

  if (tax.supply_type === 'intra') {
    const half = formatHalfRate(tax.gst_rate);
    return {
      warning: null,
      rows: [
        taxable,
        { key: 'cgst', label: `CGST @ ${half}%`, value: formatInr(tax.cgst_amount) },
        { key: 'sgst', label: `SGST @ ${half}%`, value: formatInr(tax.sgst_amount) },
      ],
    };
  }

  if (tax.supply_type === 'inter') {
    return {
      warning: null,
      rows: [
        taxable,
        { key: 'igst', label: `IGST @ ${tax.gst_rate}%`, value: formatInr(tax.igst_amount) },
      ],
    };
  }

  return { warning: null, rows: [taxable] };
}

function buildDraftLines(
  trips: InvoicingTripView[],
  config: InvoiceConfig,
  gstRateForLines: number | null,
): InvoiceLineSnapshot[] {
  const lines: InvoiceLineSnapshot[] = [];
  const freightTotal = trips.reduce((acc, t) => acc + (Number.isFinite(t.amount) ? t.amount : 0), 0);
  const { byTripKey, unassigned } = splitChargesForInvoiceTrips(
    config.additionalCharges ?? [],
    trips,
  );

  const pushCharge = (
    charge: AdditionalCharge,
    trip: InvoicingTripView | null,
  ) => {
    const amount = Number(charge.amount) || 0;
    const description = trimOrNull(charge.description);
    if (!description && amount === 0) return;
    lines.push(
      buildInvoiceLineSnapshot({
        trip_id: trip ? trimOrNull(trip.internal_id) : trimOrNull(charge.tripId),
        trip_ref: trip ? trimOrNull(trip.id) : null,
        description: description || 'Additional charge',
        qty: 1,
        unit: 'charge',
        rate: amount,
        taxable_value: amount,
        line_type: 'additional',
        hsn_sac: null,
        tax_rate: gstRateForLines,
      }),
    );
  };

  for (const trip of trips) {
    const amount = Number.isFinite(trip.amount) ? trip.amount : 0;
    lines.push(
      buildInvoiceLineSnapshot({
        trip_id: trimOrNull(trip.internal_id),
        trip_ref: trimOrNull(trip.id),
        description: trimOrNull(trip.route) || 'Freight',
        qty: 1,
        unit: 'trip',
        rate: amount,
        taxable_value: amount,
        line_type: 'freight',
        hsn_sac: null,
        tax_rate: gstRateForLines,
      }),
    );
    const tripCharges = byTripKey.get(trip.internal_id || trip.id) ?? [];
    for (const charge of tripCharges) {
      pushCharge(charge, trip);
    }
  }

  if (config.includeFuel) {
    const fuel = round2(freightTotal * ((config.fuelRate || 0) / 100));
    lines.push(
      buildInvoiceLineSnapshot({
        trip_id: null,
        trip_ref: null,
        description: `Fuel surcharge (${config.fuelRate}%)`,
        qty: 1,
        unit: 'surcharge',
        rate: fuel,
        taxable_value: fuel,
        line_type: 'fuel',
        hsn_sac: null,
        tax_rate: gstRateForLines,
      }),
    );
  }

  for (const charge of unassigned) {
    pushCharge(charge, null);
  }

  return lines;
}

function resolveDraftClient(args: {
  trips: InvoicingTripView[];
  fetched: InvoiceDraftClientRow[];
  displayNameFallback: string | null;
}): InvoiceDraftClientView {
  const ids = Array.from(
    new Set(args.trips.map((t) => trimOrNull(t.client_id)).filter((id): id is string => Boolean(id))),
  );
  const byId = new Map(args.fetched.map((row) => [row.id, row]));
  const fallbackName =
    trimOrNull(args.displayNameFallback) ||
    trimOrNull(args.trips[0]?.client) ||
    'Select a client';

  if (ids.length > 1) {
    return {
      client_id: null,
      legal_name: null,
      display_name: 'Multiple clients',
      gstin: null,
      pan: null,
      billing_address: null,
      state: null,
      email: null,
    };
  }

  if (ids.length === 1) {
    const row = byId.get(ids[0]);
    const tripName = args.trips.find((t) => t.client_id === ids[0])?.client;
    return {
      client_id: ids[0],
      legal_name: row?.legal_name ?? null,
      display_name: row?.legal_name || row?.name || trimOrNull(tripName) || fallbackName,
      gstin: row?.gstin ?? null,
      pan: row?.pan ?? null,
      billing_address: row?.billing_address ?? null,
      state: row?.state ?? null,
      email: row?.email ?? null,
    };
  }

  return {
    client_id: null,
    legal_name: null,
    display_name: fallbackName,
    gstin: null,
    pan: null,
    billing_address: null,
    state: null,
    email: null,
  };
}

function taxClientsForEngine(
  trips: InvoicingTripView[],
  fetched: InvoiceDraftClientRow[],
): InvoiceTaxClientInput[] {
  const byId = new Map(fetched.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const clients: InvoiceTaxClientInput[] = [];
  for (const trip of trips) {
    const id = trimOrNull(trip.client_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    clients.push({
      client_id: id,
      gstin: row?.gstin ?? null,
      state: row?.state ?? null,
      organization_id: row?.organization_id ?? trip.organization_id ?? null,
    });
  }
  return clients;
}

export function buildInvoiceDraftModel(input: {
  issuer: InvoiceIssuerIdentity;
  trips: InvoicingTripView[];
  config: InvoiceConfig;
  previewDate: string;
  paymentTerms: string | null;
  notes: string | null;
  fetchedClients?: InvoiceDraftClientRow[];
  displayNameFallback?: string | null;
}): InvoiceDraftModel {
  const preview_date = formatInvoicePreviewDate(input.previewDate);
  const payment_terms = trimOrNull(input.paymentTerms);
  const notes = trimOrNull(input.notes);
  const fetched = input.fetchedClients ?? [];
  const client = resolveDraftClient({
    trips: input.trips,
    fetched,
    displayNameFallback: input.displayNameFallback ?? null,
  });

  const tripOrgIds = input.trips
    .map((t) => trimOrNull(t.organization_id) ?? input.issuer.orgId)
    .filter(Boolean);

  const tax = computeInvoiceTax({
    issuer: {
      org_id: input.issuer.orgId,
      gstin: input.issuer.gstin,
      gst_not_applicable: input.issuer.gstNotApplicable,
      state: input.issuer.state,
    },
    clients: taxClientsForEngine(input.trips, fetched),
    includeGst: input.config.includeGst,
    gstRate: input.config.gstRate,
    tripAmounts: input.trips.map((t) => t.amount),
    includeFuel: input.config.includeFuel,
    fuelRate: input.config.fuelRate,
    additionalCharges: input.config.additionalCharges,
    invoiceOrgId: input.issuer.orgId,
    tripOrgIds: tripOrgIds.length > 0 ? tripOrgIds : [input.issuer.orgId],
    hsn_sac: null,
  });

  const gstRateForLines =
    tax.status === 'ok' && (tax.supply_type === 'intra' || tax.supply_type === 'inter')
      ? tax.gst_rate
      : null;

  return {
    document_kind: 'draft',
    invoice_number_label: INVOICE_DRAFT_NUMBER_LABEL,
    preview_date,
    indicative_due_date: indicativeDueDateFromPreview(preview_date, payment_terms),
    payment_terms,
    notes,
    issuer: input.issuer,
    client,
    lines: buildDraftLines(input.trips, input.config, gstRateForLines),
    tax,
  };
}

export function buildInvoiceDraftModelFromManualLines(input: {
  issuer: InvoiceIssuerIdentity;
  client: InvoiceDraftClientView;
  lines: InvoiceLineSnapshot[];
  previewDate: string;
  paymentTerms: string | null;
  notes: string | null;
  includeGst: boolean;
  gstRate: number;
}): InvoiceDraftModel {
  const preview_date = formatInvoicePreviewDate(input.previewDate);
  const payment_terms = trimOrNull(input.paymentTerms);
  const notes = trimOrNull(input.notes);
  const tax = computeInvoiceTax({
    issuer: {
      org_id: input.issuer.orgId,
      gstin: input.issuer.gstin,
      gst_not_applicable: input.issuer.gstNotApplicable,
      state: input.issuer.state,
    },
    clients: [
      {
        client_id: input.client.client_id,
        gstin: input.client.gstin,
        state: input.client.state,
        organization_id: input.issuer.orgId,
      },
    ],
    includeGst: input.includeGst,
    gstRate: input.gstRate,
    tripAmounts: input.lines.map((line) => line.taxable_value),
    includeFuel: false,
    fuelRate: 0,
    additionalCharges: [],
    invoiceOrgId: input.issuer.orgId,
    tripOrgIds: [input.issuer.orgId],
    hsn_sac: input.lines[0]?.hsn_sac ?? null,
  });
  return {
    document_kind: 'draft',
    invoice_number_label: INVOICE_DRAFT_NUMBER_LABEL,
    preview_date,
    indicative_due_date: indicativeDueDateFromPreview(preview_date, payment_terms),
    payment_terms,
    notes,
    issuer: input.issuer,
    client: input.client,
    lines: input.lines,
    tax,
  };
}

function billingLinesFromClient(client: InvoiceDraftClientView): string[] {
  const lines: string[] = [];
  const name = trimOrNull(client.legal_name) || trimOrNull(client.display_name);
  if (name) lines.push(name);
  if (client.billing_address) lines.push(client.billing_address);
  if (client.state) lines.push(client.state);
  if (client.gstin) lines.push(`GSTIN ${client.gstin}`);
  if (client.pan) lines.push(`PAN ${client.pan}`);
  if (client.email) lines.push(client.email);
  return lines;
}

export function mapInvoiceDraftModelToPdfData(model: InvoiceDraftModel): InvoicePdfData {
  const { rows, warning } = invoiceDraftTaxDisplay(model.tax);
  const taxRows: InvoicePdfTaxRow[] = rows.map((row) => ({
    label: row.label,
    value: row.value,
  }));
  const items: InvoicePdfItem[] = model.lines.map((line, index) => {
    const nested = line.line_type === 'additional' && Boolean(line.trip_id);
    const desc = line.description ?? '';
    const splitKind: InvoicePdfItem['splitKind'] = nested
      ? desc.toLowerCase().includes('credit note')
        ? 'cn'
        : desc.toLowerCase().includes('debit note')
          ? 'dn'
          : null
      : null;
    return {
      key: `${line.line_type}-${line.trip_id ?? line.trip_ref ?? index}-${index}`,
      tripId: line.trip_ref || line.description,
      route: line.description,
      date: '',
      amount: line.taxable_value,
      lineType: line.line_type,
      tripKey: line.trip_id,
      nested,
      splitKind,
    };
  });

  return {
    brandingCompanyName: model.issuer.businessName,
    brandingLogoUrl: model.issuer.logoUrl,
    invoiceNo: model.invoice_number_label,
    invoiceNumberCaption:
      model.document_kind === 'issued'
        ? 'Tax Invoice'
        : INVOICE_DRAFT_NUMBER_CAPTION,
    clientName: model.client.display_name,
    previewDate: displayInvoicePreviewDate(model.preview_date),
    indicativeDueDate: model.indicative_due_date
      ? displayInvoicePreviewDate(model.indicative_due_date)
      : null,
    issuerAddressLines: model.issuer.addressLines,
    issuerPan: model.issuer.pan,
    issuerGstin: model.issuer.gstin,
    issuerGstNotApplicable: model.issuer.gstNotApplicable,
    billingLines: billingLinesFromClient(model.client),
    paymentTerms: model.payment_terms,
    notes: model.notes,
    bankDetailsLines: [],
    items,
    taxableBase: model.tax.taxable_base,
    taxRows,
    taxWarning: warning,
    grandTotal: model.tax.total_amount,
    documentKind: model.document_kind,
  };
}

export function uniqueTripClientIds(trips: InvoicingTripView[]): string[] {
  return Array.from(
    new Set(trips.map((t) => trimOrNull(t.client_id)).filter((id): id is string => Boolean(id))),
  );
}
