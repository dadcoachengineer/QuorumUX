/**
 * `quorumux init` — Interactive Project Setup Wizard
 *
 * Walks the user through configuring a new project and generates quorumux.config.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ask, select, confirm, closePrompt } from '../utils/prompt.js';
import { resolveApiKey, loadGlobalConfig, saveGlobalConfig } from '../config/global.js';
import { ARCHETYPES, PERSONA_BUNDLES, getArchetypeSubset } from '../personas/index.js';
import { ModelConfig } from '../types.js';

const DOMAINS = [
  { label: 'Career Tech', value: 'career-tech' },
  { label: 'Fintech', value: 'fintech' },
  { label: 'Healthcare', value: 'healthcare' },
  { label: 'E-commerce', value: 'e-commerce' },
  { label: 'SaaS', value: 'saas' },
  { label: 'Social', value: 'social' },
  { label: 'Education', value: 'education' },
  { label: 'Other', value: 'other' },
] as const;

const TESTING_DEPTHS: Array<{
  label: string;
  value: 'fast' | 'balanced' | 'thorough';
  description: string;
  models: ModelConfig;
}> = [
  {
    label: 'Fast (~$1)',
    value: 'fast',
    description: '1 screenshot model, no video, Gemini synthesis',
    models: {
      screenshot: [{ id: 'google/gemini-2.0-flash-001', name: 'gemini' }],
      video: { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
      synthesis: { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
    },
  },
  {
    label: 'Balanced (~$4)',
    value: 'balanced',
    description: '3 screenshot models, video, Opus synthesis (recommended)',
    models: {
      screenshot: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'claude' },
        { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
        { id: 'openai/gpt-4o-2024-11-20', name: 'gpt4o' },
      ],
      video: { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
      synthesis: { id: 'anthropic/claude-opus-4.5', name: 'opus' },
    },
  },
  {
    label: 'Thorough (~$8)',
    value: 'thorough',
    description: '3 screenshot models (high token limits), video, Opus synthesis with extended analysis',
    models: {
      screenshot: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'claude', maxTokens: 5000 },
        { id: 'google/gemini-2.0-flash-001', name: 'gemini', maxTokens: 5000 },
        { id: 'openai/gpt-4o-2024-11-20', name: 'gpt4o', maxTokens: 5000 },
      ],
      video: { id: 'google/gemini-2.0-flash-001', name: 'gemini', maxTokens: 6000 },
      synthesis: { id: 'anthropic/claude-opus-4.5', name: 'opus', maxTokens: 12000 },
    },
  },
];

export async function runInit(): Promise<void> {
  console.log('\n  QuorumUX — Project Setup\n');

  try {
    // Step 1: API Key
    const apiKey = await resolveApiKeyStep();

    // Step 2: Project Basics
    const name = await ask('Project name');
    const description = await ask('One-line description');
    const domain = await select('What domain is your app in?', [...DOMAINS]);
    const appUrl = await ask('App URL (e.g. https://myapp.com)');

    // Step 3: User Journey
    const userJourney = await ask('Describe the primary user flow to test');

    // Step 4: Personas
    const personaIds = await selectPersonas();

    // Step 5: Testing Depth
    const depth = await select('Testing depth?', TESTING_DEPTHS);
    const models = TESTING_DEPTHS.find((d) => d.value === depth)!.models;

    // Step 6: Artifacts Directory
    const artifactsDir = await ask('Artifacts directory', './test-artifacts');

    // Step 7: Skip video?
    const skipVideo = depth === 'fast';

    // Generate config file
    const configContent = generateConfig({
      name,
      description,
      domain,
      appUrl,
      userJourney,
      artifactsDir,
      models,
      personaIds,
      skipVideo,
    });

    const configPath = path.join(process.cwd(), 'quorumux.config.ts');

    if (fs.existsSync(configPath)) {
      const overwrite = await confirm('quorumux.config.ts already exists. Overwrite?', false);
      if (!overwrite) {
        console.log('\n  Aborted. Existing config preserved.\n');
        return;
      }
    }

    fs.writeFileSync(configPath, configContent);

    console.log('\n  Config written to quorumux.config.ts');
    console.log(`  Selected ${personaIds.length} persona archetype(s): ${personaIds.join(', ')}`);
    console.log(`  Testing depth: ${depth}`);
    console.log(`\n  Next steps:`);
    console.log(`    1. Place test artifacts in ${artifactsDir}/`);
    console.log(`    2. Run: npx quorumux --dry-run`);
    console.log(`    3. Run: npx quorumux\n`);
  } finally {
    closePrompt();
  }
}

async function resolveApiKeyStep(): Promise<string> {
  const existing = resolveApiKey();
  if (existing) {
    console.log('  API key found.\n');
    return existing;
  }

  console.log('  No OpenRouter API key found.\n');
  console.log('  Get one at: https://openrouter.ai/keys\n');

  const key = await ask('Enter your OpenRouter API key');
  if (!key) {
    console.log('\n  No key provided. You can set OPENROUTER_API_KEY later.\n');
    return '';
  }

  const saveChoice = await select('Where should the key be stored?', [
    {
      label: 'Global config (~/.quorumux/config.json)',
      value: 'global' as const,
      description: 'Convenient but stored in plaintext',
    },
    {
      label: 'Show env var command (recommended)',
      value: 'env' as const,
      description: 'More secure, add to your shell profile',
    },
  ]);

  if (saveChoice === 'global') {
    const config = loadGlobalConfig();
    config.apiKey = key;
    saveGlobalConfig(config);
    process.env.OPENROUTER_API_KEY = key;
    console.log('\n  Saved to ~/.quorumux/config.json\n');
  } else {
    console.log(`\n  Add this to your shell profile (.zshrc, .bashrc, etc.):`);
    console.log(`    export OPENROUTER_API_KEY="${key}"\n`);
    process.env.OPENROUTER_API_KEY = key;
  }

  return key;
}

async function selectPersonas(): Promise<string[]> {
  const bundle = await select('Which persona set?', [
    { label: 'Quick (3)', value: 'quick' as const, description: 'happy-path, mobile-first, accessibility' },
    { label: 'Standard (5)', value: 'standard' as const, description: '+ speed-runner, novice' },
    {
      label: 'Comprehensive (8)',
      value: 'comprehensive' as const,
      description: '+ cautious-explorer, power-user, skeptic',
    },
    { label: 'Full (10)', value: 'full' as const, description: 'All archetypes' },
  ]);

  // "Custom" would be handled via the "Other" auto-option in a real interactive UI,
  // but for now bundles cover the main use cases

  const ids = PERSONA_BUNDLES[bundle as keyof typeof PERSONA_BUNDLES];
  // Validate they all exist
  getArchetypeSubset([...ids]);
  return [...ids];
}

interface ConfigInput {
  name: string;
  description: string;
  domain: string;
  appUrl: string;
  userJourney: string;
  artifactsDir: string;
  models: ModelConfig;
  personaIds: string[];
  skipVideo: boolean;
}

function generateConfig(input: ConfigInput): string {
  const modelSpecToString = (spec: { id: string; name: string; maxTokens?: number }, indent: string): string => {
    const parts = [`id: '${spec.id}'`, `name: '${spec.name}'`];
    if (spec.maxTokens) parts.push(`maxTokens: ${spec.maxTokens}`);
    return `${indent}{ ${parts.join(', ')} }`;
  };

  const screenshotModels = input.models.screenshot
    .map((m) => modelSpecToString(m, '      '))
    .join(',\n');

  const videoModel = modelSpecToString(input.models.video, '    ');
  const synthesisModel = modelSpecToString(input.models.synthesis, '    ');

  const personaArray = input.personaIds.map((id) => `'${id}'`).join(', ');

  return `import type { QuorumUXConfig } from './src/types';

/**
 * ${input.name} — QuorumUX Configuration
 *
 * Generated by \`quorumux init\`
 */
const config: QuorumUXConfig = {
  name: '${escapeStr(input.name)}',
  description: '${escapeStr(input.description)}',
  domain: '${escapeStr(input.domain)}',
  appUrl: '${escapeStr(input.appUrl)}',
  userJourney: '${escapeStr(input.userJourney)}',
  artifactsDir: '${escapeStr(input.artifactsDir)}',

  /** Persona archetypes selected during init */
  personas: [${personaArray}],

  models: {
    screenshot: [
${screenshotModels},
    ],
    video: ${videoModel},
    synthesis: ${synthesisModel},
  },

  video: {
    maxSizeMB: 20,
    frameRate: 1,
  },
};

export default config;
`;
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
