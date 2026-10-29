import {
  composeResubmitComplianceNote,
  formatResubmitChangeItemLine,
  formatResubmitChangeLogBlock,
  mergeResubmitChangeLog,
  resubmitChangeLogFromAudits,
  resubmitChangeLogFromLiveDocs,
  resubmitNoteMeetsMinimum,
} from "@/features/tripCompliance/utils/complianceResubmitChangeLog.util";
import { COMPLIANCE_DECLINE_REASON_MAX } from "@/features/tripCompliance/tripCompliance.types";

const SINCE = "2026-10-20T10:00:00.000Z";

describe("resubmitChangeLogFromAudits", () => {
  it("keeps created and deleted rows after the decline time", () => {
    const items = resubmitChangeLogFromAudits(
      [
        {
          action: "created",
          created_at: "2026-10-20T09:00:00.000Z",
          metadata: { document_type: "rc", file_name: "old-rc.pdf" },
        },
        {
          action: "deleted",
          created_at: "2026-10-20T11:00:00.000Z",
          metadata: { document_type: "rc", file_name: "old-rc.pdf" },
        },
        {
          action: "created",
          created_at: "2026-10-20T12:00:00.000Z",
          metadata: { document_type: "rc", file_name: "new-rc.pdf" },
        },
        {
          action: "uploaded",
          created_at: "2026-10-20T12:30:00.000Z",
          metadata: { document_type: "insurance", file_name: "ins.pdf" },
        },
      ],
      SINCE,
    );
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.kind)).toEqual(["deleted", "uploaded", "uploaded"]);
    expect(items[0]?.docLabel).toMatch(/RC/i);
    expect(items[0]?.fileName).toBe("old-rc.pdf");
  });
});

describe("resubmitChangeLogFromLiveDocs", () => {
  it("includes trip and entity uploads after the decline", () => {
    const items = resubmitChangeLogFromLiveDocs({
      sinceIso: SINCE,
      tripDocuments: [
        {
          document_type: "lr",
          file_name: "lr.pdf",
          uploaded_at: "2026-10-20T11:00:00.000Z",
          status: "pending",
        },
        {
          document_type: "invoice",
          file_name: "old.pdf",
          uploaded_at: "2026-10-19T11:00:00.000Z",
          status: "pending",
        },
      ],
      entityDocuments: [
        {
          doc_type: "fitness",
          notes: "fc.pdf",
          created_at: "2026-10-20T13:00:00.000Z",
          status: "uploaded",
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.docLabel).join(" ")).toMatch(/LR/i);
    expect(items.map((item) => item.docLabel).join(" ")).toMatch(/FC|Fitness/i);
  });
});

describe("merge + format + compose", () => {
  it("dedupes and formats uploaded/deleted lines", () => {
    const log = mergeResubmitChangeLog(
      SINCE,
      [
        {
          kind: "uploaded",
          docLabel: "RC",
          fileName: "rc.pdf",
          at: "2026-10-20T12:00:00.000Z",
        },
      ],
      [
        {
          kind: "uploaded",
          docLabel: "RC",
          fileName: "rc.pdf",
          at: "2026-10-20T12:00:00.000Z",
        },
        {
          kind: "deleted",
          docLabel: "Insurance",
          fileName: "ins.pdf",
          at: "2026-10-20T11:00:00.000Z",
        },
      ],
    );
    expect(log.items).toHaveLength(2);
    expect(formatResubmitChangeItemLine(log.items[0]!)).toBe("Deleted Insurance (ins.pdf)");
    const block = formatResubmitChangeLogBlock(log);
    expect(block).toContain("Changes since hold/reject:");
    expect(block).toContain("Uploaded RC (rc.pdf)");
    expect(block).toContain("Deleted Insurance (ins.pdf)");
  });

  it("composes change log + remark for compliance_resubmit_note", () => {
    const log = mergeResubmitChangeLog(SINCE, [
      {
        kind: "uploaded",
        docLabel: "RC",
        fileName: "rc.pdf",
        at: "2026-10-20T12:00:00.000Z",
      },
    ]);
    const note = composeResubmitComplianceNote({
      changeLog: log,
      remark: "Replaced RC and checked expiry",
    });
    expect(note).toContain("Changes since hold/reject:");
    expect(note).toContain("Uploaded RC (rc.pdf)");
    expect(note).toContain("—");
    expect(note).toContain("Replaced RC and checked expiry");
    expect(resubmitNoteMeetsMinimum(note)).toBe(true);
  });

  it("fits within the max note length when the log is long", () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      kind: "uploaded" as const,
      docLabel: `Doc${index}`,
      fileName: `file-${index}-${"x".repeat(20)}.pdf`,
      at: `2026-10-20T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const note = composeResubmitComplianceNote({
      changeLog: { sinceIso: SINCE, items },
      remark: "Fixed all missing copies",
    });
    expect(note.length).toBeLessThanOrEqual(COMPLIANCE_DECLINE_REASON_MAX);
    expect(note).toContain("Fixed all missing copies");
  });

  it("allows change-log-only notes that meet the minimum", () => {
    const note = composeResubmitComplianceNote({
      changeLog: mergeResubmitChangeLog(SINCE, [
        {
          kind: "uploaded",
          docLabel: "RC",
          fileName: "rc.pdf",
          at: "2026-10-20T12:00:00.000Z",
        },
      ]),
      remark: "",
    });
    expect(resubmitNoteMeetsMinimum(note)).toBe(true);
  });

  it("composes from a pre-formatted changeBlock and keeps the remark under max", () => {
    const changeBlock = [
      "Changes since hold/reject:",
      ...Array.from({ length: 30 }, (_, i) => `• Uploaded Insurance (copy-${i}.pdf)`),
    ].join("\n");
    expect(changeBlock.length).toBeGreaterThan(COMPLIANCE_DECLINE_REASON_MAX);
    const note = composeResubmitComplianceNote({
      changeBlock,
      remark: "Re-uploaded insurance",
    });
    expect(note.length).toBeLessThanOrEqual(COMPLIANCE_DECLINE_REASON_MAX);
    expect(note).toContain("Re-uploaded insurance");
    expect(note.startsWith("Changes since hold/reject:")).toBe(true);
  });
});
