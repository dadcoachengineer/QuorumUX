/**
 * QuorumUX — File System Utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RunArtifacts } from '../types.js';

/**
 * Find the most recent run-* directory in the artifacts dir.
 */
export function findLatestRun(artifactsDir: string): string | undefined {
  if (!fs.existsSync(artifactsDir)) return undefined;

  const runs = fs.readdirSync(artifactsDir)
    .filter(d => d.startsWith('run-') && fs.statSync(path.join(artifactsDir, d)).isDirectory())
    .sort()
    .reverse();

  return runs.length > 0 ? path.join(artifactsDir, runs[0]) : undefined;
}

/**
 * Build the RunArtifacts paths for a given run directory.
 */
export function resolveArtifacts(runDir: string): RunArtifacts {
  const runId = path.basename(runDir);

  return {
    runId,
    runDir,
    videosDir: path.join(runDir, 'videos'),
    screenshotsDir: path.join(runDir, 'screenshots'),
    summariesDir: path.join(runDir, 'summaries'),
    framesDir: path.join(runDir, 'frames'),
    gridsDir: path.join(runDir, 'grids'),
    diffsDir: path.join(runDir, 'diffs'),
    reportsDir: path.join(runDir, 'reports'),
  };
}

/**
 * Ensure a directory exists.
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Load a JSON file safely, returning null on failure.
 */
export function loadJson<T = any>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Load a text file safely, returning null on failure.
 */
export function loadText(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get persona IDs from a directory of subdirectories.
 */
export function getPersonasFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
    .sort();
}

/**
 * Get persona IDs from grid files.
 */
export function getPersonasFromGrids(gridsDir: string): string[] {
  if (!fs.existsSync(gridsDir)) return [];

  return fs.readdirSync(gridsDir)
    .filter(f => f.endsWith('-grid.jpg'))
    .map(f => f.replace('-grid.jpg', ''))
    .sort();
}
