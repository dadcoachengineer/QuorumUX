import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { APP_URL, TEST_PASSWORD } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

export const login: HandlerFn = async (page, step, state) => {
  const t = timer();
  const email = (step.params.email as string) || (state.data.email as string);
  const password = (step.params.password as string) || TEST_PASSWORD;

  await page.goto(`${APP_URL}/auth`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check if already logged in (redirected away from /auth)
  if (!page.url().includes('/auth') && !page.url().includes('/welcome')) {
    return {
      verdict: 'PASS',
      notes: `Already logged in — redirected to ${page.url()} in ${t()}ms`,
      durationMs: t(),
    };
  }

  // Switch to sign-in tab if needed
  const loginTab = page.getByRole('tab', { name: /sign in|log in/i });
  if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginTab.click();
    await page.waitForTimeout(500);
  }

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(password);

  const signInButton = page.getByRole('button', { name: /sign in/i });

  // Measure login time from click to redirect (excludes setup/stability waits)
  const loginStart = Date.now();
  await signInButton.click();

  try {
    await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 15000 });
    const loginTime = Date.now() - loginStart;
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const totalTime = t();
    const verdict = loginTime > 8000 ? 'FAIL' : loginTime > 4000 ? 'FRICTION' : 'PASS';
    return {
      verdict,
      notes: `Login action took ${loginTime}ms (total ${totalTime}ms). Redirected to: ${page.url()}`,
      durationMs: totalTime,
      stateUpdates: { loginMs: loginTime },
    };
  } catch {
    return { verdict: 'FAIL', notes: `Login failed after ${t()}ms — still on auth page`, durationMs: t() };
  }
};

export const logout: HandlerFn = async (page, step, state) => {
  const t = timer();

  // Navigate to a page with the DashboardHeader (Settings page doesn't have it)
  if (page.url().includes('/settings') || page.url().includes('/network')) {
    await page.goto(`${APP_URL}/home`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }

  // Scroll to top to ensure header is visible
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const signOutBtn = page.locator('button[title="Sign out"]');
  if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutBtn.click();
    await page.waitForTimeout(3000);
    const onAuthPage = page.url().includes('/welcome') || page.url().includes('/auth');
    return {
      verdict: onAuthPage ? 'PASS' : 'FRICTION',
      notes: `Sign out via title button. On auth page: ${onAuthPage}`,
      durationMs: t(),
    };
  }

  const byName = page.getByRole('button', { name: 'Sign out' });
  if (await byName.isVisible({ timeout: 2000 }).catch(() => false)) {
    await byName.click();
    await page.waitForTimeout(3000);
    const onAuthPage = page.url().includes('/welcome') || page.url().includes('/auth');
    return {
      verdict: onAuthPage ? 'PASS' : 'FRICTION',
      notes: `Sign out via name match. On auth page: ${onAuthPage}`,
      durationMs: t(),
    };
  }

  return { verdict: 'FRICTION', notes: 'Sign out button not found', durationMs: t() };
};
