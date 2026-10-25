# Self-built UI — the app's own screens made from its own blocks

Status: design v2, waiting for the owner's approval (2026-10-25). Nothing here is built yet.
v2 adds the bootstrapping ladder, the authoring loop, components, and the performance architecture.
The plan: `docs/superpowers/plans/2026-10-25-self-built-ui.md`.

## Intent

osionos lets people build pages from blocks (`/button`, columns, layout, database views…). The app's
own screens are not built that way: they are hand-written React with hardcoded Tailwind. The owner's
goal, in their words: *"build the app with the app, like the compiler is built with the compiler
itself"* and *"if our app cannot be built with our own tools, then what's the point?"*

So:

1. Every settings page is rebuilt from page blocks, keeping **exactly** today's look: same layout,
   spacing, colours, light and dark, phone and desktop.
2. The blocks become a **reusable UI collection**: every block can be reshaped, relaid out and
   recoloured, and the styles that make the settings look the way they do are saved, named and
   reusable ("presets").
3. The same blocks are available to every user through `/` on any page, so people build their own
   tools with the components the app itself is built with.
4. Page building gets Figma-grade direct manipulation: select a block, change its layout and style
   in a panel, drag it to rearrange.

Settings is the first app surface to go through this, because it is the largest set of plain UI
patterns (23 sections, 45 anchors, 83 files, 9,335 lines). The rest of the app shell (sidebar, top
bar, chat) is a later project.

## The bootstrapping ladder

A compiler becomes self-hosting in stages. A first compiler written in another language compiles
a second compiler written in the new language. The second one then compiles itself, and its
output stops changing (the fixpoint). The app follows the same ladder:

| Stage | What is code | What is a document | Proof it holds |
|---|---|---|---|
| 0. Kernel | `@osionos/ui` components, block renderers, the runtime (bindings, actions, formula VM, layout) | — | the existing gates |
| 1. Screens | the kernel only | every settings section | the section renders from its document, matches today's screenshots, and its document round-trips through the editor unchanged |
| 2. The builder | the kernel only | the style inspector, the slash catalogue, the settings shell (nav, search) | the inspector edits its own document and re-renders with the change |
| 3. The app | the kernel only | the sidebar, top bar, rail, Home; components and presets shared through the marketplace | the app shell renders from documents |

The kernel stays small and stable. Everything above it is data the app itself can edit. This
document designs stage 1 in full and fixes the interfaces stage 2 needs. Stages 2 and 3 are
roadmap: each gets its own design when stage 1 ships.

**The authoring loop** is what makes the app build itself rather than merely render JSON.
Shipped documents are authored **in the editor**:

1. Open the system document in the editor.
2. Edit it with the same blocks, inspector and components users have.
3. Export it into the repo as canonical JSON.
4. CI validates the document and the parity screenshots.
5. It ships.

A document written by hand or by a script must survive the same path: load → editor → export
gives byte-identical JSON. That round-trip is the fixpoint test.

## What exists today (measured 2026-10-25 on develop 3be8dc71b)

Recon journals: `groot-wt/selfhost/{inv-A,inv-B,inv-C,blocks}.report.md` (opencode, read-only),
spot-checked against the code.

- `src/features/settings`: 83 `.tsx` files, 9,335 lines. 54 raw `<button>`, 49 raw `<input>`,
  14 `<select>`, 3 `<table>`, 841 `className=`, 620 arbitrary `[var(--osio-*)]` classes.
- 55 of the 83 files already import `@osionos/ui` through `@/shared/ui` (which re-exports it,
  `src/shared/ui/index.ts:22`): Button ×42, Modal ×17, Toggle ×11, IconButton ×8, Dropdown ×8,
  Input ×7. The settings-only kit `src/features/settings/ui/settingsKit.tsx` (Section, SettingRow,
  DataTable, MiniTabs, Avatar, FeatureCard, PanelStatus, EmptyState) is used by 35 files.
- None of it is page blocks. The block model (`src/entities/block/model/types.ts:144-200`) has
  flat style fields only (`textColor`, `backgroundColor`, `widthRatio`, `buttonVariant:
  'primary'|'secondary'`), no generic style.
- There is no input / select / toggle block (`types.ts:22-57`). Binding is read-only
  (`BoundFieldReadOnly.tsx:25-36`, `binding.ts:77-85`). Only layout cells have a visibility
  formula (`types.ts:140`).
- The `button` block renders its own classes (`ReadOnlyBlock.tsx:589`), not `@osionos/ui` Button.
  `ButtonProgram` (`entities/block/model/buttonProgram.ts:23-78`) has `set`/`if`/`repeat`/
  `forEach`/`action` steps with `notify`, `set_property`, `page_action` actions and budgets.
- The layout canvas (`LayoutBlockEditor.tsx` + `layout.{constants,helpers,types}.ts`) is a
  1–24 column grid with row height 96–320 px, collision-checked drag/resize, per-cell sizing,
  constraints, padding steps and `visibilityFormula`; below 768 px it collapses to one column
  (`notionPage.css:1087`). Too coarse for a 44 px setting row; right for dashboards.
- Database views (vendored `notion-database-sys`) have table/list/board/gallery/… views,
  per-view hidden properties, a `button` property, and read non-database sources through
  `dataSourceRegistry`; the app registers 7 `sys:` sources (`sysDataSources.ts`: my-pages,
  my-tasks, my-published, my-connections, my-workspaces, my-sessions, my-activity).
- Block rendering is a `switch` in `BlockEditor.tsx` and `ReadOnlyBlock.tsx`; a new block type
  touches about 8 files (renderers, surface spacing, context menu, markdown/HTML/PDF export, slash).
- Precedent for a shipped page users can edit: the Home dashboard
  (`MainContent.tsx:90-149`, `homeContentMerge.ts:66-116`): seeded content, a version, and a merge
  that keeps user edits and deletions across a new shipped version.

## Goals

- **G1. Every settings section renders from a block tree** ("system page"), not panel JSX.
- **G2. Visual parity**: each section at 375 and 1440 px, light and dark, matches today's
  screenshot (threshold under *Verification*).
- **G3. One component per pattern**: every UI pattern in settings maps to exactly one block or
  one preset. Nothing is implemented twice.
- **G4. Reusable style collection**: every block has a token-driven style; the looks used by
  settings ship as named presets; a user can apply a preset, change it, and save their own.
- **G5. Users can edit settings pages**: open a settings page, rearrange and restyle their own
  copy, and reset it to the shipped version.
- **G6. Figma-grade editing**: an auto-layout frame block, a style inspector, drag to reorder.
- **G7. The same blocks on any page** through `/`.
- **G8. The authoring loop**: shipped documents are authored in the editor and exported. Every
  document round-trips byte-identically. At least one section is authored end to end through
  the editor UI.
- **G10. Edit and View on every page** (§12). Edit arranges and restyles. Clicking Edit again
  returns to View, where the page is fully usable: fields write, buttons run, lists act.
- **G11. Any page can become a settings page** (§13): a switch in the page's own settings puts
  it in the Settings nav, in the group the user picks.
- **G9. Interactions stay under one frame of app cost at any size** (budgets in §11): a toggle,
  a keystroke or an inspector change costs the same whether the page holds 10 blocks or 2,000,
  and whether a list holds 10 rows or 10,000.

## Non-goals

- No change to settings behaviour, server routes, stores or API modules. The block pages call
  the same functions the React panels call today.
- No new colours, fonts or tokens beyond spacing/size steps mapped onto existing tokens. The
  generated palettes stay authoritative (`scripts/build-tokens.mjs`).
- No custom CSS or code from users. Style is data drawn from fixed token scales.
- The settings shell (section nav, settings search, the sudo prompt host) stays React, built
  from `@osionos/ui`. Only section content becomes blocks. (Shell-as-blocks is a later project.)
- Rest of the app shell: later.

## Anti-goals (a failure even if it "works")

- **A second component system.** A block that re-implements what an `@osionos/ui` component does,
  or two blocks for one pattern.
- **A page gaining power.** Editing a settings page must never let a user skip a confirmation, a
  typed confirm or the sudo prompt, call an action the current UI can't, or show another user's
  data. The guards live in the action registry, not in the page.
- **Losing a safety control.** A user must not be able to delete "Sign out of all sessions",
  2FA, password or account-deletion controls from their copy and never find them again.
- **Visible regressions**, or a settings tab that opens slower than today.

## Architecture

### 1. Three layers, one implementation per concern

```
@osionos/ui component   (React, token-driven, props = variants)       packages/osionos-ui
        ▲ rendered by
block type              (stored data: type + props + style + bind)    src/entities/block/…
        ▲ composed into
system page             (shipped block tree per settings section)    src/features/system-pages/…
```

- Every block renders through an `@osionos/ui` component. Panel JSX that needs a component the
  package lacks moves into the package first (settingsKit's pieces become package components or
  frame presets, then settingsKit is deleted).
- `@osionos/ui` is a git submodule: commit inside it first, then record the SHA.

### 2. Block registry (replaces adding cases to the switches)

New block types register once: type, slash label/aliases/keywords/icon, props schema, style
schema, defaults, read-only renderer, editor renderer, markdown/HTML/PDF export, surface spacing.
The existing switches consult the registry for registered types and keep their current cases;
existing types migrate to the registry only when touched. (Rung 7: about 12 new block types, so
the abstraction has more than three real implementations.)

### 3. Block style model

A typed `style?: BlockStyle` field on `Block` (additive: the type already allows extra keys,
`types.ts:199`). Every value comes from a fixed scale; unknown values are dropped when loading.

| Property | Values (all map to existing tokens) |
|---|---|
| tone | default, primary, subtle, ghost, danger, danger-subtle, success, warning, accent |
| size | sm, md, lg |
| text / background | semantic tokens (`--osio-fg-*`, `--osio-bg-*`) + the 9 block tints (`blockColors.ts:16-26`) |
| border | none, subtle, default, strong, danger, accent; sides: all, top, bottom, x, y |
| radius | none, sm, md, panel, lg, full (`--osio-radius-*`) |
| padding / gap | steps 0–12 on `--spacing` (all, x, y) |
| width / height | hug, fill, fixed step; min/basis step |
| align / justify | start, center, end, between, stretch |
| text | size step, weight (regular/medium/semibold), the `osio-h1..h4` roles |
| shadow | none, menu, panel (`--osio-shadow-*`) |

- Existing flat fields (`textColor`, `backgroundColor`, `buttonVariant`, `widthRatio`) keep
  working as fallbacks: when `style` sets the same property, `style` wins. No migration of
  stored pages.
- Rendering uses data attributes and CSS custom properties read by static CSS in
  `src/app/styles/` (no style strings built from user data, so `check-style-tokens.sh` and the
  ESLint token rules keep holding).

**Presets** are named `BlockStyle` values (plus default props) for a block type: "Setting row",
"Card", "Feature card", "Danger zone", "Item list row", "Primary button"… Shipped presets
reproduce today's settings look exactly and are read-only. Users can save their own presets.
Presets are the reusable style collection.

- A block stores a **reference** to its preset plus its own overrides, as with Figma styles.
  Changing a preset changes every block that uses it, and a new shipped version of a preset
  reaches every page. "Detach" copies the preset's values into the block and drops the
  reference.
- A preset belongs to one block type: frame presets apply to frames, button presets to buttons.

### 4. Layout: the grid canvas for the page, frames inside cells

The owner's picture is a base editor in a strategy game such as Clash of Clans. The page is a
grid of cells. You take a component from a tray, drop it on a free spot, drag it around (it can't
overlap another one) and resize it. When you leave edit mode, everything you placed works. That
is the existing canvas `layout` block (grid, cells, drag and resize with collision checks,
per-cell constraints, `visibilityFormula`) promoted to be the page skeleton of every system
page. Four upgrades make it able to hold settings:

1. **Fine rows.** A row unit from 8 px (today the minimum row height is 96 px,
   `layout.constants.ts:37-42`), so a 44 px setting row is one cell and not a 96 px box.
2. **Hug cells push.** A cell sized to its content grows with it (a list that gets rows) and pushes
   the cells below it down instead of overlapping them. The cell sizing mode and `measuredHeight`
   exist; reflow on growth is the new part.
3. **A narrow layout.** Today the grid collapses to one column at 768 px (`notionPage.css:1087`).
   Instead each cell gets a second placement for narrow panes, by default derived from reading
   order and adjustable in Edit at narrow width.
4. **The component tray.** In Edit, the component and preset library opens as a tray. Drag a
   component onto the grid to place it, as you place a building.

Inside a cell, content flows in a **frame**, described below.

#### The auto-layout frame (new)

A new `frame` block is a flexbox container, like Figma's auto layout: direction (row/column),
wrap, gap, padding, align, justify, dividers between children (today's `divide-y`), child sizing
(hug/fill/fixed/basis), and responsive rules on the **pane width** through container queries at
fixed breakpoints (480, 720, 1024): change direction, hide, change gap. Today's settings layout
uses a 720 px container query (`SettingsView.tsx:116`), so pane width rather than viewport width
is a requirement, not a preference.

Frames nest freely and may hold any block, including a nested canvas. The grid places things
on the page. Frames lay out what flows inside a cell: a setting row, a card's contents, a
button group, the rows of a list. Every layout in the inventory (stack, row, two-column, card,
setting row, button group, sidebar+content) is a grid placement, a frame with a preset, or both.

### 5. Data binding (read and write) and actions

- **Sources.** A registry of bindable sources that wraps the existing stores and API modules:
  - record sources, `settings:<name>` (preferences, notifications, profile, AI settings, …);
  - list sources: the existing `sys:` sources plus new ones for settings lists (sessions,
    passkeys, emails, linked identities, tokens, SSH/GPG keys, authorized apps, export jobs,
    connections, members, invites, memories, skills, MCP approvals, …).
  Each source declares its fields: type, label, options, validation, read, and write. A write
  calls the same store action or API function the React panel calls today.
- **Bind.** `bind: { source, field }` on a block. A `field` block reads and writes. `chip`,
  `avatar`, `meter` and text read. Inside a collection, `$row` is the current item.
- **Who sees what.** Bindings resolve for the **viewer**, never the author. On a shared page,
  each viewer sees their own value. On a public page, bound blocks render a placeholder.
- **Actions.** A registry of app actions (revoke a session, remove a passkey, sign out
  everywhere, rename, export, delete the account, …). Each action declares its parameters, its
  guard (`confirm: none | simple | typed(<field>)`, `sudo: auto` through the existing
  `sudo_required` event and SudoPrompt), whether it is destructive, and its result shape (for
  example the one-time secret). The `ButtonProgram` gains one action, `app_action { name, args }`.
  The runner reads the guard from the registry, so a page can never weaken it. The existing
  program budgets apply.
- **Action parameters** are typed in the registry and resolved from bindings (`$row.id`, a
  field's value), never typed in as free text. An action runs as the viewer, through the same
  API call the React panel makes today, so the server's existing ownership checks decide. An id
  that belongs to another user is refused exactly as it is now. Actions add no server route.
- **Visibility.** `visibleWhen` (a formula) on any block, evaluated by the existing formula
  engine the canvas cells use (`evaluateCellVisibility`). It covers flags, plan, role and state.
  It only hides: the server still enforces every permission.

### 6. Block catalogue (pattern → block; nothing duplicated)

| Pattern (inventory) | Today | Becomes | Kind |
|---|---|---|---|
| section (title, anchor) | settingsKit `Section` | `heading_*` + `frame`; headings gain `anchor` for `?settings=<id>#<anchor>` | extend |
| stack, row, two-column, grid, sidebar+content | Tailwind `space-y-*`/`flex` | `frame` | **new** |
| setting row | `SettingRow` | `frame` preset "Setting row" | preset |
| card, feature card, danger zone | `Card`, `FeatureCard`, `DangerZone` | `frame` presets | preset |
| button, icon button, button group | `Button`, `IconButton`, 54 raw `<button>` | `button` (gains every `@osionos/ui` tone/size, icon, icon-only with required label, loading/disabled, `app_action`); a group is a row frame | extend |
| field, textarea, select, toggle, checkbox, radio, segmented, search | raw `<input>`/`<select>`/`<textarea>`, `Toggle`, `Dropdown`, `Checkbox` | `field`: one block whose display follows the bound field's type (text, email, url, number, password, multiline, switch, checkbox, dropdown, segmented, radio, checkbox list, search). `/input`, `/select`, `/toggle`, `/checkbox` insert it with a preset display | **new** |
| item list, data table, empty state | hand-built lists, `DataTable`, `EmptyState` | `collection`: repeats a block template per row of a list source; display list, table or grid; an empty slot; row actions are `button` blocks bound to `$row` | **new** |
| tabs | `MiniTabs` | `tabs` container (one child frame per tab, counts bound) | **new** |
| badge, status chip | `Badge`, chips | `chip` | **new** |
| avatar, app icon | `Avatar` | `avatar` (round or square) | **new** |
| progress, meter | div bar with ARIA | `meter` | **new** |
| status banner, panel loading/error/retry | `PanelStatus`, `role=alert` text | `status`, bound to a source's or action's state | **new** |
| secret reveal (show-once token) | token box | `secret`, bound to an action result | **new** |
| modal | `Modal` | `dialog` container, opened by a button action | **new** |
| confirm, typed confirm, sudo | `ConfirmModals`, `SudoPrompt` | **not blocks**: guards run by the action runner (§5) | runner |
| link | rich text | the existing inline link | reuse |
| people database | `ObjectDatabase` adapter | the existing database block over a source | reuse |
| avatar/banner crop upload, 2FA enrolment, passkey registration (WebAuthn), permission matrix, import dropzone, sentiment chart | dedicated React flows | `widget`: a registered app flow placed as a block | widget |

**Widgets** are the honest boundary. A flow that is inherently code (image crop, WebAuthn,
TOTP QR and verify, the policy matrix) stays a React flow, built only from `@osionos/ui` and held
to the same conformance check. As a block, it can be placed, moved, restyled as a container and
hidden like any other. The widget list is fixed in this document. Adding one needs a reason, and
the target is to shrink the list over time.

### 7. System pages: shipped, customizable, resettable

- Each settings section has a shipped system document (§10), versioned with the same
  version-and-fingerprint scheme as the Home dashboard. The settings tab renders the viewer's
  copy if one exists, otherwise the shipped page.
- **Edit this page** creates the user's copy. **Reset to default** deletes it. A new shipped
  version merges into an existing copy with `homeContentMerge` semantics, so user edits and
  deletions survive and new shipped blocks appear.
- Users edit their copy like any page: insert any block, delete any block that is not
  required, move, restyle, rebind.
- **Required blocks** (session sign-out, 2FA, password, account deletion, and the like) are
  marked by their stable block id in the shipped tree. In a copy they can be moved and restyled,
  but not deleted, hidden (a copy's `visibleWhen` on them is ignored; the shipped one applies),
  disabled or sized below their minimum. The editor refuses with "This control is required".
  At render time the host re-inserts any required block missing from a copy at its shipped
  position, so a stale or hand-crafted copy cannot drop one. Settings search always finds the
  shipped anchor.
- **Storage.** One row per user per settings section, in a new table
  `osionos_user_system_pages(user_id, page_id, base_version, blocks jsonb, updated_at)`, with
  owner RLS like the rest of the account plane. It is not a section of `osionos_user_settings`,
  whose per-section values are capped at 16 KB by a DB CHECK, too small for a page. User presets
  get their own table with the same shape. This is a root `models/` migration, so it goes
  through the devil gate. The bridge validates every stored tree: block-type allowlist, depth,
  size, and style values on their scales. A stored tree is user input on both sides of the
  trust boundary.
- Settings editing ships behind the flag `osio.settings.edit` (default off) until G5 is done.
  Rendering settings from blocks has no flag: each migration PR deletes the old panel in the same
  change, and parity plus the existing e2e suites guard it.

### 8. Editing (Figma-grade)

- **Selection.** Click a block to select it; a breadcrumb shows its frame ancestors.
- **Style inspector.** A right-side panel generated from the block's style and props schema,
  with groups Layout, Style, Text, Binding, Visibility and Preset (apply, detach, save as
  preset). Its look follows the existing canvas cell inspector.
- **Drag.** Reorder inside a frame and move across frames, with the existing selection layer
  (`blockSelectionStore`) and command bus. A resize handle sets fixed width.
- **Keyboard.** Every inspector control is reachable by keyboard. Drag has keyboard move
  commands.

### 9. Components (reusable structure)

Presets reuse one block's look. **Components** reuse structure: a named block subtree with
**slots** (where an instance puts its own blocks), **props** (texts, bindings and style values
an instance may override) and **variants** (named override sets). An `instance` block references
a component by id and version, and editing the component updates every instance, as with Figma
components or WordPress synced patterns.

- Shipped components: Section, Setting row, Toggle row, Field row, Item list, Danger zone,
  Empty state, Feature card, Secret box.
- Shipped documents use components instead of copying subtrees. This is library-first applied
  to documents: today `SettingRow` sits in dozens of places, and 23 documents with copied
  subtrees would be the same duplication moved into JSON.
- Instances expand at render time, memoised by (component id, component version, instance
  props), so a hundred setting rows share one expansion path.

### 10. System documents and the authoring loop

- **Format.** One canonical JSON file per document under `src/system-docs/<kind>/<id>.json`
  (kinds: `settings`, `components`, `presets`). Keys are sorted, ids are stable, and no runtime
  field is stored.
- **One schema** is generated from the block registry by `scripts/build-system-doc-schema.mjs`
  into `src/system-docs/schema.generated.json`. Like `build-tokens.mjs --check`, the gate fails
  when the file is stale. The app's loader, the dev export, the CI check and the bridge's
  user-copy validation all read this one file.
- **Loading.** Each settings document is its own lazy chunk, the same per-section split the
  panels have today. It is parsed and validated once and then cached.
- **Unknown content.** A block type or style value the running app does not know renders as an
  inert "Unsupported block" placeholder in the editor and nothing in read-only. It never
  crashes, and it is kept on save so a newer app can read it again.
- **Dev export.** A dev-server-only middleware (`vite.config.ts`, `apply: 'serve'`) accepts the
  editor's "Export as system document". It validates against the schema and writes canonical
  JSON under `src/system-docs/`. It does not exist in any build.
- **Fixpoint test.** For every file in `src/system-docs/`: load → normalise through the editor
  model → serialise gives identical bytes.

### 11. Performance architecture

The measurement comes first. The existing harness (`tests/e2e/perf/perfHarness.mjs`) measures
input → second animation frame. In this Docker environment with software rendering, its floor is
30–32 ms median (`interactions.spec.mjs:34`), already above 20 ms. So "under 20 ms per
interaction" is defined as **app cost**: the p95 minus the floor median, at most 16 ms (one
frame). JavaScript work (handler plus React commit, read with the perf probe's `timed()`) must
stay at most 8 ms p95.

| Interaction | Budget (app cost, p95) | Scale case |
|---|---|---|
| toggle a bound switch | ≤ 16 ms | page with 300 bound fields |
| keystroke in a bound field | ≤ 16 ms | same |
| click a row action (optimistic) | ≤ 16 ms | collection of 10,000 rows |
| scroll a collection one screen | no long task > 50 ms | 10,000 rows |
| inspector change on the selected block | ≤ 16 ms | page of 2,000 blocks |
| drag a block one slot | ≤ 16 ms per frame | frame of 200 children |
| open a settings section | ≤ today's p95 (51.1 ms measured, budget 61) | the largest section |
| scaling | p95 at the large case − p95 at the small case ≤ 2 ms | every row above |

How the design meets these numbers:

1. **Structural sharing and per-block memo.** An edit replaces only the path to the changed block.
   `ReadOnlyBlock` already compares block identity (`ReadOnlyBlock.tsx:180`), so a change
   re-renders O(depth) blocks, not O(page).
2. **Per-field subscriptions.** Each bound block subscribes to exactly one (source, field) through
   `useSyncExternalStore` and a per-field listener map. A toggle re-renders one block. React
   context carries only the stable runtime handle, never values.
3. **Style compiled once.** `resolveBlockStyle` turns (preset, overrides) into data attributes and
   CSS custom properties, memoised by identity and preset version. The CSS is static, so no
   stylesheet is injected at runtime and no document-wide style recalculation happens.
4. **Formulas compiled once.** Each `visibleWhen` is compiled once, cached by its source text, and
   re-evaluated only when a field it reads changes.
5. **Virtual lists.** A collection renders only visible rows through `@tanstack/react-virtual`,
   which is already a dependency. Rows come from keyset pages of the list source and are
   memoised by row id and version.
6. **The editor overlay.** Selection and drag render in one overlay positioned with transforms.
   The selected block does not re-render, and a drag commits once, on drop.
7. **Heavy work off the interaction path.** Validating a large import, merging a new shipped
   version into a user copy and building the settings search index run at load, at idle or in
   a worker, with an in-process fallback, as the graph engine already does
   (`layoutBridge.ts:createWorker`).
8. **Chunks.** No new block may grow the warm chunk. Rarely used blocks and every widget load
   lazily. `ANALYZE=1` measures the chunks before and after.

Caveat: these budgets are measured in this Docker environment with software rendering, so a
real GPU machine is faster and a low-end phone is slower. The scaling rows are the part that
transfers, because a cost that stays flat with N stays flat on every machine.

### 12. Edit and View, on every page

Each page already has a view-only state: the page lock (`locked` in the page config, toggled by
the `lock_page` action, `usePageActions.ts:211`). A locked page renders through `ReadOnlyBlock`
(`BlockEditorSurface.tsx:737-745`), and the canvas has its own `preview` flag
(`types.ts:94`, `LayoutBlockEditor.tsx:1164`). This project makes that state the **View** mode
the owner describes, on every page:

- **One Edit button** in the page header switches between Edit and View. Edit shows the grid,
  handles, the tray and the inspector. View hides them all, and the page works.
- **View is live, not inert.** In View, registered blocks render through their read-only renderer
  in `live` mode: a field writes its setting, a button runs its action, a collection's row actions
  work. The same renderer in `preview` mode (hover cards, marketplace thumbnails, profile previews
  through `PageBlocksRenderer`) is inert and never writes. The mode comes from context, so a
  preview can never trigger a write.
- **Who may edit.** On a normal page, Edit follows the page's edit permission as today. On a
  settings page, Edit edits the viewer's own copy (§7), and View is the default.
- **Per page.** Each page's own settings panel (the page menu and page settings) holds its tools:
  lock, Edit, grid options (columns, row unit, narrow layout) and "Show in Settings" (§13).

### 13. Any page can be a settings page

- **The switch.** "Show in Settings" in a page's own settings takes a group (an existing one or a
  new one), a label, an icon and a position. The page then appears in the Settings nav next to
  the shipped sections and opens in the Settings tab like them.
- **One registry.** The Settings nav, settings search, the `>` palette and deep links read one
  list: the shipped sections from `sections.ts` plus the pages flagged for this viewer. There is
  no second list (memory `extend-existing-settings`: extend, never duplicate).
- **Who sees it.**
  - "Only me" is open to anyone who can edit the page.
  - "Everyone in this workspace" is for workspace owners and admins only, checked on the server
    as page sharing is today.
  - Readers see a flagged page only if they can read it.
- **Never mistaken for the real thing.** A custom settings page carries a small "Custom · by
  <author>" mark under its title, and it cannot take a shipped section's id or anchor. Its
  bindings resolve for the viewer (§5), so a custom page can only show and change the viewer's
  own settings, through the same guarded actions.

## Verification (the finish line)

| Check | How | Pass |
|---|---|---|
| Built with blocks | a test iterates `sections.ts` and asserts each section id has a system page and no panel component | every section |
| Conformance | `scripts/check-built-with-blocks.sh` in `test:quality`: raw `<button\|<input\|<select\|<textarea\|<table` and `[var(--osio-` classes in `src/features/settings/**` and widget files, counted against a ratchet file that may only decrease | ends at 0 |
| Visual parity | Playwright with the stub bridge and a frozen clock: 23 sections × 375/1440 × light/dark = 92 screenshots, baselines taken from the pre-migration commit in the same container | ≤ 0.1% differing pixels per shot; a larger diff needs a written reason in the PR |
| Behaviour | the existing settings e2e specs (`tests/e2e/bridge-stub/*` and the rest, 46 files mention settings) pass with their assertions unchanged | green, no assertion edits |
| Gates | `npm run test:quality`, `test:canvas`, `test:bridge` | rc 0 |
| Speed | `tests/e2e/perf/selfBuilt.spec.mjs` (`PLAYWRIGHT_PERF=1`), the cases in §11, with numbers recorded in the spec as `interactions.spec.mjs` does | every §11 budget |
| Fixpoint | `tests/canvas/system-doc-roundtrip.test.ts` over every file in `src/system-docs/` | byte-identical |
| Authoring | at least one section document authored through the editor UI and exported, with the session recorded | done |
| Users | e2e: Edit this page → restyle a block → reload → persisted → Reset → shipped look; a required block refuses delete | green |
| On any page | e2e: `/input` bound to a preference on a normal page toggles the real setting | green |

Caveat: pixel parity is checked locally, not in CI. Committed baseline PNGs fail in this
environment's renderer (memory `e2e-system-chromium`), so baselines and comparisons must come from
the same container run. Font hinting differences between machines are invisible to the check.

## Phases

The work packages and their order are in the plan. In short:

| Phase | Delivers |
|---|---|
| S0 Baseline | parity harness and baselines, conformance ratchet, perf baseline of today's settings |
| S1 Kernel | block registry, `BlockStyle` + static CSS, `frame`, `visibleWhen` on any block, system-document format + schema + fixpoint test, the system-page host |
| S2 Fields | source registry with per-field subscriptions, settings record sources, `field` with every display |
| S3 Actions | 👹 action registry + `app_action` + runner guards, `button` on `@osionos/ui`, `chip`, `avatar`, `meter`, `status`, `secret`, heading anchors |
| S4 Data and reuse | `collection` (virtual), list sources, `tabs`, `dialog`, `widget`, components, the shipped preset library, the dev authoring loop |
| S5 Migration | one package per section, simplest first, each deleting its old panel |
| S6 Editing | Edit/View on every page with live vs preview rendering, grid upgrades (fine rows, hug push, narrow layout, tray), overlay selection, style inspector, drag, 👹 user copies (table, route, Reset, merge, required blocks), user presets and components, 👹 "Show in Settings", every block in `/` on any page; then `osio.settings.edit` turns on |
| S7 Stage 2 | the inspector, the slash catalogue and the settings shell as documents (own design first) |

## Quality toolkit (what each tool is for)

| Tool | Used for | Not used for |
|---|---|---|
| `ui-ux-pro-max` skill | its UX rules and pre-delivery checklist (focus, 44 px targets, contrast, reduced motion, form feedback, inline validation on blur) reviewed on every block and every migrated section | its palette and font suggestion (violet, Plus Jakarta Sans), which conflicts with our generated palettes and is rejected |
| `frontend-design` skill | the new surfaces only: style inspector, component library, Edit/Reset | restyling existing settings (parity rules) |
| shadcn MCP | the WAI-ARIA keyboard and ARIA behaviour of tabs, dialog, select, switch, radio and checkbox, as a reference | new dependencies: `@osionos/ui` and the Radix packages already installed come first |
| magicui / uiverse MCP | ideas for the shipped preset library, re-expressed in our tokens | copied CSS (raw colours fail the token gates) |
| `motion` skill + MCP | motion tokens for the inspector, drag and dialog; the MotionScore jank audit; reduced motion | decorative animation |
| `dataviz` skill | `meter` and any chart block: marks, palette, accessibility | — |
| chrome-devtools (docker) MCP | performance traces and Lighthouse accessibility/performance audits per migrated section, driving the editor for the authoring-loop proof | replacing the Playwright gates |
| devil gate, `/security-review` | 👹 packages: the action runner, the user-copy storage and validation | — |
| `code-review`, `ponytail-review`, `simplify` | every package before merge: correctness, then over-engineering | — |
| opencode workers + `oc-review.sh` | implementation and mutant-checked reviews, one worktree per package | — |

## Left to the builder

- Exact file split inside `src/features/system-pages/` and the block registry location.
- Exact step values of the spacing/size scales, as long as every settings class in the inventory
  maps to a step.
- Server-side tree validation limits (size, depth), as long as they fit the largest shipped page
  with headroom.
- The order of sections inside S5 beyond "simplest first".
- Opening: shared workspace presets, z-order on the canvas, the shell and the rest of the app as
  system pages.
