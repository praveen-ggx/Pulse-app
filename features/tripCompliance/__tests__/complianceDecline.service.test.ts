/**
 * Decline write path + pre-migration read fallback + cache patch
 * (CONTRACT.md §2.D/E, AC-23, AC-25, AC-29, AC-31, AC-34).
 */
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

type RpcResult = { data: null; error: { code?: string; message: string } | null };
const mockRpc = jest.fn<Promise<RpcResult>, [string, Record<string, unknown>]>();
type SelectResult = { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null };
const mockSelects: string[] = [];
let mockSelectResults: SelectResult[] = [];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
    from: (table: string) => {
      if (table !== "trips") throw new Error(`unexpected table ${table}`);
      const builder: Record<string, unknown> = {};
      builder.select = (cols: string) => {
        mockSelects.push(cols);
        return builder;
      };
      builder.in = () => builder;
      builder.then = (resolve: (v: SelectResult) => void) =>
        resolve(mockSelectResults.shift() ?? { data: [], error: null });
      return builder;
    },
  }),
}));

import { patchForComplianceChange } from "@/features/tripCompliance/services/compliancePipelineSync.service";
import {
  fetchComplianceTripFlags,
  summarizeComplianceTrip,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import { declineTripCompliance } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  complianceDeclineReasonLength,
  type ComplianceTripFlags,
  type ComplianceTripInputs,
} from "@/features/tripCompliance/tripCompliance.types";
import { applyComplianceDeclined } from "@/features/tripCompliance/utils/compliancePipelinePatch.util";
import type { TripRow } from "@/features/trips/services/trips.service";

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSelects.length = 0;
  mockSelectResults = [];
});

describe("declineTripCompliance — client-side validation (AC-23)", () => {
  it.each([
    ["empty", ""],
    ["whitespace only", "     "],
    ["2 chars after trim", "  ab  "],
    ["501 chars", "x".repeat(501)],
    ["2 emoji", "👍👍"],
  ])("rejects %s before calling the RPC", async (_label, reason) => {
    await expect(declineTripCompliance({ tripId: "t1", reason })).rejects.toThrow(
      "Please enter a reason between 3 and 500 characters.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("accepts exactly 3 and exactly 500 trimmed chars", async () => {
    await declineTripCompliance({ tripId: "t1", reason: "  abc  " });
    await declineTripCompliance({ tripId: "t1", reason: ` ${"y".repeat(500)} ` });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});

describe("declineTripCompliance — RPC call", () => {
  it("passes trimmed reason, trip id and idempotency key", async () => {
    await declineTripCompliance({ tripId: "t1", reason: "  LR is blurry  ", idempotencyKey: "k-1" });
    expect(mockRpc).toHaveBeenCalledWith("decline_trip_compliance", {
      p_trip_id: "t1",
      p_reason: "LR is blurry",
      p_idempotency_key: "k-1",
    });
  });

  it("omits the key (undefined → server default null) when not given", async () => {
    await declineTripCompliance({ tripId: "t1", reason: "abc" });
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toBeUndefined();
  });
});

describe("declineTripCompliance — error mapping (AC-29)", () => {
  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.decline_trip_compliance" }, "Decline isn't available yet — database update pending."],
    [{ code: "42883", message: "function does not exist" }, "Decline isn't available yet — database update pending."],
    [{ message: "not authorized to decline compliance for this organization" }, "You don't have permission to decline compliance for this trip."],
    [{ message: "not authorized to decline compliance for this trip" }, "You don't have permission to decline compliance for this trip."],
    [{ message: "trip compliance already verified; cannot decline" }, "This trip is already verified and can't be declined."],
    [{ message: "a decline reason between 3 and 500 characters is required" }, "Please enter a reason between 3 and 500 characters."],
    [{ message: "some other server error" }, "some other server error"],
    [
      { code: "42501", message: "compliance decline fields can only be changed via decline_trip_compliance()" },
      "compliance decline fields can only be changed via decline_trip_compliance()",
    ],
    [{ message: "" }, "Couldn't decline compliance."],
  ])("maps %j", async (error, expected) => {
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(declineTripCompliance({ tripId: "t1", reason: "valid reason" })).rejects.toThrow(expected);
  });
});

describe("fetchComplianceTripFlags — pre-migration fallback (AC-34)", () => {
  it("reads decline columns when present", async () => {
    mockSelectResults = [
      {
        data: [
          {
            id: "t1",
            compliance_verified_at: null,
            compliance_declined_at: "2026-09-29T10:00:00Z",
            compliance_declined_by: "u1",
            compliance_decline_reason: "bad LR",
          },
        ],
        error: null,
      },
    ];
    const flags = await fetchComplianceTripFlags(["t1"]);
    expect(mockSelects).toHaveLength(1);
    expect(mockSelects[0]).toContain("compliance_decline_reason");
    expect(flags.get("t1")).toMatchObject({
      compliance_declined_at: "2026-09-29T10:00:00Z",
      compliance_declined_by: "u1",
      compliance_decline_reason: "bad LR",
    });
  });

  it("missing-column error on first select → retries base select and keeps verified flags", async () => {
    const missing = { data: null, error: { code: "42703", message: "column trips.compliance_declined_at does not exist" } };
    mockSelectResults = [
      missing,
      missing,
      missing,
      missing,
      {
        data: [
          {
            id: "t1",
            compliance_verified_at: "2026-09-20T00:00:00Z",
            compliance_verified_by: "u9",
            compliance_decision: "approved",
            pod_received_at: null,
          },
        ],
        error: null,
      },
    ];
    const flags = await fetchComplianceTripFlags(["t1"]);
    expect(mockSelects).toHaveLength(5);
    expect(mockSelects[0]).toContain("compliance_resubmit_note");
    expect(mockSelects[1]).toContain("compliance_reject_return_to");
    expect(mockSelects[4]).not.toContain("compliance_declined_at");
    expect(mockSelects[4]).toContain("compliance_verified_at");
    expect(flags.get("t1")).toMatchObject({
      compliance_verified_at: "2026-09-20T00:00:00Z",
      compliance_verified_by: "u9",
      compliance_decision: "approved",
      compliance_declined_at: null,
      compliance_declined_by: null,
      compliance_decline_reason: null,
    });
  });

  it("non-schema error is thrown, no retry", async () => {
    mockSelectResults = [{ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }];
    await expect(fetchComplianceTripFlags(["t1"])).rejects.toThrow("statement timeout");
    expect(mockSelects).toHaveLength(1);
  });
});

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

function inputs(tripId: string, flags: ComplianceTripFlags | null = FLAGS): ComplianceTripInputs {
  return {
    trip: { id: tripId, organization_id: "org-1", status: "in_transit", pod_received_at: null } as unknown as TripRow,
    documents: ["lr", "eway_bill", "invoice"].map((type) => ({
      id: `${tripId}-${type}`,
      trip_id: tripId,
      document_type: type,
      file_name: `${type}.pdf`,
      storage_path: `org/${tripId}/${type}.pdf`,
      uploaded_at: "2026-09-01T00:00:00Z",
      status: "pending" as const,
      verified_by: null,
      verified_at: null,
      rejection_reason: null,
    })),
    flags,
    taggedAdvance: null,
    balance: null,
    vehicleDocuments: ["rc", "insurance", "fitness"].map((doc_type) => ({
      id: `v-${doc_type}`,
      entity_type: "vehicle" as const,
      entity_id: "v1",
      doc_type,
      status: "pending",
      storage_path: `${doc_type}.pdf`,
      expiry_date: "2027-01-01",
      verified_at: null,
      notes: null,
      created_at: "2026-09-01",
    })),
    driverDocuments: [
      {
        id: "d-license",
        entity_type: "driver" as const,
        entity_id: "d1",
        doc_type: "license",
        status: "pending",
        storage_path: "license.pdf",
        expiry_date: "2027-01-01",
        verified_at: null,
        notes: null,
        created_at: "2026-09-01",
      },
    ],
    vaultVehicleId: null,
  };
}

describe("applyComplianceDeclined (AC-25, AC-27)", () => {
  it("sets only decline fields; verified flags untouched; stage stays compliance_pending", () => {
    const before = [inputs("t1"), inputs("t2")];
    const stageBefore = summarizeComplianceTrip(before[0]).stage;
    expect(stageBefore).toBe("compliance_pending");

    const after = applyComplianceDeclined(before, { tripId: "t1", actorId: "u1", at: "2026-09-29T10:00:00Z", reason: "  bad LR  " });
    expect(after[0].flags).toEqual({
      ...FLAGS,
      compliance_declined_at: "2026-09-29T10:00:00Z",
      compliance_declined_by: "u1",
      compliance_decline_reason: "bad LR",
    });
    expect(after[1]).toBe(before[1]);
    const s = summarizeComplianceTrip(after[0]);
    expect(s.stage).toBe("compliance_pending");
    expect(s.complianceVerifiedAt).toBeNull();
    expect(s.complianceDeclineReason).toBe("bad LR");
  });

  it("works when the trip had no flags row yet", () => {
    const after = applyComplianceDeclined([inputs("t1", null)], { tripId: "t1", actorId: "u1", at: "x", reason: "abc" });
    expect(after[0].flags?.compliance_verified_at).toBeNull();
    expect(after[0].flags?.compliance_decline_reason).toBe("abc");
  });

  it("second decline replaces the reason (D5)", () => {
    const once = applyComplianceDeclined([inputs("t1")], { tripId: "t1", actorId: "u1", at: "a", reason: "first" });
    const twice = applyComplianceDeclined(once, { tripId: "t1", actorId: "u2", at: "b", reason: "second" });
    expect(twice[0].flags).toMatchObject({ compliance_declined_at: "b", compliance_declined_by: "u2", compliance_decline_reason: "second" });
  });
});

describe("patchForComplianceChange('complianceDeclined')", () => {
  it("needs zero reads and applies the decline patch", async () => {
    const current = [inputs("t1")];
    const patch = await patchForComplianceChange(
      current,
      { type: "complianceDeclined", tripId: "t1", actorId: "u1", reason: "bad LR" },
      "org-1",
      () => "2026-09-29T11:00:00Z",
    );
    expect(mockSelects).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
    const next = patch(current);
    expect(next[0].flags).toMatchObject({
      compliance_verified_at: null,
      compliance_decision: null,
      compliance_declined_at: "2026-09-29T11:00:00Z",
      compliance_declined_by: "u1",
      compliance_decline_reason: "bad LR",
    });
    expect(summarizeComplianceTrip(next[0]).stage).toBe("compliance_pending");
  });
});

describe("complianceDeclineReasonLength — code points, matching Postgres char_length", () => {
  it.each([
    ["👍👍", 2],
    ["  👍👍  ", 2],
    ["abc", 3],
    ["", 0],
    ["नमस्ते", Array.from("नमस्ते").length],
  ])("%j → %i", (input, expected) => {
    expect(complianceDeclineReasonLength(input)).toBe(expected);
  });

  it("501 emoji (1002 UTF-16 units) is 501, rejected; 500 emoji accepted", async () => {
    expect(complianceDeclineReasonLength("👍".repeat(501))).toBe(501);
    await expect(declineTripCompliance({ tripId: "t1", reason: "👍".repeat(501) })).rejects.toThrow();
    await declineTripCompliance({ tripId: "t1", reason: "👍".repeat(500) });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
