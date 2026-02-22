/**
 * QuorumUX Pipeline Stage 1: Extract Frames
 *
 * Uses ffmpeg for video frame extraction at configurable fps.
 * Uses ImageMagick montage for screenshot grid creation.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { QuorumUXConfig } from '../types';
import * as logger from '../utils/logger';
import { ensureDir } from '../utils/files';

export async function extractFrames(config: QuorumUXConfig, runDir: string): Promise<void> {
  logger.stage('Stage 1: Frame Extraction & Grid Generation');

  const framesDir = path.join(runDir, 'frames');
  const gridsDir = path.join(runDir, 'grids');
  const videosDir = path.join(runDir, 'videos');
  const screenshotsDir = path.join(runDir, 'screenshots');

  ensureDir(framesDir);
  ensureDir(gridsDir);

  // Extract frames from videos
  if (fs.existsSync(videosDir)) {
    await extractVideoFrames(videosDir, framesDir, config);
  } else {
    logger.warn('No videos/ directory found, skipping video frame extraction');
  }

  // Generate screenshot grids
  if (fs.existsSync(screenshotsDir)) {
    await generateScreenshotGrids(screenshotsDir, gridsDir);
  } else {
    logger.warn('No screenshots/ directory found, skipping grid generation');
  }

  logger.success('Frame extraction and grid generation complete');
}

/**
 * Extract frames from all videos in subdirectories (one per persona)
 */
async function extractVideoFrames(
  videosDir: string,
  framesDir: string,
  config: QuorumUXConfig
): Promise<void> {
  logger.log('  Extracting video frames...');

  const frameRate = config.video?.frameRate ?? 1;
  const personaDirs = fs.readdirSync(videosDir);

  for (const personaId of personaDirs) {
    const personaVideosDir = path.join(videosDir, personaId);
    const personaFramesDir = path.join(framesDir, personaId);

    if (!fs.statSync(personaVideosDir).isDirectory()) {
      continue;
    }

    ensureDir(personaFramesDir);

    const videoFiles = fs.readdirSync(personaVideosDir).filter((f) => f.endsWith('.webm'));

    for (const videoFile of videoFiles) {
      const videoPath = path.join(personaVideosDir, videoFile);
      const videoName = path.parse(videoFile).name;

      try {
        logger.debug(`Extracting frames from ${personaId}/${videoFile} at ${frameRate}fps`);

        execSync(
          `ffmpeg -i "${videoPath}" -vf fps=${frameRate} "${personaFramesDir}/frame-%04d.jpg" -y 2>/dev/null`,
          { stdio: 'pipe' }
        );

        logger.success(`Extracted frames for ${videoName}`);
      } catch (err) {
        logger.error(`Failed to extract frames from ${videoFile}: ${err}`);
      }
    }
  }

  logger.success('Video frame extraction complete');
}

/**
 * Generate screenshot grids using ImageMagick montage
 */
async function generateScreenshotGrids(
  screenshotsDir: string,
  gridsDir: string
): Promise<void> {
  logger.log('  Generating screenshot grids...');

  const personaDirs = fs.readdirSync(screenshotsDir);

  for (const personaId of personaDirs) {
    const personaScreenshotsDir = path.join(screenshotsDir, personaId);

    if (!fs.statSync(personaScreenshotsDir).isDirectory()) {
      continue;
    }

    const screenshots = fs.readdirSync(personaScreenshotsDir).filter((f) => f.endsWith('.png'));

    if (screenshots.length === 0) {
      logger.debug(`No screenshots found for ${personaId}, skipping grid generation`);
      continue;
    }

    const gridPath = path.join(gridsDir, `${personaId}-grid.jpg`);
    const screenshotPaths = screenshots
      .sort()
      .map((f) => path.join(personaScreenshotsDir, f));

    try {
      logger.debug(`Creating montage for ${personaId} (${screenshots.length} screenshots)`);

      const montageCmd = [
        'montage',
        screenshotPaths.map((p) => `"${p}"`).join(' '),
        '-geometry', '640x360+4+4',
        '-tile', '3x',
        '-background', "'#1a1a2e'",
        '-border', '2',
        '-bordercolor', "'#333'",
        `"${gridPath}"`,
      ].join(' ');

      execSync(montageCmd, { stdio: 'pipe', shell: '/bin/bash' });

      logger.success(`Generated grid: ${path.basename(gridPath)}`);
    } catch (err) {
      logger.error(`Failed to generate grid for ${personaId}: ${err}`);
    }
  }

  logger.success('Screenshot grid generation complete');
}
