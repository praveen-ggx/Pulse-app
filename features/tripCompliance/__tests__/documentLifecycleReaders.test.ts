/**
 * Every reader of vehicle / driver documents judges a slot by the same
 * current copy (features/compliance/utils/currentDocument.util.ts), so a
 * superseded copy can never create a false expiry warning, count, or block —
 * and an older valid copy can never mask a newer expired one.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { DocumentRow } from "@/features/compliance/services/documents.service";
import { computeComplianceScore } from "@/features/compliance/utils/complianceScore.util";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  buildComplianceChecklist,
  listExpiredRequiredVehicleDocTypes,
  listExpiringSoonRequiredVehicleDocTypes,
} from "@/features/tripCompliance/utils/complianceChecklist.util";
import { listMissingDocsForGroundOpsTransit } from "@/features/tripCompliance/utils/groundOpsTransitGate.util";

const NOW = new Date("2026-11-20T00:00:00Z");

function row(over: Partial<DocumentRow> & Pick<DocumentRow, "id" | "doc_type">): DocumentRow {
  return {
    organization_id: "org",
    entity_type: "vehicle",
    entity_id: "veh",
    doc_label: null,
    doc_number: null,
    issued_date: null,
    expiry_date: "2027-12-31",
    issued_by: null,
    status: "pending",
    storage_path: `path/${over.id}`,
    notes: null,
    verified_by: null,
    verified_at: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...over,
  } as DocumentRow;
}

const RC = row({ id: "rc", doc_type: "rc", expiry_date: null });
const FC = row({ id: "fc", doc_type: "fitness" });
const OLD_EXPIRED_INS = row({ id: "ins-old", doc_type: "insurance", expiry_date: "2025-11-17", created_at: "2026-11-17T06:51:25Z" });
const NEW_VALID_INS = row({ id: "ins-new", doc_type: "insurance", expiry_date: "2027-08-09", created_at: "2026-11-19T09:57:34Z" });
const OLD_VALID_INS = row({ id: "ins-old-ok", doc_type: "insurance", expiry_date: "2027-06-01", created_at: "2026-10-01T00:00:00Z" });
const NEW_EXPIRED_INS = row({ id: "ins-new-bad", doc_type: "insurance", expiry_date: "2025-01-01", created_at: "2026-11-19T00:00:00Z" });

const shadowed = [RC, FC, OLD_EXPIRED_INS, NEW_VALID_INS];
const masking = [RC, FC, OLD_VALID_INS, NEW_EXPIRED_INS];

function tripDoc(type: string): ComplianceDocumentRow {
  return {
    id: `doc-${type}`,
    trip_id: "trip-1",
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: `org/trip-1/${type}/file.pdf`,
    uploaded_at: "2026-11-19T09:00:00Z",
    status: "pending",
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
  };
}
const ALL_TRIP = ["lr", "eway_bill", "invoice", "memo"].map(tripDoc);
const DRIVER = [row({ id: "dl", doc_type: "license", entity_type: "driver" })];

describe("Compliance queue (Pending Docs routing)", () => {
  it("expired old + valid new: not held back", () => {
    expect(listExpiredRequiredVehicleDocTypes(shadowed, NOW)).toEqual([]);
  });
  it("valid old + expired new: held back", () => {
    expect(listExpiredRequiredVehicleDocTypes(masking, NOW)).toEqual(["insurance"]);
  });
  it("expiring-soon uses the current copy only", () => {
    const soonOld = row({ id: "a", doc_type: "insurance", expiry_date: "2026-12-01", created_at: "2026-01-01T00:00:00Z" });
    const laterNew = row({ id: "b", doc_type: "insurance", expiry_date: "2027-12-01", created_at: "2026-11-01T00:00:00Z" });
    expect(listExpiringSoonRequiredVehicleDocTypes([soonOld, laterNew], NOW, 30)).toEqual([]);
  });
});

describe("Compliance checklist", () => {
  const vehicleVerified = (docs: DocumentRow[]) =>
    buildComplianceChecklist({ tripDocuments: [], vehicleDocuments: docs, driverDocuments: [], now: NOW })
      .groups.find((g) => g.key === "vehicle")?.verified;
  it("counts the slot when the current copy is valid", () => {
    expect(vehicleVerified(shadowed)).toBe(3);
  });
  it("does not count the slot when the current copy is expired, even with a valid older copy", () => {
    expect(vehicleVerified(masking)).toBe(2);
  });
});

describe("Ground Ops transit gate (assignment / start eligibility)", () => {
  it("expired old + valid new: may start", () => {
    expect(
      listMissingDocsForGroundOpsTransit({ documents: ALL_TRIP, vehicleDocuments: shadowed, driverDocuments: DRIVER }, NOW),
    ).toEqual([]);
  });
  it("valid old + expired new: insurance missing", () => {
    expect(
      listMissingDocsForGroundOpsTransit({ documents: ALL_TRIP, vehicleDocuments: masking, driverDocuments: DRIVER }, NOW),
    ).toEqual(["insurance"]);
  });
});

describe("Trip Detail badge / dashboard score (computeComplianceScore)", () => {
  it("a superseded expired copy is not counted", () => {
    const score = computeComplianceScore(shadowed, "vehicle");
    expect(score.breakdown.expired).toBe(0);
    expect(score.breakdown.total).toBe(3);
  });
  it("an expired current copy is counted", () => {
    expect(computeComplianceScore(masking, "vehicle").breakdown.expired).toBe(1);
  });
  it("rejected rows are not expired and do not make a slot present", () => {
    const rejected = row({ id: "rej", doc_type: "permit", status: "rejected", expiry_date: "2025-01-01" });
    const score = computeComplianceScore([RC, FC, NEW_VALID_INS, rejected], "vehicle");
    expect(score.breakdown.expired).toBe(0);
    // insurance, rc, fitness present; permit (rejected only) + pollution missing
    expect(score.breakdown.missing).toBe(2);
  });
});

describe("SQL readers migration (static contract, nothing applied)", () => {
  const NAME = "20261120055411_entity_documents_superseded_readers.sql";
  const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();

  it("uses a CLI (non-midnight) version", () => {
    expect(NAME.slice(8, 14)).not.toBe("000000");
  });

  it("defines the superseded helper with the same rule as the app, closed to API roles", () => {
    expect(sql).toContain("create or replace function private.entity_document_is_superseded(");
    expect(sql).toContain("n.status not in ('replaced', 'rejected')");
    expect(sql).toContain("n.expiry_date is not null");
    expect(sql).toContain("n.expiry_date is distinct from p_expiry_date");
    expect(sql).toContain("n.created_at > p_created_at");
    expect(sql).toMatch(/revoke all on function private\.entity_document_is_superseded\([^)]*\) from authenticated/);
  });

  it.each([
    ["get_compliance_summary", 1],
    ["get_expiring_documents", 1],
    ["compute_compliance_score", 1],
    ["is_compliance_blocking", 2],
  ])("%s skips superseded rows", (fn, uses) => {
    const start = sql.indexOf(`create or replace function public.${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf("$function$;", start);
    const body = sql.slice(start, end);
    expect(body.split("not private.entity_document_is_superseded(").length - 1).toBe(uses);
  });

  it("changes no data", () => {
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from|truncate|drop table|alter table)\b/);
  });
});
