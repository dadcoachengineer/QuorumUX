/**
 * QuorumUX Pipeline Stage 3: Synthesis
 *
 * Cross-model synthesis integrating screenshot analyses, video analyses,
 * and test summaries into a coherent UX assessment via the synthesis model.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { QuorumUXConfig, Synthesis, ScreenshotAnalysis, VideoAnalysis, PersonaSummary } from '../types.js';
import { callOpenRouter } from '../models/openrouter.js';
import * as logger from '../utils/logger.js';
import { loadJson, loadText } from '../utils/files.js';
import { CostTracker } from '../utils/costs.js';

/**
 * Generate a stable content-based issue ID from title + discriminator.
 * Deterministic: same inputs always produce the same QUX-xxxxxxxx hash.
 */
export function generateStableId(title: string, discriminator: string): string {
  const normalized = `${title.toLowerCase().trim()}:${discriminator.toLowerCase().trim()}`;
  return `QUX-${createHash('sha256').update(normalized).digest('hex').substring(0, 8)}`;
}

/**
 * Post-process synthesis output: replace model-generated ordinal IDs
 * with stable content-based hashes, preserving the ordinal as `index`.
 */
function stabilizeIds(synthesis: Synthesis): Synthesis {
  let idx = 1;
  for (const issue of synthesis.consensusIssues) {
    issue.index = idx++;
    issue.id = generateStableId(issue.title, issue.category || 'consensus');
  }
  for (const issue of synthesis.videoOnlyIssues) {
    issue.index = idx++;
    issue.id = generateStableId(issue.title, 'video');
  }
  for (const issue of synthesis.modelUniqueIssues) {
    issue.index = idx++;
    issue.id = generateStableId(issue.title, 'model-unique');
  }
  return synthesis;
}

export async function synthesize(config: QuorumUXConfig, runDir: string, tracker?: CostTracker): Promise<void> {
  logger.stage('Stage 3: Cross-Model Synthesis');
  tracker?.stageStart('Stage 3');

  const reportsDir = path.join(runDir, 'reports');
  const summariesDir = path.join(runDir, 'summaries');

  if (!fs.existsSync(reportsDir)) {
    throw new Error('reports/ directory not found. Run Stage 2 first.');
  }

  logger.log('  Loading analysis results...');

  // Load screenshot analyses
  const screenshotAnalyses = loadJson<ScreenshotAnalysis[]>(path.join(reportsDir, 'all-analyses-raw.json')) || [];
  logger.debug(`Loaded ${screenshotAnalyses.length} screenshot analyses`);

  if (screenshotAnalyses.length === 0) {
    logger.warn('No screenshot analyses found (all-analyses-raw.json)');
  }

  // Load video analyses
  const videoAnalyses = loadJson<VideoAnalysis[]>(path.join(reportsDir, 'all-video-analyses-raw.json')) || [];
  if (videoAnalyses.length > 0) {
    logger.debug(`Loaded ${videoAnalyses.length} video analyses`);
  } else {
    logger.debug('No video analyses found (all-video-analyses-raw.json)');
  }

  // Load persona summaries
  let personaSummaries: PersonaSummary[] = [];
  if (fs.existsSync(summariesDir)) {
    const summaryFiles = fs.readdirSync(summariesDir).filter((f) => f.endsWith('-summary.json'));
    personaSummaries = summaryFiles
      .map((f) => loadJson<PersonaSummary>(path.join(summariesDir, f)))
      .filter((s): s is PersonaSummary => s !== null);
    logger.debug(`Loaded ${personaSummaries.length} persona summaries`);
  }

  // Load executive summary
  const executiveSummary = loadText(path.join(runDir, 'executive-summary.md')) || '';
  if (executiveSummary) {
    logger.debug('Loaded executive summary');
  }

  const successCount = screenshotAnalyses.filter((a) => !a.error).length;
  const videoCount = videoAnalyses.filter((a) => !a.error).length;
  logger.log(`  Synthesizing ${successCount} screenshot + ${videoCount} video analyses via ${config.models.synthesis.name}...`);

  const synthesis = await synthesizeWithModel(
    screenshotAnalyses,
    videoAnalyses,
    personaSummaries,
    executiveSummary,
    config,
    tracker
  );

  // Write synthesis results
  const outputPath = path.join(reportsDir, 'synthesis.json');
  fs.writeFileSync(outputPath, JSON.stringify(synthesis, null, 2));

  tracker?.stageEnd('Stage 3');
  logger.success(`Synthesis complete. Results written to ${path.basename(outputPath)}`);
}

/**
 * Send all analyses to the synthesis model for integration
 */
async function synthesizeWithModel(
  screenshotAnalyses: ScreenshotAnalysis[],
  videoAnalyses: VideoAnalysis[],
  personaSummaries: PersonaSummary[],
  executiveSummary: string,
  config: QuorumUXConfig,
  tracker?: CostTracker
): Promise<Synthesis> {
  const systemPrompt = buildSynthesisSystemPrompt(config);
  const userMessage = buildSynthesisUserMessage(
    screenshotAnalyses,
    videoAnalyses,
    personaSummaries,
    executiveSummary,
    config
  );

  const response = await callOpenRouter({
    model: config.models.synthesis.id,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
    maxTokens: config.models.synthesis.maxTokens || 8000,
    referer: config.appUrl,
    title: 'QuorumUX UX Analysis',
  });

  tracker?.record('Stage 3', config.models.synthesis.id, response.usage);

  const rawContent = response.content;

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawContent];
  const jsonStr = (jsonMatch[1] || rawContent).trim();

  try {
    const parsed = JSON.parse(jsonStr) as Synthesis;
    return stabilizeIds(parsed);
  } catch (parseError) {
    logger.error(`Failed to parse synthesis response as JSON: ${parseError}`);
    logger.debug(`Raw response (first 500 chars): ${rawContent.substring(0, 500)}`);
    throw new Error('Synthesis response was not valid JSON');
  }
}

/**
 * Build system prompt for synthesis
 */
function buildSynthesisSystemPrompt(config: QuorumUXConfig): string {
  const parts = [
    `You are a senior UX research analyst synthesizing findings from multiple models and data sources.`,
    ``,
    `Your role is to:`,
    `- Identify consensus issues that multiple models agree on`,
    `- Highlight unique insights from individual models`,
    `- Surface video-only observations that static analysis misses`,
    `- Resolve disagreements with nuanced recommendations`,
    `- Synthesize into a coherent launch readiness assessment`,
    ``,
    `Project: ${config.name}`,
    `Domain: ${config.domain}`,
    `Description: ${config.description}`,
    `User Journey: ${config.userJourney}`,
    ``,
    `Return ONLY valid JSON matching the schema provided. No markdown wrapping.`,
  ];

  if (config.synthesisContext) {
    parts.push('', config.synthesisContext);
  }

  return parts.join('\n');
}

/**
 * Build user message with all analyses
 */
function buildSynthesisUserMessage(
  screenshotAnalyses: ScreenshotAnalysis[],
  videoAnalyses: VideoAnalysis[],
  personaSummaries: PersonaSummary[],
  executiveSummary: string,
  config: QuorumUXConfig
): string {
  const successfulScreenshot = screenshotAnalyses.filter((a) => !a.error);
  const successfulVideo = videoAnalyses.filter((a) => !a.error);

  const parts = [
    `I have gathered comprehensive analysis data from multiple sources about ${config.name}. Please synthesize these into a coherent UX assessment.`,
    ``,
    `## Data Overview`,
    `- **Screenshot Analyses:** ${successfulScreenshot.length} analyses from ${new Set(successfulScreenshot.map((a) => a.model)).size} models`,
    `- **Video Analyses:** ${successfulVideo.length} analyses`,
    `- **Test Personas:** ${personaSummaries.length}`,
    ``,
  ];

  // Add screenshot analyses grouped by persona then model
  if (successfulScreenshot.length > 0) {
    parts.push(`## Screenshot Analyses (${new Set(successfulScreenshot.map((a) => a.model)).size} models × ${new Set(successfulScreenshot.map((a) => a.persona)).size} personas)`, ``);

    const grouped = successfulScreenshot.reduce(
      (acc, a) => {
        if (!acc[a.persona]) acc[a.persona] = [];
        acc[a.persona].push(a);
        return acc;
      },
      {} as Record<string, ScreenshotAnalysis[]>
    );

    for (const [persona, analyses] of Object.entries(grouped)) {
      for (const analysis of analyses) {
        parts.push(
          `### ${persona} — ${analysis.model}`,
          analysis.analysis,
          ``,
          `---`,
          ``
        );
      }
    }
  }

  // Add video analyses grouped by persona
  if (successfulVideo.length > 0) {
    parts.push(`## Video Analyses (Gemini temporal analysis)`, ``);

    for (const analysis of successfulVideo) {
      parts.push(
        `### ${analysis.persona} — Video Analysis`,
        analysis.analysis,
        ``,
        `---`,
        ``
      );
    }
  }

  // Add persona summaries
  if (personaSummaries.length > 0) {
    parts.push(`## Automated Test Results`, ``);
    for (const summary of personaSummaries) {
      parts.push(
        `### ${summary.persona}`,
        `Pass: ${summary.results.pass}, Friction: ${summary.results.friction}, Fail: ${summary.results.fail}`
      );
      if (summary.issues?.length > 0) {
        parts.push('Issues:');
        parts.push(summary.issues.map((i) => `- [${i.severity}/${i.category}] ${i.description}`).join('\n'));
      }
      parts.push('');
    }
  }

  // Add executive summary if available
  if (executiveSummary) {
    parts.push(`## Executive Summary`, executiveSummary, ``);
  }

  // Add synthesis instructions with JSON schema
  parts.push(
    `---`,
    ``,
    `## Your Synthesis Task`,
    ``,
    `Produce a JSON document with this structure:`,
    ``,
    `{`,
    `  "synthesisDate": "${new Date().toISOString().split('T')[0]}",`,
    `  "projectName": "${config.name}",`,
    `  "sourceCounts": {`,
    `    "screenshotAnalyses": ${successfulScreenshot.length},`,
    `    "videoAnalyses": ${successfulVideo.length},`,
    `    "testSummaries": ${personaSummaries.length}`,
    `  },`,
    `  "consensusIssues": [`,
    `    {`,
    `      "title": "Issue title",`,
    `      "severity": "P0|P1|P2",`,
    `      "category": "visual|functional|copy|accessibility|performance|interaction|layout",`,
    `      "source": "app|test-infra",`,
    `      "description": "Detailed description",`,
    `      "evidence": {`,
    `        "screenshotModels": ["claude", "gemini"],`,
    `        "videoConfirmed": true,`,
    `        "testRunConfirmed": true,`,
    `        "affectedPersonas": ["persona1"]`,
    `      },`,
    `      "temporalInsight": "Video observation or null",`,
    `      "recommendation": "Actionable recommendation",`,
    `      "effort": "low|medium|high"`,
    `    }`,
    `  ],`,
    `  "videoOnlyIssues": [`,
    `    {`,
    `      "title": "Issue title",`,
    `      "severity": "P0|P1|P2",`,
    `      "source": "app|test-infra",`,
    `      "description": "Description",`,
    `      "timestamp": "MM:SS",`,
    `      "persona": "persona",`,
    `      "recommendation": "Recommendation"`,
    `    }`,
    `  ],`,
    `  "modelUniqueIssues": [`,
    `    {`,
    `      "title": "Issue title",`,
    `      "reportedBy": "claude|gemini|gpt4o",`,
    `      "severity": "P0|P1|P2",`,
    `      "source": "app|test-infra",`,
    `      "description": "Description",`,
    `      "recommendation": "Recommendation",`,
    `      "confidence": "low|medium|high"`,
    `    }`,
    `  ],`,
    `  "disagreements": [`,
    `    {`,
    `      "topic": "Area of disagreement",`,
    `      "positions": { "claude": "position", "gemini": "position", "gpt4o": "position", "video": "position" },`,
    `      "recommendation": "How to resolve"`,
    `    }`,
    `  ],`,
    `  "overallAssessment": {`,
    `    "uxScore": 75,`,
    `    "launchReadiness": "ready|ready-with-caveats|not-ready",`,
    `    "topStrengths": ["strength1", "strength2", "strength3"],`,
    `    "criticalPath": ["fix1", "fix2"],`,
    `    "temporalInsightsSummary": "Summary of video-specific insights"`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `1. **Consensus Issues** = 2+ screenshot models flagged OR (screenshot + video confirmation)`,
    `2. **Video-Only Issues** = Temporal problems ONLY caught by video (hesitation, timing, loading)`,
    `3. **Model-Unique Issues** = Only 1 screenshot model flagged, not confirmed by video`,
    `4. **Disagreements** = Models actively contradict each other`,
    `5. Prioritize P0 > P1 > P2 (P0 = ship blocker, P1 = first week, P2 = polish)`,
    `6. When video confirms screenshot finding, explicitly note the temporal insight`,
    `7. **Source classification**: For each issue, classify as "app" or "test-infra":`,
    `   - "test-infra" = problems in test automation, not the product:`,
    `     screenshot/video capture artifacts, test environment issues (localhost URLs,`,
    `     missing test data), automation timing (Playwright wait failures), cookie/auth`,
    `     state not set up, placeholder/mock data visible`,
    `   - "app" = real product issues visible to end users (default when uncertain)`,
  );

  return parts.join('\n');
}
