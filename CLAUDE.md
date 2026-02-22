# QuorumUX — Development Guide

## What This Is

Multi-model consensus UX analysis pipeline. Sends Playwright screenshots and video recordings to multiple AI vision models via OpenRouter, then synthesizes findings into a prioritized report.

## Quick Commands

```bash
npx tsx src/index.ts --dry-run          # Dev: preview pipeline plan
npx tsx src/index.ts                     # Dev: run full pipeline
npx tsx src/index.ts --start-stage 3     # Dev: resume from stage 3
npm run typecheck                        # Type check only
npm run build                            # Build to dist/
```

## Architecture

### Pipeline Stages

```
Stage 1: extract-frames.ts   → ffmpeg + ImageMagick (no API calls)
Stage 2: analyze.ts          → 3 screenshot models in parallel (per persona × per model)
Stage 2b: analyze-video.ts   → Gemini video analysis in parallel with Stage 2
Stage 3: synthesize.ts       → Opus synthesizes all Stage 2/2b output
Stage 4: report.ts           → Templating only (no API calls)
```

Stages 2 + 2b run via `Promise.all()` in `index.ts`. Within Stage 2, all persona × model combinations also run in parallel.

### Source Layout

```
src/
├── index.ts                 # CLI entry, arg parsing, pipeline orchestration
├── types.ts                 # All shared types (QuorumUXConfig, Synthesis, etc.)
├── commands/
│   └── init.ts              # `quorumux init` interactive wizard
├── config/
│   └── global.ts            # ~/.quorumux/config.json management, API key resolution
├── models/
│   └── openrouter.ts        # Single OpenRouter API adapter (callOpenRouter)
├── personas/
│   ├── archetypes.ts        # 10 persona archetype definitions
│   └── index.ts             # Archetype lookup + preset bundles
├── pipeline/
│   ├── extract-frames.ts    # Stage 1: ffmpeg frame extraction, ImageMagick grids
│   ├── analyze.ts           # Stage 2: screenshot analysis (multi-model)
│   ├── analyze-video.ts     # Stage 2b: video temporal analysis
│   ├── synthesize.ts        # Stage 3: cross-model synthesis
│   └── report.ts            # Stage 4: markdown report generation
└── utils/
    ├── costs.ts             # MODEL_PRICING map, CostTracker class
    ├── files.ts             # File system helpers
    ├── logger.ts            # Structured logger (log, error, stage, box, progress)
    └── prompt.ts            # Interactive CLI prompts (ask, select, confirm)
```

### Key Patterns

- **All AI calls go through `callOpenRouter()`** in `src/models/openrouter.ts`. Never use raw `fetch()` for AI calls.
- **OpenRouter message format**: System message goes in the `messages` array as `{ role: 'system', content: '...' }`. NOT in a body-level `system` field.
- **Image content**: `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }`
- **Video content**: Same `image_url` type with `data:video/webm;base64,...` (Gemini accepts this).
- **Config is `quorumux.config.ts`** — loaded via dynamic `import()` in `index.ts`.
- **API key resolution chain**: env var `OPENROUTER_API_KEY` → `.env`/`.env.local` → `~/.quorumux/config.json`. See `resolveApiKey()` in `config/global.ts`.
- **CostTracker** is optional — passed to pipeline stages for tracking but stages work without it.

### Type Exports

The public type is `QuorumUXConfig` (exported from `src/types.ts`). The npm package exports it from `quorum-ux` and `quorum-ux/types`.

### Persona Archetypes

10 built-in archetypes in `src/personas/archetypes.ts`. Preset bundles in `src/personas/index.ts`:
- `quick` (3): happy-path, mobile-first, accessibility
- `standard` (5): + speed-runner, novice
- `comprehensive` (8): + cautious-explorer, power-user, skeptic
- `full` (10): all archetypes

### Cost Tracking

`MODEL_PRICING` in `src/utils/costs.ts` maps model IDs to per-1M-token prices. Update when OpenRouter pricing changes. `CostTracker` records actual usage per stage and prints a summary.

## Conventions

- **Product name**: QuorumUX (one word, capitalized UX). CLI command is `quorumux`.
- **npm package**: `quorum-ux` (hyphenated, for npm).
- **Config file**: `quorumux.config.ts`
- **Global config dir**: `~/.quorumux/`
- **No test suite yet** — pipeline has been validated end-to-end against MomentumEQ test artifacts.
- **Stage outputs** go in `{runDir}/reports/` — not the project root.

## Gotchas

- SVGs in GitHub READMEs must use markdown `![](path)` syntax, NOT raw HTML `<img>` tags. GitHub's `/raw/` URLs redirect cross-origin and fail to load.
- SVG files must be valid XML — use `&#160;` not `&nbsp;` for non-breaking spaces.
- The `--start-stage` flag lets you re-run from any stage without redoing earlier work. Useful when iterating on synthesis prompts.
