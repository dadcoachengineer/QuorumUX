/**
 * Quorum — Cost Tracking & Estimation
 *
 * Tracks actual token usage from OpenRouter responses, calculates costs
 * per stage, and provides dry-run estimates.
 */

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface ModelPricing {
  input: number;  // $ per 1M tokens
  output: number; // $ per 1M tokens
}

/**
 * OpenRouter model pricing, keyed by model ID prefix.
 * Prices as of Feb 2026 — update as needed.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic/claude-sonnet-4.6':   { input: 3,     output: 15 },
  'google/gemini-2.0-flash-001':   { input: 0.10,  output: 0.40 },
  'openai/gpt-4o-2024-11-20':     { input: 2.50,  output: 10 },
  'anthropic/claude-opus-4.5':    { input: 15,    output: 75 },
};

export function getPricing(modelId: string): ModelPricing {
  // Exact match first
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  // Prefix match (e.g. model ID with version suffix)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }
  // Unknown model — use conservative estimate
  return { input: 5, output: 15 };
}

function tokenCost(modelId: string, prompt: number, completion: number): number {
  const pricing = getPricing(modelId);
  return (prompt * pricing.input + completion * pricing.output) / 1_000_000;
}

// ─── Dry-run token estimates ─────────────────────────────────────────────────

/** Average tokens per API call type (rough estimates for cost projection) */
const ESTIMATES = {
  screenshot: { input: 5000, output: 2500 },
  video:      { input: 10000, output: 3500 },
  synthesis:  { input: 50000, output: 6000 },
};

// ─── Cost Tracker ────────────────────────────────────────────────────────────

interface UsageRecord {
  stage: string;
  modelId: string;
  prompt: number;
  completion: number;
}

interface StageTiming {
  start: number;
  end?: number;
}

export class CostTracker {
  private records: UsageRecord[] = [];
  private timings = new Map<string, StageTiming>();

  /** Record actual token usage from an API call */
  record(stage: string, modelId: string, usage?: { prompt: number; completion: number; total: number }): void {
    if (!usage) return;
    this.records.push({
      stage,
      modelId,
      prompt: usage.prompt,
      completion: usage.completion,
    });
  }

  /** Mark stage start for timing */
  stageStart(stage: string): void {
    this.timings.set(stage, { start: Date.now() });
  }

  /** Mark stage end for timing */
  stageEnd(stage: string): void {
    const timing = this.timings.get(stage);
    if (timing) timing.end = Date.now();
  }

  /** Get elapsed time string for a stage */
  private stageElapsed(stage: string): string {
    const timing = this.timings.get(stage);
    if (!timing || !timing.end) return '';
    const seconds = (timing.end - timing.start) / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  }

  /** Calculate cost for a specific stage */
  private stageCost(stage: string): number {
    return this.records
      .filter((r) => r.stage === stage)
      .reduce((sum, r) => sum + tokenCost(r.modelId, r.prompt, r.completion), 0);
  }

  /** Calculate total cost across all stages */
  totalCost(): number {
    return this.records.reduce((sum, r) => sum + tokenCost(r.modelId, r.prompt, r.completion), 0);
  }

  /** Total tokens across all stages */
  private totalTokens(): { prompt: number; completion: number } {
    return this.records.reduce(
      (acc, r) => ({ prompt: acc.prompt + r.prompt, completion: acc.completion + r.completion }),
      { prompt: 0, completion: 0 }
    );
  }

  /** Format cost summary lines for the completion box */
  formatSummary(): string[] {
    if (this.records.length === 0) return [];

    const lines: string[] = ['', 'Cost Breakdown:'];
    const stages = [...new Set(this.records.map((r) => r.stage))];

    for (const stage of stages) {
      const cost = this.stageCost(stage);
      const elapsed = this.stageElapsed(stage);
      const calls = this.records.filter((r) => r.stage === stage).length;
      const timeStr = elapsed ? ` (${elapsed})` : '';
      lines.push(`  ${stage}: $${cost.toFixed(4)} (${calls} API call${calls !== 1 ? 's' : ''})${timeStr}`);
    }

    const totals = this.totalTokens();
    const total = this.totalCost();
    lines.push('');
    lines.push(`Total: $${total.toFixed(4)} (${fmtTokens(totals.prompt)} in / ${fmtTokens(totals.completion)} out)`);

    return lines;
  }

  // ─── Dry-run estimation ──────────────────────────────────────────────────

  /** Estimate cost for a dry run without making API calls */
  static estimateDryRun(
    screenshotModels: Array<{ id: string; name: string }>,
    videoModel: { id: string; name: string },
    synthesisModel: { id: string; name: string },
    gridCount: number,
    videoCount: number,
    skipVideo: boolean
  ): string[] {
    const lines: string[] = [];

    // Screenshot analysis
    const ssCallCount = gridCount * screenshotModels.length;
    let ssCost = 0;
    for (const model of screenshotModels) {
      const cost = tokenCost(model.id, ESTIMATES.screenshot.input, ESTIMATES.screenshot.output) * gridCount;
      ssCost += cost;
    }
    lines.push(`Stage 2 — Screenshot Analysis`);
    lines.push(`  ${gridCount} grids x ${screenshotModels.length} models = ${ssCallCount} API calls`);
    for (const m of screenshotModels) {
      const pricing = getPricing(m.id);
      lines.push(`    ${m.name} (${m.id}) — $${pricing.input}/$${pricing.output} per 1M tok`);
    }
    lines.push(`  Estimated cost: ~$${ssCost.toFixed(4)}`);
    lines.push('');

    // Video analysis
    let vidCost = 0;
    if (!skipVideo && videoCount > 0) {
      vidCost = tokenCost(videoModel.id, ESTIMATES.video.input, ESTIMATES.video.output) * videoCount;
      lines.push(`Stage 2b — Video Analysis`);
      lines.push(`  ${videoCount} videos x 1 model = ${videoCount} API calls`);
      const vp = getPricing(videoModel.id);
      lines.push(`    ${videoModel.name} (${videoModel.id}) — $${vp.input}/$${vp.output} per 1M tok`);
      lines.push(`  Estimated cost: ~$${vidCost.toFixed(4)}`);
      lines.push('');
    } else if (skipVideo) {
      lines.push(`Stage 2b — Video Analysis (skipped)`);
      lines.push('');
    }

    // Synthesis
    const synCost = tokenCost(synthesisModel.id, ESTIMATES.synthesis.input, ESTIMATES.synthesis.output);
    lines.push(`Stage 3 — Synthesis`);
    lines.push(`  1 API call`);
    const sp = getPricing(synthesisModel.id);
    lines.push(`    ${synthesisModel.name} (${synthesisModel.id}) — $${sp.input}/$${sp.output} per 1M tok`);
    lines.push(`  Estimated cost: ~$${synCost.toFixed(4)}`);
    lines.push('');

    // Total
    const totalCalls = ssCallCount + (skipVideo ? 0 : videoCount) + 1;
    const totalCost = ssCost + vidCost + synCost;
    lines.push(`Total: ${totalCalls} API call${totalCalls !== 1 ? 's' : ''} — estimated ~$${totalCost.toFixed(4)}`);

    return lines;
  }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
