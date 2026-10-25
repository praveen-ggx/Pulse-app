import {
  complianceCardMilestones,
  milestoneFromDocumentAudit,
  milestoneFromWorkflowEvent,
} from "@/features/tripCompliance/utils/complianceCardActivity.util";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

function summary(partial: Partial<ComplianceTripSummary>): ComplianceTripSummary {
  return {
    trip: { id: "t1", organization_id: "o1" } as ComplianceTripSummary["trip"],
    stage: "compliance_pending",
    documents: [],
    vehicleDocuments: [],
    driverDocuments: [],
    documentCounts: { total: 0, verified: 0, rejected: 0, pending: 0 },
    checklist: {
      groups: [
        { key: "trip", label: "Trip", slots: [], verified: 0, total: 0, tone: "warning" },
        { key: "vehicle", label: "Vehicle", slots: [], verified: 0, total: 0, tone: "warning" },
        { key: "driver", label: "Driver", slots: [], verified: 0, total: 0, tone: "warning" },
      ],
      verified: 0,
      total: 0,
      tone: "warning",
    },
    complianceVerifiedAt: null,
    complianceVerifiedBy: null,
    complianceDecision: null,
    complianceExceptionReason: null,
    complianceOutstandingSummary: null,
    complianceDeclinedAt: null,
    complianceDeclinedBy: null,
    complianceDeclineReason: null,
    advance: null,
    balance: null,
    hardCopyPod: {
      received: false,
      receivedAt: null,
      courier: null,
      awbNumber: null,
      receivedBy: null,
    },
    ...partial,
  };
}

describe("complianceCardMilestones", () => {
  it("omits trip created / in-transit and keeps card flow events", () => {
    const items = complianceCardMilestones(
      summary({
        complianceVerifiedAt: "2026-10-20T10:00:00.000Z",
        complianceVerifiedBy: "u1",
        documents: [
          {
            id: "d1",
            trip_id: "t1",
            document_type: "lr",
            file_name: "lr.pdf",
            storage_path: "lr.pdf",
            uploaded_at: "2026-10-19T09:00:00.000Z",
            uploaded_by: "u2",
            status: "verified",
            verified_by: "u1",
            verified_at: "2026-10-20T09:30:00.000Z",
            rejection_reason: null,
          },
        ],
      }),
    );
    expect(items.map((item) => item.title)).toEqual([
      "uploaded LR",
      "verified LR",
      "verified compliance",
    ]);
    expect(items.find((item) => item.title === "uploaded LR")?.lane).toBe("document");
    expect(items.find((item) => item.title === "verified compliance")?.lane).toBe("activity");
    expect(items.some((item) => item.title.includes("created"))).toBe(false);
  });
});

describe("milestoneFromWorkflowEvent", () => {
  it("prefers the event actor_id column for avatars", () => {
    const item = milestoneFromWorkflowEvent({
      id: "e1",
      event_type: "pod.debit_control_draft",
      created_at: "2026-10-25T09:45:00.000Z",
      actor_id: "user-staff",
      payload: { reason: "Charges saved" },
    });
    expect(item).toMatchObject({
      title: "saved POD charges",
      actorUserId: "user-staff",
      lane: "activity",
    });
  });

  it("maps later charge edits and removals to activity titles", () => {
    expect(
      milestoneFromWorkflowEvent({
        id: "e2",
        event_type: "pod.debit_control_charges_changed",
        created_at: "2026-10-25T11:00:00.000Z",
        actor_id: "user-staff",
        payload: { action: "removed", reason: "Removed Late delivery — no debit." },
      }),
    ).toMatchObject({
      title: "removed POD charges",
      actorUserId: "user-staff",
      detail: "Removed Late delivery — no debit.",
    });
  });
});

describe("milestoneFromDocumentAudit", () => {
  it("maps deleted and replaced rows to the document lane", () => {
    expect(
      milestoneFromDocumentAudit({
        id: "a1",
        action: "deleted",
        actor_id: "user-del",
        created_at: "2026-10-24T12:00:00.000Z",
        metadata: { old_file_name: "pod.jpg" },
      }),
    ).toMatchObject({
      title: "deleted pod.jpg",
      actorUserId: "user-del",
      lane: "document",
    });
    expect(
      milestoneFromDocumentAudit({
        id: "a2",
        action: "replaced",
        actor_id: "user-rep",
        created_at: "2026-10-24T12:05:00.000Z",
        metadata: { old_file_name: "lr.pdf", new_file_name: "lr-v2.pdf" },
      }),
    ).toMatchObject({
      title: "replaced lr.pdf",
      actorUserId: "user-rep",
      lane: "document",
    });
    expect(
      milestoneFromDocumentAudit({
        action: "uploaded",
        created_at: "2026-10-24T12:00:00.000Z",
      }),
    ).toBeNull();
  });
});
