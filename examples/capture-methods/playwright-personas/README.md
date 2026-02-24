# Playwright Personas — Declarative Persona-Based Artifact Capture

Automated UX artifact capture using synthetic personas defined in JSON. Each persona walks through a real user journey in a headless Playwright browser, producing video recordings, checkpoint screenshots, and structured JSONL verdicts — all in the format QuorumUX expects.

## How It Works

1. **Personas** are JSON files describing a user journey as a sequence of typed steps
2. A **handler registry** maps step types (`login`, `create-goal`, `navigate-tab`, etc.) to TypeScript functions
3. The **runner** loads a persona, executes each step via its handler, and captures artifacts at every checkpoint
4. Output is **JSONL on stdout** for real-time progress, plus files on disk for QuorumUX analysis

This is a reference implementation from [MomentumEQ](https://momentumeq.app). The handlers are app-specific, but the **pattern** — declarative JSON steps, handler registry, checkpoint-based artifact capture — is reusable for any web app.

## QuorumUX Integration

The runner produces artifacts in the exact structure QuorumUX expects:

```
test-artifacts/
└── run-2026-02-24T15-00/
    ├── videos/
    │   └── P01-maria/
    │       └── desktop.webm              # Full browser recording
    ├── screenshots/
    │   └── P01-maria/
    │       ├── P01-maria-step01-PASS-login.png
    │       ├── P01-maria-step02-PASS-navigate-home.png
    │       └── P01-maria-step03-FRICTION-create-goal.png
    └── summaries/
        └── P01-maria-summary.json        # Structured results
```

After a run, point QuorumUX at the artifacts:

```bash
npx quorumux --run-dir ./test-artifacts/run-2026-02-24T15-00
```

## Setup

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Configure environment

The runner reads credentials from your project's `.env.local`. Required vars:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional overrides
VITE_APP_URL=https://your-app.example.com
TEST_PASSWORD=YourTestPassword123!
TEST_EMAIL_PREFIX=testuser+
TEST_EMAIL_DOMAIN=@example.com
```

### 3. Create test accounts

```bash
npx tsx helpers/account-manager.ts --ensure
```

## Usage

```bash
# Run a single persona
npx tsx runner.ts --persona P01-maria --run-id run-001 --artifacts-dir ./test-artifacts/run-001

# Output is JSONL on stdout:
# {"event":"checkpoint","personaId":"P01-maria","step":2,"label":"login","verdict":"PASS","durationMs":2341}
# {"event":"complete","personaId":"P01-maria","pass":14,"friction":2,"fail":0,"durationMs":45000}
```

## Architecture

```
runner.ts              # CLI entry point — loads persona, runs phases, writes summary
helpers/
  config.ts            # Environment config (reads .env.local, no hardcoded secrets)
  types.ts             # TypeScript types for personas, steps, verdicts, summaries
  browser.ts           # Playwright context factories (desktop 1280x720, mobile 375x667)
  checkpoint.ts        # Screenshot + JSONL event emitter
  summary.ts           # Summary JSON writer
  overlays.ts          # Modal/dialog dismissal helpers
  account-manager.ts   # Auth account CRUD for test personas
handlers/
  index.ts             # Handler registry (maps step types → handler functions)
  auth.ts              # Login/logout
  navigate.ts          # URL and tab navigation
  value-discovery.ts   # AI conversation + quick assessment
  goals.ts             # Goal creation
  habits.ts            # Habit creation + daily check-off
  coach.ts             # Coach bar, panel, conversation
  pages.ts             # Settings, network, legal, content assertions
  mobile.ts            # Mobile viewport checks, touch targets
  accessibility.ts     # Keyboard nav, ARIA audit, contrast, focus traps
  adversarial.ts       # XSS, SQL injection, oversized input, double-click guard
personas/
  P01-maria.json       # Career changer — happy path full lifecycle
  P02-derek.json       # Skeptic — minimal engagement
  P03-priya.json       # Overachiever — 5 goals, 15 habits
  P04-james.json       # Values explorer — deep AI discovery
  P05-aisha.json       # Mobile-only user (375px)
  P06-tom.json         # Returning user — day 1 + day 2
  P07-rachel.json      # B2B evaluator — enterprise features
  P08-marcus.json      # Accessibility — keyboard-only
  P09-sofia.json       # Security — adversarial input
  P10-linda.json       # Coach power user — deep coaching
templates/
  executive-summary.md # Template for aggregated run reports
```

### Reusable Core (adapt these)

| File | What it does | Reusable? |
|------|-------------|-----------|
| `runner.ts` | Loads persona JSON, iterates steps, calls handlers, writes summary | Yes — generic orchestrator |
| `helpers/browser.ts` | Creates Playwright contexts with video recording | Yes — any web app |
| `helpers/checkpoint.ts` | Screenshots + JSONL events at each step | Yes — any web app |
| `helpers/summary.ts` | Writes structured JSON summary to disk | Yes — any web app |
| `helpers/types.ts` | TypeScript types for the verdict/step/persona system | Yes — any web app |
| `helpers/config.ts` | Reads `.env.local`, exports config constants | Adapt env var names |
| `helpers/overlays.ts` | Dismisses modals/dialogs that block the flow | Adapt selectors |
| `handlers/*.ts` | App-specific actions (login, create goal, etc.) | Replace entirely |

### Writing Your Own Handlers

Each handler is a function with this signature:

```typescript
type HandlerFn = (
  page: Page,
  step: PersonaStep,
  state: RunState,
) => Promise<Verdict>;
```

Where `Verdict` is `'PASS' | 'FRICTION' | 'FAIL'`. Register handlers in `handlers/index.ts`:

```typescript
export const handlers: Record<string, HandlerFn> = {
  'login': handleLogin,
  'create-goal': handleCreateGoal,
  // Add your app's step types here
};
```

Then reference them in persona JSON:

```json
{
  "id": "P01-maria",
  "name": "Maria Santos",
  "phases": [
    {
      "name": "onboarding",
      "steps": [
        { "type": "login", "label": "sign-in" },
        { "type": "create-goal", "label": "first-goal", "data": { "title": "Learn TypeScript" } }
      ]
    }
  ]
}
```

## Artifacts Produced

| Artifact | Format | Purpose |
|----------|--------|---------|
| **Videos** | WebM (one per persona per viewport) | Full browser recording for QuorumUX video analysis |
| **Screenshots** | PNG (one per checkpoint) | Named `{persona}-step{N}-{verdict}-{label}.png` for QuorumUX screenshot analysis |
| **Summaries** | JSON (one per persona) | Pass/friction/fail counts, issues, flow scores — fed to QuorumUX as persona context |
| **JSONL events** | stdout | Real-time progress monitoring during the run |

## Verdict System

| Verdict | Meaning | QuorumUX Mapping |
|---------|---------|-----------------|
| `PASS` | Step completed as expected | Positive signal in persona summary |
| `FRICTION` | Step completed but with UX issues (slow, confusing, extra clicks) | Flags for model attention |
| `FAIL` | Step could not be completed | High-priority finding context |

Steps marked `criticalPath: true` abort the persona's run on FAIL.

## Personas

| ID | Name | Focus | Device |
|----|------|-------|--------|
| P01 | Maria Santos | Happy path — full lifecycle | Desktop + Mobile |
| P02 | Derek Washington | Skeptic — minimal engagement | Desktop |
| P03 | Priya Chakraborty | Overachiever — max goals & habits | Desktop |
| P04 | James Okafor | Values explorer — deep AI conversation | Desktop |
| P05 | Aisha Rahman | Mobile-only user | Mobile (375px) |
| P06 | Tom Brennan | Returning user — multi-session | Desktop |
| P07 | Rachel Kim | B2B evaluator — enterprise features | Desktop |
| P08 | Marcus Chen | Accessibility — keyboard-only navigation | Desktop |
| P09 | Sofia Reyes | Security — adversarial input testing | Desktop |
| P10 | Linda Okonkwo | Coach power user — deep coaching | Desktop |

These personas map to QuorumUX's [persona archetypes](../../../README.md#persona-archetypes): P01=Happy Path Hero, P02=Skeptical Evaluator, P05=Mobile-First User, P08=Accessibility User, etc.
