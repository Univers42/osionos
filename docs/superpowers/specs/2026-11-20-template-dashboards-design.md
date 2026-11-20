# Template dashboards: design

Date: 2026-11-20. Builds on `2026-10-27-reproducible-dashboards-design.md` (R1: a page made
from a template clones its databases) and keeps its rule: **everything shipped as a template
is made of parts a user can add from the app's own menus.** It replaces the page-shell
catalogue of ADR 0064 Phase 2 (hard-coded shells and sections) as the way users start a page.

## Why

The owner, 2026-11-20: the shipped shells are "hardcoded", "not easy modifiable", "a little
bit unusable". They asked for:

- a Canva-like way to **browse styles in a side panel, preview them, and apply one**;
- **real UI shells**: left sidebar, right sidebar, a stronger header, an optional footer, on a
  grid of cards/components a user can rearrange;
- templates **in the Templates database every user already has**, common to all users,
  reachable from the library, usable as a model for their own;
- **gallery cards that run an action** (apply the template) instead of opening a page;
- **many dynamic dashboard examples** so people start fast and stack their own.

Their decisions: switching a page to another template **replaces the page, after asking**
("keep a copy?"). Data is safe because it lives in databases, which views only show. The
approach is canvas-first (approach 1 below).

## What exists (osionos develop 19b198e9e, verified 2026-11-20)

| Piece | Where | Used as |
|---|---|---|
| 12-column canvas `layout` block, free cells holding any blocks, `layoutMode` inline or `full_page`, insertable from `/` | `entities/block/model/types.ts:86-140`, `slashMenuCatalog.tsx:321` | the shell grid |
| `BlockStyle` (surface, padding, radius, border, gap) + sanitizer | `entities/block/model/blockStyle.ts` | the card look of a cell |
| Header band (`layoutRole:"header"`) + `HeaderTemplate`/`HeaderDesigner`, slots bound to page properties | `widgets/profile-page/model/binding.tsx:65` | the header region |
| Home Templates gallery = the workspace's `isTemplate` pages, read-only | `templatesDatabaseState.ts:37-94` | the Templates database |
| `createPageFromTemplate`, `instantiateTemplateContent`, `cloneTemplateDatabases` (R1) | `pageStore.actions.ts:785-817`, `pageStore.helpers.ts:103-118`, `templateDatabaseClone.ts:256` | new page / apply |
| App actions with `params`, `confirm`, `destructive` | `features/app-actions/model/actionRegistry.ts:27-96` | `template.apply` |
| Gallery card click → `openPage` only | `nds/components/views/shared/CardBody.tsx:79` | gains a click action |
| Read-only block renderer, already used as a hover preview | `LegacyNodeHoverPreview.tsx` (`PageBlocksRenderer`) | panel previews |
| Left activity-rail panel registry | `shared/config/uiStore.ts:20`, `widgets/activity-rail/ui/panelLoaders.ts` | the Templates panel |

Nothing in the shipped template catalogue (`src/data/templates/`) is seen by a normal user
today: the gallery lists only pages the workspace owns.

## Goals

1. **Shells are canvas layouts.** A shell is a full-page `layout` block whose cells are named
   regions: `header`, `left`, `main`, `right`, `footer`. A region is an ordinary cell, so the
   user moves, resizes, deletes or adds regions with the canvas tools they already have. Each
   region can collapse under a width (`stackAt`) and can stick while the page scrolls
   (`sticky`, sidebars only).
2. **Cards are styled blocks in cells.** A card is a block carrying the block-level `style`
   (`BlockStyle` surface, padding, radius) that blocks already have, placed in a cell. Several
   blocks in one card sit in a styled container block. No new block type and no new cell field
   (TD20).
3. **A broad catalogue of dynamic dashboards.** At least 16 templates, each with small example
   databases and several views (table, board, calendar, gallery, dashboard tiles) placed in
   regions. List under "Catalogue (wave 1)".
4. **One Templates database, shared catalogue plus your own.** The Home Templates gallery shows
   the shipped catalogue to every user (read from code, the same for everyone) next to the
   workspace's own templates. "Save as template" on any page adds to the user's own.
5. **A Templates panel** on the left activity rail: search, categories, a live preview per card,
   and two actions: "New page" and "Apply to this page".
6. **Apply replaces, after asking.** On the open page, when it has content, apply opens a
   dialog: *Keep a copy and apply* (default, first), *Replace* (styled destructive), *Cancel*.
   Apply is one undo step and also saves the old content as a named page version. The page's
   databases are never deleted: replacing content removes blocks, not databases.
7. **Gallery cards can run an action.** A gallery view setting `cardClick`: `open` (default,
   today's behaviour) or `use_template` (a new page from the card's template, opened at once).
   The Templates gallery uses `use_template`; any user database of template pages can too.
   A card click never replaces a page.

## Non-goals

- No synced templates (editing a template does not change pages made from it). Copy model only.
- No server-side catalogue table, no new bridge endpoint, no schema change.
- No new chart library or block type; no marketplace upload of user templates.
- No migration of pages made from the old shells: they are ordinary pages and stay as they are.

## Anti-goals (a failure even if it works)

- A shipped template that uses a block, setting or region a user cannot add from a menu.
- Apply that loses a database row, or leaves a page with no undo.
- The catalogue or the panel in the warm boot chunk (both load on demand; measured on the perf
  harness, ADR 0066 budget).
- Two pages made from one template sharing a database (R1's guarantee must hold for apply too).

## Approaches considered

1. **Canvas-first (chosen).** Regions are cells of the existing `layout` block. Reuses the
   canvas editor, the slash entry and R1 cloning; the shell is data, not code. Cost: the canvas
   needs region names, `stackAt` per cell and `sticky`; full-page layouts must render well at
   400 px.
2. **Page-chrome regions.** Sidebars and footer as page-level slots outside the block tree.
   Simpler to make sticky, but a second layout system next to the canvas, and nothing a user
   could rebuild from `/`. Rejected: breaks the reproducibility rule.
3. **Code shells with props.** Keep shells as components with slots. Rejected: that is today's
   hard-coded system the owner asked to replace.

## Design

### Regions

`LayoutCell` gains optional `region?: "header" | "left" | "main" | "right" | "footer"`,
`stackAt?: "tablet" | "mobile" | "never"` and `sticky?: boolean` (honoured for `left`/`right`
only). Absent = today's cell. Values are fixed enums; an unknown value counts as absent, and
they reach the DOM only as `data-region`/`data-stack-at`/`data-sticky` attributes (TD19). The
canvas copies cell fields by name (`migration.ts:60-140`), so `migrate`/`unmigrate` and the
renderer learn the fields one promotion before any menu or template writes them (TD18). The cell menu gets "Region", "Collapse below" and "Stick while
scrolling". A full-page layout with regions renders as a CSS grid with named areas; under the
`stackAt` width the order is header, main, left, right, footer. `.omd` and markdown keep the
fields through the existing overlay keys (`EXTRA_BLOCK_KEYS`).

`/` gains "Page shell" items (Two sidebars, Left sidebar, Right sidebar, Header + footer) that
insert an empty full-page layout with those regions — the same thing the templates use.

### Catalogue

`src/data/templates/catalogue/<name>.ts`: one file per template, each a `SeedPage` with
`isTemplate`, a `category`, a `cover`, a full-page layout with regions, and its example
databases (R1 shape). `catalogue/index.ts` exports a lazy loader, reached only by dynamic
import (TD22). Example databases are an input slice handed to `cloneTemplateDatabases`; they
never enter the store, `SEED_PAGES`, `seedSnapshot` or the page cache, because
`cloneTemplateDatabases` clones only stored databases (`templateDatabaseClone.ts:42`) and a
stored original would be pushed as a user database (TD8–TD10). Helpers to build regions,
cards and views are shared in `catalogue/build/` and tested once.

Catalogue (wave 1): Project tracker, Sprint board, CRM pipeline, Content calendar, Habit
tracker, Reading list, Student semester, Personal finance, Team wiki home, Product roadmap,
Event planner, Job search, OKRs, Support desk, Inventory, Travel planner. Each ≥ 2 regions,
≥ 1 database with ≥ 3 views, ≥ 1 dashboard tile row.

### Templates database

`templateEntries()` returns the workspace's templates plus the catalogue entries, catalogue
ids prefixed `tpl:`. Catalogue cards are read-only (no rename, no delete) and carry a
"Shipped" badge. A `tpl:` id never enters `usePageStore`, the page cache, recents, favorites or
any duplicate or server path (TD17). Filters by category come from a `category` property on the card record.

### Panel

`templates` panel id in the activity-rail registry, loaded on demand. Grid of cards, each with
a scaled `PageBlocksRenderer` preview (rendered on hover/focus, cached per template), search
over title and category, category chips. Keyboard: arrows move, Enter opens the preview,
`A` applies. Buttons: "New page", "Apply to this page" (disabled when no page is open or the
page is read-only).

### Apply

Apply runs through the target page's own page-level editor handle, found by `pageId` and
`kind:"page"`, never "the focused editor" (TD1). It uses the same seam as `applyShell.ts:12-20`
and `BlockEditorSurface.tsx:146`: `commitContent` is one undo step. In order (TD2, TD3):

1. **Gate:** `canEditBody(target)` is true, the template body is loaded, the known-database store
   is writable (TD12). Otherwise refuse with no write.
2. **Copy** (only with *Keep a copy*): a copy of the root page from its loaded content. No child
   pages, no navigation, `activePage` and recents unchanged (TD13). `duplicateViaServer` is not
   used: it switches page (losing undo), empties unloaded children and reports a partial copy as
   success (ruling §2). If the copy fails or differs from the target, abort.
3. **Clone:** content from `applyTemplateBlocks` (fresh block ids, TD7) + `cloneTemplateDatabases`
   fed the template's database slice. Every database block in the result points to a fresh clone
   or an existing user database; otherwise abort with no write (TD10).
4. **Version:** save the old content as a named version (`versionAutosave.ts` /
   `saveVersion`, TD5).
5. **Commit:** `commitContent(newBlocks)`. Cover and icon stay unchanged, so one undo restores
   the page fully (TD4).

Apply never removes a database (TD11). After apply the store's database ids are the old ones
plus the new clones, exactly (TD9). The databases cloned for an undone apply stay as unused
databases.

`template.apply` app action: params `{ templateId }` only, `confirm:"simple"`. It **only creates
a new page** (today's `createPageFromTemplate`); replacing a page from an app action is BLOCKED
(TD14, `.out-of-scope/template-apply-replacing-a-page-from-an-app-action.md`).

### Card click

`ViewSettings.cardClick?: "open" | "use_template"`, in the view settings menu under
"Open pages in". A gallery has no current page, so the action is "use" (new page), not
"apply". `cardClick` goes in the kit's `ViewSettings` and in the Library parity test's
`EXCLUDED_SETTINGS`. It is **not** added to the Library or `sys:` allowlists: the Library one
refuses unknown keys on write and drops the whole view on read after a rollback
(`bridge-library-views-shape.mjs:144-158`). User database views need no allowlist, so T5 ships
no bridge change (TD15, TD16). Old views keep `open`.

## Phases

| Phase | Scope | Done when |
|---|---|---|
| T1a | Readers: `migrate`/`unmigrate` + renderer read `region`/`stackAt`/`sticky` (TD18, TD19) | canvas test: fields round-trip canvas migration, markdown, `.omd`; unknown values read as absent; ships one promotion before T1b |
| T1b | Writers: cell menu, `/` page shells | e2e: insert "Two sidebars", sidebars stack at 400 px, sticky at 1440 px |
| T2 | Apply + keep-copy dialog + create-only `template.apply` | canvas tests: TD9/TD10/TD11 (database ids and row counts before, after, after undo), TD3 abort paths write nothing, TD17 `tpl:` guard (0 bridge calls); e2e: apply on a page with a database, one undo restores content, cover and icon, the copy exists and the user stayed on the page |
| T3 | Catalogue builders + 16 templates + Templates database merge | canvas test: every template round-trips under develop and live engines, nesting ≤ 8 (TD21), every block is insertable from a menu, two applies share no database; source test + build manifest: no catalogue module in the entry graph (TD22); byte size per template's databases recorded |
| T4 | Templates panel with previews | e2e: search, preview, apply from panel; axe AA on the panel, light and dark; previews on hover/focus only, bounded cache with a `Caveat:` (TD24); `boot-ab.sh` ABBA warm and cold inside the baseline (TD23) |
| T5 | Gallery `cardClick` (no bridge change) | e2e: a Templates gallery card click creates and opens a new page and the hosting page is unchanged; parity test lists `cardClick` in `EXCLUDED_SETTINGS` |

Each phase lands on develop with gates green; beta after each; live with the next promotion
and the owner's go.

### Builder check answers (2026-11-20)

- `region` is independent of `LayoutCell.section` (`types.ts:125`, template write-grants); the
  catalogue sets no grants. `LayoutCell` is declared twice (`entities/block/model/types.ts:103`,
  `features/block-editor/ui/canvas/layout.types.ts:38`): the new fields go in the entity type
  and the canvas type imports it.
- "Insertable from a menu" means `/`, the database view menu, or the dashboard "Add widget"
  picker. T3's test walks every block and view of every template against those three.

## Risk ruling (devil, 2026-11-20)

PROCEED-WITH-CONDITIONS TD1–TD24; replacing a page from an app action is BLOCKED. Full text:
`2026-11-20-template-dashboards-ruling.md`. Open until measured: whether saved page versions
survive a reload (decides the Replace dialog's wording, TD5), each template's database bytes
(TD12), whether the live markdown engine keeps unknown cell fields (TD18).

## Left to the builder

- Grid-area CSS details, the preview scale, cache size of rendered previews.
- Example data per template (rows, names) — fictional, no real people.
- Wording of dialog and badges.

## Calls I made (the owner can overrule)

- **"Keep a copy and apply" is the default button**, because it is the safe one.
- **Cards use the block-level `style` (TD20)**, not a new cell field: no reader-first wait, and a
  card is then something a user already makes from the block menu.
- **Catalogue ids are `tpl:`-prefixed and read-only**; a user edits one by saving their own copy.
- **Region stacking order on mobile is header, main, left, right, footer.**
- **Old page-shell code stays until T3 lands**, then the shells move into the catalogue as
  templates and the code catalogue is deleted.
