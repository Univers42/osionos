# Project Rules — Deal with the Devil

These rules are always active. They shape every task.


# Risk — engineer the decision before you write the code

The sharpest failure mode is a fast, plausible answer to an under-thought decision. The fix is
a gate: before risky work turns into code, it faces the `devil` (the risk magistrate), who rules
on it. Code-correctness gates (`quality-bar`, TDD) come *after* — they can't save a wrong decision.

## When the verdict is MANDATORY

Route the plan through `devil` (or the `/deal` workflow) before acting when it is:

- **Irreversible** — a deploy, delete, data migration, publish, force-push, key/secret rotation.
- **Security-sensitive** — auth, access control, crypto, secrets, anything touching untrusted input.
- **Data / schema** — a migration, a destructive query, a format change, a backfill.
- **Public surface** — a shipped API, a contract, a shared library others depend on.
- **Concurrency** — shared state, locks, async ordering, anything with a race.
- **Wide blast** — touches many modules/files, or sits on a hot path.

Trivial, reversible, local work skips the gate — the devil is a tribunal, not a tollbooth. When
unsure whether a change qualifies: it qualifies.

## How risk is scored

The devil scores four axes 1–5 and names the worst (see `the devil persona`): blast radius ·
reversibility · cost on failure · confidence (unverified assumptions).

## The verdict is the gate

- **BLOCK** stops the work. Resolve what it names, then re-submit — don't route around it.
- **PROCEED-WITH-CONDITIONS** — the conditions become acceptance criteria the `builder` must meet.
- **PROCEED** — act.
- UNKNOWN = FAIL: an unproven safety claim rules as BLOCK, not PROCEED.

## Externalize before you rule

A plan can't be judged while it's in your head. Before the verdict, write down the assumptions,
the inputs / edge cases, the failure modes, and what you DON'T know. Half the under-thinking dies
the moment it's on the page.

---


# Library-first — extract before you duplicate

The smallest, fastest codebase is the one where each capability exists once.
Before adding feature code, build the reusable primitive; the feature is then thin
glue over it.

## The discipline

- **Reuse before write.** A primitive that exists is used, not re-implemented.
  Search first (`rg`, the cached `codemap`) — assume it already exists.
- **Extract before the second copy.** The first time you would paste a block, stop:
  lift it into the library, test it once, call it twice.
- **The library is tested in isolation.** A primitive ships with its own test,
  independent of any caller. Callers trust it; they don't re-test it.
- **Features are glue.** A feature wires tested primitives together. If a feature
  function exceeds the tech line limit, a primitive is hiding inside it — extract it.

## Where the library lives

- One home per concern, named for behavior (`tokens/`, `pagination/` — not `utils/`).
- `utils` / `helpers` / `misc` are not a library, they are a junk drawer. Name the concern.
- Domain primitives carry zero infrastructure imports (see `the architect persona`).

## Find the redundancy with tools, not eyes

- `.agents/tools/dupes.sh` lists repeated blocks — each is an extraction candidate.
- `.agents/tools/codemap.sh` shows where a symbol already lives before you add another.
- Run them; act on them. A duplication candidate left in place is a decision to
  maintain two copies forever.

## The bar

- Two functions that change for the same reason are one function in the wrong place.
- Deletion beats addition — the best change removes a copy and adds a call.
- Nothing is lost, everything transforms: every block worth pasting is worth a name.

---


# Prompt contract — facts in, evidence out

The best prompt is not a longer prompt — it is a grounded one: facts gathered
before action, results returned as proof. This binds every command, skill,
workflow, and agent here. `AGENTS.md` applies the same discipline to subagents.

## Input — before you act

- **Facts first.** Run `.agents/tools/digest.sh` (or the relevant tool) before
  forming a plan. Decide from the digest, not from a guess about the tree.
- **Read by query.** `rg` / `jq` / the cached `codemap` return the conclusion.
  Never slurp a whole file or tree to answer what a query answers.
- **Restate as a contract.** Echo the task back as inputs → outputs → done-when.
  If the done-when is unstateable, the request is underspecified — sharpen it
  (run `/prompt`) before writing code.
- **Surface unknowns; never paper over them.** A missing fact is named, not assumed.

## Output — what you return

- **Evidence, not adjectives.** Every claim cites proof: a command and its output,
  or `file:line`. "Works" / "fast" / "done" without proof is not a result.
- **Structured for action.** When the caller will act on the result, return a table
  or list it can consume — not prose it must re-parse.
- **No half-states.** Finish to a gate or revert to the last green. Never hand back
  a red test, a partial wiring, or a `TODO` without a linked issue.
- **Minimal.** Say what changed and how to reproduce it. For code comments and docs,
  `minimalism-markers.md` governs — this rule doesn't restate it.

## Why this is the best prompt

A request grounded in tool output and returned as evidence is reproducible: the
next person re-runs the command and sees the same fact. That is the ceiling of
prompt quality — not eloquence, reproducibility.

---


# Quality bar — strictest mode, every layer, one command

Per-language linters and formatters live in `rules/refactor-<tech>.md` under
"After refactoring". This rule adds the layers that apply to EVERY language and
names the one command that runs them all: `.agents/tools/quality.sh`.

## The bar

- **Strictest flags, always.** `--max-warnings 0`, `-D warnings`,
  `-Wall -Wextra -Werror`, `--check` (a gate never auto-writes). A warning is an
  error. There is no "warning budget".
- **Zero suppressions without a linked issue.** Every `eslint-disable`, `//nolint`,
  `#[allow(...)]`, `# noqa`, norm waiver carries an issue link and a one-line reason.
  An unexplained suppression is a defect.
- **Skipped ≠ passed.** A gate that didn't run is uncovered surface. Install the
  tool or state the gap — never assume green.

## The layers (canonical order — fail early, fix cheap)

1. **Format** — `prettier`, `gofmt`/`gofumpt`, `rustfmt`, `ruff format`, `shfmt`,
   `clang-format`. Check-mode in the gate; the formatter owns style, not humans.
2. **Lint** — `eslint`, `golangci-lint`, `clippy`, `ruff`, `shellcheck`, `cppcheck`.
3. **Types** — `tsc --noEmit`, and the language's strongest type flags.
4. **Static analysis (SAST)** — `semgrep`, **SonarCloud** / `sonar-scanner`, CodeQL.
   These catch what linters miss: taint, cyclomatic complexity, security smells.
5. **Supply-chain audit** — `npm audit`, `cargo audit`, `govulncheck`, `pip-audit`,
   `osv-scanner`, `trivy`. A known-vuln dependency fails the gate.
6. **Accessibility (web)** — `eslint-plugin-jsx-a11y` plus an `axe` / Lighthouse pass
   for any rendered UI. Inaccessible is not done.

## Done means green

- `.agents/tools/quality.sh` exits 0 with every relevant gate run — the static half
  of "done". The dynamic half is tests in the project's framework
  (`rules/test-frameworks.md`, `the builder persona`).
- Manual security reasoning (`the security persona`) complements SAST — neither
  replaces the other. Run both.

---


# Data structures, algorithms, memory

Correctness first, then the right structure, then the right algorithm. The data
structure is a design decision made before the code, not discovered after.
`minimalism-ladder.md` decides WHEN speed beats simplicity; this rule decides WHAT
to reach for.

## Pick the structure for the access pattern

- **Sequential / index** → array / slice / `Vec`. Contiguous, cache-friendly. The default.
- **Key lookup** → hash map — O(1) average. But for small N (< ~20) a flat slice scan
  is faster and allocates less.
- **Membership** → set. Not a map-to-bool, not a list with `contains`.
- **Work at the ends** → queue / deque / ring buffer. Not shifting an array.
- **Always need the extreme** → heap / priority queue. Not re-sorting each time.
- **Ordered range scan** → balanced tree, or sorted slice + binary search.
- **Prefix / autocomplete** → trie. **Relations** → graph + the right traversal.
- Name the access pattern first; the structure follows from it.

## Pick the algorithm by complexity

- State the Big-O before coding. If a lower rung of the ladder is worse asymptotically
  on data that grows, take the better algorithm.
- No O(n²) on unbounded input. No linear scan where the data is already indexed.
- Sort once and reuse the order; don't re-sort in a loop.
- Measure before micro-optimizing (`the benchmarker persona`) — but never ship a
  known-worse complexity class on growing data.

## Memory — pool the high-churn allocations

- **Pool what churns.** Per-request buffers, parse scratch, short-lived high-turnover
  objects → a pool, not a fresh allocation each time.
  - Go: `sync.Pool` (see `rules/refactor-go.md`). C: arena / freelist / slab.
    TS/JS: reuse buffers and `TypedArray`s; reuse objects on hot paths.
- **Size up front.** Known capacity → pre-allocate (`make([]T, 0, n)`,
  `Vec::with_capacity`, geometric `realloc`). Growing by one in a hot loop is a bug.
- **Every allocation has an owner and a free path** (already in `refactor-common.md`).
- **Rust is the exception.** Ownership, borrowing, and RAII manage lifetimes — do not
  hand-roll pools to fight the borrow checker. Restructure lifetimes first; reach for
  an arena (`bumpalo`) only when a profiler proves allocation is the bottleneck.

---


# Test frameworks — detect, then use the right one

A test proves something only when it runs in the project's real framework and runner.
Don't hand-roll what `gtest`, `pytest`, or `vitest` already do. Build and verify WITH
the framework — "passing" means its runner reports pass.

## Discipline

- **Detect first.** Run `.agents/tools/facts.sh` (it reports the detected framework)
  or read the manifest. Match the framework AND the existing test style.
- **One framework per language per repo.** If one is configured, use it. A second one
  fragments the suite — don't add it.
- **Don't reinvent.** Never hand-roll an assertion, mock, or runner the framework ships.
  Use its fixtures, matchers, and parameterization.
- **None yet?** Pick the canonical default for the stack (first column below) — the
  lowest-friction standard one — and say why in one line.
- **It must run in CI** via the project's test command (`facts.sh`), not only locally.

## Reference (canonical default first)

| Lang | Unit / runner | Property-based | Mock | E2E / integration | Bench |
|---|---|---|---|---|---|
| **C** | Unity, Criterion, CMocka, Check | theft | CMocka, FFF | — | custom + `clock_gettime` |
| **C++** | GoogleTest (+GoogleMock), Catch2, doctest | rapidcheck | GoogleMock, trompeloeil | — | Google Benchmark, nanobench |
| **Go** | `testing` (stdlib, table-driven) + testify | `testing/quick`, rapid, gopter | gomock (`go.uber.org/mock`), testify/mock | `httptest`, testcontainers-go | `testing.B` + benchstat |
| **Rust** | built-in `cargo test` (+ rstest fixtures) | proptest, quickcheck | mockall | `tests/` integration, doctests | criterion, divan |
| **TS / JS** | Vitest (new projects) / Jest (existing); `node:test` zero-dep | fast-check | `vi.mock`/`jest.mock`, msw | Playwright (preferred) / Cypress | Vitest bench, tinybench |
| **Python** | pytest (default), unittest (stdlib) | Hypothesis | `unittest.mock`, pytest-mock | Playwright-python, Selenium | pytest-benchmark |
| **Shell** | Bats-core (bash), shUnit2 (POSIX), ShellSpec (BDD) | — | shellmock | Bats + the real CLI | `hyperfine` |

Also: Java → JUnit 5 + Mockito + AssertJ · C#/.NET → xUnit/NUnit + Moq · Ruby →
RSpec/Minitest · PHP → PHPUnit/Pest · Swift → Swift Testing/XCTest · Elixir → ExUnit.

## Pair with the matching agent

- `the builder persona` writes tests in the detected framework as the RED step of TDD.
- The `write-test` skill generates coverage in that framework, in its idiom.
- Property-based tests count toward "done" (`quality-bar.md`) for anything that parses
  external input — generate inputs, don't only hand-pick examples.

---


# Run safely — verify first, never hang

Two failure modes waste the most time: building against an unconfigured environment,
and waiting forever on a stuck process. Both are preventable. Both have a tool.

## Verify before you build

- Run `.agents/tools/preflight.sh` before any compile / build / run. Missing `.env`,
  secrets, or credentials fail fast and clearly — not ten minutes into a build.
- Config is checked, never assumed. A required var that's unset is a blocker, not a warning.
- Never print secret values — names and set/unset only (preflight already redacts).

## Never wait forever

- Wrap every build, test, install, migration, or deploy in `.agents/tools/watch.sh`.
  It enforces a hard timeout AND an idle timeout, so a hang is detected and killed —
  the agent moves on with a clear reason; it does not stall the session.
- A watchdog kill (exit 124) is a fact to act on: the command hung or overran. Diagnose
  it; don't blindly re-run.
- Tune `--idle` for genuinely silent long tasks; never wrap an interactive prompt.

## Order of operations

`preflight` → fix config → build/test under `watch` → `quality.sh` gate. Verifying late
is the same as not verifying.

---


# Refactoring — Common Ground (craft discipline)

## Structural invariants

- One function does one thing. If you need "and" to describe it, split it.
- No function exceeds the technology's line limit (see tech-specific rules)
- No file exceeds 300 lines. If it does, it's at least two modules.
- No more than 4 parameters per function. Beyond that, use a struct/object.
- Max nesting depth: 3 levels. If deeper, extract a helper.
- No dead code. No commented-out code. No TODO without a linked issue.

## Naming

- Names describe behavior, not implementation
- No single-letter names outside loop indices and math formulas
- Consistent vocabulary — don't mix "fetch/get/retrieve" in the same codebase
- Acronyms follow the tech convention (e.g., HTTP in Go, http in Rust)

## Error handling

- Every fallible operation is handled explicitly
- No silent swallows — log, propagate, or convert, never ignore
- Error messages include: what failed, why, what the caller can do

## Memory and resources

- Every allocation has a clear owner and a clear free path
- No leaks — memory, file descriptors, goroutines, subscriptions, all of it
- Validate with the appropriate tool (valgrind, go vet, clippy, etc.)

## Dependencies

- No unnecessary imports. Remove every unused one.
- Prefer standard library over external dependency
- If a dependency is used for one function, inline it

## Testing

- Refactoring does not change behavior — tests must pass before AND after
- If no tests exist for the refactored code, write them FIRST
- Edge cases: empty input, max input, null/nil/undefined, concurrent access

## Commits

- Atomic: one logical change per commit
- Message format: `refactor(<scope>): <what> — <which rule>`
- Never mix refactoring with feature work in the same commit

## Craft over cleverness

- Simplest solution that works. No premature abstraction.
- If you can delete code instead of refactoring it, delete it.
- The best refactor is the one that reduces total line count.
- Nothing is lost, everything transforms — extract reusable pieces.

---

## Go Refactoring (applies when working with Go files)


# Go Refactoring

## Idioms

- Max 40 lines per function
- Accept interfaces, return structs
- Errors are values — handle them, don't panic
- No init() unless absolutely forced by a dependency
- No globals — inject dependencies
- Receiver name: one or two letters, consistent across methods
- Context is always the first parameter

## Hexagonal architecture

- Ports (interfaces) in the domain package
- Adapters implement ports, never imported by domain
- No infrastructure types in domain signatures

## After refactoring

- `go vet ./...` — zero issues
- `golangci-lint run` — zero issues
- `go test -race ./...` — zero failures
- Check goroutine leaks with goleak in tests

## Go-specific ladder extensions

- Rung 2: `strings`, `strconv`, `slices`, `maps` before any import.
- Rung 3: `net/http` before gin/chi/echo; `database/sql` before an ORM.
- Rung 4: a stdlib interface fits (`io.Reader`, `fmt.Stringer`)? Use it — don't define your own.
- No constructor function if the zero value is usable.
- No getter/setter if the field can be public.

## Go performance guardrails

- Ladder says "stdlib" but:
  - `fmt.Sprintf` for string building in a loop? `strings.Builder`.
  - `json.Marshal` per request? A pre-compiled codec (easyjson, sonic).
  - `regexp.MatchString` per request? Compile once at init.
  - `http.Get` convenience? Reuse an `http.Client` with connection pooling.
- Ladder says "one-liner" but:
  - `append()` in a hot loop without a pre-sized slice? `make([]T, 0, n)`.
  - map access in a hot loop? A slice if keys are dense integers.
  - `interface{}` on a hot path? A concrete type avoids boxing allocation.
- `sync.Pool` for high-churn allocations (byte buffers, request objects).
- Avoid `reflect` on hot paths — it allocates on every call.
- Channel vs mutex: mutex to protect-and-release, channel for hand-off.

---

## Shell Refactoring (applies when working with shell scripts)


# POSIX Shell Refactoring

## Strict POSIX compliance

- No bashisms — no [[]], no arrays, no (( )), no ${var/pat/rep}
- Shebang: #!/bin/sh — never #!/bin/bash unless explicitly bash-only
- Quote every variable expansion: "$var" not $var
- No unset variable access — set -u compatible
- Use command -v over which
- printf over echo for anything non-trivial

## Structure

- Max 25 lines per function — keep them short
- Functions at top, execution at bottom after a main() call
- Local variables via local keyword or subshell isolation
- Cleanup via trap — every temp file cleaned on EXIT

## After refactoring

- `shellcheck -s sh` — zero warnings
- Test with dash, not just bash
- Runs correctly under every shell you target, not just your default

## Shell-specific ladder extensions

- Rung 2: shell builtins over external commands (`${#var}` over `wc -c`, `${var%.*}` over `basename`).
- Rung 3: an awk one-liner over a Python script for text processing.
- Rung 4: already have `jq`? Use it for JSON — don't `sed`/`grep`.
- Rung 5: pipeline over temp file. Always.
- No function wrapper around a single command.

## Shell performance guardrails

- Ladder says "builtin" but:
  - shell loop over lines? A single `awk`/`sed` instead — one process beats N fork+execs.
  - `$(cat file)`? Use `< file` redirection.
  - `grep | awk | sed` pipeline? Usually one `awk` does all three.
- Ladder says "one-liner" but:
  - command substitution in a `while` loop? Forks per iteration — process in bulk.
- Minimize subshells: `$()` forks, variable assignment doesn't.
- Minimize pipe stages: each is a fork + FD pair.
- Heredoc over `echo` piped to a command.
- `exec` for the final command in a script (no useless parent shell lingering).

---

## API Conventions (applies when working with routes, handlers, controllers)


# API Conventions

## Shape

- Resource-oriented, plural-noun paths under a version prefix (`/v1/<resource>`).
- Versioned — never break a shipped contract; add, don't mutate.
- JSON in/out; document every public route in the project's OpenAPI / API spec.

## Auth & access control

- Authenticate every request; resolve the caller's identity from the credential, not from a path `{id}`.
- Authorize per request — scope every read and write to the caller; never trust client-supplied ownership.
- No cross-owner access by construction — derive the owner from the credential, not the request body.

## Errors

- Correct HTTP status: 400 bad input, 401 unauthenticated, 403 denied, 404 not-found, 409 conflict, 429 rate-limit.
- One consistent error envelope; never leak internals (stack traces, SQL, DSNs, file paths) in the body.
- Actionable: what failed, why, what the caller can do.

## Pagination & idempotency

- List endpoints paginate by default (cursor or limit/offset) — never return an unbounded set.
- Mutations are idempotent where the verb implies it (`PUT`/`DELETE`); accept an idempotency key for unsafe retries.

## Flag-gating (when applicable)

- New or risky behavior mounts behind a flag (default off) — a missing flag means the old behavior, unchanged.

## After changes

- Update the OpenAPI spec and regenerate any SDKs.
- Add or extend the project's verification gate (a `scripts/verify/` check or CI job).
