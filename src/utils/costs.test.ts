import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, getPricing, CostTracker } from './costs.js';

describe('MODEL_PRICING', () => {
  it('has all 4 known models', () => {
    expect(Object.keys(MODEL_PRICING)).toHaveLength(4);
    expect(MODEL_PRICING['anthropic/claude-sonnet-4.6']).toBeDefined();
    expect(MODEL_PRICING['google/gemini-2.0-flash-001']).toBeDefined();
    expect(MODEL_PRICING['openai/gpt-4o-2024-11-20']).toBeDefined();
    expect(MODEL_PRICING['anthropic/claude-opus-4.5']).toBeDefined();
  });

  it('all prices are positive', () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });

  it('output price >= input price for all models', () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.output).toBeGreaterThanOrEqual(pricing.input);
    }
  });
});

describe('getPricing', () => {
  it('returns exact match', () => {
    const result = getPricing('anthropic/claude-sonnet-4.6');
    expect(result).toEqual({ input: 3, output: 15 });
  });

  it('returns prefix match', () => {
    const result = getPricing('anthropic/claude-sonnet-4.6:beta');
    expect(result).toEqual({ input: 3, output: 15 });
  });

  it('returns fallback for unknown model', () => {
    expect(getPricing('unknown/model-xyz')).toEqual({ input: 5, output: 15 });
  });
});

describe('CostTracker', () => {
  it('reports zero cost on fresh instance', () => {
    const tracker = new CostTracker();
    expect(tracker.totalCost()).toBe(0);
  });

  it('record accumulates cost', () => {
    const tracker = new CostTracker();
    tracker.record('Stage 2', 'anthropic/claude-sonnet-4.6', {
      prompt: 1_000_000,
      completion: 1_000_000,
      total: 2_000_000,
    });
    // cost = (1M * 3 + 1M * 15) / 1M = 18
    expect(tracker.totalCost()).toBe(18);
  });

  it('ignores undefined usage', () => {
    const tracker = new CostTracker();
    tracker.record('Stage 2', 'anthropic/claude-sonnet-4.6', undefined);
    expect(tracker.totalCost()).toBe(0);
  });

  it('formatSummary returns empty array when no records', () => {
    const tracker = new CostTracker();
    expect(tracker.formatSummary()).toEqual([]);
  });

  it('formatSummary includes stage names and totals after recording', () => {
    const tracker = new CostTracker();
    tracker.record('Stage 2', 'anthropic/claude-sonnet-4.6', {
      prompt: 100_000,
      completion: 50_000,
      total: 150_000,
    });
    const lines = tracker.formatSummary();
    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join('\n');
    expect(joined).toContain('Stage 2');
    expect(joined).toContain('Total');
  });
});

describe('CostTracker.estimateDryRun', () => {
  const screenshotModels = [
    { id: 'anthropic/claude-sonnet-4.6', name: 'claude' },
    { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
  ];
  const videoModel = { id: 'google/gemini-2.0-flash-001', name: 'gemini' };
  const synthesisModel = { id: 'anthropic/claude-opus-4.5', name: 'opus' };

  it('returns lines', () => {
    const lines = CostTracker.estimateDryRun(screenshotModels, videoModel, synthesisModel, 3, 2, false);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('contains stage names', () => {
    const lines = CostTracker.estimateDryRun(screenshotModels, videoModel, synthesisModel, 3, 2, false);
    const joined = lines.join('\n');
    expect(joined).toContain('Stage 2');
    expect(joined).toContain('Stage 2b');
    expect(joined).toContain('Stage 3');
  });

  it('skipVideo produces "skipped" line', () => {
    const lines = CostTracker.estimateDryRun(screenshotModels, videoModel, synthesisModel, 3, 2, true);
    const joined = lines.join('\n');
    expect(joined).toContain('skipped');
  });
});
