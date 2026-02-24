import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env.local from the project root ──────────────────────────────────

function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(process.env.PROJECT_DIR || path.join(process.env.HOME || '', 'projects', 'momentumeq'), '.env.local');
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env.local not found — will fail below with a clear error
  }
  return vars;
}

const env = loadEnvFile();

// ─── Validation ──────────────────────────────────────────────────────────────

function requireEnv(key: string, envKey: string): string {
  const val = env[envKey];
  if (!val) {
    console.error(`Missing required env var: ${envKey}`);
    console.error(`Set it in .env.local or export it before running.`);
    process.exit(1);
  }
  return val;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const SUPABASE_URL = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
export const APP_URL = env.VITE_APP_URL || 'https://your-app.example.com';
export const TEST_PASSWORD = env.TEST_PASSWORD || 'ChangeMe!TestPassword123';

// ─── Email pattern ──────────────────────────────────────────────────────────

const EMAIL_PREFIX = env.TEST_EMAIL_PREFIX || 'testuser+';
const EMAIL_DOMAIN = env.TEST_EMAIL_DOMAIN || '@example.com';

export function personaEmail(personaId: string): string {
  return `${EMAIL_PREFIX}${personaId}${EMAIL_DOMAIN}`;
}
