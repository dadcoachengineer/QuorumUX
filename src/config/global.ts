/**
 * Global Config Management (~/.quorum/config.json)
 *
 * Handles global settings that persist across projects:
 * - API key storage (env var preferred, global config as fallback)
 * - Default model configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { GlobalConfig } from '../types';

const QUORUM_DIR = path.join(process.env.HOME || '~', '.quorum');
const CONFIG_PATH = path.join(QUORUM_DIR, 'config.json');

/** Load global config from ~/.quorum/config.json. Returns empty config if not found. */
export function loadGlobalConfig(): GlobalConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as GlobalConfig;
  } catch {
    return {};
  }
}

/** Save global config to ~/.quorum/config.json. Creates ~/.quorum/ if needed. */
export function saveGlobalConfig(config: GlobalConfig): void {
  if (!fs.existsSync(QUORUM_DIR)) {
    fs.mkdirSync(QUORUM_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Resolve API key using the priority chain:
 * 1. OPENROUTER_API_KEY env var
 * 2. .env / .env.local in project dir
 * 3. ~/.quorum/config.json → apiKey
 *
 * Returns the key or undefined if not found anywhere.
 */
export function resolveApiKey(): string | undefined {
  // 1. Env var (highest priority)
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // 2. .env / .env.local in cwd
  const envKey = readEnvFile('.env.local') || readEnvFile('.env');
  if (envKey) {
    process.env.OPENROUTER_API_KEY = envKey;
    return envKey;
  }

  // 3. Global config
  const globalConfig = loadGlobalConfig();
  if (globalConfig.apiKey) {
    process.env.OPENROUTER_API_KEY = globalConfig.apiKey;
    return globalConfig.apiKey;
  }

  return undefined;
}

/** Read OPENROUTER_API_KEY from a dotenv file (simple parser, no deps) */
function readEnvFile(filename: string): string | undefined {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return undefined;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIndex).trim();
      if (key === 'OPENROUTER_API_KEY') {
        let value = trimmed.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return value || undefined;
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}
