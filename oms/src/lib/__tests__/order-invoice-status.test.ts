import { resolveOrderInvoiceStatus } from '../order-invoice-status';

describe('OMS order invoice status', () => {
  it('shows issued number', () => {
    const s = resolveOrderInvoiceStatus({
      orderStatus: 'Fulfilled',
      activeInvoice: {
        id: 'i1',
        status: 'sent',
        invoice_number: 'INV/2026/00123',
      },
    });
    expect(s.action).toBe('view_invoice');
    expect(s.invoiceNumber).toBe('INV/2026/00123');
  });

  it('Fulfilled-only create', () => {
    expect(resolveOrderInvoiceStatus({ orderStatus: 'Planned' }).action).toBe('unavailable');
    expect(resolveOrderInvoiceStatus({ orderStatus: 'Fulfilled' }).action).toBe('create');
  });

  it('opens leftover draft on Planned without enabling Create Invoice', () => {
    const leftover = resolveOrderInvoiceStatus({
      orderStatus: 'Planned',
      activeInvoice: { id: 'd1', status: 'draft', invoice_number: 'DRAFT-1' },
    });
    expect(leftover.action).toBe('view_draft');
    expect(leftover.buttonLabel).toBe('Open Draft');
    expect(
      resolveOrderInvoiceStatus({ orderStatus: 'Planned' }).action,
    ).toBe('unavailable');
  });
});
