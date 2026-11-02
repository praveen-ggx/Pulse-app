import type { InvoicePdfItem } from '@/components/InvoicePdf.types';
import type { InvoicingTripView } from '../invoicing.service';
import type { InvoiceRevenueNote } from '../invoiceCnDn.service';
import {
  INVOICE_CNDN_CHARGE_ID_PREFIX,
  buildInvoicePdfTableRows,
  invoiceLinesForNoteSplit,
  groupInvoiceRevenueCnDn,
  invoiceOnlyCharges,
  invoiceTripAdjustedAmount,
  mergeInvoiceChargesWithTripCnDn,
} from '../invoiceCnDn.service';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';

function adj(overrides: Partial<InvoiceRevenueNote>): InvoiceRevenueNote {
  return {
    id: 'adj-1',
    type: 'revenue',
    impact: 'minus',
    amount: 1000,
    reason: 'Late Delivery',
    ...overrides,
  };
}

function trip(): InvoicingTripView {
  return {
    id: 'GOD-1',
    internal_id: TRIP_ID,
    organization_id: 'org',
    client_id: 'client',
    client: 'NVIDIA A',
    supplier_name: 'Fleet',
    route: 'Chennai ➔ Bengaluru',
    pickup: 'Chennai',
    delivery: 'Bengaluru',
    date: '2026-08-09',
    amount: 89000,
    status: 'approved',
    details: '',
    vehicle_number: null,
    load_type: null,
    lr_number: null,
    checks: { poMatch: true, idConfirmed: true, podReceived: true },
    physicalPodReceived: true,
    digitalPodPresent: true,
    tripStatus: "completed",
    invoiced: false,
    issuedInvoiceNumber: null,
    inDraft: false,
    draftInvoiceNumber: null,
  };
}

describe('invoiceCnDn.service', () => {
  it('groups sale CN and DN and ignores cost / voided for delta', () => {
    const grouped = groupInvoiceRevenueCnDn([
      adj({ id: 'cn', impact: 'minus', amount: 1000 }),
      adj({ id: 'dn', impact: 'plus', amount: 500, reason: 'Detention' }),
      adj({ id: 'cost', type: 'cost', impact: 'plus', amount: 200 }),
      adj({ id: 'void', impact: 'minus', amount: 50, voided_at: '2026-09-01T00:00:00Z' }),
    ]);
    expect(grouped.creditNotes).toHaveLength(1);
    expect(grouped.debitNotes).toHaveLength(1);
    expect(grouped.voided).toHaveLength(1);
    expect(grouped.delta).toBe(-500);
  });

  it('revises trip amount with finance revenue CN/DN', () => {
    expect(
      invoiceTripAdjustedAmount(89000, [
        adj({ impact: 'minus', amount: 1000 }),
        adj({ id: 'dn', impact: 'plus', amount: 250 }),
      ]),
    ).toBe(88250);
  });

  it('merges CN/DN into invoice charges without dropping custom charges', () => {
    const merged = mergeInvoiceChargesWithTripCnDn(
      [{ id: 'custom', description: 'Toll', amount: 100 }],
      [trip()],
      {
        [TRIP_ID]: [adj({ id: 'cn-1', impact: 'minus', amount: 1000 })],
      },
    );
    expect(merged.find((c) => c.id === 'custom')?.amount).toBe(100);
    const note = merged.find((c) => c.id === `${INVOICE_CNDN_CHARGE_ID_PREFIX}cn-1`);
    expect(note?.amount).toBe(-1000);
    expect(note?.description).toContain('Credit note');
    expect(invoiceOnlyCharges(merged)).toHaveLength(1);
  });

  it('places CN/DN under the trip and shows revised invoiced freight', () => {
    const items: InvoicePdfItem[] = [
      {
        key: 'f1',
        tripId: 'GOD-1',
        route: 'Chennai → Bengaluru',
        date: '',
        amount: 89000,
        lineType: 'freight',
        tripKey: TRIP_ID,
        nested: false,
        splitKind: null,
      },
      {
        key: 'cn1',
        tripId: 'GOD-1',
        route: 'Credit note — Loading Charges',
        date: '',
        amount: -250,
        lineType: 'additional',
        tripKey: TRIP_ID,
        nested: true,
        splitKind: 'cn',
      },
      {
        key: 'f2',
        tripId: 'GOD-2',
        route: 'Mumbai → Delhi',
        date: '',
        amount: 68000,
        lineType: 'freight',
        tripKey: '22222222-2222-4222-8222-222222222222',
        nested: false,
        splitKind: null,
      },
    ];
    const rows = buildInvoicePdfTableRows(items);
    expect(rows.map((r) => r.rowRole)).toEqual(['freight', 'split', 'revised', 'freight']);
    expect(rows[1].route).toContain('Credit note');
    expect(rows[2].route).toBe('Revised freight');
    expect(rows[2].amount).toBe(88750);
    expect(rows[2].tripId).toBe('Invoiced');
    expect(rows[3].amount).toBe(68000);
  });

  it('nests a late CN/DN line under the matching trip', () => {
    const items: InvoicePdfItem[] = [
      {
        key: 'f1',
        tripId: 'GOD684GODTRIP000004',
        route: 'Mumbai, Maharashtra → Delhi',
        date: '',
        amount: 68000,
        lineType: 'freight',
        tripKey: 'aaa',
        nested: false,
        splitKind: null,
      },
      {
        key: 'f2',
        tripId: 'GOD684GODTRIP000008',
        route: 'Chennai, Tamil Nadu → Bengaluru, Bangalore',
        date: '',
        amount: 89000,
        lineType: 'freight',
        tripKey: 'bbb',
        nested: false,
        splitKind: null,
      },
      {
        key: 'cn',
        tripId: 'GOD684GODTRIP000008',
        route: 'Credit note — Loading Charges',
        date: '',
        amount: -250,
        lineType: 'additional',
        tripKey: 'bbb',
        nested: true,
        splitKind: 'cn',
      },
    ];
    const rows = buildInvoicePdfTableRows(items);
    expect(rows.map((r) => r.rowRole)).toEqual([
      'freight',
      'freight',
      'split',
      'revised',
    ]);
    expect(rows[0].amount).toBe(68000);
    expect(rows[2].route).toContain('Loading Charges');
    expect(rows[3].amount).toBe(88750);
  });

  it('no-split mode shows only revised invoiced freight per trip', () => {
    const items: InvoicePdfItem[] = [
      {
        key: 'f1',
        tripId: 'GOD-1',
        route: 'Chennai → Bengaluru',
        date: '',
        amount: 89000,
        lineType: 'freight',
        tripKey: TRIP_ID,
        nested: false,
        splitKind: null,
      },
      {
        key: 'cn1',
        tripId: 'GOD-1',
        route: 'Credit note — Loading Charges',
        date: '',
        amount: -250,
        lineType: 'additional',
        tripKey: TRIP_ID,
        nested: true,
        splitKind: 'cn',
      },
    ];
    const rows = buildInvoicePdfTableRows(items, { showSplit: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].rowRole).toBe('freight');
    expect(rows[0].route).toBe('Chennai → Bengaluru');
    expect(rows[0].tripId).toBe('GOD-1');
    expect(rows[0].amount).toBe(88750);
  });

  it('folds credit and debit notes into a rounded freight amount when split is off', () => {
    const lines = invoiceLinesForNoteSplit(
      [
        {
          description: 'Freight charges · LR AI1025',
          trip_id: TRIP_ID,
          trip_ref: 'AI1025',
          line_type: 'freight',
          rate: 46390,
          taxable_value: 46390,
        },
        {
          description: 'Debit note — Loading Charges',
          trip_id: TRIP_ID,
          trip_ref: 'AI1025',
          line_type: 'additional',
          rate: 1000.4,
          taxable_value: 1000.4,
        },
        {
          description: 'Credit note — Damages',
          trip_id: TRIP_ID,
          trip_ref: 'AI1025',
          line_type: 'additional',
          rate: -4500.2,
          taxable_value: -4500.2,
        },
      ],
      false,
    );
    expect(lines.map((line) => line.description)).toEqual([
      'Freight charges · LR AI1025',
      'Round off',
    ]);
    expect(lines[0].taxable_value).toBe(42890);
    expect(lines[0].taxable_value + lines[1].taxable_value).toBeCloseTo(46390 + 1000.4 - 4500.2);
  });
});
