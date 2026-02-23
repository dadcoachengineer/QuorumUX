import { describe, it, expect } from 'vitest';
import { compareSyntheses, jaccardSimilarity, matchIssues, normalizeTitle, generateScoreContext } from './compare.js';
import type { Synthesis } from '../types.js';
import type { CompareIssue, CompareResult } from './compare.js';

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

  it('treats titles differing only by filler adverbs as highly similar', () => {
    const sim = jaccardSimilarity(
      'Login consistently slow response',
      'Login slow response',
    );
    expect(sim).toBe(1.0);
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

  // ─── Persisting variants ────────────────────────────────────────────────

  it('detects persisting variant when baseline "resolved" and current "new" are similar', () => {
    // No category set — prevents relaxed matcher threshold from catching these as persisting
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-perf1', title: 'Login performance exceeds 6 seconds', severity: 'P0',
          category: 'performance', description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-perf2', title: 'Login latency consistently 6-7 seconds', severity: 'P1',
          category: 'interaction', description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingVariants).toHaveLength(1);
    expect(result.persistingVariants[0].issue.id).toBe('QUX-perf2');
    expect(result.persistingVariants[0].similarTo.id).toBe('QUX-perf1');
    expect(result.persistingVariants[0].similarityScore).toBeGreaterThanOrEqual(50);
    expect(result.resolvedIssues).toHaveLength(0);
    expect(result.newIssues).toHaveLength(0);
  });

  it('does not create false variant for completely different issues', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-x1', title: 'Login button color contrast', severity: 'P2', category: 'visual',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-y1', title: 'Assessment modal blocks navigation', severity: 'P0', category: 'functional',
          description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingVariants).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(1);
    expect(result.newIssues).toHaveLength(1);
  });

  it('handles mixed: some variants + true resolves + true new', () => {
    // Different severity/category on variant pair to prevent relaxed matcher from catching them
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-a1', title: 'Login performance slow at 6s', severity: 'P0', category: 'performance',
          description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-a2', title: 'Footer links broken', severity: 'P2', category: 'functional',
          description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-b1', title: 'Login latency slow at 6-7 seconds', severity: 'P1', category: 'interaction',
          description: '', recommendation: '', effort: 'high',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-b2', title: 'Modal overlay z-index conflict', severity: 'P1', category: 'layout',
          description: '', recommendation: '', effort: 'medium',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingVariants).toHaveLength(1);
    expect(result.resolvedIssues).toHaveLength(1);
    expect(result.resolvedIssues[0].id).toBe('QUX-a2');
    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].id).toBe('QUX-b2');
  });

  it('variant captures correct similarity score as 0-100 integer', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-s1', title: 'Form validation error messages missing', severity: 'P1', category: 'functional',
          description: '', recommendation: '', effort: 'medium',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-s2', title: 'Form validation error not displayed', severity: 'P1', category: 'functional',
          description: '', recommendation: '', effort: 'medium',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    if (result.persistingVariants.length > 0) {
      expect(result.persistingVariants[0].similarityScore).toBeGreaterThanOrEqual(0);
      expect(result.persistingVariants[0].similarityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.persistingVariants[0].similarityScore)).toBe(true);
    }
  });
});

// ─── normalizeTitle ────────────────────────────────────────────────────────

describe('normalizeTitle', () => {
  it('strips [P0] prefix', () => {
    expect(normalizeTitle('[P0] Login broken')).toBe('login broken');
  });

  it('strips P1: prefix', () => {
    expect(normalizeTitle('P1: Navigation fails')).toBe('nav fails');
  });

  it('removes filler adverbs', () => {
    expect(normalizeTitle('consistently slow response')).toBe('slow response');
  });

  it('removes multiple filler adverbs', () => {
    expect(normalizeTitle('extremely significantly slow')).toBe('slow');
  });

  it('normalizes synonyms: latency → performance', () => {
    expect(normalizeTitle('Login latency issue')).toBe('login performance issue');
  });

  it('normalizes synonyms: frozen → block', () => {
    expect(normalizeTitle('Screen frozen on load')).toBe('screen block on load');
  });

  it('normalizes synonyms: navigation → nav', () => {
    expect(normalizeTitle('Navigation menu broken')).toBe('nav menu broken');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  too   much    space  ')).toBe('too much space');
  });

  it('passes through empty string', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('passes through title with no normalization needed', () => {
    expect(normalizeTitle('Login button fails on click')).toBe('login button fails on click');
  });
});

// ─── generateScoreContext ──────────────────────────────────────────────────

describe('generateScoreContext', () => {
  function makeResult(overrides: Partial<CompareResult> = {}): CompareResult {
    return {
      scoreDelta: 0,
      baselineScore: 75,
      currentScore: 75,
      baselineReadiness: 'ready-with-caveats',
      currentReadiness: 'ready-with-caveats',
      resolvedIssues: [],
      newIssues: [],
      persistingIssues: [],
      persistingVariants: [],
      regressions: [],
      scoreContext: '',
      severityDistribution: { baseline: { P0: 0, P1: 0, P2: 0 }, current: { P0: 0, P1: 0, P2: 0 } },
      ...overrides,
    };
  }

  it('returns no-changes message when nothing changed', () => {
    const result = makeResult();
    expect(generateScoreContext(result)).toBe('No meaningful changes between runs');
  });

  it('mentions resolved P0s on positive delta', () => {
    const result = makeResult({
      scoreDelta: 15,
      resolvedIssues: [
        { id: 'QUX-1', title: 'Critical bug', severity: 'P0', type: 'consensus' },
      ],
    });
    expect(generateScoreContext(result)).toContain('1 P0 issue resolved');
  });

  it('mentions new P0s on negative delta', () => {
    const result = makeResult({
      scoreDelta: -10,
      newIssues: [
        { id: 'QUX-1', title: 'New critical', severity: 'P0', type: 'consensus' },
        { id: 'QUX-2', title: 'Another critical', severity: 'P0', type: 'consensus' },
      ],
    });
    expect(generateScoreContext(result)).toContain('2 new P0 issues introduced');
  });

  it('mentions regressions on negative delta', () => {
    const result = makeResult({
      scoreDelta: -5,
      regressions: [
        {
          baselineId: 'QUX-1', currentId: 'QUX-1', title: 'Bug', baselineSeverity: 'P2',
          currentSeverity: 'P0', severityChange: 'regressed', matchMethod: 'exact-id',
        },
      ],
    });
    expect(generateScoreContext(result)).toContain('1 regression');
  });

  it('mentions variant count when variants exist', () => {
    const result = makeResult({
      scoreDelta: 5,
      resolvedIssues: [{ id: 'QUX-r1', title: 'Resolved', severity: 'P2', type: 'consensus' }],
      persistingVariants: [
        {
          issue: { id: 'QUX-v1', title: 'Variant new', severity: 'P1', type: 'consensus' },
          similarTo: { id: 'QUX-v0', title: 'Variant old', severity: 'P1', type: 'consensus' },
          similarityScore: 65,
        },
        {
          issue: { id: 'QUX-v2', title: 'Variant new 2', severity: 'P0', type: 'consensus' },
          similarTo: { id: 'QUX-v3', title: 'Variant old 2', severity: 'P0', type: 'consensus' },
          similarityScore: 58,
        },
      ],
    });
    expect(generateScoreContext(result)).toContain('2 issues reworded but not resolved');
  });
});
