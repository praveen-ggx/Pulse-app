/**
 * Failed hub tab must not reuse the newest-500 finite indent list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "../indents.service.ts"), "utf8");

describe("getFailedIndentsByOrganization", () => {
  const fn = SOURCE.slice(
    SOURCE.indexOf("export async function getFailedIndentsByOrganization"),
    SOURCE.indexOf("export async function getIndentsDelta"),
  );

  it("queries cancelled/expired by org and pages instead of FINITE_LIST_CAP", () => {
    expect(fn).toContain('.in("status", [...FAILED_INDENT_STATUSES])');
    expect(fn).toContain('.eq("organization_id", orgId)');
    expect(fn).toContain(".range(offset, offset + FAILED_INDENT_PAGE_SIZE - 1)");
    expect(fn).not.toContain("FINITE_LIST_CAP");
    expect(fn).toContain("attachActiveTripRefs");
    expect(fn).toMatch(/active_trip\?\.length/);
  });

  it("is a separate export from the capped org list", () => {
    expect(SOURCE).toContain("export async function getFailedIndentsByOrganization");
    expect(SOURCE.indexOf("export async function getFailedIndentsByOrganization")).toBeGreaterThan(
      SOURCE.indexOf("export async function getIndentsByOrganization"),
    );
  });
});
