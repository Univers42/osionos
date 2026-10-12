# osionos — one workbench, pages as files (plan, 2026-10-12)

Paths: **A** = `apps/osionos/app` (submodule, the live app) · **G** = `/home/dlesieur/Documents/groot`.
`path:line` = verified on disk this session; INFERRED = not opened.

## Context

osionos has two interfaces stacked inside each other. The global VS Code-style
chrome (`TopBar` + `ActivitySidebar`, `A/src/app/App.tsx:350-358`) stays mounted
while "IDE mode" swaps a second hand-built VS Code clone into `<main>`
(`A/src/widgets/ide-shell/ui/`, 7 files / 543 lines, `App.tsx:366`): two activity
bars, two side panels, two file trees. Nothing from VS Code is embedded — the
engine is already standalone Monaco 0.56 (`A/src/features/ide/model/monacoRuntime.ts`).
"Remove the interface inside the interface" therefore means merging chrome, not
removing an iframe. No reverse engineering is needed (Monaco/VS Code are MIT source).

The console is broken for an environmental, provable reason: the second Docker
daemon `docker-ide` was never installed on this host (`systemctl is-enabled
docker-ide` → not-found), `/run/docker-ide.sock` is an empty root-owned directory
created by the compose bind-mount (`G/docker-compose.yml:733`), the socket proxy
answers 502, and the bridge — gated ON in `G/.env.local` — closes every sandbox
socket with 4004. The terminal itself closes once and stays closed
(`useIdeTerminal.ts:93` treats 4xxx as deliberate); what loops forever is the
fs-sync socket (`useIdeFsSync.ts:163-169` reconnects on every close, 4004 included)
and per-action failures (LSP attach, save-mirror, ports) pile on top.

The data model is inverted for an IDE: Postgres JSONB (`osionos_pages.content`) is
the sole truth; real files exist only in a per-(user,workspace) Docker volume
mirrored by SyncLink. The user wants the reverse: pages are files in an
osionos-owned workspace folder, in osionos's own dialect, next to code — web/docker
first, desktop over the real OS second, behind the same provider interfaces. The
DB becomes index, sync replica and collab transport.

## Decisions taken with the user (binding)

| # | Decision |
|---|---|
| 1 | Both current shells go (IDE mode **and** the Notion-page chrome). One workbench; reuse only engines/stores (Monaco runtime, block engine, xterm, VFS, zustand stores, bridge, sync). |
| 2 | Web + docker sandbox first; Electron/Tauri over the real OS second, behind the same `FsProvider`/`PtyProvider` (ADR-001 addendum, ADR-002). |
| 3 | Pages are files in a workspace folder (Obsidian model). No kernel drivers: "own partition" = an osionos-owned folder. DB = index/sync/collab. |
| 4 | Same release: daily-driver quality **and** PaaS tenant isolation kept (per-(user,workspace) sandbox on the isolated dockerd; the 16 conditions in `G/infrastructure/docker/osionos/ide-sandbox/README.md` stay). |
| 5 | First cycle = S2 (one shell) + S3 (pages-as-files) together; S1 (console) in parallel (needs sudo). |
| 6 | **`.omd` = osionos dialect (block page). `.md` = standard Markdown.** Conflict rule: the extension decides the editor, never a guess — `.omd` opens in the block engine; `.md` and everything else open in Monaco, with an explicit "Preview as page" (read-only, `PageBlocksRenderer`) and "Convert to .omd" action. One workbench, two document kinds — not two interfaces. |
| 7 | Stay on standalone Monaco. `@codingame/monaco-vscode-api` "views" mode mounts VS Code's own sidebar/panel widgets into our layout (the nesting we are removing) and locks ~40 packages to one version; Theia/OpenSumi/code-server make *us* the guest. Upgrade trigger, recorded: when TextMate grammars or a web extension host become a requirement. |
| 8 | Backward compatible: existing workspaces migrate on first attach; old shells deleted only after the new workbench is green behind a flag. |

## Sub-projects

| Id | Name | Cycle |
|---|---|---|
| S1 | Console works — Plane B activation runbook + visible degraded mode (no reconnect loop) | now, parallel (sudo) |
| S2 | One workbench — one rail, one panel, `WorkspaceGrid` + dock, one status bar | now |
| S3 | Pages as files — `.omd` codec, `workspace://` mount, DB as index, attach reconcile | now |
| S4 | Desktop over the real OS — host `file://` + local PTY providers (Electron/Tauri), Linux/Windows/macOS | next cycle |
| S5 | PaaS hardening — quotas, fly sandbox provider, Java LSP, DAP | later |

## What is reused vs new vs deleted

**Reused as-is**: Monaco runtime + LSP client; block engine (`usePlaygroundBlockEditor.ts`, `EditableContent.tsx`); `WorkspaceGrid` tabs/splits; `FsProvider` + `createMountTable` (`A/src/features/ide/vfs/types.ts:62-76`, `mountTable.ts:25`) + conformance suite; `sandboxProvider.ts` over `/api/ide/fs`; `mirrorTree` (`syncLink.ts:41`); three-way `decideInboundWrite` + echo hashes + `useIdeSyncConflicts` (`useIdeFsSync.ts:92-126`); dialect serializer/parser already round-trip tested (`pageMarkdownSerialize.ts:190` ↔ `packages/markdown-engine/markdown/shortcuts.ts:30`, `tests/canvas/markdown-roundtrip.test.ts`); **front-matter is already parsed** (`packages/markdown-engine/markdown/parser.ts:66-77` → `front_matter` node; `shortcuts.ts:271,453`); bridge PTY sessions + isolated dockerd; `TopBar` menus; `activity-rail` rail + `SidebarPanel`.

**New (bounded)**: front-matter codec + block-id overlay; `.omd` page-file facade/provider; `workspace://` switching mount; sandbox health store + one `SandboxUnavailable` state; attach reconcile (replaces blind materialize); `Workbench` (rail + grid + dock + status bar); VFS-backed Explorer; `EditorTitleBar`.

**Deleted (P3)**: `A/src/widgets/ide-shell/` (8 files), `ideModeStore.ts`, `osio.ide` flag + `VITE_OSIO_IDE` wiring, `SidebarPageTree.tsx` (686) + its 7 helpers, `IdeFileTree`/`IdeTreeRow`/`IdeExplorerPanel`/`IdeSandboxTree`, `ideFileTree.ts`, `pageStoreFacade.ts`, `useIdeFileOps.ts`, the three `ide*.spec.mjs`.

## Phases and gates

Branch per phase from `develop` (`feat/sandbox-degraded-mode` → `feat/page-files` → `feat/workbench` → `feat/workbench-cutover`), commit message `updated`, never pushed, no trailers. P0 ∥ P1; P2 after P1; P3 after P2 green + sudo activation done.

| Phase | Deliverable | Done when |
|---|---|---|
| **P0** (S1) | Sandbox unavailable = one visible, non-looping state + Retry; runbook executed by the user | `npm run test:canvas` (+ `ide-sandbox-health.test.ts`), `npm run test:quality`, `npm run test:e2e -- tests/e2e/functional/ideDock.spec.mjs`; `sudo sh G/infrastructure/docker/osionos/ide-sandbox/verify.sh` → `RESULT: N passed, 0 failed`; terminal shows a `bash -l` prompt; with `docker-ide` stopped the status bar says "Sandbox unavailable" once and the Output panel stops growing |
| **P1** (S3) | Every page has a lossless `.omd` form; `workspace://` provider serves all pages online and degraded; attach reconciles instead of clobbering | `npm run test:canvas` incl. `page-file-codec`, `page-paths`, `vfs-conformance` (page-file facade as 4th target), `ide-attach-reconcile`, `ide-inbound-file`; `npm run test:quality` |
| **P2** (S2) | Unified workbench behind `osio.workbench` (default OFF): one rail, one panel, grid + dock, one status bar, VFS explorer, no IDE mode | `npm run test:quality`; `npm run test:canvas`; `npm run test:e2e -- tests/e2e/functional/workbench.spec.mjs` (flag on); full `npm run test:e2e` (flag off) still green |
| **P3** | Flag default ON → full suite → delete old shells/flags/specs → docs synced | `npm run test:quality && npm run test:canvas && npm run test:bridge && npm run test:e2e` green; `rg -n "ide-shell\|ideModeStore\|osio\.ide\b\|osio\.workbench\|IDE Workspace" A/src A/tests` → nothing |

## Design decisions

**`.omd` page format.** Body = the existing dialect (`serializeBlocksToMarkdown` ↔ `parseMarkdownToBlocks`). Front-matter = a `---` block, one `key: <JSON literal>` per line (valid YAML flow syntax, so Obsidian/any YAML reader parses it; osionos needs only `JSON.parse` per line — zero new dependency). Keys: `id`, `title`, `icon`, `cover`, `cover_position`, `surface`, `visibility`, `database_id`, `template*`, `recurrence`, `properties`, `updated`, `blocks`. `blocks` is an overlay keyed by structural index path (`"3"`, `"3.1"`) carrying block `id` + non-Markdown attributes (allowlist: `collapsed`, `textColor`, `backgroundColor`, `codeView`, `codeTheme`, `lineNumbers`, `heightLines`, `sqlMountId`, `dueAt`, `media*`, `deferMount`, `collectionRef`, `recordRef`, `fieldBind`), applied only when the block type at that path matches (same positional semantics raw-mode already uses via `reconcileBlocks.ts:63`). A canvas self-check fails when a `Block` key (`A/src/entities/block/model/types.ts:121-166`) is neither emitted by `blockToMarkdown` nor allowlisted — no field goes silently lossy. Ids are written back: a file created in the shell without `id` gets one on first inbound sync (echo-suppressed rewrite), so renames/moves are detected by id afterwards.
Mapping: block pages → `<Title>.omd`, children in sibling dir `<Title>/` (folder-note layout); `surface:folder` → `<Title>/_folder.omd` (front-matter only); `surface:code` → the raw file at its path, no front-matter; database pages → `.omd` pointer with `database_id` + the existing `osidb-page` fence (schema/records stay in Postgres — lossy by design); drawings → existing `osidraw` fence (lossless); embed/console/chat tabs → no file; archived pages → no file (trash stays DB-backed). Workspace template ships `.gitattributes` with `*.omd linguist-language=Markdown` so GitHub renders pages; Monaco maps `.omd` → markdown highlighting (`monacoLanguages.ts`). Known-lossy after P1: database records, `placeholderText`, comments, `sortOrder` (explorer orders by name), any extra outside the allowlist.

**Folder location + degraded mode.** Web: the sandbox volume `/workspace` (`ide-sandbox-spec.mjs:82`) via the existing `sandbox://` provider. `workspaceMounts.ts` binds `workspace://<ws>` to the sandbox provider while `sandboxHealth.state === "online"`, else to the **page-file provider** (`pageProvider.ts` over a facade that serves every readable page as its `.omd` text). Consumers resolve per call through `mountTable.resolve` (`mountTable.ts:36`), so the switch is transparent: explorer, search, page editing keep working from the DB replica, labelled "Degraded — DB replica" in status bar and explorer. Health = one store probing `GET /api/ide/session?workspaceId=` (`bridge-ide-sandbox.mjs:170-174`: 200 running/stopped, 404 disabled, 502 unavailable); 60 s poll only while not online + manual Retry; deliberate WS closes (4001/4003/4004) set state directly. Accepted: shell-only files invisible while degraded (today's behaviour). Per-user sandboxes mean the folder is per collaborator; the DB stays the convergence point this cycle.

**Workbench layout.** `[TopBar] / [rail + side panel][WorkspaceGrid ∕ Dock] / [StatusBar]`. The existing `activity-rail` becomes *the* rail; `ActivePanel` (`A/src/shared/config/uiStore.ts:19-28`) gains `scm | run | problems`. Dock = `IdeBottomStrip` generalised (Terminal/Problems/Output/Ports; the Debug placeholder is dropped — honest, not built), resizable, Ctrl+` / Ctrl+J, in every workspace. `ideModeStore` → `workbenchStore` (`dockOpen`, `dockTab`, `dockHeight`, `statusBar`; one-shot import of `osio.ide.mode.bottomOpen`). Document dispatch stays `TabKind`; the code-page branch `PaneContent.tsx:75` loses its `isIdeEnabled()` guard — Monaco always. `NotionPage.tsx` survives as document content (page-config vars `:119-129`, `PageOutlineRail` `:151`, `PageHeader` `:159-166`, `PageBody` `:168`) **except `PageHeaderBar`** (`:153-157`, breadcrumbs/share/favourite/tools = chrome) which becomes `EditorTitleBar` rendered by `PaneView` for every document kind; `DatabaseBlock.tsx:422` / `WorkspaceDatabaseBlock.tsx:69` keep it via `chrome="bar"`. Status bar shows the real branch (`git status --porcelain -b`) instead of the literal `—` (`IdeStatusBar.tsx:48`).

**Explorer.** `workspace://<ws>/` through the mount table — one tree, pages and files interleaved, dirs first. `*.omd` rows render as pages (title sans suffix, icon from the index); `_folder.omd` hidden, decorates its dir; everything else = code file; shell-created files appear in the same tree (retires the separate "SANDBOX" root). Path↔id via a memoised `pageIndex` from the page store. Carried over explicitly before `SidebarPageTree` is deleted: Recents/Favourites strip (`FavoriteSidebarItem`), access filtering (`canReadPage`), DnD move, inline rename/create (`IdeInlineInput`), row actions. Refresh = `provider.watch()` (sandbox native via `ideFsEvents.ts`; page provider poll).

**Migration.** No cliff: DB keeps every page; files are produced on first attach by `reconcileOnAttach` (replaces blind `mirrorTree` in `materialize.ts:41-49`, which clobbers shell edits on every attach): missing in sandbox → write + record hash; identical → record; differs → `decideInboundWrite` (`ideSyncEngine.ts:52-66`) with front-matter `updated` vs `page.updatedAt` as tiebreak when the ledger is empty, else a surfaced conflict. The `lastSynced` ledger is persisted per workspace (`osio.ide.synced.v1`) so reloads stop producing false conflicts. Code/folder paths from `idePaths.pathForPage` are unchanged, so LSP URIs stay stable.

## File-level work list

### P0 — degraded mode + runbook
Create: `A/src/features/ide/model/sandboxHealthStore.ts` (~90; reuse `API_BASE`, `getActivePageJwt` from `shared/api/client.ts`) · `model/wsCloseCodes.ts` (~30; table from `bridge-ide-exec.mjs:22-24`) · `ui/SandboxUnavailable.tsx` (~60; reason + Retry + runbook link; used by terminal, ports, sandbox tree, status bar) · `A/tests/canvas/ide-sandbox-health.test.ts` (pattern `ide-reconnect-backoff.test.ts`).
Modify: `useIdeFsSync.ts:163-169` (deliberate close → `health.markClosed`, no timer; connect only when online; Retry reconnects) · `useIdeTerminal.ts:88-105` (`isDeliberateClose`, reason on status) · `IdeTerminal.tsx:60-64` (`<SandboxUnavailable/>`; update `ideDock.spec.mjs:45`) · `IdeStatusBar.tsx` interim chip · `IdePortsPanel.tsx`, `IdeSandboxTree.tsx` fetch only when online (INFERRED they poll) · `CodeFileView.tsx:84,120` gate mirror/run on `health.online` · `G/infrastructure/docker/osionos/ide-sandbox/README.md` Activation (+ the socket-became-a-directory recovery; verify count 15 vs 16 — `IDE-BACKLOG.md:368` vs `ACTIVATE-dlesieur42.sh`) · `G/IDE-BACKLOG.md` §5 + changelog.

### P1 — page files (new slice `A/src/features/page-file/`)
Create: `model/frontMatter.ts` (~110; `splitFrontMatter`/`joinFrontMatter`, unparseable → body, never throws) · `model/pageFileMeta.ts` (~70) · `model/blockOverlay.ts` (~120) · `model/pageFileCodec.ts` (~140; `pageToFile`/`fileToPage`/`isPageFileName`; reuse `codeFile.ts:40`, serializer, parser, `reconcileBlocks`) · `model/pagePaths.ts` (~130; `PAGE_FILE_SUFFIX=".omd"`, `FOLDER_META_NAME="_folder.omd"`, collisions → ` (2)` by `_id`; reuse `sanitizeSegment` `idePaths.ts:46`) · `model/pageIndex.ts` (~100) · `model/pageFileFacade.ts` (~180; supersedes `pageStoreFacade.ts:39`; `canReadPage`) · `model/pageFileWriter.ts` (~120; `usePageStore.subscribe`, 800 ms debounce, skip when `sha16(pageToFile) === syncedHashOf`; reuse `ideFsWrite` `ideFsClient.ts:22`) · `A/src/features/ide/vfs/workspaceMounts.ts` (~90) · `A/src/features/ide/model/reconcileOnAttach.ts` (~150) · `model/applyInboundFile.ts` (~160; split from `applyFsEvent` `useIdeFsSync.ts:66-127`) · `model/syncLedgerPersist.ts` (~60) · tests `page-file-codec`, `page-paths`, `ide-attach-reconcile` (two `createMemProvider`s), `ide-inbound-file`, `fixtures/pageFileMemFacade.ts`.
Modify: `pageProvider.ts:21-29,55,124` (`PageFacadeEntry.name?`; fallback `toSegment(title)` keeps `vfs-conformance.test.ts:36` green) · `materialize.ts` → delegate · `useIdeFsSync.ts` → `applyInboundFile`, ready → `reconcileOnAttach` · `ideSyncEngine.ts` persist ledger · `idePaths.ts:28` delegate to `pathForEntry` (+ equality test) · `CodeFileView.tsx:97,192` URIs from `pageIndex` · `monacoLanguages.ts` `.omd`→markdown · `vfs-conformance.test.ts` 4th target. Bridge + fs-agent: no change (`/api/ide/fs` is path-generic; `.omd` not ignored by `osio-fs-agent.mjs:36-40`).

### P2 — unified workbench (`osio.workbench`, default OFF)
Create `A/src/widgets/workbench/` (no barrel): `ui/Workbench.tsx` (~120; mounts `useIdeFsSync(ws, health.online)`, probe, `pageFileWriter`, `useDockHotkeys` from `IdeShell.tsx:51-60`) · `ui/WorkbenchDock.tsx` (~150, from `IdeBottomStrip`, terminal stays mounted across tabs) · `ui/DockSplitter.tsx` (reuse `useSidebarResize`) · `ui/WorkbenchStatusBar.tsx` (~130) · `ui/EditorTitleBar.tsx` (~80, hosts `PageHeaderBar`) · `model/workbenchStore.ts` (~90, `osio.workbench.v1`) · `model/editorStatusBus.ts` · `model/useDockHotkeys.ts`. Plus `A/src/features/ide/ui/WorkspaceExplorer.tsx` (~170) + `WorkspaceExplorerRow.tsx` (from `IdeTreeRow`) + `model/useWorkspaceFileOps.ts` (~160, every op via `getWorkspaceMounts(ws).resolve("workspace://…")`; keeps `importFolder`/`exportZip`) · `activity-rail/ui/panels/ExplorerPanel.tsx`, `ExplorerRecents.tsx`, `ScmPanel.tsx`, `RunPanel.tsx`, `ProblemsPanel.tsx` (lazy wrappers over `IdeSourceControl`/`IdeRunPanel`/`IdeProblemsPanel`) · `page-file/ui/PageConflictBanner.tsx` (mirror of `CodeFileView.tsx:203-223`, mounted by `PageBody.tsx`) · `tests/e2e/functional/workbench.spec.mjs` · `tests/canvas/workbench-store.test.ts`.
Modify: `App.tsx:343-378` (`isWorkbenchEnabled() ? <LazyWorkbench/> : legacy`) · `lazyAppRegions.tsx` (+`LazyWorkbench`, deep import) · `uiStore.ts:19-28` · `railItems.ts:51-64`, `SidebarPanel.tsx:42-52,67-90` · `PaneContent.tsx:75` (drop guard) · `PaneView.tsx` (+`EditorTitleBar`, INFERRED render order) · `NotionPage.tsx:153-157` `chrome` prop; `DatabaseBlock.tsx:422`, `WorkspaceDatabaseBlock.tsx:69` · `PageBody.tsx` · `CodeFileView.tsx:51,84,112,186` (`isIdeMode` → `health.online`) · `top-bar/model/menus.ts:52-66,156-166` (Terminal → `openDock`; delete the "New Terminal Window" toast; View → panel/status bar/problems/output/ports) · `SidebarFooter.tsx:98-135` (drop Dev Mode + IDE Workspace toggles when flag on) · `ideTasks.ts:82-85` · `IdeSearchPanel.tsx:5-8` (search `workspace://`) · `useIdeGit.ts` (branch) · `featureFlags.ts` (+`isWorkbenchEnabled`) · `global.css` (+`--osio-statusbar-h`, `--osio-dock-min-h` — the only token file).

### P3 — cut-over, delete, docs
Flip the flag default; full gate; delete the list in "Deleted" above plus `LazyIdeShell` (`lazyAppRegions.tsx:42-47,101-103`), `FilesPanel.tsx`, `pageTreeItem.helpers.ts`, `usePageRowDnd.ts`, `sidebarTreeDnd.ts` (INFERRED: confirm no other consumers of `Sidebar.tsx`/`useNewSidebar` first), `VITE_OSIO_IDE` in `A/.env`/compose/`app.Dockerfile` (INFERRED per `IDE-BACKLOG.md:262-264`), the legacy `App.tsx` branch, `chrome` conditional, `ideMode/ideDock/ideWorkspace.spec.mjs` → `workbench*.spec.mjs`, `ide-file-tree.test.ts`, `ide-file-ops.test.ts`.
Docs: new `G/docs/ide/ADR-004-page-files.md`; `ADR-001-vfs.md` addendum 3 (`workspace://` switching mount); `IDE-BACKLOG.md` (§3.4 says CodeMirror → Monaco; §3.2 "page tree is the manifest" → "front-matter id"; §5; runbook); ide-sandbox `README.md`; `A/CLAUDE.md` (shell paragraph, dispatch, flags, `widgets/workbench`); `A/tests/FUNCTIONALITIES.md`.

## Data & sync flow

1. **Page edit → file → DB**: block editor → `updatePageContent` (`usePageStore.ts:382`) → (a) existing outbox `PATCH /api/pages/:id` (`pageOutbox.ts:67`) = DB replica, unchanged; (b) `pageFileWriter` → `pageToFile` → `ideFsWrite` (records echo + synced hash, `ideFsClient.ts:26-27`) → `POST /api/ide/fs` temp+`mv` (`ide-sandbox-spec.mjs:196-198`) → fs-agent re-emits → `decideInboundWrite` = `echo`. Offline: (b) skipped; next attach reconciles.
2. **Shell edit → page**: fs-agent NDJSON (sha256[:16] = `sha16`) → `/api/ide/fsync` → `applyInboundFile`: `.omd` → id known → compare against canonical `pageToFile(page)` → `apply` = `fileToPage` → `patchPage` + `updatePageContent` (writer then sees equal hashes — no loop); id at another path → move/rename; no id → create + write id back; raw files → today's `createWithAncestors`; delete → archive + clear ledger.
3. **Conflict**: `useIdeSyncConflicts.report` → code: existing banner; page: `PageConflictBanner` (Keep mine = `ideFsWrite` ours; Take file = `fileToPage(theirs)` + record hash). Status bar + Output count them.
4. **Attach/reload**: `ready` → `reconcileOnAttach`; persisted ledger; `updated` tiebreak only when the ledger is genuinely empty.
5. **Degraded**: `workspace://` = page-file provider; reads/writes → store → outbox → DB; terminal/ports/sandbox-only ops show `SandboxUnavailable`; no reconnect timers, only the 60 s probe + Retry.

## S1 runbook (user, sudo) — from `G`

`ACTIVATE-dlesieur42.sh` and `STORAGE-dlesieur42.sh` in `G/infrastructure/docker/osionos/ide-sandbox/` are the authority; the README's Activation section lacks steps 1-2 (P0 adds them).
1. `docker compose --env-file ./.env.local --profile ide rm -sf osionos-ide-socket-proxy` — stop the proxy whose bind-mount created the directory.
2. `sudo rmdir /run/docker-ide.sock && test ! -e /run/docker-ide.sock`.
3. Data-root: `findmnt /var/lib/docker-ide`; if absent, create per README (24 G loopback) or the LV from the ACTIVATE header — **check `df -h /var /` first** (the script header recorded 2.6 G free on `/var`). Mount must show `prjquota`.
4. `sudo cp infrastructure/docker/osionos/ide-sandbox/docker-ide.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now docker-ide`; `systemctl is-active docker-ide` → `active`; `test -S /run/docker-ide.sock`; `sudo docker -H unix:///run/docker-ide.sock info --format '{{.DockerRootDir}}'` → under `/var/lib/docker-ide`.
5. `sudo sh infrastructure/docker/osionos/ide-sandbox/install-egress-nat.sh`.
6. Images: `docker image inspect osionos-ide-sandbox:latest osionos-ide-egress:latest osionos-ide-socket-proxy:latest --format '{{index .RepoTags 0}}'`; build per README step 1 if missing; then `sudo TMPDIR=/var/tmp sh infrastructure/docker/osionos/ide-sandbox/bootstrap.sh`.
7. `sudo sh infrastructure/docker/osionos/ide-sandbox/verify.sh` → `RESULT: N passed, 0 failed`, else stop and report the failing line.
8. `COMPOSE_PROFILES=ide docker compose --env-file ./.env.local up -d osionos-ide-socket-proxy && docker compose --env-file ./.env.local restart osionos-bridge`.
9. Probe: `docker compose --env-file ./.env.local exec osionos-bridge wget -qO- http://osionos-ide-socket-proxy:2375/_ping` → `OK`; the app's status bar flips to Online and the dock terminal shows a prompt.
`G/.env.local:98-109` already holds the gates — no edit.

## Verification (end-to-end)

- Gates per phase (table above), all via `npm run …` (self-dockerizing; never host node).
- Manual after S1: open a workspace → explorer shows `.omd` pages next to code; `vim Roadmap.omd` in the dock terminal → page updates; edit the page → `cat Roadmap.omd` shows the change; `sudo systemctl stop docker-ide` → status bar degrades once, Output panel silent; `start` → Retry → Online.
- Browser evidence (Playwright/Chrome DevTools MCP): workbench at 1440/768 widths, both themes, console clean, keyboard: Ctrl+J toggles dock, Tab reaches rail → panel → editor; axe pass on the workbench shell.

## Risks & unknowns

- Overlay misalignment after hand edits that insert blocks (positional, like raw mode) — mitigated by type-guard + self-check test; residual accepted.
- No rename event in the fs-agent (`IDE-BACKLOG` G-FSW): shell renames of raw code files = delete+create (new page id); `.omd` safe via `id`.
- Explorer parity with `SidebarPageTree` (DnD reorder, favourites, channels, access filter) must land in P2 before P3 deletes it; `sortOrder` has no file form.
- Perf of page-file `list()` on large workspaces (ADR-001 falsifier `:104-106`) — memoised index, unmeasured until P1.
- materialize caps (500 files / 512 KiB, `materialize.ts:23-24`) stay, surfaced as counts.
- Host disk for `docker-ide` data-root unverified today (`df` first).
- INFERRED: ports/sandbox-tree polling, `PaneView` render order, `Sidebar.tsx` consumers, `VITE_OSIO_IDE` build-arg sites, whether `lspMonaco.attachLsp` retries on 4004.

## Out of scope this cycle

Desktop host `file://` + local PTY providers (S4); PaaS quotas/fly provider/Java LSP/DAP (S5); fs-agent rename events; CRDT over files; database records/schema as files; trash as files; `sortOrder` in files; WS 1 MiB cap; zen/mobile layout; CSS redesign beyond two tokens.

## Execution model (user rules, 2026-10-13): parallel lanes, cheap executors, branches

**Branches.** Two repos carry the work: the osionos submodule (`A`, remote `Univers42/osionos`, has `develop`) and groot (`G`, docs/infra/`.env`, pins the submodule SHA). In each: `feat/ide` from `develop` = the integration branch; lane branches `feat/ide-<lane>` from `feat/ide`; unit work in throwaway worktrees (`oc-run.sh`) merged into the lane branch after review; lane → `feat/ide` after the lane gate; `git merge develop` into `feat/ide` after every lane merge (merge, never rebase — shared branch); `feat/ide` → `develop` only when P3's full gate is green. Commit messages: osionos `updated` (its CLAUDE.md), groot conventional (`feat(ide): …`); no trailers; never push without an explicit go.

**Lanes (independent after the interface step; run concurrently).**

| Lane | Branch | Units | Depends on |
|---|---|---|---|
| I · interfaces (Opus, first, ~1 h) | `feat/ide` | types only: `SandboxHealth`, `PageFileCodec`/`PageFileMeta`/`BlockOverlay`, `WorkspaceMounts`, `WorkbenchStore` signatures in `G/docs/ide/interfaces/ide-interfaces.ts` + stub modules exporting the types, so every lane codes against fixed contracts | — |
| A · degraded mode (P0 app) | `feat/ide-health` | `sandboxHealthStore`, `wsCloseCodes`, `SandboxUnavailable`, `ide-sandbox-health.test`; wire `useIdeFsSync`/`useIdeTerminal`/`IdeTerminal` | I |
| B · page-file codec (P1 pure) | `feat/ide-codec` | `frontMatter`, `pageFileMeta`, `blockOverlay`, `pageFileCodec`, `pagePaths` + canvas tests incl. the allowlist self-check | I |
| C · provider + sync (P1) | `feat/ide-mounts` | `pageIndex`, `pageFileFacade`, `workspaceMounts`, `reconcileOnAttach`, `applyInboundFile`, `syncLedgerPersist`, `pageProvider.name`, conformance 4th target | I (B's types; B's code at integration) |
| D · workbench shell (P2) | `feat/ide-workbench` | `Workbench`, `WorkbenchDock`, `DockSplitter`, `WorkbenchStatusBar`, `EditorTitleBar`, `workbenchStore`, hotkeys, `App.tsx` flag branch, menus, `uiStore` panels | I (A's health type) |
| E · explorer (P2) | `feat/ide-explorer` | `WorkspaceExplorer`, rows, `useWorkspaceFileOps`, `ExplorerPanel`, Recents, `PageConflictBanner` | I (C's mount type) |
| F · docs + infra (P0/P3) | `feat/ide-docs` (G) | ide-sandbox README activation steps 1-2, `ADR-004-page-files.md`, `IDE-BACKLOG` corrections (CodeMirror→Monaco, verify count), `A/CLAUDE.md` | — (documenter agent) |
| S1 · sudo runbook | human | steps 1-9 above | — |
| P3 · cut-over | `feat/ide` | sequential, after A–F merged and the full gate is green | all |

Integration points: C+B → `feat/ide` (P1 gate) · D+E over A+B+C → `feat/ide` (P2 gate, flag off/on e2e) · P3.

**Executor ladder (cheapest first; Opus = orchestrator only).** Opus writes each unit's contract, owns interfaces, security/sync design, every git merge, every gate and diff review. Units go to:
1. **opencode free models** via `~/.claude/tools/oc/oc-run.sh REPO TASK CONTRACT MODEL…` (`--standalone`, fresh worktree per attempt, exit 75 = chain exhausted). 11 models listed today (`opencode models`): big-pickle, exo-free, ling-3.0-flash-fin-free, ling-3.1-flash-free, longcat-2.5-preview-free, mimo-v2.6-flash-free, muse-spark-1.3-contributor-free, nemotron-3-ultra-free, nemotron-3.5-lightning-free, space-bunny-free, step-5-preview-free (exo-free 410 and ling-3.0 400 on 2026-10-11 — re-probe). Before each wave: `oc-probe.sh` every model in parallel; the chain lists **all** answering models. Effort by unit kind: parsers/codec/sync (DSA-precise) → `space-bunny#max`, `muse-spark#xhigh`, `step-5#high` first; UI glue/tests → the rest; several units in parallel on different models to spread per-model limits.
2. **Haiku** (KISS units: wrappers, lazy panels, docs glue) / **Sonnet** (multi-file wiring: D, E, C integration) subagents when the chain returns 75 or the unit needs repo-wide reading; `oc-wait.sh` runs in the background to return to tier 1.
3. **Opus** only for: contracts, `reconcileOnAttach`/conflict semantics, security review of the fs path, merges, gates.
Rate limits are per model — never "opencode is down" until every answering model has been tried; every report names the 429 models with the error text.

**Unit contract (what every executor receives).** Inputs → outputs → done-when; the exact file list (create/modify, ≤200 lines each); the interface file to code against; the `.claude/tools/digest.sh` + `codemap.sh` excerpt for those files (this is the "RAG" — the contract carries the retrieval; no vector store, rung 0); binding rules (no `any`, named exports, deep imports, tokens not literals, 42 header on config files, Ponytail markers on heuristics, no trailers); the gate command (`npm run test:canvas -- tests/canvas/<x>.test.ts`, `npm run test:quality`). Unit U0 (Lane B `frontMatter.ts`) is also the calibration: it establishes whether a worktree can run the Docker-first gate itself; if not, Opus runs gates after `oc-accept.sh`.

**opencode setup (post-approval, before the first wave).** `~/.config/opencode/opencode.json`: add `mcp` entries for the docker launchers (`pw` Playwright, `chrome-devtools`), keep `external_directory` deny; skills: `~/.config/opencode/skills` already holds the superpowers set — symlink the project ones (`ponytail`, `write-test`, `frontend`, `design-review`, `browser-testing`); `$OC_DIR/opencode.json` deny list uses the `shell` key (not `bash`).

**Convergence.** Unit → `oc-accept.sh` → `reviewer` agent on the diff → unit gate → merge to lane → lane gate → `feat/ide` → `git merge develop` → next wave. Browser evidence for D/E via the `pw`/`chrome-devtools` MCPs (console clean, 768/1440, both themes, Ctrl+J, Tab order, axe).

**After approval, in this order.** (1) Commit the design to `G/docs/superpowers/specs/2026-10-13-osionos-workbench-page-files-design.md` on `feat/ide` (brainstorming gate), then `writing-plans` turns lanes into unit contracts. (2) Create `feat/ide` in both repos; opencode setup; probe wave. (3) Lane I, then launch A–F concurrently; hand S1 to the user. (4) Housekeeping in the gaps: register the REA MCP (`claude mcp add --scope user rea -- ~/.claude/mcp-docker/rea/rea-mcp.sh`, smoke via `mcp-smoke.py`); memories (REA only via the docker launcher, never `rea setup --client claude_code`; chrome-devtools page tools need `pageId`; Google-fronted endpoints 403 here → no `npm audit signatures`); the `osionos` MCP server fails because `~/.nvm/versions/node/v22.22.2` is gone.
