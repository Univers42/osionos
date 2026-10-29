# Theme profiles and the `>` command palette — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People restyle every osionos token through short JSON themes and profiles edited in the built-in Monaco editor, and change any preference from the `>` palette, VS Code style.

**Architecture:** A token catalog and one validator (shared by browser and bridge) compile a theme document to `--osio-*` inline properties on `<html>`, cached for the pre-paint script. A lazy `theme-json` tab hosts Monaco with the JSON language service and a schema generated from the catalog. Themes and profiles sync through `osionos_user_settings` rows via the bridge. The palette gains a second-step quick pick, fed by a preference registry.

**Tech Stack:** React 19, zustand, TypeScript, Monaco 0.56 (its bundled JSON language service), Node bridge modules (built-ins only), `node --test` canvas and bridge suites, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-theme-profiles-design.md`. Read it first: this plan only adds the decisions the spec leaves to the builder.

## Global Constraints

- Docker-first. Never run node on the host. Commands:
  - **Gate:** `bash scripts/docker-run.sh quality` (tsc ×3, eslint `--max-warnings=0`, the token and style checks).
  - **One canvas file:** `MONGO_PORT=27018 docker compose -f docker-compose.base.yml -f docker-compose.dev.yml run --rm --no-deps -T playground node --experimental-strip-types --experimental-loader ./tests/canvas/ts-extension-loader.mjs --test tests/canvas/<file>.test.ts`
  - **One bridge file:** same prefix, then `node --test tests/bridge/<file>.test.mjs`
  - **e2e:** `PW_BROWSER_SOURCE=system /home/dlesieur/Documents/groot-wt/bin/gate.sh bash scripts/docker-run.sh test-e2e <spec files> --retries=0`
  - **Full suites:** `bash scripts/docker-run.sh test-canvas` and `bash scripts/docker-run.sh test-bridge`
- No new dependency. The JSON language service and color picker ship inside `monaco-editor@0.56.0`.
- New JS/TS/shell files carry the 42 header block (copy one from a sibling file). JSON and `.md` files carry none.
- Every file stays ≤300 lines. Existing `--osio-*` tokens are never renamed. Raw hex only in the shipped theme `.json` files.
- New bridge modules are named `scripts/bridge-*.mjs` and added **by name** to `deploy/bridge-fly/Dockerfile` (line 32 list).
- **Limits** (spec, verbatim), exported once as `THEME_LIMITS`:
  - 24 themes, 12 profiles;
  - a name of 1–48 characters; a slug of at most 24;
  - 200 keys per group; a value of at most 160 characters;
  - a theme document of at most 12 KB of JSON.
- **Forbidden in any value:** `url(`, `var(`, `expression(`, `;`, `{`, `}`, `<`, `>`, `\`, `!`, `@`.
- **Storage keys:**
  - localStorage: `osionos:theme-vars` (compiled cache), `osionos:theme-library` (store), `osionos:active-profile`, `osionos:palette-recent`;
  - sessionStorage: `osionos:theme-draft:<pageId>`.
- **Flag:** `osio.themes`, default ON, read through `isThemesEnabled()`. With it off: no Advanced button, no `theme-json` tab, no theme/profile commands, and no stored theme applied.
- Performance: a theme apply or one preview step stays ≤20 ms p95.
- **Commits:** conventional (`feat(theme): …`), no trailer, no push. Commit inside the worktree `/home/dlesieur/Documents/groot-wt/theme-profiles/app` only.

## Review Focus

| Input or condition | What a person expects | Test that pins it |
|---|---|---|
| Account switch on a shared browser | User B never sees or applies user A's themes or profiles. A device's active profile that names an unknown theme falls back to the built-in look and clears `osionos:theme-vars`. | Task 13 |
| A stored theme names a token a later release removed | The theme still loads; that key gets a warning and is skipped. | Task 3 |
| The active theme pins `base` | OS sunset changes in system mode, and the quick **Toggle theme** menu item, do not flip it. The menu shows an info toast naming the theme instead. | Task 5 |
| Saving while the bridge is unreachable | The theme is kept locally, an error toast shows, and the next hydrate pushes it. | Task 13 |
| A user theme or import takes a shipped theme's name, or a name already used | Save refuses with a message on `name`, and nothing is overwritten. | Task 5 |

---

## Wave 1 — catalog, validator, apply (PR 1)

### Task 1: Shared structural rules

**Files:**
- Create: `scripts/bridge-theme-rules.mjs` (browser-safe: no imports, no Node APIs; JSDoc types so tsc infers through `allowJs`)
- Test: `tests/canvas/theme-rules.test.ts`

**Interfaces:**
- Produces:
  - `THEME_LIMITS` = `{ themes: 24, profiles: 12, nameMax: 48, slugMax: 24, keysPerGroup: 200, valueMax: 160, docBytes: 12288 }`
  - `THEME_GROUPS` = `['colors', 'layout', 'fonts']`
  - `THEME_BASES` = `['light', 'dark']`
  - `TOKEN_KEY_RE` = `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, with a key length of 1–48
  - `isSafeTokenValue(value: unknown): boolean`
  - `themeSlug(name: string): string`
  - `checkThemeShape(doc: unknown): string[]`
  - `checkProfileShape(doc: unknown): string[]`

- [ ] **Step 1: Write the failing tests**
  - `isSafeTokenValue`:
    - true for `"#0f1520"`, `"rgb(1 2 3 / 50%)"`, `"\"Inter Variable\", system-ui"`, `"calc(100% - 2rem)"`.
    - false for `"red; } body {"`, `"url(x)"`, `"var(--osio-a)"`, `"expression(1)"`, `"a\\0"`, `"x!important"`, `"@import"`, `"<b>"`, a 161-character string, `""`, `42`, `null`.
  - `themeSlug`:
    - `"Harbor Night"` → `"harbor-night"`;
    - `"  Ünïcode  Name!! "` → `"n-code-name"`;
    - a 60-character name is cut to ≤24 characters with no trailing `-`;
    - `"!!!"` → `""`.
  - `checkThemeShape`:
    - `[]` for the spec's Harbor Night example.
    - One non-empty message each for: a missing name; `base:"dim"`; `palette:"Nord!"`; a `colors` array; a nested object value; a key `"Bad_Key"`; 201 keys in `layout`; an unknown top-level key `"extra"`; a JSON serialization over 12288 bytes.
    - Each message contains the offending path (for example `colors.Bad_Key`).
  - `checkProfileShape`:
    - `[]` for `{ name:"Writing", theme:"Harbor Night", preferences:{ mode:"dark", density:"compact" } }`.
    - Also `[]` for an inline theme object.
    - Errors for a preferences value that is an object, more than 20 preference keys, and a name of 49 characters.

- [ ] **Step 2: Run it.** Command: the one-canvas-file command with `theme-rules`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement the module.**
  - `isSafeTokenValue` checks: a string, a length of 1–160, and no match of `/url\(|var\(|expression\(|[;{}<>\\!@]/i`.
  - `checkProfileShape` checks the preference values: string, number or boolean, each string ≤32 characters.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): structural rules shared by the app and the bridge`

### Task 2: Token catalog with a drift test

**Files:**
- Create: `src/shared/config/themeTokens.ts`. Split the colour entries into `themeTokens.colors.ts` if the file passes 300 lines.
- Test: `tests/canvas/theme-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type ThemeTokenKind = 'color' | 'length' | 'number' | 'font' | 'shadow' | 'duration' | 'easing'`
  - `type ThemeGroup = 'colors' | 'layout' | 'fonts'`
  - `interface ThemeToken { key: string; kind: ThemeTokenKind; group: ThemeGroup; description: string }`
  - `THEME_TOKENS: readonly ThemeToken[]`
  - `EXCLUDED_TOKENS: readonly { pattern: RegExp; reason: string }[]`
  - `themeToken(key: string): ThemeToken | undefined`

- [ ] **Step 1: Write the failing tests.** The test reads every `.css`/`.scss` file under `src/app/styles/` with `fs` and collects the `--osio-<key>:` definitions. It asserts:
  - every defined key is either in `THEME_TOKENS` or matched by exactly one `EXCLUDED_TOKENS` pattern;
  - every `THEME_TOKENS` key is defined;
  - keys are unique and match `TOKEN_KEY_RE`;
  - groups follow the kind rule:
    - `color` → `colors`;
    - `font`, and the keys starting `font-size-`, `font-weight-`, `line-height-` or `letter-spacing-` → `fonts`;
    - everything else → `layout`;
  - every description is 8–90 characters and every exclusion `reason` is non-empty.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Write the catalog.** One line per token: key, kind, group and a one-line description saying what it paints.
  - **Required exclusions,** each with its reason:
    - `^n-\d+$`, `^a-` (ramps; components never read them);
    - `^z-` (stacking order, not appearance);
    - `^accent-hue$` (written by the custom-accent picker);
    - `^shadow-rgb$` (an rgb triplet, not a colour);
    - `^fade-(top|bottom)$`, `^pane-zoom$`, `^splitter-hit-min$` (internal geometry);
    - `^transition-(colors|press)$` (composite transitions).
  - Classify the rest. A token whose value is a shorthand that no kind's grammar accepts is excluded, with the reason "shorthand: <what it holds>".
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): catalog of the tokens a theme may set`

### Task 3: Theme document (parse, check, compile)

**Files:**
- Create: `src/shared/config/themeDoc.ts`
- Test: `tests/canvas/theme-doc.test.ts`

**Interfaces:**
- Consumes: Task 1 (`checkThemeShape`, `isSafeTokenValue`, `THEME_GROUPS`) and Task 2 (`themeToken`).
- Produces:
  - `interface ThemeDoc { name: string; base?: 'light' | 'dark'; palette?: string; colors?: Record<string, string>; layout?: Record<string, string>; fonts?: Record<string, string> }`
  - `interface ThemeIssue { path: string[]; message: string; severity: 'error' | 'warning' }`
  - `parseThemeDoc(input: unknown): { doc: ThemeDoc | null; issues: ThemeIssue[] }`
  - `checkTokenValue(kind: ThemeTokenKind, value: string): string | null` (null means valid)
  - `compileTheme(doc: ThemeDoc): CompiledTheme`. `CompiledTheme` is defined here: `{ base?: 'light' | 'dark'; palette?: string; vars: Record<string, string> }`, keyed `--osio-<key>`.

- [ ] **Step 1: Write the failing tests.**
  - The spec example parses with no issues. `compileTheme` gives `vars['--osio-bg-page'] === '#0f1520'` and `base === 'dark'`.
  - **Wrong group:** `layout: { "bg-page": "#000" }` gives an error at `['layout','bg-page']` whose message contains "belongs in colors". The key is dropped and the doc is kept.
  - **Unknown key:** `colors: { "removed-token": "#000" }` gives a **warning** at that path. The key is dropped and the doc is kept.
  - **Unknown palette:** `palette: "nope"` gives an error on `['palette']` and the palette is dropped.
  - **Per-kind grammar** for `checkTokenValue`:
    - `color`: accepts `#abc`, `#aabbccdd`, `oklch(0.7 0.1 200)`, `transparent`; rejects `#ggg` and `12px`.
    - `length`: accepts `12px`, `0`, `1.5rem`, `calc(100% - 2rem)`; rejects `12` and `red`.
    - `number`: accepts `1.4`, `600`; rejects `1.4px`.
    - `font`: accepts `"Inter", sans-serif`; rejects `Inter;`.
    - `duration`: accepts `120ms` and `.2s`; rejects `120`.
    - `easing`: accepts `cubic-bezier(.2,0,0,1)` and `ease-out`; rejects `bounce`.
    - `shadow`: accepts `0 1px 2px rgb(0 0 0 / 20%)` and `none`.
  - A structural failure (a non-object, or a missing name) gives `doc === null` with error issues.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Grammar:** one regex per kind in Node. In the browser, a value must also pass `CSS.supports(property, value)`, with the property per kind: `color`, `width`, `line-height`, `font-family`, `box-shadow`, `transition-duration`, `transition-timing-function`.
  - **Palette check:** a palette id is valid when it is in `PALETTES` (`shared/config/theme.ts`).
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): parse, check and compile a theme document`

### Task 4: Contrast and the five shipped themes

**Files:**
- Create:
  - `src/shared/config/themeContrast.ts`
  - `src/shared/config/themes/{harbor-night,studio-paper,graphite-compact,high-contrast,meadow}.json`
  - `src/shared/config/themes/index.ts`
- Test: `tests/canvas/theme-shipped.test.ts`

**Interfaces:**
- Produces:
  - `CONTRAST_PAIRS: readonly (readonly [fg: string, bg: string])[]`:
    - `fg-default/bg-page`, `fg-default/bg-surface`
    - `fg-muted/bg-page`, `fg-muted/bg-surface`
    - `link/bg-page`, `link/bg-surface`
    - `accent-fg/accent`, `danger-fg/danger`
  - `parseHexColor(hex: string): [number, number, number] | null`
  - `contrastRatio(a: [number, number, number], b: [number, number, number]): number` (WCAG 2.x relative luminance)
  - `SHIPPED_THEMES: readonly ThemeDoc[]`
  - `isShippedThemeName(name: string): boolean` (case-insensitive)

- [ ] **Step 1: Write the failing test.**
  - `contrastRatio` of `#000` and `#fff` is 21; of `#777` and `#fff` is ≈4.48 (±0.01).
  - The test reads each JSON file **with `fs`**: node cannot import JSON without attributes, and the app imports them through Vite. For each file:
    - `parseThemeDoc` gives no error issue;
    - it sets `base` and every key named in `CONTRAST_PAIRS`, in hex;
    - every pair is ≥4.5.
  - The five names are unique and are exactly Harbor Night, Studio Paper, Graphite Compact, High Contrast and Meadow.
  - Each theme sets at least 20 keys.
  - Graphite Compact sets `control-h-md` and `radius`; High Contrast sets `focus-ring-width`; Meadow sets `page-max-width`; Studio Paper sets `font-family-serif` or a reading font.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Write the five themes.**
  - Each matches its row in the spec's "Shipped themes" table.
  - Hex values only.
  - The colours stay coherent: surfaces, borders, hover, accent and link all set.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): five shipped themes, each held to AA contrast`

### Task 5: Apply path, pre-paint, the local library, and the flag

**Files:**
- Modify:
  - `src/shared/config/theme.ts`: `applyTheme` and `applyPalette` honour overrides, and `toggleThemeMode` returns the current mode unchanged while the base is pinned.
  - `src/shared/config/featureFlags.ts`: add `"osio.themes"` and `isThemesEnabled()`, default true, with a docstring.
  - `index.html`: extend the pre-paint script.
  - `src/app/App.tsx:231`: call `applyStoredTheme()` right after `applyStoredAppearance()`.
  - `src/widgets/top-bar/model/menus.ts:112`: info toast when the base is pinned.
- Create:
  - `src/shared/config/themeApply.ts`
  - `src/features/theme/model/useThemeLibrary.ts`
- Test:
  - `tests/canvas/theme-apply.test.ts`
  - `tests/e2e/functional/themeApply.spec.mjs`

**Interfaces:**
- Consumes: Task 3 (`compileTheme`, `parseThemeDoc`) and Task 4 (`SHIPPED_THEMES`, `isShippedThemeName`).
- Produces:
  - in `theme.ts`: `setThemeOverrides(o: { base?: 'light' | 'dark'; palette?: string } | null): void` (re-applies mode and palette) and `isThemeBasePinned(): boolean`.
  - in `themeApply.ts`:
    - `THEME_VARS_KEY`
    - `applyCompiledTheme(theme: CompiledTheme | null): void` (writes only changed properties, removes dropped ones, calls `setThemeOverrides`)
    - `persistCompiledTheme(theme: CompiledTheme | null): void`
    - `readCompiledTheme(): CompiledTheme | null` (the same filters as `index.html`)
    - `isThemeSafeMode(): boolean` (`?theme=safe`)
    - `applyStoredTheme(): void` (clears everything when the flag is off or safe mode is on)
  - in `useThemeLibrary.ts`: a zustand store persisted under `osionos:theme-library`:
    - `{ themes: Record<string, ThemeDoc>; activeTheme: string | null }`
    - `setActiveTheme(name: string | null): void` (compiles, applies, persists the cache)
    - `saveTheme(doc: ThemeDoc, previousName?: string): { ok: true } | { ok: false; message: string }`
    - `deleteTheme(name: string): ThemeDoc | null` (returns the removed doc for Undo)
  - exported functions in the same file that read the store's state:
    - `resolveTheme(name: string | null): ThemeDoc | null` (shipped or user)
    - `listThemes(): ThemeDoc[]` (shipped first, then the user's themes by name)

- [ ] **Step 1: Write the failing canvas tests.** They run on a minimal DOM stub: an object with `dataset` and a `style` that records `setProperty`/`removeProperty`.
  - **Diffing:** apply A with `{bg-page, fg-default}`, then B with `{bg-page:other}`. The second call sets `--osio-bg-page` once, removes `--osio-fg-default`, and touches nothing else.
  - **Overrides:** `setThemeOverrides({base:'dark'})` with the stored mode `light` sets `dataset.theme === 'dark'`. `applyTheme('system')` keeps `'dark'`. `toggleThemeMode()` returns the stored mode and leaves `dark`.
  - **Tampered cache:** `readCompiledTheme` drops a var keyed `--x` and a value `red;}` from a stored cache, and returns null for unparsable JSON.
  - **Name rules in `saveTheme`:**
    - refuses `"Meadow"` (shipped);
    - refuses a second user theme named `"harbor night"` when "Harbor Night" exists;
    - refuses a doc with error issues;
    - a rename (`previousName`) moves the slug.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the four modules and the wiring.** The pre-paint block in `index.html`:
  - runs after the existing appearance block;
  - is skipped when `location.search` matches `/[?&]theme=safe(&|$)/`, or the `osio.themes` URL param or localStorage key is `0`/`false`;
  - reads `osionos:theme-vars` (`{"v":1,"base":…,"palette":…,"vars":{…}}`);
  - sets `ds.theme`/`ds.palette` from `base`/`palette` when they pass the checks;
  - sets each var whose key matches `/^--osio-[a-z0-9-]{1,48}$/` and whose value passes the forbidden-character test.
- [ ] **Step 4: Write the e2e** (`themeApply.spec.mjs`). Each test seeds `osionos:theme-vars` with `addInitScript`.
  1. `getComputedStyle(html).getPropertyValue('--osio-bg-page')` equals the seeded value right after `domcontentloaded`, and still does after the app mounts.
  2. `?theme=safe` leaves the palette value in place.
  3. A cache with a `red;}` value is ignored, and the page keeps the palette value.
- [ ] **Step 5: Run the canvas test and the e2e, then the gate.** Expected: PASS, and `quality` exits 0.
- [ ] **Step 6: Commit.** `feat(theme): apply a theme before first paint and keep a local library`

**Wave 1 close:** run the wave checklist at the end of this plan.

---

## Wave 2 — the JSON editor and the Settings entry (PR 2)

### Task 6: The `theme-json` tab

**Files:**
- Modify:
  - `src/widgets/workspace-grid/model/layoutTree.ts:14`: add `"theme-json"` to `TabKind`.
  - `src/widgets/workspace-grid/model/layoutPersist.ts`: add the target codec next to `settingsTab()`.
  - `src/widgets/workspace-grid/model/layoutSync.ts:21`: return null for `theme-json`.
  - `src/widgets/page-renderer/ui/PaneContent.tsx`: a guard after the `settings` one, same shape.
  - `src/widgets/page-renderer/ui/lazyViews.tsx`: `LazyThemeJsonView`.
- Create:
  - `src/features/theme-editor/model/openThemeJson.ts` (Monaco-free)
  - `src/features/theme-editor/ui/ThemeJsonView.tsx` (stub in this task, real in Task 8)
- Test: `tests/canvas/theme-json-tab.test.ts`

**Interfaces:**
- Produces:
  - `type ThemeJsonTarget = { kind: 'theme'; slug: string } | { kind: 'new-theme' } | { kind: 'import-theme' }` (Task 13 adds `profile` and `import-profile`)
  - `THEME_JSON_PREFIX = "__theme_json__:"`
  - `themeJsonTab(target: ThemeJsonTarget): WorkspaceTab`:
    - pageId: `__theme_json__:theme:<slug>` | `__theme_json__:new` | `__theme_json__:import-theme`;
    - title: `<slug>.json` / `new-theme.json` / `import.json`;
    - icon: `"icon:code"`.
  - `parseThemeJsonPageId(pageId: string): ThemeJsonTarget | null`
  - `openThemeJson(target: ThemeJsonTarget): void`

- [ ] **Step 1: Write the failing test.**
  - Round trip: `parseThemeJsonPageId(themeJsonTab(t).pageId)` deep-equals `t` for every target.
  - The parser returns null for `__theme_json__:theme:` (empty slug), `__theme_json__:theme:Bad Slug`, and `page-123`.
  - `openThemeJson` twice with the same target opens one tab: `openTab` focuses by pageId.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the codec and the guards.** The view reads its target from `tab.pageId`. When `isThemesEnabled()` is false, the view renders "Custom themes are turned off."
- [ ] **Step 4: Run it, then the gate.** Expected: PASS, `quality` 0.
- [ ] **Step 5: Commit.** `feat(theme): a theme-json pane tab`

### Task 7: Monaco JSON, the schema, and key ranges

**Files:**
- Create:
  - `src/features/theme-editor/model/monacoJson.ts`
  - `src/features/theme-editor/model/themeSchema.ts`
  - `src/features/theme-editor/model/jsonKeyRange.ts`
- Test: `tests/canvas/theme-schema.test.ts`

**Interfaces:**
- Produces:
  - `ensureJsonLanguage(): void`, called once. It:
    - imports `monaco-editor/languages/features/json/register` (`jsonDefaults`), `monaco-editor/languages/features/json/json.worker?worker` and `monaco-editor/features/colorPicker/register`;
    - wraps `MonacoEnvironment.getWorker` so the label `json` gets the JSON worker and every other label gets the previous worker.
  - `setJsonSchema(modelUri: string, schemaUri: string, schema: object): void`. It calls `jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: false, enableSchemaRequest: false, schemas: [...] })` and keeps every other model's schema.
  - `buildThemeSchema(currentValue: (key: string) => string): object`:
    - `name` (string, maxLength 48), `base` (enum), `palette` (enum of `PALETTES` ids);
    - `colors`, `layout` and `fonts`: objects with `additionalProperties: false`, one property per catalog token of that group;
    - each property: `type: 'string'`, `maxLength: 160`, `description`, a `markdownDescription` ending "Now: `<value>`", and `format: 'color-hex'` for colours, which gives swatches and the picker.
  - `findJsonKeyRange(text: string, path: string[]): { start: number; end: number } | null`: the offsets of the key string at that path in valid JSON (a small string-aware scanner, exact on valid JSON).

- [ ] **Step 1: Write the failing tests.**
  - The schema's `colors.properties` key set equals the catalog's colour keys; the same holds for `layout` and `fonts`.
  - `bg-page` has `format: 'color-hex'` and a `markdownDescription` containing "Now: `#123456`" when `currentValue` returns `#123456`.
  - `palette.enum` equals the `PALETTES` ids.
  - `findJsonKeyRange('{"colors":{"accent":"#fff","x":{"accent":1}}}', ['colors','accent'])` gives the first `"accent"` (start 11, end 19).
  - It gives null for a missing path, and ignores a `"colors"` that appears inside a string value.
- [ ] **Step 2: Run it.** Expected: FAIL. `monacoJson.ts` is not under test: it is wiring.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): JSON language service and a schema built from the catalog`

### Task 8: The editor view, with draft, save, revert and contrast markers

**Files:**
- Create:
  - `src/features/theme-editor/model/useJsonDraft.ts`
  - `src/features/theme-editor/model/themeDraftConfig.ts`
  - `src/features/theme-editor/model/liveContrast.ts`
  - `src/features/theme-editor/ui/ThemeJsonView.tsx` (replaces the stub)
  - `src/features/theme-editor/ui/ThemeEditorToolbar.tsx`
- Test: `tests/canvas/theme-draft.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7.
- Produces:
  - `interface DraftConfig<D>`:
    - `draftKey: string`
    - `initialText(): string`
    - `parse(text: string): { doc: D | null; issues: ThemeIssue[] }`
    - `preview(doc: D): void`
    - `restore(): void`
    - `save(doc: D): { ok: true } | { ok: false; message: string; path?: string[] }`
  - `useJsonDraft<D>(config: DraftConfig<D>): { text; setText(t: string): void; issues: ThemeIssue[]; dirty: boolean; restored: boolean; save(): void; revert(): void }`. The parse runs 120 ms after the last edit.
  - `themeDraftConfig(target: ThemeJsonTarget): DraftConfig<ThemeDoc>`:
    - `new-theme`: a copy of the active theme, or a skeleton with `name: "My theme"` (unique-suffixed), the current `base`/`palette`, and `bg-page`, `fg-default` and `accent` filled from the live values;
    - a shipped slug: saving creates `"<name> (copy)"` (or `(copy 2)`, and so on) and opens that tab;
    - `import-theme`: the text `{\n  "name": ""\n}`; Save stores it as a new theme, under the name rules of Task 5.
  - `liveContrastIssues(): { fg: string; bg: string; ratio: number }[]`. It resolves each `CONTRAST_PAIRS` token to sRGB by painting it on a 1×1 canvas and reading the pixel (`getComputedStyle` can answer in oklch), and returns the pairs under 4.5.

- [ ] **Step 1: Write the failing tests** for `useJsonDraft` logic, extracted as a pure reducer `draftReducer` in the same file and tested without React.
  - Typing valid text calls `preview` once per 120 ms burst.
  - Invalid JSON never calls `preview`.
  - `revert()` calls `restore` and sets `dirty=false`.
  - A dirty draft is written to `sessionStorage[draftKey]` on unmount and `restore` is called. The next mount reads it back with `restored=true`.
  - `save()` with an error result keeps `dirty=true` and adds an issue at `path`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the view.**
  - It uses `editor.create` from `monacoRuntime.ts` with the options pattern of `useMonacoEditor.ts` (theme `OSIO_THEME`, `watchEditorTheme`), language `json`, and a model URI `osionos://theme/<pageId>.json`.
  - **Markers:** `editor.setModelMarkers(model, 'osionos-theme', …)`, one per issue, located with `findJsonKeyRange`. Error severity for errors, warning severity for warnings and contrast pairs (placed on the `fg` key when present).
  - **Toolbar:**
    - the name;
    - "N problems";
    - **Save** (`mod+s` too), **Revert**;
    - on a shipped theme, a banner "Built-in theme. Saving makes your own copy.";
    - after a restored draft, a "Draft restored" note.
- [ ] **Step 4: Run it, then the gate.** Expected: PASS, `quality` 0.
- [ ] **Step 5: Commit.** `feat(theme): edit a theme as JSON with live preview`

### Task 9: Settings entry, Reset, and safe mode

**Files:**
- Create:
  - `src/features/theme/ui/ThemeLibraryControls.tsx`
  - `src/features/theme/ui/ThemeSafeModeBanner.tsx`
- Modify:
  - `src/features/theme/WorkspaceThemePanel.tsx`: render `ThemeLibraryControls` first. While the active theme pins `base`/`palette`, the Mode and Color theme controls are disabled with the note "Set by <theme name>".
  - `src/features/settings/model/sections.ts:73`: add the preferences anchor `{ id: "theme-json", label: "Advanced theme (JSON)", keywords: ["json", "custom theme", "tokens", "css variables", "colors", "spacing", "fonts"] }`.
  - `src/app/App.tsx`: mount `ThemeSafeModeBanner` once.
- Test: `tests/e2e/functional/themeEditor.spec.mjs`

**Interfaces:**
- Consumes: Tasks 5, 6 and 8.

**`ThemeLibraryControls`** sits in a `data-settings-anchor="theme-json"` wrapper and holds:
- a **Theme** dropdown: "Built-in", then `listThemes()`;
- an **Advanced (JSON)** button: opens the active theme, or `new-theme` when Built-in is active;
- a **Reset theme** button: `setActiveTheme(null)`.

With the flag off, it renders nothing.

**`ThemeSafeModeBanner`** shows only under `?theme=safe`:
- the text "Your custom theme is off for this visit.";
- **Reset theme**: clears the active theme and drops the query param;
- **Turn it back on**: drops the query param and reloads.

- [ ] **Step 1: Write the failing e2e.** The scenarios are those of the spec's Verification list for the editor.
  1. Settings › Preferences › **Advanced (JSON)** opens a `theme-json` tab.
  2. Replace the `bg-page` value with `#102030`. Within 1 s, `--osio-bg-page` on `<html>` is `#102030`.
  3. Type `"accent": "red;"`. A marker appears (`.squiggly-error` in the editor), and `--osio-accent` keeps its previous value.
  4. Save, then reload: the value persists. Edit again, then **Revert**: the saved value is back.
  5. Close the tab dirty, then reopen: "Draft restored" is visible.
  6. Opening Harbor Night and saving creates "Harbor Night (copy)".
  7. `?theme=safe` shows the banner and the palette value.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the e2e, `settingsTab.spec.mjs`, `settingsPalette.spec.mjs` and `appearancePrefs.spec.mjs`, then the gate.** Expected: all PASS, `quality` 0.
- [ ] **Step 5: Commit.** `feat(theme): Advanced (JSON), Reset theme and safe mode in Settings`

**Wave 2 close:** run the wave checklist.

---

## Wave 3 — preference registry, profiles, sync (PR 3)

### Task 10: Preference registry

**Files:**
- Create: `src/shared/config/preferenceRegistry.ts`
- Modify: `src/features/theme/AppearanceControls.tsx`: option labels come from the registry, and the visible labels stay identical.
- Test: `tests/canvas/preference-registry.test.ts`

**Interfaces:**
- Produces:
  - `type PreferenceKey = 'mode' | 'palette' | 'accent' | 'density' | 'radius' | 'uiScale' | 'linkUnderline' | 'motion' | 'animatedImages' | 'hovercards' | 'urlPaste'`
  - `interface PreferenceDef { key: PreferenceKey; label: string; keywords: string[]; options: readonly { value: string; label: string }[]; read(): string; write(value: string): void }`
  - `PREFERENCES: readonly PreferenceDef[]`
  - `preference(key: PreferenceKey): PreferenceDef`
  - The writes go through `applyTheme` + `persistThemeMode`, `applyPalette` + `persistPalette`, and `updateAppearance`.
  - Accent options are `ACCENT_PRESETS`; `custom` is not an option.

- [ ] **Step 1: Write the failing test.**
  - Every `Appearance` key except `hue`, plus `mode` and `palette`, has exactly one entry.
  - Each entry's option values equal what `parseAppearance` accepts for that key (and `ThemeMode` for mode, `PALETTES` for palette).
  - `write(v)` then `read()` returns `v`, on the DOM stub of Task 5.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement it and refactor `AppearanceControls`.**
- [ ] **Step 4: Run it, then `appearancePrefs.spec.mjs` and `accessibilityPrefs.spec.mjs`.** Expected: PASS (the labels are unchanged).
- [ ] **Step 5: Commit.** `refactor(settings): one registry for the look-and-feel preferences`

### Task 11: Bridge — themes rows and the profiles section

**Files:**
- Create: `scripts/bridge-themes.mjs`
- Modify:
  - `scripts/bridge-preferences.mjs`: export `accountError`, `callerSession`, `readSectionBody`, `readSection`, `mergeSection` and `respondWithError` (additive). Add `['/api/account/profiles', { section: 'profiles', prepare: normaliseProfiles }]` to `SECTIONS`.
  - `scripts/bridge-account-mounts.mjs`: `createThemeRoutes(deps)` after `createPreferencesRoutes`.
  - `deploy/bridge-fly/Dockerfile:32`: add `scripts/bridge-themes.mjs scripts/bridge-theme-rules.mjs`.
  - `tests/bridge/support/account-postgrest.mjs:121-140`: support `like.` with `*` as the wildcard (PostgREST's URL form).
- Test: `tests/bridge/bridge-themes.test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces, all with the app session and the settings rate limit:
  - **`GET /api/account/themes`** answers `{ themes: ThemeDoc[] }`. It reads `osionos_user_settings?section=like.theme-*&select=section,value&order=section.asc&limit=25` and skips `{}` values.
  - **`PUT /api/account/themes/<slug>`** answers 200 with the stored doc. In order:
    1. a slug that fails the key regex or is longer than 24 → 404;
    2. a body over 12 KB → 413 `payload_too_large`;
    3. `checkThemeShape` errors → 422 `invalid_theme` with `errors: string[]`;
    4. `themeSlug(body.name) !== slug` → 422 `slug_mismatch`;
    5. a new slug when 24 non-empty theme rows exist → 409 `theme_limit`;
    6. otherwise, merge with `null` for every dropped top-level key.
  - **`DELETE /api/account/themes/<slug>`**: merge with `null` for every key, answer 204. The account role has no DELETE grant (`models/osionos-account-profiles-migration.sql:636-641`), so an emptied row means "deleted".
  - **`normaliseProfiles(body)`**:
    - each key matches `/^p-[a-z0-9]{6,16}$/`;
    - each value is null or passes `checkProfileShape`;
    - at most 12 keys per patch;
    - otherwise 422 `invalid_profile`.
  - `Caveat:` the theme count is read then written, so two concurrent PUTs of new slugs can reach 25. The 16 KB row CHECK still bounds each row.

- [ ] **Step 1: Write the failing tests.**
  - PUT then GET round-trips Harbor Night.
  - PUT with a forbidden value (`"red;}"`) → 422 `invalid_theme`, and nothing is written (no merge RPC call recorded).
  - Slug mismatch → 422. The 25th theme → 409.
  - DELETE → 204, and GET omits it.
  - User B's GET does not list user A's theme.
  - `/api/account/profiles` PATCH with a bad key → 422; with a valid profile → 200, read back.
  - No session → 401 on every route.
  - The closure test `bridge-dockerfile-closure.test.mjs` stays green.
- [ ] **Step 2: Run the bridge file.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `bridge-preferences.mjs` under 300 lines.
- [ ] **Step 4: Run the file, then the full bridge suite.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(bridge): store themes and profiles in the account settings`

### Task 12: Profile documents

**Files:**
- Create: `src/shared/config/themeProfiles.ts`
- Test: `tests/canvas/theme-profiles.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3 and 10.
- Produces:
  - `interface ProfileDoc { name: string; theme: string | ThemeDoc | null; preferences: Partial<Record<PreferenceKey, string>> & { hue?: number } }`
  - `parseProfileDoc(input: unknown): { doc: ProfileDoc | null; issues: ThemeIssue[] }`: an unknown preference key or option gives an error at `['preferences', key]` and the key is dropped.
  - `profileFromCurrent(name: string, activeTheme: string | null): ProfileDoc`
  - `exportProfileFile(profile: ProfileDoc, theme: ThemeDoc | null): string`: pretty JSON with the theme inline.
  - `importProfileFile(text: string): { profile: ProfileDoc; theme: ThemeDoc | null } | { error: string }`
  - `newProfileId(): string` (`p-` + 8 base36 characters)

- [ ] **Step 1: Write the failing tests.**
  - The export → import round trip deep-equals for a profile naming a user theme.
  - Import of a file whose inline theme name collides with a shipped theme returns the theme renamed `"<name> (imported)"`.
  - `preferences: { density: "huge" }` gives an error and drops the key.
  - Ids match `/^p-[a-z0-9]{8}$/`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(theme): profile documents with export and import`

### Task 13: Library sync, profile UI, Settings (JSON), account isolation

**Files:**
- Modify:
  - `src/features/theme/model/useThemeLibrary.ts`: add the profile state and actions, `hydrate`, `resetForAccount`, and the bridge writes through `trySettingsGet`/`trySettingsPut`/`trySettingsPatch`/`trySettingsDelete` (`store/settings/settingsStoreUtils.ts`).
  - `src/store/settings/accountStoresIsolation.ts`: call `useThemeLibrary.getState().resetForAccount()`.
  - `src/widgets/workspace-grid/model/layoutPersist.ts`: add the targets `{ kind: 'profile' }` (pageId `__theme_json__:profile`, title `settings.json`) and `{ kind: 'import-profile' }`.
  - `src/features/theme-editor/model/themeDraftConfig.ts`: `profileDraftConfig()` (the active profile, or `profileFromCurrent("Default")` when none) and `importProfileDraftConfig()` (parses with `importProfileFile`, and Save stores the theme first, then the profile), both wired into the view.
- Create: `src/features/theme/ui/ProfileControls.tsx`, rendered under `ThemeLibraryControls`.
- Test:
  - `tests/canvas/theme-library-sync.test.ts`
  - `tests/e2e/functional/themeProfiles.spec.mjs`

**Interfaces:**
- Produces, on the store:
  - `profiles: Record<string, ProfileDoc>`
  - `activeProfile: string | null`, mirrored in localStorage `osionos:active-profile` and **not** reset by `resetForAccount`
  - `hydrate(): Promise<void>`: GETs themes and profiles. The server wins per slug or id, and local-only entries are pushed.
  - `switchProfile(id: string | null): void`: applies preferences through the registry, then `setActiveTheme`.
  - `saveProfile(doc: ProfileDoc, id?: string): string`
  - `deleteProfile(id: string): ProfileDoc | null`
  - `resetForAccount(): void`: empties themes and profiles. If the device's active profile is no longer known, `setActiveTheme(null)` and `persistCompiledTheme(null)`.
- **`ProfileControls`:**
  - a **Profile** dropdown ("Default", then the profiles);
  - **New from current**, **Export** (copies, success toast "Profile copied"), **Import** (opens `import-profile`), **Delete**;
  - Delete removes at once and shows the toast "Deleted “<name>”" with an **Undo** action (`useToastStore` from `@/shared/ui`);
  - **Settings (JSON)** opens `{ kind: 'profile' }`.
- Hydrate is called where the other settings stores hydrate on sign-in. Find it with `rg -n "hydrate\(userId\)" src/features/settings src/app`.

- [ ] **Step 1: Write the failing canvas tests.** They stub `api` as in `settings-commands.test.ts`.
  - **Offline save:** the PUT rejects with a network error. The theme stays in `themes`, an error toast is pushed, and the next `hydrate()` PUTs it.
  - **Account switch:** `resetForAccount()` with an active profile naming a theme that only user A had empties `themes`, sets `activeTheme` to null, and clears `osionos:theme-vars`.
  - **Server wins:** `hydrate()` replaces a local theme with the server's version of the same slug.
- [ ] **Step 2: Write the failing e2e.**
  1. New profile from current → switch to "Default" → switch back. The theme and density are re-applied (`data-density`, `--osio-bg-page`).
  2. Export → Import round trip: grant `clipboard-read`/`clipboard-write`.
  3. Settings (JSON): edit `"density": "compact"`, then Save. `data-density="compact"`.
  4. Delete → Undo restores the profile.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run them, then the full canvas suite and the gate.** Expected: PASS, `quality` 0.
- [ ] **Step 6: Commit.** `feat(theme): profiles that follow the account`

**Wave 3 close:** run the wave checklist. This wave also rolls the bridge.

---

## Wave 4 — palette picks and the preference commands (PR 4)

### Task 14: Quick pick in the palette, and recent commands

**Files:**
- Modify:
  - `src/widgets/top-bar/model/commands.ts`: the `QuickPick` types and `PaletteCommand.pick?`.
  - `src/widgets/top-bar/model/usePalette.ts`: `pick`, `openPick` and `endPick`.
  - `src/widgets/top-bar/model/search.ts`: `PaletteResult.pick?`; `matchCommands` passes `pick` through and puts recent ids first when the query is empty.
  - `src/widgets/top-bar/ui/TopBarSearch.tsx`: the pick mode.
- Create: `src/widgets/top-bar/model/recentCommands.ts`
- Test: `tests/canvas/palette-quickpick.test.ts`

**Interfaces:**
- Produces:
  - `interface QuickPickItem { id: string; label: string; description?: string; checked?: boolean }`
  - `interface QuickPick { title: string; items: QuickPickItem[]; onPreview?(item: QuickPickItem): void; onAccept(item: QuickPickItem): void; onCancel?(): void }`
  - `openPick(pick: QuickPick): void`; `endPick(): void` (the query goes back to `">"`)
  - `recordRecentCommand(id: string): void`; `readRecentCommands(): string[]` (≤8, newest first, under `osionos:palette-recent`)
- **Behaviour in `TopBarSearch`:**
  - Activating a result with `pick` opens the pick instead of `run` + close.
  - **In pick mode:**
    - the input filters the items by label, and its placeholder is `pick.title`;
    - the checked item starts active;
    - ArrowUp/ArrowDown move and call `onPreview`;
    - Enter calls `onAccept`, then closes;
    - Escape calls `onCancel` and returns to the command list;
    - an outside click counts as Escape;
    - checked items show a check icon (lucide `Check`) and `aria-selected` follows the active row.
  - Every accepted command id goes to `recordRecentCommand`.

- [ ] **Step 1: Write the failing tests.**
  - `matchCommands('', cmds)` lists recent ids first, then the rest in order.
  - A query of `"dens"` ignores recency.
  - `readRecentCommands` caps at 8 and de-duplicates.
  - The pick model, extracted as a pure `pickReducer`:
    - preview fires on each move;
    - cancel fires once on Escape;
    - accept fires once on Enter;
    - filtering keeps the active item when it still matches.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, then `settingsPalette.spec.mjs` and `paletteCompleteness.spec.mjs`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(palette): second-step pickers with live preview, and recent commands`

### Task 15: Preference, theme and profile commands

**Files:**
- Create: `src/features/settings/model/preferenceCommands.ts`
- Modify: `src/widgets/top-bar/ui/TopBar.tsx:37-45`: load `preferencePaletteCommands()` from the same lazy module chunk as `settingsPaletteCommands` and pass both as `extra`.
- Test:
  - `tests/canvas/preference-commands.test.ts`
  - `tests/e2e/functional/themePalette.spec.mjs`

**Interfaces:**
- Consumes: Tasks 5, 6, 10, 12, 13 and 14.
- Produces `preferencePaletteCommands(): PaletteCommand[]`, group `"Preferences"` (themes: `"Themes"`, profiles: `"Profiles"`).
- **Preferences:**
  - `Preferences: Color Theme`. Pick: Built-in, then `listThemes()`, with the active one checked. `onPreview` applies `compileTheme` without persisting; `onAccept` calls `setActiveTheme`; `onCancel` re-applies the active theme.
  - `Preferences: <registry label>` for each `PREFERENCES` entry: a pick of its options with `read()` checked; `onAccept` calls `write`.
  - `Preferences: Open Theme (JSON)`, `Preferences: Open Settings (JSON)`, `Preferences: Reset Theme`.
- **Themes:**
  - `New Theme from Current`, `Duplicate Theme` (a pick), `Export Theme` (copies the active theme's JSON, toast "Theme copied"), `Import Theme` (`import-theme` tab);
  - `Delete Theme`: a pick of user themes; it deletes at once, with an **Undo** toast.
- **Profiles:**
  - `Switch Profile` (a pick, with "Default" first), `New Profile from Current`, `Rename Profile` (opens `settings.json`);
  - `Delete Profile` (a pick, Undo toast), `Export Profile`, `Import Profile`.
- With `isThemesEnabled()` false, only the registry preference commands are returned.

- [ ] **Step 1: Write the failing canvas test.**
  - Every `PREFERENCES` key has exactly one command.
  - Color Theme's pick has `listThemes().length + 1` items. Preview, then cancel, leaves `activeTheme` unchanged, and the last `applyCompiledTheme` call is the active theme.
  - Density's pick checks the current value. Accepting `compact` calls `updateAppearance({ density: 'compact' })`.
  - With the flag off, no `Themes`/`Profiles` group remains.
- [ ] **Step 2: Write the failing e2e.**
  1. Type `>color theme`, Enter, then ArrowDown twice: `--osio-bg-page` changes on each step. Escape: the original value is back. Repeat with Enter: the value is kept after a reload.
  2. `>density` → Compact sets `data-density="compact"`.
  3. `>` alone lists the last-used command first.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run them, then the gate.** Expected: PASS, `quality` 0.
- [ ] **Step 6: Commit.** `feat(palette): change any preference, theme or profile from >`

### Task 16: Performance budget and live verification

**Files:**
- Create: `tests/e2e/perf/themeApply.spec.mjs`, built on `runInteraction` from `tests/e2e/perf/interactionRun.mjs`.

- [ ] **Step 1: Write the perf spec.** The interaction is an ArrowDown in the Color Theme pick, alternating between Harbor Night and Studio Paper: 30 runs, 5 warm-ups, measured to the next paint. Budget p95 ≤20 ms. Write the report with `writeReport`.
- [ ] **Step 2: Run it.** Command: `PW_BROWSER_SOURCE=system /home/dlesieur/Documents/groot-wt/bin/gate.sh bash scripts/docker-run.sh test-e2e-perf tests/e2e/perf/themeApply.spec.mjs --retries=0`. Expected: PASS, with p95 printed. Judge by p95 over ≥3 alternating runs (the enter median is bimodal on this host).
- [ ] **Step 3: Commit.** `test(theme): theme preview stays inside the 20 ms budget`
- [ ] **Step 4: Live check** after the wave deploys, in a real browser on the funnel:
  - switch through each shipped theme;
  - edit one live in Advanced (JSON);
  - use the `>` previews, and switch a profile;
  - take a screenshot of each state, in light and dark, at 1440 and 390 wide. The screenshots go into the PR.

---

## Wave checklist (after Tasks 5, 9, 13 and 16)

- [ ] **Full gates.** `bash scripts/docker-run.sh quality` exits 0. `test-canvas` and `test-bridge` pass in full. The wave's e2e specs pass with `--retries=0`.
- [ ] **PR.** Push `feat/theme-profiles-w<N>`, then `gh pr create --base main`. Follow `rules/pull-requests.md`: Why, What changed, Evidence (the commands and their results), and before/after screenshots for waves 2–4.
- [ ] **CI.** All jobs green. A red test that predates the change is repaired to the new expected behaviour, never skipped.
- [ ] **Merge and deploy.**
  - Merge by direct SSH push to `main`, then `develop` (owner policy).
  - Message the peer first.
  - Deploy following `/home/dlesieur/Documents/groot-wt/deploy/DEPLOY-NOTES.md`: web only for waves 1, 2 and 4; web and bridge for wave 3.
  - Verify the funnel and append a DEPLOY-NOTES entry.
