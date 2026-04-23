# Tests

## Purpose

This folder contains automated test assets for browser E2E coverage.

Official runner now is native Playwright Test.
Legacy custom browser runner removed.

## Current Structure

```text
tests/
├── e2e/
│   ├── functional/   # Main user-facing browser flows
│   ├── persistence/  # Local persistence and refresh behavior
│   ├── smoke/        # Harness and rendering smoke coverage
│   └── support/      # Shared helpers for native Playwright registration
├── browser/
│   ├── core/         # Shared scenario primitives still consumed by E2E
│   ├── specs/        # Scenario definitions reused by tests/e2e/*.spec.mjs
│   ├── *.html|*.jsx  # Harness pages used by smoke coverage
│   └── COVERAGE_MATRIX.md
└── FUNCTIONALITIES.md
```

## Important Clarification

`tests/browser` is no longer execution entrypoint.
It still exists because `tests/e2e` imports shared scenario definitions from:

- `tests/browser/specs/*.mjs`
- `tests/browser/core/app.mjs`
- `tests/browser/core/scenario.mjs`
- harness files used by smoke tests

What was removed as legacy:

- `tests/browser/run.mjs`
- `tests/browser/ensure.mjs`
- `tests/browser/core/devServer.mjs`
- `package.json` script `test:e2e:legacy`

If shared scenarios are moved later into `tests/e2e/scenarios`, then `tests/browser` can disappear completely.

## How E2E Works

Execution flow:

1. `npx playwright test` reads `playwright.config.ts`.
2. Playwright starts Vite through `webServer`.
3. Playwright discovers specs under `tests/e2e`.
4. Each spec imports scenario arrays from `tests/browser/specs/*.mjs`.
5. `tests/e2e/support/scenarioTestUtils.mjs` wraps each scenario into native `test(...)`.
6. Scenario receives Playwright fixtures:
   - `page`
   - `context`
   - `browser`
   - `baseURL`
7. Assertions run inside native Playwright lifecycle with official reporters and artifacts.

## Test Domains

### `tests/e2e/functional`

Core editor behavior:

- slash menu
- markdown shortcuts
- indentation
- drag and drop
- inline toolbar
- media and assets
- context menu
- focus and editing behavior

### `tests/e2e/persistence`

Persistence behavior after refresh and offline/local flows.

### `tests/e2e/smoke`

Harness-level checks for rendering and non-editing coverage.

### `tests/e2e/support`

Utility layer that converts scenario objects into native Playwright tests and splits serial vs parallel scenarios.

## Official Commands

Primary commands:

- `npm ci`
- `npm run test:setup`
- `npm run test:doctor`
- `npm run test:e2e`
- `npm run test:e2e:serial`
- `npm run test:e2e:smoke`

Make targets:

- `make test`
- `make test-serial`
- `make test-smoke`
- `make test-setup`
- `make test-doctor`
- `make test-ci` (optional local CI-style run)

Quality gates stay separate:

- `make ci`
- `npm run test:quality`

Environment preparation stays separate:

- `npm run test:setup`

## Reproducible Local Flow

Official local browser flow is:

1. `nvm use` (repo pins Node 22 via `.nvmrc`)
2. `npm ci`
3. `npm run test:setup`
4. `npm run test:e2e`

What `test:setup` does:

- installs Playwright Chromium for repo-local Playwright version
- runs `npm run test:doctor`
- fails early if Node/deps/browsers/port are not ready

Use `npm run test:doctor` by itself when a teammate wants a fast preflight check before running the suite.

## Environment Invariants

Browser E2E now assumes these invariants on every machine:

- Playwright starts its own Vite server on `http://127.0.0.1:3004`
- suite does **not** reuse an already-running local dev server unless `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` is set explicitly
- Playwright server forces `VITE_API_URL=""`, so browser scenarios run in offline/seed mode instead of depending on whoever happens to have an API on `:4000`
- locale/timezone/color scheme are fixed in Playwright config to reduce host-specific rendering variance

This means the official suite should not depend on:

- your manually started `make dev` session
- a local API already running on `:4000`
- ad-hoc `.env` values
- leftover browser state from another developer workflow

## Setup Notes

Important local setup rules:

- official package manager is `npm`
- `npm ci` is preferred over `npm install` for deterministic local dependency trees
- `make dev` no longer installs `@univers42/ui-collection@latest` dynamically
- if Chromium system dependencies are missing on Linux, run `npx playwright install --with-deps chromium` or use `make test-docker`

## CI Execution

GitHub CI does not run browser E2E tests.

Browser E2E policy:

- developers run them locally with `make test`
- GitHub Actions runs only fast quality gates
- pushes and PR updates are not slowed down by Playwright/browser setup
- if browser evidence is needed, run tests locally and inspect:
  - `playwright-report/`
  - `test-results/`
  - `test-results/junit.xml`

## Architecture Decisions

### Why native Playwright Test

Because CI needs:

- native discovery
- reproducible workers
- traces, screenshots, video
- HTML and JUnit reports
- predictable `webServer` lifecycle

### Why `tests/browser` still exists

Because current migration reused scenario definitions instead of rewriting every test file from zero.
Today:

- Playwright owns execution
- `tests/browser/specs` owns scenario content

This is transitional but valid.

## Serial vs Parallel

Baseline command for stabilization:

- `npm run test:e2e:serial`

Policy:

1. Fix serial first.
2. Repeat serial until stable.
3. Raise workers progressively.
4. Keep scenario groups serial only when shared state or UI sequencing requires it.

## Files to Read First

If you need understand or modify E2E stack, start here:

1. `playwright.config.ts`
2. `tests/e2e/support/scenarioTestUtils.mjs`
3. `tests/e2e/functional/*.spec.mjs`
4. `tests/browser/specs/*.mjs`
5. `tests/browser/core/app.mjs`
6. `tests/FUNCTIONALITIES.md`

## Maintenance Rules

- Do not reintroduce custom runner.
- Do not hide failures with permissive shell targets.
- Do not mix browser E2E with lint/typecheck/audit in same command.
- Prefer stable locators and `data-testid`.
- Prefer state-based waits over time-based waits.
- Keep CI command strict and artifact-friendly.
- Keep browser execution local unless team later decides to restore a dedicated workflow.
