/**
 * Page wiring of an incomplete Compliance queue (app/compliance/index.tsx): the page
 * is too large to render in a unit test, so these pin the wiring in the source.
 */
import { readFileSync } from "fs";
import { join } from "path";

const page = readFileSync(join(process.cwd(), "app/compliance/index.tsx"), "utf8");

function body(start: string): string {
  const at = page.indexOf(start);
  expect(at).toBeGreaterThan(-1);
  return page.slice(at, at + 400);
}

describe("incomplete queue: exports", () => {
  it.each([
    "const openAdvancePaymentExport = useCallback(() => {",
    "const openAdvanceProcessedExport = useCallback(() => {",
    "const openVerifiedExport = useCallback(() => {",
    "const exportTable = useCallback(async () => {",
  ])("%s starts with the incomplete-queue guard", (signature) => {
    expect(body(signature)).toContain("if (exportBlockedByIncompleteQueue()) return;");
  });

  it("the mobile export button only routes through the guarded entry points", () => {
    const mobile = body("const onMobileExport = () => {");
    expect(mobile).toContain("openVerifiedExport()");
    expect(mobile).toContain("openAdvancePaymentExport()");
    expect(mobile).toContain("openAdvanceProcessedExport()");
    expect(mobile).not.toContain("downloadComplianceTableExport");
  });

  it("the guard blocks on an incomplete queue and shows the counts", () => {
    const guard = body("const exportBlockedByIncompleteQueue = useCallback");
    expect(guard).toContain("if (!pipelineIncomplete) return false;");
    expect(guard).toContain("complianceExportBlockedMessage");
  });
});

describe("incomplete queue: loading versus failed", () => {
  it("queueStillFilling is loading only, never a failed load", () => {
    const at = page.indexOf("const queueStillFilling =");
    const statement = page.slice(at, page.indexOf(";", at));
    expect(statement).toContain("pipelineIncomplete");
    expect(statement).toContain("!pipelineLoadFailed");
  });

  it("the banner shows on desktop and mobile, with Retry wired to retryTail", () => {
    expect(page).toContain("onRetry={() => void retryTail()}");
    expect(page).toContain("banner={queueBanner}");
    expect(page).toMatch(/<View style=\{styles\.chrome\}>\s*\{queueBanner\}/);
  });

  it("stage counts carry the + marker on the desktop rail and the mobile tabs", () => {
    expect(page).toContain("incomplete={pipelineIncomplete}");
    expect(page).toContain("countsIncomplete={pipelineIncomplete}");
  });
});
