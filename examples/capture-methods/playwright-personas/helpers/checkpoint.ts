import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type { Verdict, CheckpointEvent, RunState } from './types.js';

// ─── Screenshot + JSONL checkpoint ──────────────────────────────────────────

export async function checkpoint(
  page: Page,
  state: RunState,
  label: string,
  verdict: Verdict,
  notes: string = '',
  durationMs: number = 0,
): Promise<string> {
  const dir = path.join(state.artifactsDir, 'screenshots', state.personaId);
  fs.mkdirSync(dir, { recursive: true });

  const safeName = label.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  const filename = `${state.personaId}-step${String(state.stepNum).padStart(2, '0')}-${verdict}-${safeName}.png`;
  const filepath = path.join(dir, filename);

  await page.screenshot({ path: filepath, fullPage: true }).catch(() => {});

  // Emit JSONL event to stdout
  const event: CheckpointEvent = {
    event: 'checkpoint',
    personaId: state.personaId,
    step: state.stepNum,
    label,
    verdict,
    durationMs,
  };
  console.log(JSON.stringify(event));

  return filepath;
}

// ─── Console Error Capture ──────────────────────────────────────────────────

export function setupConsoleCapture(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('AbortError') && !text.includes('signal is aborted')) {
        errors.push(text);
      }
    }
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

// ─── Timer ──────────────────────────────────────────────────────────────────

export function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
