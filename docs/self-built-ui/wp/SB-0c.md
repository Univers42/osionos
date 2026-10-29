# SB-0c — Perf baseline of today's settings (self-built UI, phase S0)

Project: rebuild every settings section from the app's own blocks (design §11). This package records today's interaction costs so later packages can prove they stay within budget. It changes NO product code. It consumes SB-0a's `installParityStub` (merged before this package starts).

**OWNS:** `tests/e2e/perf/selfBuilt.spec.mjs` (new).
**MUST NOT TOUCH:** everything else, including `perfHarness.mjs` and `interactions.spec.mjs` (read them; reuse their exports).

**Commit message:** `test(perf): baseline of today's settings interactions`

### Task 3: Perf baseline (SB-0c)

**Files:**
- Create: `tests/e2e/perf/selfBuilt.spec.mjs`

**Interfaces:**
- Consumes: `PERF_USE`, `measureToPaint`, `measureFloor`, `writeReport` (`tests/e2e/perf/perfHarness.mjs`); `installParityStub` (Task 1); `openSettings`/`openSection`.
- Produces: report `test-results/perf/selfBuilt.json` with cases `openProfile`, `openPreferences`, `openDeveloper`, `toggleSwitch` (first switch in Preferences), `typeField` (profile display name), `revokeRow` (sessions stub).

- [ ] **Step 1: Write the spec**, mirroring `interactions.spec.mjs`:
  - targets `OPEN_TARGET = 50` and `EDIT_TARGET = 16`;
  - `BUDGET` per case;
  - a header comment for the measured numbers, in the same format as `interactions.spec.mjs:34-45`.
- [ ] **Step 2: Measure.** Run: `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e-perf tests/e2e/perf/selfBuilt.spec.mjs`. Expected: the report is written, and every case is PASS or FINDING with budget = p95 × 1.2.
- [ ] **Step 3: Record.** Write the p95, median and floor of each case into the header comment, then set `BUDGET` from them.
- [ ] **Step 4: Commit.** `git commit -m "test(perf): baseline of today's settings interactions"`

