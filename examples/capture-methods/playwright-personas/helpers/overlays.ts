import type { Page } from 'playwright';

/**
 * Detect and dismiss the Enhanced Coaching opt-in AlertDialog (PR #482).
 * Returns true if a modal was found and dismissed.
 */
export async function handleCoachingOptIn(page: Page): Promise<boolean> {
  const optInModal = page.locator('[role="alertdialog"], [role="dialog"]').filter({
    hasText: /Enhanced.*Coaching|personalized coaching/i,
  });

  const isVisible = await optInModal.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isVisible) return false;

  // Prefer "Enable" to opt in
  const enableButton = optInModal.locator('button').filter({ hasText: /enable/i });
  if (await enableButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await enableButton.click();
    await optInModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  }

  // Fallback: dismiss with Maybe Later / Cancel
  const laterButton = optInModal.locator('button').filter({ hasText: /maybe later|dismiss|cancel/i });
  if (await laterButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await laterButton.first().click();
    await optInModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  }

  return false;
}

/**
 * Handle the inline "Replace existing values?" confirmation that appears
 * when a returning test account already has values.
 */
export async function handleValuesReplaceConfirmation(page: Page): Promise<boolean> {
  const replacePrompt = page.locator('text=/Replace existing values/i');
  const isVisible = await replacePrompt.isVisible({ timeout: 2000 }).catch(() => false);
  if (!isVisible) return false;

  const replaceButton = page.locator('button').filter({ hasText: /Replace Values/i });
  if (await replaceButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await replaceButton.click();
    await page.waitForTimeout(1000);
    return true;
  }

  return false;
}

/**
 * Generic overlay dismissal — detects any open Radix dialog/alertdialog/sheet
 * and closes it before critical interactions.
 */
export async function dismissAnyOverlay(page: Page): Promise<boolean> {
  const overlay = page.locator(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-state="open"].fixed.inset-0',
  );

  const isVisible = await overlay.first().isVisible({ timeout: 1000 }).catch(() => false);
  if (!isVisible) return false;

  const dismissSelectors = [
    overlay.first().locator('button').filter({ hasText: /cancel|close|dismiss|maybe later|not now/i }),
    overlay.first().locator('[aria-label="Close"]'),
    overlay.first().locator('button[data-dismiss]'),
  ];

  for (const button of dismissSelectors) {
    if (await button.first().isVisible({ timeout: 500 }).catch(() => false)) {
      await button.first().click();
      await page.waitForTimeout(500);
      return true;
    }
  }

  // Last resort: Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return true;
}
