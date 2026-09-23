import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION =
  "supabase/migrations/20270921203611_issue_customer_invoice_atomic.sql";
const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
const service = readFileSync(
  join(__dirname, "../invoicing.service.ts"),
  "utf8",
);

describe("issue_customer_invoice — atomic issuance contract", () => {
  it("validates, allocates, and inserts in one SECURITY DEFINER function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.issue_customer_invoice(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("allocate_invoice_number");
    expect(sql).toContain("INSERT INTO public.invoices");
    expect(sql).toContain("trip_ids && p_trip_ids");
    const draftSql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20270922021844_invoice_issue_draft_idempotency.sql",
      ),
      "utf8",
    );
    expect(draftSql).toContain("issue_idempotency_key");
    expect(draftSql).toContain("p_draft_id");
    expect(sql).not.toMatch(/INSERT INTO public\.trip_workflow_events/i);
  });

  it("treats NULL client POD policy as unconfigured", () => {
    expect(sql).toContain("NULL = unconfigured");
    expect(sql).toContain(
      "This client has no invoicing POD policy. Set none, soft copy, or hard copy before invoicing.",
    );
  });

  it("JS issues via the RPC then records workflow events after commit", () => {
    expect(service).toMatch(/issue_customer_invoice/);
    expect(service).not.toMatch(/\.rpc\(\s*["']allocate_invoice_number["']/);
    const issueIdx = service.indexOf('"issue_customer_invoice"');
    const eventIdx = service.lastIndexOf("recordTripWorkflowEvent({");
    expect(issueIdx).toBeGreaterThan(-1);
    expect(eventIdx).toBeGreaterThan(issueIdx);
  });
});
