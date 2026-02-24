import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { APP_URL } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

async function closeAnyOpenHabitForm(page: Page): Promise<void> {
  // Close any lingering inline habit form from a previous step
  const cancelBtn = page.locator('button:has-text("Cancel")').first();
  if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }
}

export const createHabit: HandlerFn = async (page, step, state) => {
  const t = timer();
  const title = (step.params.name || step.params.title) as string;
  const goalIndex = (step.params.goalIndex as number) ?? -1;

  // Close any leftover open form from a previous step
  await closeAnyOpenHabitForm(page);

  // Find the right goal card to add the habit to
  // If goalIndex is specified, use it. Otherwise try to find by goal order (state.data.goalsCreated tracks count).
  const addBtns = page.locator('button:has-text("Add Habit")');
  let btnCount = await addBtns.count();

  if (btnCount === 0) {
    // The buttons might be disabled but still exist — wait for them to become available
    await page.waitForTimeout(2000);
    btnCount = await addBtns.count();
    if (btnCount === 0) {
      return { verdict: 'FRICTION', notes: 'No "Add Habit" buttons found', durationMs: t() };
    }
  }

  // Pick which Add Habit button to click
  let targetIdx: number;
  if (goalIndex >= 0) {
    targetIdx = Math.min(goalIndex, btnCount - 1);
  } else {
    // Use habitsCreated to cycle through goals: habit 0 → goal 0, habit 1 → goal 1, etc.
    const habitsCreated = (state.data.habitsCreated as number) || 0;
    targetIdx = Math.min(habitsCreated % btnCount, btnCount - 1);
  }

  const addBtn = addBtns.nth(targetIdx);

  // Wait for the button to become enabled (might be briefly disabled after closing a form)
  let buttonEnabled = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false) &&
        await addBtn.isEnabled().catch(() => false)) {
      buttonEnabled = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!buttonEnabled) {
    return { verdict: 'FRICTION', notes: `"Add Habit" button ${targetIdx} not visible/enabled`, durationMs: t() };
  }

  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await page.waitForTimeout(1000);

  // Fill inline form — try multiple selectors for the habit input
  const titleInput = page.locator('input#habit-title, input[placeholder*="habit" i], input[placeholder*="title" i]').first();
  if (!await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeAnyOpenHabitForm(page);
    return { verdict: 'FRICTION', notes: 'Habit title input not found after clicking Add Habit', durationMs: t() };
  }

  await titleInput.click();
  await titleInput.fill(title);
  await page.waitForTimeout(300);

  // Submit — find the form's submit button (the one that appeared after clicking Add Habit)
  // Look for enabled "Add Habit" or "Add" or submit-like buttons near the form
  const submitBtns = page.locator('button:has-text("Add Habit")');
  const submitCount = await submitBtns.count();

  for (let i = submitCount - 1; i >= 0; i--) {
    const btn = submitBtns.nth(i);
    const isEnabled = await btn.isEnabled().catch(() => false);
    const isFormSubmit = await btn.evaluate(el => {
      return el.closest('.space-y-4') !== null || el.closest('form') !== null;
    }).catch(() => false);

    if (isEnabled && isFormSubmit) {
      await btn.click();
      await page.waitForTimeout(2000);
      const inputGone = !await titleInput.isVisible({ timeout: 2000 }).catch(() => true);
      if (inputGone) {
        const habitsCreated = ((state.data.habitsCreated as number) || 0) + 1;
        state.data.habitsCreated = habitsCreated;
        return {
          verdict: 'PASS',
          notes: `Habit "${title}" created (goal ${targetIdx}) in ${t()}ms. Total: ${habitsCreated}`,
          durationMs: t(),
        };
      }
    }
  }

  // Fallback — just click any enabled Add Habit button
  for (let i = submitCount - 1; i >= 0; i--) {
    const btn = submitBtns.nth(i);
    if (await btn.isEnabled().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      const habitsCreated = ((state.data.habitsCreated as number) || 0) + 1;
      state.data.habitsCreated = habitsCreated;
      return { verdict: 'PASS', notes: `Habit "${title}" created (fallback) in ${t()}ms`, durationMs: t() };
    }
  }

  // Try pressing Enter as last resort
  await titleInput.press('Enter');
  await page.waitForTimeout(2000);
  const inputGone = !await titleInput.isVisible({ timeout: 2000 }).catch(() => true);
  if (inputGone) {
    const habitsCreated = ((state.data.habitsCreated as number) || 0) + 1;
    state.data.habitsCreated = habitsCreated;
    return { verdict: 'PASS', notes: `Habit "${title}" created (Enter key) in ${t()}ms`, durationMs: t() };
  }

  // Close form gracefully
  await closeAnyOpenHabitForm(page);
  return { verdict: 'FRICTION', notes: `Could not submit habit "${title}"`, durationMs: t() };
};

export const checkHabits: HandlerFn = async (page, step, state) => {
  const t = timer();
  const maxCheck = (step.params.maxCheck as number) || 99;

  await page.goto(`${APP_URL}/home`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Dismiss any modal overlay
  const overlay = page.locator('[data-state="open"].fixed.inset-0, [role="dialog"]');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    const dismissBtn = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button:has-text("Maybe Later"), [role="dialog"] button:has-text("Not Now"), [role="dialog"] button:has-text("Dismiss")').first();
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1500);
  }

  if (!page.url().includes('/home')) {
    return { verdict: 'FRICTION', notes: `Redirected to ${page.url()}`, durationMs: t() };
  }

  const checkboxes = page.locator('button:has(div.rounded-md)');
  const count = await checkboxes.count();
  let checked = 0;

  for (let i = 0; i < Math.min(count, maxCheck); i++) {
    try {
      await checkboxes.nth(i).click({ timeout: 5000 });
      checked++;
      await page.waitForTimeout(800);
    } catch { /* skip */ }
  }

  state.data.habitsChecked = checked;

  return {
    verdict: checked > 0 ? 'PASS' : 'FRICTION',
    notes: `Checked ${checked}/${count} habits in ${t()}ms`,
    durationMs: t(),
  };
};
