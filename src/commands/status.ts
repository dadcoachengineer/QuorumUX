/**
 * `quorumux status` — Project Diagnostic
 *
 * Lightweight status check (no API calls):
 * - Config file presence and validity
 * - API key availability (masked)
 * - Tool availability (ffmpeg, montage)
 * - Artifacts directory scan (run count, latest run, score/readiness)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as logger from '../utils/logger.js';
import { resolveApiKey } from '../config/global.js';
import { findLatestRun, loadJson } from '../utils/files.js';
import type { Synthesis } from '../types.js';

export async function runStatus(): Promise<void> {
  logger.box(['QuorumUX — Project Status']);
  console.log('');

  // 1. Config
  const configPath = path.resolve('./quorumux.config.ts');
  let config: any = null;
  if (fs.existsSync(configPath)) {
    logger.success(`Config: ${configPath}`);
    try {
      const mod = await import(`file://${configPath}`);
      config = mod.default || mod.config;
      logger.log(`    Project: ${config.name}`);
      logger.log(`    Domain: ${config.domain}`);
      logger.log(`    URL: ${config.appUrl}`);
    } catch (e) {
      logger.warn(`Config found but failed to load: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    logger.warn('Config: quorumux.config.ts not found — run `quorumux init`');
  }

  console.log('');

  // 2. API Key
  const apiKey = resolveApiKey();
  if (apiKey) {
    const masked = apiKey.length > 8
      ? apiKey.slice(0, 5) + '...' + apiKey.slice(-4)
      : '****';
    logger.success(`API key: ${masked}`);
  } else {
    logger.warn('API key: not found');
  }

  console.log('');

  // 3. Tools
  checkTool('ffmpeg', 'Frame extraction (Stage 1)');
  checkTool('montage', 'Grid generation (Stage 1)');

  console.log('');

  // 4. Artifacts
  if (config?.artifactsDir) {
    const artifactsDir = path.resolve(config.artifactsDir);
    if (fs.existsSync(artifactsDir)) {
      const runs = fs.readdirSync(artifactsDir)
        .filter((d) => d.startsWith('run-') && fs.statSync(path.join(artifactsDir, d)).isDirectory())
        .sort()
        .reverse();

      logger.log(`  Artifacts dir: ${artifactsDir}`);
      logger.log(`  Runs: ${runs.length}`);

      if (runs.length > 0) {
        const latestRun = runs[0];
        logger.log(`  Latest run: ${latestRun}`);

        // Check for synthesis
        const synthesisPath = path.join(artifactsDir, latestRun, 'reports', 'synthesis.json');
        const synthesis = loadJson<Synthesis>(synthesisPath);
        if (synthesis) {
          const score100 = synthesis.overallAssessment.uxScore;
          const score10 = (score100 / 10).toFixed(1);
          logger.log(`  UX Score: ${score100}/100 (${score10}/10)`);
          logger.log(`  Launch Readiness: ${synthesis.overallAssessment.launchReadiness}`);
          const totalIssues =
            synthesis.consensusIssues.length +
            synthesis.videoOnlyIssues.length +
            synthesis.modelUniqueIssues.length;
          logger.log(`  Issues: ${totalIssues} (${synthesis.consensusIssues.length} consensus, ${synthesis.videoOnlyIssues.length} video-only, ${synthesis.modelUniqueIssues.length} model-unique)`);
        }
      }
    } else {
      logger.warn(`Artifacts dir not found: ${artifactsDir}`);
    }
  } else {
    logger.log('  Artifacts dir: not configured');
  }

  console.log('');
}

function checkTool(name: string, purpose: string): void {
  try {
    execSync(`which ${name}`, { stdio: 'pipe' });
    logger.success(`${name}: available — ${purpose}`);
  } catch {
    logger.warn(`${name}: not found — ${purpose}`);
  }
}
