import { describe, it, expect } from 'vitest';
import { parseArgs, validateConfig } from './index.js';

// ─── parseArgs ──────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('returns defaults with no args', () => {
    const result = parseArgs([]);
    expect(result.config).toBe('./quorumux.config.ts');
    expect(result.help).toBeUndefined();
    expect(result.dryRun).toBeUndefined();
    expect(result.verbose).toBeUndefined();
    expect(result.skipVideo).toBeUndefined();
    expect(result.startStage).toBeUndefined();
    expect(result.runDir).toBeUndefined();
  });

  it('parses --help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --verbose', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true);
  });

  it('parses --skip-video', () => {
    expect(parseArgs(['--skip-video']).skipVideo).toBe(true);
  });

  it('parses --config', () => {
    expect(parseArgs(['--config', 'my.config.ts']).config).toBe('my.config.ts');
  });

  it('parses --run-dir', () => {
    expect(parseArgs(['--run-dir', '/tmp/run']).runDir).toBe('/tmp/run');
  });

  it('parses --start-stage 1', () => {
    expect(parseArgs(['--start-stage', '1']).startStage).toBe(1);
  });

  it('parses --start-stage 4', () => {
    expect(parseArgs(['--start-stage', '4']).startStage).toBe(4);
  });

  it('throws on invalid start-stage', () => {
    expect(() => parseArgs(['--start-stage', '0'])).toThrow('--start-stage must be 1, 2, 3, or 4');
    expect(() => parseArgs(['--start-stage', '5'])).toThrow('--start-stage must be 1, 2, 3, or 4');
    expect(() => parseArgs(['--start-stage', 'abc'])).toThrow('--start-stage must be 1, 2, 3, or 4');
  });

  it('throws on unknown option', () => {
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown option: --bogus');
  });

  it('handles combined flags', () => {
    const result = parseArgs(['--dry-run', '--verbose', '--skip-video', '--start-stage', '3']);
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.skipVideo).toBe(true);
    expect(result.startStage).toBe(3);
  });
});

// ─── validateConfig ─────────────────────────────────────────────────────────

describe('validateConfig', () => {
  function validConfig() {
    return {
      name: 'Test Project',
      description: 'A test',
      domain: 'testing',
      appUrl: 'https://example.com',
      userJourney: 'Sign up and use',
      artifactsDir: './artifacts',
      models: {
        screenshot: [{ id: 'model/a', name: 'A' }],
        video: { id: 'model/v', name: 'V' },
        synthesis: { id: 'model/s', name: 'S' },
      },
    };
  }

  it('accepts a valid config', () => {
    expect(() => validateConfig(validConfig())).not.toThrow();
  });

  for (const field of ['name', 'description', 'domain', 'appUrl', 'userJourney', 'artifactsDir'] as const) {
    it(`rejects missing "${field}"`, () => {
      const config = validConfig();
      delete (config as any)[field];
      expect(() => validateConfig(config)).toThrow(`"${field}" must be a non-empty string`);
    });

    it(`rejects empty "${field}"`, () => {
      const config = validConfig();
      (config as any)[field] = '';
      expect(() => validateConfig(config)).toThrow(`"${field}" must be a non-empty string`);
    });
  }

  it('rejects whitespace-only string fields', () => {
    const config = validConfig();
    config.name = '   ';
    expect(() => validateConfig(config)).toThrow('"name" must be a non-empty string');
  });

  it('rejects missing models', () => {
    const config = validConfig();
    delete (config as any).models;
    expect(() => validateConfig(config)).toThrow('"models" is required');
  });

  it('rejects empty screenshot array', () => {
    const config = validConfig();
    config.models.screenshot = [];
    expect(() => validateConfig(config)).toThrow('"models.screenshot" must be an array with at least 1 entry');
  });

  it('rejects screenshot entry missing id or name', () => {
    const config = validConfig();
    config.models.screenshot = [{ id: '', name: '' }];
    expect(() => validateConfig(config)).toThrow('"models.screenshot[0]" must have "id" and "name"');
  });

  it('rejects video missing id or name', () => {
    const config = validConfig();
    config.models.video = { id: '', name: '' };
    expect(() => validateConfig(config)).toThrow('"models.video" must have "id" and "name"');
  });

  it('rejects synthesis missing id or name', () => {
    const config = validConfig();
    config.models.synthesis = { id: '', name: '' };
    expect(() => validateConfig(config)).toThrow('"models.synthesis" must have "id" and "name"');
  });

  it('collects multiple errors at once', () => {
    const config = { models: { screenshot: [] } };
    try {
      validateConfig(config);
      expect.unreachable('should have thrown');
    } catch (e: any) {
      // Should contain errors for all 6 required string fields + screenshot array + video + synthesis
      expect(e.message).toContain('"name"');
      expect(e.message).toContain('"description"');
      expect(e.message).toContain('"models.screenshot"');
    }
  });

  it('tolerates extra fields', () => {
    const config = { ...validConfig(), extraField: 'hello', another: 42 };
    expect(() => validateConfig(config)).not.toThrow();
  });
});
