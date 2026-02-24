import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { timer } from '../helpers/checkpoint.js';
import { handleCoachingOptIn, handleValuesReplaceConfirmation, dismissAnyOverlay } from '../helpers/overlays.js';

export const valueDiscoveryAI: HandlerFn = async (page, step, state) => {
  const t = timer();
  const messages = step.params.messages as string[];

  // Dismiss any stale overlay before starting
  await dismissAnyOverlay(page);

  // Handle coaching opt-in modal if it appears
  await handleCoachingOptIn(page);

  // Click AI Conversation button
  const aiConvoBtn = page.getByRole('button', { name: /AI Conversation/i });
  if (!await aiConvoBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  if (!await aiConvoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { verdict: 'FRICTION', notes: 'AI Conversation button not found', durationMs: t() };
  }

  await aiConvoBtn.click();
  await page.waitForTimeout(3000);

  // Handle "Replace existing values?" for returning accounts
  await handleValuesReplaceConfirmation(page);

  const chatInput = page.locator('input[placeholder="Share your thoughts..."]');
  let exchangeCount = 0;

  for (let i = 0; i < messages.length; i++) {
    await chatInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    // Wait for input to be enabled
    await page.waitForFunction(
      () => {
        const input = document.querySelector('input[placeholder="Share your thoughts..."]') as HTMLInputElement;
        return input && !input.disabled;
      },
      { timeout: 45000 },
    ).catch(() => {});

    // Check if save button appeared (circuit breaker)
    const saveBtn = page.getByRole('button', { name: /Save Discovered Values|Save These Values|Save My Values/i });
    if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      state.data.circuitBreakerTriggered = true;
      break;
    }

    const inputVisible = await chatInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (!inputVisible) break;

    await chatInput.fill(messages[i]);
    await page.waitForTimeout(300);

    const sendBtn = page.locator('button:has(svg.lucide-send), button:has(svg[class*="send"])').last();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await chatInput.press('Enter');
    }

    exchangeCount++;
    await page.waitForTimeout(2000);

    // Wait for AI to finish streaming
    await page.waitForFunction(
      () => {
        const input = document.querySelector('input[placeholder="Share your thoughts..."]') as HTMLInputElement;
        return input && !input.disabled;
      },
      { timeout: 60000 },
    ).catch(() => {});

    await page.waitForTimeout(1000);
  }

  state.data.exchangeCount = exchangeCount;

  return {
    verdict: exchangeCount > 0 ? 'PASS' : 'FAIL',
    notes: `Sent ${exchangeCount}/${messages.length} messages`,
    durationMs: t(),
  };
};

export const quickAssessment: HandlerFn = async (page, step, state) => {
  const t = timer();
  const rating = (step.params.rating as number) || 5;
  const ratings = step.params.ratings as number[] | undefined;

  // Dismiss any stale overlay before starting
  await dismissAnyOverlay(page);

  // Handle coaching opt-in modal if it appears
  await handleCoachingOptIn(page);

  const quickAssessBtn = page.getByRole('button', { name: /Quick Assessment/i });
  if (!await quickAssessBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  if (!await quickAssessBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { verdict: 'FRICTION', notes: 'Quick Assessment button not found', durationMs: t() };
  }

  await quickAssessBtn.click();
  await page.waitForTimeout(2000);

  // Handle "Replace existing values?" for returning accounts
  await handleValuesReplaceConfirmation(page);

  let ratingsCompleted = 0;
  for (let i = 0; i < 15; i++) {
    const r = ratings ? ratings[i % ratings.length] : rating;
    const ratingBtn = page.getByRole('button', { name: String(r), exact: true });
    if (await ratingBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ratingBtn.click();
      ratingsCompleted++;
      await page.waitForTimeout(400);
    }
  }

  await page.waitForTimeout(1000);

  // Save values
  const saveBtn = page.getByRole('button', { name: /Save These Values|Save My Values/i });
  if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    state.data.valuesComplete = true;
    return {
      verdict: 'PASS',
      notes: `Quick Assessment complete: ${ratingsCompleted}/15 ratings, values saved. Time: ${t()}ms`,
      durationMs: t(),
    };
  }

  return {
    verdict: 'FRICTION',
    notes: `Completed ${ratingsCompleted}/15 ratings but Save button not found`,
    durationMs: t(),
  };
};

export const saveValues: HandlerFn = async (page, step, state) => {
  const t = timer();

  await page.waitForTimeout(2000);
  const saveBtn = page.getByRole('button', { name: /Save Discovered Values|Save These Values|Save My Values/i });

  if (await saveBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(15000);

    state.data.valuesComplete = true;

    // Check for meaningful values
    const bodyText = await page.textContent('body') || '';
    const checkWords = (step.params.expectedValues as string[]) || [];
    const matches = checkWords.filter(w => bodyText.toLowerCase().includes(w.toLowerCase()));

    return {
      verdict: 'PASS',
      notes: `Values saved. Matched: ${matches.join(', ') || 'N/A'}`,
      durationMs: t(),
      stateUpdates: { valueSaveMatches: matches.length },
    };
  }

  return { verdict: 'FRICTION', notes: 'Save Values button not found', durationMs: t() };
};
