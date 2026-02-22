import { describe, it, expect } from 'vitest';
import { compareSyntheses } from './compare.js';
import type { Synthesis } from '../types.js';

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
          id: 'issue-1',
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

    expect(result.resolvedIssues).toEqual(['issue-1']);
    expect(result.newIssues).toEqual([]);
  });

  it('identifies new issues (in current, not in baseline)', () => {
    const baseline = makeSynthesis();
    const current = makeSynthesis({
      videoOnlyIssues: [
        {
          id: 'vid-1',
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

    expect(result.newIssues).toEqual(['vid-1']);
    expect(result.resolvedIssues).toEqual([]);
  });

  it('identifies persisting issues (in both)', () => {
    const sharedIssue = {
      id: 'shared-1',
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

    expect(result.persistingIssues).toEqual(['shared-1']);
    expect(result.resolvedIssues).toEqual([]);
    expect(result.newIssues).toEqual([]);
  });

  it('computes severity distribution changes', () => {
    const baseline = makeSynthesis({
      consensusIssues: [
        {
          id: 'c-1', title: 'A', severity: 'P0', category: 'UX', description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'c-2', title: 'B', severity: 'P1', category: 'UX', description: '', recommendation: '', effort: 'low',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const current = makeSynthesis({
      consensusIssues: [
        {
          id: 'c-3', title: 'C', severity: 'P2', category: 'UX', description: '', recommendation: '', effort: 'low',
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
    expect(result.severityDistribution.baseline).toEqual({ P0: 0, P1: 0, P2: 0 });
    expect(result.severityDistribution.current).toEqual({ P0: 0, P1: 0, P2: 0 });
  });

  it('handles model-unique issues in diff', () => {
    const baseline = makeSynthesis({
      modelUniqueIssues: [
        { id: 'mu-1', title: 'X', reportedBy: 'gpt4o', severity: 'P2', description: '', recommendation: '', confidence: 'low' },
      ],
    });
    const current = makeSynthesis({
      modelUniqueIssues: [
        { id: 'mu-1', title: 'X', reportedBy: 'gpt4o', severity: 'P2', description: '', recommendation: '', confidence: 'low' },
        { id: 'mu-2', title: 'Y', reportedBy: 'claude', severity: 'P1', description: '', recommendation: '', confidence: 'medium' },
      ],
    });

    const result = compareSyntheses(baseline, current, 'run-01', 'run-02');

    expect(result.persistingIssues).toContain('mu-1');
    expect(result.newIssues).toContain('mu-2');
    expect(result.resolvedIssues).toEqual([]);
  });
});
