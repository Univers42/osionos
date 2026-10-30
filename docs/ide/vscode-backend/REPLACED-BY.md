# What VS Code's backend replaces, and what osionos keeps

The IDE moves onto VS Code's own services (`@codingame/monaco-vscode-api`, editor mode) talking
to a VS Code server on each connected machine (ADR-006 in groot `docs/ide/`). This table is the
deletion ledger: a row is deleted in the phase named, **after** its replacement is green, never
before. "Keep" rows are osionos logic that VS Code does not have.

| Piece today (files) | Replaced by | Phase | Status |
|---|---|---|---|
| Editor runtime: `model/monacoRuntime.ts`, `ui/useMonacoEditor.ts` (standalone monaco-editor 0.56, still used by code pages on the app origin) | the IDE client's library `initialize`, on the IDE origin; until then two Monaco copies coexist | 2 | open |
| Language client: `model/lspClient.ts`, `lspFraming.ts`, `lspMonaco.ts`, `lspProtocol.ts`, `lspReady.ts` + WS `/api/ide/lsp` + its relay in `scripts/bridge-ide-exec.mjs` | language extensions (Open VSX) in the server's extension host | 2 | open |
| Debugger: `model/dapSession.ts`, `debugController.ts`, `debugGutter.ts`, `debugStore.ts`, `ui/DebugPanel.tsx`, `ui/monacoBreakpoints.ts` + WS `/api/ide/debug` | `IDebugService` + debug extensions; the panel stays, re-pointed | 2 | open |
| Terminal: `model/useIdeTerminal.ts`, `ui/IdeTerminal.tsx`, `model/terminalFont.ts` + WS `/api/ide/pty` + `scripts/ide-term-sessions.mjs` | `ITerminalService` (`attachToElement` into the osionos dock) | 2 | open |
| Git: `model/useIdeGit.ts`, `gitBranch.ts` + `POST /api/ide/git` (allowlist in `ide-sandbox-spec.mjs`) | `ISCMService` + the built-in git extension (`git.*` commands) | 2 | open |
| File sync source: `model/useIdeFsSync.ts`, `ideFsEvents.ts`, `ideFsEcho.ts` + WS `/api/ide/fsync` + `osio-fs-agent.mjs` (groot sandbox image) | `IFileService` watcher events | 2 | open |
| Search: `vfs/vfsSearch.ts` + `POST /api/ide/search` (no caller) | the search service (ripgrep on the machine) | 2 | open |
| Run and format: `model/useCodeRunner.ts`, `formatCode.ts`, `ui/IdeRunPanel.tsx`, `ui/RunConsole.tsx`, `terminalRunBus.ts` + `/api/ide/run`, `/api/ide/format` | tasks + launch configs + formatter extensions | 2 | open |
| Host folder: `scripts/host-fs-ops.mjs`, `host-fs-path.mjs`, `host-fs-tree.mjs`, `host-fs-write.mjs` (merged, never wired) | the local machine's VS Code server | 2 | open |
| Sandbox exec relays: `scripts/bridge-ide-exec.mjs`, `bridge-ide-ops.mjs`, `ide-server.mjs` routes for the rows above | `/api/node/*` proxy to the machine's server | 2 | open |
| Sandbox plane: `bridge-ide-sandbox.mjs`, `ide-docker.mjs`, the sandbox image, socket proxy and egress proxy (groot `infrastructure/docker/osionos/ide-*`), `osio-fs-agent.mjs` | nothing: no sandbox, by the owner's decision (ADR-006 decision 9) | 2 | open |
| Ports and preview: `idePorts.ts`, `/api/ide/ports`, `/api/ide/preview/session` | VS Code port forwarding over the server connection | 4 | open |
| SSH key sync: `ideKeys.ts`, `/api/ide/keys/sync` | the machine's own keys and agent | 3 | open |

## Keep (osionos-owned)

| Piece | Why it stays |
|---|---|
| `inbound*.ts` pipeline (moves, archives, conflicts) | turns edits of `.omd` files into page changes; only its event **source** changes to `IFileService` |
| `src/features/page-file/` (`.omd` codec, front-matter, overlay) | the `.omd` format is osionos's |
| `vfs/` mount table, `pageProvider.ts`, `workspaceMounts.ts` `pages` mount | pages exposed as files |
| `api/ideTransport.ts`, `api/ideToken.ts`, `scripts/ide-token.mjs`, `bridge-ide-token.mjs`, `ide-access.mjs`, `ide-http-edge.mjs` | auth, token mint and origin checks for the new `/api/node/*` socket |
| `ui/monacoTheme.ts` | becomes the generator of the VS Code theme from osionos tokens (Phase 8) |
| Workbench layout, activity rail, dock, pages, AI, realtime | osionos is the host |

Tests are deleted with their rows. Each phase lands its RED tests first; the spike that
proved the replacements is `spike-2026-10-30.md` next to this file.
