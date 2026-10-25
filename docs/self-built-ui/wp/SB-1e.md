# SB-1e — The system-page host: a settings section rendered from its document (self-built UI, phase S1)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 and §10). SB-1d made the document format and its lazy loader. This package renders a document as a settings section, inside today's Settings view, through the same per-section lazy split. From here on, migrating a section (S5) means: write its document, point its panel entry at the host, and delete the old React panel.

Depends on SB-1d (format, loader, `UnsupportedBlock`) and SB-6a (`RenderModeProvider`; a settings page is `live`). Both are merged before this starts.

**OWNS:**
- `src/features/system-pages/ui/SystemPageHost.tsx` (new);
- `src/features/system-pages/ui/systemPagePanel.tsx` (new): `systemPagePanel(id)`, the lazy panel factory;
- `src/app/__styleguide__/sections/SystemPageSection.tsx` (new), plus one line in `StyleGuideRoute.tsx` to mount it;
- tests: `tests/e2e/functional/systemPageHost.spec.mjs` (new).

**MUST NOT TOUCH:** `sectionPanels.tsx` (no section migrates in this package; S5 does that one section at a time), `SettingsView.tsx`, `sections.ts`, the document files.

**Commit message:** `feat(system-pages): host that renders a settings document live, and its styleguide demo`

## Interfaces

- `SystemPageHost({ kind, id }: { kind: SystemDocKind; id: string })`:
  - reads the doc with React 19 `use()` on `loadSystemDoc(kind, id)`'s cached promise, so the caller's existing `<Suspense fallback={<SettingsPanelSkeleton />}>` (`SettingsView.tsx:130`) shows while it loads, with no second spinner;
  - renders `doc.blocks` through `ReadOnlyBlock` (the numbered-list indices as `PageBlocksRenderer` computes them; reuse `createRootBlockRenderMeta` from `entities/block/model/blockVirtualization`), inside `<RenderModeProvider mode="live">`;
  - `null` (missing or invalid doc) renders `<p role="alert">This settings page could not be loaded.</p>` in `--osio-fg-muted`, never a crash and never a blank panel;
  - wraps its blocks in `<div data-system-page={id} className="flex flex-col gap-[var(--settings-section-gap,theme(spacing.9))]">`. If no such token exists, use the same `gap-9` class `SettingsView.tsx:124` uses on its column, so a document's top-level blocks sit at today's section rhythm.
- `systemPagePanel(id: string): LazyExoticComponent<ComponentType<SettingsPanelProps>>` returns a `lazy()` panel that renders `<SystemPageHost kind="settings" id={id} />`. Its signature lets S5 swap one `SETTINGS_PANELS` entry at a time. The deep import path keeps it off the warm chunk.

## Rules

1. One render path. Settings documents render through `ReadOnlyBlock` + the registry, the same path a locked page uses. No settings-specific block renderer exists.
2. Live, not preview. Buttons and (later) fields work inside the host. The e2e proves the mode by reading it in a test-only way (`data-render-mode` on the host root).
3. No layout shift on load: the Suspense fallback is the existing skeleton, and the host adds no top margin of its own.
4. Perf: opening the demo through the host is measured once (Playwright `performance.now()` from the nav click to `[data-system-page]` visible, 10 runs, p95). Report the number; the budget (≤ 61 ms) applies to S5 sections, not to this demo.

## Steps

- [ ] **Step 1: Failing e2e** `tests/e2e/functional/systemPageHost.spec.mjs` (offline build, `/__styleguide`):
  - the "System page" section shows `[data-system-page="styleguide-demo"]` with the demo's heading text, its frame with `data-frame-dir="row"`, and its two paragraphs inside the frame;
  - the host root has `data-render-mode="live"`;
  - with the loader pointed at a missing id (`id="does-not-exist"` in a second demo instance), the alert text shows and the console has no uncaught error;
  - at 375 px, no horizontal scroll (`scrollWidth <= clientWidth`).
- [ ] **Step 2: Run it and see it fail.** `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/systemPageHost.spec.mjs`.
- [ ] **Step 3: Implement** the host, the factory and the styleguide section.
- [ ] **Step 4: Gates.** The e2e passes; `npm run test:quality` rc 0; `npm run build` rc 0, and `build/stats` or `ls build/assets` show the host in its own chunk (`ANALYZE=1` gives `build/stats-chunks.json`); the existing settings e2e (`rg -l "data-settings-panel" tests/e2e`) still passes.
- [ ] **Step 5: Commit** with the message above. No trailer, no push.

## Report

List the files changed, paste the gate lines, the perf p95 and the chunk name, and give the commit SHA. A gate you could not run is SKIPPED with the reason.
