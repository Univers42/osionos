# /page slash command — create, link, navigate, graph — design

Date: 2026-07-07 · Status: approved · Scope: `apps/osionos/app`

## Problem

`/page` (`basic:create-page`) half-works today. It creates a page at the Private-workspace
root and appends an inline `[[page:<id>]]` token, but:

1. The created page is titled "Untitled" and is **not opened** — the user stays on the
   origin page with no visible result beyond a chip.
2. Page mentions are **not underlined** (`.editor-mention` sets
   `text-decoration: none !important` in `global.css`), so they don't read as clickable.
3. The reference relation between the linking page and the linked page exists only as
   inline text. It never reaches page **metadata**, so the Second-Brain graph
   (`bridge-graph.mjs:pagesToGraph` — edges from `parent`, relation-type properties,
   and tags only) shows **no edge** between the two pages.

Breadcrumb back-navigation already has the right machinery: `usePageStore.openPage`
maintains a `navigationPath` stack (append on open, truncate on revisit) and
`PageBreadcrumbs` (mounted in `PageHeaderBar`) prefers that trail. It just never engages
because `/page` doesn't open the created page.

## Design

### 1. Command behavior — create "New Page", link it, open it

In `src/features/slash-commands/model/useSlashSelect.ts`,
`handleSlashCreatePageSelect` calls
`createPageInPrivateWorkspace("New Page", { open: true })` instead of the bare call.

- Order is preserved: strip the slash query → create → append `[[page:<id>]]` to the
  origin block → the deferred `openPage` (already `setTimeout(0)` inside
  `createPageInPrivateWorkspace`) fires after the block update lands.
- Creation location stays the **Private-workspace root** (existing `addPage(..., parentId
  = undefined)` behavior).
- The `[[`-page-selector create path keeps its current behavior (insert link, do not
  open). Only `/page` opens.
- No session / no private workspace → existing silent behavior: slash query cleaned,
  no link appended, no page created.

### 2. Breadcrumb back-navigation — no new code

Opening the new page through `openPage` appends it to `navigationPath`, so the crumb bar
reads `… › <origin> › New Page` and clicking the origin crumb truncates back to it.
Covered by e2e assertions, not new code.

### 3. Underlined page mentions

`.page-mention-placeholder` gets `text-decoration: underline` +
`text-underline-offset` (tokens/values consistent with existing link styling; accent
color unchanged). Scoped to the page-mention class — **not** all `.editor-mention` —
in case the mention class is reused for non-navigable chips. Both renderers
(`inlineHtml.ts` editor path, `reactHelpers.tsx` read-only path) emit the same class,
so one CSS rule covers editor and read-only surfaces. Click-to-open already works
(`EditableContent` mousedown → `openPageById` → `openPage`).

### 4. References as metadata → graph edges (approved approach)

**Derive-on-save into page properties.** A pure helper scans the block tree for literal
`[[page:(id)]]` tokens (regex; the token is stored verbatim in block content), returning
a deduped ordered id list:

- `collectPageReferences(blocks: Block[]): string[]` — new module in
  `src/entities/block/model/` (block-tree concern; the store consumes it).

On every content save (`updatePageContent` in the page store), compare the derived set
with the page's current relation-type **"References"** property
(`{ type: 'relation', value: string[] }` in `PageEntry.properties`, matching what
`bridge-graph.mjs:pageRelations` reads) and, when different, patch `properties` **in the
same store update** as the content — one save, one stamp change, one outbox sync.
Empty set → the References property is removed.

Everything downstream already exists:

- outbox syncs `properties` (`pageOutbox.ts` includes it; `pageStamp.ts` hashes it),
- bridge persists it to `osionos_pages.properties` (existing jsonb read/write),
- `pagesToGraph` emits `relation` edges from relation-type properties,
- the graph explorer's BaaS mode (`GET /api/graph/pages`) renders the edge,
- the property is visible in the page's metadata section under the title.

**No bridge, Dockerfile, or Postgres schema changes.**

Consequences accepted:

- Deleting a mention removes the reference (and the edge, after sync) on next save.
- Manual edits to the References property are overwritten on the next content save —
  it is a derived property.
- Self-references and references to deleted/foreign pages are tolerated client-side;
  the bridge already guards (`target !== row.id`, `ids.has(target)`).
- Offline mode: the property still derives and persists locally; the graph edge appears
  once the outbox syncs to the BaaS.

## Testing

- **Canvas** (`tests/canvas/`, node --test): `collectPageReferences` — nested blocks,
  multiple tokens per block, dedupe, empty tree; store-level: content update writes /
  updates / removes the References property without clobbering other properties.
- **Bridge** (`tests/bridge/`): `pagesToGraph` emits a `relation` edge from a
  References property row (if not already covered).
- **E2E** (offline Playwright, `tests/e2e/functional/`): type `/page`, select Page →
  new page opens titled "New Page"; breadcrumb shows the origin crumb; clicking it
  navigates back; the origin page shows an underlined mention chip; clicking the chip
  re-opens the new page.

## Out of scope

- Backlinks UI ("linked mentions" panel) — the metadata makes this possible later.
- Changing the `[[` selector flow.
- Graph edge styling/labeling for reference edges (they render as existing `relation`
  edges).
