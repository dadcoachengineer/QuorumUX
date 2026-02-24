/**
 * `quorumux compare` — Run Comparison
 *
 * Structured diff of two synthesis.json files with fuzzy issue matching.
 * No API calls.
 * Usage: quorumux compare [--json] [--variant-threshold <0-1>] <baseline-dir> <current-dir>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger.js';
import { loadJson } from '../utils/files.js';
import { normalizeScore, calculateAdjustedScore } from '../utils/scoring.js';
import type { Synthesis } from '../types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompareIssue {
  id: string;
  title: string;
  severity: 'P0' | 'P1' | 'P2';
  type: 'consensus' | 'video-only' | 'model-unique';
  source?: 'app' | 'test-infra';
  category?: string;
}

export interface PersistingIssue {
  baselineId: string;
  currentId: string;
  title: string;
  baselineSeverity: 'P0' | 'P1' | 'P2';
  currentSeverity: 'P0' | 'P1' | 'P2';
  severityChange: 'improved' | 'regressed' | 'unchanged';
  matchMethod: 'exact-id' | 'fuzzy';
  matchConfidence?: number;
}

export interface PersistingVariant {
  issue: CompareIssue;
  similarTo: CompareIssue;
  similarityScore: number;
}

export interface CompareResult {
  scoreDelta: number;
  baselineScore: number;
  currentScore: number;
  adjustedDelta?: number;
  baselineReadiness: string;
  currentReadiness: string;
  resolvedIssues: CompareIssue[];
  newIssues: CompareIssue[];
  persistingIssues: PersistingIssue[];
  persistingVariants: PersistingVariant[];
  regressions: PersistingIssue[];
  scoreContext: string;
  severityDistribution: {
    baseline: Record<string, number>;
    current: Record<string, number>;
  };
}

export interface CompareOptions {
  variantThreshold?: number;
}

// ─── Matching utilities ─────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

const FILLER_ADVERBS = new Set([
  'consistently', 'permanently', 'completely', 'inappropriately', 'repeatedly',
  'unexpectedly', 'excessively', 'extremely', 'significantly', 'severely',
  'very', 'highly', 'particularly', 'notably', 'somewhat', 'slightly',
  'relatively', 'quite',
]);

const SYNONYM_MAP: Record<string, string> = {
  // Generic synonyms
  latency: 'performance',
  freeze: 'block',
  frozen: 'block',
  stuck: 'block',
  inaccessible: 'not accessible',
  navigation: 'nav',
  obscures: 'overlaps',
  exceeds: 'slow',
  delay: 'slow',
  insufficient: 'missing',
  tracking: 'analytics',
  // Domain-aware synonyms — common across UX analysis titles
  stepper: 'indicator',
  progress: 'step',
};

/**
 * Normalize an issue title for comparison: strip severity prefixes,
 * remove filler adverbs, normalize synonyms, collapse whitespace.
 */
export function normalizeTitle(title: string): string {
  let t = title.replace(/^\s*\[?P[012]\]?\s*[:—-]?\s*/i, '');
  t = t.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  const normalized = words
    .filter((w) => !FILLER_ADVERBS.has(w))
    .map((w) => SYNONYM_MAP[w] ?? w);
  return normalized.join(' ').trim();
}

/**
 * Jaccard word-overlap similarity on normalized, lowercased, whitespace-split tokens.
 * Returns 0.0–1.0.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeTitle(a).split(/\s+/).filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Two-pass issue matching between baseline and current runs.
 *
 * Pass 1: Exact ID match for QUX- prefixed stable hashes.
 * Pass 2: Fuzzy title matching for remaining (legacy ordinal IDs or unmatched).
 *   Threshold: similarity > 0.6 OR (same category + same severity + similarity > 0.4)
 *   Greedy assignment sorted by descending similarity.
 */
export function matchIssues(
  baselineIssues: CompareIssue[],
  currentIssues: CompareIssue[]
): {
  matched: Array<{ baseline: CompareIssue; current: CompareIssue; method: 'exact-id' | 'fuzzy'; confidence?: number }>;
  unmatchedBaseline: CompareIssue[];
  unmatchedCurrent: CompareIssue[];
} {
  const matchedBaseline = new Set<number>();
  const matchedCurrent = new Set<number>();
  const matched: Array<{ baseline: CompareIssue; current: CompareIssue; method: 'exact-id' | 'fuzzy'; confidence?: number }> = [];

  // Pass 1: Exact ID match (QUX- prefixed stable hashes)
  for (let bi = 0; bi < baselineIssues.length; bi++) {
    if (matchedBaseline.has(bi)) continue;
    const bIssue = baselineIssues[bi];
    if (!bIssue.id.startsWith('QUX-')) continue;

    for (let ci = 0; ci < currentIssues.length; ci++) {
      if (matchedCurrent.has(ci)) continue;
      if (currentIssues[ci].id === bIssue.id) {
        matched.push({ baseline: bIssue, current: currentIssues[ci], method: 'exact-id' });
        matchedBaseline.add(bi);
        matchedCurrent.add(ci);
        break;
      }
    }
  }

  // Pass 2: Fuzzy title matching for remaining
  const candidates: Array<{ bi: number; ci: number; similarity: number }> = [];
  for (let bi = 0; bi < baselineIssues.length; bi++) {
    if (matchedBaseline.has(bi)) continue;
    for (let ci = 0; ci < currentIssues.length; ci++) {
      if (matchedCurrent.has(ci)) continue;
      const sim = jaccardSimilarity(baselineIssues[bi].title, currentIssues[ci].title);
      const sameCategory = baselineIssues[bi].category !== undefined
        && baselineIssues[bi].category === currentIssues[ci].category;
      const sameSeverity = baselineIssues[bi].severity === currentIssues[ci].severity;

      if (sim > 0.6 || (sameCategory && sameSeverity && sim > 0.4)) {
        candidates.push({ bi, ci, similarity: sim });
      }
    }
  }

  // Greedy assignment sorted by descending similarity
  candidates.sort((a, b) => b.similarity - a.similarity);
  for (const { bi, ci, similarity } of candidates) {
    if (matchedBaseline.has(bi) || matchedCurrent.has(ci)) continue;
    matched.push({
      baseline: baselineIssues[bi],
      current: currentIssues[ci],
      method: 'fuzzy',
      confidence: Math.round(similarity * 100),
    });
    matchedBaseline.add(bi);
    matchedCurrent.add(ci);
  }

  const unmatchedBaseline = baselineIssues.filter((_, i) => !matchedBaseline.has(i));
  const unmatchedCurrent = currentIssues.filter((_, i) => !matchedCurrent.has(i));

  return { matched, unmatchedBaseline, unmatchedCurrent };
}

// ─── Core comparison ────────────────────────────────────────────────────────

/**
 * Collect all issues from a synthesis into flat CompareIssue array
 */
function collectIssues(synthesis: Synthesis): CompareIssue[] {
  const issues: CompareIssue[] = [];
  for (const i of synthesis.consensusIssues) {
    issues.push({
      id: i.id, title: i.title, severity: i.severity,
      type: 'consensus', source: i.source ?? 'app', category: i.category,
    });
  }
  for (const i of synthesis.videoOnlyIssues) {
    issues.push({
      id: i.id, title: i.title, severity: i.severity,
      type: 'video-only', source: i.source ?? 'app',
    });
  }
  for (const i of synthesis.modelUniqueIssues) {
    issues.push({
      id: i.id, title: i.title, severity: i.severity,
      type: 'model-unique', source: i.source ?? 'app',
    });
  }
  return issues;
}

/**
 * Compare severity and return direction of change.
 */
function compareSeverity(
  baseline: 'P0' | 'P1' | 'P2',
  current: 'P0' | 'P1' | 'P2'
): 'improved' | 'regressed' | 'unchanged' {
  const bOrd = SEVERITY_ORDER[baseline];
  const cOrd = SEVERITY_ORDER[current];
  if (cOrd > bOrd) return 'improved';  // P0→P1 = improved (higher ordinal = lower severity)
  if (cOrd < bOrd) return 'regressed'; // P1→P0 = regressed
  return 'unchanged';
}

/** Count issues by severity across all issue types */
function countSeverities(synthesis: Synthesis): Record<string, number> {
  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0 };
  for (const issue of synthesis.consensusIssues) counts[issue.severity]++;
  for (const issue of synthesis.videoOnlyIssues) counts[issue.severity]++;
  for (const issue of synthesis.modelUniqueIssues) counts[issue.severity]++;
  return counts;
}

/**
 * Interpretive context line for the score delta.
 */
export function generateScoreContext(result: CompareResult): string {
  const parts: string[] = [];

  if (result.resolvedIssues.length === 0 && result.newIssues.length === 0
    && result.persistingVariants.length === 0 && result.regressions.length === 0) {
    return 'No meaningful changes between runs';
  }

  if (result.scoreDelta > 0) {
    const resolvedP0s = result.resolvedIssues.filter((i) => i.severity === 'P0');
    if (resolvedP0s.length > 0) {
      parts.push(`${resolvedP0s.length} P0 issue${resolvedP0s.length > 1 ? 's' : ''} resolved`);
    }
  } else if (result.scoreDelta < 0) {
    const newP0s = result.newIssues.filter((i) => i.severity === 'P0');
    if (newP0s.length > 0) {
      parts.push(`${newP0s.length} new P0 issue${newP0s.length > 1 ? 's' : ''} introduced`);
    }
    if (result.regressions.length > 0) {
      parts.push(`${result.regressions.length} regression${result.regressions.length > 1 ? 's' : ''}`);
    }
  }

  if (result.persistingVariants.length > 0) {
    parts.push(`${result.persistingVariants.length} issue${result.persistingVariants.length > 1 ? 's' : ''} reworded but not resolved`);
  }

  return parts.join('; ');
}

/**
 * Pure function: compare two syntheses and return structured diff.
 * Uses two-pass matching (exact ID + fuzzy title) and score normalization.
 */
export function compareSyntheses(
  baseline: Synthesis,
  current: Synthesis,
  baselineId: string,
  currentId: string,
  options?: CompareOptions
): CompareResult {
  const baselineIssues = collectIssues(baseline);
  const currentIssues = collectIssues(current);

  const { matched, unmatchedBaseline, unmatchedCurrent } = matchIssues(baselineIssues, currentIssues);

  // Build persisting issues + regressions from matches
  const persistingIssues: PersistingIssue[] = [];
  const regressions: PersistingIssue[] = [];

  for (const m of matched) {
    const severityChange = compareSeverity(m.baseline.severity, m.current.severity);
    const entry: PersistingIssue = {
      baselineId: m.baseline.id,
      currentId: m.current.id,
      title: m.current.title,
      baselineSeverity: m.baseline.severity,
      currentSeverity: m.current.severity,
      severityChange,
      matchMethod: m.method,
      matchConfidence: m.confidence,
    };
    persistingIssues.push(entry);
    if (severityChange === 'regressed') {
      regressions.push(entry);
    }
  }

  // Bidirectional variant detection: find unmatched pairs that are similar
  // but below the primary match threshold
  const persistingVariants: PersistingVariant[] = [];
  const variantBaselineIdxs = new Set<number>();
  const variantCurrentIdxs = new Set<number>();

  const variantThreshold = options?.variantThreshold ?? 0.35;
  const variantCandidates: Array<{ bi: number; ci: number; similarity: number }> = [];
  for (let ci = 0; ci < unmatchedCurrent.length; ci++) {
    for (let bi = 0; bi < unmatchedBaseline.length; bi++) {
      const sim = jaccardSimilarity(unmatchedCurrent[ci].title, unmatchedBaseline[bi].title);
      if (sim >= variantThreshold) {
        variantCandidates.push({ bi, ci, similarity: sim });
      }
    }
  }
  variantCandidates.sort((a, b) => b.similarity - a.similarity);
  for (const { bi, ci, similarity } of variantCandidates) {
    if (variantBaselineIdxs.has(bi) || variantCurrentIdxs.has(ci)) continue;
    persistingVariants.push({
      issue: unmatchedCurrent[ci],
      similarTo: unmatchedBaseline[bi],
      similarityScore: Math.round(similarity * 100),
    });
    variantBaselineIdxs.add(bi);
    variantCurrentIdxs.add(ci);
  }

  // Filter variants out of resolved/new lists
  const resolvedIssues = unmatchedBaseline.filter((_, i) => !variantBaselineIdxs.has(i));
  const newIssues = unmatchedCurrent.filter((_, i) => !variantCurrentIdxs.has(i));

  // Score normalization
  const baselineScore = normalizeScore(baseline.overallAssessment.uxScore);
  const currentScore = normalizeScore(current.overallAssessment.uxScore);

  // Adjusted scores
  const baselineAdj = calculateAdjustedScore(baseline);
  const currentAdj = calculateAdjustedScore(current);
  const adjustedDelta = (baselineAdj !== undefined && currentAdj !== undefined)
    ? currentAdj - baselineAdj
    : undefined;

  const result: CompareResult = {
    scoreDelta: currentScore - baselineScore,
    baselineScore,
    currentScore,
    adjustedDelta,
    baselineReadiness: baseline.overallAssessment.launchReadiness,
    currentReadiness: current.overallAssessment.launchReadiness,
    resolvedIssues,
    newIssues,
    persistingIssues,
    persistingVariants,
    regressions,
    scoreContext: '',
    severityDistribution: {
      baseline: countSeverities(baseline),
      current: countSeverities(current),
    },
  };

  result.scoreContext = generateScoreContext(result);
  return result;
}

// ─── CLI handler ────────────────────────────────────────────────────────────

/**
 * CLI handler: load files and print comparison
 */
export async function runCompare(args: string[]): Promise<void> {
  let jsonFlag = false;
  let variantThreshold: number | undefined;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
      jsonFlag = true;
    } else if (args[i] === '--variant-threshold') {
      variantThreshold = parseFloat(args[++i]);
      if (isNaN(variantThreshold) || variantThreshold < 0 || variantThreshold > 1) {
        logger.error('--variant-threshold must be a number between 0 and 1');
        process.exit(1);
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  if (positionalArgs.length < 2) {
    logger.error('Usage: quorumux compare [--json] [--variant-threshold <0-1>] <baseline-dir> <current-dir>');
    process.exit(1);
  }

  const [baselineDir, currentDir] = positionalArgs;
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
  const result = compareSyntheses(baseline, current, baselineId, currentId,
    variantThreshold !== undefined ? { variantThreshold } : undefined);

  // Write JSON sidecar to current run's reports dir
  const currentReportsDir = path.join(path.resolve(currentDir), 'reports');
  if (fs.existsSync(currentReportsDir)) {
    const sidecarPath = path.join(currentReportsDir, 'comparison-report.json');
    fs.writeFileSync(sidecarPath, JSON.stringify(result, null, 2) + '\n');
  }

  // --json: print JSON to stdout and exit
  if (jsonFlag) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Formatted output
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
  if (result.adjustedDelta !== undefined) {
    const adjSign = result.adjustedDelta >= 0 ? '+' : '';
    logger.log(`  Adjusted: ${adjSign}${result.adjustedDelta}`);
  }
  if (result.scoreContext) {
    logger.log(`  Context:  ${result.scoreContext}`);
  }

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
    for (const issue of result.resolvedIssues) {
      logger.log(`  - [${issue.severity}] ${issue.title}`);
    }
  }

  if (result.persistingVariants.length > 0) {
    logger.stage(`Persisting Variants (${result.persistingVariants.length})`);
    for (const v of result.persistingVariants) {
      logger.log(`  ~ [${v.issue.severity}] ${v.issue.title}`);
      logger.log(`    ↳ Similar to resolved: "${v.similarTo.title}" (${v.similarityScore}% similar)`);
    }
  }

  if (result.newIssues.length > 0) {
    logger.stage(`New Issues (${result.newIssues.length})`);
    for (const issue of result.newIssues) {
      logger.log(`  + [${issue.severity}] ${issue.title}`);
    }
  }

  if (result.persistingIssues.length > 0) {
    logger.stage(`Persisting Issues (${result.persistingIssues.length})`);
    for (const issue of result.persistingIssues) {
      const sevStr = issue.baselineSeverity === issue.currentSeverity
        ? `${issue.currentSeverity}`
        : `${issue.baselineSeverity} → ${issue.currentSeverity}`;
      const matchStr = issue.matchMethod === 'exact-id'
        ? '[exact]'
        : `[fuzzy ${issue.matchConfidence}%]`;
      logger.log(`    ${issue.title} (${sevStr}) ${matchStr}`);
    }
  }

  if (result.regressions.length > 0) {
    logger.stage(`Regressions (${result.regressions.length})`);
    for (const issue of result.regressions) {
      logger.log(`  ! [${issue.baselineSeverity} → ${issue.currentSeverity}] ${issue.title}`);
    }
  }

  console.log('');
}
