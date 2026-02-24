# Capture Methods

QuorumUX analyzes UX test artifacts — screenshots, video recordings, and structured summaries — produced by your test runner. This directory is a library of reference implementations showing different approaches to capturing those artifacts.

Each method produces output in the [artifact directory structure](../../README.md#artifact-directory-structure) that QuorumUX expects:

```
test-artifacts/
└── run-YYYY-MM-DDTHH-MM/
    ├── videos/{persona}/*.webm
    ├── screenshots/{persona}/*.png
    ├── summaries/{persona}-summary.json
    └── executive-summary.md
```

## Methods

| Method | Approach | Best For |
|--------|----------|----------|
| [**playwright-personas**](playwright-personas/) | Declarative JSON personas + TypeScript handler registry + Playwright | Apps with defined user journeys, regression testing across persona archetypes |

## Adding a New Method

1. Create a subdirectory named after the method (e.g., `cypress-visual/`, `manual-session-recorder/`)
2. Include a `README.md` documenting setup, architecture, and how artifacts are produced
3. Ensure output matches the QuorumUX artifact directory structure above
4. Add a row to the table in this file
