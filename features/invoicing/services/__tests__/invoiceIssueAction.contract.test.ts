import { readFileSync } from "fs";
import { join } from "path";

describe("Invoice Issue action ownership (F1)", () => {
  const executeSrc = readFileSync(
    join(__dirname, "../../InvoicingExecuteScreen.tsx"),
    "utf8",
  );
  const panelSrc = readFileSync(
    join(__dirname, "../../components/InvoicePreviewPanel.tsx"),
    "utf8",
  );
  const queriesSrc = readFileSync(
    join(__dirname, "../../../../lib/queries/useInvoicingExecuteQueries.ts"),
    "utf8",
  );
  const pdfRoute = readFileSync(
    join(__dirname, "../../../../app/invoicing/pdf-preview.tsx"),
    "utf8",
  );
  const financeProSrc = readFileSync(
    join(__dirname, "../../../../features/finance-pro/components/FinanceProCustomersEmbed.tsx"),
    "utf8",
  );

  it("Issue button exists in the execute-owned preview panel", () => {
    expect(panelSrc).toMatch(/accessibilityLabel="Issue Invoice"/);
    expect(panelSrc).toMatch(/Issue Invoice/);
    expect(executeSrc).toMatch(/isTripInvoiceable=\{isTripInvoiceable\}/);
    expect(executeSrc).toMatch(/evaluateFinanceWorkflowTrip|workflowForInvoiceTrip/);
    expect(executeSrc).not.toMatch(/isTripInvoiceable=\{\(\) => true\}/);
    expect(executeSrc).toMatch(/selectedInvoiceIssueBlockedReason/);
    expect(executeSrc).toMatch(/useExecuteInvoiceMutation/);
  });

  it("Issue uses useExecuteInvoiceMutation from the execute screen", () => {
    expect(executeSrc).toMatch(/issueMutation\.mutate\(/);
    expect(executeSrc).not.toMatch(/requirePod,/);
    expect(panelSrc).not.toMatch(/useExecuteInvoiceMutation/);
    expect(panelSrc).not.toMatch(/\bexecuteInvoiceCreation\s*\(/);
  });

  it("Issue revalidates POD policy in executeInvoiceCreation, not via UI requirePod", () => {
    expect(executeSrc).not.toMatch(
      /const requirePod = invoiceIssueRequirePod\(podRequired\)/,
    );
  });

  it("PDF preview route remains mutation-free", () => {
    expect(pdfRoute).not.toMatch(/useExecuteInvoiceMutation/);
    expect(pdfRoute).not.toMatch(/executeInvoiceCreation/);
    expect(pdfRoute).not.toMatch(/handleFinalizeAndSend/);
    expect(pdfRoute).not.toMatch(/onFinalize/);
    expect(pdfRoute).not.toMatch(/Issue Invoice/);
  });

  it("double submission is prevented with pending + in-flight guard", () => {
    expect(executeSrc).toMatch(/issueInFlight\.current \|\| issueMutation\.isPending/);
    expect(executeSrc).toMatch(/isIssuing=\{issueMutation\.isPending\}/);
    expect(panelSrc).toMatch(/disabled=\{issueBlocked\}/);
  });

  it("successful issue invalidates issued invoices", () => {
    expect(queriesSrc).toMatch(
      /queryClient\.invalidateQueries\(\{ queryKey: queryKeys\.invoicing\.issued\(orgId\) \}\)/,
    );
  });

  it("issued invoice visibility helper remains independent of POD Required", () => {
    expect(executeSrc).toMatch(/IssuedInvoicesPanel/);
    const utilSrc = readFileSync(
      join(__dirname, "../../utils/invoicePodRequired.util.ts"),
      "utf8",
    );
    expect(utilSrc).toMatch(/export function issuedInvoicesForPodToggle/);
  });

  it("Finance Pro AR aggregation is untouched by Issue", () => {
    expect(executeSrc).not.toMatch(/get_customer_ledger_inputs/);
    expect(executeSrc).not.toMatch(/aggregateCustomersFromRpc/);
    expect(financeProSrc).toMatch(/CustomersTab/);
    expect(financeProSrc).not.toMatch(/executeInvoiceCreation/);
  });
});
