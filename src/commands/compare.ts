/**
 * `quorumux compare` — Run Comparison
 *
 * Pure diff of two synthesis.json files. No API calls.
 * Usage: quorumux compare <baseline-dir> <current-dir>
 */

import * as path from 'path';
import * as logger from '../utils/logger.js';
import { loadJson } from '../utils/files.js';
import type { Synthesis } from '../types.js';

export interface CompareResult {
  scoreDelta: number;
  baselineScore: number;
  currentScore: number;
  baselineReadiness: string;
  currentReadiness: string;
  resolvedIssues: string[];
  newIssues: string[];
  persistingIssues: string[];
  severityDistribution: {
    baseline: Record<string, number>;
    current: Record<string, number>;
  };
}

/**
 * Pure function: compare two syntheses and return structured diff.
 * Testable without file I/O.
 */
export function compareSyntheses(
  baseline: Synthesis,
  current: Synthesis,
  baselineId: string,
  currentId: string
): CompareResult {
  const baselineIds = new Set(allIssueIds(baseline));
  const currentIds = new Set(allIssueIds(current));

  const resolvedIssues = [...baselineIds].filter((id) => !currentIds.has(id));
  const newIssues = [...currentIds].filter((id) => !baselineIds.has(id));
  const persistingIssues = [...baselineIds].filter((id) => currentIds.has(id));

  return {
    scoreDelta: current.overallAssessment.uxScore - baseline.overallAssessment.uxScore,
    baselineScore: baseline.overallAssessment.uxScore,
    currentScore: current.overallAssessment.uxScore,
    baselineReadiness: baseline.overallAssessment.launchReadiness,
    currentReadiness: current.overallAssessment.launchReadiness,
    resolvedIssues,
    newIssues,
    persistingIssues,
    severityDistribution: {
      baseline: countSeverities(baseline),
      current: countSeverities(current),
    },
  };
}

/**
 * CLI handler: load files and print comparison
 */
export async function runCompare(args: string[]): Promise<void> {
  if (args.length < 2) {
    logger.error('Usage: quorumux compare <baseline-dir> <current-dir>');
    process.exit(1);
  }

  const [baselineDir, currentDir] = args;
  const baselinePath = path.join(path.resolve(baselineDir), 'reports', 'synthesis.json');
  const currentPath = path.join(path.resolve(currentDir), 'reports', 'synthesis.json');

  const baseline = loadJson<Synthesis>(baselinePath);
  if (!baseline) {
    logger.error(`Baseline synthesis not found: ${baselinePath}`);
    process.exit(1);
  }

  const current = loadJson<Synthesis>(currentPath);
  if (!current) {
    logger.error(`Current synthesis not found: ${currentPath}`);
    process.exit(1);
  }

  const baselineId = path.basename(path.resolve(baselineDir));
  const currentId = path.basename(path.resolve(currentDir));
  const result = compareSyntheses(baseline, current, baselineId, currentId);

  // Print report
  const deltaSign = result.scoreDelta >= 0 ? '+' : '';
  logger.box([
    'QuorumUX — Run Comparison',
    '',
    `Baseline: ${baselineId}`,
    `Current:  ${currentId}`,
  ]);

  console.log('');
  logger.stage('Score');
  logger.log(`  Baseline: ${result.baselineScore}/100 (${result.baselineReadiness})`);
  logger.log(`  Current:  ${result.currentScore}/100 (${result.currentReadiness})`);
  logger.log(`  Delta:    ${deltaSign}${result.scoreDelta}`);

  logger.stage('Severity Distribution');
  for (const sev of ['P0', 'P1', 'P2']) {
    const b = result.severityDistribution.baseline[sev] || 0;
    const c = result.severityDistribution.current[sev] || 0;
    const d = c - b;
    const ds = d >= 0 ? `+${d}` : String(d);
    logger.log(`  ${sev}: ${b} → ${c} (${ds})`);
  }

  if (result.resolvedIssues.length > 0) {
    logger.stage(`Resolved Issues (${result.resolvedIssues.length})`);
    for (const id of result.resolvedIssues) {
      logger.log(`  - ${id}`);
    }
  }

  if (result.newIssues.length > 0) {
    logger.stage(`New Issues (${result.newIssues.length})`);
    for (const id of result.newIssues) {
      logger.log(`  + ${id}`);
    }
  }

  if (result.persistingIssues.length > 0) {
    logger.stage(`Persisting Issues (${result.persistingIssues.length})`);
    for (const id of result.persistingIssues) {
      logger.log(`    ${id}`);
    }
  }

  console.log('');
}

/** Collect all issue IDs from a synthesis */
function allIssueIds(synthesis: Synthesis): string[] {
  return [
    ...synthesis.consensusIssues.map((i) => i.id),
    ...synthesis.videoOnlyIssues.map((i) => i.id),
    ...synthesis.modelUniqueIssues.map((i) => i.id),
  ];
}

/** Count issues by severity across all issue types */
function countSeverities(synthesis: Synthesis): Record<string, number> {
  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0 };
  for (const issue of synthesis.consensusIssues) counts[issue.severity]++;
  for (const issue of synthesis.videoOnlyIssues) counts[issue.severity]++;
  for (const issue of synthesis.modelUniqueIssues) counts[issue.severity]++;
  return counts;
}
