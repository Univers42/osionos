# SB-6f2 — "Show in Settings", the client half: one registry for shipped sections and flagged pages (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §13). SB-6f added the routes that store which pages appear in the Settings nav. This package adds the switch in a page's settings and makes the Settings nav, settings search, the `>` palette and deep links read one list: the shipped sections from `sections.ts` plus the pages flagged for this viewer. A flagged page opens in the Settings tab like a shipped section, live, and carries a "Custom · by <author>" mark so it is never mistaken for the real thing.

Base: the integration tip with SB-6f and SB-6a merged.

## What exists (read these first)

- **The registry and its readers:** `src/features/settings/model/sections.ts` (`SETTINGS_SECTIONS`, `findSection`, `searchSettings`), `sectionTypes.ts` (`SettingsSectionId`, `SETTINGS_GROUPS`), and every reader: `ui/SettingsSectionsNav.tsx:63`, `ui/SettingsView.tsx:87-90`, `model/settingsCommands.ts:34`, `model/settingsDeepLink.ts`, `model/settingsNav.ts`, `ui/sectionPanels.tsx` (`SETTINGS_PANELS`), `widgets/top-bar/model/menus.ts`, `widgets/top-bar/ui/TopBar.tsx` (`rg -l SettingsSectionId src`).
- **The page's settings:** `features/settings/page-settings/PageSettingsPanel.tsx` (`Section`, `SettingRow`, `ConfirmModal` from `settingsKit`).
- **The contract:** SB-6f's `GET/PUT/DELETE /api/settings-pages`, `Entry`, `SETTINGS_PAGE_ICONS` (`scripts/bridge-settings-pages.mjs`).
- **Rendering a page live:** `BlockEditorSurface` and the Edit/View switch (SB-6a); `api` and `getActivePageJwt` (`src/shared/api/`), the pattern the settings stores use (`src/store/settings/*`).
- The memory rule `extend-existing-settings`: extend these files; add no second list.

**OWNS:**
- `src/store/settings/useSettingsPagesStore.ts` (new): `entries`, `status`, `hydrate(workspaceId)`, `flag(pageId, input)`, `unflag(pageId, audience)`;
- `sections.ts`, `sectionTypes.ts` (modified): `SettingsEntry`, `settingsEntries(pages)`, `useSettingsEntries()`, `findEntry`, page hits in `searchSettings` (Interfaces);
- every reader listed above (modified) to read `useSettingsEntries()` / `findEntry` instead of `SETTINGS_SECTIONS` / `findSection`;
- `src/features/settings/ui/SettingsPagePanel.tsx` (new, lazy): the flagged page, live, with the mark;
- `src/features/settings/page-settings/ShowInSettingsDialog.tsx` (new) and one `SettingRow` in `PageSettingsPanel.tsx`;
- `src/features/settings/model/settingsPageIcons.ts` (new): icon name → lucide component, keys equal to `SETTINGS_PAGE_ICONS`;
- tests: `tests/canvas/settings-entries.test.ts`, `tests/canvas/settings-page-icons-agreement.test.ts`, `tests/e2e/bridge-stub/showInSettings.spec.mjs` (new), and a `settingsPages` route in the bridge stub (added, nothing changed).

**MUST NOT TOUCH:** the bridge, the shipped sections' ids, labels, anchors and order, `SETTINGS_PANELS`' shipped entries.

**Commit message:** `feat(settings): any page can join the Settings nav, through one registry`

## Interfaces

```ts
type SettingsEntryId = SettingsSectionId | `page:${string}`;
type SettingsEntry =
  | (SettingsSection & { kind: "section" })
  | { kind: "page"; id: `page:${string}`; pageId: string; group: string; groupLabel?: string; label: string; title: string;
      icon: LucideIcon; anchors: readonly []; audience: "me" | "workspace"; authorName: string };
function settingsEntries(pages: readonly Entry[]): readonly SettingsEntry[];   // pure: shipped sections in registry order, then pages
function useSettingsEntries(): readonly SettingsEntry[];                       // the store + settingsEntries, memoised on the store's entries
function findEntry(id: string, entries: readonly SettingsEntry[]): SettingsEntry | undefined;
```

## Rules (each one is tested)

1. **One list.** The nav, search, the palette, the deep link, the view header and the panel loader all read `useSettingsEntries()` (or `settingsEntries` where no hook can run). No reader keeps its own copy. Test: one flagged page appears in all six, and `rg "SETTINGS_SECTIONS" src` lists only `sections.ts` and the tests.
2. **Order.** Shipped sections keep today's order and groups. A page entry goes into its group after that group's shipped sections, by `position`, then `label`. Custom groups (`custom:<slug>`) come after the four shipped groups, ordered by their lowest `position`. When the store is empty or unavailable, `settingsEntries([])` equals today's list exactly (test: deep-equal ids, labels, groups, anchors).
3. **Never mistaken.** A page entry's id is `page:<uuid>`, so it can never take a shipped id. Its panel shows the page title as the heading and, under it, "Custom · by <authorName>" in `--osio-fg-muted` with the icon `BadgeInfo`, before any page content. In the nav its row carries the same mark as a visually hidden suffix (", custom"), so a screen reader hears it too. Test: the mark is present for both audiences and absent for every shipped section.
4. **Live, as the viewer.** `SettingsPagePanel` renders the page through `BlockEditorSurface` with the page's own Edit/View state (SB-6a), so buttons and fields work and bindings resolve for the viewer (design §5). A page the viewer cannot read never reaches the panel (SB-6f filters it); a stale `page:` deep link to an entry no longer listed falls back to Profile, as a stale section id does today (`SettingsView.tsx:86`).
5. **The switch.** `PageSettingsPanel` gains a "Show in Settings" row (button "Show in Settings…", or "In Settings · Edit" when flagged) that opens `ShowInSettingsDialog`: audience ("Only me" / "Everyone in this workspace"; the second is offered only when the viewer is the workspace owner or an admin, the server deciding), group (the four groups, the custom groups in use, or "New group…" with a name field), label (default the page title), icon (a grid of `settingsPageIcons`), position ("At the end" or a number). Save calls `flag`; "Remove from Settings" calls `unflag` after a confirm. A refused write (403, 422, 409, 429) shows the server's message under the form and keeps the dialog open.
6. **Offline and failure.** With no bridge (`VITE_API_URL` empty) or a failed GET, the store is `unavailable`, the nav shows the shipped list, and the switch row says "Needs a connection to the server" with the button disabled.
7. **Icons agree.** `settingsPageIcons`' keys equal the bridge's `SETTINGS_PAGE_ICONS` (an agreement test reading both, like `bridge-page-write-agreement.test.ts`).
8. **Perf.** Opening Settings with 50 flagged pages: the nav renders with no long task over 50 ms, and `useSettingsEntries` recomputes only when the store's entries change (a counter test).

## Steps

- [ ] **Step 1: Failing tests.** Canvas: `settingsEntries` (Rule 2's order and the empty-list equality), `findEntry`, page hits in `searchSettings`, the agreement test, Rule 8's counter. e2e (`showInSettings.spec.mjs`, `PLAYWRIGHT_BRIDGE_STUB=1`, the stub answering `/api/settings-pages`): flag a page "Only me" into Account at position 0, see it in the nav, search, the `>` palette and through `?settings=page:<id>`; open it, see the mark and a working button; remove it; an admin sees "Everyone", a member does not, and a stubbed 403 shows the message.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/settings-entries.test.ts tests/canvas/settings-page-icons-agreement.test.ts`; `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e tests/e2e/bridge-stub/showInSettings.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the palette reads `SETTINGS_SECTIONS` directly;
  - (b) the panel omits the mark for "Only me" entries;
  - (c) a page entry sorts before its group's shipped sections.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the new e2e green; `settingsKit`, `mcpSettings` and the settings deep-link e2e unchanged and green (name the files). Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the reader list you changed, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
