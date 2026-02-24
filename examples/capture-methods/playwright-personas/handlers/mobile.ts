import type { Page } from 'playwright';
import type { HandlerFn } from '../helpers/types.js';
import { timer } from '../helpers/checkpoint.js';

export const mobileViewportCheck: HandlerFn = async (page, step, state) => {
  const t = timer();
  const checks = step.params.checks as string[] || ['overflow', 'touchTargets'];

  const results: string[] = [];
  let allPass = true;

  if (checks.includes('overflow')) {
    const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    if (hasOverflow) allPass = false;
    results.push(`overflow=${hasOverflow}`);
  }

  if (checks.includes('touchTargets')) {
    const smallTargets = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, input, [role="tab"]'));
      return elements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).length;
    });
    if (smallTargets > 5) allPass = false;
    results.push(`smallTargets(<44px)=${smallTargets}`);
  }

  if (checks.includes('buttonSizes')) {
    const smallButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 36;
      }).length;
    });
    if (smallButtons > 3) allPass = false;
    results.push(`smallButtons(<36px)=${smallButtons}`);
  }

  if (checks.includes('tabOverflow')) {
    const tabOverflow = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[data-tour^="tab-"]');
      let overflow = false;
      tabs.forEach(tab => {
        const rect = tab.getBoundingClientRect();
        if (rect.right > window.innerWidth) overflow = true;
      });
      return overflow;
    });
    if (tabOverflow) allPass = false;
    results.push(`tabOverflow=${tabOverflow}`);
  }

  return {
    verdict: allPass ? 'PASS' : 'FRICTION',
    notes: results.join(', '),
    durationMs: t(),
  };
};

export const switchToMobile: HandlerFn = async (_page, _step, state) => {
  // This is a phase marker — the runner handles context switching.
  // The handler just records that we're in mobile mode now.
  state.data.viewport = 'mobile';
  return { verdict: 'PASS', notes: 'Switched to mobile viewport (375x667)', durationMs: 0 };
};

export const tapCountAssert: HandlerFn = async (page, step, state) => {
  const t = timer();
  const maxTaps = (step.params.maxTaps as number) || 25;
  const tapCount = (state.data.tapCount as number) || 0;

  return {
    verdict: tapCount <= maxTaps ? 'PASS' : tapCount <= maxTaps * 1.4 ? 'FRICTION' : 'FAIL',
    notes: `Total taps: ${tapCount} (target: <${maxTaps})`,
    durationMs: t(),
  };
};
