import * as fs from 'fs';
import * as path from 'path';
import type { PersonaSummary } from './types.js';

export function savePersonaSummary(summary: PersonaSummary, artifactsDir: string): void {
  const dir = path.join(artifactsDir, 'summaries');
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${summary.personaId}-summary.json`);
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
}
