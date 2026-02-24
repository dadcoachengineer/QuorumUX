/**
 * Lifecycle Test Runner
 *
 * Reads a persona JSON, executes journey steps via action handlers,
 * captures screenshots/video, and writes a summary JSON.
 *
 * Usage:
 *   npx tsx runner.ts --persona P01-maria --run-id run-2026-02-21T13-14 --artifacts-dir /path/to/artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createDesktopContext, createMobileContext, finishContext } from './helpers/browser.js';
import { checkpoint, setupConsoleCapture, timer } from './helpers/checkpoint.js';
import { savePersonaSummary } from './helpers/summary.js';
import { personaEmail } from './helpers/config.js';
import { getHandler } from './handlers/index.js';
import type {
  PersonaJSON, PersonaPhase, JourneyStep,
  RunState, PersonaIssue, PersonaSummary,
  Verdict, CompleteEvent,
} from './helpers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Args ───────────────────────────────────────────────────────────────────

function parseArgs(): { personaId: string; runId: string; artifactsDir: string } {
  const args = process.argv.slice(2);
  let personaId = '';
  let runId = '';
  let artifactsDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--persona' && args[i + 1]) personaId = args[++i];
    else if (args[i] === '--run-id' && args[i + 1]) runId = args[++i];
    else if (args[i] === '--artifacts-dir' && args[i + 1]) artifactsDir = args[++i];
  }

  if (!personaId) {
    console.error('Usage: npx tsx runner.ts --persona P01-maria --run-id <id> --artifacts-dir <path>');
    process.exit(1);
  }

  if (!runId) runId = `run-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}`;
  if (!artifactsDir) artifactsDir = path.resolve(process.env.HOME || '.', 'projects', 'momentumeq', 'test-artifacts', runId);

  return { personaId, runId, artifactsDir };
}

// ─── Load Persona ───────────────────────────────────────────────────────────

function loadPersona(personaId: string): PersonaJSON {
  const filepath = path.join(__dirname, 'personas', `${personaId}.json`);
  if (!fs.existsSync(filepath)) {
    console.error(`Persona file not found: ${filepath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { personaId, runId, artifactsDir } = parseArgs();

  // Ensure artifact directories
  for (const sub of ['videos', 'screenshots', 'summaries']) {
    fs.mkdirSync(path.join(artifactsDir, sub), { recursive: true });
  }

  const persona = loadPersona(personaId);
  const runStart = Date.now();

  // Track results
  const results = { pass: 0, friction: 0, fail: 0 };
  const issues: PersonaIssue[] = [];
  const flowScores: Record<string, number> = {};
  let loginMs: number | undefined;

  function record(verdict: Verdict) {
    results[verdict.toLowerCase() as 'pass' | 'friction' | 'fail']++;
  }

  // ── Execute each phase ──────────────────────────────────────────────────

  for (const phase of persona.phases) {
    const isDesktop = phase.viewport === 'desktop';
    const contextFactory = isDesktop ? createDesktopContext : createMobileContext;
    const { context, page } = await contextFactory(artifactsDir, persona.id);
    const consoleErrors = setupConsoleCapture(page);

    const state: RunState = {
      personaId: persona.id,
      runId,
      artifactsDir,
      stepNum: 0,
      consoleErrors,
      data: {
        email: persona.email || personaEmail(persona.id),
        viewport: phase.viewport,
        goalsCreated: 0,
        habitsCreated: 0,
        valuesComplete: false,
      },
    };

    try {
      for (let i = 0; i < phase.steps.length; i++) {
        const step = phase.steps[i];
        state.stepNum = (isDesktop ? 0 : 100) + i + 1;

        const handler = getHandler(step.type);
        if (!handler) {
          console.error(JSON.stringify({
            event: 'checkpoint',
            personaId: persona.id,
            step: state.stepNum,
            label: step.label,
            verdict: 'FAIL',
            durationMs: 0,
          }));
          record('FAIL');
          issues.push({
            id: `${persona.id}-${String(state.stepNum).padStart(2, '0')}`,
            step: state.stepNum,
            severity: 'FAIL',
            category: 'Function',
            description: `Unknown handler type: ${step.type}`,
            expected: 'Handler should exist in registry',
          });
          continue;
        }

        const t = timer();
        try {
          const result = await handler(page, step, state);
          const duration = result.durationMs || t();

          // Apply state updates
          if (result.stateUpdates) {
            Object.assign(state.data, result.stateUpdates);
            // Capture first login timing for summary
            if (result.stateUpdates.loginMs != null && loginMs == null) {
              loginMs = result.stateUpdates.loginMs as number;
            }
          }

          // Capture checkpoint
          await checkpoint(page, state, step.label, result.verdict, result.notes, duration);
          record(result.verdict);

          // Track flow scores from params
          if (step.params.flowScore) {
            const scoreName = step.params.flowScore as string;
            const scoreMap: Record<Verdict, number> = { PASS: 5, FRICTION: 3, FAIL: 1 };
            flowScores[scoreName] = (step.params.scoreOverride as number) || scoreMap[result.verdict];
          }

          // Track issues
          if (result.verdict === 'FAIL' || result.verdict === 'FRICTION') {
            issues.push({
              id: `${persona.id}-${String(state.stepNum).padStart(2, '0')}`,
              step: state.stepNum,
              severity: result.verdict as 'FAIL' | 'FRICTION',
              category: (step.params.issueCategory as PersonaIssue['category']) || 'Function',
              description: result.notes,
              expected: (step.params.expected as string) || `${step.label} should pass`,
            });
          }

          // Critical path — abort on FAIL
          if (step.criticalPath && result.verdict === 'FAIL') {
            console.error(JSON.stringify({
              event: 'checkpoint',
              personaId: persona.id,
              step: state.stepNum,
              label: `${step.label}-critical-abort`,
              verdict: 'FAIL',
              durationMs: 0,
            }));
            break;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await checkpoint(page, state, `${step.label}-error`, 'FAIL', errMsg, t());
          record('FAIL');
          issues.push({
            id: `${persona.id}-${String(state.stepNum).padStart(2, '0')}`,
            step: state.stepNum,
            severity: 'FAIL',
            category: 'Function',
            description: `Handler error: ${errMsg}`,
            expected: 'No errors expected',
          });

          if (step.criticalPath) break;
        }
      }

      // Log console errors for the phase
      if (consoleErrors.length > 0) {
        flowScores[`${phase.name} Console Errors`] = consoleErrors.length <= 3 ? 4 : 2;
      }
    } catch (err) {
      console.error(`Fatal error in phase "${phase.name}":`, err);
    }

    await finishContext(context, page);
  }

  // ── Build & save summary ────────────────────────────────────────────────

  const totalDuration = Date.now() - runStart;

  const retentionAssessment = results.fail === 0 && results.friction <= 3
    ? persona.summary.retentionGood
    : results.fail > 0
      ? persona.summary.retentionBad
      : persona.summary.retentionMixed;

  const summary: PersonaSummary = {
    runId,
    persona: persona.name,
    personaId: persona.id,
    timestamp: new Date().toISOString(),
    totalSteps: results.pass + results.friction + results.fail,
    results,
    issues,
    flowScores,
    retentionAssessment,
    topFrictionPoint: issues.find(i => i.severity === 'FAIL')?.description
      || issues.find(i => i.severity === 'FRICTION')?.description
      || 'None identified',
    topDelight: persona.summary.topDelight,
    durationMs: totalDuration,
    ...(loginMs != null && { loginMs }),
  };

  savePersonaSummary(summary, artifactsDir);

  // Emit completion event
  const completeEvent: CompleteEvent = {
    event: 'complete',
    personaId: persona.id,
    pass: results.pass,
    friction: results.friction,
    fail: results.fail,
    durationMs: totalDuration,
    ...(loginMs != null && { loginMs }),
  };
  console.log(JSON.stringify(completeEvent));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
