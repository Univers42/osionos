---
name: quality
description: >-
  Run every strict quality gate and report PASS/FAIL/SKIP. Use when the user says "run quality", "check quality", "run the gate", or "/quality".
---


Args: the user's request

Run the full strict gate and report — the static half of "done" (see
`GEMINI.md section: quality-bar`). If `.agents/tools/quality.sh` is missing, stop and say so.

## Workflow

### Phase 1 — Run

- Execute `.agents/tools/quality.sh the user's request`.
- It is verify-only — it never writes. `--with-tests` adds the test suite,
  `--no-audit` skips the network audits.

### Phase 2 — Report

- Show the table as-is. Don't soften it: ❌ is a blocker, ⚪ is uncovered surface.
- For each ❌: name the `file:line` and the strict rule it breaks.
- For each ⚪ that matters (SAST, audit, a11y): name the tool to install.

### Phase 3 — Fix (only if asked)

- Fixing is the builder's job, under TDD. This command reports; it doesn't mutate the
  tree. If asked to fix, hand off to `the builder persona`.
