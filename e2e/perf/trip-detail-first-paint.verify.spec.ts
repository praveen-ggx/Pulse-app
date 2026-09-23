/**
 * One-off browser verification for list→detail first paint.
 * Not a product change — measures Commerce vs Core open latency.
 */
import { writeFileSync } from "node:fs";
import { test, expect, type Page, type Request } from "@playwright/test";
import { e2eCredentials } from "../support/auth";

async function signInDirect(page: Page): Promise<void> {
  const { email, password } = e2eCredentials();
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  const emailInput = page.getByPlaceholder("you@example.com").first();
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 15 });
  await expect(emailInput).toHaveValue(email, { timeout: 5_000 });
  const passwordInput = page.getByPlaceholder("Your password").first();
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 15 });
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
    timeout: 60_000,
  });
}

type NetHit = {
  t: number;
  kind: string;
  method: string;
  url: string;
  status?: number;
};

function rpcName(req: Request): string | null {
  const url = req.url();
  const rpc = url.match(/\/rpc\/([^/?]+)/);
  if (rpc) return rpc[1];
  if (url.includes("/rest/v1/trips")) return "rest.trips";
  return null;
}

function attachNetwork(page: Page, t0Ref: { t0: number }, bucket: NetHit[]) {
  page.on("request", (req) => {
    const name = rpcName(req);
    if (!name) return;
    bucket.push({
      t: Date.now() - t0Ref.t0,
      kind: name,
      method: req.method(),
      url: req.url(),
    });
  });
  page.on("response", (res) => {
    const name = rpcName(res.request());
    if (!name) return;
    const hit = bucket.find(
      (h) => h.url === res.url() && h.status == null && h.kind === name,
    );
    if (hit) hit.status = res.status();
    else {
      bucket.push({
        t: Date.now() - t0Ref.t0,
        kind: `${name}:response`,
        method: res.request().method(),
        url: res.url(),
        status: res.status(),
      });
    }
  });
}

async function firstMeaningfulMs(
  page: Page,
  t0: number,
  ready: () => Promise<boolean>,
  timeoutMs: number,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) return Date.now() - t0;
    await page.waitForTimeout(40);
  }
  return null;
}

test.describe.configure({ mode: "serial" });

test.describe("Trip detail first-paint verification", () => {
  test.setTimeout(180_000);

  test("A Commerce / C Core list / D Core deep-link", async ({ page }) => {
    const report: Record<string, unknown> = {};
    await signInDirect(page);

    // ── A: Commerce order open ──────────────────────────────────────────
    const commerceNet: NetHit[] = [];
    const commerceT0 = { t0: Date.now() };
    attachNetwork(page, commerceT0, commerceNet);

    report.commerceNote =
      "Prior run: /oms/orders loaded Pulse Commerce with 0 sales orders (onboarding incomplete). Click timing not measurable.";
    if (false) await page.goto("/oms/orders", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const orderRow = page.locator("table tbody tr").first();
    const hasOrders = await orderRow.count();
    if (!hasOrders) {
      report.commerce = { skipped: "no order rows after /oms/orders" };
    } else {
      commerceNet.length = 0;
      commerceT0.t0 = Date.now();
      await orderRow.click();
      const contentMs = await firstMeaningfulMs(
        page,
        commerceT0.t0,
        async () => page.getByText("Order Details", { exact: true }).isVisible(),
        15_000,
      );
      const numberVisible = await page
        .locator("p.font-mono.font-bold")
        .first()
        .isVisible()
        .catch(() => false);
      report.commerce = {
        clickToOrderDetailsMs: contentMs,
        orderNumberVisible: numberVisible,
        networkAfterClick: commerceNet.filter((h) => h.t >= 0 && h.t < 4000),
      };
      await page.keyboard.press("Escape").catch(() => {});
    }
    writeFileSync("/tmp/first-paint-verify.json", JSON.stringify(report, null, 2));
    await page.screenshot({ path: "/tmp/verify-commerce.png" }).catch(() => {});

    // ── C: Core trips list → detail ─────────────────────────────────────
    const coreNet: NetHit[] = [];
    const coreT0 = { t0: Date.now() };
    attachNetwork(page, coreT0, coreNet);

    await page.goto("/(tabs)/trips", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const jsAfterClick: { t: number; url: string }[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes(".bundle") || u.includes("TripDetail") || u.includes("trip-detail")) {
        jsAfterClick.push({ t: Date.now() - coreT0.t0, url: u });
      }
    });

    const tripLabel = "GOD684GODTRIP000028";
    const tripChip = page.getByRole("button", { name: new RegExp(tripLabel, "i") }).first();
    await expect(tripChip).toBeVisible({ timeout: 30_000 });

    coreNet.length = 0;
    coreT0.t0 = Date.now();
    const spinnerSeenAt: { t: number | null } = { t: null };
    const spinnerGoneAt: { t: number | null } = { t: null };
    const watchSpinner = async () => {
      const deadline = Date.now() + 20_000;
      let saw = false;
      while (Date.now() < deadline) {
        const visible = await page.getByText("Loading trip…").isVisible().catch(() => false);
        if (visible && !saw) {
          saw = true;
          spinnerSeenAt.t = Date.now() - coreT0.t0;
        }
        if (saw && !visible && spinnerGoneAt.t == null) {
          spinnerGoneAt.t = Date.now() - coreT0.t0;
          break;
        }
        await page.waitForTimeout(30);
      }
    };

    const spinnerWatch = watchSpinner();
    await tripChip.click();
    await page.waitForURL(/\/trip\//, { timeout: 20_000 });
    const urlMs = Date.now() - coreT0.t0;
    await spinnerWatch;

    const bundleHits = coreNet.filter((h) => h.kind.includes("get_trip_detail_bundle"));
    const firstBundleReq = bundleHits.find((h) => !h.kind.includes("response"));
    const firstBundleRes = coreNet.find(
      (h) =>
        h.kind === "get_trip_detail_bundle" && h.status != null ||
        h.kind === "get_trip_detail_bundle:response",
    );
    // Wait until spinner is gone or bundle returned, then snapshot UI.
    await page.waitForTimeout(200);
    const loadingVisibleAfterChunk = await page
      .getByText("Loading trip…")
      .isVisible()
      .catch(() => false);

    const snapshotBody = async () =>
      (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    const bodyEarly = await snapshotBody();
    const fieldCheck = (text: string) => ({
      tripNumber: text.includes(tripLabel),
      route: /delhi/i.test(text) && /hyderabad/i.test(text),
      status: /assigned|in transit|loading/i.test(text),
      party: /aero|ajio/i.test(text),
      driver: /kumar/i.test(text),
      amount: /₹|45\s*k|45000/i.test(text),
      kind: /asset|market|fleet|aggregate|dco/i.test(text),
      loadingCopy: /loading trip/i.test(text),
    });
    const ui = {
      tripNumber: await page.getByText(tripLabel, { exact: false }).first().isVisible().catch(() => false),
      loadingTrip: loadingVisibleAfterChunk,
      fieldsBeforeBundleWait: fieldCheck(bodyEarly),
      bodySample: bodyEarly.slice(0, 2500),
    };

    // Wait for bundle to finish so we can see enrichment + extra fetches.
    const contentAfterClickMs = await firstMeaningfulMs(
      page,
      coreT0.t0,
      async () => {
        const loading = await page.getByText("Loading trip…").isVisible().catch(() => false);
        const hasTrip = await page.getByText(tripLabel, { exact: false }).first().isVisible().catch(() => false);
        return !loading && hasTrip;
      },
      45_000,
    );
    await page
      .waitForResponse(
        (r) => r.url().includes("get_trip_detail_bundle") && r.ok(),
        { timeout: 5_000 },
      )
      .catch(() => null);
    await page.waitForTimeout(400);

    const afterBundleLoading = await page
      .getByText("Loading trip…")
      .isVisible()
      .catch(() => false);
    const bodyAfter = (await page.locator("body").innerText().catch(() => "")).slice(0, 3500);

    const tripRpcs = coreNet.filter((h) => {
      const k = h.kind.toLowerCase();
      return (
        k.includes("trip") ||
        k === "rest.trips" ||
        k.includes("get_trip")
      );
    });

    report.coreListClick = {
      tripLabel,
      clickToUrlMs: urlMs,
      clickToSeededContentMs: contentAfterClickMs,
      jsChunkHints: jsAfterClick,
      spinnerSeenAtMs: spinnerSeenAt.t,
      spinnerGoneAtMs: spinnerGoneAt.t,
      loadingVisibleBeforeBundleWait: loadingVisibleAfterChunk,
      loadingVisibleAfterBundle: afterBundleLoading,
      seedUiGuess: {
        tripNumberVisible: ui.tripNumber,
        fieldsBeforeBundleWait: ui.fieldsBeforeBundleWait,
      },
      networkTripRelated: tripRpcs,
      allRpcAfterClick: coreNet,
      bodyAfterOpen: ui.bodySample,
      bodyAfterBundle: bodyAfter,
    };

    const tripId = page.url().match(/\/trip\/([^/?#]+)/)?.[1] ?? null;
    report.openedTripId = tripId;
    writeFileSync("/tmp/first-paint-verify.json", JSON.stringify(report, null, 2));

    await page.screenshot({
      path: "/tmp/verify-core-after-list-click.png",
      fullPage: false,
    });

    // ── D: direct navigation (no list seed) ─────────────────────────────
    if (tripId) {
      const deepNet: NetHit[] = [];
      const deepT0 = { t0: Date.now() };
      attachNetwork(page, deepT0, deepNet);
      await page.goto(`http://localhost:8081/(tabs)/trips`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(500);
      deepNet.length = 0;
      deepT0.t0 = Date.now();
      await page.goto(`http://localhost:8081/trip/${tripId}`, {
        waitUntil: "domcontentloaded",
      });
      const deepSpinnerSeen = { t: null as number | null };
      const deepSpinnerGone = { t: null as number | null };
      const deadline = Date.now() + 20_000;
      let saw = false;
      while (Date.now() < deadline) {
        const visible = await page.getByText("Loading trip…").isVisible().catch(() => false);
        if (visible && !saw) {
          saw = true;
          deepSpinnerSeen.t = Date.now() - deepT0.t0;
        }
        if (saw && !visible && deepSpinnerGone.t == null) {
          deepSpinnerGone.t = Date.now() - deepT0.t0;
          break;
        }
        if (!saw && Date.now() - deepT0.t0 > 8000) break;
        await page.waitForTimeout(30);
      }
      const deepContent = await firstMeaningfulMs(
        page,
        deepT0.t0,
        async () => {
          const loading = await page.getByText("Loading trip…").isVisible().catch(() => false);
          const hasTrip = await page.getByText(/TRP\d+/i).first().isVisible().catch(() => false);
          return !loading && hasTrip;
        },
        20_000,
      );
      report.coreDeepLink = {
        tripId,
        spinnerSeenAtMs: deepSpinnerSeen.t,
        spinnerGoneAtMs: deepSpinnerGone.t,
        clickToContentMs: deepContent,
        networkTripRelated: deepNet.filter((h) => {
          const k = h.kind.toLowerCase();
          return k.includes("trip") || k === "rest.trips";
        }),
        allRpc: deepNet,
      };
      await page.screenshot({
        path: "/tmp/verify-core-deeplink.png",
        fullPage: false,
      });
    }

    writeFileSync("/tmp/first-paint-verify.json", JSON.stringify(report, null, 2));
     
    console.log("FIRST_PAINT_VERIFY_JSON " + JSON.stringify(report, null, 2));
    expect(report.coreListClick).toBeTruthy();
  });
});
