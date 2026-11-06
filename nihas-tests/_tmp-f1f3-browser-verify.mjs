#!/usr/bin/env node
/**
 * Throwaway F1–F3 browser/network verification against the running Expo web
 * server. Uses the existing driver phone identity. Does not create users.
 */
import { chromium } from "playwright";
import fs from "fs";

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = "9008008008";
const OTP = "2204";
const OUT = "nihas-tests/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(`[f1f3] ${m}`);

function classify(url) {
  const u = url.toLowerCase();
  if (u.includes("trips_driver_view") && u.includes("id=eq.")) return "getDriverTripById";
  if (u.includes("/rest/v1/trips?") && u.includes("id=eq.") && !u.includes("trips_driver_view")) {
    return "getAccessibleTripById_trips";
  }
  if (u.includes("trips_driver_view") && !u.includes("id=eq.")) return "trips_driver_view_list";
  if (u.includes("get_trip_operations") || u.includes("operations_summary") || u.includes("trip_operations")) {
    return "operations_summary";
  }
  return null;
}

async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split("")) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
async function clearDigits(page, maxTaps) {
  const del = page.getByLabel("Delete last digit", { exact: true }).first();
  for (let i = 0; i < maxTaps; i++) {
    await del.click().catch(() => {});
    await page.waitForTimeout(60);
  }
}
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    if (await verify().catch(() => false)) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}

function tabBarLabel(page, label) {
  return page.getByText(new RegExp(`^${label.toUpperCase()}$`)).first();
}

function windowRequests(events, startIdx) {
  return events.slice(startIdx).filter((e) => e.kind === "request");
}

function countTag(reqs, tag) {
  return reqs.filter((e) => e.tag === tag).length;
}

async function visibleLoadingTrip(page) {
  return page.getByText("Loading trip…").first().isVisible().catch(() => false);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const events = [];
  const results = {};
  const timings = {};

  page.on("request", (req) => {
    const tag = classify(req.url());
    if (tag) {
      events.push({
        t: Date.now(),
        kind: "request",
        tag,
        method: req.method(),
        url: req.url(),
      });
    }
  });
  page.on("response", async (res) => {
    const tag = classify(res.url());
    if (!tag) return;
    const req = res.request();
    const timing = res.request().timing?.() ?? null;
    events.push({
      t: Date.now(),
      kind: "response",
      tag,
      status: res.status(),
      url: res.url(),
      timing,
    });
  });

  const shot = async (name) =>
    page.screenshot({ path: `${OUT}/f1f3-${name}.png` }).catch(() => {});

  try {
    log("sign in");
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, {
      verify: () => page.getByText("900 800 8008", { exact: false }).first().isVisible(),
    });
    await page.getByText("Send OTP", { exact: false }).first().click();
    await page
      .getByText("Verification Code", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {});
    await tapDigits(page, OTP, {
      verify: () => page.getByText("Verify OTP", { exact: false }).first().isEnabled(),
    });
    await page.getByText("Verify OTP", { exact: false }).first().click();
    await page
      .waitForURL((u) => !u.pathname.includes("driver-sign-in"), { timeout: 30_000 })
      .catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in at ${page.url()}`);

    log("1 History → Trip Detail");
    await tabBarLabel(page, "history").click();
    await page.getByText(/^TRIPS\.$/).first().waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800);
    const historyTab = page.getByText("History", { exact: true }).first();
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(1200);
    }
    const tripCard = page.locator("text=/^TRP\\d+/").first();
    await tripCard.waitFor({ state: "visible", timeout: 15_000 });
    const markDetail = events.length;
    const t0 = Date.now();
    await tripCard.click();
    await page.waitForURL((u) => u.pathname.includes("/driver-trip/"), { timeout: 20_000 });
    const spinnerSeenOnOpen = await visibleLoadingTrip(page);
    await page.getByText("TRIP HISTORY").first().waitFor({ state: "visible", timeout: 25_000 });
    timings.detailOpenMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    await shot("01-detail");
    const detailReqs = windowRequests(events, markDetail);
    results.flow1 = {
      url: page.url(),
      spinnerSeenOnOpen,
      spinnerAfterSettle: await visibleLoadingTrip(page),
      getDriverTripById: countTag(detailReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(detailReqs, "getAccessibleTripById_trips"),
      requests: detailReqs.map((r) => r.tag),
      openMs: timings.detailOpenMs,
    };
    const tripId = decodeURIComponent(page.url().split("/driver-trip/")[1]?.split("?")[0] || "");
    results.tripId = tripId;
    log(`detail tripId=${tripId} getDriverTripById=${results.flow1.getDriverTripById} openMs=${timings.detailOpenMs}`);

    log("2 Detail → Odometer → Back");
    await page.getByText("Operations", { exact: true }).first().click();
    await page.waitForTimeout(600);
    const markOdo = events.length;
    await page.getByLabel("Update odometer reading").first().click();
    await page.waitForURL((u) => u.pathname.includes("/verification"), { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot("02-odometer");
    const odoReqs = windowRequests(events, markOdo);
    results.flow2_openOdometer = {
      url: page.url(),
      getDriverTripById: countTag(odoReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(odoReqs, "getAccessibleTripById_trips"),
      requests: odoReqs.map((r) => r.tag),
      loadingVerification: await page.getByText("Loading verification...").isVisible().catch(() => false),
    };
    const odoBody = await page.evaluate(() => document.body.innerText);
    results.flow2_openOdometer.bodySnippet = odoBody.split("\n").slice(0, 20);

    const markOdoBack = events.length;
    const tBackOdo = Date.now();
    const backBtn = page.getByLabel("Back").first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    } else {
      await page.goBack();
    }
    await page.waitForURL((u) => u.pathname.includes("/driver-trip/"), { timeout: 15_000 });
    const spinnerOnOdoBack = await visibleLoadingTrip(page);
    await page.getByText("TRIP HISTORY").first().waitFor({ state: "visible", timeout: 15_000 });
    timings.odoBackMs = Date.now() - tBackOdo;
    await page.waitForTimeout(800);
    await shot("03-after-odo-back");
    const odoBackReqs = windowRequests(events, markOdoBack);
    results.flow2_back = {
      spinnerOnBack: spinnerOnOdoBack,
      spinnerAfterSettle: await visibleLoadingTrip(page),
      getDriverTripById: countTag(odoBackReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(odoBackReqs, "getAccessibleTripById_trips"),
      requests: odoBackReqs.map((r) => r.tag),
      backMs: timings.odoBackMs,
    };
    log(`odo back spinner=${spinnerOnOdoBack} getDriverTripById=${results.flow2_back.getDriverTripById} ms=${timings.odoBackMs}`);

    log("3 Detail → Expense → Back");
    await page.getByText("Settlement", { exact: true }).first().click();
    await page.waitForTimeout(700);
    const markExp = events.length;
    const addExpense = page.getByLabel("Add expense").first();
    if (await addExpense.isVisible().catch(() => false)) {
      await addExpense.click();
    } else {
      await page.getByLabel("Log expense").first().click();
    }
    await page.waitForURL((u) => u.pathname.includes("/operations/other"), { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot("04-expense");
    const expReqs = windowRequests(events, markExp);
    results.flow3_openExpense = {
      url: page.url(),
      getDriverTripById: countTag(expReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(expReqs, "getAccessibleTripById_trips"),
      requests: expReqs.map((r) => r.tag),
      loadingExpense: await page.getByText("Loading expense entry...").isVisible().catch(() => false),
    };

    const markExpBack = events.length;
    const tBackExp = Date.now();
    const expBack = page.getByLabel("Back").first();
    if (await expBack.isVisible().catch(() => false)) {
      await expBack.click();
    } else {
      await page.goBack();
    }
    await page.waitForURL((u) => u.pathname.includes("/driver-trip/"), { timeout: 15_000 });
    const spinnerOnExpBack = await visibleLoadingTrip(page);
    await page.getByText("TRIP HISTORY").first().waitFor({ state: "visible", timeout: 15_000 });
    timings.expBackMs = Date.now() - tBackExp;
    await page.waitForTimeout(800);
    await shot("05-after-exp-back");
    const expBackReqs = windowRequests(events, markExpBack);
    results.flow3_back = {
      spinnerOnBack: spinnerOnExpBack,
      spinnerAfterSettle: await visibleLoadingTrip(page),
      getDriverTripById: countTag(expBackReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(expBackReqs, "getAccessibleTripById_trips"),
      requests: expBackReqs.map((r) => r.tag),
      backMs: timings.expBackMs,
    };
    log(`exp back spinner=${spinnerOnExpBack} getDriverTripById=${results.flow3_back.getDriverTripById} ms=${timings.expBackMs}`);

    log("4/5 unmount parent then direct Odometer and Expense");
    const detailBack = page.getByLabel("Back").first();
    if (await detailBack.isVisible().catch(() => false)) {
      await detailBack.click();
    } else {
      await page.goBack();
    }
    await page.waitForTimeout(1200);
    await tabBarLabel(page, "dashboard").click().catch(() => {});
    await page.waitForTimeout(800);
    await shot("06-after-unmount");

    const markDirectOdo = events.length;
    await page.goto(`${BASE}/trip/${tripId}/verification?side=both`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.waitForTimeout(2000);
    await shot("07-direct-odometer");
    const directOdoReqs = windowRequests(events, markDirectOdo);
    results.flow4_directOdometer = {
      url: page.url(),
      getDriverTripById: countTag(directOdoReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(directOdoReqs, "getAccessibleTripById_trips"),
      loadingVerification: await page.getByText("Loading verification...").isVisible().catch(() => false),
      bodyHasError: /Trip not found|Couldn.t/i.test(await page.evaluate(() => document.body.innerText)),
      requests: directOdoReqs.map((r) => r.tag),
    };
    log(`direct odo accessible=${results.flow4_directOdometer.getAccessibleTripById_trips} driverView=${results.flow4_directOdometer.getDriverTripById}`);

    const markDirectExp = events.length;
    await page.goto(`${BASE}/trip/${tripId}/operations/other`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.waitForTimeout(2000);
    await shot("08-direct-expense");
    const directExpReqs = windowRequests(events, markDirectExp);
    results.flow5_directExpense = {
      url: page.url(),
      getDriverTripById: countTag(directExpReqs, "getDriverTripById"),
      getAccessibleTripById_trips: countTag(directExpReqs, "getAccessibleTripById_trips"),
      loadingExpense: await page.getByText("Loading expense entry...").isVisible().catch(() => false),
      bodyHasError: /Trip not found|Couldn.t open expense/i.test(
        await page.evaluate(() => document.body.innerText),
      ),
      requests: directExpReqs.map((r) => r.tag),
    };
    log(`direct exp accessible=${results.flow5_directExpense.getAccessibleTripById_trips} driverView=${results.flow5_directExpense.getDriverTripById}`);

    const odoSaveVisible = await page.getByText(/Save|Submit|Confirm/i).first().isVisible().catch(() => false);
    results.mutationUi = {
      note: "Save not attempted: would mutate live trip data; odometer typically requires photo. Invalidation covered by unit tests.",
      saveControlVisibleOnExpense: odoSaveVisible,
    };

    results.pass = {
      f1_singleInitialFetch: results.flow1.getDriverTripById === 1,
      f1_noSpinnerAfterOdoBack: results.flow2_back.spinnerOnBack === false,
      f1_noSpinnerAfterExpBack: results.flow3_back.spinnerOnBack === false,
      f2_parentReuseOdometer: results.flow2_openOdometer.getAccessibleTripById_trips === 0,
      f2_parentReuseExpense: results.flow3_openExpense.getAccessibleTripById_trips === 0,
      f2_directOdometerLoads:
        results.flow4_directOdometer.getAccessibleTripById_trips +
          results.flow4_directOdometer.getDriverTripById >=
          1 && results.flow4_directOdometer.bodyHasError === false,
      f2_directExpenseLoads:
        results.flow5_directExpense.getAccessibleTripById_trips +
          results.flow5_directExpense.getDriverTripById >=
          1 && results.flow5_directExpense.bodyHasError === false,
    };

    fs.writeFileSync(`${OUT}/f1f3-browser-results.json`, JSON.stringify({ results, timings, events }, null, 2));
    console.log("RESULTS_JSON_START");
    console.log(JSON.stringify({ results, timings }, null, 2));
    console.log("RESULTS_JSON_END");
    await browser.close();
    process.exit(0);
  } catch (err) {
    log(`FAIL: ${err.message}`);
    await shot("ERROR");
    results.fatalError = err.message;
    fs.writeFileSync(`${OUT}/f1f3-browser-results.json`, JSON.stringify({ results, events }, null, 2));
    console.log("RESULTS_JSON_START");
    console.log(JSON.stringify({ results, timings }, null, 2));
    console.log("RESULTS_JSON_END");
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
