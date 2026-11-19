import fs from "fs";
import path from "path";
import { decideDuplicateBatch } from "@/features/bulkOperations/utils/bulkOperation.engine.util";

const root = path.resolve(__dirname, "../../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20271118161500_bulk_operation_audit.sql"),
  "utf8",
);
const history = fs.readFileSync(
  path.join(root, "features/bulkOperations/services/bulkHistory.service.ts"),
  "utf8",
);

describe("bulk execution boundary", () => {
  it("keeps confirmation on the database RPCs", () => {
    expect(history).toContain("bulk_payment_field_submit");
    expect(history).toContain("bulk_payment_field_apply_next");
    expect(history).not.toContain("applyPaymentFieldPatch");
    expect(history).not.toContain('.from("transactions")');
  });

  it("does not steal an executing batch after a timeout", () => {
    expect(decideDuplicateBatch("executing")).toBe("in_progress");
    expect(decideDuplicateBatch("completed")).toBe("replay");
    expect(migration).toContain("execution_owner IS DISTINCT FROM auth.uid()");
    expect(migration).toContain("FOREIGN KEY (batch_id, organization_id)");
    expect(migration).toContain("FOREIGN KEY (row_id, batch_id, organization_id)");
    expect(migration).not.toMatch(/GRANT INSERT ON public\.bulk_operation_batches/i);
    expect(migration).not.toMatch(/GRANT UPDATE ON public\.bulk_operation_batches/i);
  });
});
