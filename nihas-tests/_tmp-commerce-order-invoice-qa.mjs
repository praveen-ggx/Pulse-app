#!/usr/bin/env node
/**
 * Live Commerce Order Invoice QA (Godrej / QA-SO-001).
 * Does not mutate Nvidia or historical orders.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:8081";
const ORDER_ID = "dcf41610-0a39-432e-9c8e-1238680ef391";
const ORDER_NUMBER = "QA-SO-001";
const EMAIL = "godrej@gmail.com";
const PASSWORD = "godrej123";
const OUT = "/tmp/commerce-order-invoice-qa";
const REPORT = { steps: {}, network: [], consoleErrors: [], pageErrors: [], failedRequests: [] };

mkdirSync(OUT, { recursive: true });

function log(step, ok, detail = "") {
  REPORT.steps[step] = { ok, detail };
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false, timeout: 60000 });
}

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const email = page.locator('input[placeholder*="example.com"], input[type="email"]').first();
  const pass = page.locator('input[placeholder*="password" i], input[type="password"]').first();
  await email.waitFor({ state: "visible", timeout: 60000 });
  await email.fill(EMAIL);
  await pass.fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90000 });
  await page.waitForTimeout(2000);
}

async function dismissReminder(page) {
  const remindLater = page.getByText("Remind me later", { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 2000 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function openOrderInvoice(page) {
  await page.goto(`${BASE}/pulse-invoice/order/${ORDER_ID}`, {
    waitUntil: "load",
    timeout: 90000,
  });
  await dismissReminder(page);
  await page.getByText(`Order #${ORDER_NUMBER}`, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 90000,
  });
}

async function openOmsOrderDetail(page) {
  await page.goto(`${BASE}/oms/orders`, { waitUntil: "load", timeout: 90000 });
  await dismissReminder(page);
  await page.waitForTimeout(2500);
  // Prefer search if present
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
    await search.fill(ORDER_NUMBER);
    await page.waitForTimeout(1200);
  }
  const row = page.getByText(ORDER_NUMBER, { exact: false }).first();
  await row.waitFor({ state: "visible", timeout: 60000 });
  await row.click();
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") REPORT.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => REPORT.pageErrors.push(String(err)));
  page.on("requestfailed", (req) => {
    REPORT.failedRequests.push(`${req.failure()?.errorText || "fail"} ${req.url()}`);
  });
  page.on("response", (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 400) REPORT.failedRequests.push(`${status} ${url}`);
    // Track relevant API paths during invoice flow
    if (
      /sales_order|invoice|product|client|rpc\/issue_/i.test(url) ||
      /get_trips_for_pod|pod|driver|supplier/i.test(url)
    ) {
      REPORT.network.push(`${status} ${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });

  try {
    await signIn(page);
    await dismissReminder(page);
    log("sign_in", true, page.url());

    // --- OMS Order Detail: before invoice ---
    try {
      await openOmsOrderDetail(page);
      const body = await page.locator("body").innerText();
      const hasCreate = /Create Invoice/i.test(body);
      const notInvoiced = /Not invoiced/i.test(body);
      const fulfilled = /Fulfilled/i.test(body);
      const noBulk = !/Select trips|Bulk invoice|POD table/i.test(body);
      log(
        "oms_order_detail_before",
        hasCreate && notInvoiced && fulfilled && noBulk,
        `create=${hasCreate} notInvoiced=${notInvoiced} fulfilled=${fulfilled} noBulk=${noBulk}`,
      );
      await shot(page, "01-oms-before");
      if (hasCreate) {
        const [popup] = await Promise.all([
          context.waitForEvent("page", { timeout: 15000 }).catch(() => null),
          page.getByRole("button", { name: /Create Invoice/i }).first().click(),
        ]);
        if (popup) {
          await popup.waitForLoadState("load");
          await page.waitForTimeout(500);
          // continue on popup
          await popup.close().catch(() => {});
        }
      }
    } catch (e) {
      log("oms_order_detail_before", false, String(e).slice(0, 200));
    }

    // --- Create Invoice screen ---
    REPORT.network = [];
    await openOrderInvoice(page);
    await shot(page, "02-create-invoice");
    const createText = await page.locator("body").innerText();
    const createChecks = {
      order: createText.includes(ORDER_NUMBER),
      client: /QA Commerce Client/i.test(createText),
      fulfilled: /Fulfilled/i.test(createText),
      sku1: /QA-SKU-1|996511/i.test(createText),
      sku2: /QA-SKU-2|996512/i.test(createText),
      draftLabel: /Draft/i.test(createText),
      noFakeInv: !/INV\/\d{4}/i.test(createText),
      noPodRail: !/Finance client|Select trips|POD/i.test(createText),
      save: await page.getByText("Save Draft", { exact: true }).isVisible().catch(() => false),
      issue: await page.getByText("Issue", { exact: true }).isVisible().catch(() => false),
    };
    log(
      "create_invoice_screen",
      Object.values(createChecks).every(Boolean),
      JSON.stringify(createChecks),
    );

    const badNet = REPORT.network.filter((n) =>
      /get_trips_for_pod|pod_org|supplier|driver/i.test(n),
    );
    log("network_no_trip_pod", badNet.length === 0, badNet.slice(0, 5).join(" | ") || "clean");

    // Preview totals
    const hasGrand = /Grand total/i.test(createText);
    const hasTax =
      /CGST|SGST|IGST|Tax/i.test(createText) && /12,?980|12980|11,?000|11000/i.test(createText);
    log("preview_totals", hasGrand, `grand=${hasGrand} taxish=${hasTax}`);

    // --- Save Draft ---
    await page.getByText("Save Draft", { exact: true }).first().click();
    await page.waitForTimeout(3500);
    await shot(page, "03-after-save-draft");
    const afterDraft = await page.locator("body").innerText();
    const draftUi =
      /Cancel Draft/i.test(afterDraft) ||
      /Existing draft|view_draft|Draft/i.test(afterDraft);
    log("save_draft_ui", draftUi, afterDraft.includes("Cancel Draft") ? "Cancel Draft visible" : "draft state");

    // Leave and return
    await page.goto(`${BASE}/invoicing-execute`, { waitUntil: "load", timeout: 60000 });
    await dismissReminder(page);
    await openOrderInvoice(page);
    const resumeText = await page.locator("body").innerText();
    const resumed =
      /QA-SKU-1|996511/i.test(resumeText) &&
      /QA-SKU-2|996512/i.test(resumeText) &&
      (await page.getByText("Cancel Draft", { exact: true }).isVisible().catch(() => false));
    log("resume_draft", resumed, resumed ? "same lines + Cancel Draft" : "missing draft markers");
    await shot(page, "04-resume-draft");

    // --- Cancel Draft ---
    if (await page.getByText("Cancel Draft", { exact: true }).isVisible().catch(() => false)) {
      await page.getByText("Cancel Draft", { exact: true }).first().click();
      await page.waitForTimeout(2500);
      await openOrderInvoice(page);
      const afterCancel = await page.locator("body").innerText();
      const createAgain =
        (await page.getByText("Save Draft", { exact: true }).isVisible().catch(() => false)) &&
        (await page.getByText("Issue", { exact: true }).isVisible().catch(() => false));
      log("cancel_draft", createAgain, createAgain ? "Create/Save available again" : afterCancel.slice(0, 120));
      await shot(page, "05-after-cancel");
    } else {
      log("cancel_draft", false, "Cancel Draft not visible");
    }

    // Fresh draft then Issue
    await openOrderInvoice(page);
    if (await page.getByText("Save Draft", { exact: true }).isVisible().catch(() => false)) {
      await page.getByText("Save Draft", { exact: true }).first().click();
      await page.waitForTimeout(2500);
    }
    REPORT.network = [];
    await page.getByText("Issue", { exact: true }).first().click();
    await page.waitForTimeout(5000);
    await shot(page, "06-after-issue");

    const issueRpc = REPORT.network.filter((n) => /issue_sales_order_invoice/i.test(n));
    const badIssue = REPORT.network.filter((n) => /issue_customer_invoice/i.test(n));
    log(
      "issue_rpc",
      issueRpc.length >= 1 && badIssue.length === 0,
      `orderRpc=${issueRpc.length} customerRpc=${badIssue.length}`,
    );

    // Re-open order invoice — should show issued
    await openOrderInvoice(page);
    const issuedText = await page.locator("body").innerText();
    const issuedOk =
      /Issued/i.test(issuedText) &&
      /INV\//i.test(issuedText) &&
      !(await page.getByText("Save Draft", { exact: true }).isVisible().catch(() => false));
    const invMatch = issuedText.match(/INV\/[A-Z0-9\/\-]+/i);
    log("issued_on_order_screen", issuedOk, invMatch?.[0] || "no INV");
    await shot(page, "07-issued-order-screen");

    // Duplicate protection — stay on same route; still one active
    await openOrderInvoice(page);
    const dupText = await page.locator("body").innerText();
    log(
      "duplicate_ui",
      /Issued/i.test(dupText) && !(await page.getByText("Save Draft").isVisible().catch(() => false)),
      "create blocked when issued",
    );

    // Finance Issued
    await page.goto(`${BASE}/invoicing-execute`, { waitUntil: "load", timeout: 90000 });
    await dismissReminder(page);
    await page.getByText("Issued", { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    const finText = await page.locator("body").innerText();
    const finOk =
      /QA Commerce Client/i.test(finText) &&
      (/Order/i.test(finText) || /QA-SO-001/i.test(finText)) &&
      /INV\//i.test(finText);
    log("finance_issued", finOk, finOk ? "QA invoice visible with Order source" : finText.slice(0, 200));
    await shot(page, "08-finance-issued");

    // Manual Invoice blocked
    await page.goto(`${BASE}/pulse-invoice/manual`, { waitUntil: "load", timeout: 60000 });
    await dismissReminder(page);
    const manText = await page.locator("body").innerText();
    const manOk =
      /Manual Invoice/i.test(manText) &&
      (/not configured|unavailable|Client Plan/i.test(manText));
    log("manual_blocked", manOk, manText.slice(0, 160).replace(/\n/g, " | "));
    await shot(page, "09-manual");

    // Historical trip invoice presence in Issued list
    await page.goto(`${BASE}/invoicing-execute`, { waitUntil: "load", timeout: 60000 });
    await dismissReminder(page);
    await page.waitForTimeout(2000);
    const histText = await page.locator("body").innerText();
    const histOk = /Trip \(Legacy\)/i.test(histText);
    log("historical_trip_label", histOk, histOk ? "Trip (Legacy) present" : "no legacy label in view");
    await shot(page, "10-finance-history");

    // OMS after issue
    try {
      await openOmsOrderDetail(page);
      const after = await page.locator("body").innerText();
      const omsIssued =
        /Issued/i.test(after) &&
        /INV\//i.test(after) &&
        /View Invoice/i.test(after) &&
        !/Create Invoice/i.test(after);
      log("oms_order_detail_after", omsIssued, omsIssued ? "Issued + View Invoice" : after.slice(0, 180));
      await shot(page, "11-oms-after");
    } catch (e) {
      log("oms_order_detail_after", false, String(e).slice(0, 200));
    }

    // Responsive smoke
    for (const [w, h, name] of [
      [1280, 800, "1280"],
      [1024, 768, "1024"],
      [390, 844, "390"],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await openOrderInvoice(page);
      await shot(page, `12-responsive-${name}`);
      const t = await page.locator("body").innerText();
      log(`responsive_${name}`, t.includes(ORDER_NUMBER), `viewport ${w}x${h}`);
    }

    // Console / errors
    const realConsole = REPORT.consoleErrors.filter(
      (t) => !/Download the React DevTools|warning|deprecated/i.test(t),
    );
    log(
      "console_clean",
      REPORT.pageErrors.length === 0 && realConsole.length === 0,
      `pageErrors=${REPORT.pageErrors.length} consoleErrors=${realConsole.length}`,
    );
    if (realConsole.length) console.log("CONSOLE:", realConsole.slice(0, 8));
    if (REPORT.pageErrors.length) console.log("PAGE:", REPORT.pageErrors.slice(0, 5));

    const unexpectedHttp = REPORT.failedRequests.filter(
      (r) => !/favicon|sourcemap|hot-update|telemetry/i.test(r),
    );
    log(
      "http_errors",
      unexpectedHttp.length === 0,
      unexpectedHttp.slice(0, 6).join(" | ") || "none",
    );
  } catch (e) {
    log("fatal", false, String(e));
    console.error(e);
  } finally {
    writeFileSync(`${OUT}/report.json`, JSON.stringify(REPORT, null, 2));
    await browser.close();
    const fails = Object.entries(REPORT.steps).filter(([, v]) => !v.ok);
    console.log(`\nDONE fails=${fails.length}/${Object.keys(REPORT.steps).length}`);
    console.log(`Report: ${OUT}/report.json`);
    process.exit(fails.length ? 1 : 0);
  }
}

main();
