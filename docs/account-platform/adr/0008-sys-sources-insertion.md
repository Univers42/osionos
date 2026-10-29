# ADR 0008 — the `sys:` sources are inserted by the slash group, and no `sys:` provider is registered

Status: accepted 2026-10-22 (devil verdict BLOCK on the P4-1 spec for b and c, D-P4-1s2; the bridge
half — a and r — is unaffected and proceeds). The twelve conditions of that verdict are applied in
`target/specs/P4-1.r3.md`; this ADR records why they were needed and what they bind.

## Context

Facts, each read out of the app tree `/home/dlesieur/Documents/groot-wt/integration/app` on
2026-10-22 (HEAD `4a26330d`). Nothing of P4-1 has landed yet.

1. **Only a REGISTERED provider can leak.** The vendored Source picker builds its catalog from
   `listRegisteredDataSources()`
   (`src/shared/notion-database-sys/src/components/viewSettings/SourcePickerScreen.tsx:84-88`),
   which is built only from registered providers
   (`src/shared/notion-database-sys/src/store/sources/dataSourceRegistry.ts:50-60`, `:64-77`).
   Picking one runs `bindViewSource`, which merges that source's rows into the running store
   (`src/shared/notion-database-sys/src/store/sources/bindViewSource.ts:64-68`). The block's own
   adapter would then be the KNOWN adapter
   (`src/widgets/database-view/ui/DatabaseBlock.tsx:141-144`, `:269`), whose `persistState` writes
   into `useKnownDatabaseStateStore`
   (`src/widgets/database-view/model/knownDatabaseState.ts:424-439`) → the browser-global
   localStorage key `osionos.knownDatabaseState.v1`
   (`src/widgets/database-view/model/knownDatabaseStorage.ts:27`) → `POST /api/object-databases`
   under whoever is signed in
   (`src/widgets/database-view/model/objectDatabaseBridgeSync.ts:113-159`, `:98-100`). The app's own
   picker never reads the registry — it lists live mounts only
   (`src/widgets/database-view/ui/DataSourcePicker.tsx:33-41`, `:68-97`).
2. **The dispatch text still asked for the provider.** The contract section B4
   (`docs/account-platform/wp/P4-1.md:525-542`), the P4-1-b OWNS entry (`:837`) and the mutant
   "drop `readOnly: true` from the provider's descriptor" (`:805`) all said to build and register
   one. b1 (`:157-160`) forbids it, but the three places an implementer actually looks all said the
   opposite: a spec that needs three of its own sections crossed out is not a dispatch text.
3. **The insertion path exists and needs no new machinery.** `handleSlashDatabaseViewSelect`
   inserts `{ type: "database_inline", databaseId, viewId }`
   (`src/features/slash-commands/model/useSlashSelect.ts:337-384`, the insert at `:354-360`) and
   calls NO `createInlineDatabase()` — that is the other path
   (`src/features/slash-commands/model/useSlashSelect.ts:108-122`). The menu dispatch for it exists
   (`item.kind === "database-view"`,
   `src/features/block-editor/ui/BlockEditorSurface.tsx:827-828`) and the command kind is still in
   the union (`src/features/slash-commands/model/types.ts:66-71`, `:82-89`). What is missing is the
   catalog entries, dropped at
   `src/features/slash-commands/model/slashMenuCatalog.tsx:294-298`, plus a section label
   (`EXTRA_SECTION_LABELS`, `:88-90`) and a section order (`SECTION_ORDER`, `:92-99`; an unknown
   section sorts last, `:432-448`).
4. **`DatabaseBlock.tsx` has TWO known-adapter branches, not one.** The known branch (`:234-257`)
   and the fallback for a user-created database (`:259-283`, adapter `:141-144`, used at `:269`). A
   `sys:` id must precede BOTH; an unrecognised one (`sys:my-activity`, not a shipped source) is
   meant to fall into the fallback and render today's behaviour.
5. **The sign-out seam is one chain, and it is not the recents adapter's watch.**
   `useUserStore.logoutUser` (`src/features/auth/model/useUserStore.ts:500-506`) →
   `signOutEverywhere` (`src/features/auth/model/bridgeLogout.ts:114`) → `clearLocalSession`
   (`src/features/auth/model/useUserStore.ts:383`) → `signedOutState` (`:369-381`), which deletes
   the session and lets `activeUserId` fall back to another account or `''`. Revocation is
   `handleSessionRevoked` (`:508-513`), account switch is `switchUser` (`:410-413`). The observable
   signal is `activeUserId` / `sessions[activeUserId]?.accessToken` (`:652-663`, `:670-672`). The
   recents adapter watches the WORKSPACE and only re-emits
   (`src/widgets/database-view/model/recentsDatabaseState.ts:152-154`) — it drops nothing.
6. **The canvas runner has no module mocking, no DOM and no `import.meta.env`.**
   `node --experimental-strip-types --test tests/canvas/*.test.ts` (`scripts/docker-run.sh:40`). A
   stubbed global fetch works (`tests/canvas/settings-api.test.ts:70-84`) only if the module under
   test does not import `@/shared/api/client` — `src/shared/api/client.ts:34` reads
   `import.meta.env` at import time; the shim pattern is `tests/canvas/settings-api.test.ts:36-43`.
   The auth barrel is stubbed the way `tests/canvas/settings-commands.test.ts:41-52` does it. The
   slash catalog holds JSX, which node's type stripping cannot load
   (`tests/canvas/whiteboard-slash-command.test.ts:5-10`).
7. **Two of b2's assertions pass on empty input.** `globalThis.window` is undefined in the runner,
   so `flushKnownDatabaseStatePersist` returns before the localStorage write and before
   `pushDirtyObjectDatabases` (`src/widgets/database-view/model/knownDatabaseState.ts:191-200`).
   "the known state holds no `sys:` key" and "the object-databases push carries none" are
   therefore E2E assertions, not canvas ones. The same is true of the registry check: importing
   only the registry module proves nothing, because the registry has no side-effect import of the
   app provider (`src/shared/notion-database-sys/src/store/sources/dataSourceRegistry.ts:50-60`); the
   app provider registers when
   `src/widgets/database-view/ui/DatabaseBlock.tsx:53` is loaded.
8. **The engine's view shape is closed and enumerable.** `ViewConfig` has 11 top-level keys
   (`src/shared/notion-database-sys/packages/contract-types/src/index.ts:562-574`) and
   `ViewSettings` 77 optional keys (`:466-559`). `ViewConfig` REQUIRES `id` and `databaseId`
   (`:562-574`), and the client rebuilds the view from the stored body — so a stored `databaseId`
   redirects the view at render time. The old route pattern `^[A-Za-z0-9_-]{1,64}$` ADMITS
   `__proto__`.
9. **The app and the bridge cannot share a list.** The bridge's `SELF_SOURCES` is a Node module
   under `scripts/`; the app's catalog is `src/widgets/database-view/model/sysDataSources.ts`. A
   browser bundle cannot import the former, so "one list" can only be true through a shared
   artifact both sides read.
10. **The diff cannot know the default view.** The host calls `persistState` right after the load
    (`src/shared/notion-database-sys/src/object_database.tsx:486-519`), so the first diff sees
    `previous = {}` against `next = { default view }` — the exclusion of the default view is the
    only thing that prevents a write on every load.

## Decision

1. **No `sys:` provider is built or registered.** The contract section, the OWNS entry and the
   provider mutant are deleted; b1 governs. The `sys:` sources are never registered in the vendored
   registry, so no `sys:` descriptor can ever reach the Source picker.
2. **There is ONE insertion path: the "My data" slash group.** It is owned by exactly one package
   (P4-1-b) and every file it touches is named in that package's OWNS — the entries' module, the
   catalog (the wiring, the section label, the section order) and, read-only, the command kind and
   the insert path.
3. **The insert reuses the path that exists.** `handleSlashDatabaseViewSelect`, dispatched by
   `item.kind === "database-view"`; the path that calls `createInlineDatabase()` is not used.
4. **`diffViews(next, previous, defaultViewId)` is exported** and names the default view id
   explicitly, so the default view is never written and the diff stays idempotent.
5. **The view-id rule and the body key allowlist are written as lists.** The id must match
   `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` and must not be `__proto__`, `constructor` or `prototype`; the
   body carries only the nine stored top-level keys plus the 77 `ViewSettings` keys; `id` and
   `databaseId` are REJECTED in the body and re-derived by the client (the map key and
   `sys:<source>`).
6. **The transport is injected, and the default lives in its own module.** `SysTransport` and the
   default `sysTransport` are in `sysDatabaseTransport.ts`; `sysDatabaseState.ts` and
   `sysDatabaseViews.ts` import the TYPE only, so neither loads `@/shared/api/client` in the canvas
   runner.
7. **The null-prototype patch is kept and made observable.** The patch is handed to the transport
   BEFORE it is serialized, so `Object.getPrototypeOf(capturedPatch) === null` can be asserted
   through the injected transport.
8. **The `sys:` state is a named, droppable in-memory cache.** `getSysSourceStateCacheSize()` is
   the accessor the sign-out test asserts on, `clearSysSourceStateCache()` is the drop, and the
   signal the adapter watches is the session pair `activeUserId` /
   `sessions[activeUserId]?.accessToken`.
9. **The two known-store assertions are E2E assertions**, and they are in the E2E list.
10. **Every b1–b6 case is in the checks list**, each naming the ruling it settles, with the
    `truncated` line's home in the E2E.
11. **One shared fixture pins the two lists.** `tests/fixtures/sys-sources.json` is written once
    (by P4-1-a) and read by the bridge registry test and the app's canvas test, so the six ids
    cannot drift.
12. **The `sys:` branch precedes BOTH known-adapter branches**, and an unrecognised `sys:` id
    deliberately falls into the fallback.

## Consequences

- **The verdict was BLOCK** (D-P4-1s2, `target/review/D-P4-1s2/VERDICT.md`): the first review's
  substantive findings were resolved — the leak path is closed, the insertion mechanism exists in
  the code, the sign-out seam exists — but the dispatch text still carried three day-one defects
  (the provider still asked for in three places, the insertion path owning no file, and
  `diffViews` unimplementable from its stated signature) plus b2's two vacuous assertions and the
  absence of b1–b6's cases from the checks list. The twelve conditions above are exactly those
  defects, and each one is an edit to the spec text, not a new design.
- **The scores move with them.** Blast radius 4/5 (a `sys:` provider would put the caller's page
  titles, peer cards and session metadata into a browser-global localStorage key and into a
  server-side object-databases row under the next account on the device); reversibility 4/5 (the
  code half is one revert, but rows already copied into that key and into an object-databases row
  survive the revert until the storage is cleared); cost on failure 4/5 (a silent cross-account
  read on a shared device, plus a "read-only" source that becomes editable and persisted);
  confidence 3/5 before this revision — the plan had shown the design is safe, not that the
  dispatch text was executable.
- **The bridge half is untouched.** a and r are unaffected by this verdict; the only bridge-side
  change this ADR causes is that P4-1-a owns the shared fixture and that A3's `my-sessions`
  allowlist drops `ip_prefix`, which a7 already ruled.
- **P4-1-b is now self-contained**: it owns the catalog, the adapter, the block, the branch AND the
  insertion path, so its own e2e can create a `sys:` block through the only supported way in.
- **The residual risk is unchanged and named**: an unrecognised `sys:` id (e.g. `sys:my-activity`)
  falls into the known-adapter fallback on purpose, so the "no `sys:` key in the known store"
  invariant is stated for the six shipped sources.
- **What stays true after the conditions**: the rows never enter the known store, the only thing
  the user owns is the view, and the Source picker can never bind a `sys:` source.

## Rejected
- **A `sys:` provider with a "do not merge" exception:** it would mean a second code path in
  vendored code, and the exception would be the leak.
- **The Source picker as the insertion path:** the picker rebinds a view of an EXISTING database
  block, and its catalog cannot list a `sys:` source without registering one.
- **A second source list for the app:** the app's catalog is a copy of the bridge's ids by
  construction; the shared fixture is the pin, not a second list.
- **Dropping the null-prototype requirement:** it is belt-and-braces (the route rejects the three
  names), but it is cheap to keep once the patch is handed to the transport unserialized.
