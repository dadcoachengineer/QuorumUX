import { describe, it, expect } from 'vitest';
import { compareSyntheses, jaccardSimilarity, matchIssues } from './compare.js';
import type { Synthesis } from '../types.js';
import type { CompareIssue } from './compare.js';

function makeSynthesis(overrides: Partial<Synthesis> = {}): Synthesis {
  return {
    synthesisDate: '2026-02-22',
    projectName: 'Test',
    sourceCounts: { screenshotAnalyses: 3, videoAnalyses: 1, testSummaries: 2 },
    consensusIssues: [],
    videoOnlyIssues: [],
    modelUniqueIssues: [],
    disagreements: [],
    overallAssessment: {
      uxScore: 75,
      launchReadiness: 'ready-with-caveats',
      topStrengths: ['Good onboarding'],
      criticalPath: ['Fix checkout'],
      temporalInsightsSummary: '',
    },
    ...overrides,
  };
}

// ─── jaccardSimilarity ──────────────────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('Login button broken', 'Login button broken')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('Login button broken', 'Alpha beta gamma')).toBe(0.0);
  });

  it('returns partial overlap score', () => {
    const sim = jaccardSimilarity('Login button broken on mobile', 'Login button not working');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('is case insensitive', () => {
    expect(jaccardSimilarity('LOGIN BUTTON', 'login button')).toBe(1.0);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(jaccardSimilarity('hello', '')).toBe(0.0);
  });
});

// ─── matchIssues ────────────────────────────────────────────────────────────

describe('matchIssues', () => {
  it('matches by exact QUX- ID', () => {
    const baseline: CompareIssue[] = [
      { id: 'QUX-aabbccdd', title: 'Login broken', severity: 'P0', type: 'consensus' },
    ];
    const current: CompareIssue[] = [
      { id: 'QUX-aabbccdd', title: 'Login broken', severity: 'P0', type: 'consensus' },
    ];
    const { matched, unmatchedBaseline, unmatchedCurrent } = matchIssues(baseline, current);
    expect(matched).toHaveLength(1);
    expect(matched[0].method).toBe('exact-id');
    expect(unmatchedBaseline).toHaveLength(0);
    expect(unmatchedCurrent).toHaveLength(0);
  });

  it('falls back to fuzzy matching for legacy ordinal IDs', () => {
    const baseline: CompareIssue[] = [
      { id: 'ISSUE-001', title: 'Login button broken on mobile', severity: 'P0', type: 'consensus', category: 'functional' },
    ];
    const current: CompareIssue[] = [
      { id: 'ISSUE-003', title: 'Login button broken on mobile devices', severity: 'P0', type: 'consensus', category: 'functional' },
    ];
    const { matched, unmatchedBaseline, unmatchedCurrent } = matchIssues(baseline, current);
    expect(matched).toHaveLength(1);
    expect(matched[0].method).toBe('fuzzy');
    expect(matched[0].confidence).toBeGreaterThan(50);
    expect(unmatchedBaseline).toHaveLength(0);
    expect(unmatchedCurrent).toHaveLength(0);
  });

  it('does not fuzzy-match completely different titles', () => {
    const baseline: CompareIssue[] = [
      { id: 'ISSUE-001', title: 'Login button broken', severity: 'P0', type: 'consensus' },
    ];
    const current: CompareIssue[] = [
      { id: 'ISSUE-002', title: 'Signup form validation', severity: 'P1', type: 'consensus' },
    ];
    const { matched, unmatchedBaseline, unmatchedCurrent } = matchIssues(baseline, current);
    expect(matched).toHaveLength(0);
    expect(unmatchedBaseline).toHaveLength(1);
    expect(unmatchedCurrent).toHaveLength(1);
  });

  it('uses relaxed threshold when category and severity match', () => {
    const baseline: CompareIssue[] = [
      { id: 'ISSUE-001', title: 'Mobile goal creation flow', severity: 'P0', type: 'consensus', category: 'functional' },
    ];
    const current: CompareIssue[] = [
      { id: 'ISSUE-005', title: 'Goal creation blocked on mobile', severity: 'P0', type: 'consensus', category: 'functional' },
    ];
    const { matched } = matchIssues(baseline, current);
    // Same category + same severity allows > 0.4 threshold
    expect(matched).toHaveLength(1);
    expect(matched[0].method).toBe('fuzzy');
  });
});

// ─── compareSyntheses ───────────────────────────────────────────────────────

describe('compareSyntheses', () => {
  it('computes score delta', () => {
    const baseline = makeSynthesis({ overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 60 } });
    const current = makeSynthesis({ overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 82 } });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.scoreDelta).toBe(22);
    expect(result.baselineScore).toBe(60);
    expect(result.currentScore).toBe(82);
  });

  it('identifies resolved issues (in baseline, not in current)', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-aaaaaaaa',
          title: 'Broken button',
          severity: 'P0',
          category: 'Function',
          description: 'Button does not work',
          evidence: { screenshotModels: ['claude'], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
          recommendation: 'Fix it',
          effort: 'low',
        },
      ],
    });
    const current = makeSynthesis();

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.resolvedIssues).toHaveLength(1);
    expect(result.resolvedIssues[0].id).toBe('QUX-aaaaaaaa');
    expect(result.resolvedIssues[0].title).toBe('Broken button');
    expect(result.newIssues).toEqual([]);
  });

  it('identifies new issues (in current, not in baseline)', () => {
    const baseline = makeSynthesis();
    const current = makeSynthesis({
      videoOnlyIssues: [
        {
          id: 'QUX-bbbbbbbb',
          title: 'Slow animation',
          severity: 'P1',
          description: 'Too slow',
          timestamp: '0:05',
          persona: 'happy-path',
          recommendation: 'Speed up',
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].id).toBe('QUX-bbbbbbbb');
    expect(result.newIssues[0].title).toBe('Slow animation');
    expect(result.resolvedIssues).toEqual([]);
  });

  it('identifies persisting issues (matched in both)', () => {
    const sharedIssue = {
      id: 'QUX-cccccccc',
      title: 'Persisting bug',
      severity: 'P1' as const,
      category: 'UX',
      description: 'Still broken',
      evidence: { screenshotModels: ['gemini'], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
      temporalInsight: null,
      recommendation: 'Keep trying',
      effort: 'medium' as const,
    };

    const baseline = makeSynthesis({ consensusIssues: [sharedIssue] });
    const current = makeSynthesis({ consensusIssues: [sharedIssue] });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingIssues).toHaveLength(1);
    expect(result.persistingIssues[0].title).toBe('Persisting bug');
    expect(result.persistingIssues[0].matchMethod).toBe('exact-id');
    expect(result.resolvedIssues).toEqual([]);
    expect(result.newIssues).toEqual([]);
  });

  it('computes severity distribution changes', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-c1', title: 'A', severity: 'P0', category: 'UX', description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-c2', title: 'B', severity: 'P1', category: 'UX', description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-c3', title: 'C', severity: 'P2', category: 'UX', description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.severityDistribution.baseline).toEqual({ P0: 1, P1: 1, P2: 0 });
    expect(result.severityDistribution.current).toEqual({ P0: 0, P1: 0, P2: 1 });
  });

  it('handles both runs with zero issues', () => {
    const baseline = makeSynthesis();
    const current = makeSynthesis();

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.scoreDelta).toBe(0);
    expect(result.resolvedIssues).toEqual([]);
    expect(result.newIssues).toEqual([]);
    expect(result.persistingIssues).toEqual([]);
    expect(result.regressions).toEqual([]);
    expect(result.severityDistribution.baseline).toEqual({ P0: 0, P1: 0, P2: 0 });
    expect(result.severityDistribution.current).toEqual({ P0: 0, P1: 0, P2: 0 });
  });

  it('handles model-unique issues in diff', () => {
    const baseline = makeSynthesis({
      modelUniqueIssues: [
        { id: 'QUX-mu1', title: 'X', reportedBy: 'gpt4o', severity: 'P2', description: '', recommendation: '', confidence: 'low' },
      ],
    });
    const current = makeSynthesis({
      modelUniqueIssues: [
        { id: 'QUX-mu1', title: 'X', reportedBy: 'gpt4o', severity: 'P2', description: '', recommendation: '', confidence: 'low' },
        { id: 'QUX-mu2', title: 'Y', reportedBy: 'claude', severity: 'P1', description: '', recommendation: '', confidence: 'medium' },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingIssues).toHaveLength(1);
    expect(result.persistingIssues[0].currentId).toBe('QUX-mu1');
    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].id).toBe('QUX-mu2');
    expect(result.resolvedIssues).toEqual([]);
  });

  // ─── New tests ──────────────────────────────────────────────────────────

  it('detects regressions (severity worsened between runs)', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-reg1', title: 'Values assessment', severity: 'P2', category: 'UX',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-reg1', title: 'Values assessment', severity: 'P0', category: 'UX',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].baselineSeverity).toBe('P2');
    expect(result.regressions[0].currentSeverity).toBe('P0');
    expect(result.regressions[0].severityChange).toBe('regressed');
  });

  it('normalizes legacy 0-10 scores to 0-100', () => {
    const baseline = makeSynthesis({ overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 5.8 } });
    const current = makeSynthesis({ overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 72 } });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.baselineScore).toBe(58);
    expect(result.currentScore).toBe(72);
    expect(result.scoreDelta).toBe(14);
  });

  it('handles completely different issue sets (all resolved + all new)', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-old1', title: 'Old bug A', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-old2', title: 'Old bug B', severity: 'P1', category: 'Visual',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-new1', title: 'New bug X', severity: 'P2', category: 'Copy',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.resolvedIssues).toHaveLength(2);
    expect(result.newIssues).toHaveLength(1);
    expect(result.persistingIssues).toHaveLength(0);
  });

  it('fuzzy-matches legacy ordinal IDs with similar titles across runs', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'ISSUE-001', title: 'Login latency extremely slow at 6-9s', severity: 'P0', category: 'performance',
          description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'ISSUE-003', title: 'Login latency extremely slow at 6-9 seconds', severity: 'P0', category: 'performance',
          description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingIssues).toHaveLength(1);
    expect(result.persistingIssues[0].matchMethod).toBe('fuzzy');
    expect(result.persistingIssues[0].matchConfidence).toBeGreaterThan(50);
    expect(result.resolvedIssues).toHaveLength(0);
    expect(result.newIssues).toHaveLength(0);
  });

  it('computes adjustedDelta when both runs have test-infra issues', () => {
    const baseline = makeSynthesis({
      overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 50 },
      consensusIssues: [
        {
          id: 'QUX-a1', title: 'Real bug', severity: 'P0', category: 'Function', source: 'app',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-t1', title: 'Test env', severity: 'P0', category: 'Function', source: 'test-infra',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 70 },
      consensusIssues: [
        {
          id: 'QUX-a1', title: 'Real bug', severity: 'P1', category: 'Function', source: 'app',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-t1', title: 'Test env', severity: 'P0', category: 'Function', source: 'test-infra',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.adjustedDelta).toBeDefined();
    expect(typeof result.adjustedDelta).toBe('number');
  });
});
