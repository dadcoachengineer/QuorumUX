/**
 * QuorumUX Pipeline Stage 2b: Video Analysis
 *
 * Sends .webm videos to config.models.video via OpenRouter for temporal UX analysis.
 * Runs in parallel with Stage 2 screenshot analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import { QuorumUXConfig, VideoAnalysis } from '../types.js';
import { callOpenRouter } from '../models/openrouter.js';
import * as logger from '../utils/logger.js';
import { ensureDir, loadJson } from '../utils/files.js';
import { CostTracker } from '../utils/costs.js';
import { getArchetypeById } from '../personas/index.js';

export async function analyzeVideos(
  config: QuorumUXConfig,
  runDir: string,
  tracker?: CostTracker
): Promise<void> {
  logger.stage('Stage 2b: Video Analysis');
  tracker?.stageStart('Stage 2b');

  const videosDir = path.join(runDir, 'videos');
  const summariesDir = path.join(runDir, 'summaries');
  const reportsDir = path.join(runDir, 'reports');

  ensureDir(reportsDir);

  if (!fs.existsSync(videosDir)) {
    logger.warn('No videos/ directory found. Skipping video analysis.');
    tracker?.stageEnd('Stage 2b');
    return;
  }

  // Count total eligible videos for progress
  const maxSizeMB = config.video?.maxSizeMB ?? 20;
  const videoInventory: Array<{ personaId: string; file: string; path: string; sizeMB: number }> = [];

  for (const personaId of fs.readdirSync(videosDir)) {
    const personaVideosDir = path.join(videosDir, personaId);
    if (!fs.statSync(personaVideosDir).isDirectory()) continue;

    for (const file of fs.readdirSync(personaVideosDir).filter((f) => f.endsWith('.webm'))) {
      const videoPath = path.join(personaVideosDir, file);
      const sizeMB = fs.statSync(videoPath).size / (1024 * 1024);
      if (sizeMB <= maxSizeMB) {
        videoInventory.push({ personaId, file, path: videoPath, sizeMB });
      } else {
        logger.warn(`Skipping ${file} (${sizeMB.toFixed(1)}MB > ${maxSizeMB}MB limit)`);
      }
    }
  }

  if (videoInventory.length === 0) {
    logger.log('  No eligible videos found');
    tracker?.stageEnd('Stage 2b');
    return;
  }

  const analyses: VideoAnalysis[] = [];
  const personaAnalysesMap = new Map<string, VideoAnalysis[]>();

  for (let i = 0; i < videoInventory.length; i++) {
    const { personaId, file, path: videoPath, sizeMB } = videoInventory[i];
    logger.progress(i + 1, videoInventory.length, `${personaId} — ${file} (${sizeMB.toFixed(1)}MB)`);

    // Load persona summary for context
    const summaryPath = path.join(summariesDir, `${personaId}-summary.json`);
    const personaSummary = loadJson<any>(summaryPath);

    try {
      const response = await analyzeVideoWithModel(videoPath, config, personaSummary, personaId);

      tracker?.record('Stage 2b', config.models.video.id, response.usage);

      const videoAnalysis: VideoAnalysis = {
        persona: personaId,
        model: config.models.video.name,
        modelId: config.models.video.id,
        analysisType: 'video',
        videoPath: file,
        videoSizeMB: sizeMB,
        analysis: response.content,
      };

      analyses.push(videoAnalysis);
      if (!personaAnalysesMap.has(personaId)) personaAnalysesMap.set(personaId, []);
      personaAnalysesMap.get(personaId)!.push(videoAnalysis);

      logger.success(`${personaId} — ${file} complete`);
    } catch (err) {
      logger.error(`${personaId} — ${file}: ${err}`);

      analyses.push({
        persona: personaId,
        model: config.models.video.name,
        modelId: config.models.video.id,
        analysisType: 'video',
        videoPath: file,
        videoSizeMB: sizeMB,
        analysis: '',
        error: String(err),
      });
    }
  }

  // Write individual persona video analysis files
  for (const [personaId, personaAnalyses] of personaAnalysesMap) {
    const mdContent = formatVideoAnalysesForMarkdown(personaId, personaAnalyses, config);
    const mdPath = path.join(reportsDir, `video-analysis-${personaId}.md`);
    fs.writeFileSync(mdPath, mdContent);
  }

  // Write raw results
  const outputPath = path.join(reportsDir, 'all-video-analyses-raw.json');
  fs.writeFileSync(outputPath, JSON.stringify(analyses, null, 2));

  tracker?.stageEnd('Stage 2b');
  logger.success(`Video analysis complete. ${analyses.length} analyses written to ${path.basename(outputPath)}`);
}

/**
 * Send a video file to the model for analysis via OpenRouter
 */
async function analyzeVideoWithModel(
  videoPath: string,
  config: QuorumUXConfig,
  personaSummary: any | null,
  personaId?: string
) {
  const videoBuffer = fs.readFileSync(videoPath);
  const videoBase64 = videoBuffer.toString('base64');
  const mimeType = videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4';

  const systemPrompt = buildVideoSystemPrompt(config, personaId);
  const summaryContext = personaSummary
    ? `Pass: ${personaSummary.results?.pass}, Friction: ${personaSummary.results?.friction}, Fail: ${personaSummary.results?.fail}`
    : '';
  const userMessage = buildVideoUserMessage(config, path.basename(videoPath), summaryContext);

  return callOpenRouter({
    model: config.models.video.id,
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
              url: `data:${mimeType};base64,${videoBase64}`,
            },
          },
        ],
      },
    ],
    maxTokens: config.models.video.maxTokens || 4000,
    referer: config.appUrl,
    title: 'QuorumUX UX Analysis',
  });
}

/**
 * Build system prompt for video analysis
 */
function buildVideoSystemPrompt(config: QuorumUXConfig, personaId?: string): string {
  const parts = [
    `You are an expert UX analyst specializing in behavioral analysis from screen recordings.`,
    `You are reviewing recordings from ${config.name}, ${config.description}`,
    ``,
    `The platform flow is: ${config.userJourney}`,
    ``,
    `Focus on TEMPORAL signals that static screenshots cannot capture: hesitation, flow sequence,`,
    `interaction timing, loading delays, confusion patterns, and engagement depth.`,
  ];

  // Inject archetype behavior notes if this persona matches a known archetype
  if (personaId) {
    const archetype = getArchetypeById(personaId);
    if (archetype) {
      parts.push(
        ``,
        `**Archetype: ${archetype.name}**`,
        archetype.behaviorNotes
      );
      if (archetype.accessibilityNeeds?.length) {
        parts.push(`Accessibility needs: ${archetype.accessibilityNeeds.join(', ')}`);
      }
    }
  }

  if (config.synthesisContext) {
    parts.push('', config.synthesisContext);
  }

  return parts.join('\n');
}

/**
 * Build user message for video analysis
 */
function buildVideoUserMessage(config: QuorumUXConfig, videoFile: string, summaryContext: string): string {
  const parts = [
    `Analyze this screen recording of a persona testing ${config.name}.`,
    ``,
  ];

  if (summaryContext) {
    parts.push(`**Automated Test Context:**`, summaryContext, ``);
  }

  parts.push(
    `Provide a detailed temporal UX analysis:`,
    ``,
    `## 1. Flow Timeline`,
    `Map the user's journey with timestamps. For each screen/section visited, note:`,
    `- Timestamp range (MM:SS - MM:SS)`,
    `- What screen/section they're on`,
    `- Time spent on that section`,
    `- Any notable interactions`,
    ``,
    `## 2. Hesitation & Confusion Signals`,
    `Identify moments where the user:`,
    `- Pauses for >3 seconds before acting (with timestamp)`,
    `- Hovers over elements without clicking`,
    `- Scrolls up/down searching for something`,
    `- Backtracks to a previous screen`,
    `- Appears to re-read content`,
    ``,
    `## 3. Interaction Patterns`,
    `Note any:`,
    `- Rage clicks (rapid repeated clicks)`,
    `- Double-clicks on single-click targets`,
    `- Scroll-then-scroll-back patterns`,
    `- Typing and deleting (false starts)`,
    `- Attempts to interact with non-interactive elements`,
    ``,
    `## 4. Loading & Transition Quality`,
    `For each page transition or async operation:`,
    `- Was there a visible loading state?`,
    `- Duration of any loading (estimated)`,
    `- Any layout shifts or jank?`,
    `- Any flash of wrong content?`,
    ``,
    `## 5. Engagement Assessment`,
    `- Total session duration`,
    `- Time distribution across features (% of session per section)`,
    `- Engagement depth: Did they explore or just follow the script?`,
    `- Energy level: Did interactions speed up (engagement) or slow down (fatigue)?`,
    ``,
    `## 6. Temporal Friction Points`,
    `Issues that ONLY a video review would catch:`,
    `- List each with timestamp, description, and severity (CRITICAL/HIGH/MEDIUM/LOW)`,
    ``,
    `## 7. Overall Temporal UX Score: 1-10`,
    `Rate the smoothness of the experience as a continuous flow, not just individual screens.`
  );

  return parts.join('\n');
}

/**
 * Format video analyses into markdown for a persona report
 */
function formatVideoAnalysesForMarkdown(
  personaId: string,
  analyses: VideoAnalysis[],
  config: QuorumUXConfig
): string {
  const parts = [
    `# Video Analysis Report — ${personaId}`,
    ``,
    `**Project:** ${config.name}`,
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    ``,
    `## Summary`,
    ``,
    `This report contains temporal and behavioral analysis of ${analyses.length} video(s) captured during user testing.`,
    ``,
  ];

  for (let i = 0; i < analyses.length; i++) {
    const analysis = analyses[i];

    parts.push(
      `## Video ${i + 1}: ${analysis.videoPath}`,
      ``,
      `**Size:** ${analysis.videoSizeMB.toFixed(1)}MB`,
      `**Model:** ${analysis.model}`,
      ``,
      analysis.error ? `**Error:** ${analysis.error}` : analysis.analysis,
      ``
    );
  }

  parts.push(`---`, `*Generated by QuorumUX UX Analysis Pipeline*`);

  return parts.join('\n');
}
