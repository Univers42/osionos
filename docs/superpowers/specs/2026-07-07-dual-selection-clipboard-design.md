# Dual selection system + rich clipboard — design

Date: 2026-07-07 · Status: approved · Scope: `apps/osionos/app` block editor
Companion spec: `2026-07-07-selection-panel-block-comments-design.md` (the
vertical selection panel anchors on both selection kinds defined here).

## Problem

Notion has two distinct selectors; osionos currently has one and a half:

- **Block multi-select** (rubber-band square over blocks) — largely built in
  the current WIP: `useSurfaceMarquee` → `blockSelectionStore` → overlay,
  Delete, selection context menu.
- **Cross-block text selection** (cursor highlight flowing across block
  boundaries, catching partial text at both ends) — **does not exist**:
  `inlineEditorSelection` returns null the moment a range leaves one block's
  root, so the editor ignores such selections, and copy falls back to the
  browser's junk multi-contenteditable HTML.
- The two gestures **conflict**: the marquee's pointerdown guard does not
  exclude drags that start inside text, so text-drags can draw the square.

Copy must carry formatting so paste works **with** format (Ctrl+V) or
**without** (Ctrl+Shift+V, plus an explicit menu entry — user request).

## Selection model — one source of truth

A discriminated editor-selection state consulted by the panel, keyboard
handlers, and clipboard:

```ts
type EditorSelection =
  | { kind: 'text';       blockId: string /* existing per-block snapshot */ }
  | { kind: 'cross-text'; anchor: SelPoint; focus: SelPoint }   // NEW
  | { kind: 'blocks';     ids: ReadonlySet<string> };           // marquee store
type SelPoint = { blockId: string; offset: number };            // source offset
```

`blocks` remains `blockSelectionStore`; `cross-text` is a new small model
module (`crossBlockSelection.ts`) fed by `selectionchange`.

## Gesture arbitration (fixes the reported conflict)

- Pointerdown **inside a contenteditable leaf** → text path only. The marquee
  pointerdown guard additionally rejects targets inside
  `[data-content-editable-leaf]` / block text. The marquee owns page margins,
  gaps, and whitespace only (existing `anchor: 'page'` behavior).
- Entering any text selection **clears** the block store; starting a marquee
  clears the native selection (`getSelection().removeAllRanges()`) in addition
  to the store-clear it already performs.
- **Esc** escalates: `text`/`cross-text` → `blocks` covering the selected
  block(s); Esc again clears. Clicking into text de-escalates. Arrow keys in
  `blocks` mode move/extend the block selection (existing WIP behavior kept).

## Cross-block text mode

- **Detection**: on `selectionchange`, when the native range's endpoints
  resolve to different `[data-block-id]` leaves, map each endpoint
  DOM→source-offset using the existing per-leaf utilities (extended to accept
  a leaf root) and publish `cross-text { anchor, focus }`. Collapse → back to
  per-block mode.
- **Painting**: the native selection stays (platform feature over custom
  overlays); `::selection` tint from tokens. Fallback documented (not built
  now): derive per-block highlight spans from the state if a browser fails to
  paint across leaves.
- **Covered slices** (the core pure helper): ordered `[ {blockId, from, to} ]`
  — start block `anchor.offset → end`, middle blocks whole, end block
  `0 → focus.offset` (normalized for direction). Everything below consumes it.
- **Delete / typing**: one tree commit (anti-orphan rule as in block-delete):
  trim start block to its head, merge end block tail into it, drop middles,
  insert typed text at the seam. Enter and other structural keys collapse the
  range first, then behave normally.
- **Formatting / panel**: the vertical panel anchors on `cross-text` too.
  B/I/U/S/code/color loop `applyInlineFormatting` per covered slice;
  Turn-into applies to every covered block; Comment wraps each slice with the
  same thread id (`comment_mark` supports shared `threadId` by design).

## Clipboard

Copy/cut build the payload from the **model**, never the DOM. Three flavors
written together on every copy (both selection kinds):

| Flavor | Content | Purpose |
|---|---|---|
| `application/x-osionos-blocks` | JSON block/slice list | lossless internal paste |
| `text/html` | markengine `renderHtml` over slices/blocks | formatted paste (Ctrl+V), external apps |
| `text/plain` | plain text (markup stripped) for text selections; markdown source for block selections | unformatted paste (Ctrl+Shift+V); structure survives external paste of blocks |

- Cut = copy + range/blocks delete (one commit).
- **Paste priority** in the existing handler: `application/x-osionos-blocks` →
  `text/markdown` → `text/plain` (first is new; the rest is today's order).
- **"Paste without formatting"** entry (user request) in the right-click
  selection/page context menu next to Paste: reads `text/plain` only and
  inserts as plain paragraphs/text. Keyboard: the native Ctrl+Shift+V already
  selects the plain flavor.

## Reuse inventory

Untouched: `useSurfaceMarquee`, `blockSelectionStore`, block Delete handler,
selection context menu, editor command bus. Extended: marquee pointerdown
guard (one condition), `inlineEditorSelection` (leaf-root parameter), paste
handler (one flavor). New: `crossBlockSelection.ts` model (detection +
covered-slices + range delete/merge), clipboard serializer module, menu entry.

## Testing

- **Canvas (pure)**: covered-slices normalization (backward drags, same-block
  collapse, whole-block ends, empty blocks in the middle); range
  delete/merge (start=end block edge cases, middle-block subtree handling);
  clipboard serialization round-trip (slices → html/plain, blocks → markdown).
- **Browser harness / e2e**: cross-block drag paints and produces all three
  flavors; Ctrl+V vs Ctrl+Shift+V paste difference; marquee no longer starts
  from inside text (the reported bug's regression test);
  `containersAndPaste.mjs` extended for the new flavor priority.

## Out of scope

- Custom highlight-overlay fallback painting (documented, built only if a
  target browser fails native cross-leaf painting).
- Cross-page/multi-pane selection.
- Collaborative selection presence.
