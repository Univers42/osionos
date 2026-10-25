# Self-built UI — the app's own screens made from its own blocks

Status: design, waiting for the owner's approval (2026-10-25). Nothing here is built yet.

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

### 4. Layout: the auto-layout frame (new) next to the canvas grid (kept)

A new `frame` block is a flexbox container, like Figma's auto layout: direction (row/column),
wrap, gap, padding, align, justify, dividers between children (today's `divide-y`), child sizing
(hug/fill/fixed/basis), and responsive rules on the **pane width** through container queries at
fixed breakpoints (480, 720, 1024): change direction, hide, change gap. Today's settings layout
uses a 720 px container query (`SettingsView.tsx:116`), so pane width rather than viewport width
is a requirement, not a preference.

Frames nest freely and may hold any block, including the existing canvas `layout` block. Every
settings layout in the inventory — stack, row, two-column, card, setting row, button group,
sidebar+content — is a frame with a preset. The canvas grid stays as it is for dashboards; this
project changes it only where a settings page needs it.

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

- Each settings section has a shipped block tree in code, versioned with the same
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

## Verification (the finish line)

| Check | How | Pass |
|---|---|---|
| Built with blocks | a test iterates `sections.ts` and asserts each section id has a system page and no panel component | every section |
| Conformance | `scripts/check-built-with-blocks.sh` in `test:quality`: raw `<button\|<input\|<select\|<textarea\|<table` and `[var(--osio-` classes in `src/features/settings/**` and widget files, counted against a ratchet file that may only decrease | ends at 0 |
| Visual parity | Playwright with the stub bridge and a frozen clock: 23 sections × 375/1440 × light/dark = 92 screenshots, baselines taken from the pre-migration commit in the same container | ≤ 0.1% differing pixels per shot; a larger diff needs a written reason in the PR |
| Behaviour | the existing settings e2e specs (`tests/e2e/bridge-stub/*` and the rest, 46 files mention settings) pass with their assertions unchanged | green, no assertion edits |
| Gates | `npm run test:quality`, `test:canvas`, `test:bridge` | rc 0 |
| Speed | the perf harness opens each section 20 times, before and after | p95 within +10% |
| Users | e2e: Edit this page → restyle a block → reload → persisted → Reset → shipped look; a required block refuses delete | green |
| On any page | e2e: `/input` bound to a preference on a normal page toggles the real setting | green |

Caveat: pixel parity is checked locally, not in CI. Committed baseline PNGs fail in this
environment's renderer (memory `e2e-system-chromium`), so baselines and comparisons must come from
the same container run. Font hinting differences between machines are invisible to the check.

## Phases

| Phase | Delivers |
|---|---|
| S0 Baseline | parity screenshots from develop, the conformance script and its first ratchet, the "built with blocks" test (expected red list) |
| S1 Foundations | block registry, `BlockStyle` + presets + static CSS, `frame`, `visibleWhen` on any block, the system-page host (render shipped page, storage, reset, merge) |
| S2 Fields | source registry, `field` with all displays, `@osionos/ui` field components |
| S3 Actions | `button` on `@osionos/ui` Button with all tones, the `app_action` registry with runner guards, `status`, `secret`, `chip`, `avatar`, `meter` |
| S4 Data | `collection` with list/table/grid displays and row actions, new list sources, `tabs`, `dialog`, `widget` |
| S5 Migration | one package per section, simplest first (preferences, accessibility & voice, notifications, shortcuts, library, plans …) and hardest last (permissions, people, AI connections, developer). Each package deletes the old panel and passes parity, e2e and the ratchet |
| S6 Editing | style inspector, drag, Edit/Reset, required blocks, user presets, every block in `/` on any page; then `osio.settings.edit` turns on |

## Left to the builder

- Exact file split inside `src/features/system-pages/` and the block registry location.
- Exact step values of the spacing/size scales, as long as every settings class in the inventory
  maps to a step.
- Server-side tree validation limits (size, depth), as long as they fit the largest shipped page
  with headroom.
- The order of sections inside S5 beyond "simplest first".
- Opening: shared workspace presets, z-order on the canvas, the shell and the rest of the app as
  system pages.
