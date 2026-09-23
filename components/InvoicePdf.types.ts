export interface InvoicePdfItem {
  key: string;
  tripId: string;
  route: string;
  date: string;
  amount: number;
  lineType: 'freight' | 'fuel' | 'additional';
  /** UUID of the parent trip when this line belongs under freight. */
  tripKey?: string | null;
  nested?: boolean;
  splitKind?: 'cn' | 'dn' | null;
}

export interface InvoicePdfTaxRow {
  label: string;
  value: string;
}

export interface InvoicePdfData {
  documentKind: 'draft' | 'issued';
  brandingCompanyName: string;
  brandingLogoUrl: string | null;
  invoiceNo: string;
  invoiceNumberCaption: string;
  clientName: string;
  previewDate: string;
  indicativeDueDate: string | null;
  issuerAddressLines: string[];
  issuerPan: string | null;
  issuerGstin: string | null;
  issuerGstNotApplicable: boolean;
  billingLines: string[];
  paymentTerms: string | null;
  notes: string | null;
  bankDetailsLines: string[];
  items: InvoicePdfItem[];
  taxableBase: number;
  taxRows: InvoicePdfTaxRow[];
  taxWarning: string | null;
  grandTotal: number;
}
