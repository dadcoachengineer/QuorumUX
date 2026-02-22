/**
 * Stage 4: Report Generation
 *
 * Reads synthesis.json and generates human-readable reports and GitHub issue templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  QuorumUXConfig,
  Synthesis,
  ConsensusIssue,
  VideoOnlyIssue,
  ModelUniqueIssue,
  Disagreement,
  ReportJSON,
  ReportJSONIssue,
} from '../types.js';
import { calculateAdjustedScore } from '../utils/scoring.js';

/**
 * Generate UX analysis report and GitHub issue templates from synthesis data
 */
export async function generateReport(config: QuorumUXConfig, runDir: string, outputDir?: string): Promise<void> {
  const sourceReportsDir = path.join(runDir, 'reports');
  const synthesisPath = path.join(sourceReportsDir, 'synthesis.json');

  if (!fs.existsSync(synthesisPath)) {
    throw new Error(`Synthesis file not found at ${synthesisPath}`);
  }

  const synthesisJson = fs.readFileSync(synthesisPath, 'utf-8');
  const synthesis: Synthesis = JSON.parse(synthesisJson);

  // Determine output directory
  const targetDir = outputDir || sourceReportsDir;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate human-readable report
  const uxReport = generateUXReport(config, synthesis);
  fs.writeFileSync(path.join(targetDir, 'ux-analysis-report.md'), uxReport);

  // Generate GitHub issues markdown
  const githubIssues = generateGitHubIssues(config, synthesis);
  fs.writeFileSync(path.join(targetDir, 'github-issues.md'), githubIssues);

  // Generate JSON sidecar
  const runId = path.basename(runDir);
  const jsonReport = generateReportJSON(config, synthesis, runId);
  fs.writeFileSync(path.join(targetDir, 'ux-analysis-report.json'), JSON.stringify(jsonReport, null, 2) + '\n');
}

/**
 * Generate full human-readable UX analysis report
 */
function generateUXReport(config: QuorumUXConfig, synthesis: Synthesis): string {
  const lines: string[] = [];

  lines.push(`# UX Analysis Report: ${config.name}`);
  lines.push('');
  lines.push(`**Generated:** ${synthesis.synthesisDate}`);
  lines.push(`**Project:** ${config.name}`);
  lines.push(`**Domain:** ${config.domain}`);
  lines.push('');

  // Source counts
  lines.push('## Overview');
  lines.push('');
  lines.push('**Analysis Sources:**');
  lines.push(`- Screenshot Analyses: ${synthesis.sourceCounts.screenshotAnalyses}`);
  lines.push(`- Video Analyses: ${synthesis.sourceCounts.videoAnalyses}`);
  lines.push(`- Test Run Summaries: ${synthesis.sourceCounts.testSummaries}`);
  lines.push('');

  // Overall Assessment
  lines.push('## Overall Assessment');
  lines.push('');
  const assessment = synthesis.overallAssessment;
  const score100 = assessment.uxScore;
  const score10 = (score100 / 10).toFixed(1);
  let scoreLine = `**UX Score:** ${score100}/100 (${score10}/10)`;
  const adjusted = calculateAdjustedScore(synthesis);
  if (adjusted !== undefined && adjusted !== score100) {
    const adj10 = (adjusted / 10).toFixed(1);
    scoreLine += ` | Adjusted: ${adjusted}/100 (${adj10}/10)`;
  }
  lines.push(scoreLine);
  lines.push(`**Launch Readiness:** ${assessment.launchReadiness.replace(/-/g, ' ').toUpperCase()}`);
  lines.push('');

  lines.push('### Top Strengths');
  assessment.topStrengths.forEach((strength) => {
    lines.push(`- ${strength}`);
  });
  lines.push('');

  lines.push('### Critical Path (Must Fix Before Launch)');
  assessment.criticalPath.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push('');

  if (assessment.temporalInsightsSummary) {
    lines.push('### Temporal Insights');
    lines.push(assessment.temporalInsightsSummary);
    lines.push('');
  }

  // Partition issues into app vs test-infra
  const appConsensus = synthesis.consensusIssues.filter((i) => (i.source ?? 'app') !== 'test-infra');
  const appVideo = synthesis.videoOnlyIssues.filter((i) => (i.source ?? 'app') !== 'test-infra');
  const appModelUnique = synthesis.modelUniqueIssues.filter((i) => (i.source ?? 'app') !== 'test-infra');
  const testInfraIssues = [
    ...synthesis.consensusIssues.filter((i) => i.source === 'test-infra'),
    ...synthesis.videoOnlyIssues.filter((i) => i.source === 'test-infra'),
    ...synthesis.modelUniqueIssues.filter((i) => i.source === 'test-infra'),
  ];

  // Consensus Issues by Severity (app only)
  if (appConsensus.length > 0) {
    lines.push('## Consensus Issues');
    lines.push('');
    lines.push('Issues identified and confirmed across multiple analysis sources.');
    lines.push('');

    const byServerity = groupBySeverity(appConsensus);

    ['P0', 'P1', 'P2'].forEach((severity) => {
      const issues = byServerity[severity] || [];
      if (issues.length > 0) {
        lines.push(`### ${severity} Priority (${issues.length})`);
        lines.push('');
        issues.forEach((issue) => {
          lines.push(`#### ${issue.title}`);
          lines.push('');
          lines.push(`**Category:** ${issue.category}`);
          lines.push(`**Severity:** ${issue.severity}`);
          lines.push(`**Effort:** ${issue.effort}`);
          lines.push('');
          lines.push(issue.description);
          lines.push('');

          lines.push('**Evidence:**');
          lines.push(`- Screenshot Models: ${issue.evidence.screenshotModels.join(', ')}`);
          lines.push(`- Video Confirmed: ${issue.evidence.videoConfirmed ? 'Yes' : 'No'}`);
          lines.push(`- Test Run Confirmed: ${issue.evidence.testRunConfirmed ? 'Yes' : 'No'}`);
          if (issue.evidence.affectedPersonas.length > 0) {
            lines.push(
              `- Affected Personas: ${issue.evidence.affectedPersonas.join(', ')}`
            );
          }
          lines.push('');

          if (issue.temporalInsight) {
            lines.push(`**Temporal Insight:** ${issue.temporalInsight}`);
            lines.push('');
          }

          lines.push(`**Recommendation:** ${issue.recommendation}`);
          lines.push('');
        });
      }
    });
  }

  // Video-Only Issues (app only)
  if (appVideo.length > 0) {
    lines.push('## Video-Only Issues');
    lines.push('');
    lines.push('Issues detected only in video analysis (temporal, motion, or interaction patterns).');
    lines.push('');

    const byServerity = groupVideoIssuesBySeverity(appVideo);

    ['P0', 'P1', 'P2'].forEach((severity) => {
      const issues = byServerity[severity] || [];
      if (issues.length > 0) {
        lines.push(`### ${severity} Priority (${issues.length})`);
        lines.push('');
        issues.forEach((issue) => {
          lines.push(`#### ${issue.title}`);
          lines.push('');
          lines.push(`**Severity:** ${issue.severity}`);
          lines.push(`**Persona:** ${issue.persona}`);
          lines.push(`**Timestamp:** ${issue.timestamp}`);
          lines.push('');
          lines.push(issue.description);
          lines.push('');
          lines.push(`**Recommendation:** ${issue.recommendation}`);
          lines.push('');
        });
      }
    });
  }

  // Model-Unique Issues (app only)
  if (appModelUnique.length > 0) {
    lines.push('## Model-Unique Issues');
    lines.push('');
    lines.push(
      'Issues identified by a single analysis model. May indicate unique insights or model hallucinations.'
    );
    lines.push('');

    appModelUnique.forEach((issue) => {
      lines.push(`### ${issue.title}`);
      lines.push('');
      lines.push(`**Reported By:** ${issue.reportedBy}`);
      lines.push(`**Severity:** ${issue.severity}`);
      lines.push(`**Confidence:** ${issue.confidence}`);
      lines.push('');
      lines.push(issue.description);
      lines.push('');
      lines.push(`**Recommendation:** ${issue.recommendation}`);
      lines.push('');
    });
  }

  // Test Infrastructure Issues (separated section)
  if (testInfraIssues.length > 0) {
    lines.push('## Test Infrastructure Issues');
    lines.push('');
    lines.push(
      `These ${testInfraIssues.length} issue(s) appear to be test automation problems, not product issues.`
    );
    lines.push('They are weighted at 0.25x in the adjusted score.');
    lines.push('');

    for (const issue of testInfraIssues) {
      const desc = issue.description.length > 100
        ? issue.description.substring(0, 100) + '...'
        : issue.description;
      lines.push(`- **[${issue.severity}] ${issue.title}** — ${desc}`);
    }
    lines.push('');
  }

  // Disagreements
  if (synthesis.disagreements.length > 0) {
    lines.push('## Analyst Disagreements');
    lines.push('');
    lines.push('Areas where analysis models diverged in their assessment.');
    lines.push('');

    synthesis.disagreements.forEach((disagreement) => {
      lines.push(`### ${disagreement.topic}`);
      lines.push('');
      lines.push('**Positions:**');
      Object.entries(disagreement.positions).forEach(([model, position]) => {
        lines.push(`- **${model}:** ${position}`);
      });
      lines.push('');
      lines.push(`**Recommendation:** ${disagreement.recommendation}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Generate GitHub issue templates with gh commands
 */
function generateGitHubIssues(config: QuorumUXConfig, synthesis: Synthesis): string {
  const lines: string[] = [];

  lines.push(`# GitHub Issues: ${config.name}`);
  lines.push('');
  lines.push('Ready-to-file issue templates generated from QuorumUX analysis.');
  lines.push(`Generated: ${synthesis.synthesisDate}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Process consensus issues
  if (synthesis.consensusIssues.length > 0) {
    lines.push('## Consensus Issues');
    lines.push('');

    synthesis.consensusIssues.forEach((issue) => {
      const title = `[${issue.severity}] ${issue.title}`;
      const body = formatIssueBody(
        issue.description,
        issue.category,
        issue.effort,
        issue.evidence,
        issue.recommendation
      );
      lines.push(createGhCommand(title, body));
      lines.push('');
    });
  }

  // Process video-only issues
  if (synthesis.videoOnlyIssues.length > 0) {
    lines.push('## Video-Only Issues');
    lines.push('');

    synthesis.videoOnlyIssues.forEach((issue) => {
      const title = `[${issue.severity}] ${issue.title} (Video)`;
      const body =
        `**Persona:** ${issue.persona}\n` +
        `**Timestamp:** ${issue.timestamp}\n\n` +
        `${issue.description}\n\n` +
        `**Recommendation:** ${issue.recommendation}`;
      lines.push(createGhCommand(title, body));
      lines.push('');
    });
  }

  // Process model-unique issues
  if (synthesis.modelUniqueIssues.length > 0) {
    lines.push('## Model-Unique Issues');
    lines.push('');

    synthesis.modelUniqueIssues.forEach((issue) => {
      const title = `[${issue.severity}] ${issue.title} (${issue.reportedBy})`;
      const body =
        `**Reported By:** ${issue.reportedBy}\n` +
        `**Confidence:** ${issue.confidence}\n\n` +
        `${issue.description}\n\n` +
        `**Recommendation:** ${issue.recommendation}`;
      lines.push(createGhCommand(title, body));
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Helper: Format issue body with metadata
 */
function formatIssueBody(
  description: string,
  category: string,
  effort: string,
  evidence: ConsensusIssue['evidence'],
  recommendation: string
): string {
  const lines: string[] = [];

  lines.push(`**Category:** ${category}`);
  lines.push(`**Effort:** ${effort}`);
  lines.push('');
  lines.push(description);
  lines.push('');

  if (evidence.screenshotModels.length > 0) {
    lines.push(`**Confirmed By:** ${evidence.screenshotModels.join(', ')}`);
  }
  if (evidence.videoConfirmed) {
    lines.push('**Video Confirmed:** Yes');
  }
  if (evidence.testRunConfirmed) {
    lines.push('**Test Run Confirmed:** Yes');
  }
  if (evidence.affectedPersonas.length > 0) {
    lines.push(`**Affected Personas:** ${evidence.affectedPersonas.join(', ')}`);
  }

  lines.push('');
  lines.push(`**Recommendation:** ${recommendation}`);

  return lines.join('\n');
}

/**
 * Helper: Create gh issue create command
 */
function createGhCommand(title: string, body: string): string {
  const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `gh issue create --title "${title}" --body "${escapedBody}"`;
}

/**
 * Helper: Group consensus issues by severity
 */
function groupBySeverity(
  issues: ConsensusIssue[]
): Record<string, ConsensusIssue[]> {
  const groups: Record<string, ConsensusIssue[]> = {
    P0: [],
    P1: [],
    P2: [],
  };
  issues.forEach((issue) => {
    groups[issue.severity].push(issue);
  });
  return groups;
}

/**
 * Helper: Group video issues by severity
 */
function groupVideoIssuesBySeverity(
  issues: VideoOnlyIssue[]
): Record<string, VideoOnlyIssue[]> {
  const groups: Record<string, VideoOnlyIssue[]> = {
    P0: [],
    P1: [],
    P2: [],
  };
  issues.forEach((issue) => {
    groups[issue.severity].push(issue);
  });
  return groups;
}

/**
 * Generate a flat JSON report for programmatic consumption
 */
function generateReportJSON(config: QuorumUXConfig, synthesis: Synthesis, runId: string): ReportJSON {
  const issues: ReportJSONIssue[] = [];

  for (const issue of synthesis.consensusIssues) {
    issues.push({
      type: 'consensus',
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      description: issue.description,
      recommendation: issue.recommendation,
      category: issue.category,
      effort: issue.effort,
      evidence: issue.evidence,
      temporalInsight: issue.temporalInsight,
      source: issue.source,
      index: issue.index,
    });
  }

  for (const issue of synthesis.videoOnlyIssues) {
    issues.push({
      type: 'video-only',
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      description: issue.description,
      recommendation: issue.recommendation,
      timestamp: issue.timestamp,
      persona: issue.persona,
      source: issue.source,
      index: issue.index,
    });
  }

  for (const issue of synthesis.modelUniqueIssues) {
    issues.push({
      type: 'model-unique',
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      description: issue.description,
      recommendation: issue.recommendation,
      reportedBy: issue.reportedBy,
      confidence: issue.confidence,
      source: issue.source,
      index: issue.index,
    });
  }

  // Collect unique model and persona names from evidence
  const models = new Set<string>();
  for (const issue of synthesis.consensusIssues) {
    for (const m of issue.evidence.screenshotModels) models.add(m);
  }
  const personas = new Set<string>();
  for (const issue of synthesis.consensusIssues) {
    for (const p of issue.evidence.affectedPersonas) personas.add(p);
  }

  return {
    runId,
    generatedAt: new Date().toISOString(),
    projectName: config.name,
    score: synthesis.overallAssessment.uxScore,
    adjustedScore: calculateAdjustedScore(synthesis),
    launchReadiness: synthesis.overallAssessment.launchReadiness,
    issueCount: issues.length,
    issues,
    models: [...models].sort(),
    personas: [...personas].sort(),
    topStrengths: synthesis.overallAssessment.topStrengths,
    criticalPath: synthesis.overallAssessment.criticalPath,
  };
}
