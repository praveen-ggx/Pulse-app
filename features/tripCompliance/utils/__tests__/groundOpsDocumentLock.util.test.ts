import {
  groundOpsDocumentLockLabel,
  groundOpsDocumentLockReason,
  isOwnRecentUpload,
  tripAwaitingResubmit,
} from "@/features/tripCompliance/utils/groundOpsDocumentLock.util";

const T1 = "2026-10-20T10:00:00Z";
const T2 = "2026-10-21T10:00:00Z";
const T3 = "2026-10-22T10:00:00Z";

describe("groundOpsDocumentLockReason", () => {
  it("leaves documents editable before transit", () => {
    for (const status of ["draft", "assigned", "in_progress", "loading"]) {
      expect(groundOpsDocumentLockReason({ trip: { status } })).toBeNull();
    }
  });

  it("locks once the trip is in transit or later", () => {
    for (const status of ["in_transit", "unloading", "at_drop", "completed"]) {
      expect(groundOpsDocumentLockReason({ trip: { status } })).toBe("in_transit");
    }
  });

  it("locks on compliance approval, advance approval and a posted advance", () => {
    expect(
      groundOpsDocumentLockReason({ trip: { status: "assigned", compliance_verified_at: T1 } }),
    ).toBe("compliance_verified");
    expect(
      groundOpsDocumentLockReason({
        trip: { status: "assigned", compliance_verified_at: T1, finance_verified_at: T2 },
      }),
    ).toBe("advance_approved");
    expect(
      groundOpsDocumentLockReason({
        trip: { status: "assigned", compliance_verified_at: T1, finance_verified_at: T2 },
        advancePosted: true,
      }),
    ).toBe("advance_processed");
  });

  it("keeps a rejected document editable even in transit", () => {
    expect(
      groundOpsDocumentLockReason({
        trip: { status: "in_transit", compliance_verified_at: T1 },
        documentStatus: "rejected",
      }),
    ).toBeNull();
  });

  it("unlocks while the trip is back with Ground Ops after a finance reject", () => {
    const rejected = {
      status: "in_transit",
      compliance_verified_at: T1,
      compliance_declined_at: T2,
    };
    expect(groundOpsDocumentLockReason({ trip: rejected })).toBeNull();
    // After Resubmit the lock comes back.
    expect(
      groundOpsDocumentLockReason({ trip: { ...rejected, compliance_resubmitted_at: T3 } }),
    ).toBe("compliance_verified");
  });

  it("unlocks during a hold (declined before any verify) until resubmit", () => {
    expect(
      groundOpsDocumentLockReason({ trip: { status: "in_transit", compliance_declined_at: T1 } }),
    ).toBeNull();
    expect(
      groundOpsDocumentLockReason({
        trip: { status: "in_transit", compliance_declined_at: T1, compliance_resubmitted_at: T2 },
      }),
    ).toBe("in_transit");
  });

  it("ignores an old decline that a later verify replaced", () => {
    expect(
      tripAwaitingResubmit({ compliance_declined_at: T1, compliance_verified_at: T2 }),
    ).toBe(false);
  });

  it("has a label for every reason", () => {
    expect(groundOpsDocumentLockLabel("in_transit")).toBe("Locked: trip is in transit");
    expect(groundOpsDocumentLockLabel("advance_processed")).toBe("Locked: advance processed");
  });
});

describe("own-upload grace window", () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  it("treats the user's own file from the last 15 minutes as editable", () => {
    expect(isOwnRecentUpload({ uploaded_by: "u1", uploaded_at: "2026-10-22T09:50:00Z" }, "u1", now)).toBe(true);
    expect(
      groundOpsDocumentLockReason({ trip: { status: "in_transit" }, ownRecentUpload: true }),
    ).toBeNull();
  });

  it("does not cover older files or someone else's", () => {
    expect(isOwnRecentUpload({ uploaded_by: "u1", uploaded_at: "2026-10-22T09:40:00Z" }, "u1", now)).toBe(false);
    expect(isOwnRecentUpload({ uploaded_by: "u2", uploaded_at: "2026-10-22T09:59:00Z" }, "u1", now)).toBe(false);
    expect(isOwnRecentUpload({ uploaded_by: "u1", uploaded_at: null }, "u1", now)).toBe(false);
  });
});
