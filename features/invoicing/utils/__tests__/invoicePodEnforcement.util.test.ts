import { resolveInvoicePodPolicy } from "../invoicePodPolicy.util";
import {
  INVOICE_POD_HARD_COPY_REQUIRED,
  INVOICE_POD_LEGACY_REQUIRED,
  INVOICE_POD_MULTI_CLIENT,
  INVOICE_POD_OPTIONS_CONFLICT,
  INVOICE_POD_POLICY_UNCONFIGURED,
  INVOICE_POD_SOFT_COPY_REQUIRED,
  conflictingInvoicePodOptions,
  distinctInvoiceClientIds,
  effectiveInvoicePodPolicyFromClientRaw,
  invoiceIssuePodPolicyReason,
  invoiceNeedsDigitalPodLookup,
  invoiceNeedsPhysicalPodField,
  invoiceSelectionClientIdentityError,
  isTripEligibleForInvoicePodPolicy,
  selectedTripsBlockIssueForPodPolicy,
} from "../invoicePodEnforcement.util";

const digital = { digitalPodPresent: true, physicalPodReceived: false };
const physical = { digitalPodPresent: false, physicalPodReceived: true };
const both = { digitalPodPresent: true, physicalPodReceived: true };
const neither = { digitalPodPresent: false, physicalPodReceived: false };

describe("P2.2 policy resolution via resolveInvoicePodPolicy", () => {
  it("1. NONE + workspace ON -> NONE", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "none",
        workspacePodRequired: true,
      }),
    ).toBe("none");
  });
  it("2. NONE + workspace OFF -> NONE", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "none",
        workspacePodRequired: false,
      }),
    ).toBe("none");
  });
  it("3. SOFT_COPY + workspace ON -> SOFT_COPY", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "soft_copy",
        workspacePodRequired: true,
      }),
    ).toBe("soft_copy");
  });
  it("4. SOFT_COPY + workspace OFF -> SOFT_COPY", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "soft_copy",
        workspacePodRequired: false,
      }),
    ).toBe("soft_copy");
  });
  it("5. HARD_COPY + workspace ON -> HARD_COPY", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "hard_copy",
        workspacePodRequired: true,
      }),
    ).toBe("hard_copy");
  });
  it("6. HARD_COPY + workspace OFF -> HARD_COPY", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "hard_copy",
        workspacePodRequired: false,
      }),
    ).toBe("hard_copy");
  });
  it("7. NULL + workspace ON -> unconfigured", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: null,
        workspacePodRequired: true,
      }),
    ).toBeNull();
  });
  it("8. NULL + workspace OFF -> unconfigured", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: null,
        workspacePodRequired: false,
      }),
    ).toBeNull();
  });
});

describe("P2.2 eligibility", () => {
  it("9. NONE + no digital POD + no physical POD -> eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("none", neither)).toBe(true);
  });
  it("10. SOFT_COPY + digital POD -> eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("soft_copy", digital)).toBe(true);
  });
  it("11. SOFT_COPY + no digital POD + physical POD -> NOT eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("soft_copy", physical)).toBe(false);
  });
  it("12. HARD_COPY + physical POD -> eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("hard_copy", physical)).toBe(true);
  });
  it("13. HARD_COPY + digital POD only -> NOT eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("hard_copy", digital)).toBe(false);
  });
  it("14. HARD_COPY + both -> eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("hard_copy", both)).toBe(true);
  });
  it("15. NONE + both -> eligible", () => {
    expect(isTripEligibleForInvoicePodPolicy("none", both)).toBe(true);
  });
});

describe("P2.2 multi-trip", () => {
  it("16. SOFT_COPY: all digital POD -> eligible", () => {
    expect(
      selectedTripsBlockIssueForPodPolicy("soft_copy", [digital, both]),
    ).toBe(false);
  });
  it("17. SOFT_COPY: one missing digital POD -> blocked", () => {
    expect(
      selectedTripsBlockIssueForPodPolicy("soft_copy", [digital, physical]),
    ).toBe(true);
    expect(
      invoiceIssuePodPolicyReason("soft_copy", [digital, physical]),
    ).toBe(INVOICE_POD_SOFT_COPY_REQUIRED);
  });
  it("18. HARD_COPY: all physical POD -> eligible", () => {
    expect(
      selectedTripsBlockIssueForPodPolicy("hard_copy", [physical, both]),
    ).toBe(false);
  });
  it("19. HARD_COPY: one missing physical POD -> blocked", () => {
    expect(
      selectedTripsBlockIssueForPodPolicy("hard_copy", [physical, digital]),
    ).toBe(true);
    expect(
      invoiceIssuePodPolicyReason("hard_copy", [physical, digital]),
    ).toBe(INVOICE_POD_HARD_COPY_REQUIRED);
  });
  it("20. NONE: mixed POD states -> eligible", () => {
    expect(
      selectedTripsBlockIssueForPodPolicy("none", [neither, digital, physical]),
    ).toBe(false);
  });
});

describe("P2.2 client identity", () => {
  it("21. one client_id -> policy resolves", () => {
    expect(
      distinctInvoiceClientIds([
        { client_id: "c1" },
        { client_id: "c1" },
      ]),
    ).toEqual(["c1"]);
    expect(
      invoiceSelectionClientIdentityError([
        { client_id: "c1" },
        { client_id: "c1" },
      ]),
    ).toBeNull();
    expect(
      effectiveInvoicePodPolicyFromClientRaw({
        clientPolicyRaw: "soft_copy",
        workspacePodRequired: true,
      }),
    ).toEqual({ ok: true, policy: "soft_copy", source: "client" });
    expect(
      effectiveInvoicePodPolicyFromClientRaw({
        clientPolicyRaw: null,
        workspacePodRequired: true,
      }),
    ).toEqual({ ok: false, error: INVOICE_POD_POLICY_UNCONFIGURED });
  });
  it("22. multiple client_ids -> block", () => {
    expect(
      invoiceSelectionClientIdentityError([
        { client_id: "c1" },
        { client_id: "c2" },
      ]),
    ).toBe(INVOICE_POD_MULTI_CLIENT);
  });
  it("23. NULL client_id -> safe configuration handling", () => {
    expect(
      invoiceSelectionClientIdentityError([
        { client_id: null },
        { client_id: "" },
      ]),
    ).toBeNull();
    expect(
      invoiceSelectionClientIdentityError([
        { client_id: "c1" },
        { client_id: null },
      ]),
    ).toBe(INVOICE_POD_MULTI_CLIENT);
  });
});

describe("P2.2 lookup efficiency flags", () => {
  it("29. NONE -> no digital POD lookup", () => {
    expect(invoiceNeedsDigitalPodLookup("none")).toBe(false);
  });
  it("30. HARD_COPY -> no digital POD lookup", () => {
    expect(invoiceNeedsDigitalPodLookup("hard_copy")).toBe(false);
    expect(invoiceNeedsPhysicalPodField("hard_copy")).toBe(true);
  });
  it("31. SOFT_COPY -> batched digital POD lookup", () => {
    expect(invoiceNeedsDigitalPodLookup("soft_copy")).toBe(true);
    expect(invoiceNeedsPhysicalPodField("soft_copy")).toBe(false);
  });
});

describe("P2.2 legacy requirePod compatibility", () => {
  it("32. requirePod true aligns with soft_copy, false with none", () => {
    expect(
      conflictingInvoicePodOptions({
        requirePodSupplied: true,
        podPolicySupplied: true,
        requirePod: true,
        podPolicy: "soft_copy",
      }),
    ).toBeNull();
    expect(
      conflictingInvoicePodOptions({
        requirePodSupplied: true,
        podPolicySupplied: true,
        requirePod: false,
        podPolicy: "none",
      }),
    ).toBeNull();
  });
  it("33. conflicting podPolicy/requirePod is rejected", () => {
    expect(
      conflictingInvoicePodOptions({
        requirePodSupplied: true,
        podPolicySupplied: true,
        requirePod: true,
        podPolicy: "hard_copy",
      }),
    ).toBe(INVOICE_POD_OPTIONS_CONFLICT);
    expect(
      conflictingInvoicePodOptions({
        requirePodSupplied: true,
        podPolicySupplied: true,
        requirePod: false,
        podPolicy: "soft_copy",
      }),
    ).toBe(INVOICE_POD_OPTIONS_CONFLICT);
    expect(INVOICE_POD_LEGACY_REQUIRED).toBe(
      "POD is required before invoice creation.",
    );
  });
});
