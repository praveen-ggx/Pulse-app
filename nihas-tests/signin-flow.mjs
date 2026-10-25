#!/usr/bin/env node
// SIGN-IN FLOW (headed) — automates: /terminal-website → Enter OS → Sign in →
// fill credentials → Enter dashboard. Opens a real maximized Chromium window.
// Reuses the dev server on :8081 if running; otherwise starts `npm run web`.
// Run: npm run signin   (tweak view time with HOLD_MS=60000 npm run signin)

import { spawn } from 'node:child_process';
import http from 'node:http';
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();

const PORT = 8081;
const ROUTE = '/terminal-website';
const BASE = `http://localhost:${PORT}`;
const URL = `${BASE}${ROUTE}`;
const SERVER_READY_TIMEOUT = 120_000;
const PAGE_TIMEOUT = 600_000; // first web bundle can be slow
const HOLD_MS = Number(process.env.HOLD_MS || 30000); // keep window open to view

const log = (m) => console.log(`[test] ${m}`);

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

async function isServerUp() {
  try {
    const s = await ping('/', 3000);
    return s && s < 500;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < SERVER_READY_TIMEOUT) {
    if (await isServerUp()) {
      log(`server up after ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server did not become ready in time');
}

async function main() {
  let server = null;
  const shutdown = () => {
    if (!server) return;
    try { process.kill(-server.pid); } catch {}
    try { server.kill('SIGTERM'); } catch {}
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => { shutdown(); process.exit(130); });

  let browser;
  try {
    if (await isServerUp()) {
      log(`reusing existing dev server on :${PORT}`);
    } else {
      log('starting expo web dev server...');
      server = spawn('npm', ['run', 'web'], {
        cwd: process.cwd(),
        env: { ...process.env, CI: 'false' },
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: true,
      });
      await waitForServer();
    }

    log('launching headed Chromium...');
    browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
    // viewport: null → page fills the actual window instead of a fixed 1280px box.
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    log(`opening ${URL} (compiling bundle — slow step)...`);
    const t0 = Date.now();
    const resp = await page.goto(URL, { waitUntil: 'load', timeout: PAGE_TIMEOUT });
    // Wait for React to mount actual content, not just the empty shell.
    await page.waitForSelector('#root *, body div', { timeout: PAGE_TIMEOUT });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (!resp || resp.status() !== 200) {
      throw new Error(`${ROUTE} returned HTTP ${resp ? resp.status() : 'none'}`);
    }

    const title = await page.title();
    log(`✓ loaded ${ROUTE} (HTTP 200, title="${title}") in ${secs}s`);
    if (errors.length) log(`⚠ ${errors.length} console error(s): ${errors.slice(0, 3).join(' | ')}`);

    // Click the "Enter OS" CTA (href="/onboarding"). The landing page renders
    // inside a srcDoc iframe (title="pulse."); reach into it via
    // frameLocator so we wait for the frame's content to render.
    log('clicking "Enter OS" (→ /onboarding)...');
    const cta = page
      .frameLocator('iframe[title="pulse."]')
      .getByRole('link', { name: 'Enter OS' })
      .first();
    await cta.waitFor({ state: 'visible', timeout: 30_000 });
    await cta.click();

    await page.waitForURL(/\/(sign-in|onboarding|welcome)/, { timeout: PAGE_TIMEOUT }).catch(() => {});
    log(`✓ navigated to ${page.url()}`);

    // Click "Sign in" (RN Web renders it as a text div, not a button).
    log('clicking "Sign in"...');
    const signIn = page.getByText('Sign in', { exact: true }).first();
    await signIn.waitFor({ state: 'visible', timeout: 30_000 });
    await signIn.click();
    log(`✓ clicked — now at ${page.url()}`);

    // Fill credentials and submit the sign-in form.
    log('filling credentials...');
    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();
    await email.waitFor({ state: 'visible', timeout: 30_000 });
    // Controlled inputs need a moment after mount, or typed text gets reset to empty.
    await page.waitForTimeout(5000);

    // Type, never fill(): this is React Native Web, and fill() sets the DOM value without
    // the key events the controlled input listens for — the form then submits empty and
    // rejects with "Enter your email address." Retry until the value sticks.
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

    log('clicking "Enter dashboard"...');
    const submit = page.locator('[data-testid="signin-submit-btn"]').first();
    await submit.click();
    // Leaving /sign-in is the only real proof the session took. Without this the script
    // used to print PASS while sitting on the login screen with the form rejected.
    await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 180_000 });
    await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
    log(`✓ signed in — now at ${page.url()}`);

    log(`holding window open ${HOLD_MS}ms (close the window early to finish)...`);
    // A manual window close during the hold is fine — swallow that error.
    await page.waitForTimeout(HOLD_MS).catch(() => {});

    log('PASS');
    await browser.close().catch(() => {});
    process.exit(0);
  } catch (err) {
    console.error(`[test] FAIL: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  } finally {
    shutdown();
  }
}

main();
