# SB-1f — Raw-mode save keeps the fields Markdown cannot carry (self-built UI, phase S1)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md`). Every new block field this project adds (`style`, `visibleWhen`, bindings) is a field Markdown does not carry. This package fixes a data loss that exists today and would erase all of them.

**The bug (today, on develop):** raw mode's Save replaces the page with freshly parsed Markdown (`src/features/raw-mode/model/useRawMode.ts:63`: `updatePageContent(pageId, sanitizeLinkBlockFields(parseMarkdownToBlocks(sourceRef.current)))`).
- Every block gets a new id.
- Every field outside Markdown is dropped: `textColor`, `backgroundColor`, `collapsed`, `dueAt`, `recordRef`, `fieldBind`, `codeTheme`, `mediaWidth`, and the rest of `EXTRA_BLOCK_KEYS` (`src/features/page-file/model/blockOverlay.ts:73`).
- Repro: colour a paragraph's text red → open raw mode → Save without editing → the paragraph is no longer red.

**The fix is reuse, not new code.** The `.omd` page file solved the same problem: `collectOverlay(blocks)` records each block's id and extras by pre-order path, and `applyOverlay(parsed, overlay)` re-applies them where the block type still matches (`blockOverlay.ts:154`, `:192`). Raw-mode save does the same thing against the page's current blocks.

**OWNS:** `src/features/raw-mode/model/rawSave.ts` (new), `src/features/raw-mode/model/useRawMode.ts` (the `save` callback only), `tests/canvas/raw-mode-save.test.ts` (new).
**MUST NOT TOUCH:** `blockOverlay.ts` and the rest of `src/features/page-file/**`, the markdown engine, `reconcileBlocks.ts`, the preview path.

**Commit message:** `fix(raw-mode): saving keeps block ids and the fields Markdown cannot carry`

## Interfaces

- Produces: `rawSourceToBlocks(source: string, current: readonly Block[]): Block[]` in `rawSave.ts`. It returns `applyOverlay(sanitizeLinkBlockFields(parseMarkdownToBlocks(source)), collectOverlay(current))`. The file header says why it exists (this bug) and carries a `Caveat:` line: matching is by pre-order position and type, so an edit that inserts a block above a coloured one moves the colour off it. The same limit holds for the page file.
- `useRawMode.save` reads `usePageStore.getState().pageById(pageId)?.content ?? []` at save time, never at mount time (the page may have synced while raw mode was open), and calls `updatePageContent(pageId, rawSourceToBlocks(sourceRef.current, current))`.

## Steps

- [ ] **Step 1: Write the failing test** `tests/canvas/raw-mode-save.test.ts` (relative imports with `.ts` extensions, like `tests/canvas/markdown-roundtrip.test.ts`):
  - a paragraph `{ id: "p1", type: "paragraph", content: "hello", textColor: "red" }` and a toggle `{ id: "t1", type: "toggle", content: "T", collapsed: true, children: [{ id: "c1", type: "paragraph", content: "inner", backgroundColor: "blue" }] }`. Run `serializeBlocksToMarkdown` then `rawSourceToBlocks(md, current)`: ids `p1`, `t1`, `c1` are kept, `textColor === "red"`, `collapsed === true`, and the child has `backgroundColor === "blue"`;
  - the same source with the paragraph's text edited to "hello world": id and `textColor` are kept, and the content is the new text;
  - a source where the user changed the paragraph into a heading (`# hello`): the heading gets no `textColor` (the type changed, so nothing is carried) and a fresh id;
  - a source with one extra paragraph appended at the end: the first blocks keep their fields, and the new one has none;
  - `rawSourceToBlocks("", [])` deep-equals `[]`.
- [ ] **Step 2: Run it to see it fail.** `npm run test:canvas -- tests/canvas/raw-mode-save.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `rawSave.ts` and wire `useRawMode.save` to it.
- [ ] **Step 4: Run the gates.** The new test passes; `npm run test:canvas` (whole suite) rc 0; `npm run test:quality` rc 0. Run the existing raw-mode e2e if one exists (`rg -l "raw" tests/e2e/functional`) and report it.
- [ ] **Step 5: Commit** with the message above. No trailer, no push.

## Report

List the files changed, paste the test output lines (`# pass N`, `# fail 0`) and the `test:quality` tail, and give the commit SHA. A gate you could not run is reported as SKIPPED with the reason, never as passed.
