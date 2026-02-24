import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ─── Desktop Context ────────────────────────────────────────────────────────

export async function createDesktopContext(
  artifactsDir: string,
  personaId: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const videoDir = path.join(artifactsDir, 'videos', personaId);
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });

  // Suppress onboarding tour
  await context.addInitScript(() => {
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('onboarding_tour_completed_')) return 'true';
      return origGet.call(this, key);
    };
  });

  const page = await context.newPage();
  return { context, page };
}

// ─── Mobile Context ─────────────────────────────────────────────────────────

export async function createMobileContext(
  artifactsDir: string,
  personaId: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const videoDir = path.join(artifactsDir, 'videos', `${personaId}-mobile`);
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 375, height: 667 } },
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    isMobile: true,
    hasTouch: true,
  });

  await context.addInitScript(() => {
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('onboarding_tour_completed_')) return 'true';
      return origGet.call(this, key);
    };
  });

  const page = await context.newPage();
  return { context, page };
}

// ─── Finalize ───────────────────────────────────────────────────────────────

export async function finishContext(
  context: BrowserContext,
  page: Page,
): Promise<string | null> {
  let videoPath: string | null = null;
  await page.close();
  const video = page.video();
  if (video) {
    videoPath = await video.path();
  }
  await context.close();
  return videoPath;
}
