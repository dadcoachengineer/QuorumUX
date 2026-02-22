/**
 * QuorumUX — Structured Logger
 *
 * Simple logging with consistent formatting and optional verbose mode.
 */

let verbose = false;

export function setVerbose(v: boolean) {
  verbose = v;
}

export function log(message: string) {
  console.log(message);
}

export function debug(message: string) {
  if (verbose) {
    console.log(`  [debug] ${message}`);
  }
}

export function success(message: string) {
  console.log(`  ✓ ${message}`);
}

export function warn(message: string) {
  console.log(`  ⚠ ${message}`);
}

export function error(message: string) {
  console.error(`  ✗ ${message}`);
}

export function stage(name: string) {
  console.log(`\n━━━ ${name} ━━━\n`);
}

export function progress(current: number, total: number, message: string) {
  const pad = String(total).length;
  console.log(`  [${String(current).padStart(pad)}/${total}] ${message}`);
}

export function box(lines: string[]) {
  const maxLen = Math.max(...lines.map(l => l.length), 48);
  const border = '═'.repeat(maxLen + 2);

  console.log(`╔${border}╗`);
  for (const line of lines) {
    console.log(`║ ${line.padEnd(maxLen)} ║`);
  }
  console.log(`╚${border}╝`);
}
