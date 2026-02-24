import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { timer } from '../helpers/checkpoint.js';
import { handleCoachingOptIn, dismissAnyOverlay } from '../helpers/overlays.js';

export const coachBarCheck: HandlerFn = async (page, step, state) => {
  const t = timer();
  await page.waitForTimeout(3000);

  const coachBar = page.locator('.fixed.bottom-4, .fixed.bottom-2, .fixed.bottom-0').first();
  const barText = await coachBar.textContent().catch(() => null);
  const barVisible = barText && barText.length > 10;

  const anyCoachElement = page.locator('text=/coaching|coach|insight/i').last();
  const hasCoachText = await anyCoachElement.isVisible({ timeout: 2000 }).catch(() => false);

  state.data.coachBarText = barText || '';
  state.data.coachBarVisible = barVisible || hasCoachText;

  return {
    verdict: (barVisible || hasCoachText) ? 'PASS' : 'FRICTION',
    notes: `Coach bar: ${barVisible ? 'visible with content' : hasCoachText ? 'coach text present' : 'not visible'}`,
    durationMs: t(),
  };
};

export const coachPanel: HandlerFn = async (page, step, state) => {
  const t = timer();
  const action = step.params.action as string | undefined; // 'open', 'quick-start', or question text

  // Dismiss any stale overlay and handle coaching opt-in before opening panel
  await dismissAnyOverlay(page);
  await handleCoachingOptIn(page);

  // Open panel via Cmd/K
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(2000);

  const panel = page.locator('[role="dialog"], [data-vaul-drawer]').first();
  const panelOpen = await panel.isVisible({ timeout: 3000 }).catch(() => false);

  if (!panelOpen) {
    return { verdict: 'FRICTION', notes: 'Coach panel did not open via Cmd/K', durationMs: t() };
  }

  if (action === 'quick-start') {
    const quickStarts = panel.locator('button');
    const count = await quickStarts.count();
    if (count > 1) {
      await quickStarts.nth(1).click(); // Skip close button
      await page.waitForTimeout(5000);
      const text = await panel.textContent() || '';
      const gotResult = text.length > 100;

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return {
        verdict: gotResult ? 'PASS' : 'FRICTION',
        notes: `Quick-start produced ${text.length} chars of content`,
        durationMs: t(),
      };
    }
  }

  if (action && action !== 'open' && action !== 'quick-start') {
    // It's a coaching question — type it into the panel
    const coachInput = panel.locator('textarea, input[type="text"]').last();
    if (await coachInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await coachInput.fill(action);
      await page.waitForTimeout(300);
      const sendBtn = page.locator('button:has(svg.lucide-send), button[type="submit"]').last();
      if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendBtn.click();
      } else {
        await coachInput.press('Enter');
      }
      await page.waitForTimeout(15000);
    }
  }

  const panelText = await panel.textContent() || '';
  state.data.coachPanelText = panelText;

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  return {
    verdict: 'PASS',
    notes: `Coach panel opened. Content: ${panelText.length} chars`,
    durationMs: t(),
  };
};

export const coachConversation: HandlerFn = async (page, step, state) => {
  const t = timer();
  // Accept both 'question' and 'message' param names
  const question = (step.params.question || step.params.message) as string | undefined;
  // Accept both 'checkFor' and 'expectPresent' param names
  const checkFor = (step.params.checkFor || step.params.expectPresent) as string[] | undefined;
  const rejectIf = step.params.rejectIf as string[] | undefined;

  if (!question) {
    return { verdict: 'FAIL', notes: 'No question or message provided in step params', durationMs: t() };
  }

  // Dismiss any stale overlay and handle coaching opt-in
  await dismissAnyOverlay(page);
  await handleCoachingOptIn(page);

  // Navigate to Coach tab
  const coachTab = page.locator('[data-tour="tab-coach"]');
  if (await coachTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await coachTab.click();
    await page.waitForTimeout(3000);
  }

  const coachInput = page.locator('textarea, input[type="text"]').last();
  if (!await coachInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { verdict: 'FRICTION', notes: 'Coach input not found', durationMs: t() };
  }

  await coachInput.fill(question);
  await page.waitForTimeout(300);

  const sendBtn = page.locator('button:has(svg.lucide-send), button[type="submit"]').last();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await coachInput.press('Enter');
  }

  await page.waitForTimeout(15000);

  const body = await page.textContent('body') || '';
  const bodyLower = body.toLowerCase();

  // Check for expected content
  const matches = checkFor?.filter(w => bodyLower.includes(w.toLowerCase())) || [];
  const rejected = rejectIf?.filter(w => bodyLower.includes(w.toLowerCase())) || [];

  const hasRejected = rejected.length > 0;
  const hasExpected = !checkFor || matches.length > 0;

  return {
    verdict: hasRejected ? 'FRICTION' : hasExpected ? 'PASS' : 'FRICTION',
    notes: `Question: "${question.slice(0, 60)}..." Matches: ${matches.join(', ') || 'none'}. Rejected: ${rejected.join(', ') || 'none'}`,
    durationMs: t(),
  };
};
