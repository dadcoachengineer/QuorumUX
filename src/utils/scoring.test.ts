import { describe, it, expect } from 'vitest';
import { normalizeScore, calculateAdjustedScore } from './scoring.js';
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

describe('normalizeScore', () => {
  it('leaves 0-100 scores unchanged', () => {
    expect(normalizeScore(75)).toBe(75);
    expect(normalizeScore(100)).toBe(100);
    expect(normalizeScore(50)).toBe(50);
    expect(normalizeScore(11)).toBe(11);
  });

  it('multiplies 0-10 scores by 10', () => {
    expect(normalizeScore(7.5)).toBe(75);
    expect(normalizeScore(10)).toBe(100);
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(5.8)).toBeCloseTo(58);
  });
});

describe('calculateAdjustedScore', () => {
  it('returns undefined when no test-infra issues exist', () => {
    const synthesis = makeSynthesis({
      consensusIssues: [
        {
          id: 'QUX-abc', title: 'App bug', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'app',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    expect(calculateAdjustedScore(synthesis)).toBeUndefined();
  });

  it('returns undefined when there are zero issues', () => {
    expect(calculateAdjustedScore(makeSynthesis())).toBeUndefined();
  });

  it('returns a higher score when test-infra issues are discounted', () => {
    const synthesis = makeSynthesis({
      overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 50 },
      consensusIssues: [
        {
          id: 'QUX-a', title: 'Real bug', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'app',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-b', title: 'Test env issue', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'test-infra',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const adjusted = calculateAdjustedScore(synthesis)!;
    expect(adjusted).toBeGreaterThan(50);
    expect(adjusted).toBeLessThanOrEqual(100);
  });

  it('returns raw score when score is already 100', () => {
    const synthesis = makeSynthesis({
      overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 100 },
      consensusIssues: [
        {
          id: 'QUX-x', title: 'Infra issue', severity: 'P1', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'test-infra',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });
    expect(calculateAdjustedScore(synthesis)).toBe(100);
  });

  it('normalizes legacy 0-10 scores before adjusting', () => {
    const synthesis = makeSynthesis({
      overallAssessment: { ...makeSynthesis().overallAssessment, uxScore: 5 },
      consensusIssues: [
        {
          id: 'QUX-a', title: 'Real', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'app',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
        {
          id: 'QUX-b', title: 'Infra', severity: 'P0', category: 'Function',
          description: '', recommendation: '', effort: 'low', source: 'test-infra',
          evidence: { screenshotModels: [], videoConfirmed: false, testRunConfirmed: false, affectedPersonas: [] },
          temporalInsight: null,
        },
      ],
    });

    const adjusted = calculateAdjustedScore(synthesis)!;
    // Raw score normalized to 50, then adjusted upward
    expect(adjusted).toBeGreaterThan(50);
  });
});
