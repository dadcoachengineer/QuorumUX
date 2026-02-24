import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { timer } from '../helpers/checkpoint.js';

export const createGoal: HandlerFn = async (page, step, state) => {
  const t = timer();
  const title = step.params.title as string;
  const category = step.params.category as string || 'Education';

  // Click "+ Create Goal" or "Add Goal" button
  const pageBtns = page.locator('button:has-text("Create Goal"), button:has-text("Add Goal")');
  let dialogOpened = false;
  for (let i = 0; i < await pageBtns.count(); i++) {
    const btn = pageBtns.nth(i);
    if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1500);
      dialogOpened = await page.locator('[role="dialog"]').isVisible({ timeout: 3000 }).catch(() => false);
      if (dialogOpened) break;
    }
  }
  if (!dialogOpened) {
    return { verdict: 'FRICTION', notes: 'Could not open Create Goal dialog', durationMs: t() };
  }

  const dialog = page.locator('[role="dialog"]');

  // Fill title
  const titleInput = dialog.locator('input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 3000 });
  await titleInput.click();
  await titleInput.fill(title);
  await page.waitForTimeout(300);

  // Select development type
  const typeBtn = dialog.locator(`button:has-text("${category}")`).first();
  if (await typeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await typeBtn.scrollIntoViewIfNeeded();
    await typeBtn.click();
    await page.waitForTimeout(500);
  }

  // Submit
  const submitBtn = dialog.locator('button').filter({ hasText: 'Create Goal' }).last();
  await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  if (await submitBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
    await submitBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const goalsCreated = ((state.data.goalsCreated as number) || 0) + 1;
    state.data.goalsCreated = goalsCreated;

    return {
      verdict: 'PASS',
      notes: `Goal "${title}" (${category}) created in ${t()}ms. Total: ${goalsCreated}`,
      durationMs: t(),
    };
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return { verdict: 'FRICTION', notes: `Create Goal button disabled for "${title}"`, durationMs: t() };
};
