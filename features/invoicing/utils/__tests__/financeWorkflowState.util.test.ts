import { evaluateFinanceWorkflowTrip } from "../financeWorkflowState.util";

describe("evaluateFinanceWorkflowTrip", () => {
  it("A — completed, hard POD required, not received → blocked", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: false,
      digitalPodPresent: true,
      invoiced: false,
    });
    expect(s).toMatchObject({
      completed: true,
      podState: "pending",
      invoiceState: "blocked_pod",
      invoiceable: false,
    });
  });

  it("B — completed, hard POD received → eligible", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(s).toMatchObject({
      podState: "received",
      invoiceState: "eligible",
      invoiceable: true,
    });
  });

  it("C — completed, POD not required → eligible without a POD row", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "delivered",
      policy: "none",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(s).toMatchObject({
      podState: "not_required",
      invoiceState: "eligible",
      invoiceable: true,
    });
  });

  it("D — incomplete trip is never eligible", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "in_transit",
      policy: "none",
      physicalPodReceived: true,
      digitalPodPresent: true,
      invoiced: false,
    });
    expect(s).toMatchObject({
      completed: false,
      invoiceState: "not_completed",
      invoiceable: false,
    });
  });

  it("E — already invoiced is not selectable again", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "none",
      physicalPodReceived: true,
      digitalPodPresent: true,
      invoiced: true,
    });
    expect(s).toMatchObject({
      invoiceState: "issued",
      invoiceable: false,
    });
  });

  it("F — soft-copy policy requires digital POD, not hard receipt", () => {
    const blocked = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "soft_copy",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(blocked.invoiceable).toBe(false);
    const ok = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "soft_copy",
      physicalPodReceived: false,
      digitalPodPresent: true,
      invoiced: false,
    });
    expect(ok.invoiceable).toBe(true);
  });

  it("draft allocation is not issued and is not selectable", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "none",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
      inDraft: true,
    });
    expect(s).toMatchObject({
      invoiceState: "draft",
      invoiceable: false,
    });
  });

  it("G — NULL policy is unconfigured and never invoiceable", () => {
    const s = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: null,
      physicalPodReceived: true,
      digitalPodPresent: true,
      invoiced: false,
    });
    expect(s).toMatchObject({
      podState: "unconfigured",
      invoiceState: "blocked_policy",
      invoiceable: false,
    });
  });
});
