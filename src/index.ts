/**
 * QuorumUX CLI — Entry Point
 *
 * Subcommands:
 *   init        Interactive project setup wizard
 *   run [opts]  Run the analysis pipeline (default)
 *   --help      Show help
 *
 * Orchestrates the 4-stage UX analysis pipeline:
 * Stage 1: Extract frames and generate grids from videos
 * Stage 2: Analyze screenshots with multiple AI models
 * Stage 2b: Analyze videos for temporal insights (parallel with Stage 2)
 * Stage 3: Synthesize analyses across models and test data
 * Stage 4: Generate reports and GitHub issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { QuorumUXConfig, PipelineOptions } from './types';
import * as logger from './utils/logger';
import { CostTracker, getPricing } from './utils/costs';
import { resolveApiKey } from './config/global';

// Import stage implementations
import { extractFrames } from './pipeline/extract-frames';
import { analyzeScreenshots } from './pipeline/analyze';
import { analyzeVideos } from './pipeline/analyze-video';
import { synthesize } from './pipeline/synthesize';
import { generateReport } from './pipeline/report';

/**
 * Main CLI entry point — detect subcommand then dispatch
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  // Handle subcommands
  if (subcommand === 'init') {
    const { runInit } = await import('./commands/init');
    await runInit();
    return;
  }

  // "run" is explicit but optional — strip it so parseArgs sees only flags
  const runArgs = subcommand === 'run' ? args.slice(1) : args;
  await runPipeline(runArgs);
}

/**
 * Run the analysis pipeline (original behavior)
 */
async function runPipeline(args: string[]): Promise<void> {
  try {
    const options = parseArgs(args);

    if (options.help) {
      printHelp();
      process.exit(0);
    }

    if (options.verbose) {
      logger.setVerbose(true);
    }

    // Load configuration
    const config = await loadConfig(options.config);
    logger.debug(`Loaded config from ${options.config}`);

    // Resolve run directory
    const runDir = resolveRunDir(options.runDir || '', config);
    logger.log(`Run directory: ${runDir}`);

    // Dry run mode
    if (options.dryRun) {
      dryRun(config, runDir, options);
      return;
    }

    // Validate API key using resolution chain
    const apiKey = resolveApiKey();
    if (!apiKey) {
      logger.error(
        'No OpenRouter API key found.\n' +
          '  Set OPENROUTER_API_KEY env var, add it to .env, or run `quorumux init` to configure.'
      );
      process.exit(1);
    }

    const startStage = options.startStage || 1;
    const tracker = new CostTracker();
    const pipelineStart = Date.now();

    logger.box([
      `QuorumUX UX Analysis Pipeline`,
      `Project: ${config.name}`,
      `Run: ${path.basename(runDir)}`,
      `Starting from stage ${startStage}`,
    ]);

    // Execute stages
    if (startStage <= 1) {
      tracker.stageStart('Stage 1');
      await extractFrames(config, runDir);
      tracker.stageEnd('Stage 1');
    }

    if (startStage <= 2) {
      // Stage 2 and 2b run in parallel
      const screenshotPromise = analyzeScreenshots(config, runDir, tracker);
      const videoPromise = !options.skipVideo
        ? analyzeVideos(config, runDir, tracker)
        : Promise.resolve();

      await Promise.all([screenshotPromise, videoPromise]);
    }

    if (startStage <= 3) {
      await synthesize(config, runDir, tracker);
    }

    if (startStage <= 4) {
      tracker.stageStart('Stage 4');
      await generateReport(config, runDir);
      tracker.stageEnd('Stage 4');
    }

    // Print summary
    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    printSummary(config, runDir, tracker, elapsed);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Dry run: scan artifacts and print what would happen without API calls
 */
function dryRun(config: QuorumUXConfig, runDir: string, options: PipelineOptions): void {
  logger.box([
    'DRY RUN — No API calls will be made',
    '',
    `Project: ${config.name}`,
    `Run: ${path.basename(runDir)}`,
  ]);

  const startStage = options.startStage || 1;

  // Scan artifacts
  const gridsDir = path.join(runDir, 'grids');
  const screenshotsDir = path.join(runDir, 'screenshots');
  const videosDir = path.join(runDir, 'videos');
  const summariesDir = path.join(runDir, 'summaries');
  const reportsDir = path.join(runDir, 'reports');

  // Count screenshots/personas
  let screenshotPersonas = 0;
  let screenshotCount = 0;
  if (fs.existsSync(screenshotsDir)) {
    const dirs = fs.readdirSync(screenshotsDir).filter(
      (d) => fs.statSync(path.join(screenshotsDir, d)).isDirectory()
    );
    screenshotPersonas = dirs.length;
    for (const d of dirs) {
      screenshotCount += fs.readdirSync(path.join(screenshotsDir, d)).filter((f) => f.endsWith('.png')).length;
    }
  }

  // Count grids
  let gridCount = 0;
  if (fs.existsSync(gridsDir)) {
    gridCount = fs.readdirSync(gridsDir).filter((f) => f.endsWith('-grid.jpg')).length;
  }

  // Count videos
  let videoCount = 0;
  let videoTotalMB = 0;
  const maxSizeMB = config.video?.maxSizeMB ?? 20;
  let videoSkipped = 0;
  if (fs.existsSync(videosDir)) {
    for (const personaId of fs.readdirSync(videosDir)) {
      const pDir = path.join(videosDir, personaId);
      if (!fs.statSync(pDir).isDirectory()) continue;
      for (const f of fs.readdirSync(pDir).filter((f) => f.endsWith('.webm'))) {
        const sizeMB = fs.statSync(path.join(pDir, f)).size / (1024 * 1024);
        if (sizeMB <= maxSizeMB) {
          videoCount++;
          videoTotalMB += sizeMB;
        } else {
          videoSkipped++;
        }
      }
    }
  }

  // Count summaries
  let summaryCount = 0;
  if (fs.existsSync(summariesDir)) {
    summaryCount = fs.readdirSync(summariesDir).filter((f) => f.endsWith('-summary.json')).length;
  }

  // Executive summary
  const hasExecSummary = fs.existsSync(path.join(runDir, 'executive-summary.md'));

  // Existing reports
  const hasScreenshotAnalyses = fs.existsSync(path.join(reportsDir, 'all-analyses-raw.json'));
  const hasVideoAnalyses = fs.existsSync(path.join(reportsDir, 'all-video-analyses-raw.json'));
  const hasSynthesis = fs.existsSync(path.join(reportsDir, 'synthesis.json'));

  // Print artifact inventory
  logger.stage('Artifact Inventory');
  logger.log(`  Screenshots: ${screenshotCount} files across ${screenshotPersonas} personas`);
  logger.log(`  Grids: ${gridCount} (${gridCount === 0 && startStage <= 1 ? 'will be generated in Stage 1' : 'ready'})`);
  logger.log(`  Videos: ${videoCount} eligible (${videoTotalMB.toFixed(0)}MB total)${videoSkipped > 0 ? `, ${videoSkipped} over size limit` : ''}`);
  logger.log(`  Summaries: ${summaryCount} persona summaries`);
  logger.log(`  Executive summary: ${hasExecSummary ? 'yes' : 'no'}`);
  logger.log('');

  if (hasScreenshotAnalyses) logger.log(`  Existing screenshot analyses: yes (will be overwritten if running Stage 2)`);
  if (hasVideoAnalyses) logger.log(`  Existing video analyses: yes (will be overwritten if running Stage 2b)`);
  if (hasSynthesis) logger.log(`  Existing synthesis: yes (will be overwritten if running Stage 3)`);
  if (hasScreenshotAnalyses || hasVideoAnalyses || hasSynthesis) logger.log('');

  // Print pipeline plan
  logger.stage('Pipeline Plan');

  if (startStage <= 1) {
    logger.log(`  Stage 1: Extract frames & generate grids`);
    logger.log(`    ${screenshotPersonas} personas → ${screenshotPersonas} grids`);
    logger.log(`    ${videoCount} videos → frame extraction at ${config.video?.frameRate ?? 1}fps`);
    logger.log('');
  }

  // Use grid count for API call estimation; if no grids yet, use screenshot persona count
  const effectiveGridCount = gridCount > 0 ? gridCount : screenshotPersonas;

  if (startStage <= 2) {
    // Print cost estimate
    const estimateLines = CostTracker.estimateDryRun(
      config.models.screenshot,
      config.models.video,
      config.models.synthesis,
      effectiveGridCount,
      videoCount,
      !!options.skipVideo
    );
    for (const line of estimateLines) {
      logger.log(`  ${line}`);
    }
  } else if (startStage >= 3) {
    const sp = getPricingDisplay(config.models.synthesis.id);
    logger.log(`  Stage 3 — Synthesis`);
    logger.log(`    1 API call`);
    logger.log(`    ${config.models.synthesis.name} (${config.models.synthesis.id}) — ${sp}`);
    logger.log(`    Input: ${hasScreenshotAnalyses ? 'existing' : 'missing'} screenshot analyses + ${hasVideoAnalyses ? 'existing' : 'missing'} video analyses`);
    logger.log(`    Estimated cost: ~$1.20`);
  }

  if (startStage <= 4) {
    logger.log('');
    logger.log(`  Stage 4: Report generation (no API calls)`);
    logger.log(`    Output: ux-analysis-report.md + github-issues.md`);
  }

  logger.log('');
  logger.log('  Run without --dry-run to execute.');
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): PipelineOptions & { help?: boolean } {
  const options: any = {
    config: './quorumux.config.ts',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help') {
      options.help = true;
    } else if (arg === '--config') {
      options.config = args[++i];
    } else if (arg === '--run-dir') {
      options.runDir = args[++i];
    } else if (arg === '--start-stage') {
      options.startStage = parseInt(args[++i], 10);
      if (isNaN(options.startStage) || options.startStage < 1 || options.startStage > 4) {
        throw new Error('--start-stage must be 1, 2, 3, or 4');
      }
    } else if (arg === '--skip-video') {
      options.skipVideo = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}. Run 'quorumux --help' for usage.`);
    }
  }

  return options;
}

/**
 * Load QuorumUXConfig via dynamic import
 */
async function loadConfig(configPath: string): Promise<QuorumUXConfig> {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}\n  Run 'quorumux init' to create one.`);
  }

  try {
    const module = await import(`file://${absolutePath}`);
    const config = module.default || module.config;

    if (!config) {
      throw new Error('Config file must export a default export or "config" named export');
    }

    return config as QuorumUXConfig;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Resolve run directory: use provided, auto-detect from config artifactsDir, or cwd
 */
function resolveRunDir(runDir: string, config: QuorumUXConfig): string {
  if (runDir && fs.existsSync(runDir)) {
    return path.resolve(runDir);
  }

  // Try config artifactsDir first
  const artifactsDir = path.resolve(config.artifactsDir);
  if (fs.existsSync(artifactsDir)) {
    const runs = fs.readdirSync(artifactsDir)
      .filter((name) => name.startsWith('run-') && fs.statSync(path.join(artifactsDir, name)).isDirectory())
      .sort()
      .reverse();

    if (runs.length > 0) {
      return path.join(artifactsDir, runs[0]);
    }
  }

  // Fallback to cwd
  const cwd = process.cwd();
  const entries = fs.readdirSync(cwd);
  const runDirs = entries
    .filter((name) => name.startsWith('run-') && fs.statSync(path.join(cwd, name)).isDirectory())
    .sort()
    .reverse();

  if (runDirs.length === 0) {
    throw new Error('No run directory found. Use --run-dir or set artifactsDir in config.');
  }

  return path.join(cwd, runDirs[0]);
}

function getPricingDisplay(modelId: string): string {
  const p = getPricing(modelId);
  return `$${p.input}/$${p.output} per 1M tok`;
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
QuorumUX — Multi-Model UX Analysis Pipeline

USAGE
  npx quorumux [command] [options]

COMMANDS
  init               Interactive project setup wizard
  run [options]       Run the analysis pipeline (default if no command given)

OPTIONS (for run)
  --config <path>    Path to quorumux.config.ts (default: ./quorumux.config.ts)
  --run-dir <path>   Specific run directory (auto-detects latest if omitted)
  --start-stage <n>  Stage to start from: 1, 2, 3, or 4 (default: 1)
  --skip-video       Skip Stage 2b video analysis
  --dry-run          Show what would run without making API calls
  --verbose          Verbose logging
  --help             Show this help message

ENVIRONMENT
  OPENROUTER_API_KEY  API key for OpenRouter (preferred).
                      Also reads from .env / .env.local or ~/.quorumux/config.json.

GETTING STARTED
  # Set up a new project interactively
  npx quorumux init

  # Preview what the pipeline will do and estimated cost
  npx quorumux --dry-run

  # Run full pipeline
  npx quorumux

  # Start from Stage 3 (skip frame extraction and analysis)
  npx quorumux --start-stage 3

  # Run without video analysis
  npx quorumux --skip-video
`);
}

/**
 * Print summary box with cost and timing
 */
function printSummary(config: QuorumUXConfig, runDir: string, tracker: CostTracker, elapsed: string): void {
  const reportsDir = path.join(runDir, 'reports');
  const uxReportPath = path.join(reportsDir, 'ux-analysis-report.md');
  const githubIssuesPath = path.join(reportsDir, 'github-issues.md');

  const lines = [
    'QUORUM PIPELINE COMPLETE',
    '',
    `Project: ${config.name}`,
    `Run: ${path.basename(runDir)}`,
    `Elapsed: ${elapsed}s`,
    '',
    'Artifacts:',
    `  ${uxReportPath}`,
    `  ${githubIssuesPath}`,
    ...tracker.formatSummary(),
  ];

  logger.box(lines);
}

// Run main
main();
