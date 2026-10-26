# Self-Built UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every settings section from the app's own blocks with today's exact look, make every page switchable between Edit and View, let any page become a settings page, and keep each interaction under one frame of app cost at any size.

**Architecture:** A small code kernel (`@osionos/ui` components, registered block renderers, a binding/action runtime) renders documents. Pages are laid out on the existing grid canvas, with auto-layout frames inside cells. Settings sections become canonical JSON system documents, authored in the editor and exported to the repo. Users edit their own copies; required controls and action guards stay in the kernel.

**Tech Stack:** React 19.2, TypeScript, Vite 6, zustand 5, Tailwind v4 (CSS-first) + SCSS in `src/app/styles/`, `@tanstack/react-virtual` (installed), the notion-database-sys formula VM, Playwright 1.59, `node --test --experimental-strip-types` (canvas tests), the existing perf harness.

**Spec:** `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` (v2). Read it before any task. Section numbers below (§n) refer to it.

## Global Constraints

- Docker-first: every command goes through `scripts/docker-run.sh` / `npm run …`. Never run node on the host.
- Keep the 42-school header on JS/TS/shell sources. A new file copies its neighbour's header, with today's date and `dlesieur`.
- No new colours, fonts or `--osio-*` tokens; never rename a token. Raw colours only under `src/app/styles/**` (`check-style-tokens.sh`). No `text-[Npx]`, stock shadows, bare `rounded` or raw hex in TSX (ESLint).
- No new runtime dependency. `@tanstack/react-virtual`, `motion` and the installed Radix packages come first.
- `@osionos/ui` is a git submodule: commit inside it first, then record the SHA in the parent.
- Every alias stays identical in `vite.config.ts` and `tsconfig.json`.
- Settings behaviour stays unchanged: same routes, stores and API modules. Existing settings e2e assertions are never edited, only added to.
- Workers never delete or weaken a test, raise a ratchet number, or loosen a perf budget (memory `worker-loosens-gates`).
- Commits: conventional `type(scope): subject`, no trailers, no push. The user's CLAUDE.md overrides any attribution reminder.
- Files ≤ 300 lines (≤ 200 is the app's target); functions do one thing.
- Done = `npm run test:quality` rc 0 + `npm run test:canvas` green + the task's e2e under `PW_BROWSER_SOURCE=system` (bridge-stub specs also need `PLAYWRIGHT_BRIDGE_STUB=1`). With `docker-run.sh test-e2e`, never put a literal `--` before flags.
- Perf: the §11 budgets. App cost = p95 − floor median ≤ 16 ms per interaction, JS ≤ 8 ms p95, scaling slope ≤ 2 ms.
- Security: user documents are untrusted input. They carry no CSS or code, only style values on fixed scales, and the action guards live in the registry, never in the page.

## Review Focus

1. **Documents from another app version.** Unknown block types or style values must render a placeholder, not crash, and survive a save (SB-1e). Style values: Task 4. Frame values: Task 5.
2. **Long words in narrow panes.** A long email address or a long translated label in a row frame at 375 px must wrap, never scroll the page sideways (Task 5).
3. **Sources that are slow, offline or refused.** In the offline build, or when the account plane answers 503, fields show their unavailable state, writes are disabled, and nothing spins forever (SB-2a).
4. **Double activation of a destructive action.** A second click while the first is pending is ignored: one call per action and arguments (SB-3a).
5. **A user copy against a newer shipped version.** Edits and deletions survive, required blocks come back, and removed shipped blocks the user never touched go away (SB-6d).

---

## Roadmap — every work package

👹 = devil verdict on the spec before dispatch and on the diff before merge (`rules/risk.md`).
Integration branch: `feat/self-built-ui` (from develop `3be8dc71b`). One worktree and branch per package (`feat/sb-<id>`). Waves go to develop as PRs. Releases go to main and are deployed to the funnel as they land, so the progress stays visible.

| ID | Phase | Delivers | Depends on | Done when |
|---|---|---|---|---|
| SB-0a | S0 | parity harness + local baselines (Task 1) | — | 4 tests × 23 sections green twice in a row on develop |
| SB-0b | S0 | conformance ratchet in the gate (Task 2) | — | gate fails on +1 and on −1 without a ratchet edit |
| SB-0c | S0 | perf baseline of today's settings (Task 3) | — | numbers recorded in the spec header |
| SB-1a | S1 | `BlockStyle` scales, sanitizer, resolver, static CSS (Task 4) | — | unit tests + SCSS coverage test green |
| SB-1b 👹 | S1 | block registry + `frame` block (Task 5) | SB-1a | `/frame` works in Edit and View, narrow rule at 375 |
| SB-1c | S1 | `visibleWhen` on any block, dependency-cached | SB-1b | hides/shows on field change; fails open like cells |
| SB-1d | S1 | system-document format, generated schema (`--check` in gate), loader with unknown-block placeholder, fixpoint test | SB-1b | every doc round-trips byte-identically |
| SB-1e | S1 | system-page host in `SETTINGS_PANELS` (lazy per doc) + `/__styleguide` demo | SB-1d | a demo doc renders in the Settings tab |
| SB-2a | S2 | source registry: record + list sources, per-field `useSyncExternalStore`, viewer-scoped, unavailable states | SB-1d | one bound field re-renders alone (React Profiler count = 1) |
| SB-2b | S2 | settings record sources over existing stores (preferences, accessibility, notifications, voice, AI) | SB-2a | each source's read/write calls the same function as today's panel (spy test) |
| SB-2d | S2 | profile draft source + `profile.save` action (If-Match), page-settings source over the active page (extract `usePageActions`' write into a plain function) | SB-2b, SB-3a | profile and page settings save through the same calls as today (spy test) |
| SB-2c | S2 | `field` block, every display, on `@osionos/ui` (+ Segmented, Radio, Textarea in the package); `/input` `/select` `/toggle` `/checkbox` | SB-2a | labels, helper, error, on-blur validation; a11y names as today |
| SB-3a 👹 | S3 | action registry + `app_action` step + runner guards (confirm, typed, sudo, single-flight) + action state | SB-2a | a page cannot weaken a guard (test edits the doc, guard still runs) |
| SB-3b | S3 | `button` on `@osionos/ui` Button: every tone/size, icon, icon-only label, loading | SB-3a | old `buttonVariant` pages render unchanged |
| SB-3c | S3 | `chip`, `avatar`, `meter`, `status`, `secret`; heading `anchor` | SB-3a | deep link `?settings=<id>#<anchor>` scrolls to a doc heading |
| SB-4a | S4 | `collection`: list/table/grid, virtual rows, empty slot, `$row`, row actions, inline edit | SB-2c, SB-3b | 10,000-row scroll with no long task over 50 ms |
| SB-4b | S4 | the pilot list sources `list:sessions` and `list:passkeys` (row actions, grouping, inline rename), `passkey.remove`, `buttonAriaField`, and the shipped `item-list` component; every other settings list gets its source in its own SB-5 section package | SB-4a, SB-4e | both lists match today's rows, texts and button names from the same stub |
| SB-4c | S4 | `tabs`, `dialog` containers | SB-1b | keyboard per WAI-ARIA (shadcn reference) |
| SB-4d 👹 | S4 | `collection` display `matrix` (rows × columns sources, a kernel cycle control per cell), the permission matrix moved into a store and exposed as `matrix:perms`, shown only on trusted pages | SB-4a, SB-2c, SB-1e | the permission matrix's cells and saves match today's panel |
| SB-4h 👹 | S4b | kernel flows (state machine with its own actions and short-lived secrets) + `steps` container + `qr` block + the `twostep` flow | SB-3b, SB-3c, SB-2c, SB-1e | enrol → scan → verify → recovery codes, every guard intact |
| ~~SB-4i~~ | S4b | **dropped 2026-10-26**: the app registers no passkey today (`useAccountPasskeysStore.ts` header: "registering one is the control plane's job"; `ProfileSecurityModals.tsx:125` "new passkeys are added when you sign in on a device that offers one"). Parity needs only rename and remove, which are plain actions in SB-4b | — | — |
| SB-4j | S4b | `field` displays `image` (pick, crop, upload) and `file` (drop zone) over the extracted avatar/banner/import pipelines, `profile.banner.remove` | SB-2c, SB-3b | avatar/banner/import behave as today (existing e2e unchanged) |
| SB-4e | S4 | components: definition, instance, slots, props, variants; the eight shipped settings components (§9; Item list moves to SB-4b) | SB-4f, SB-3c | editing a component updates every instance |
| SB-4f | S4 | shipped preset library reproducing settings looks, text blocks render `style`, `leading` and `minWidth` scales | SB-1d | each preset's computed style and part spacing equal its source element, light and dark |
| SB-4g 👹 | S4 | dev authoring loop: "Export as system document" (serve-only middleware) | SB-1d | export of a demo doc = the committed file |
| SB-5-* | S5 | one package per section, in this order: accessibility_voice, plans, billing, library, page_settings, notifications, preferences, moderation, mail_calendar, import, connections, contacts, public_pages, general, teamspaces, shortcuts, ai, ai_connections, mcp, developer, profile, people, permissions | S4, S4b | old panel deleted; parity ≤ 0.1 %; existing e2e unchanged and green; ratchet lowered; perf ≤ budget |
| SB-5-x | S5 | one section (preferences) authored through the editor UI end to end, recorded (chrome-devtools MCP) | SB-4g | exported file = committed file |
| SB-6a | S6 | Edit/View on every page (lock = View), `live` vs `preview` render mode | SB-1b | View is usable; preview never writes (test) |
| SB-6b 👹 | S6 | grid upgrades: 8 px row unit, a per-cell narrow order that follows the pane width, V1 never rewrites a fine grid; growth stays as it is in both renderers (difference recorded); the component tray moves to SB-6e | SB-6a | settings doc on the grid matches parity; shipped canvases' geometry unchanged at 1,440 px |
| SB-6c | S6 | overlay selection, breadcrumb, style inspector from schemas, drag + keyboard move | SB-6a, SB-1b, SB-1c | inspector change ≤ 16 ms on a 2,000-block page |
| SB-6m | S6 | the tree merge: shallow fingerprints, a copy against a newer shipped page at every depth, required blocks put back (pure library, no UI) | SB-1c | Review Focus 5 as a 500-seed property test |
| SB-6d 👹 | S6 | user copies, the database half (root repo): `osionos_user_system_pages`, owner RLS and column grants, export/erasure registry row, the schema file in the bridge image | — | RLS: A cannot read B's copy (models-grants check) |
| SB-6d2 👹 | S6 | user copies, the bridge half: GET/PUT/DELETE `/api/system-pages/settings/<id>`, If-Match, a strict tree check that agrees with `parseSystemDoc` | SB-1d, SB-6d | the two validators agree on a 300-mutation corpus |
| SB-6d3 | S6 | user copies, the client half: "Edit this page", Reset, render = required(merge(copy, shipped)), editing a copy like a page | SB-6m, SB-6d2, SB-1e, SB-6a | Review Focus 5 end to end |
| SB-6e | S6 | user presets + components library (save, apply, detach), and the component tray that inserts them (design §4 upgrade 4, moved from SB-6b) | SB-4e, SB-6c | saved preset applies across pages |
| SB-6f 👹 | S6 | "Show in Settings" (§13), the bridge half: `/api/settings-pages`, "Only me" (page editors) / "Everyone" (owner, admins), read filter, audit | SB-6a | a member cannot flag for the workspace (server test, row byte-identical) |
| SB-6f2 | S6 | "Show in Settings", the client half: one nav registry for sections and flagged pages, the switch in page settings, the Custom mark | SB-6f, SB-6a | a flagged page appears in nav, search, palette and deep link |
| SB-6h 👹 | S6 | workspace defaults, the database half (root repo): `osionos_workspace_system_pages`, an append-only history bounded at 50 versions, `osionos_workspace_system_page_apply` as the only writer (owner/admin check, compare-and-swap, history row in one transaction), data-map rows | SB-6d | a member's write is refused and a rollback restores a version byte-identically (models-grants check) |
| SB-6h2 👹 | S6 | workspace defaults, the bridge half: member read, owner/admin save, history, rollback, restore shipped, audit before write | SB-6h, SB-6d2, SB-6f | a member's write is refused (server test, store and audit unchanged) |
| SB-6h3 | S6 | workspace defaults, the client half: three-layer resolve, the "Everyone" mode for admins, version history and rollback, admin-written blocks lose system-page trust | SB-6h2, SB-6d3 | a member sees the admin's default, then the rolled-back one |
| SB-6g | S6 | every block in `/` on any page; viewer-scoped bindings on shared/public pages; `osio.settings.edit` on | SB-6d3, SB-6h3 | `/input` bound to a preference toggles it from a normal page |
| SB-7 | S7 | stage 2: inspector, slash catalogue, settings shell as documents | S6 | own design doc first |

Plans 2 to 8 are written at the start of their phase, each from a fresh read of the code. The interfaces they consume are the ones the previous plan's tasks produce. This plan details S0 and the first S1 slice.

## Orchestration (per package)

1. Spec → `docs/self-built-ui/wp/<ID>.md` (OWNS / MUST-NOT-TOUCH, interfaces, tests, gates). 👹 packages get the devil verdict first.
2. `bin/oc-dispatch.sh <ID> <spec> "<scope>" feat/self-built-ui` → opencode worker in `groot-wt/<ID>/app`.
3. Review:
   - the diff stays inside OWNS;
   - re-run the gates under `bin/gate.sh` (≤ 2 heavy gates at once);
   - `oc-review.sh` with mutants;
   - parity and perf for UI packages;
   - the ui-ux-pro-max checklist on screenshots (375/1440 × light/dark).
4. Merge `--no-ff` into `feat/self-built-ui`, ledger row in `docs/self-built-ui/LEDGER.md`.
5. A wave goes to develop as a PR, and a release goes to main with before/after media (`rules/pull-requests.md`). The funnel deploy follows the promote procedure.

---

## Plan 1 — S0 baseline + first S1 slice

### File map

| File | Responsibility |
|---|---|
| `tests/e2e/support/settingsParityStub.mjs` (new) | deterministic catch-all bridge stub for every route settings calls |
| `tests/e2e/bridge-stub/settingsParity.spec.mjs` (new) | screenshots of every visible section × 375/1440 × light/dark |
| `.gitignore` (modify) | keep parity snapshots local |
| `scripts/check-built-with-blocks.sh` (new) | conformance counter against the ratchet |
| `scripts/built-with-blocks.ratchet.json` (new) | the allowed counts, which only go down |
| `scripts/docker-run.sh:51` (modify) | add the check to the `quality` chain |
| `tests/canvas/built-with-blocks-check.test.ts` (new) | the check fails up, fails down, passes equal |
| `tests/e2e/perf/selfBuilt.spec.mjs` (new) | perf cases on today's settings |
| `src/entities/block/model/blockStyle.ts` (new) | `BlockStyle`, scales, `sanitizeBlockStyle`, `resolveBlockStyle` |
| `src/app/styles/block-style.scss` (new) | static rules for every scale value |
| `src/entities/block/model/types.ts:144-200` (modify) | `style?: BlockStyle`, `frame?: FrameConfig`, `'frame'` in `BlockType` |
| `tests/canvas/block-style.test.ts` (new) | sanitizer, precedence, memo, SCSS coverage |
| `src/entities/block/model/frameLayout.ts` (new) | `FrameConfig`, `FRAME_BREAKPOINTS`, `frameAttrs` |
| `src/entities/block/model/blockRegistry.ts` (new) | `BlockDefinition`, `getBlockDefinition`, `REGISTERED_BLOCKS` |
| `src/entities/block/registered/frame/FrameBlock.tsx` (new) | frame renderer (View) + editor adapter |
| `src/entities/block/registered/frame/FrameSettingsPopover.tsx` (new) | direction, wrap, gap, padding, dividers, narrow rule |
| `src/entities/block/ui/ReadOnlyBlock.tsx:188-197` (modify) | registry lookup before the switch |
| `src/features/block-editor/ui/BlockEditor.tsx:483-487` (modify) | registry lookup before the switch |
| `src/features/slash-commands/model/slashMenuCatalog.tsx:387` (modify) | slash entries from the registry |
| `src/services/page-actions/pageMarkdownSerialize.ts`, `src/features/page-export/model/{exportHtml,exportPdfLines}.ts` (modify) | registered exporters before their switches |
| `tests/canvas/frame-layout.test.ts` (new) | `frameAttrs` |
| `tests/e2e/functional/frameBlock.spec.mjs` (new) | `/frame` in Edit and View, narrow rule, long-word wrap |

### Task 1: Parity harness (SB-0a)

**Files:**
- Create: `tests/e2e/support/settingsParityStub.mjs`, `tests/e2e/bridge-stub/settingsParity.spec.mjs`
- Modify: `.gitignore` (add `tests/e2e/bridge-stub/settingsParity.spec.mjs-snapshots/`)

**Interfaces:**
- Consumes: `region`, `nav`, `openSection`, `openSettings` (`tests/e2e/support/settingsHelpers.mjs:21-50`); `openProfile` (`tests/e2e/support/sessionsStub.mjs:56`); the stubs in `tests/e2e/support/*Stub.mjs`.
- Produces: `installParityStub(page) → Promise<{ unknown: string[] }>`; snapshot names `<sectionId>-<width>-<theme>.png`.

- [ ] **Step 1: Write the stub.** `installParityStub` routes `**/api/**`. Reuse the existing stub fixtures where they exist; every list route a section calls on open answers 2–3 fixed rows (fixed ids and dates); an unknown route answers `404 {ok:false}` and its path is pushed to `unknown`.
- [ ] **Step 2: Write the spec.** One test per (viewport, theme): `[[375, 812], [1440, 900]] × ["light", "dark"]`.
  - Before boot: `page.addInitScript` sets `localStorage["osionos:theme-mode"]`, and `page.clock.install({ time: new Date("2026-10-25T10:00:00Z") })`.
  - Boot: `openProfile(page, baseURL)`, then `openSettings(page)`.
  - Read the sections from `nav(page).locator("[data-settings-section]")`.
  - For each section: `openSection`, then `await page.evaluate(() => document.fonts.ready)`, then
    `await expect.soft(region(page)).toHaveScreenshot(\`${id}-${width}-${theme}.png\`, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.001 })`.
  - Finally `expect(stub.unknown).toEqual([])`.
- [ ] **Step 3: Create the baselines.** Run: `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e --update-snapshots tests/e2e/bridge-stub/settingsParity.spec.mjs`. Expected: `4 passed`, about 92 PNGs written.
- [ ] **Step 4: Prove determinism.** Run the same command twice without `--update-snapshots`. Expected: `4 passed` both times. Any diff is a determinism bug (clock, fonts, random ids): fix it in the stub, never by raising the ratio.
- [ ] **Step 5: Commit.** `git add .gitignore tests/e2e/support/settingsParityStub.mjs tests/e2e/bridge-stub/settingsParity.spec.mjs && git commit -m "test(settings): parity screenshots of every section at 375/1440, light and dark"`

Caveat (goes in the spec header): baselines are local (system Chromium renders differ from the committed-PNG renderer), so parity is a review gate, not a CI gate. `groot-wt/bin/parity.sh <wt> <base-ref>` renders the baseline from the base commit in a scratch worktree and then compares.

### Task 2: Conformance ratchet (SB-0b)

**Files:**
- Create: `scripts/check-built-with-blocks.sh`, `scripts/built-with-blocks.ratchet.json`, `tests/canvas/built-with-blocks-check.test.ts`
- Modify: `scripts/docker-run.sh:51` (append `&& bash scripts/check-built-with-blocks.sh` before the final `exec`)

**Interfaces:**
- Produces: `check-built-with-blocks.sh [dir=src/features/settings] [ratchet=scripts/built-with-blocks.ratchet.json] [--print]`. Exit 0 when every count equals the ratchet; exit 1 with `<key>: <count> > <allowed>` when a count rises, and `<key>: <count> < <allowed> — lower the ratchet` when one falls. Keys: `rawButton`, `rawInput`, `rawSelect`, `rawTextarea`, `rawTable`, `tokenClass` (`\[var\(--osio-`), counted over `*.tsx`. `--print` writes the current counts as JSON.

- [ ] **Step 1: Write the failing test** (`node:test`, spawns `bash` on a temp fixture dir):
  - `equal counts pass` → status 0, stdout contains `✓ built-with-blocks`
  - `one extra raw button fails` → status 1, stdout contains `rawButton: 2 > 1`
  - `one fewer token class asks to lower the ratchet` → status 1, stdout contains `tokenClass: 0 < 1 — lower the ratchet`
- [ ] **Step 2: Run it to see it fail.** Run: `npm run test:canvas -- tests/canvas/built-with-blocks-check.test.ts`. Expected: FAIL (script missing).
- [ ] **Step 3: Implement the script** with `grep -o … | wc -l` per key, plus `jq` or `node -e` for the JSON. Header `Caveat:`: it is a text match, so a `<button` inside a comment or a string counts (over-reports), and raw elements hidden behind a component outside the counted dir are not seen (by design: `@osionos/ui` owns them).
- [ ] **Step 4: Write the ratchet** with `--print` on the real tree (expected near: rawButton 54, rawInput 49, rawSelect 14, rawTable 3, tokenClass 620).
- [ ] **Step 5: Run the tests and the gate.** Run: `npm run test:canvas -- tests/canvas/built-with-blocks-check.test.ts` → PASS. Then `npm run test:quality` → rc 0, with the `✓ built-with-blocks` line present.
- [ ] **Step 6: Commit.** `git commit -m "build(quality): built-with-blocks ratchet over settings raw elements and token classes"`

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

### Task 4: BlockStyle (SB-1a)

**Files:**
- Create: `src/entities/block/model/blockStyle.ts`, `src/app/styles/block-style.scss`, `tests/canvas/block-style.test.ts`
- Modify: `src/entities/block/model/types.ts` (`style?: BlockStyle` on `Block`); import the SCSS where `recipes.css` is imported.

**Interfaces:**
- Produces:
  - `STYLE_SCALES` (`as const`), with exactly these keys and values:
    - `tone`: default, primary, subtle, ghost, danger, danger-subtle, success, warning, accent;
    - `size`: sm, md, lg;
    - `text` and `surface`: default, muted, subtle, accent, danger, success, warning, plus gray, brown, orange, yellow, green, blue, purple, pink, red;
    - `border`: none, subtle, default, strong, danger, accent;
    - `borderSides`: all, top, bottom, x, y;
    - `radius`: none, sm, md, panel, lg, full;
    - `space`: 0–12;
    - `width`: hug, fill, fixed;
    - `align`: start, center, end, stretch;
    - `justify`: start, center, end, between;
    - `textSize`: xs, sm, base, lg, xl;
    - `weight`: regular, medium, semibold;
    - `shadow`: none, menu, panel.
  - `interface BlockStyle { tone?; size?; text?; surface?; border?; borderSides?; radius?; padding?; paddingX?; paddingY?; gap?; width?; fixedWidth?: Space; basis?: Space; align?; justify?; textSize?; weight?; shadow? }`, each typed from its scale.
  - `sanitizeBlockStyle(input: unknown): BlockStyle`
  - `resolveBlockStyle(block: Pick<Block, "style" | "textColor" | "backgroundColor">): Readonly<Record<string, string>>`. It returns `data-s-<key>` attributes, is memoised in a `WeakMap` by `block.style` identity, and `style` wins over the flat fields.

- [ ] **Step 1: Write the failing tests:**
  - `sanitizeBlockStyle({ padding: 3, radius: "panel", bogus: 1, gap: 99, tone: "neon" })` deep-equals `{ padding: 3, radius: "panel" }`
  - `sanitizeBlockStyle(null)`, `("x")`, `([])` each deep-equal `{}`
  - `resolveBlockStyle({ style: { padding: 3 } })` deep-equals `{ "data-s-padding": "3" }`
  - `resolveBlockStyle({ style: { text: "blue" }, textColor: "red" })["data-s-text"] === "blue"`; with only `textColor: "red"`, `"red"`
  - `const s = { gap: 2 }; resolveBlockStyle({ style: s }) === resolveBlockStyle({ style: s })`
  - SCSS coverage: compile `src/app/styles/block-style.scss` with `sass-embedded`'s `compile`, then assert that for every key and value in `STYLE_SCALES` the CSS contains the selector `[data-s-<key>="<value>"]`
- [ ] **Step 2: Run them to see them fail.** `npm run test:canvas -- tests/canvas/block-style.test.ts` → FAIL.
- [ ] **Step 3: Implement** `blockStyle.ts`, and `block-style.scss` with `@each` over the same value lists. Map them to existing tokens: `calc(var(--spacing) * n)`, `--osio-radius-*`, `--osio-fg-*`/`--osio-bg-*`, `--osio-block-tint-*-fg/bg`, `--osio-border-*`, `--osio-shadow-*`. A value with no token fails the coverage test; it does not get a new token.
- [ ] **Step 4: Run the tests and the gate.** Canvas test PASS; `npm run test:quality` rc 0 (the token checks included).
- [ ] **Step 5: Commit.** `git commit -m "feat(blocks): token-scaled BlockStyle with sanitizer, resolver and static CSS"`

### Task 5: Block registry + `frame` (SB-1b 👹)

**Files:**
- Create: `src/entities/block/model/frameLayout.ts`, `src/entities/block/model/blockRegistry.ts`, `src/entities/block/registered/frame/FrameBlock.tsx`, `src/entities/block/registered/frame/FrameSettingsPopover.tsx`, `tests/canvas/frame-layout.test.ts`, `tests/e2e/functional/frameBlock.spec.mjs`
- Modify: `types.ts` (`'frame'` in `BlockType`, `frame?: FrameConfig`); `ReadOnlyBlock.tsx:188-197`; `BlockEditor.tsx:483-487`; `slashMenuCatalog.tsx:387`; the three exporters; `block-style.scss` (frame rules).

**Interfaces:**
- Consumes: `resolveBlockStyle` (Task 4).
- Produces:
  - `FRAME_BREAKPOINTS = [480, 720, 1024] as const`
  - `interface FrameConfig { direction: "row" | "column"; wrap?: boolean; dividers?: boolean; narrow?: { below: 480 | 720 | 1024; direction?: "row" | "column"; hide?: boolean } }`
  - `frameAttrs(frame: unknown): Readonly<Record<string, string>>`
  - `interface BlockDefinition { type: BlockType; label: string; slash?: { aliases: string[]; description: string; section: string; icon: () => React.ReactNode }; create(): Partial<Block>; View: React.ComponentType<{ block: Block; mode: "live" | "preview" }>; Edit: React.ComponentType<{ block: Block; pageId: string; onUpdate(updates: Partial<Block>): void; renderChildren(): React.ReactNode }>; toMarkdown?(block: Block, children: string): string; toHtml?(block: Block, children: string): string }`
  - `getBlockDefinition(type: string): BlockDefinition | undefined`
  - `REGISTERED_BLOCKS: readonly BlockDefinition[]`

- [ ] **Step 1: Write the failing unit test** (`frame-layout.test.ts`):
  - `frameAttrs({ direction: "row", wrap: true, dividers: true, narrow: { below: 720, direction: "column" } })` deep-equals `{ "data-frame": "", "data-frame-dir": "row", "data-frame-wrap": "", "data-frame-dividers": "", "data-frame-narrow-below": "720", "data-frame-narrow-dir": "column" }`
  - `frameAttrs({ direction: "row", narrow: { below: 600, direction: "column" } })` has no `data-frame-narrow-*` key
  - `frameAttrs(undefined)` deep-equals `{ "data-frame": "", "data-frame-dir": "column" }`
- [ ] **Step 2: Write the failing e2e** (`frameBlock.spec.mjs`, offline build):
  - typing `/frame` + Enter on a page inserts `[data-frame]`, and two paragraphs typed inside are its children;
  - the popover sets direction row: `getComputedStyle(frame).flexDirection === "row"`;
  - with the narrow rule `below 720 → column`, after `page.setViewportSize({ width: 375, height: 812 })` the frame's `flexDirection === "column"`;
  - with a 120-character unbroken word in a row frame at 375 px, `document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth` (Review Focus 2);
  - after locking the page (View), the frame and its children render through `ReadOnlyBlock` with the same `flexDirection`.
- [ ] **Step 3: Run both and see them fail.** `npm run test:canvas -- tests/canvas/frame-layout.test.ts`, then `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/frameBlock.spec.mjs` → FAIL.
- [ ] **Step 4: Implement `frameLayout.ts` and `blockRegistry.ts`.** The registry is a static array (no runtime `register`). The lookup is a `Map` built once.
- [ ] **Step 5: Implement `FrameBlock.tsx`.**
  - The outer element carries `frameAttrs` + `resolveBlockStyle`.
  - Children render through `ReadOnlyBlock` in View and `renderChildren()` in Edit (dependency inversion: entities never import features).
  - With a `narrow` rule, a wrapper gets `container-type: inline-size`. Caveat in the file: a frame with a narrow rule must be `width: fill`, because the wrapper has no intrinsic width.
- [ ] **Step 6: Hook the registry into the renderers, slash menu and exporters.**
  - In `ReadOnlyBlock`, after the bound-field check: `const def = getBlockDefinition(block.type); if (def) return <def.View block={block} mode="live" />;` (SB-6a replaces the constant with the render-mode context).
  - In `BlockEditor`, after `isProfileBound`, the same with `def.Edit`, `onUpdate` mapped to `commitBlockUpdate(block.id, …)` and the existing `renderChildren`.
  - `SLASH_COMMANDS` appends `{ kind: "block", id: \`block:${def.type}\`, label, aliases, description, section, icon: def.slash.icon(), blockType: def.type }` for each definition with `slash`.
  - Each exporter calls `def.toMarkdown` / `def.toHtml` before its switch, and joins the children by default.
- [ ] **Step 7: Add the frame rules to `block-style.scss`:**
  - `[data-frame]{display:flex}`
  - `[data-frame-dir=…]` (direction)
  - `[data-frame-wrap]{flex-wrap:wrap}`
  - dividers: `> * + *` with border-top (column) or border-left (row), `var(--osio-border-default)`
  - children: `min-width:0; overflow-wrap:anywhere`
  - one `@container (max-width: <below-1>px)` block per breakpoint
- [ ] **Step 8: Run everything.** Unit PASS; e2e `5 passed`; `npm run test:quality` rc 0; the existing `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash`, `longPage` stay within `BUDGET` (the registry lookup sits on the hot path).
- [ ] **Step 9: Commit.** `git commit -m "feat(blocks): block registry and the auto-layout frame block"`

Plan 2 (SB-1c … SB-1e) is written when Task 5 merges, from its real interfaces.
