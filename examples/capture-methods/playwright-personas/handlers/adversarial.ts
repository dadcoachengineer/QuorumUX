import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { APP_URL } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

export const adversarialInput: HandlerFn = async (page, step, state) => {
  const t = timer();
  const inputType = step.params.inputType as string; // 'xss', 'sql-injection', 'oversized', 'script-tag', 'emoji', 'unicode'
  const target = step.params.target as string || 'goal'; // where to inject

  const payloads: Record<string, string> = {
    xss: '<img src=x onerror=alert("xss")>',
    'sql-injection': "'; DROP TABLE profiles; --",
    oversized: 'A'.repeat(5000),
    'script-tag': '<script>document.cookie</script>',
    emoji: '\u{1F525}\u{1F4AF}\u{1F680}\u{2728}\u{1F389}\u{1F60E}\u{1F4AA}\u{1F3AF}',
    unicode: '\u202E\u0041\u0042\u0043',
  };

  const payload = payloads[inputType] || step.params.payload as string || 'test-payload';

  if (target === 'goal') {
    // Create goal with adversarial title
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
      return { verdict: 'FRICTION', notes: 'Could not open goal dialog for adversarial test', durationMs: t() };
    }

    const dialog = page.locator('[role="dialog"]');
    const titleInput = dialog.locator('input').first();
    await titleInput.waitFor({ state: 'visible', timeout: 3000 });
    await titleInput.click();
    await titleInput.fill(payload);
    await page.waitForTimeout(300);

    // Select type
    const typeBtn = dialog.locator('button:has-text("Education")').first();
    if (await typeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeBtn.scrollIntoViewIfNeeded();
      await typeBtn.click();
      await page.waitForTimeout(500);
    }

    const submitBtn = dialog.locator('button').filter({ hasText: 'Create Goal' }).last();
    await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    if (await submitBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }

  // Verify security
  const body = await page.textContent('body') || '';
  const appStillWorks = !page.url().includes('error');

  if (inputType === 'xss' || inputType === 'script-tag') {
    const xssRendered = await page.evaluate(() => {
      return document.querySelector('img[src="x"]') !== null || (window as any).__xss_triggered === true;
    });

    return {
      verdict: !xssRendered ? 'PASS' : 'FAIL',
      notes: `${inputType}: rendered=${xssRendered}, app stable=${appStillWorks}`,
      durationMs: t(),
    };
  }

  if (inputType === 'sql-injection') {
    const noDbError = !body.includes('relation') && !body.includes('syntax error');
    return {
      verdict: (appStillWorks && noDbError) ? 'PASS' : 'FAIL',
      notes: `SQL injection: app works=${appStillWorks}, db error=${!noDbError}`,
      durationMs: t(),
    };
  }

  if (inputType === 'oversized') {
    return {
      verdict: appStillWorks ? 'PASS' : 'FAIL',
      notes: `Oversized input (${payload.length} chars): app stable=${appStillWorks}`,
      durationMs: t(),
    };
  }

  return {
    verdict: appStillWorks ? 'PASS' : 'FAIL',
    notes: `${inputType}: app stable=${appStillWorks}`,
    durationMs: t(),
  };
};

export const doubleClickGuard: HandlerFn = async (page, step, state) => {
  const t = timer();
  const title = (step.params.title as string) || 'Double-click test goal';

  // Open goal dialog and fill
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
    return { verdict: 'FRICTION', notes: 'Could not open dialog for double-click test', durationMs: t() };
  }

  const dialog = page.locator('[role="dialog"]');
  const titleInput = dialog.locator('input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 3000 });
  await titleInput.click();
  await titleInput.fill(title);
  await page.waitForTimeout(300);

  const typeBtn = dialog.locator('button:has-text("Education")').first();
  if (await typeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await typeBtn.scrollIntoViewIfNeeded();
    await typeBtn.click();
    await page.waitForTimeout(500);
  }

  const submitBtn = dialog.locator('button').filter({ hasText: 'Create Goal' }).last();
  await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  if (await submitBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
    // Rapid double-click
    await submitBtn.click();
    await submitBtn.click();
    await page.waitForTimeout(3000);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Check duplicates
  const goalsText = await page.textContent('body') || '';
  const dupes = (goalsText.match(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

  return {
    verdict: dupes <= 1 ? 'PASS' : 'FRICTION',
    notes: `Double-click created ${dupes} copies (expected <=1)`,
    durationMs: t(),
  };
};

export const protectedRouteCheck: HandlerFn = async (page, step, state) => {
  const t = timer();
  const routes = (step.params.routes as string[]) || ['/home', '/dashboard', '/settings', '/network', '/admin'];

  // Open a new page in the same context (shares auth state)
  // We need to test without auth — use a direct navigation check
  const context = page.context();
  const page2 = await context.newPage();
  let redirectedCount = 0;

  for (const route of routes) {
    await page2.goto(`${APP_URL}${route}`);
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(1500);

    const url = page2.url();
    const redirected = url.includes('/auth') || url.includes('/welcome') || !url.includes(route);
    if (redirected) redirectedCount++;
  }

  await page2.close();

  return {
    verdict: redirectedCount === routes.length ? 'PASS' : 'FAIL',
    notes: `Protected routes redirected: ${redirectedCount}/${routes.length}`,
    durationMs: t(),
  };
};
