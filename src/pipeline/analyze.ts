/**
 * Quorum Pipeline Stage 2: Screenshot Analysis
 *
 * Sends screenshot grids to all models in config.models.screenshot via OpenRouter.
 * Models run in parallel per persona, matching the reference implementation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { QuorumConfig, PersonaSummary, ScreenshotAnalysis } from '../types';
import { callOpenRouter, OpenRouterResponse } from '../models/openrouter';
import * as logger from '../utils/logger';
import { ensureDir, loadJson } from '../utils/files';
import { CostTracker } from '../utils/costs';

export async function analyzeScreenshots(
  config: QuorumConfig,
  runDir: string,
  tracker?: CostTracker
): Promise<void> {
  logger.stage('Stage 2: Screenshot Analysis');
  tracker?.stageStart('Stage 2');

  const gridsDir = path.join(runDir, 'grids');
  const summariesDir = path.join(runDir, 'summaries');
  const reportsDir = path.join(runDir, 'reports');

  ensureDir(reportsDir);

  if (!fs.existsSync(gridsDir)) {
    logger.warn('No grids/ directory found. Run Stage 1 first.');
    tracker?.stageEnd('Stage 2');
    return;
  }

  const gridFiles = fs.readdirSync(gridsDir).filter((f) => f.endsWith('-grid.jpg'));

  if (gridFiles.length === 0) {
    logger.warn('No screenshot grids found in grids/ directory');
    tracker?.stageEnd('Stage 2');
    return;
  }

  const analyses: ScreenshotAnalysis[] = [];
  const totalCalls = gridFiles.length * config.models.screenshot.length;
  let completed = 0;

  for (const gridFile of gridFiles) {
    const personaId = gridFile.replace('-grid.jpg', '');
    const gridPath = path.join(gridsDir, gridFile);

    // Load persona summary for context
    const summaryPath = path.join(summariesDir, `${personaId}-summary.json`);
    const personaSummary = loadJson<PersonaSummary>(summaryPath);

    // Run all models in parallel for this persona
    const modelPromises = config.models.screenshot.map(async (modelSpec) => {
      const callNum = ++completed;
      logger.progress(callNum, totalCalls, `${personaId} — ${modelSpec.name}...`);

      try {
        const response = await analyzeGridWithModel(
          gridPath,
          modelSpec.id,
          modelSpec.name,
          config,
          personaSummary,
          modelSpec.maxTokens
        );

        tracker?.record('Stage 2', modelSpec.id, response.usage);
        logger.success(`${personaId} — ${modelSpec.name} complete`);

        return {
          persona: personaId,
          model: modelSpec.name,
          modelId: modelSpec.id,
          analysis: response.content,
          tokens: response.usage,
        } as ScreenshotAnalysis;
      } catch (err) {
        logger.error(`${personaId} — ${modelSpec.name}: ${err}`);

        return {
          persona: personaId,
          model: modelSpec.name,
          modelId: modelSpec.id,
          analysis: '',
          error: String(err),
        } as ScreenshotAnalysis;
      }
    });

    const results = await Promise.all(modelPromises);
    analyses.push(...results);
  }

  // Write results
  const outputPath = path.join(reportsDir, 'all-analyses-raw.json');
  fs.writeFileSync(outputPath, JSON.stringify(analyses, null, 2));

  tracker?.stageEnd('Stage 2');
  logger.success(`Screenshot analysis complete. ${analyses.length} analyses written to ${path.basename(outputPath)}`);
}

/**
 * Send a screenshot grid to a model for analysis via OpenRouter
 */
async function analyzeGridWithModel(
  gridPath: string,
  modelId: string,
  modelName: string,
  config: QuorumConfig,
  personaSummary: PersonaSummary | null,
  maxTokens?: number
): Promise<OpenRouterResponse> {
  const imageBuffer = fs.readFileSync(gridPath);
  const imageBase64 = imageBuffer.toString('base64');

  const systemPrompt = buildScreenshotSystemPrompt(config, personaSummary);
  const userMessage = buildScreenshotUserMessage(config, personaSummary);

  return callOpenRouter({
    model: modelId,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userMessage,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    maxTokens: maxTokens || 3000,
    referer: config.appUrl,
    title: 'Quorum UX Analysis',
  });
}

/**
 * Build system prompt for screenshot analysis
 */
function buildScreenshotSystemPrompt(config: QuorumConfig, personaSummary: PersonaSummary | null): string {
  const parts = [
    `You are an expert UX analyst reviewing test screenshots from ${config.name}, ${config.description}`,
    ``,
    `The platform flow is: ${config.userJourney}`,
    ``,
    `You are analyzing screenshots from an automated test run where synthetic personas (with scripted inputs) went through the full user journey. Your job is to identify UX issues, visual bugs, and friction points.`,
  ];

  if (personaSummary) {
    parts.push(
      ``,
      `Persona: ${personaSummary.persona}`,
      `Total Steps Completed: ${personaSummary.totalSteps}`,
      `Results: ${personaSummary.results.pass} pass, ${personaSummary.results.friction} friction, ${personaSummary.results.fail} fail`,
      `Top Friction Point: ${personaSummary.topFrictionPoint}`,
      `Top Delight: ${personaSummary.topDelight}`
    );
  }

  if (config.analysisContext) {
    parts.push('', config.analysisContext);
  }

  return parts.join('\n');
}

/**
 * Build user message for screenshot analysis
 */
function buildScreenshotUserMessage(config: QuorumConfig, personaSummary: PersonaSummary | null): string {
  const parts = [
    `Analyze the UX of${personaSummary ? ` persona "${personaSummary.persona}"` : ' this user'} based on the screenshot grid below.`,
    ``,
  ];

  if (personaSummary) {
    parts.push(
      `**Test Results Context:**`,
      `Pass: ${personaSummary.results.pass}, Friction: ${personaSummary.results.friction}, Fail: ${personaSummary.results.fail}`,
      ``
    );
  }

  parts.push(
    `For each issue found, provide:`,
    `1. **Severity**: CRITICAL (blocks user), HIGH (significant friction), MEDIUM (noticeable issue), LOW (polish)`,
    `2. **Category**: Layout, Navigation, Content, Interaction, Visual, Accessibility, Performance`,
    `3. **Description**: What the issue is`,
    `4. **Location**: Where in the flow / which screen`,
    `5. **Recommendation**: How to fix it`,
    ``,
    `Also provide:`,
    `- **Overall UX Score**: 1-10 (10 = excellent)`,
    `- **Top 3 Friction Points**: Most impactful issues`,
    `- **Top 3 Strengths**: What works well`,
    `- **Would this persona return?**: Yes/No/Maybe with reasoning`
  );

  return parts.join('\n');
}
