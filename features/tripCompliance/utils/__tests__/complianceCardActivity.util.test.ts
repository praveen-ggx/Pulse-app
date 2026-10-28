import {
  backfillMilestoneActors,
  complianceCardMilestones,
  milestoneFromDocumentAudit,
  milestoneFromWorkflowEvent,
  milestonesFromTripDocument,
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
  it("reads actor ids from payload aliases when the column is empty", () => {
    expect(
      milestoneFromWorkflowEvent({
        id: "e0",
        event_type: "compliance.advance_document_cost",
        created_at: "2026-10-25T13:17:00.000Z",
        payload: { created_by: "user-from-payload" },
      }),
    ).toMatchObject({
      title: "logged advance document cost",
      actorUserId: "user-from-payload",
    });
  });

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

  it("maps finance.verified to a compliance category", () => {
    expect(
      milestoneFromWorkflowEvent({
        id: "fv",
        event_type: "finance.verified",
        created_at: "2026-10-25T13:24:00.000Z",
        actor_id: "user-dhira",
      }),
    ).toMatchObject({
      title: "verified finance",
      contextLabel: "Finance",
      category: "compliance",
      detail: "Advance approved by Finance",
    });
  });

  it("keeps unknown workflow edits on the activity list", () => {
    expect(
      milestoneFromWorkflowEvent({
        id: "e3",
        event_type: "trip.rate_updated",
        created_at: "2026-10-25T12:00:00.000Z",
        actor_id: "user-staff",
        payload: { reason: "Client rate changed" },
      }),
    ).toMatchObject({
      title: "rate updated",
      actorUserId: "user-staff",
      detail: "Client rate changed",
      contextLabel: "Journey",
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

describe("milestonesFromTripDocument", () => {
  it("keeps the uploader id on vault files", () => {
    expect(
      milestonesFromTripDocument({
        id: "doc-1",
        document_type: "lr",
        file_name: "lr.pdf",
        uploaded_at: "2026-10-24T09:00:00.000Z",
        uploaded_by: "user-priya",
        status: "verified",
        verified_at: "2026-10-24T10:00:00.000Z",
        verified_by: "user-vasanth",
      }),
    ).toEqual([
      expect.objectContaining({
        title: "uploaded LR",
        actorUserId: "user-priya",
        detail: "lr.pdf",
        lane: "document",
        category: "document",
      }),
      expect.objectContaining({
        title: "verified LR",
        actorUserId: "user-vasanth",
        lane: "document",
      }),
    ]);
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
        metadata: { file_name: "lr.pdf" },
      }),
    ).toMatchObject({
      title: "uploaded lr.pdf",
      lane: "document",
    });
    expect(
      milestoneFromDocumentAudit({
        action: "updated",
        created_at: "2026-10-24T12:10:00.000Z",
        metadata: { file_name: "lr.pdf" },
      }),
    ).toMatchObject({
      title: "edited lr.pdf",
      contextLabel: "Document Edited",
    });
  });
});

describe("backfillMilestoneActors", () => {
  it("copies a nearby named actor onto an unnamed upload", () => {
    const filled = backfillMilestoneActors(
      [
        {
          id: "pod",
          at: "2026-10-25T14:25:00.000Z",
          title: "logged hard copy POD",
          actorUserId: "user-priya",
          detail: "Hard copy dispatched by courier",
          contextLabel: "Awaiting POD",
          lane: "activity",
        },
        {
          id: "file",
          at: "2026-10-25T14:25:20.000Z",
          title: "uploaded POD",
          detail: "pulse.hard-copy.jpeg",
          contextLabel: "Document Upload",
          lane: "document",
        },
      ],
      [{ at: "2026-10-25T13:17:00.000Z", userId: "user-cost" }],
    );
    expect(filled[1]?.actorUserId).toBe("user-priya");
  });
});
