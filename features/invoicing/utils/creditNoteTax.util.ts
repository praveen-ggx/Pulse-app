/**
 * Credit-note tax preview. Mirrors issue_invoice_credit_note (20271103234500) so the
 * form can show the breakup before issue. The server is authoritative: the form
 * sends these figures and the server refuses the credit note if any differs.
 *
 * Rounding: half-up to paise on exact integer paise (BigInt), like Postgres
 * round(numeric, 2) for positive values and the invoice engine's round2.
 */

export type CreditTreatment = "gst" | "no_gst";
export type SupplyType = "intra" | "inter";

export type InvoiceTaxProfile = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  status: string;
  subtotal: number | null;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** Distinct GST rates on the invoice lines (empty when lines carry none). */
  lineRates: number[];
  snapshotSupply: string | null;
  prior: {
    total: number;
    gstTaxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    /** Earlier credit notes that carry tax but no breakup. */
    legacyTaxed: number;
  };
  /** Confirmed allocations on the invoice. */
  received: number;
  /** Refunds already paid out of credit-note credit on this invoice. */
  creditRefunded: number;
};

export type GstStructure =
  | {
      ok: true;
      supply: SupplyType;
      rate: number;
      base: number;
      remainingTaxable: number;
      remainingCgst: number;
      remainingSgst: number;
      remainingIgst: number;
    }
  | { ok: false; reason: string };

export type CreditLinePreview = { taxable: number; cgst: number; sgst: number; igst: number; tax: number; amount: number };

export type CreditPreview = {
  ok: boolean;
  error: string | null;
  treatment: CreditTreatment;
  supply: SupplyType | null;
  rate: number | null;
  lines: CreditLinePreview[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  amount: number;
  /** What the customer still owes on the invoice before this credit. */
  openBefore: number;
  /** Part of this credit above the open balance; held as customer credit. */
  customerCredit: number;
  /** Invoice value still creditable after this note. */
  creditableAfter: number;
};

const P = (n: number): bigint => BigInt(Math.round(n * 100));
const R = (p: bigint): number => Number(p) / 100;
const RATE_SCALE = 1000n;

/** round(taxable × rate / divisor, 2), half-up, in paise. divisor 100 = IGST, 200 = each of CGST/SGST. */
export function taxOnPaise(taxablePaise: bigint, rate: number, divisor: 100 | 200): bigint {
  const rateScaled = BigInt(Math.round(rate * Number(RATE_SCALE)));
  const num = taxablePaise * rateScaled;
  const den = BigInt(divisor) * RATE_SCALE;
  return (2n * num + den) / (2n * den);
}

export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

export function invoiceCreditableValue(profile: InvoiceTaxProfile): number {
  return R(P(profile.total) - P(profile.prior.total));
}

export function invoiceOpenBalance(profile: InvoiceTaxProfile): number {
  const open = P(profile.total) - P(profile.received) - P(profile.prior.total) + P(profile.creditRefunded);
  return R(open > 0n ? open : 0n);
}

export function gstStructure(profile: InvoiceTaxProfile): GstStructure {
  const tax = P(profile.cgst) + P(profile.sgst) + P(profile.igst);
  if (tax <= 0n) return { ok: false, reason: "This invoice carries no GST. Issue the credit note without GST." };
  if (P(profile.igst) > 0n && (P(profile.cgst) > 0n || P(profile.sgst) > 0n)) {
    return { ok: false, reason: "This invoice mixes IGST with CGST/SGST, so its tax cannot be credited automatically." };
  }
  const supply: SupplyType = P(profile.igst) > 0n ? "inter" : "intra";
  if ((profile.snapshotSupply === "intra" || profile.snapshotSupply === "inter") && profile.snapshotSupply !== supply) {
    return { ok: false, reason: "This invoice's GST amounts do not match its supply type." };
  }
  const rate = profile.gstRate;
  if (!(rate > 0) || rate > 40) return { ok: false, reason: "This invoice's GST rate is not available." };
  const rates = Array.from(new Set(profile.lineRates.map((r) => Math.round(r * 1000) / 1000)));
  if (rates.length > 1) {
    return { ok: false, reason: "This invoice has more than one GST rate. GST credit notes support single-rate invoices only." };
  }
  if (rates.length === 1 && rates[0] !== Math.round(rate * 1000) / 1000) {
    return { ok: false, reason: "This invoice's line GST rate does not match its rate." };
  }
  if (profile.prior.legacyTaxed > 0) {
    return { ok: false, reason: "This invoice has an earlier credit note without a GST breakup." };
  }
  const base = profile.subtotal != null ? P(profile.subtotal) : P(profile.total) - tax;
  if (absBig(tax - taxOnPaise(base, rate, 100)) > 100n) {
    return { ok: false, reason: "This invoice's tax does not match its GST rate." };
  }
  return {
    ok: true,
    supply,
    rate,
    base: R(base),
    remainingTaxable: R(base - P(profile.prior.gstTaxable)),
    remainingCgst: R(P(profile.cgst) - P(profile.prior.cgst)),
    remainingSgst: R(P(profile.sgst) - P(profile.prior.sgst)),
    remainingIgst: R(P(profile.igst) - P(profile.prior.igst)),
  };
}

function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function failure(treatment: CreditTreatment, profile: InvoiceTaxProfile, error: string): CreditPreview {
  return {
    ok: false,
    error,
    treatment,
    supply: null,
    rate: null,
    lines: [],
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    tax: 0,
    amount: 0,
    openBefore: invoiceOpenBalance(profile),
    customerCredit: 0,
    creditableAfter: invoiceCreditableValue(profile),
  };
}

/**
 * Preview a credit note. `values` are taxable amounts (GST) or credit amounts
 * (without GST), one per line, in rupees with at most two decimals.
 */
export function previewCreditNote(profile: InvoiceTaxProfile, treatment: CreditTreatment, values: readonly number[]): CreditPreview {
  if (values.length === 0) return failure(treatment, profile, "Add at least one line.");
  if (values.length > 50) return failure(treatment, profile, "A credit note has at most 50 lines.");
  for (const value of values) {
    if (!(value > 0)) return failure(treatment, profile, "Every line needs an amount greater than zero.");
    if (!hasAtMostTwoDecimals(value)) return failure(treatment, profile, "Amounts have at most two decimals.");
  }
  const inputs = values.map(P);
  const taxable = inputs.reduce((sum, v) => sum + v, 0n);
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  let lines: CreditLinePreview[];
  let supply: SupplyType | null = null;
  let rate: number | null = null;

  if (treatment === "gst") {
    const structure = gstStructure(profile);
    if (!structure.ok) return failure(treatment, profile, structure.reason);
    supply = structure.supply;
    rate = structure.rate;
    const remaining = P(structure.remainingTaxable);
    if (taxable > remaining) {
      return failure(treatment, profile, `The taxable value is more than the ${formatPlain(structure.remainingTaxable)} the invoice still carries.`);
    }
    if (taxable === remaining) {
      cgst = P(structure.remainingCgst);
      sgst = P(structure.remainingSgst);
      igst = P(structure.remainingIgst);
    } else if (supply === "intra") {
      cgst = taxOnPaise(taxable, rate, 200);
      sgst = cgst;
    } else {
      igst = taxOnPaise(taxable, rate, 100);
    }
    if (cgst < 0n || sgst < 0n || igst < 0n || cgst > P(structure.remainingCgst) || sgst > P(structure.remainingSgst) || igst > P(structure.remainingIgst)) {
      return failure(treatment, profile, "The credit is more than the tax left on the invoice.");
    }
    lines = [];
    let cum = 0n;
    let accC = 0n;
    let accS = 0n;
    let accG = 0n;
    for (let i = 0; i < inputs.length; i += 1) {
      const value = inputs[i]!;
      let c: bigint;
      let s: bigint;
      let g: bigint;
      if (i < inputs.length - 1) {
        if (supply === "intra") {
          c = taxOnPaise(cum + value, rate, 200) - taxOnPaise(cum, rate, 200);
          s = c;
          g = 0n;
        } else {
          c = 0n;
          s = 0n;
          g = taxOnPaise(cum + value, rate, 100) - taxOnPaise(cum, rate, 100);
        }
      } else {
        c = cgst - accC;
        s = sgst - accS;
        g = igst - accG;
      }
      if (c < 0n || s < 0n || g < 0n) {
        return failure(treatment, profile, "The tax cannot be split across these lines. Credit it as one line.");
      }
      cum += value;
      accC += c;
      accS += s;
      accG += g;
      lines.push({ taxable: R(value), cgst: R(c), sgst: R(s), igst: R(g), tax: R(c + s + g), amount: R(value + c + s + g) });
    }
  } else {
    lines = inputs.map((value) => ({ taxable: R(value), cgst: 0, sgst: 0, igst: 0, tax: 0, amount: R(value) }));
  }

  const amount = taxable + cgst + sgst + igst;
  const creditable = P(profile.total) - P(profile.prior.total);
  if (amount > creditable) {
    return failure(treatment, profile, `The credit is more than the ${formatPlain(R(creditable))} of this invoice not yet credited.`);
  }
  const openBefore = P(invoiceOpenBalance(profile));
  const customerCredit = amount > openBefore ? amount - openBefore : 0n;
  return {
    ok: true,
    error: null,
    treatment,
    supply,
    rate,
    lines,
    taxable: R(taxable),
    cgst: R(cgst),
    sgst: R(sgst),
    igst: R(igst),
    tax: R(cgst + sgst + igst),
    amount: R(amount),
    openBefore: R(openBefore),
    customerCredit: R(customerCredit),
    creditableAfter: R(creditable - amount),
  };
}

function formatPlain(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
