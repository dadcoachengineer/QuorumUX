/**
 * QuorumUX — Scoring Utilities
 *
 * Shared scoring functions used by report generation and run comparison.
 */

import type { Synthesis } from '../types.js';

/** Severity weights for score adjustment calculation */
const SEVERITY_WEIGHT: Record<string, number> = { P0: 10, P1: 5, P2: 2 };

/** Discount factor applied to test-infra issues in adjusted score */
const TEST_INFRA_DISCOUNT = 0.25;

/**
 * Calculate an adjusted UX score that discounts test-infra issues.
 *
 * Returns undefined if no test-infra issues exist (adjusted = raw).
 * Otherwise: reduces the severity weight of test-infra issues to 0.25x
 * and proportionally adjusts the points lost from the raw score.
 */
export function calculateAdjustedScore(synthesis: Synthesis): number | undefined {
  const allIssues = [
    ...synthesis.consensusIssues,
    ...synthesis.videoOnlyIssues,
    ...synthesis.modelUniqueIssues,
  ];

  const testInfraIssues = allIssues.filter((i) => i.source === 'test-infra');
  if (testInfraIssues.length === 0) return undefined;

  const rawScore = normalizeScore(synthesis.overallAssessment.uxScore);
  const pointsLost = 100 - rawScore;
  if (pointsLost <= 0) return rawScore;

  // Calculate total weight and test-infra weight
  let totalWeight = 0;
  let testInfraWeight = 0;

  for (const issue of allIssues) {
    const w = SEVERITY_WEIGHT[issue.severity] || 0;
    totalWeight += w;
    if (issue.source === 'test-infra') {
      testInfraWeight += w;
    }
  }

  if (totalWeight === 0) return rawScore;

  // Adjusted total = app weight at 1x + test-infra weight at discount
  const adjustedTotal = (totalWeight - testInfraWeight) + testInfraWeight * TEST_INFRA_DISCOUNT;
  const adjustedPointsLost = pointsLost * (adjustedTotal / totalWeight);

  return Math.round(100 - adjustedPointsLost);
}

/**
 * Normalize a score to the 0-100 scale.
 * If the score is <= 10, assume it's on a 0-10 legacy scale and multiply by 10.
 */
export function normalizeScore(score: number): number {
  if (score <= 10) return score * 10;
  return score;
}
