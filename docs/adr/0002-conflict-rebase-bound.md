# 0002. A 409 on a conflict re-send is merged again, at most MAX_REBASES times

- Status: accepted
- Date: 2026-10-27
- Deciders: the devil ruled PROCEED-WITH-CONDITIONS on the bounded rebase
  (`osionos-ai-records/coedit-conflict-rebase-verdict.md`); this ADR amends C28.

## Context

- C28 (commit `658c81253`) merged a 409 and re-sent once; a second 409 sent the
  local edit to a "<title> (copy)" page in the private workspace.
- With three editors on one page, a second 409 inside one round-trip is routine:
  the live `rtconc` probe (2026-10-27) made copies and emptied the writer's screen,
  because the copy path replaces the local page with the server's copy.
- The merge is a 3-way merge by block id (`src/store/sync/mergePageContent.ts`);
  each round's server copy becomes the next round's base (`setBase`).

## Decision

- `resolvePageConflict` (`src/store/sync/pageConflict.ts`) merges and re-sends up to
  `MAX_REBASES` (4) times. A page costs at most `1 + MAX_REBASES` PATCHes per flush.
- Each round merges the store's latest copy (`deps.latest`), so text typed during a
  PATCH round-trip is not overwritten by the merged content.
- Every copy path (bound exhausted, a 409 without content, a merge with no base)
  copies the store's latest copy.
- If the store does not apply the merged content (write access lost mid-flush), the
  conflict ends `failed`: the page stays pending and nothing unmerged is re-sent.

**C28, amended:** "a 409 is merged and re-sent at most `1 + MAX_REBASES` times; the
batch continues; past the bound the edit goes to a copy". The no-unbounded-loop and
batch-continues halves of C28 are unchanged.

## Consequences

- More writers than the bound, each landing within one round-trip, still end in a
  copy: no loss, but the edit leaves the page.
- Same-block typing is still resolved by keeping both variants, and unsaved drafts are
  not in `latest`; the per-block CRDT plan (`coedit-sameblock-verdict.md`) covers that.
- Tests: `tests/canvas/page-version-conflict.test.ts` (C28 count via `MAX_REBASES`,
  three writers, latest-typing merge, latest-typing copy, store refusal).
