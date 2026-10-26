#!/usr/bin/env node
// Screenshot the Network tab marketplace quick cards at several widths.
// Reuses the dev server on :8081 and the same test credentials as signin-flow.mjs.
// Run: node nihas-tests/network-cards-screenshot.mjs

import http from 'node:http';
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 600_000;
const WIDTHS = [1024, 1280, 1440];
const OUT_DIR = 'nihas-tests/screenshots';

const log = (m) => console.log(`[shot] ${m}`);

function ping(path, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    try {
      const s = await ping('/', 3000);
      if (s && s < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('dev server not ready on :8081');
}

async function main() {
  await waitForServer();
  log('server up');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));

  log('opening /sign-in (first bundle compile is slow)...');
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });

  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: 'visible', timeout: 120_000 });
  // Typing before the controlled inputs hydrate gets reset back to empty state.
  await page.waitForTimeout(5000);

  const typeInto = async (field, value) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await field.click();
      await field.type(value, { delay: 20 });
      await page.waitForTimeout(400);
      if ((await field.inputValue()) === value) return;
      await field.fill('');
      await page.waitForTimeout(800);
    }
    throw new Error('value would not stick in sign-in field');
  };

  await typeInto(email, E2E_EMAIL);
  await typeInto(password, E2E_PASSWORD);
  log(`filled: email="${await email.inputValue()}" pw=${(await password.inputValue()).length} chars`);

  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 180_000 })
    .catch(() => log('WARN: still on sign-in after submit'));
  await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
  log(`after submit — at ${page.url()}`);

  await page.goto(`${BASE}/network`, { waitUntil: 'load', timeout: PAGE_TIMEOUT }).catch(() => {});
  await page.getByText('Load marketplace', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 120_000 })
    .catch(() => log('WARN: "Load marketplace" header not found'));

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(1200);
    const marker = page.getByText('Load marketplace', { exact: false }).first();
    await marker.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);

    const file = `${OUT_DIR}/network-cards-${width}.png`;
    await page.screenshot({ path: file });
    log(`wrote ${file}`);

    const texts = await page
      .getByText(/^(Give loads|Get loads|Pulse Boost|Pulse Assist)$/)
      .allInnerTexts()
      .catch(() => []);
    log(`${width}px visible titles: ${JSON.stringify(texts)}`);
  }

  await browser.close();
  log('DONE');
}

main().catch((err) => {
  console.error(`[shot] FAIL: ${err.message}`);
  process.exit(1);
});
