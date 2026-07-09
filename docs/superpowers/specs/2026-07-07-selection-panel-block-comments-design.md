# Notion-style selection panel + block comments — design

Date: 2026-07-07 · Status: approved · Scope: `apps/osionos/app` (+ root `models/`, bridge)

## Problem

Selecting text in the editor shows a minimal horizontal toolbar
(`InlineSelectionToolbar` in `src/components/blocks/EditableContent.tsx`:
A/▣/B/I/U/S/link/code/?//). The target UX is Notion's **vertical selection
panel** (user-provided reference DOM, 192px wide): turn-into row, format grid,
comment row, AI skills, and an "Edit with AI" input — with **every visible
button functional**. osionos has no block-comment subsystem today; that gap is
in scope (user decision), including **character-range comment highlights**.

## Capability map (reuse before write)

| Panel control | Backing capability | Work |
|---|---|---|
| Turn into `Normal text ›` | `changeBlockType` + slash "turn-into" catalog | submenu UI |
| `A` color popover | existing text/background palettes (`ColorPickerBoard`), inline color tokens | merge into one popover |
| B / I / U / S / `</>` | `applyInlineFormatting` | restyle only |
| Clear format ✕ | — | small helper: replace selection with its plain text |
| Link | existing link picker | restyle only |
| √x equation | markengine `math_inline` (`$…$`) | wrap-selection helper |
| ⋯ More | existing block context menu | open at panel anchor |
| 💬 Comment | **new subsystem** (below) | model + bridge + UI |
| 😀 Reaction | same table, `kind='reaction'`; existing `EmojiPicker` | UI wiring |
| ✏️ Suggestion | — | **hidden** (track-changes = future epic) |
| Skills + "Edit with AI" | existing `POST /api/agent/chat` (`bridge-agent.mjs`) | selection→agent→apply |

## Part 1 — the panel

Rebuild `InlineSelectionToolbar` as a 192px vertical panel; keep the existing
selection-snapshot, fixed positioning, scroll/resize reposition, and
mousedown-guard plumbing unchanged. Sections top→bottom, separated by 1px
token-colored dividers, all colors via `--osio-*` tokens (style-token gate):

1. **Turn into** — full-width row: current block type label + chevron; opens a
   submenu listing the slash-catalog turn-into entries; picking calls
   `changeBlockType` and keeps the selection.
2. **Format grid** — two rows of 28px-high buttons:
   `A` (color popover: text + background palettes merged, recent colors kept),
   **B**, *I*, U, ✕ clear-format · Link, S̶, `</>`, √x, ⋯.
   Toggles carry `aria-pressed` from the selection's formatting state
   (`getElementFormattingState` already computes active kinds).
3. **Comment row** — 💬 Comment (flex-1) + 😀 reaction. (✏️ hidden.)
4. **Skills** — scrollable list (Improve writing, Proofread, Explain,
   Reformat) with a bottom fade; a sliders header row is presentational.
5. **Edit with AI** — contenteditable-styled input, `Alt+⇧+E` opens the panel
   focused here.

AI behavior: skill or free-form instruction sends
`{ instruction, selection, blockType }` to `POST /api/agent/chat`; rewrite
skills (Improve/Proofread/Reformat + free-form) **replace the selection**,
Explain **inserts a paragraph block below**. Failures surface inline in the
panel (no toast storm); the whole AI section is hidden when `VITE_API_URL` is
empty or the bridge is unreachable (offline builds stay clean).

## Part 2 — block comments

### Data model — root `models/osionos-block-comments-migration.sql`

Idempotent + RLS, same conventions as sibling osionos-* models. One table:

```
osionos_block_comments(
  id uuid pk default gen_random_uuid(),
  page_id text not null, block_id text not null,
  author_id uuid not null,
  kind text not null default 'comment',   -- 'comment' | 'reaction'
  body text,                               -- comment text (null for reactions)
  emoji text,                              -- reaction emoji (null for comments)
  quote text,                              -- selected text captured at creation
  parent_id uuid references osionos_block_comments(id) on delete cascade,
  resolved boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
)
```

Indexes on `(page_id)` and `(page_id, block_id)`. **Applied manually** to the
running `mini-baas-postgres` (the published image does not auto-apply root
models — known constraint); the file is committed at root `models/`.

### Bridge — `scripts/bridge-comments.mjs`

Mounted by `bridge-api.mjs` exactly like `bridge-notify` (handler factory +
`context.social`-style dispatch). Reuses `bridge-social-core` helpers
(`rest`, `sendJson`, `readJsonBody`, `httpError`, `publishRealtime`).

- `GET  /api/comments?pageId=…` — all threads+reactions for a page.
- `POST /api/comments` — create (`pageId`, `blockId`, `kind`, `body|emoji`,
  `quote?`, `parentId?`); author stamped server-side from the app session.
- `PATCH /api/comments/:id` — edit own body / toggle `resolved`.
- `DELETE /api/comments/:id` — own only.

Access follows page access (author of the page or a viewer the page is shared
with can read; any reader can comment). Realtime publish is best-effort like
every other module. Backward compatible: no existing route or table changes.
**The new module is added to the bridge Dockerfile COPY list** (root
`infrastructure/docker/osionos/bridge.Dockerfile`) — a module missing there
works in dev but silently vanishes from the built container.

### Range marks — markengine `comment_mark`

Commented text is highlighted and clickable, Notion-style. The mark lives in
the block source using the existing tagged-inline convention:

- Source token: `[comment:<threadId>]…[/comment]`.
- Parser: one matcher producing
  `{ type: 'comment_mark', threadId, children }` (same shape as the
  underline/highlight tagged matchers, plus an id).
- AST plumbing: extend the inline-node switches (`inlineAst.ts`,
  `shortcuts.ts`, `ast.ts` union) — mechanical passthroughs.
- Renderers: `inlineHtml.ts` (editor) and `reactHelpers.tsx` (read-only) emit
  `<span class="editor-comment-mark" data-comment-id="…">children</span>`;
  terminal renderer passes children through.
- Styling: `.editor-comment-mark` in `global.css` — warm token-based highlight
  with a stronger bottom border (both themes; tokens only).
- Apply: wrapping a selection reuses the same source-range application path as
  the color-insert helper (`inlineColorInsert.ts` pattern).
- Open: `EditableContent` mousedown seam (same as `.page-mention-placeholder`)
  opens the thread popover for `data-comment-id`.
- Remove: resolving/deleting a thread strips its `[comment:id]…[/comment]`
  wrappers across the page's block tree (pure helper + one store pass);
  deleting the text deletes the mark naturally (it IS the text).

Because the mark rides the source string, persistence, copy/paste, undo, and
sync all work with zero new storage.

### Frontend — `src/features/comments/`

New feature slice (feature-sliced layout, no barrel needed):

- `model/commentsApi.ts` — bridge client (list/create/patch/delete).
- `model/useCommentsStore.ts` — zustand per-page cache; refresh on page open
  and after mutations; realtime/poll refresh reuses the existing pattern.
- `ui/CommentComposer.tsx` — popover from the panel's 💬: shows the quote,
  textarea, submit → POST, then wraps the selection with the mark using the
  returned thread id.
- `ui/CommentThreadPopover.tsx` — opens from a mark click or margin chip:
  thread + replies + reactions, reply box, resolve / delete (own).
- Margin chip: blocks having threads show a small count chip (💬 n) at the
  block's right margin (same affordance family as existing block chrome).
- 😀 in the panel: existing `EmojiPicker` → `kind='reaction'` row; reactions
  render as chips in the thread popover and on the margin chip hover.

## Error handling & edges

- Bridge down / offline build: Comment + AI sections hidden; formatting
  sections always work (they're local).
- Marks whose thread no longer exists (deleted server-side): render as plain
  children (renderer falls back when the store lacks the id), and the strip
  helper cleans them on next thread-list load.
- Multi-block selections: governed by the companion spec
  `2026-07-07-dual-selection-clipboard-design.md` — the panel anchors on
  cross-block text selections too; formatting/Turn-into/Comment apply across
  the covered slices (Comment shares one thread id across its per-block marks).
- Permissions: server rejects writes without a valid app session; UI hides
  Comment for read-only viewers (`canReadPage`/access context already exists).

## Testing

- **Canvas**: comment-mark parse/render round-trip (`[comment:x]a[/comment]` ↔
  AST ↔ HTML), strip-marks helper, clear-format helper, equation wrap.
- **Bridge** (`tests/bridge/`): route CRUD + author stamping + own-only
  delete/patch, following existing bridge test style.
- **E2E** (offline): panel appearance on selection, turn-into, B/I/U/S/code,
  clear format, equation — the offline-safe surface.
- Manual/live: comment create→highlight→reopen→resolve→highlight removed,
  reaction chips, AI skill replace/insert (needs the running stack).

## Out of scope

- Suggestion/track-changes mode (the ✏️ button ships hidden).
- Comment notifications/badging in the notifications rail (future wiring to
  `osionos_notifications`).
- Cross-block range marks (a mark spans one block's inline source).
