# SB-6h3 — Workspace defaults for settings pages, the client half: three layers, an admin's "default for everyone", version history and rollback (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 "Three layers of defaults"). With SB-6h2's routes, a settings page resolves as shipped → workspace default → the viewer's copy. This package renders the three layers, lets a workspace owner or admin edit the default for everyone in place, see its versions, roll back and restore the shipped default, and keeps blocks an admin wrote from running with the trust of a shipped page. Behind `osio.settings.edit` (default off), like SB-6d3.

Base: the integration tip with SB-6d3 and SB-6h2 merged.

## What exists (read these first)

- SB-6d3: `useBlockDocumentStore`, the `document` editor source, `resolveSystemBlocks`, `useSystemPageCopies` (statuses, debounced save, 412 exits, Reset), the `SystemPageHost` header.
- SB-6m: `mergeBlockTree`, `seedFingerprints`, `enforceRequired`, `fingerprintShallow`.
- SB-1e: `SystemPageContext`, `isTrustedPage`, `useTrustedPage(hostPageId)` (`src/entities/page/model/pageTrust.ts`) and their callers (`runProgram.ts`, the button call site, SB-4d's trusted-only sources, SB-4h's flows): `rg -n "useTrustedPage|SystemPageContext" src`.
- SB-6h2's contract (`docs/self-built-ui/wp/SB-6h2.md`).
- The active workspace and the caller's role as the client knows them: `rg -n "canWrite|role === \"admin\"|role === 'admin'" src/features/settings src/store | head`. The server decides; the client only hides controls it would refuse.
- `ConfirmModal`, the toast store, `Modal`/`Dialog` from `@osionos/ui`.

**OWNS:**
- `src/features/system-pages/model/resolveSystemPage.ts` (modified): the three layers (Interfaces);
- `src/features/system-pages/model/useWorkspaceSystemPages.ts` (new): the default store;
- `src/features/system-pages/ui/SystemPageHost.tsx` (modified) and `src/features/system-pages/ui/SystemPageVersions.tsx` (new): the admin mode, the version list;
- `src/entities/page/model/pageTrust.ts` (modified): `UntrustedBlocksContext` and the optional `blockId` of `useTrustedPage`; each caller found by the `rg` above passes its block id (one argument each, nothing else);
- tests: `tests/canvas/system-page-layers.test.ts`, `tests/canvas/workspace-system-pages.test.ts`, `tests/e2e/bridge-stub/workspaceSystemPage.spec.mjs` (new), and a `workspaces/<id>/system-pages` route in the bridge stub (added, nothing changed).

**MUST NOT TOUCH:** the page store and outbox, `mergeBlockTree`/`enforceRequired`, `useSystemPageCopies`' save path (call it), the bridge.

**Commit message:** `feat(settings): workspace defaults for settings pages, with version history, rollback and restore`

## Interfaces

```ts
// resolveSystemPage.ts
interface ResolvedSystemPage {
  blocks: Block[];
  fingerprints: Record<string, string>;   // what a new copy of this page stores
  baseVersion: number;                    // doc.version
  workspaceBlockIds: ReadonlySet<string>; // ids the workspace layer added or changed (Rule 3)
}
function resolveSystemBlocks(doc: SystemDoc, workspaceDefault: Default | null, copy: Copy | null): ResolvedSystemPage;
//   W = workspaceDefault ? enforceRequired(mergeBlockTree(ws.blocks, doc.blocks, ws.fingerprints).blocks, doc.blocks, required) : doc.blocks
//   copy ? enforceRequired(mergeBlockTree(copy.blocks, W, copy.fingerprints).blocks, doc.blocks, required) : W
//   a new copy seeds seedFingerprints(W). Memoised on (doc, workspaceDefault, copy) identity.

// useWorkspaceSystemPages.ts
type DefaultStatus = "idle" | "loading" | "ready" | "saving" | "conflict" | "unavailable";
load(wsId, pageId); createDefault(wsId, doc); restoreShipped(wsId, pageId);
listVersions(wsId, pageId, before?); openVersion(wsId, pageId, version); rollback(wsId, pageId, version);
keepLocal / reload        // the two conflict exits, as SB-6d3's

// pageTrust.ts
const UntrustedBlocksContext: React.Context<ReadonlySet<string>>;   // default: empty set
function useTrustedPage(hostPageId: string, blockId?: string): boolean;
//   unchanged without blockId; with one, false when the id is in UntrustedBlocksContext
```

## Rules (each one is tested)

1. **Three layers, one resolver.** The host renders `resolveSystemBlocks(doc, default, copy).blocks`. Without a default it is exactly SB-6d3's result (test: deep-equal on the SB-6d3 fixtures). A user's Reset deletes the copy and shows the workspace default; the Reset dialog's text is unchanged. Required blocks are enforced at both layers, against the shipped tree, so neither an admin nor a user can drop one (test: a default without a required block renders it; a copy built on that default renders it).
2. **The default for everyone.** With the flag on, a bridge, and the client's view of the caller as owner or admin of the active workspace, the header gains a switch "Only me / Everyone". "Everyone" edits the default as the document `settings-ws/<wsId>/<pageId>` through the `document` source, with SB-6d3's save behaviour (800 ms debounce, If-Match, "Saving…"/"Saved", the 412 exits) against SB-6h2's routes; "Edit this page" in this mode creates the default from the shipped page. Members see no switch. A 403 from the server shows "Only workspace owners and admins can change this page for everyone." and switches back to "Only me". When the viewer has no copy and a default exists, a line under the title says "Set by your workspace".
3. **What an admin wrote does not run as a shipped page.** `workspaceBlockIds` holds every id the workspace layer added (not in the shipped tree) or changed (`fingerprintShallow` differs from the shipped block's). The host provides it through `UntrustedBlocksContext`, so a button, trusted-only source or flow inside such a block resolves `useTrustedPage(host, blockId) === false` even inside Settings: a confirm-less action is `blocked`, a trusted-only source does not render. A shipped block the workspace did not touch keeps its trust. The set stays the same when the viewer's copy edits those blocks: the program still came from the admin. Tests: a confirm-less test action in an admin-added button resolves `blocked`; the same action in an untouched shipped button resolves `ok`; an admin edit to a shipped button's program makes it `blocked`; a copy's edit of an untouched shipped block keeps it `ok`.
4. **Versions.** "Version history" (Everyone mode only) opens a dialog listing versions newest first (version, action in words — "Saved", "Rolled back to version N", "Restored the shipped page" —, author, relative time), 20 at a time with "Show older" (the `next` cursor). Selecting one shows it read-only (`preview` render mode); "Restore this version" goes through `ConfirmModal` ("Make version N the default for everyone?", action "Restore") and calls rollback with the current version as If-Match. "Restore shipped default" goes through `ConfirmModal` ("Restore the shipped page for everyone? Members' own copies stay.", action "Restore") and calls DELETE. Both refresh the default and show a toast.
5. **Unavailable.** No bridge, a failed GET or a 503: the default store is `unavailable`, the host renders shipped + copy as SB-6d3 does, and the Everyone switch is hidden. A member's settings never wait on the default: the shipped page (or copy) renders first and the default replaces it when it arrives, without a layout shift taller than 0 px above the fold (the host keeps the same root box).
6. **Perf.** On the SB-1e demo with a default and a copy each 20 blocks off the shipped page: nav click to `[data-system-page]` visible, p95 ≤ 61 ms over 10 runs; `resolveSystemBlocks` on a 2,000-block page, p95 printed by a bench in `tests/bench/` (no assertion). Paste both.

## Steps

- [ ] **Step 1: Failing tests.** Canvas: the resolver (no default; default only; default + copy; a required block missing at each layer; `workspaceBlockIds` for added, changed and untouched blocks), the default store with a fake fetch (create, debounced save, 412 both exits, 403, rollback, restore, versions paging, offline), `useTrustedPage` with and without a block id. e2e (`PLAYWRIGHT_BRIDGE_STUB=1`, `?osio.settings.edit=1`, the stub holding defaults in memory, one admin and one member account): the admin switches to Everyone, edits a heading, reloads → the edit is there; the member opens the page → sees it with "Set by your workspace"; the admin rolls back → the member sees the old heading on reopen; the admin restores shipped → the member sees the shipped page; the member has no switch.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement**, resolver and trust first, then the store, then the host.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the copy merges against the shipped tree instead of the workspace layer;
  - (b) `workspaceBlockIds` omits changed shipped blocks;
  - (c) the host does not provide `UntrustedBlocksContext`;
  - (d) a rollback is sent without If-Match.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the new e2e and SB-6d3's `systemPageCopy.spec.mjs` green; the settings e2e (`settingsKit`, `mcpSettings`) green; Rule 6's numbers. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the perf numbers, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
