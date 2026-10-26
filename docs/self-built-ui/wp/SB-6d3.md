# SB-6d3 — User copies of settings pages, the client half: Edit this page, Reset, and editing a copy like a page (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7). With the table (SB-6d), the routes (SB-6d2) and the merge (SB-6m) in place, this package lets a user press **Edit this page** on a settings page, edit their own copy in the normal block editor, see it in Settings from then on, and **Reset to default**. The copy always renders as `enforceRequired(mergeBlockTree(copy, shipped, fingerprints))`, so a newer shipped page reaches it and a required control never leaves it. Behind `osio.settings.edit` (default off) until the plan's G5.

Base: the integration tip with SB-6m, SB-6d2, SB-1e and SB-6a merged.

## What exists (read these first)

- The editor's content source: `usePlaygroundBlockEditor.ts:99-106` (`PlaygroundBlockEditorSource`: `page` and `cell`), `selectEditorContent` (277-281), the store read at 652-657, the write in `updatePageContent` (680-692) and `readStoreContent` (720-722). Undo history is local to the hook (`useBlockHistory`, 854), not in the page store. `BlockEditorSurface.tsx:123-135` (`source` prop, `EditorSurfaceSource`).
- SB-1e's `SystemPageHost` and `systemPagePanel` (`src/features/system-pages/`), `loadSystemDoc`, `SystemDoc.required` (SB-1d).
- SB-6m's `mergeBlockTree`, `seedFingerprints`, `enforceRequired`; SB-6d2's routes and error codes.
- SB-6a's Edit/View toggle pattern (`PageEditToggle.tsx`) and render modes.
- The settings stores' fetch pattern: `api`, `getActivePageJwt`, the offline build (`VITE_API_URL` empty); `ConfirmModal` and the toast store.
- `src/shared/config/featureFlags.ts` (one `is…Enabled()` per flag).

**OWNS:**
- `src/store/useBlockDocumentStore.ts` (new): block documents that are not pages (`documents: Record<string, Block[]>`, `setDocument(key, blocks)`, `readDocument(key)`, `clearDocument(key)`);
- `usePlaygroundBlockEditor.ts` and `BlockEditorSurface.tsx` (modified): a third source kind `{ kind: "document"; key: string }` at the four content seams above and nowhere else;
- `src/features/system-pages/model/resolveSystemPage.ts` (new): `resolveSystemBlocks`;
- `src/features/system-pages/model/useSystemPageCopies.ts` (new): the copy store (Interfaces);
- `SystemPageHost` (modified): the header row, Edit and View, Reset;
- `featureFlags.ts` (modified): `isSettingsEditEnabled()` (`osio.settings.edit`, default off);
- tests: `tests/canvas/system-page-copies.test.ts`, `tests/canvas/document-editor-source.test.ts`, `tests/e2e/bridge-stub/systemPageCopy.spec.mjs` (new), and a `system-pages` route in the bridge stub (added, nothing changed).

**MUST NOT TOUCH:** the page store, the page outbox and sync (a copy is not a page and never reaches them), `mergeBlockTree`/`enforceRequired` (call them), the bridge.

**Commit message:** `feat(settings): edit your own copy of a settings page, and reset it to the default`

## Interfaces

```ts
// usePlaygroundBlockEditor.ts
type PlaygroundBlockEditorSource = string | { kind: "page"; pageId: string } | { kind: "cell"; … } | { kind: "document"; key: string };
// a document source's pageId is `document:${key}` and its sourceKey `doc:${key}`; no page has that id

// resolveSystemPage.ts
function resolveSystemBlocks(doc: SystemDoc, copy: Copy | null): { blocks: Block[]; fingerprints: Record<string, string>; baseVersion: number };
// no copy → doc.blocks, seedFingerprints(doc.blocks), doc.version
// a copy  → enforceRequired(mergeBlockTree(copy.blocks, doc.blocks, copy.fingerprints).blocks, doc.blocks, doc.required ?? []),
//           the merge's fingerprints, doc.version; memoised on (doc, copy) identity

// useSystemPageCopies.ts
type CopyStatus = "idle" | "loading" | "ready" | "saving" | "conflict" | "unavailable";
interface SystemPageCopyState { status: CopyStatus; copy: Copy | null; message?: string }
load(pageId): Promise<void>; createCopy(doc: SystemDoc): Promise<void>; reset(pageId): Promise<void>;
keepLocal(pageId): Promise<void>; reload(pageId): Promise<void>;   // the two conflict exits
```

## Rules (each one is tested)

1. **A copy is a document, not a page.** The editor edits a copy through the `document` source: content is read from and written to `useBlockDocumentStore` under the key `settings/<pageId>`; the page store, outbox, sidebar, search and graph never see it (test: after editing a copy, `usePageStore.getState().pages` is deep-equal to before, and no `/api/pages` request was sent). The `page` and `cell` paths are unchanged (test: the existing editor canvas suites pass, and a `document` source with the same blocks produces the same editor output as a `page` source in `document-editor-source.test.ts`).
2. **What Settings shows.** With a copy, the host renders `resolveSystemBlocks(doc, copy).blocks`; without one, the shipped blocks, exactly as SB-1e does today. Settings search keeps reading the shipped anchors (no change to `searchSettings`).
3. **Required blocks cannot leave.** Every write of a document whose doc lists `required` goes through `enforceRequired` before it lands in the store, so deleting, cutting or hiding a required block puts it back at once, and a toast says "This control is required". Test: delete a required block by keyboard, by the block menu and by marquee + Delete; each time it is back and the toast shows once.
4. **Edit this page.** With the flag on, a signed-in viewer and a bridge, the host shows "Edit this page" when there is no copy. Pressing it creates the copy (`PUT` without `If-Match`: the shipped blocks, `seedFingerprints`, `baseVersion = doc.version`) and switches the host to Edit. With a copy, the header shows SB-6a's Edit/View switch and "Reset to default". With the flag off, none of this renders and Settings is exactly SB-1e's (test with the flag off: no header row, no request to `/api/system-pages`).
5. **Saving.** A document change saves 800 ms after the last edit (`PUT` with `If-Match: <version>`, the current blocks, the resolved fingerprints, `baseVersion = doc.version`); the header shows "Saving…" then "Saved". A failed save keeps the edits in the store, shows the server's message and retries on the next edit. A `412` sets `conflict`: the header says "This page was changed in another tab." with **Keep this version** (re-send with the server's `version`) and **Reload** (drop local edits, load the server copy). Nothing is overwritten without one of the two clicks. Tests: debounce (three edits, one request), 412 → both exits, offline → `unavailable`.
6. **Reset.** "Reset to default" opens `ConfirmModal` ("Reset this page to the default? Your changes to it are deleted.", action "Reset"); confirming sends `DELETE`, clears the document and shows the shipped page. Cancel changes nothing.
7. **Unavailable.** With no bridge (`VITE_API_URL` empty), a failed GET, or a `503`, the store is `unavailable`, the host shows the shipped page and no Edit button, and a line "Editing settings pages needs a connection to the server." appears only when the flag is on.
8. **Perf.** Opening a section whose copy differs from the shipped page in 20 blocks, on the SB-1e demo document: nav click to `[data-system-page]` visible, p95 ≤ 61 ms (the settings budget), 10 runs. Typing in a copy: `interactions.spec.mjs`'s `enter` case run on a document source stays within its budget (37 ms). Paste both.

## Steps

- [ ] **Step 1: Failing tests.** Canvas: `resolveSystemBlocks` (no copy, a copy, a required block missing), the copy store with a fake fetch (create, debounced save, 412 and both exits, reset, offline), the `document` source (Rule 1's equality and isolation). e2e (`bridge-stub/systemPageCopy.spec.mjs`, `PLAYWRIGHT_BRIDGE_STUB=1`, the stub storing copies in memory, flag on through `?osio.settings.edit=1`): Edit this page → edit a heading → reload → the edit is there; delete a required block → it is back with the toast; Reset → the shipped page; flag off → no header.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/system-page-copies.test.ts tests/canvas/document-editor-source.test.ts`; `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e tests/e2e/bridge-stub/systemPageCopy.spec.mjs`.
- [ ] **Step 3: Implement**, the `document` source first (alone, with Rule 1's tests green), then the store, then the host.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the document write skips `enforceRequired`;
  - (b) a 412 overwrites the server copy without a click;
  - (c) the `document` source writes through `usePageStore.updatePageContent`;
  - (d) the host renders the copy's blocks without the merge.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the new e2e green; the settings e2e (`settingsKit`, `mcpSettings`, the SB-1e host spec) and the editor e2e that touch the content path (`rg -l "contenteditable" tests/e2e/functional | head -20`, name the ones you ran) unchanged and green; Rule 8's numbers. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the perf numbers, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
