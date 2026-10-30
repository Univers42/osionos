# Suggested edits and discussions (#228) — design, rev 2

Status: rev 2.1. Rev 1 BLOCKED (`2026-10-30-suggestions-verdict.md`); rev 2 ruled
PROCEED-WITH-CONDITIONS (`2026-10-30-suggestions-verdict-rev2.md`); §Rev 2.1 below
folds its design amendments C1–C8 in and wins over any line above it. Rev 2 resolves S1–S4 in the design and folds
S5–S16 in as acceptance tests (§Acceptance). Scope: osionos app + bridge + one additive
groot migration. Everything ships behind a new flag `osio.suggestions` (default OFF)
until the deploy owner has applied the migration (S13).

## What the issue asks (four screenshots)

1. Select text (or right-click a block) → **Propose edit**. The proposal shows in the page
   (underline for added text, strikethrough for removed) and as a **margin card**:
   author, time, `Add: "…"` / `Replace "…" with "…"`.
2. The card is a **thread**: replies, a reply box, emoji **reactions**, **Accept** /
   **Reject** for the page's editors.
3. An **All discussions** panel listing every thread, filterable
   (open / resolved / suggestions / comments / mine).
4. **Page-level comments** under the title (a thread with no block anchor).
5. Full CRUD; several people may propose different versions of one span; an editor
   accepts one, the overlapping others are superseded; reactions rank them.
6. Every interaction ≤ 20 ms input→next paint.

## Out of scope for this unit (said, not hidden)

- **Typing in "suggesting mode"** (every keystroke becomes a suggestion, incl. new
  blocks). It needs `EditableContent`'s commit path diverted; it is the next unit, on
  this data model.
- Suggestions on non-text blocks (images, databases, code). Text blocks only.
- Inline ghost text for a pure insertion: a caret marker at the point, the text in the
  card (a highlight cannot draw text that is not in the DOM).
- **Diff confinement** of an accept is not checked beyond the one block: the accepter
  already holds can_edit (S1) and could PATCH any content, so it is no boundary.

## Anchors live in SOURCE coordinates (the change that makes S2 possible)

A block's text is stored as inline source (`block.content`, the bracket-tag dialect).
Rev 1 anchored on plain-text offsets, so only the client could splice. Rev 2 stores:

- `anchor = {start, end, quote}`: offsets into the block's **source** string and the
  source substring they covered. The client maps the DOM selection to source offsets
  with `getInlineEditorOffsetsForRange` (`@osionos/markdown-engine/dom`, already used by
  `useCrossTextSelection.ts:55`).
- `suggestion = {insert}`: **inline source**, produced by the composer from what the
  author typed. The card renders `quote` and `insert` through the read-only inline
  renderer, so what the editor sees is byte-for-byte what will be spliced: no escaping
  step that can diverge from the display. Rendering an author's source is the same trust
  level as rendering a collaborator's page content today.

Because both sides are plain strings, the splice is
`left(src, start) || insert || substr(src, end + 1)` and runs in SQL. The client never
writes the accepted text.

Caveat (S15): re-anchoring searches the block for the unique occurrence of `quote`;
a quote edited into a different but identical phrase splices at the new place, and
offsets that cut a tag in half (a crafted request) splice broken markup, which the
card shows as raw brackets before anyone accepts. Zero or two occurrences → `stale`,
never a guess.

## Data model — additive, idempotent (`groot/models/osionos-discussions-migration.sql`)

```sql
ALTER TABLE public.osionos_page_comments
  ADD COLUMN IF NOT EXISTS parent_id  UUID REFERENCES public.osionos_page_comments(id) ON DELETE RESTRICT,  -- S4
  ADD COLUMN IF NOT EXISTS kind       TEXT NOT NULL DEFAULT 'comment',
  ADD COLUMN IF NOT EXISTS anchor     JSONB,
  ADD COLUMN IF NOT EXISTS suggestion JSONB,
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS decided_by UUID,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,                           -- S4 soft delete
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- CHECKs (NOT VALID then VALIDATE; old rows are comment/open and pass):
--   kind IN ('comment','suggestion'); status IN ('open','accepted','rejected','superseded');
--   kind='suggestion' ⇒ parent_id IS NULL AND block_id IS NOT NULL AND anchor IS NOT NULL AND suggestion IS NOT NULL;
--   parent_id IS NOT NULL ⇒ kind='comment';
--   (status='open') = (decided_by IS NULL AND decided_at IS NULL);
--   octet_length(suggestion->>'insert') <= 8000; octet_length(anchor->>'quote') <= 2000.
-- BEFORE UPDATE trigger stamps updated_at (rev 1 had a dead column).
-- BEFORE DELETE trigger raises when OLD.status <> 'open' (S4: a decided suggestion is history)
--   or when a child row exists (RESTRICT says so too; the trigger names the reason).
CREATE INDEX ... (page_id, block_id) WHERE status = 'open' AND deleted_at IS NULL;
CREATE INDEX ... (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.osionos_page_comment_reactions (
  comment_id UUID NOT NULL REFERENCES public.osionos_page_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, emoji)
);
-- service_role only, RLS on, same as the comments table.
```

**S4 — nobody's content dies with someone else's delete.** `parent_id` is
`ON DELETE RESTRICT`. The author's DELETE of a row that has replies becomes a
**soft delete**: `deleted_at = now()`, `content = ''`, kept so the thread keeps its
shape ("deleted comment"). A row with no replies and status `open` is hard-deleted as
today. A decided suggestion refuses DELETE at the DB (trigger), not only in the bridge.
Reactions still cascade, because a reaction cannot exist without its row and is owned
by the reacting user only (erasure deletes them anyway, S7).

Existing rows read as `kind='comment', status='open'`; old readers ignore the columns,
old writers never set them.

## Deciding a suggestion — decision and text in ONE transaction (S2, S5)

`osionos_decide_suggestion(p_id uuid, p_decider uuid, p_verdict text) RETURNS jsonb`,
`p_verdict IN ('accepted','rejected')`, service_role only, not SECURITY DEFINER (the
ADR 0026 pattern for `osionos_page_append`):

1. Read the target's `page_id`, `block_id` (no lock).
2. `SELECT … FROM osionos_pages WHERE id = page_id FOR NO KEY UPDATE`, **then**
   `SELECT … FROM osionos_page_comments WHERE page_id=… AND block_id=… AND kind='suggestion'
   AND status='open' ORDER BY id FOR NO KEY UPDATE`.
   Every decide takes the page row first, then the block's suggestions in id order: one
   global order, so two decides cannot deadlock. `NO KEY UPDATE` does not conflict with
   the `KEY SHARE` that reply and reaction INSERTs take on their parent (S5).
3. Target not `open` (or not in the locked set) → `{ok:false, reason:'decided'}` (409).
4. `rejected` → `UPDATE target SET status, decided_by, decided_at`; done.
5. `accepted` → find the block by id in `content` (recursive over `children`), read its
   source. `substr(src, start+1, end-start) = quote` → splice there; else the unique
   `position(quote)` → splice there; else → `{ok:false, reason:'stale'}` and **nothing
   changes** (S2). Then, in the same transaction:
   `UPDATE osionos_pages SET content = <spliced>, updated_at = now()` (the ADR 0026
   trigger bumps `version`), the target becomes `accepted`, and every other open
   suggestion on the block whose `[start,end)` overlaps the target's becomes
   `superseded`. Offsets of non-overlapping open suggestions after the splice are
   shifted by `len(insert) - (end - start)` in the same statement, so they stay
   anchored.
6. Return `{ok, status, supersededIds, version, content}` (the FULL content, C1).

Crash between any two steps: the transaction rolls back → both or neither. There is no
"back to open" verb (rev 1's `p_verdict='open'` is deleted).

**The client after accept:** the card turns `accepted` at once (optimistic, §Client);
the response's `blockContent` + `version` go into the store as a **server copy** of the
page (the path `pageConflict.ts` step 2 uses: the store's page update + `setBase`), so the
editor re-renders the spliced text. If the client had unsynced edits to that page, its
next outbox PATCH carries the old base → 409 → the existing three-way merge by block id
(`src/store/sync/pageConflict.ts:13-37`) keeps both sides. A `stale` or `decided` answer
rolls the card back and says why.

## Permissions (S1, S6)

The bridge gets one helper, `pageShareLevel(request, pageId)` in `bridge-comments.mjs`,
built on `readablePageAccess` + `pageLevelFor` (`bridge-api.mjs:1095`); workspace
owner/admin → `full_access`. The literal `'write'` appears in no new route.

| Action | Needs |
|---|---|
| list threads | page read (existing) |
| create comment (legacy, `kind` absent) | page read (existing policy, unchanged) |
| create suggestion / reply / reaction | level ≥ `can_comment` (S6) |
| edit own text / insert | author, and for a suggestion `status='open'` in the UPDATE itself (S3) |
| accept | `canWritePageRow` (`bridge-api.mjs:1378`) — honours can_view/can_comment rules (S1) |
| reject | `canWritePageRow`, or the suggestion's author |
| delete | author; soft when replied to; refused when decided (S4) |

**S3:** the PATCH is `UPDATE … WHERE id=$1 AND author_id=$2 AND status='open'` with
`return=representation`; 0 rows → 409 `decided`. Edit and decide serialize on the
row: the decide's `FOR NO KEY UPDATE` waits for the PATCH or the PATCH matches 0 rows,
and the splice reads the insert **inside** the decide transaction, so the applied text
is always the stored one.

## Bridge — `scripts/bridge-comments.mjs` (extended, same module)

| Route | Notes |
|---|---|
| `GET /api/comments?pageId` | + `parentId, kind, anchor, suggestion, status, decidedBy, deleted, reactions[{emoji,count,mine}]`; the held/removed filter applies to replies, suggestions and the rows reactions are counted on (S9) |
| `POST /api/comments` | `kind`, `parentId`, `anchor`, `suggestion`: ints ≥ 0, `start ≤ end`, `end - start ≤ 2000`, quote ≤ 2000 chars and `end - start = len(quote)`, insert ≤ 8000 bytes, parent on the same page and itself a root, block id present in the page's content; ≤ 20 open suggestions per user per block, the interaction limit per user per page (S10); L0 moderation over `content + insert + quote` |
| `PATCH /api/comments/:id` | S3 |
| `POST /api/comments/:id/decision` | `{verdict}` only — no content from the client; calls the SQL function |
| `DELETE /api/comments/:id` | S4 |
| `PUT/DELETE /api/comments/:id/reactions/:emoji` | `on_conflict=do nothing` / delete; idempotent |

All new routes and fields answer 404 while the columns are absent (S13: one probe, cached
per process). The bridge never trusts client-sent `status`, `author_id`, `decided_by`.

## Moderation, events, erasure (S7, S8)

- **S8** The async enqueue trigger hashes `content || coalesce(suggestion->>'insert','') ||
  coalesce(anchor->>'quote','')` and its `IS DISTINCT` filter covers `suggestion`, so a
  PATCH of the insert re-queues. The `ai_events` capture trigger
  (`osionos-user-events-migration.sql:438-468`) is narrowed to
  `kind='comment' AND parent_id IS NULL`, so replies and suggestions add no 'comment' event.
- **S7** `osionos_account_data_map` gains: reactions `user_id` → **delete** (anonymising
  would collide on the PK at the second erased user), `decided_by` → anonymise,
  `anchor.quote` → kept (it is the page's own text, already erased with the page
  content when the page is the user's). Test: erase two users who reacted 👍 on one row.

## Client

- `features/comments` stays the home. New pure modules, tested under `tests/canvas/`:
  `model/threads.ts` (rows → threads; competing proposals ranked 👍 desc, then oldest),
  `model/suggestionAnchor.ts` (overlap, offset shift, re-anchor — the same rules the SQL
  runs, so the optimistic card and the server agree; one shared fixture table drives
  both the canvas test and the SQL test).
- `model/discussionStore.ts` (zustand, per page): optimistic create / reply / react /
  decide; every click updates the store synchronously, the network runs after paint;
  a refusal rolls the one item back and toasts the reason.
- **Highlights (S11)**: `ui/SuggestionHighlights.tsx` registers `Range`s in
  `CSS.highlights` under keys scoped by the pane's `sourceKey`
  (`osio-suggest-del:<sourceKey>`…), zero DOM mutation in the contenteditable.
  Re-registered on the editor's content-version tick after every `innerHTML` rewrite
  (`EditableContent.tsx:588-598`, `:775-793`), frozen while `isComposing`. Without
  `CSS.highlights` the cards still show and the block gets a gutter marker — a feature
  detect, tested by deleting `CSS.highlights` in the page.
- **Entry points**: "Propose edit" in the selection toolbar next to "Comment", and in the
  block context menu (whole block selected).
- **Surfaces**: margin cards (aligned to the anchor's first rect, stacked without
  overlap), the All discussions panel (virtualized past 50 threads), the page-level
  thread under the title. Accept/Reject render only for `canEditPage`; the bridge
  re-checks.

## Performance budget (S12 — measured, not claimed)

| Interaction | Budget | How |
|---|---|---|
| open composer, submit, reply, react, accept, reject, open panel (200 threads), card hover | p95 ≤ 20 ms, p99 reported | `tests/e2e/perf/discussions.spec.mjs` (PLAYWRIGHT_PERF=1), CDP 4× CPU throttle, ≥ 200 samples per interaction, `PerformanceEventTiming` (`duration` = input → next paint, includes input delay); artifact JSON committed under `tests/e2e/perf/results/` with the host CPU named |
| `threads()` over 1000 rows, anchor shift/overlap over 200 suggestions | p95 ≤ 2 ms | `tests/bench/discussions.bench.ts` |
| highlight registration, 50 anchors in one block, Range walk included | p95 ≤ 4 ms | the perf spec (real DOM, not offsets only) |

A miss blocks turning the flag on, not the merge.

## Rev 2.1 — the rev-2 verdict's design amendments

- **C1 client apply.** The decide answers the page's full `content` + `version`. The client
  runs `mergePageContent(base, local, server)` and applies the merge through the
  store's page update, then `setBase(version, content)`, the exact steps of
  `pageConflict.ts`. It never sets a base to a version it did not merge; with no base
  it applies the server copy only when the page has no unsynced edit, else leaves it to
  the next 409.
- **C2 insertions carry context.** `anchor` gains `prefix`/`suffix`: up to 16 code
  points of source on each side (fewer only at the block's edge). The SQL checks
  `prefix || quote || suffix` at the offsets, then re-anchors on that whole string. An
  anchor with an empty quote and no context is `stale`, never a raw-offset splice.
- **C3 offset round trip first.** No code past the composer ships until a canvas test
  proves `source.slice(start, end) === quote` for every selection over a fixture of
  nested bold/italic/link/code/mention/emoji. `getInlineEditorOffsetsForRange` answers
  plain-text offsets; the composer maps both ends to source and REFUSES to send when
  the round trip fails.
- **C4 one unit: code points.** The composer converts UTF-16 offsets to code points;
  the bridge bounds and the SQL (`substr`, `position`, `char_length`) count code
  points. The shared fixture puts astral characters before, inside and after anchors.
- **C5 the walk.** SQL and bridge walk `children` and `layoutCells[].blocks`. Suggestible
  types: an allowlist of inline-text blocks (paragraph, headings, list items, to-do,
  quote, callout, toggle). An archived page refuses the decide.
- **C6 accept what was seen.** The decision body carries `expectedUpdatedAt`, the
  comment row's stamp on the card the accepter rendered; a mismatch is `409 changed`
  and nothing is applied.
- **C7** the page-row lock is `FOR NO KEY UPDATE` (step 2 above).
- **C8** the delete-guard trigger returns OLD when the page row is gone (a page,
  workspace or erasure cascade). Accept authorises through an exported
  `pageWriteContext` + `requirePageWrite(ctx, 'update')`, the same gate as the page
  PATCH (`bridge-api.mjs:4292-4300`), with the page id read from the comment row.

The acceptance tests below gain the verdict's C9–C18: the agreement test against the
page PATCH (C9), the concurrent-writer Playwright regression (C10, C11), a reply during
a decide on a 2 MiB page (C12), cascades (C13), the edit/accept race answering
`changed` (C14), a TTL'd 404 probe plus `NOTIFY pgrst, 'reload schema'` (C16), and
accept on a 2 MiB page in the perf spec (C17).

## Acceptance (the verdict's conditions, as tests)

| # | Test |
|---|---|
| S1 | bridge test: member with `update` + a can_view rule → accept 403 |
| S2 | psql two-session test: kill the session mid-decide → no status change, no content change; stale quote → 409 `stale`, page `version` unchanged |
| S3 | edit racing accept (two sessions) → applied text = stored insert |
| S4 | delete root with a foreign reply → soft delete, reply intact; delete accepted suggestion → DB error |
| S5 | 50 concurrent accepts of overlapping proposals → exactly one `accepted`; a concurrent reply/reaction waits ≤ 50 ms |
| S6 | per share level: no_access 404, can_view 403, can_comment 201 |
| S7 | erase two users with the same reaction → no 23505; thread order kept |
| S8 | PATCH of insert → a new moderation job; reply insert → no ai_event |
| S9 | held reply invisible to a third reader; reaction counts exclude held rows |
| S10 | each bound → 400; the 21st open suggestion → 429 |
| S11 | `innerHTML` byte-identical before/after highlights; fallback without `CSS.highlights`; two panes keep separate ranges |
| S12 | the perf artifact above |
| S13 | flag default OFF; routes 404 without the columns |
| S14 | migration applied twice, rollback replayed after the ugc rollback, in CI (`scripts/verify/`, throwaway containers) |
| S15 | the Caveat above, in the SQL function and `suggestionAnchor.ts` |
| S16 | ADR `groot/docs/adr/0028-suggested-edits-decide-and-splice-in-one-transaction.md` |

## Risks left

- **Schema** on a shared table: additive only; rollback file; applied by the deploy owner.
- **Text concurrency**: an accept and a typist in the same block both survive (merge by
  block id keeps both variants) — visible duplication, never silent loss.
- **Source-offset fidelity** is unverified until the first canvas test: if
  `getInlineEditorOffsetsForRange` answers rendered-text offsets rather than source
  offsets, the composer maps them with `inlineSourceCaretOffset` before sending.
