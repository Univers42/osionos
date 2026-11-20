# DRAFT ADR. Template apply replaces content only through the editor's undo seam, clones catalogue databases from an input slice and never into the store, and never replaces a page from an app action or a card click

- Status: proposed (devil ruling on `2026-11-20-template-dashboards-design.md`)
- Date: 2026-11-20
- Deciders: devil (risk), owner (product calls kept: canvas-first, replace after a dialog, shared catalogue)
- Tree read: osionos `feat/template-dashboards` = develop 19b198e9e. Engine read at pin 5ce06e41 (fetched into the groot app checkout). Markdown engine read at groot app checkout 1bde976, which is not the live pin.
- Verdict: **PROCEED-WITH-CONDITIONS** (TD1–TD24). Two sub-features are BLOCKED: `template.apply` with a `pageId` argument, and a card click that replaces a page.

## Context

### 1. Apply-replace data safety

- Replacing page content never deletes a database on the server. The push only uploads dirty slices. A database missing from the state is never deleted remotely (`objectDatabaseBridgeSync.ts:151-155`), and no bridge runtime walks database blocks in content (`rg database_inline scripts/*.mjs` finds only the seed, MCP and simulation scripts).
- Replacing content never deletes a database locally either. `rg "delete .*databases\[|removeDatabase|unregister"` finds no path that drops an unreferenced database. ADR 0051 holds.
- **Undo cannot be reached from a store action.** The history lives in a `useRef` inside the editor hook (`useBlockHistory.ts:90`) and is cleared on every source change (`usePlaygroundBlockEditor.ts:869-873`). A function in `pageStore.actions.ts`, as the plan places `applyTemplateToPage`, cannot push an undo step.
  - The seam already exists. `EmptyStarterEditor.commitContent` is one undo step (`BlockEditorSurface.tsx:146-153`), and `EditorHandle.updateContent = commitContent` (`BlockEditorSurface.tsx:504-512`). `applyTemplateBlocks` already uses it (`applyShell.ts:17-24`).
  - The bus keeps only the *active* (focused) handle (`editorCommandBus.ts` `active`). A click in the rail panel does not guarantee that handle is the target page's page-level surface.
- Undo restores content only, because `applyContent` = `updatePageContent`. Cover and icon are not in the snapshot.
- Undo is lost on reload or navigation. No server version history is uploaded (page-versions v1b ruling). `saveAutosaveVersion` records the content *after* a change (`versionAutosave.ts:27-40`, `usePageActions.ts:155-170`). After a reload, "Replace" without a copy is a one-way door, so `destructive: false` is wrong.
- `updatePageContent` refuses an unloaded body (`usePageStore.ts:377`, `canEditBody` at `pageStore.helpers.ts:66-68`). If the clone runs first, its databases are written to the store (`templateDatabaseInstantiate.ts:31-37`) and pushed with no page referencing them.
- **The catalogue databases are not in the clone's input.** `cloneTemplateDatabases` clones only ids that are present in `state.databases` (`templateDatabaseClone.ts:42`). Any other database block keeps the template's id.
  - The page then invents a starter for that unseen id, and the starter reaches the server at its first edit (`objectDatabaseBridgeSync.ts:89-92`).
  - The result is two applies sharing one database, which breaks the anti-goal.
  - Today's templates avoid this only because their databases sit in the boot seed (`knownDatabaseState.ts:530-551`). ADR 0064 PS18 forbids that for a catalogue.
- If the catalogue slice is merged into the clone input, the output state holds the originals as well (`templateDatabaseClone.ts:262-283` spreads `state.databases`). `replaceState` then persists them as user databases. They are not seed ids, so they get pushed and listed in the sidebar (`objectDatabaseBridgeSync.ts:106-112,192`).
- `instantiateTemplateContent` keeps the template's block ids (`pageStore.helpers.ts:103-115`). `applyTemplateBlocks` mints fresh ids (`applyShell.ts:18`).

### 2. Keep-copy

- `createDuplicatePage` takes the server path for every id that is not `local-page-` (`pageStore.actions.ts:747`).
- `duplicateViaServer` copies the **whole subtree** with `content: source.content` (`:722`). An unloaded child is `undefined` there, so its copy is empty.
- It **switches the active page to the copy** (`:738`, `activateDuplicateRoot`). That unmounts the target's editor, clears its history and drops its handle before apply runs.
- If a child step fails, it returns the root id (`:731`), so a half copy looks like success.
- Databases are shared, not cloned. The copy's blocks keep the same `databaseId`. After apply, only the copy references the old databases.
  - After undo, both pages reference them: the same linked-view state as today's Duplicate.
  - This is acceptable if the dialog says so. The template's anti-goal is untouched, because the new databases come from the clone.

### 3. `cardClick`

- `bridge-self-views.mjs:52-68` covers `sys:` sources only and **refuses** an unknown key with 422 (`:110-113`).
- `bridge-library-views-shape.mjs:32-41` **refuses** unknown keys on write. On read it **drops the whole view** (`:144-158`).
  - Its header (`:15-17`) excludes "something that runs" from shared views.
  - `tests/canvas/library-views-shape-parity.test.ts:59` forces the kit's settings list to equal that list minus `EXCLUDED_SETTINGS`.
- User object-database views have no server allowlist. `bridge-object-db-guard.mjs` checks only for blanking (`:24-27`).
- At pin 5ce06e41, `git grep` finds no client-side settings stripping in the engine. That is a heuristic, so an old client is assumed to keep the key and ignore it.
- `openPagesIn` (`contract-types/src/index.ts:566`) is the neighbouring key.
- Beta calls the prod bridge (ADR 0030 / beta notes). A beta client writing a key that the live bridge refuses gets a 422.

### 4. `tpl:` ids

- The gallery adapter's writes are reload no-ops (`templatesDatabaseState.ts:104-118`).
- `isPersistedPageId` (`pageStore.helpers.ts:55`) keeps `tpl:` away from `fetchPageContent` (`pageStore.actions.ts:201`), archive (`:448`), restore (`:997`) and delete (`:1039`).
- **Duplicate does not use that guard** (`:747`). A `tpl:` entry that reaches `usePageStore` would be POSTed with the catalogue's database ids.
- `createPageFromTemplate` needs `pageById(templateId)` (`:796-797`), so a `tpl:` id returns null there today.
- A card's `renderPage` opens the record id (`templatesDatabaseState.ts:13-19`), which would put `tpl:` into recents.

### 5. LayoutCell fields

- Markdown and `.omd` keep unknown cell keys. The serializer writes `layoutCells` raw into `osilayout` (`pageMarkdownSerialize.ts:154-161`). The parse spreads the JSON record (`markdown-engine/markdown/shortcuts.ts:243-251`, at 1bde976). The overlay checks only `id` (`blockOverlay.ts:54-56`).
- **The canvas strips them.** `migrate` and `unmigrate` list every field by hand (`canvas/model/migration.ts:60-91,116-140`), and every canvas save goes through `unmigrate` (`controller/persistence.ts:29-33`).
  - Any tab whose bundle lacks the mapping drops `region`, `stackAt` and `sticky` on its next canvas save, and the outbox publishes the result.
  - Blocks and placement survive. Only the shell semantics are lost, silently.
- The publish snapshot keeps a closed set of cell fields (`bridge-publish-snapshot.mjs:177-191`). New fields are dropped on publish, and databases are dropped too (`:19`).
- `LayoutCell` has no `style` (`types.ts:102-140`), so "a card is a cell with a BlockStyle surface" has no field to live in.
- ADR 0064 PS9 already gates `stackAt` on canvas cells.

### 6. Performance

- `DatabaseBlock.tsx:67` imports `templatesDatabaseState` statically. Anything `templateEntries()` imports statically joins that chunk.
- Panels load through `PANEL_LOADERS` (`panelLoaders.ts`) with deep imports.
- `migratePanelId` maps an unknown stored panel to `files` (`uiStore.ts:44-46`), so an old tab survives a stored `templates` panel.

### Unknown when this was written

- Whether live's engine pin keeps unknown cell keys in `osilayout`. ADR 0064 PS9 still applies.
- Whether `addVersion` versions survive a reload.
- The byte size of each catalogue template's databases.
- The spec places `applyTemplateToPage` in `store/pageStore.actions.ts` (line 135) but routes undo through the open editor (lines 141-144). Those two cannot both hold. TD1 decides for the editor seam.

## Decision

Canvas-first shells, a shared code catalogue and replace-after-dialog go ahead under these conditions. Each is an acceptance test for the builder.

**Apply (T2)**

- **TD1.** Apply writes content only through the target page's page-level editor handle (`commitContent`). The handle is resolved by `pageId` and `kind:"page"`, never from "the active editor".
  - If no such surface is mounted, apply opens the page and waits for it, or refuses with a message. It never does a silent store write.
  - Test: undo once, and the content deep-equals the pre-apply array.
- **TD2.** Precondition gate, before any write, any clone or any copy: `canEditBody(target)` is true and the template's body is loaded.
  - Test: an unloaded target makes zero store writes, zero `knownDatabase` writes and zero `addPage` calls.
- **TD3.** Order: gate, then copy, then clone, then commit. If the copy returns null, or its root content does not deep-equal the target's, apply aborts before the clone.
- **TD4.** Cover and icon are either left alone by apply, or restored by the same undo. Test: one undo restores all three fields.
- **TD5.** Before committing, apply records the pre-apply content as a named version through the existing `saveVersion`/`addVersion` path.
  - If a test shows those versions do not survive a reload, the dialog must not call Replace recoverable. It says "undo until you leave this page".
- **TD6.** The "Replace" button is styled and labelled destructive. "Keep a copy and apply" stays the default and the first button.
- **TD7.** Content comes from `applyTemplateBlocks` (fresh block ids), not a second copy of `instantiateTemplateContent`.

**Databases (T2/T3)**

- **TD8.** The catalogue's example databases reach `cloneTemplateDatabases` as an input slice loaded with the catalogue chunk. They are never in `seedSnapshot`, never in `SEED_PAGES` and never in the page cache (PS18).
- **TD9.** After apply, the store's database ids equal the ids before apply plus `created`, exactly. No catalogue original is stored or pushed.
- **TD10.** After cloning, every `database_inline` or `database_full_page` block in the new content points to an id that is in `created` or was already a user database. Otherwise apply aborts with no write.
  - Test: two applies of each of the 16 templates share 0 database ids, and none of them equals a catalogue id.
- **TD11.** Apply never removes a database. Test: database count and row count per database are unchanged before apply, after it, and after undo. This includes a page whose old blocks were the only reference.
- **TD12.** If the known-database store is not writable, apply refuses before the copy (`KnownDatabaseReadOnlyError` path).
  - The serialized slice size of each template is measured and reported in T3, with the command.
  - Templates are capped at the measured p100 plus a stated margin, which is set from the ADR 0056/0060 budget and not guessed.

**Keep-copy (T2)**

- **TD13.** Keep-copy copies the root page only, from its loaded content. It does not change `activePage` or recents.
  - The dialog says the copy shows the same databases.
  - A failed root step aborts apply with a toast.

**Actions and card click (T2/T5)**

- **TD14.** `template.apply` as an app action only **creates a new page**. It takes no `pageId`, uses `confirm:"simple"` and allowlists `templateId` (a readable `isTemplate` page or a catalogue id).
  - Replacing goes only through the panel or editor UI with the three-choice dialog. Button programs and automations cannot replace a page (out of scope: `.out-of-scope/template-apply-replacing-a-page-from-an-app-action.md`).
- **TD15.** `cardClick:"use_template"` (spec line 156) creates a new page from the card. It never replaces any page, including the one that hosts the gallery.
  - A record that is not a template opens normally.
  - An unknown `cardClick` value opens normally.
- **TD16.** `cardClick` is added to the kit's `ViewSettings` and to `EXCLUDED_SETTINGS` in the Library parity test. It is **not** added to the Library allowlist or the `sys:` allowlist.
  - The view menu hides the option on Library and `sys:` sources.
  - No bridge change ships, so T5's "bridge allowlist" item is removed.
  - Test: an old view without the key behaves as `open`, and an unknown value behaves as `open`.

**`tpl:` ids (T3)**

- **TD17.** `tpl:` entries never enter `usePageStore`, the page cache, recents, favorites or any `addPage`/duplicate path. The guard is a unit test that feeds `tpl:x` to `duplicatePage`, `archivePage`, `patchPage` and `openPage` and observes 0 bridge calls and 0 store or cache writes.
  - A catalogue card opens the preview and never calls `openPage`.
  - "Save as my own" goes through `createPageFromTemplate` (clone), never through duplicate.

**Regions (T1)**

- **TD18.** Readers ship first. `migrate`/`unmigrate` map `region`, `stackAt` and `sticky`, and the renderer reads them.
  - That reader reaches live in one promotion before any writer can emit them (the `/` page shells, the catalogue, the cell menu). Writers stay behind a flag that is on for beta and off for live until then.
  - Test: an old-bundle round trip (today's `migration.ts`) drops the fields and keeps every block and grid slot. The ADR 0064 PS9 test also runs on live's engine pin.
- **TD19.** Values are enums. An unknown `region` or `stackAt` is treated as absent. They reach the DOM only as `data-*` attributes, never as an inline style or class built from a stored string (PS2).
- **TD20.** "Cards" use the block-level `style` that already exists, on a block inside the cell, or else gain a cell field under TD18's reader-first rule. The spec must pick one before T1.
- **TD21.** Every template's nesting is at most 8 levels (PS17). Every template round-trips `serialize`→`parse` and `pageToFile`→`fileToPage` unchanged under the develop and live engines (PS21).

**Performance (T3/T4)**

- **TD22.** The catalogue is loaded only by dynamic import. `templateEntries()` merges it after the chunk resolves (state-replaced). A source test (PH7 style) and a build-manifest check show no catalogue module in the entry's static graph.
- **TD23.** The panel registers in `PANEL_LOADERS` (deep import) and uses the ADR 0066-fixed loader. `boot-ab.sh` warm and cold boot stay inside the baseline, with the ABBA run cited.
- **TD24.** Panel previews render on hover or focus only, with a bounded cache size stated in a `Caveat:`. The panel passes axe AA in light and dark (spec T4).

## Alternatives considered

- **Apply as a store action that pushes undo.** Rejected: no store-level history exists (`useBlockHistory.ts:90`). Building one is a second history system next to the editor's.
- **Seed the catalogue databases like today's templates.** Rejected: it adds 16 templates' rows to every boot, and PS18 already blocks it (`.out-of-scope/page-shells-as-seed-pages.md`).
- **Whitelist `cardClick` on the bridge.** Rejected: user database views need no allowlist. On the Library, a shared view that runs an action against members is what `bridge-library-views-shape.mjs:15-17` forbids. A Library rollback after the key is stored drops whole views (`:144-158`).
- **Reuse `createDuplicatePage` unchanged for keep-copy.** Rejected: it navigates away (`:738`), copies unloaded children empty (`:722`) and reports a partial copy as success (`:731`).

## Consequences

- Risk scores: blast radius 4 (every page's body, plus every canvas page's cells); reversibility **4** (Replace without a copy is lost after reload; cloned databases persist on the server); cost on failure 4 (silent content loss, silently shared databases); confidence 3 (four unknowns above).
  - **Worst: reversibility**, Replace without a copy.
- The builder owns TD1–TD24. T2 does not reach develop without TD1–TD14. T1 writers wait for the TD18 reader.
- This ruling supersedes ADR 0064 Phase 2's code-shell catalogue. PS2, PS9, PS17, PS18, PS19 and PS21 carry over as written.
- Revisit when a server page-version history exists. Then Replace becomes reversible, and TD5/TD6 can relax.
