import { describe, it, expect } from 'vitest';
import { resolveArtifacts } from './files.js';

describe('resolveArtifacts', () => {
  const runDir = '/tmp/artifacts/run-2026-02-22T10-00';
  const result = resolveArtifacts(runDir);

  it('runId is basename of input', () => {
    expect(result.runId).toBe('run-2026-02-22T10-00');
  });

  it('runDir is preserved', () => {
    expect(result.runDir).toBe(runDir);
  });

  it('builds all 7 subdirectory paths', () => {
    expect(result.videosDir).toBe(`${runDir}/videos`);
    expect(result.screenshotsDir).toBe(`${runDir}/screenshots`);
    expect(result.summariesDir).toBe(`${runDir}/summaries`);
    expect(result.framesDir).toBe(`${runDir}/frames`);
    expect(result.gridsDir).toBe(`${runDir}/grids`);
    expect(result.diffsDir).toBe(`${runDir}/diffs`);
    expect(result.reportsDir).toBe(`${runDir}/reports`);
  });

  it('returns all 9 fields', () => {
    const keys = Object.keys(result);
    expect(keys).toHaveLength(9);
    expect(keys).toContain('runId');
    expect(keys).toContain('runDir');
    expect(keys).toContain('videosDir');
    expect(keys).toContain('screenshotsDir');
    expect(keys).toContain('summariesDir');
    expect(keys).toContain('framesDir');
    expect(keys).toContain('gridsDir');
    expect(keys).toContain('diffsDir');
    expect(keys).toContain('reportsDir');
  });
});
