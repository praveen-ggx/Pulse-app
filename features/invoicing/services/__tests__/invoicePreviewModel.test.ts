import { readFileSync } from 'fs';
import { join } from 'path';
import type { InvoiceIssuerIdentity } from '../invoiceIssuerIdentity.service';
import type { InvoiceDraftClientRow } from '../invoicePreviewClients.service';
import {
  buildInvoiceDraftModel,
  formatInvoicePreviewDate,
  invoiceDraftTaxDisplay,
  invoicingClientGroupKey,
  mapInvoiceDraftModelToPdfData,
} from '../invoicePreviewModel.service';
import { buildInvoicePdfTableRows, mergeInvoiceChargesWithTripCnDn } from '../invoiceCnDn.service';
import type { InvoicingTripView } from '../invoicing.service';

const ORG_A = '5b471ecb-fbfb-470e-95cf-525d789c761a';
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLIENT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PREVIEW_DATE = '2026-09-11';

function issuer(overrides: Partial<InvoiceIssuerIdentity> = {}): InvoiceIssuerIdentity {
  return {
    orgId: ORG_A,
    businessName: 'GOGOVAN INDIA PVT LTD',
    addressLines: ['perungudi', 'Chennai, Tamil Nadu, 600030'],
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600030',
    pan: 'DXCPA3007Q',
    gstin: '33DXCPA3007Q1Z1',
    gstNotApplicable: false,
    logoUrl: null,
    ...overrides,
  };
}

function trip(overrides: Partial<InvoicingTripView> = {}): InvoicingTripView {
  return {
    id: 'TRP-1',
    internal_id: '11111111-1111-4111-8111-111111111111',
    organization_id: ORG_A,
    client_id: CLIENT_A,
    client: 'Acme Logistics',
    supplier_name: 'Supplier',
    route: 'Chennai ➔ Bangalore',
    date: '2026-09-01',
    amount: 10000,
    status: 'approved',
    details: 'tracking-should-not-appear',
    checks: { poMatch: true, idConfirmed: true, podReceived: true },
    physicalPodReceived: true,
    digitalPodPresent: true,
    tripStatus: "completed",
    invoiced: false,
    issuedInvoiceNumber: null,
    inDraft: false,
    draftInvoiceNumber: null,
    ...overrides,
  };
}

function clientRow(overrides: Partial<InvoiceDraftClientRow> = {}): InvoiceDraftClientRow {
  return {
    id: CLIENT_A,
    organization_id: ORG_A,
    name: 'Acme Logistics',
    legal_name: 'ACME LOGISTICS PRIVATE LIMITED',
    gstin: '33AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    billing_address: '12 Industrial Estate',
    state: 'Tamil Nadu',
    email: 'ap@acme.example',
    ...overrides,
  };
}

const gstOnConfig = {
  includeGst: true,
  gstRate: 18,
  includeFuel: false,
  fuelRate: 0,
  additionalCharges: [],
};

describe('buildInvoiceDraftModel', () => {
  it('binds issuer identity to the active workspace', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: 'Net 30',
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.issuer.orgId).toBe(ORG_A);
    expect(model.issuer.businessName).toBe('GOGOVAN INDIA PVT LTD');
    expect(model.issuer.gstin).toBe('33DXCPA3007Q1Z1');
  });

  it('does not inject GOGOX or fake bank/GST identity', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    const blob = JSON.stringify(model);
    expect(blob.toLowerCase()).not.toContain('gogox');
    expect(blob).not.toContain('HDFC');
    expect(model.client.gstin).toBe('33AAAAA0000A1Z5');
    const pdf = mapInvoiceDraftModelToPdfData(model);
    expect(pdf.bankDetailsLines).toEqual([]);
  });

  it('GST-not-applicable draft shows zero GST', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer({ gstin: null, gstNotApplicable: true }),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.supply_type).toBe('not_applicable');
    expect(model.tax.cgst_amount).toBe(0);
    expect(model.tax.igst_amount).toBe(0);
    const display = invoiceDraftTaxDisplay(model.tax);
    expect(display.rows.some((r) => r.value === 'Not applicable')).toBe(true);
    expect(display.warning).toBeNull();
  });

  it('GST-off draft shows GST as ₹0 and is not labelled zero-rated', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: { ...gstOnConfig, includeGst: false },
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.supply_type).toBe('gst_off');
    expect(model.tax.total_amount).toBe(model.tax.taxable_base);
    const blob = JSON.stringify(invoiceDraftTaxDisplay(model.tax));
    expect(blob.toLowerCase()).not.toContain('zero-rated');
    expect(blob.toLowerCase()).not.toContain('zero rated');
  });

  it('intra-state GST-on shows CGST+SGST and zero IGST', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.supply_type).toBe('intra');
    expect(model.tax.cgst_amount).toBe(900);
    expect(model.tax.sgst_amount).toBe(900);
    expect(model.tax.igst_amount).toBe(0);
    const labels = invoiceDraftTaxDisplay(model.tax).rows.map((r) => r.key);
    expect(labels).toContain('cgst');
    expect(labels).toContain('sgst');
    expect(labels).not.toContain('igst');
  });

  it('inter-state GST-on shows IGST only', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow({ gstin: '27AAAAA0000A1Z5', state: 'Maharashtra' })],
    });
    expect(model.tax.supply_type).toBe('inter');
    expect(model.tax.igst_amount).toBe(1800);
    expect(model.tax.cgst_amount).toBe(0);
    expect(model.tax.sgst_amount).toBe(0);
    const labels = invoiceDraftTaxDisplay(model.tax).rows.map((r) => r.key);
    expect(labels).toContain('igst');
    expect(labels).not.toContain('cgst');
    expect(labels).not.toContain('sgst');
  });

  it('blocked GST-on does not look like a valid tax split', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [
        trip(),
        trip({
          id: 'TRP-2',
          internal_id: '22222222-2222-4222-8222-222222222222',
          client_id: CLIENT_B,
        }),
      ],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [
        clientRow(),
        clientRow({ id: CLIENT_B, gstin: '33BBBBB0000B1Z5' }),
      ],
    });
    expect(model.tax.status).toBe('blocked');
    expect(model.tax.block_reason).toBe('multiple_clients');
    expect(model.tax.cgst_amount).toBe(0);
    expect(model.tax.igst_amount).toBe(0);
    const display = invoiceDraftTaxDisplay(model.tax);
    expect(display.warning).toMatch(/more than one tax client/i);
    expect(display.rows.some((r) => r.key === 'cgst' || r.key === 'igst')).toBe(false);
  });

  it('never displays non-zero IGST together with non-zero CGST/SGST', () => {
    const intra = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    const inter = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow({ gstin: '27AAAAA0000A1Z5', state: 'Maharashtra' })],
    });
    expect(intra.tax.igst_amount > 0 && intra.tax.cgst_amount > 0).toBe(false);
    expect(inter.tax.igst_amount > 0 && inter.tax.cgst_amount > 0).toBe(false);
  });

  it('preview total equals tax-engine total and PDF maps the same model', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: { ...gstOnConfig, includeFuel: true, fuelRate: 2.5 },
      previewDate: PREVIEW_DATE,
      paymentTerms: 'Net 15',
      notes: 'PO-1',
      fetchedClients: [clientRow()],
    });
    expect(model.tax.total_amount).toBe(model.tax.taxable_base + model.tax.cgst_amount + model.tax.sgst_amount);
    const pdf = mapInvoiceDraftModelToPdfData(model);
    expect(pdf.grandTotal).toBe(model.tax.total_amount);
    expect(pdf.invoiceNo).toBe('DRAFT');
    expect(pdf.previewDate).toContain('2026');
    expect(model.preview_date).toBe(PREVIEW_DATE);
    expect(model.indicative_due_date).toBe('2026-09-26');
  });

  it('draft number is DRAFT and never an allocated serial', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.document_kind).toBe('draft');
    expect(model.invoice_number_label).toBe('DRAFT');
    expect(model.invoice_number_label).not.toMatch(/^INV-/);
    expect(mapInvoiceDraftModelToPdfData(model).invoiceNo).toBe('DRAFT');
  });

  it('includes fuel in taxable base and as a fuel line', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: { ...gstOnConfig, includeFuel: true, fuelRate: 2.5 },
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.taxable_base).toBe(10250);
    const fuel = model.lines.find((line) => line.line_type === 'fuel');
    expect(fuel?.taxable_value).toBe(250);
    expect(fuel?.hsn_sac).toBeNull();
    expect(mapInvoiceDraftModelToPdfData(model).grandTotal).toBe(model.tax.total_amount);
  });

  it('includes additional charges in taxable base and as additional lines', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: {
        ...gstOnConfig,
        additionalCharges: [{ id: '1', description: 'Detention', amount: 500 }],
      },
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.taxable_base).toBe(10500);
    const extra = model.lines.find((line) => line.line_type === 'additional');
    expect(extra?.description).toBe('Detention');
    expect(extra?.taxable_value).toBe(500);
    expect(mapInvoiceDraftModelToPdfData(model).grandTotal).toBe(model.tax.total_amount);
  });

  it('applies finance credit notes as negative additional lines on taxable base', () => {
    const t = trip();
    const charges = mergeInvoiceChargesWithTripCnDn([], [t], {
      [t.internal_id]: [
        {
          id: 'cn-1',
          trip_id: t.internal_id,
          type: 'revenue',
          impact: 'minus',
          amount: 1000,
          reason: 'Late Delivery',
        },
      ],
    });
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [t],
      config: { ...gstOnConfig, additionalCharges: charges },
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.tax.taxable_base).toBe(9000);
    expect(model.lines[0].line_type).toBe('freight');
    expect(model.lines[0].taxable_value).toBe(10000);
    expect(model.lines[1].line_type).toBe('additional');
    expect(model.lines[1].trip_id).toBe(t.internal_id);
    expect(model.lines[1].trip_ref).toBe(t.id);
    expect(model.lines[1].description).toContain('Credit note');
    const pdf = mapInvoiceDraftModelToPdfData(model);
    const rows = buildInvoicePdfTableRows(pdf.items);
    expect(rows.map((r) => r.rowRole)).toEqual(['freight', 'split', 'revised']);
    expect(rows[2].amount).toBe(9000);
    expect(rows[2].tripId).toBe('Invoiced');
  });

  it('does not invent HSN/SAC 996511', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(model.lines.every((line) => line.hsn_sac == null)).toBe(true);
    expect(JSON.stringify(model)).not.toContain('996511');
    expect(model.lines.some((line) => line.description.includes('tracking'))).toBe(false);
  });

  it('omits missing client tax fields instead of faking them', () => {
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: { ...gstOnConfig, includeGst: false },
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [
        clientRow({
          legal_name: null,
          gstin: null,
          pan: null,
          billing_address: null,
          state: null,
          email: null,
        }),
      ],
    });
    expect(model.client.gstin).toBeNull();
    expect(model.client.pan).toBeNull();
    expect(model.client.billing_address).toBeNull();
    const pdf = mapInvoiceDraftModelToPdfData(model);
    expect(pdf.billingLines.join(' ')).not.toMatch(/GSTIN/);
    expect(pdf.billingLines.join(' ')).not.toMatch(/\bPAN\b/);
  });

  it('groups GST-on by client_id not display name', () => {
    expect(invoicingClientGroupKey(trip({ client: 'Acme', client_id: CLIENT_A }))).toBe(CLIENT_A);
    expect(invoicingClientGroupKey(trip({ client: 'Acme', client_id: CLIENT_B }))).toBe(CLIENT_B);
    const model = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [
        trip({ client: 'Acme', client_id: CLIENT_A }),
        trip({
          id: 'TRP-2',
          internal_id: '22222222-2222-4222-8222-222222222222',
          client: 'Acme',
          client_id: CLIENT_B,
        }),
      ],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: null,
      notes: null,
      fetchedClients: [
        clientRow({ name: 'Acme' }),
        clientRow({ id: CLIENT_B, name: 'Acme', gstin: '27AAAAA0000A1Z5', state: 'Maharashtra' }),
      ],
    });
    expect(model.tax.status).toBe('blocked');
    expect(model.tax.block_reason).toBe('multiple_clients');
  });

  it('keeps a deterministic preview date', () => {
    const a = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: 'Net 30',
      notes: null,
      fetchedClients: [clientRow()],
    });
    const b = buildInvoiceDraftModel({
      issuer: issuer(),
      trips: [trip()],
      config: gstOnConfig,
      previewDate: PREVIEW_DATE,
      paymentTerms: 'Net 30',
      notes: null,
      fetchedClients: [clientRow()],
    });
    expect(a.preview_date).toBe(b.preview_date);
    expect(formatInvoicePreviewDate(PREVIEW_DATE)).toBe(PREVIEW_DATE);
  });
});

describe('invoicePreviewModel source contract', () => {
  const src = readFileSync(join(__dirname, '../invoicePreviewModel.service.ts'), 'utf8');
  const pdfRoute = readFileSync(
    join(__dirname, '../../../../app/invoicing/pdf-preview.tsx'),
    'utf8',
  );

  it('does not call the allocator or execute path', () => {
    expect(src).not.toMatch(/allocate_invoice_number/);
    expect(src).not.toMatch(/\bexecuteInvoiceCreation\b/);
    expect(src).not.toMatch(/useExecuteInvoiceMutation/);
    expect(src).not.toMatch(/buildInvoiceNo/);
    expect(src).not.toMatch(/from\(['"]invoices['"]\)/);
    expect(src).not.toMatch(/supabase/);
  });

  it('pdf-preview route has no issue mutation path', () => {
    expect(pdfRoute).not.toMatch(/useExecuteInvoiceMutation/);
    expect(pdfRoute).not.toMatch(/executeInvoiceCreation/);
    expect(pdfRoute).not.toMatch(/handleFinalizeAndSend/);
    expect(pdfRoute).not.toMatch(/onFinalize/);
    expect(pdfRoute).not.toMatch(/buildInvoiceNo/);
    expect(pdfRoute).not.toMatch(/Issue Invoice/);
  });
});
