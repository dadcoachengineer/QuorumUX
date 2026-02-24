import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { APP_URL } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

export const settingsCheck: HandlerFn = async (page, step, state) => {
  const t = timer();
  const checks = step.params.checks as string[] || ['Profile', 'Privacy'];

  await page.goto(`${APP_URL}/settings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const body = await page.textContent('body') || '';
  const found = checks.filter(c => body.includes(c));
  const missing = checks.filter(c => !body.includes(c));

  return {
    verdict: missing.length === 0 ? 'PASS' : 'FRICTION',
    notes: `Settings: found=[${found.join(', ')}], missing=[${missing.join(', ')}]`,
    durationMs: t(),
  };
};

export const networkPageCheck: HandlerFn = async (page, step, state) => {
  const t = timer();

  await page.goto(`${APP_URL}/network`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const body = await page.textContent('body') || '';
  const hasMentors = body.includes('Mentor') || body.includes('Request');
  const hasTabs = body.includes('Discover') || body.includes('Connections');

  return {
    verdict: (hasMentors || hasTabs) ? 'PASS' : 'FRICTION',
    notes: `Network: mentors=${hasMentors}, tabs=${hasTabs}`,
    durationMs: t(),
  };
};

export const pageContentAssert: HandlerFn = async (page, step, state) => {
  const t = timer();
  const url = step.params.url as string | undefined;
  const assertPresent = step.params.assertPresent as string[] | undefined;
  const assertAbsent = step.params.assertAbsent as string[] | undefined;
  const assertLabel = step.params.label as string || 'content-assert';

  if (url) {
    const fullUrl = url.startsWith('/') ? `${APP_URL}${url}` : url;
    await page.goto(fullUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }

  const body = await page.textContent('body') || '';
  const bodyLower = body.toLowerCase();

  const presentMatches = assertPresent?.filter(s => bodyLower.includes(s.toLowerCase())) || [];
  const presentMissing = assertPresent?.filter(s => !bodyLower.includes(s.toLowerCase())) || [];
  const absentFound = assertAbsent?.filter(s => bodyLower.includes(s.toLowerCase())) || [];

  const pass = presentMissing.length === 0 && absentFound.length === 0;

  return {
    verdict: pass ? 'PASS' : 'FRICTION',
    notes: `${assertLabel}: present=[${presentMatches.join(', ')}] missing=[${presentMissing.join(', ')}] unwanted=[${absentFound.join(', ')}]`,
    durationMs: t(),
  };
};

export const enhancedCoachingOptIn: HandlerFn = async (page, step, state) => {
  const t = timer();

  await page.goto(`${APP_URL}/settings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Scroll to Privacy & Data
  const privacySection = page.locator('text=Privacy & Data').first();
  if (await privacySection.isVisible({ timeout: 3000 }).catch(() => false)) {
    await privacySection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  const enhancedLabel = page.locator('text=Enhanced AI Coaching').first();
  if (!await enhancedLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  if (await enhancedLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    const toggleSwitch = page.locator('button[role="switch"]').last();
    if (await toggleSwitch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleSwitch.click();
      await page.waitForTimeout(2000);

      // Handle confirmation modal
      const confirmBtn = page.getByRole('button', { name: /enable|confirm|yes|opt.in|agree/i });
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }

      state.data.enhancedCoachingEnabled = true;
      return { verdict: 'PASS', notes: 'Enhanced coaching toggled on', durationMs: t() };
    }
    return { verdict: 'FRICTION', notes: 'Toggle switch not found', durationMs: t() };
  }

  return { verdict: 'FRICTION', notes: 'Enhanced AI Coaching label not found', durationMs: t() };
};

export const legalPageCheck: HandlerFn = async (page, step, state) => {
  const t = timer();
  const rawRoutes = step.params.routes as Array<string | { url: string; expected?: string[] }>;
  const expectedContent = step.params.expectedContent as Record<string, string[]> | undefined;

  const results: string[] = [];
  let allPass = true;

  for (const routeItem of rawRoutes) {
    // Support both string routes and { url, expected } objects
    const route = typeof routeItem === 'string' ? routeItem : routeItem.url;
    const checks = (typeof routeItem === 'object' && routeItem.expected)
      ? routeItem.expected
      : (expectedContent?.[route] || []);

    await page.goto(`${APP_URL}${route}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const body = await page.textContent('body') || '';
    const found = checks.filter(c => body.includes(c));
    const missing = checks.filter(c => !body.includes(c));

    if (missing.length > 0) allPass = false;
    results.push(`${route}: found=${found.length}/${checks.length}`);
  }

  return {
    verdict: allPass ? 'PASS' : 'FRICTION',
    notes: results.join('; '),
    durationMs: t(),
  };
};
