import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { APP_URL, TEST_PASSWORD } from '../helpers/config.js';
import { timer } from '../helpers/checkpoint.js';

export const keyboardNavigation: HandlerFn = async (page, step, state) => {
  const t = timer();
  const target = step.params.target as string; // 'login', 'quick-assessment', 'goals', 'general'
  const maxTabs = (step.params.maxTabs as number) || 30;

  if (target === 'login') {
    // Keyboard-only login
    const email = (step.params.email as string) || (state.data.email as string);
    const password = (step.params.password as string) || TEST_PASSWORD;

    await page.goto(`${APP_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Switch to sign-in tab if needed
    const loginTab = page.getByRole('tab', { name: /sign in|log in/i });
    if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginTab.click();
      await page.waitForTimeout(500);
    }

    // Tab to email field
    let tabsToEmail = 0;
    let emailFocusVisible = false;
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab');
      tabsToEmail++;
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === 'INPUT' && (el as HTMLInputElement).type === 'email';
      });
      if (focused) {
        emailFocusVisible = await checkFocusIndicator(page);
        break;
      }
    }

    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(password);

    // Tab to sign in button
    let tabsToSignIn = 0;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      tabsToSignIn++;
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === 'BUTTON' && (el as HTMLElement).textContent?.toLowerCase().includes('sign in');
      });
      if (focused) break;
    }

    const signInFocusVisible = await checkFocusIndicator(page);
    await page.keyboard.press('Enter');

    try {
      await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      return {
        verdict: 'PASS',
        notes: `Keyboard login: tabs-to-email=${tabsToEmail} focus=${emailFocusVisible}, tabs-to-signin=${tabsToSignIn} focus=${signInFocusVisible}`,
        durationMs: t(),
      };
    } catch {
      return { verdict: 'FAIL', notes: 'Keyboard-only login failed', durationMs: t() };
    }
  }

  if (target === 'aria-audit') {
    const audit = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input, select, textarea, [role="tab"], [role="checkbox"], [role="switch"]');
      const missingLabels: string[] = [];
      elements.forEach(el => {
        const hasLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
          el.getAttribute('title') || (el as HTMLElement).textContent?.trim();
        const tag = el.tagName.toLowerCase();
        const text = (el as HTMLElement).textContent?.trim().slice(0, 20) || '';
        if (!hasLabel || (tag === 'button' && !text && !el.getAttribute('aria-label') && !el.getAttribute('title'))) {
          const hasSvg = el.querySelector('svg') !== null;
          if (hasSvg && !el.getAttribute('aria-label') && !el.getAttribute('title')) {
            missingLabels.push(`<${tag}> icon button`);
          }
        }
      });
      return { total: elements.length, missing: missingLabels.length, examples: missingLabels.slice(0, 5) };
    });

    return {
      verdict: audit.missing <= 3 ? 'PASS' : 'FRICTION',
      notes: `ARIA: ${audit.total} elements, ${audit.missing} missing labels. Examples: ${audit.examples.join(', ')}`,
      durationMs: t(),
    };
  }

  if (target === 'contrast-audit') {
    // Pass as string to avoid esbuild __name injection that breaks page.evaluate
    const issues = await page.evaluate(`(() => {
      var elements = document.querySelectorAll('p, span, label, h1, h2, h3, h4, button');
      var lowContrast = [];
      function getLuminance(color) {
        var match = color.match(/\\d+/g);
        if (!match || match.length < 3) return 0;
        var vals = match.map(Number).map(function(c) {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
      }
      elements.forEach(function(el) {
        var style = window.getComputedStyle(el);
        var textLum = getLuminance(style.color);
        var bgLum = getLuminance(style.backgroundColor || 'rgb(255,255,255)');
        var lighter = Math.max(textLum, bgLum);
        var darker = Math.min(textLum, bgLum);
        var ratio = (lighter + 0.05) / (darker + 0.05);
        if (ratio < 3 && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          var text = (el.textContent || '').trim().slice(0, 20);
          if (text) lowContrast.push('"' + text + '" ratio=' + ratio.toFixed(1));
        }
      });
      return lowContrast.slice(0, 8);
    })()`) as string[];

    return {
      verdict: issues.length <= 2 ? 'PASS' : 'FRICTION',
      notes: `Low contrast: ${issues.length}. Examples: ${issues.slice(0, 3).join(', ')}`,
      durationMs: t(),
    };
  }

  if (target === 'hit-targets') {
    const tooSmall = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input, [role="tab"], [role="checkbox"], [role="switch"]');
      const small: string[] = [];
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
          const text = (el as HTMLElement).textContent?.trim().slice(0, 20) || el.tagName;
          small.push(`"${text}" (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        }
      });
      return small.slice(0, 10);
    });

    return {
      verdict: tooSmall.length <= 2 ? 'PASS' : 'FRICTION',
      notes: `Elements under 24px: ${tooSmall.length}. Examples: ${tooSmall.slice(0, 3).join(', ')}`,
      durationMs: t(),
    };
  }

  if (target === 'focus-trap') {
    // Check if focus is trapped in a dialog
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(2000);

    const panel = page.locator('[role="dialog"], [data-vaul-drawer]').first();
    const panelOpen = await panel.isVisible({ timeout: 3000 }).catch(() => false);

    if (panelOpen) {
      const focusInPanel = await page.evaluate(() => {
        const el = document.activeElement;
        const panel = document.querySelector('[role="dialog"], [data-vaul-drawer]');
        return panel?.contains(el) ?? false;
      });

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      return {
        verdict: focusInPanel ? 'PASS' : 'FRICTION',
        notes: `Focus trapped in panel: ${focusInPanel}`,
        durationMs: t(),
      };
    }

    return { verdict: 'FRICTION', notes: 'Panel did not open for focus trap test', durationMs: t() };
  }

  // General tab navigation — just count tabs to reach interactive elements
  let tabCount = 0;
  const focusedElements: string[] = [];
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    tabCount++;
    const tag = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}:${(el as HTMLElement).textContent?.trim().slice(0, 20)}` : 'none';
    });
    if (!focusedElements.includes(tag)) focusedElements.push(tag);
  }

  return {
    verdict: focusedElements.length > 3 ? 'PASS' : 'FRICTION',
    notes: `Tabbed ${tabCount} times, reached ${focusedElements.length} unique elements`,
    durationMs: t(),
  };
};

async function checkFocusIndicator(page: import('playwright').Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
    const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
    return hasOutline || hasBoxShadow;
  });
}
