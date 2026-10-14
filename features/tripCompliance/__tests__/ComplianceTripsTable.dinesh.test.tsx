/**
 * Compliance table — Dinesh sir's changes (AC-1, AC-9, AC-13, AC-16..AC-22,
 * AC-26, AC-28, AC-37, AC-38) and the Decline modal (AC-23, AC-25, AC-29, AC-39).
 */
// A root __mocks__ stubs react-native; component tests need the real one (see DriverStopVerificationScreen.test.tsx).
jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/lib/supabase", () => ({
  supabase: () => {
    throw new Error("no network in component tests");
  },
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: (_t, prop) => (prop === "__esModule" ? false : "Icon") }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import "@testing-library/react-native/extend-expect";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet, Text } from "react-native";

import { ComplianceDeclineModal } from "@/features/tripCompliance/components/ComplianceDeclineModal";
import { ComplianceTripCard } from "@/features/tripCompliance/components/ComplianceTripCard";
import { ComplianceTripsTable } from "@/features/tripCompliance/components/ComplianceTripsTable";
import { summarizeComplianceTrip } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type {
  ComplianceDocumentRow,
  ComplianceDocumentStatus,
  ComplianceTripFlags,
  ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

const FLAGS: ComplianceTripFlags = {
  compliance_verified_at: null,
  compliance_verified_by: null,
  compliance_decision: null,
  compliance_exception_reason: null,
  compliance_outstanding_summary: null,
  compliance_declined_at: null,
  compliance_declined_by: null,
  compliance_decline_reason: null,
  pod_hard_copy_courier: null,
  pod_hard_copy_awb_number: null,
  pod_hard_copy_received_by: null,
  pod_received_at: null,
};

function tripDoc(type: string, status: ComplianceDocumentStatus, over: Partial<ComplianceDocumentRow> = {}): ComplianceDocumentRow {
  return {
    id: `t1-${type}`,
    trip_id: "t1",
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: `org/t1/${type}.pdf`,
    uploaded_at: "2026-09-01T00:00:00Z",
    status,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    ...over,
  };
}

function makeSummary(opts: {
  tripDocStatus?: ComplianceDocumentStatus;
  flags?: Partial<ComplianceTripFlags>;
  ewayNumber?: string | null;
} = {}): ComplianceTripSummary {
  const status = opts.tripDocStatus ?? "pending";
  const ewayNumber =
    opts.ewayNumber === undefined ? JSON.stringify({ ewayNo: "1234 5678 9012", validTill: "04-Sep-26" }) : opts.ewayNumber;
  return summarizeComplianceTrip({
    trip: {
      id: "t1",
      organization_id: "org-1",
      status: "delivered",
      booking_ref: "TRP001",
      client_name: "Acme",
      pod_received_at: null,
    } as unknown as TripRow,
    documents: [tripDoc("lr", status), tripDoc("eway_bill", status, { document_number: ewayNumber }), tripDoc("invoice", status)],
    flags: { ...FLAGS, ...opts.flags },
    taggedAdvance: null,
    balance: null,
    vehicleDocuments: [],
    driverDocuments: [],
    vaultVehicleId: null,
  });
}

function renderTable(summary: ComplianceTripSummary, props: Partial<React.ComponentProps<typeof ComplianceTripsTable>> = {}) {
  const onReview = jest.fn();
  const onOpenTrip = jest.fn();
  const utils = render(
    <ComplianceTripsTable summaries={[summary]} onOpenTrip={onOpenTrip} onReview={onReview} {...props} />,
  );
  return { ...utils, onReview, onOpenTrip };
}

function allText(): string[] {
  return screen.UNSAFE_getAllByType(Text).map((node) => {
    const c = node.props.children;
    return Array.isArray(c) ? c.join("") : String(c ?? "");
  });
}

describe("ComplianceTripsTable — columns (AC-1, AC-2)", () => {
  it("Compliance Pending hides Advance and Balance and shows a Trip Status column", () => {
    renderTable(makeSummary(), { compliancePendingLayout: true });
    const texts = allText();
    expect(texts).toContain("Trip Status");
    expect(texts).toContain("Invoice");
    expect(texts).toContain("LR");
    expect(texts).toContain("Truck No");
    expect(texts).toContain("Completed");
    expect(texts).not.toContain("Advance");
    expect(texts).not.toContain("Balance");
    expect(texts).not.toContain("Payment");
  });

  it("header order: From → To → E-way Bill → Trip → Vehicle → Driver", () => {
    renderTable(makeSummary());
    const texts = allText();
    const idx = (label: string) => texts.indexOf(label);
    expect(idx("From")).toBeGreaterThan(-1);
    expect(idx("From")).toBeLessThan(idx("To"));
    expect(idx("To")).toBeLessThan(idx("E-way Bill"));
    expect(idx("E-way Bill")).toBeLessThan(idx("LR"));
    expect(idx("LR")).toBeLessThan(idx("Truck No"));
    expect(idx("Truck No")).toBeLessThan(idx("Trip"));
    expect(idx("Trip")).toBeLessThan(idx("Vehicle"));
    expect(idx("Vehicle")).toBeLessThan(idx("Driver"));
  });

  it("E-way cell shows number and Valid till date", () => {
    renderTable(makeSummary());
    const cell = screen.getByTestId("compliance-eway-t1");
    expect(cell).toHaveTextContent(/1234 5678 9012/);
    expect(cell).toHaveTextContent(/Valid till 04-Sep-26/);
  });

  it("E-way cell shows — when no E-way details", () => {
    renderTable(makeSummary({ ewayNumber: null }));
    expect(screen.getByTestId("compliance-eway-t1")).toHaveTextContent("—");
  });
});

describe("ComplianceTripsTable — group status pills (AC-9, AC-13, AC-37, AC-38)", () => {
  it("shows Pending pills (no doc names) and pressing opens the scoped review list", () => {
    const { onReview } = renderTable(makeSummary());
    for (const scope of ["trip", "vehicle", "driver"] as const) {
      const pill = screen.getByTestId(`compliance-status-${scope}-t1`);
      expect(pill).toHaveTextContent("Pending");
      fireEvent.press(pill);
      expect(onReview).toHaveBeenLastCalledWith("t1", null, scope);
    }
    const texts = allText();
    expect(texts.filter((label) => label === "LR")).toEqual(["LR"]);
    expect(texts).not.toContain("Invoice");
  });

  it("trip pill is Approved when LR/E-way/Invoice are verified; a11y label + ≥44pt target", () => {
    renderTable(makeSummary({ tripDocStatus: "verified" }));
    const pill = screen.getByTestId("compliance-status-trip-t1");
    expect(pill).toHaveTextContent("Approved");
    expect(pill.props.accessibilityRole).toBe("button");
    expect(pill.props.accessibilityLabel).toBe("Trip documents Approved, 3 of 3 approved. Open verification");
    expect(StyleSheet.flatten(pill.props.style).minHeight).toBeGreaterThanOrEqual(44);
    // Unassigned vehicle/driver stays Pending
    expect(screen.getByTestId("compliance-status-vehicle-t1")).toHaveTextContent("Pending");
  });
});

describe("ComplianceTripsTable — actions (AC-16..AC-22)", () => {
  it("no Verify Docs / View Trip text", () => {
    renderTable(makeSummary(), { onMarkComplianceVerified: jest.fn(), onDeclineCompliance: jest.fn() });
    const texts = allText();
    expect(texts).not.toContain("Verify Docs");
    expect(texts).not.toContain("View Trip");
  });

  it("hides Verify and Decline when handlers are absent (no permission, AC-18)", () => {
    renderTable(makeSummary({ tripDocStatus: "verified" }));
    expect(screen.queryByTestId("compliance-verify-t1")).toBeNull();
    expect(screen.queryByTestId("compliance-decline-t1")).toBeNull();
  });

  it("Verify not ready: enabled, hint names docs, press opens trip documents instead of verifying", () => {
    const onVerify = jest.fn().mockResolvedValue(undefined);
    const { onReview } = renderTable(makeSummary(), { onMarkComplianceVerified: onVerify });
    const btn = screen.getByTestId("compliance-verify-t1");
    expect(btn.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
    expect(btn.props.accessibilityLabel).toBe("Verify trip compliance");
    expect(btn.props.accessibilityHint).toBe("Approve LR, E-way Bill and Invoice first. Opens trip documents.");
    fireEvent.press(btn);
    expect(onVerify).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledWith("t1", null, "trip");
  });

  it("Verify not ready with onVerifyDocs: hands off to the Cards workspace instead of the review sheet", () => {
    const onVerify = jest.fn().mockResolvedValue(undefined);
    const onVerifyDocs = jest.fn();
    const { onReview } = renderTable(makeSummary(), { onMarkComplianceVerified: onVerify, onVerifyDocs });
    fireEvent.press(screen.getByTestId("compliance-verify-t1"));
    expect(onVerifyDocs).toHaveBeenCalledWith("t1");
    expect(onReview).not.toHaveBeenCalled();
    expect(onVerify).not.toHaveBeenCalled();
  });

  it("Verify ready: no hint, disabled only while marking", async () => {
    let resolve!: () => void;
    const onVerify = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    renderTable(makeSummary({ tripDocStatus: "verified" }), { onMarkComplianceVerified: onVerify });
    const btn = screen.getByTestId("compliance-verify-t1");
    expect(btn.props.accessibilityHint).toBeUndefined();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(btn);
    expect(screen.getByTestId("compliance-verify-t1").props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => resolve());
    await waitFor(() =>
      expect(screen.getByTestId("compliance-verify-t1").props.accessibilityState).toMatchObject({ disabled: false }),
    );
  });

  it("Verify double-press calls the handler once and shows Verifying…", async () => {
    let resolve!: () => void;
    const onVerify = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    renderTable(makeSummary({ tripDocStatus: "verified" }), { onMarkComplianceVerified: onVerify });
    const btn = screen.getByTestId("compliance-verify-t1");
    fireEvent.press(btn);
    fireEvent.press(btn);
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith("t1");
    expect(screen.getByTestId("compliance-verify-t1")).toHaveTextContent("Verifying…");
    await act(async () => resolve());
    await waitFor(() => expect(screen.getByTestId("compliance-verify-t1")).toHaveTextContent("Verify"));
  });

  it("verified trip shows Verified label, no Verify/Decline, no Declined pill (AC-22, AC-28)", () => {
    renderTable(
      makeSummary({
        tripDocStatus: "verified",
        flags: {
          compliance_verified_at: "2026-09-03T00:00:00Z",
          compliance_declined_at: "2026-09-02T00:00:00Z",
          compliance_decline_reason: "old reason",
        },
      }),
      { onMarkComplianceVerified: jest.fn(), onDeclineCompliance: jest.fn() },
    );
    expect(allText()).toContain("Verified");
    expect(screen.queryByTestId("compliance-verify-t1")).toBeNull();
    expect(screen.queryByTestId("compliance-decline-t1")).toBeNull();
    expect(screen.queryByTestId("compliance-declined-t1")).toBeNull();
  });

  it("declined, unverified trip shows Declined pill + reason in a11y label (AC-26)", () => {
    renderTable(
      makeSummary({ flags: { compliance_declined_at: "2026-09-02T00:00:00Z", compliance_decline_reason: "LR blurry" } }),
      { onDeclineCompliance: jest.fn() },
    );
    const pill = screen.getByTestId("compliance-declined-t1");
    expect(pill).toHaveTextContent(/Declined/);
    expect(pill).toHaveTextContent(/LR blurry/);
    expect(pill.props.accessibilityLabel).toBe("Declined: LR blurry");
  });

  it("Decline opens the modal; successful submit calls handler with (tripId, reason) and closes", async () => {
    const onDecline = jest.fn().mockResolvedValue(undefined);
    renderTable(makeSummary(), { onDeclineCompliance: onDecline });
    expect(screen.queryByTestId("compliance-decline-modal")).toBeNull();
    fireEvent.press(screen.getByTestId("compliance-decline-t1"));
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "  LR blurry  ");
    await act(async () => {
      fireEvent.press(screen.getByTestId("compliance-decline-submit"));
    });
    expect(onDecline).toHaveBeenCalledWith("t1", "LR blurry");
    await waitFor(() => expect(screen.queryByTestId("compliance-decline-modal")).toBeNull());
  });
});

describe("ComplianceDeclineModal (AC-23, AC-25, AC-29, AC-39)", () => {
  function renderModal(onSubmit: (reason: string) => Promise<void>, onCancel = jest.fn()) {
    render(<ComplianceDeclineModal visible tripLabel="TRP001 · Acme" onCancel={onCancel} onSubmit={onSubmit} />);
    return { onCancel };
  }

  it.each([
    ["empty", ""],
    ["whitespace", "      "],
    ["2 chars", " ab "],
    ["501 chars", "z".repeat(501)],
    ["2 emoji (4 UTF-16 units)", "👍👍"],
  ])("submit disabled for %s", (_label, text) => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), text);
    const submit = screen.getByTestId("compliance-decline-submit");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("input is labelled, multiline and auto-focused", () => {
    renderModal(jest.fn());
    const input = screen.getByTestId("compliance-decline-reason-input");
    expect(input.props.accessibilityLabel).toBe("Decline reason");
    expect(input.props.multiline).toBe(true);
    expect(input.props.autoFocus).toBe(true);
  });

  it("double submit calls onSubmit once and announces busy", async () => {
    let resolve!: () => void;
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    renderModal(onSubmit);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "valid reason");
    const submit = screen.getByTestId("compliance-decline-submit");
    fireEvent.press(submit);
    fireEvent.press(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("compliance-decline-submit").props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await act(async () => resolve());
  });

  it("cancel during submit is ignored", async () => {
    let resolve!: () => void;
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const { onCancel } = renderModal(onSubmit);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "valid reason");
    fireEvent.press(screen.getByTestId("compliance-decline-submit"));
    fireEvent.press(screen.getByTestId("compliance-decline-cancel"));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => resolve());
  });

  it("cancel with no submit calls onCancel and never onSubmit (AC-24)", () => {
    const onSubmit = jest.fn();
    const { onCancel } = renderModal(onSubmit);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "valid reason");
    fireEvent.press(screen.getByTestId("compliance-decline-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejected promise shows the error, keeps modal open with the typed reason, and re-enables submit", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("You don't have permission to decline compliance for this trip."));
    renderModal(onSubmit);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "valid reason");
    await act(async () => {
      fireEvent.press(screen.getByTestId("compliance-decline-submit"));
    });
    expect(screen.getByTestId("compliance-decline-error")).toHaveTextContent(
      "You don't have permission to decline compliance for this trip.",
    );
    expect(screen.getByTestId("compliance-decline-modal")).toBeTruthy();
    expect(screen.getByTestId("compliance-decline-reason-input").props.value).toBe("valid reason");
    expect(screen.getByTestId("compliance-decline-submit").props.accessibilityState).toMatchObject({ disabled: false });
  });
});

describe("ComplianceTripCard — decline notice (Details shows it once)", () => {
  const declined = () =>
    makeSummary({ flags: { compliance_declined_at: "2026-09-02T00:00:00Z", compliance_decline_reason: "LR blurry" } });

  it("renders the decline notice by default", () => {
    render(<ComplianceTripCard summary={declined()} onReviewDocuments={jest.fn()} onViewTrip={jest.fn()} />);
    expect(screen.getByTestId("compliance-card-declined-t1")).toHaveTextContent(/LR blurry/);
  });

  it("hideDeclineNotice suppresses it", () => {
    render(<ComplianceTripCard summary={declined()} onReviewDocuments={jest.fn()} onViewTrip={jest.fn()} hideDeclineNotice />);
    expect(screen.queryByTestId("compliance-card-declined-t1")).toBeNull();
  });

  it("never shows it once verified", () => {
    const s = makeSummary({
      tripDocStatus: "verified",
      flags: {
        compliance_verified_at: "2026-09-03T00:00:00Z",
        compliance_declined_at: "2026-09-02T00:00:00Z",
        compliance_decline_reason: "LR blurry",
      },
    });
    render(<ComplianceTripCard summary={s} onReviewDocuments={jest.fn()} onViewTrip={jest.fn()} />);
    expect(screen.queryByTestId("compliance-card-declined-t1")).toBeNull();
  });
});

describe("ComplianceDeclineModal — code-point counting", () => {
  it("counter shows 2/500 for two emoji and submit stays disabled", () => {
    render(<ComplianceDeclineModal visible tripLabel="x" onCancel={jest.fn()} onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), " 👍👍 ");
    expect(screen.getByText("2/500")).toBeTruthy();
    expect(screen.getByTestId("compliance-decline-submit").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("three emoji are accepted (3 code points)", () => {
    render(<ComplianceDeclineModal visible tripLabel="x" onCancel={jest.fn()} onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId("compliance-decline-reason-input"), "👍👍👍");
    expect(screen.getByText("3/500")).toBeTruthy();
    expect(screen.getByTestId("compliance-decline-submit").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
