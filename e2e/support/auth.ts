import type { Page } from '@playwright/test';

/**
 * Shared web sign-in helper for Playwright specs.
 *
 * Credentials come from e2e/.env.e2e (gitignored), loaded in playwright.config.ts.
 * There is deliberately no hardcoded fallback: a missing credential should fail loudly
 * at setup rather than silently run the whole suite as a logged-out user, which
 * produces confusing "element not found" failures instead of "you forgot the env file".
 *
 * Flow mirrors nihas-tests/signin-flow.mjs, the manual smoke script this was derived from:
 *   /terminal-website → "Enter OS" (inside an iframe) → /onboarding → "Sign in" → email/password → submit.
 * `signin-submit-btn` is a real testID (app/sign-in.tsx:291); the rest are text/role based
 * because the sign-in screen carries no other testIDs.
 */

export function e2eCredentials(): { email: string; password: string } {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing E2E_EMAIL / E2E_PASSWORD. Copy e2e/.env.e2e.example to e2e/.env.e2e and fill it in.',
    );
  }
  return { email, password };
}

/**
 * The QA member's own login — Context B in the cross-user persistence specs.
 *
 * Separate from e2eCredentials() because the cross-user test needs BOTH identities
 * live at once: the owner edits permissions, the QA member proves what they can
 * actually reach. A single credential pair can only ever test the editor screen,
 * which shows what was saved, not what is enforced.
 */
export function qaCredentials(): { email: string; password: string } {
  const email = process.env.E2E_QA_EMAIL;
  const password = process.env.E2E_QA_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing E2E_QA_EMAIL / E2E_QA_PASSWORD in e2e/.env.e2e — needed for the QA member session.',
    );
  }
  return { email, password };
}

export async function signIn(
  page: Page,
  who: { email: string; password: string } = e2eCredentials(),
): Promise<void> {
  const { email, password } = who;

  await page.goto('/terminal-website');

  const cta = page
    .frameLocator('iframe[title="pulse."]')
    .getByRole('link', { name: 'Enter OS' })
    .first();
  await cta.waitFor({ state: 'visible' });
  await cta.click();

  await page.waitForURL(/\/(sign-in|onboarding|welcome)/).catch(() => {});

  const signInLink = page.getByText('Sign in', { exact: true }).first();
  await signInLink.waitFor({ state: 'visible' });
  await signInLink.click();

  // pressSequentially, NOT fill(). This is React Native Web: fill() sets the DOM value
  // in one shot without the key events React's onChangeText listens for, so component
  // state stays empty and the form rejects with "Enter your email address." even though
  // the input visibly contains text. Verified against the live sign-in screen.
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 180_000 });
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 20 });

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 20 });

  await page.locator('[data-testid="signin-submit-btn"]').first().click();

  // Landing on a tab means the session took; still sitting on /sign-in means it didn't,
  // and failing here is far clearer than a downstream "element not found".
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 120_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}
