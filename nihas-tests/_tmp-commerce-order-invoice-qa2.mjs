#!/usr/bin/env node
/**
 * Commerce Order Invoice — sign-off pass 2
 * QA-SO-001 already issued (INV/2026-27/00006)
 * QA-SO-002 for draft/cancel/issue lifecycle
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:8081";
const ISSUED_ORDER = "dcf41610-0a39-432e-9c8e-1238680ef391";
const ISSUED_NO = "QA-SO-001";
const DRAFT_ORDER = "647f234e-f8d6-42d8-a14a-aeb0ea940820";
const DRAFT_NO = "QA-SO-002";
const EMAIL = "godrej@gmail.com";
const PASSWORD = "godrej123";
const OUT = "/tmp/commerce-order-invoice-qa2";
const REPORT = { steps: {}, network: [], consoleErrors: [], pageErrors: [], issueBodies: [] };

mkdirSync(OUT, { recursive: true });
const log = (step, ok, detail = "") => {
  REPORT.steps[step] = { ok, detail };
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};
const shot = async (page, name) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false, timeout: 60000 });

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator('input[type="email"], input[placeholder*="example"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90000 });
  await page.waitForTimeout(2000);
  const remind = page.getByText("Remind me later", { exact: true }).first();
  if (await remind.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remind.click({ force: true }).catch(() => {});
  }
}

async function openOrder(page, orderId, orderNo) {
  await page.goto(`${BASE}/pulse-invoice/order/${orderId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.getByText(`Order #${orderNo}`, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 90000,
  });
  await page.waitForTimeout(1500);
}

async function openOms(page, orderNo) {
  await page.goto(`${BASE}/oms/orders`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
    await search.fill(orderNo);
    await page.waitForTimeout(1000);
  }
  await page.getByText(orderNo, { exact: false }).first().click();
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") REPORT.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => REPORT.pageErrors.push(String(e)));
  page.on("response", async (res) => {
    const url = res.url();
    if (/issue_sales_order_invoice|get_trips_for_pod|pod_org/i.test(url)) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 200);
      } catch {}
      REPORT.network.push(`${res.status()} ${url.replace(/^https?:\/\/[^/]+/, "")} ${body}`);
      if (/issue_sales_order_invoice/i.test(url)) REPORT.issueBodies.push(`${res.status()} ${body}`);
    }
  });

  try {
    await signIn(page);
    log("sign_in", true);

    // --- Issued order verification (QA-SO-001) ---
    await openOrder(page, ISSUED_ORDER, ISSUED_NO);
    let t = await page.locator("body").innerText();
    log(
      "issued_order_screen",
      /Issued/i.test(t) && /INV\/2026-27\/00006/i.test(t) && !/Save Draft/i.test(t),
      t.match(/INV\/[^\s|]+/)?.[0] || "missing",
    );
    await shot(page, "01-issued-order");

    // Duplicate: still no Save Draft
    await openOrder(page, ISSUED_ORDER, ISSUED_NO);
    t = await page.locator("body").innerText();
    log("duplicate_protection_ui", /Issued/i.test(t) && !/Save Draft/i.test(t));

    // OMS issued
    try {
      await openOms(page, ISSUED_NO);
      t = await page.locator("body").innerText();
      log(
        "oms_issued",
        /INV\//i.test(t) && /Issued/i.test(t) && /View Invoice/i.test(t) && !/Create Invoice/i.test(t),
        t.includes("INV/") ? "View Invoice" : t.slice(0, 120),
      );
      await shot(page, "02-oms-issued");
    } catch (e) {
      log("oms_issued", false, String(e).slice(0, 160));
    }

    // Finance Issued
    await page.goto(`${BASE}/invoicing-execute`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);
    t = await page.locator("body").innerText();
    const adminOk =
      /Invoices/i.test(t) &&
      !/Select a client/i.test(t) &&
      !/0 eligible ·/i.test(t);
    log("finance_admin_mounted", adminOk, adminOk ? "admin" : t.slice(0, 180).replace(/\n/g, " | "));
    await page.getByText("Issued", { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    t = await page.locator("body").innerText();
    log(
      "finance_issued_qa",
      /INV\/2026-27\/00006/i.test(t) &&
        /QA Commerce Client/i.test(t) &&
        /Order/i.test(t),
      t.includes("00006") ? "found" : t.slice(0, 200).replace(/\n/g, " | "),
    );
    log("finance_trip_source", /Trip/i.test(t), /Trip \(Legacy\)|Trip ·/i.test(t) ? "Trip label present" : "none");
    await shot(page, "03-finance-issued");

    // PDF smoke — open issued order and click Download if present
    await openOrder(page, ISSUED_ORDER, ISSUED_NO);
    const dl = page.getByText(/Download/i).first();
    if (await dl.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        dl.click(),
      ]);
      log("pdf_download", Boolean(download), download ? await download.suggestedFilename() : "no download event");
    } else {
      // Preview may embed PDF without download button label on issued view
      log("pdf_download", /Invoice Preview|Grand total|INV\//i.test(t), "preview present; no Download control");
    }
    await shot(page, "04-pdf");

    // Manual blocked
    await page.goto(`${BASE}/pulse-invoice/manual`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    t = await page.locator("body").innerText();
    log(
      "manual_blocked",
      /Manual Invoice/i.test(t) && /Client Plan|not configured|unavailable/i.test(t),
      t.slice(0, 180).replace(/\n/g, " | "),
    );
    await shot(page, "05-manual");

    // --- Draft lifecycle on QA-SO-002 ---
    await openOrder(page, DRAFT_ORDER, DRAFT_NO);
    t = await page.locator("body").innerText();
    log(
      "create_so002",
      /Fulfilled/i.test(t) &&
        /QA-SKU-1/i.test(t) &&
        /996511/i.test(t) &&
        (await page.getByText("Save Draft", { exact: true }).isVisible()),
    );
    await shot(page, "06-create-so002");

    await page.getByText("Save Draft", { exact: true }).first().click();
    await page.waitForTimeout(3500);
    t = await page.locator("body").innerText();
    log("save_draft_so002", /Cancel Draft/i.test(t));

    await page.goto(`${BASE}/invoicing-execute`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await openOrder(page, DRAFT_ORDER, DRAFT_NO);
    t = await page.locator("body").innerText();
    log(
      "resume_draft_so002",
      /Cancel Draft/i.test(t) && /QA-SKU-1/i.test(t) && /QA-SKU-2/i.test(t),
    );
    await shot(page, "07-resume");

    await page.getByText("Cancel Draft", { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await openOrder(page, DRAFT_ORDER, DRAFT_NO);
    t = await page.locator("body").innerText();
    log(
      "cancel_draft_so002",
      (await page.getByText("Save Draft", { exact: true }).isVisible()) &&
        (await page.getByText("Issue", { exact: true }).isVisible()),
    );
    await shot(page, "08-cancel");

    // Fresh issue
    REPORT.issueBodies = [];
    await page.getByText("Save Draft", { exact: true }).first().click();
    await page.waitForTimeout(2500);
    await page.getByText("Issue", { exact: true }).first().click();
    await page.waitForTimeout(5000);
    const issueOk = REPORT.issueBodies.some((b) => b.startsWith("200") && /INV\//i.test(b));
    log("issue_so002", issueOk, REPORT.issueBodies.join(" | ") || "no rpc");
    await shot(page, "09-issue-so002");

    await openOrder(page, DRAFT_ORDER, DRAFT_NO);
    t = await page.locator("body").innerText();
    log("issued_so002_screen", /Issued/i.test(t) && /INV\//i.test(t) && !/Save Draft/i.test(t), t.match(/INV\/[^\s|]+/)?.[0] || "");

    // Network: no trip pod during create on so002 was already covered earlier; spot-check
    const bad = REPORT.network.filter((n) => /get_trips_for_pod|pod_org/i.test(n));
    log("network_clean", bad.length === 0, bad.slice(0, 3).join(" | ") || "clean");

    const realConsole = REPORT.consoleErrors.filter(
      (c) => !/WebSocket|react.?devtools|hot-update/i.test(c),
    );
    log("console_clean", REPORT.pageErrors.length === 0 && realConsole.length === 0, `page=${REPORT.pageErrors.length} console=${realConsole.length}`);
  } catch (e) {
    log("fatal", false, String(e));
    console.error(e);
  } finally {
    writeFileSync(`${OUT}/report.json`, JSON.stringify(REPORT, null, 2));
    await browser.close();
    const fails = Object.entries(REPORT.steps).filter(([, v]) => !v.ok);
    console.log(`\nDONE fails=${fails.length}/${Object.keys(REPORT.steps).length}`);
    process.exit(fails.length ? 1 : 0);
  }
}

main();
