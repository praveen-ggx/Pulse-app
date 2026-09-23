import { evaluateFinanceWorkflowTrip } from "../financeWorkflowState.util";
import {
  filterInvoicePreviewTrips,
  invoicePodRequiredMode,
  invoicePodRequiredModeLabel,
  invoicePreviewExclusionNote,
  isInvoiceHardPodLoggable,
  isInvoiceWorkspaceSelectable,
  summarizeInvoiceWorkspaceSelection,
  validateHardCopyPodReceiptSelection,
} from "../financeInvoicePodAction.util";

function state(input: Parameters<typeof evaluateFinanceWorkflowTrip>[0]) {
  return evaluateFinanceWorkflowTrip(input);
}

describe("financeInvoicePodAction.util", () => {
  it("maps client policy to POD Required ON/OFF without mixing soft copy", () => {
    expect(invoicePodRequiredMode("hard_copy")).toBe("on");
    expect(invoicePodRequiredMode("none")).toBe("off");
    expect(invoicePodRequiredMode("soft_copy")).toBe("soft");
    expect(invoicePodRequiredMode(null)).toBe("unconfigured");
    expect(invoicePodRequiredModeLabel("hard_copy")).toBe("POD Required · ON");
    expect(invoicePodRequiredModeLabel("none")).toBe("POD Required · OFF");
    expect(invoicePodRequiredModeLabel(null)).toBe("POD policy not configured");
  });

  it("POD OFF + completed + POD not received is eligible and optionally loggable", () => {
    const s = state({
      tripStatus: "completed",
      policy: "none",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(s.invoiceable).toBe(true);
    expect(
      isInvoiceHardPodLoggable({
        state: s,
        policy: "none",
        physicalPodReceived: false,
      }),
    ).toBe(true);
    const after = state({
      tripStatus: "completed",
      policy: "none",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(after.invoiceable).toBe(true);
  });

  it("POD ON blocks completed trips until hard-copy receipt", () => {
    const pending = state({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(pending.invoiceable).toBe(false);
    expect(
      isInvoiceHardPodLoggable({
        state: pending,
        policy: "hard_copy",
        physicalPodReceived: false,
      }),
    ).toBe(true);
    const received = state({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: false,
    });
    expect(received.invoiceable).toBe(true);
  });

  it("mixed selection splits Log POD vs Create Invoice", () => {
    const pending = state({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
    });
    const eligible = state({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: false,
    });
    const issued = state({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: true,
      digitalPodPresent: false,
      invoiced: true,
    });
    const summary = summarizeInvoiceWorkspaceSelection([
      {
        selected: true,
        state: pending,
        policy: "hard_copy",
        physicalPodReceived: false,
      },
      {
        selected: true,
        state: eligible,
        policy: "hard_copy",
        physicalPodReceived: true,
      },
      {
        selected: true,
        state: issued,
        policy: "hard_copy",
        physicalPodReceived: true,
      },
    ]);
    expect(summary.podLoggableCount).toBe(1);
    expect(summary.invoiceableCount).toBe(1);
    expect(
      isInvoiceWorkspaceSelectable({
        state: issued,
        policy: "hard_copy",
        physicalPodReceived: true,
      }),
    ).toBe(false);
  });

  it("does not silently skip an invalid bulk POD trip", () => {
    const ok = validateHardCopyPodReceiptSelection({
      expectedClientId: "client-a",
      candidates: [
        {
          id: "a",
          displayId: "Trip A",
          exists: true,
          clientId: "client-a",
          completed: true,
          physicalPodReceived: false,
        },
      ],
    });
    expect(ok).toEqual({ ok: true });
    const stale = validateHardCopyPodReceiptSelection({
      expectedClientId: "client-a",
      candidates: [
        {
          id: "b",
          displayId: "Trip B",
          exists: true,
          clientId: "client-a",
          completed: true,
          physicalPodReceived: true,
        },
      ],
    });
    expect(stale).toEqual({
      ok: false,
      message: "Trip B is no longer eligible for POD logging.",
    });
  });

  it("invoice preview excludes non-invoiceable selected trips", () => {
    const trips = [
      { id: "a", invoiceable: true },
      { id: "b", invoiceable: false },
    ];
    expect(
      filterInvoicePreviewTrips(trips as never, (trip) =>
        Boolean((trip as { invoiceable: boolean }).invoiceable),
      ),
    ).toEqual([{ id: "a", invoiceable: true }]);
    expect(
      invoicePreviewExclusionNote({ selectedCount: 3, invoiceableCount: 1 }),
    ).toBe("2 selected trips are not invoiceable");
  });
});
