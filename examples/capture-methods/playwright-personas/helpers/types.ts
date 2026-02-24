import type { Page, BrowserContext } from 'playwright';

// ─── Verdict & Checkpoint ───────────────────────────────────────────────────

export type Verdict = 'PASS' | 'FRICTION' | 'FAIL';

export interface CheckpointResult {
  step: number;
  label: string;
  verdict: Verdict;
  screenshotPath: string;
  notes: string;
  consoleErrors: string[];
  durationMs: number;
}

// ─── Persona JSON Schema ────────────────────────────────────────────────────

export interface PersonaJSON {
  id: string;
  name: string;
  email: string;
  description: string;
  phases: PersonaPhase[];
  summary: PersonaSummaryTemplate;
}

export interface PersonaPhase {
  name: string;
  viewport: 'desktop' | 'mobile';
  steps: JourneyStep[];
}

export interface JourneyStep {
  type: string;
  label: string;
  criticalPath?: boolean;
  params: Record<string, unknown>;
}

// ─── Handler Types ──────────────────────────────────────────────────────────

export interface HandlerResult {
  verdict: Verdict;
  notes: string;
  durationMs: number;
  /** Extra data the handler wants to stash in run state */
  stateUpdates?: Record<string, unknown>;
}

export type HandlerFn = (
  page: Page,
  step: JourneyStep,
  state: RunState,
) => Promise<HandlerResult>;

// ─── Run State ──────────────────────────────────────────────────────────────

export interface RunState {
  personaId: string;
  runId: string;
  artifactsDir: string;
  stepNum: number;
  consoleErrors: string[];
  /** Arbitrary state shared across steps (e.g. goalsCreated, valuesComplete) */
  data: Record<string, unknown>;
}

// ─── Persona Summary ────────────────────────────────────────────────────────

export interface PersonaIssue {
  id: string;
  step: number;
  severity: 'FAIL' | 'FRICTION';
  category: 'Function' | 'UX' | 'Copy' | 'Visual' | 'Performance' | 'Accessibility';
  description: string;
  expected: string;
  screenshotPath?: string;
  videoTimestamp?: string;
}

export interface PersonaSummary {
  runId: string;
  persona: string;
  personaId: string;
  timestamp: string;
  totalSteps: number;
  results: { pass: number; friction: number; fail: number };
  issues: PersonaIssue[];
  flowScores: Record<string, number>;
  retentionAssessment: string;
  topFrictionPoint: string;
  topDelight: string;
  durationMs: number;
  loginMs?: number;
}

export interface PersonaSummaryTemplate {
  retentionGood: string;
  retentionBad: string;
  retentionMixed: string;
  topDelight: string;
}

// ─── JSONL Event Types (stdout) ──────────────────────────────────────────────

export interface CheckpointEvent {
  event: 'checkpoint';
  personaId: string;
  step: number;
  label: string;
  verdict: Verdict;
  durationMs: number;
}

export interface CompleteEvent {
  event: 'complete';
  personaId: string;
  pass: number;
  friction: number;
  fail: number;
  durationMs: number;
  loginMs?: number;
}

export type RunEvent = CheckpointEvent | CompleteEvent;
