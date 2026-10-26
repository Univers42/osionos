# SB-6m — The tree merge: a user's copy against a newer shipped page, and the blocks a copy cannot drop (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 "System pages: shipped, customizable, resettable"). A user can make their own copy of a settings page and edit it. When the app ships a newer version of that page, the copy must keep the user's edits and deletions, gain the new shipped blocks, lose the shipped blocks the user never touched that the new version removed, and never lose a required control (sign out, password, 2FA, account deletion). Workspace defaults (SB-6h) stack the same merge one layer higher. This package is that merge, as a pure library with no UI and no storage, so its correctness is proven before anything stores a copy (plan Review Focus 5).

Base: the integration tip with SB-1c merged (`visibleWhen` exists on `Block`).

## What exists (read these first)

- `src/widgets/page-renderer/model/homeContentMerge.ts`: the Home dashboard's three-way merge, top level only. `fingerprintHomeBlock` (FNV-1a over the block's JSON) and `mergeHomeContent(current, nextSeed, fingerprints)`. Its two `Caveat:` lines apply here too. Tests: `tests/canvas/home-dashboard-merge.test.ts`. Callers: `rg -n "fingerprintHomeBlock|mergeHomeContent" src tests`.
- `Block` (`src/entities/block/model/types.ts`), `children`, and `visibleWhen` (SB-1c).
- The seeded generator `mulberry32` (`tests/canvas/markdown-fidelity-fixtures.ts:16`) for the property test; there is no property-testing dependency and none is added.

**OWNS:**
- `src/entities/block/model/blockFingerprint.ts` (new): `fingerprintBlock`, `fingerprintShallow`;
- `src/entities/block/model/treeMerge.ts` (new): `mergeBlockTree`, `seedFingerprints`, `enforceRequired` (Interfaces);
- `homeContentMerge.ts` (modified): imports `fingerprintBlock` and deletes its own FNV copy; every caller of `fingerprintHomeBlock` calls `fingerprintBlock` (no behaviour change);
- tests: `tests/canvas/tree-merge.test.ts` (new), `tests/bench/tree-merge.bench.ts` (new); `home-dashboard-merge.test.ts` unchanged and green.

**MUST NOT TOUCH:** `mergeHomeContent`'s behaviour, any UI, any store, the vendored tree.

**Commit message:** `feat(blocks): a tree merge that keeps a copy's edits against a newer shipped page, and required blocks`

## Interfaces

```ts
// blockFingerprint.ts
function fingerprintBlock(block: Block): string;     // FNV-1a (32 bit, hex, 8 chars) over JSON.stringify(block): the existing function, moved
function fingerprintShallow(block: Block): string;   // the same over the block without its `children` key

// treeMerge.ts
interface TreeMergeResult { blocks: Block[]; fingerprints: Record<string, string> }
function seedFingerprints(shipped: readonly Block[]): Record<string, string>;
function mergeBlockTree(copy: readonly Block[], shipped: readonly Block[], fingerprints: Readonly<Record<string, string>>): TreeMergeResult;
function enforceRequired(blocks: readonly Block[], shipped: readonly Block[], required: readonly string[]): Block[];
```

`fingerprints` maps a block id to `fingerprintShallow` of that block as it was shipped when the copy last took it. A fresh copy stores `seedFingerprints(shipped)`: one entry per shipped block at any depth. The render path (SB-6d3) is `enforceRequired(mergeBlockTree(copy, shipped, fp).blocks, shipped, required)`.

## Rules (each one is tested)

1. **One fingerprint.** `fingerprintBlock` is today's `fingerprintHomeBlock`, moved; Home's fingerprints are byte-identical (test: the old and new functions agree on every block of the Home seed, and `home-dashboard-merge.test.ts` passes unchanged). A shallow fingerprint ignores `children`, so editing a child never marks its parent as edited.
2. **The merge, block by block, at every depth.** Walking the copy:
   - **added by the user** (id not in `fingerprints`): kept where it is; its children are merged.
   - **edited by the user** (`fingerprintShallow(block) !== fingerprints[id]`): the user's own fields are kept; its children are merged.
   - **untouched and still shipped**: takes the shipped block's own fields (everything except `children`), stays where the user put it (a move is not an edit), its children are merged, and its fingerprint becomes the new shallow fingerprint.
   - **untouched and no longer shipped**: removed. Any descendant the user added or edited, or that the shipped page still holds (somewhere else), is kept, lifted into the removed block's place in its original order. Other descendants go with it.
   - `Caveat:` (in `treeMerge.ts`'s header) positions are not fingerprinted, so a block the new shipped page moves stays where the copy has it: the merge cannot tell the user's move from the shipped one. That is the safe direction (nothing is lost, a block may sit in its old place). Following shipped moves would mean storing each block's parent and index with its fingerprint.
   - **deleted by the user** (in `fingerprints`, absent from the copy): stays deleted.
   - **new in the shipped page** (in neither `fingerprints` nor the result): inserted under its shipped parent when that parent is in the result, right after the nearest preceding shipped sibling present there, else first. When its shipped parent is not in the result (the user deleted the container), it is not inserted. Root-level blocks use the root list the same way.
   - `fingerprints` in the result: every entry for a block still shipped or still in the result; entries for ids in neither are dropped.
3. **Required blocks come back.** `enforceRequired` inserts every `required` id missing from `blocks` (at any depth) from the shipped tree, with only those shipped children whose ids are not already present, at its shipped position by Rule 2's insertion rule. When its shipped parent is missing, it goes under the nearest shipped ancestor present in the result (as its last child), else at the root by the root rule. On every required block present, `visibleWhen` and the sizing keys of `style` (`width`, `fixedWidth`, `basis`, `size`, `textSize`) are the shipped block's values (each removed when the shipped block has none): a copy cannot hide or shrink a required control. Its other style keys (tone, surface, border, radius, spacing, alignment) stay the copy's. An id in `required` that the shipped tree does not hold is ignored.
4. **Safe on odd input.** Inputs are never mutated. A copy holding the same id twice keeps the first occurrence (pre-order) and drops the later ones with their subtrees. A user block whose subtree the merge did not change is returned as the same object (`===`), so a merge after a no-op ship re-renders nothing.
5. **Properties.** With `mulberry32` over 500 seeds, generate a shipped tree (depth ≤ 4, ≤ 60 blocks), derive a copy by random edits, deletions, moves and additions, and a new shipped version by random edits, removals, moves and additions; then assert:
   - ids in the result are unique;
   - every block the user added appears exactly once;
   - every block the user edited appears exactly once with the user's own fields;
   - every block the user deleted is absent unless it is required;
   - every required id is present exactly once and carries the shipped `visibleWhen` and sizing keys;
   - idempotence: merging the result again against the same shipped page with the result's fingerprints returns a deep-equal tree and map;
   - a fresh copy: `mergeBlockTree(shipped, shipped, seedFingerprints(shipped))` deep-equals `shipped`.
6. **Linear.** Each function builds its id maps once and is O(n) in the blocks of both trees; no per-block `find` over a list. `tree-merge.bench.ts` reports p50 and p95 for a 2,000-block copy against a 2,000-block shipped page (paste them; no budget assertion in the bench).

## Steps

- [ ] **Step 1: Failing tests** (`tests/canvas/tree-merge.test.ts`): one fixture per line of Rule 2 and Rule 3, written out as small literal trees, plus Rule 1's agreement, Rule 4's identity and duplicate cases, and Rule 5's property test.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/tree-merge.test.ts tests/canvas/home-dashboard-merge.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) an untouched block no longer shipped is kept;
  - (b) a new shipped block whose parent the user deleted is inserted at the root;
  - (c) `fingerprintShallow` includes `children`;
  - (d) `enforceRequired` keeps the copy's `visibleWhen`;
  - (e) `enforceRequired` keeps the copy's `width` on a required block.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `npm run test:bench -- tests/bench/tree-merge.bench.ts` (paste p50/p95). Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the bench numbers, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
