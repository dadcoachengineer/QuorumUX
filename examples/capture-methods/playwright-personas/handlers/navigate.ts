import type { Page } from 'playwright';
import type { HandlerFn, HandlerResult, JourneyStep, RunState } from '../helpers/types.js';
import { APP_URL } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

export const navigateUrl: HandlerFn = async (page, step, state) => {
  const t = timer();
  const url = step.params.url as string;
  const fullUrl = url.startsWith('/') ? `${APP_URL}${url}` : url;

  await page.goto(fullUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  return {
    verdict: 'PASS',
    notes: `Navigated to ${fullUrl} in ${t()}ms`,
    durationMs: t(),
  };
};

export const navigateTab: HandlerFn = async (page, step, state) => {
  const t = timer();
  const tabId = (step.params.tabId || step.params.tab) as string;

  const tab = page.locator(`[data-tour="tab-${tabId}"]`);
  if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(1500);
    return { verdict: 'PASS', notes: `Navigated to ${tabId} tab in ${t()}ms`, durationMs: t() };
  }

  // Fallback: try text-based
  const textTab = page.locator(`button:has-text("${tabId}"), [role="tab"]:has-text("${tabId}")`).first();
  if (await textTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await textTab.click();
    await page.waitForTimeout(1500);
    return { verdict: 'PASS', notes: `Navigated to ${tabId} tab (text match) in ${t()}ms`, durationMs: t() };
  }

  return { verdict: 'FRICTION', notes: `Tab "${tabId}" not found`, durationMs: t() };
};
