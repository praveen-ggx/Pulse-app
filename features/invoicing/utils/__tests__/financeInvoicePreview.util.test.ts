import { readFileSync } from "fs";
import { join } from "path";
import {
  financeCreateInvoiceLabel,
  financeInvoiceNumberLabel,
  financeRouteScreenOwner,
  invoicePreviewCanSaveDraft,
  invoicePreviewItemsFromDraft,
  manualInvoicePersistIdentity,
  resolveFinancePreviewKind,
  resolveInvoicePreviewItemSource,
} from "../financeInvoicePreview.util";
import {
  buildSavedInvoicePreviewModel,
  parseSavedInvoiceLines,
} from "../savedInvoicePreview.util";
import { buildManualInvoiceLines, emptyManualInvoiceLine } from "../manualInvoice.util";
import { buildInvoiceDraftModelFromManualLines } from "../../services/invoicePreviewModel.service";

const issuer = {
  orgId: "org",
  businessName: "Issuer",
  addressLines: [],
  city: null,
  state: "KA",
  pincode: null,
  pan: null,
  gstin: "29AAAAA0000A1Z5",
  gstNotApplicable: false,
  logoUrl: null,
};

describe("finance invoice preview wiring", () => {
  it("maps Finance routes to InvoicingExecuteScreen and order to SourceInvoiceEditorScreen", () => {
    expect(financeRouteScreenOwner("/pulse-invoice")).toEqual({
      screen: "InvoicingExecuteScreen",
      compose: "trips",
    });
    expect(financeRouteScreenOwner("/invoicing-execute")).toEqual({
      screen: "InvoicingExecuteScreen",
      compose: "trips",
    });
    expect(financeRouteScreenOwner("/invoicing-execute/create")).toEqual({
      screen: "InvoicingExecuteScreen",
      compose: "create",
    });
    expect(financeRouteScreenOwner("/invoicing-execute/manual")).toEqual({
      screen: "InvoicingExecuteScreen",
      compose: "manual",
    });
    expect(financeRouteScreenOwner("/pulse-invoice/manual")).toEqual({
      screen: "InvoicingExecuteScreen",
      compose: "manual",
    });
    expect(financeRouteScreenOwner("/pulse-invoice/order/abc")).toEqual({
      screen: "SourceInvoiceEditorScreen",
    });
  });

  it("route files mount the operational workspace, not history-only admin", () => {
    const files = [
      "app/pulse-invoice/index.tsx",
      "app/pulse-invoice/manual.tsx",
      "app/invoicing-execute/index.tsx",
      "app/invoicing-execute/create.tsx",
      "app/invoicing-execute/manual.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).toContain("InvoicingExecuteScreen");
      expect(src).not.toContain("FinanceInvoiceAdminScreen");
      expect(src).not.toContain("PulseInvoiceLandingScreen");
    }
    const order = readFileSync(
      join(process.cwd(), "app/pulse-invoice/order/[orderId].tsx"),
      "utf8",
    );
    const executeOrder = readFileSync(
      join(process.cwd(), "app/invoicing-execute/order/[orderId].tsx"),
      "utf8",
    );
    expect(order).toContain("SourceInvoiceEditorScreen");
    expect(executeOrder).toContain("SourceInvoiceEditorScreen");
    expect(order).not.toContain("InvoicingExecuteScreen");
    expect(financeRouteScreenOwner("/invoicing-execute/order/abc")).toEqual({
      screen: "SourceInvoiceEditorScreen",
    });
  });

  it("manual mode with no selected trips still shows draft.lines", () => {
    const lines = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("1"),
        description: "Consulting Service",
        sku: "MAN-001",
        hsnSac: "996511",
        qty: "1",
        rate: "25000",
      },
    ]);
    expect(lines.length).toBeGreaterThan(0);
    expect(
      resolveInvoicePreviewItemSource({
        selectedTripCount: 0,
        draftLineCount: lines.length,
      }),
    ).toBe("draft-lines");
    expect(invoicePreviewItemsFromDraft(lines).count).toBe(1);
  });

  it("trip mode with selected trips uses selected-trips items", () => {
    expect(
      resolveInvoicePreviewItemSource({
        selectedTripCount: 2,
        draftLineCount: 2,
      }),
    ).toBe("selected-trips");
  });

  it("issued manual invoice with empty trip_ids still shows persisted line_items", () => {
    const lines = parseSavedInvoiceLines([
      {
        description: "Consulting Service",
        trip_ref: "MAN-001",
        hsn_sac: "996511",
        qty: 1,
        rate: 25000,
        taxable_value: 25000,
        line_type: "goods",
      },
    ]);
    expect(
      resolveInvoicePreviewItemSource({
        selectedTripCount: 0,
        draftLineCount: lines.length,
      }),
    ).toBe("draft-lines");
    const model = buildSavedInvoicePreviewModel({
      issuer,
      invoiceNumber: "INV/2026-27/00099",
      invoiceDate: "2026-09-22",
      paymentTerms: null,
      notes: null,
      client: {
        client_id: "c",
        legal_name: "Apple",
        display_name: "Apple",
        gstin: null,
        pan: null,
        billing_address: null,
        state: null,
        email: null,
      },
      lines,
      subtotal: 25000,
      gstRate: 18,
      cgstAmount: 2250,
      sgstAmount: 2250,
      igstAmount: 0,
      totalAmount: 29500,
    });
    expect(model).not.toBeNull();
    expect(invoicePreviewItemsFromDraft(model?.lines).count).toBe(1);
  });

  it("manual Save Draft is enabled with 0 trips and 2 lines; persist identity is manual", () => {
    const two = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("1"),
        description: "Consulting Service",
        sku: "MAN-001",
        hsnSac: "996511",
        qty: "1",
        rate: "25000",
      },
      {
        ...emptyManualInvoiceLine("2"),
        description: "Support",
        sku: "MAN-002",
        hsnSac: "996512",
        qty: "2",
        rate: "5000",
      },
    ]);
    expect(two).toHaveLength(2);
    expect(
      invoicePreviewCanSaveDraft({
        hasExternalDraft: two.length > 0,
        selectedTripCount: 0,
      }),
    ).toBe(true);
    expect(manualInvoicePersistIdentity()).toEqual({
      invoice_source: "manual",
      trip_ids: [],
    });
    const service = readFileSync(
      join(__dirname, "../../services/manualInvoice.service.ts"),
      "utf8",
    );
    expect(service).toContain('invoice_source: "manual"');
    expect(service).toContain("trip_ids: []");
  });

  it("Commerce order editor stays source-specific and POD hard-copy RPC is unchanged", () => {
    const editor = readFileSync(
      join(__dirname, "../../screens/SourceInvoiceEditorScreen.tsx"),
      "utf8",
    );
    expect(editor).toContain("buildCommerceOrderInvoiceDraft");
    expect(editor).not.toContain("selectedTripIds");
    const pod = readFileSync(
      join(__dirname, "../../services/__tests__/invoiceLogPodAction.contract.test.ts"),
      "utf8",
    );
    expect(pod).toContain("record_trip_hard_copy_pod");
  });

  it("create invoice label follows eligible count", () => {
    expect(financeCreateInvoiceLabel(0)).toBe("Create Invoice");
    expect(financeCreateInvoiceLabel(1)).toBe("Create Invoice (1)");
    expect(financeCreateInvoiceLabel(2)).toBe("Create Invoice (2)");
  });

  it("draft number is DRAFT; issued uses INV", () => {
    expect(financeInvoiceNumberLabel({ issued: false })).toBe("DRAFT");
    expect(financeInvoiceNumberLabel({ issued: true, invoiceNumber: "INV/2026-27/00006" })).toBe(
      "INV/2026-27/00006",
    );
  });

  it("save draft is allowed for manual external draft with zero selected trips", () => {
    expect(
      invoicePreviewCanSaveDraft({ hasExternalDraft: true, selectedTripCount: 0 }),
    ).toBe(true);
    expect(
      invoicePreviewCanSaveDraft({ hasExternalDraft: false, selectedTripCount: 0 }),
    ).toBe(false);
    expect(
      invoicePreviewCanSaveDraft({ hasExternalDraft: false, selectedTripCount: 1 }),
    ).toBe(true);
  });

  it("select 1 then 2 manual lines updates preview item count", () => {
    const one = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("1"),
        description: "Consulting Service",
        sku: "MAN-001",
        hsnSac: "996511",
        qty: "1",
        rate: "25000",
      },
    ]);
    expect(invoicePreviewItemsFromDraft(one).count).toBe(1);
    const two = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("1"),
        description: "Consulting Service",
        sku: "MAN-001",
        hsnSac: "996511",
        qty: "1",
        rate: "25000",
      },
      {
        ...emptyManualInvoiceLine("2"),
        description: "Support",
        sku: "MAN-002",
        hsnSac: "996512",
        qty: "2",
        rate: "5000",
      },
    ]);
    expect(invoicePreviewItemsFromDraft(two).count).toBe(2);
    expect(invoicePreviewItemsFromDraft(two).descriptions).toEqual([
      "Consulting Service",
      "Support",
    ]);
    const draft = buildInvoiceDraftModelFromManualLines({
      issuer,
      client: {
        client_id: "c",
        legal_name: "Apple",
        display_name: "Apple",
        gstin: null,
        pan: null,
        billing_address: null,
        state: "MH",
        email: null,
      },
      lines: two,
      previewDate: "2026-09-22",
      paymentTerms: "Net 30",
      notes: null,
      includeGst: true,
      gstRate: 18,
    });
    expect(draft.invoice_number_label).toBe("DRAFT");
    expect(draft.lines).toHaveLength(2);
    expect(draft.tax.taxable_base).toBe(35000);
  });

  it("issued snapshot reconstructs preview lines without trip_ids", () => {
    const lines = parseSavedInvoiceLines([
      {
        description: "QA-SKU-1",
        trip_ref: "QA-SKU-1",
        hsn_sac: "996511",
        qty: 1,
        rate: 10000,
        taxable_value: 10000,
        line_type: "goods",
      },
    ]);
    const model = buildSavedInvoicePreviewModel({
      issuer,
      invoiceNumber: "INV/2026-27/00006",
      invoiceDate: "2026-09-21",
      paymentTerms: "Net 30",
      notes: null,
      client: {
        client_id: "qa",
        legal_name: "QA Commerce Client",
        display_name: "QA Commerce Client",
        gstin: null,
        pan: null,
        billing_address: null,
        state: null,
        email: null,
      },
      lines,
      subtotal: 10000,
      gstRate: 18,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalAmount: 11800,
    });
    expect(model?.document_kind).toBe("issued");
    expect(model?.invoice_number_label).toBe("INV/2026-27/00006");
    expect(invoicePreviewItemsFromDraft(model?.lines).count).toBe(1);
  });

  it("preview kind is never silent blank when a draft exists", () => {
    expect(
      resolveFinancePreviewKind({
        composeMode: "manual",
        hasManualDraft: true,
        previewTripCount: 0,
        hasIssuedInspect: false,
      }),
    ).toBe("manual");
    expect(
      resolveFinancePreviewKind({
        composeMode: "trips",
        hasManualDraft: false,
        previewTripCount: 2,
        hasIssuedInspect: false,
      }),
    ).toBe("trip");
    expect(
      resolveFinancePreviewKind({
        composeMode: "trips",
        invoiceSurface: "issued",
        hasManualDraft: false,
        previewTripCount: 0,
        hasIssuedInspect: true,
      }),
    ).toBe("issued");
    expect(
      resolveFinancePreviewKind({
        composeMode: "trips",
        hasManualDraft: false,
        previewTripCount: 0,
        hasIssuedInspect: false,
      }),
    ).toBe("empty");
  });

  it("placeholder persisted manual lines stay placeholder after parse, not dropped", () => {
    const parsed = parseSavedInvoiceLines([{ qty: 1 }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.description).toBe("Line item");
    expect(parsed[0]?.rate).toBe(0);
    expect(parsed[0]?.hsn_sac).toBeNull();
    expect(
      resolveInvoicePreviewItemSource({
        selectedTripCount: 0,
        draftLineCount: parsed.length,
      }),
    ).toBe("draft-lines");
  });

  it("historical trip invoices with empty line_items do not build a saved draft model", () => {
    expect(parseSavedInvoiceLines(null)).toEqual([]);
    expect(parseSavedInvoiceLines([])).toEqual([]);
    expect(
      buildSavedInvoicePreviewModel({
        issuer,
        invoiceNumber: "INV/2026-27/00001",
        invoiceDate: "2026-09-10",
        paymentTerms: null,
        notes: null,
        client: {
          client_id: "apple",
          legal_name: "Apple",
          display_name: "Apple",
          gstin: null,
          pan: null,
          billing_address: null,
          state: null,
          email: null,
        },
        lines: [],
        subtotal: 100000,
        gstRate: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 100000,
      }),
    ).toBeNull();
    expect(
      resolveInvoicePreviewItemSource({
        selectedTripCount: 2,
        draftLineCount: 0,
      }),
    ).toBe("selected-trips");
  });

  it("InvoicePreviewPanel renders draft.lines when no trips are selected", () => {
    const panel = readFileSync(
      join(__dirname, "../../components/InvoicePreviewPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("resolveInvoicePreviewItemSource");
    expect(panel).toContain('previewItemSource === "draft-lines"');
    expect(panel).toContain("invoicePreviewCanSaveDraft");
    expect(panel).toContain("invoiceNumberLabel");
  });
});
