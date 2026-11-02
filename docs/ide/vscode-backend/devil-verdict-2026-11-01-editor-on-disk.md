# Devil verdict: the osionos editor opens a folder on the user's computer (2026-11-01)

Request: the owner, 2026-11-01: "verify also that we can code within it … open a workspace or a codespace
based on the filesystem … code based on the interface of osionos and monaco". Asked to choose, the owner
picked **"osionos editor on disk"**: osionos's own explorer and Monaco editor open a folder from the user's
computer through the osionos Connector (osionos-node on `127.0.0.1:4100`), with no VS Code window.
Base: `develop-merge` worktree, branch `fix/web-terminal-blank` (`a02f6e62`).
Record: groot ADR 0044. It amends ADR 0041's decision "The IDE (editor, explorer) keeps its window".
Rejected concept: groot `.out-of-scope/app-driven-file-relay-to-the-users-machine.md`.

**Verdict: BLOCK as proposed. PROCEED-WITH-CONDITIONS (F1–F20) on one change: the code that reads and
writes the disk is the node-served page, not the app.**

Steps 2 and 3 of the proposal make the app's JavaScript a file principal on the user's computer. The relay
frame would run whatever ops the app posts. Today no app message can read a file, write a file or type
into a shell (`ideFrameProtocol.ts:12-17`, `terminalAppLink.ts:46-65`). Under the proposal, an app-origin
XSS or one bad develop push to the beta could silently read every picked folder and write into it. Writing
into a project folder is code execution the next time the user runs `git commit`, `npm test` or `make`.
That is a new privilege, not the terminal's trust in a new shape. Step 1 (the node's `/api/fs` with root
confinement and bounds) and step 4 (roots kept on the node) are sound. They stay, behind F1–F20.

## Steel-man

The proposal reuses everything that already works. The app already has the explorer, the tabs, the panes,
Monaco, the theme, and the echo and conflict handling. One UI code path serves pages, the sandbox and disk.
The relay frame keeps every node credential out of the app, so a stolen app session token opens nothing.
Root confinement, size bounds and a rate limit cap what a bug can touch. And a shell already exists, so
file access looks like a subset of a privilege the user granted when they paired the computer.

## Evidence

| # | Fact | Where |
|---|---|---|
| E1 | **The standing invariant (C0-F2, 2026-10-30): app-origin code reaches no file and no shell.** The app may only hand over a token, ask to show a file, or name a refusal. "Nothing here types into a terminal, runs a task … or writes a setting." Even `open` refuses every dot-segment, to keep `.git`, `.vscode` and `.env` out of reach | `src/features/ide/vscode/ideFrameProtocol.ts:12-17,63-68` |
| E2 | The terminal frame accepts only `session`, `hello` and colours from its parent. It has no `write` op from the app: the human types into the frame's own document | `src/features/ide/model/terminalAppLink.ts:46-65`; W10 |
| E3 | **The editor's truth is a page, saved to the page store first.** `save` calls `usePageStore.updateBlock` and then mirrors to the sandbox. The editor is keyed by `[pageId, blockId]` | `src/features/ide/ui/CodeFileView.tsx:45-53,86-95` |
| E4 | **LSP sends the whole text to the bridge's sandbox.** `attachLsp` is keyed by `workspaceId` and sends `didOpen` with `model.getValue()` | `CodeFileView.tsx:196-199`; `src/features/ide/model/lspMonaco.ts:238,248` |
| E5 | The conflict store is keyed by `pageId`; the sync ledger by `workspaceId` + relPath. Neither has a page-less mode. ADR-001 §7 forbids silent last-writer-wins | `src/features/ide/model/ideSyncConflicts.ts:14-17,25`; `ideSyncEngine.ts:21-38` |
| E6 | `FsOpTransport` has no `watch` op. Its ops are `read list stat mkdir delete rename write hashes`, and its result is exec output (`{exitCode, output}` with `VFSERR:` tags). Watch rides a separate event feed | `src/features/ide/vfs/sandboxFsOps.ts:18-30,54-59`; `sandboxProvider.ts:22-25,90-111` |
| E7 | The explorer reads and writes only through an injected `WorkspaceFileOps`, which already has `watch`. Its rows still import app stores (`@/store/dragSession`, `@/store/activePageFlag`) | `src/features/ide/ui/WorkspaceExplorer.tsx:24-26`; `model/workspaceFileOps.ts:19-33`; `ui/WorkspaceExplorerRow.tsx:13-16` |
| E8 | An FsProvider conformance corpus exists and runs under `node:test` | `tests/canvas/vfs-conformance.test.ts:17-18` |
| E9 | One `WebSocketServer` per acceptor, with `maxPayload` = the pty's ~384 KiB. ws's `maxPayload` is per server and applies before auth | `packages/osionos-node/pty-runtime.mjs:43`; `pty-wire.mjs:23-28` |
| E10 | The pty session secret lives in pty-service's own map. It dies when that frame's last shell closes | `pty-service.mjs:32-48` |
| E11 | Host and Origin checks already run on every request and upgrade, before any route | `ide-origin.mjs:158,171`; `scripts/ide-node-policy.mjs:90-101` |
| E12 | `~/.osionos` holds `machine.json` (the machine key, 0600) and `src/` (the node's own code, 0775). A write there is the node's identity or the node's code | `ls -la ~/.osionos`; `cli.mjs:94,160-162` |
| E13 | Measured here: `fs.inotify.max_user_watches` = 65536 and `max_user_instances` = 128. They are shared with the VS Code server's watcher. groot alone has 6,903 directories (`find -type d`) | `/proc/sys/fs/inotify/*` |
| E14 | The terminal page bans overrides at build time by module id (A3). The pattern exists to copy | `vite.terminal.config.ts:41-58` |
| E15 | `ts.net` is a public suffix, and the beta is trusted with a shell by the owner's choice (W15), remembered too (R5 overridden). Shipped Connectors trust the beta (C-3 overridden) | ADR 0041 W15; Amendment 1 A1, A9 |

## Risk

As proposed (the app drives the relay):

| Axis | Score | Why |
|---|---|---|
| Blast radius | 5 | Every picked folder on every tester's computer. The beta is trusted by shipped Connectors (E15) |
| Reversibility | 2 | Reading a `.env` or a source tree out is one-way. A planted `.git/hooks/pre-commit` survives the fix |
| Cost on failure | **5** | One gate (the app's integrity) stands between any XSS in a notes app that renders user content and RCE plus silent exfiltration. It is the same gate every develop push to the beta passes through |
| Confidence | 2 | The safety rests on "the app is never compromised". Nothing measures that |

**Worst: cost on failure (5), with one gate.** That is the BLOCK.

With the change (the node-served page is the principal):

| Axis | Score | Why |
|---|---|---|
| Blast radius | 4 | The user's real files in the picked folders. There is no page history to restore from |
| Reversibility | 3 | The code reverts in one release. A clobbered or re-encoded file does not come back |
| Cost on failure | 4 | Silent data loss: last-writer-wins over a terminal edit, a Latin-1 file saved as U+FFFD, a recursive delete through a symlink |
| Confidence | 3 | Feasible on the terminal page's stack (E14). Unmeasured: Monaco's CSP needs, the explorer extraction cost, the watch load (U-list) |

**Worst: cost on failure (4).** The new failure class is corruption of the user's files, not access.

## Rulings on the asks

- **A new privilege, or the same trust in a new shape?** It depends on who holds the channel. If node-served
  code holds it with the human, it is the same trust as the terminal. Whoever can run code in the frame
  already has a shell, and the frame's CSP lets it talk only to the node. If the app holds it, it is a new
  principal. The app is cross-origin to every node page, it renders user content and third-party
  embeds, and the beta builds it from every develop push. The proposal picks the second. "The app never
  holds a node credential" does not help: a deputy that runs any op it is told to run *is* the credential.
- **What root confinement buys when a shell exists.** It is no boundary against whoever controls the frame,
  so the ADR must not call it one. It is still worth its 30 lines:
  1. A cloned repo can ship a symlink to `~/.ssh` or `~/.osionos`, and confinement stops the editor from
     following it.
  2. It keeps the machine key and the node's code out of an editor bug's reach (E12).
  3. It is the precondition for any weaker file principal later. "A page that can only edit, not run" is
     not real: a write to `.git/hooks`, `.envrc`, `package.json` or a `Makefile` runs code on the next
     command. Root confinement does not change that.
- **Origin pinning, message validation, DNS rebinding.** Routing `/editor/` and `/api/fs` through the
  existing `onRequest`/`onUpgrade` inherits W1 and W2 (E11): F4. App↔frame validation is the W10/W11
  pattern, with a smaller vocabulary than the proposal needs (F1).
- **Exfiltration volume, binaries, huge directories, watch fan-out.** With the change, exfiltration is
  structurally closed: `connect-src 'self'`, and no content goes to the app (F1–F3). DoS and fan-out are
  bounded by F11 and F12.
- **Old nodes and the Connector .deb.** The frame is served by the node, so frame and node never skew. An
  old node answers 404 and the dock says "update". Do not raise the C-13 floor for this feature (F16).
- **Reuse the terminal page or a separate page?** A separate `/editor/` page: its own CSP, its own intake
  vocabulary, and its own banned-override list without the terminal override. **It is no security
  boundary.** Both pages share the origin `http://127.0.0.1:4100`, and same-origin sibling frames can
  script each other through `parent.frames`. The separation is for clarity and bundle size only.

## Failures nobody mentioned

1. **Reusing CodeFileView uploads the user's disk to the cloud (E3, E4).** Its save writes the page store
   first, and its LSP sends the full text to the bridge sandbox. Bind a disk file to it and every
   keystroke of a local `.env` goes to the workspace database and to the VM's language server. That
   breaks the sovereignty rule (users' own machines, never a cloud OS) without one line of new network
   code. Hence F1 and F2.
2. **"The existing echo/conflict handling" does not exist for disk (E5).** It is keyed by page and
   workspace. Reusing it either needs fake pages, which is failure 1, or saves last-writer-wins over a
   `git checkout` the user ran in the terminal next to it. Hence F13.
3. **Encoding corruption.** `TextDecoder` replaces invalid UTF-8 with U+FFFD and strips a BOM by default.
   Opening a Latin-1 or UTF-16 file and saving one character rewrites every non-ASCII byte. Hence F14.
4. **One ws server, one maxPayload (E9).** If `/api/fs` shares the pty acceptor and raises `maxPayload`
   to carry an 8 MiB file, every unauthenticated pty socket can make the node buffer 8 MiB before auth.
   Hence F6.
5. **The op list does not match the contract it claims to mirror (E6).** There is no `watch` op, and
   `hashes` is missing from the proposal. Forcing a node wire into exec-output strings (`VFSERR:` parsing)
   repeats a shell-script artefact where none is needed. Hence F7.
6. **Recursive watch exhausts a shared kernel quota (E13).** One inotify watch per directory, at 65536
   per user, shared with the VS Code server. A root holding a `node_modules` tree can take the user's
   whole quota and break watching in every other program. Hence F12.
7. **A hung mount stalls the node.** Node's fs runs on the libuv threadpool, 4 threads by default
   (training memory, unverified here). A root on a stalled sshfs or NFS mount can occupy all four, and
   the node's other threadpool work waits behind them. Hence F11's node-wide cap.
8. **Atomic save versus links.** Temp + rename replaces a symlinked file with a regular file and drops its
   mode. A write in place instead writes through a hard link to a file outside the root, and realpath
   cannot see hard links. Hence F13 (temp + rename, resolve symlinks first, keep the mode) and F8's caveat.
9. **The root picker is a browse privilege before any root exists.** Listing `$HOME` reveals every project
   name. It is acceptable only for the frame's own principal, directories only (F10).

## Conditions (each one is a test the builder shows green)

- **F1 The principal is the node page.** Disk files are listed, read and written only by code served
  from the node at `/editor/`, framed by the dock like `/terminal/`. App → frame accepts only the
  credential messages (`session`, `hello`, and resume/`forget` once R1–R14 land), colours, and
  `open {root, path}` with `path` passing `isSafeRelativePath`. Frame → app sends only
  `ready`/`state`/`need-session`/`identity` and `{title: <basename>, dirty: boolean}`. TEST:
  - a postMessage spy over pick, list, open, edit and save of a file holding a canary string never sees
    the canary, a listing, or any path but the basename;
  - a property-based run of generated parent messages (any `op`, `read`, `write`, `list`, `pick`,
    `addRoot` shape) changes nothing and posts nothing.
- **F2 Not through the page store or the bridge.** The `/editor/` bundle contains no module from
  `src/store/`, `features/page-file/`, `model/ideSyncEngine`, `model/lspMonaco`, `vfs/bridgeTransport`
  or any AI feature. It is enforced at build time by module id, as A3 does (E14), with a guard against
  passing vacuously (the explorer module must be present). TEST: the build fails when one is imported.
- **F3 Page policy.** `/editor/` has its own CSP modelled on `terminalCsp` (`static-client.mjs:47-52`):
  `connect-src 'self'`, `frame-src 'none'`, `form-action 'none'`, `base-uri 'none'`,
  `frame-ancestors <app origins>`. Only `/editor/`, `/editor/index.html` and flat `/editor/assets/*` are
  served. Its banned overrides are the terminal page's plus `terminal`. `'wasm-unsafe-eval'` is added only
  if measured necessary (U2). TEST: exact header; traversal and nested asset paths return 404; the build
  fails on a banned override.
- **F4 Host and Origin.** `/api/fs` is dispatched inside `onUpgrade` after `isNodeHost`
  (`ide-origin.mjs:171`) and through `checkNodeOrigin(headers, ideOrigin, true)`. TEST: W1's evil `Host`
  and W2's Origin list on `/editor/` and the `/api/fs` upgrade are all refused, and an op spy counts 0.
- **F5 One credential module.** Extract `credentialSession` (`pty-service.mjs:34-41`) and the
  remembered-device check into one module used by `/api/pty` and `/api/fs`: the same `verifySession`, the
  same jti guard, the same device records, `ownerId` and `isRevoked`. A session secret opens only the
  service that issued it. TEST:
  - a token spent on either route is refused by the other;
  - an fs session secret on `/api/pty` gives 4401 and a spawn count of 0, and the reverse holds too;
  - in shared-secret mode `/api/fs` returns 404.
- **F6 Its own WebSocket server.** `/api/fs` gets its own `WebSocketServer({ noServer: true })` from the
  pinned server's `ws`, so `/api/pty`'s `maxPayload` is unchanged. Its `maxPayload` is at most 1 MiB, and
  reads and writes above 512 KiB are chunked. Pre-auth follows W3/W4: 5 s, 4 KiB checked, at most 4
  pending. TEST: a frame of 1 MiB + 1 closes the socket; the pty's pre-auth bound is unchanged; the
  pre-auth caveat names the per-server buffer.
- **F7 Wire.** Exact-key JSON, like `pty-wire.mjs`:
  - ops: `list stat read write mkdir rename delete watch unwatch pick roots addRoot removeRoot`;
  - paths: `{root: <id>, rel}`, never absolute; `rel` has no empty, `.` or `..` segment and no NUL,
    at most 4096 bytes and 255 per segment;
  - errors: `FsErrorCode` names (`vfs/errors.ts`), never exec output.

  The frame-side adapter implements `FsProvider` and passes `tests/canvas/vfs-conformance.test.ts` against
  a real node over a temp root. TEST: the corpus green; a property-based run over generated messages keeps
  the node up and touches nothing outside the temp root.
- **F8 Confinement.** A root is stored as its realpath and re-checked on every socket open. Every op
  resolves the target, or for a create its parent, with realpath. The result must equal the root or start
  with `root + '/'`, else `PermissionDenied`. Writes open the final component with `O_NOFOLLOW`, after
  resolving it. TEST, on a temp-dir fixture:
  - refused: `..`; an absolute path; a symlink to a directory outside; a chain of symlinks; a symlinked
    parent directory; a root swapped for a symlink after it was added; a rename target outside the root;
    a `mkdir` through a symlink;
  - correct: deleting a symlink removes the link, not its target.

  Two `Caveat:` markers: hard links into the root are not detected, and a same-user process can race
  realpath against open. That process already has the user's rights.
- **F9 Root rules.** Refused as roots: `/`, `$HOME`, any ancestor of `$HOME`, anything that equals,
  contains or sits inside `~/.osionos` (E12), and anything that is not a directory. A root is added only
  from a click in the frame's picker, never from an app message. It needs the frame's live credential,
  with no extra step-up. Roots live in `~/.osionos/roots.json`, mode 0600, written atomically, as
  `{realpath, appOrigin (the frame's pinned event.origin), addedAt}`, at most 32. The file is deleted on
  the heartbeat's 410 before `stop()`, on unpair, on re-pair and on revoke, as R8 does. TEST: each refusal;
  mode 0600; a 410 leaves no file; a root added under production is absent under the beta.
- **F10 Picker.** `pick` lists directories only: no files, no sizes, no mtimes. It starts at `$HOME` and
  shows dot-directories only when the human turns them on. At most 2000 entries per call, with
  `truncated`. TEST: a directory of 3000 subdirectories and 10 files returns 2000 names, no file name, and
  `truncated: true`.
- **F11 Bounds.** Async fs only (no `*Sync` in the service):
  - `list` streams with `opendir`, at most 5000 entries per call, plus `truncated`;
  - the editor opens files of at most 8 MiB, and writes are at most 8 MiB;
  - at most 8 ops in flight per socket and 2 fs ops node-wide on the threadpool;
  - a 10 s timeout per op, with a `Caveat:` naming hung network mounts.

  TEST: a 100k-entry directory answers inside the bound with `truncated`; the 9th in-flight op queues; a
  fake fs op that never resolves times out, and a shell still opens meanwhile.
- **F12 Watch.** Non-recursive watches, one per directory, only for expanded directories and the
  directories of open files. At most 256 per node. `node_modules` and `.git` are never watched unless
  expanded. Events are coalesced over at least 100 ms and capped per second; overflow becomes one
  `rescan`. A watch dies with its socket. TEST: the 257th watch is refused with a notice; 10k writes in
  1 s give bounded messages plus a `rescan`; closing the socket leaves 0 watchers. The `Caveat:` cites
  E13's shared quota.
- **F13 A save never clobbers.** `write` carries the sha256 of the bytes the editor loaded. The node
  refuses with a conflict code when the disk differs. The frame shows "keep mine / take the disk", never
  silent last-writer-wins (`ideSyncConflicts.ts:17`). Saving is a temp file in the same directory, then
  fsync, then rename. The mode is kept, and a symlinked file is written at its realpath and stays a
  symlink. TEST:
  - the disk changed after load gives a conflict, with the disk bytes unchanged;
  - a kill between the temp file and the rename leaves the original intact;
  - mode 0755 is kept, and a symlinked file is still a symlink.
- **F14 Bytes round-trip.** A file opens only if it decodes with `TextDecoder('utf-8', { fatal: true,
  ignoreBOM: true })` and has no NUL in its first 8 KiB. Otherwise the editor shows "binary or not UTF-8,
  not opened" (`Caveat:` for the NUL heuristic). The BOM and the EOL are kept. TEST: a Latin-1 file is not
  opened; a UTF-8 file with a BOM and CRLF, saved after one edit, differs from the original by exactly
  that edit (a byte diff).
- **F15 Delete is honest.** The confirm says the file or folder is deleted from disk with no undo.
  Recursive delete never follows a symlink and refuses the root itself. TEST: a directory holding a
  symlink to an outside directory is deleted, and the outside directory is untouched.
- **F16 Additive only.**
  - A node without `/editor/` (404) makes the dock say "update osionos-node to open folders". There is
    never a blank frame (W14).
  - The C-13 version floor is not raised for this feature.
  - The desktop app shows no "Open a folder on this computer" until it is ruled; its terminal origin
    differs (ADR 0039).
  - TEST: an old-node fixture; the W1–W16 and R1–R14 suites stay green.
- **F17 Lifetime.** fs sockets and their watchers follow W8: they close on stop, the 410, unpair and
  `revoke`. Update in the same commit: the headers of `pty-service.mjs` and the new fs service, the
  `heartbeat.mjs` caveat, ADR 0041, and ADR 0044. TEST: `revoke(owner)` leaves 0 fs sockets and 0 watchers.
- **F18 The beta.** The owner's W15 and R5 decisions cover this page, since it grants nothing a shell does
  not. ADR 0044 records that sentence. Withdrawing W15 withdraws the editor on the beta too.
- **F19 Measured before merging to develop** (a merge ships to the beta in about 3 min). An e2e run in
  Chrome on the real node:
  - pick a folder, open a file, edit, save, and `cat` in the dock's terminal shows the edit;
  - an `echo >>` from the terminal updates the open editor;
  - an edit on both sides gives the conflict choice.

  Firefox and Safari are measured before main; an unsupported browser gets the F16 panel.
- **F20 Caveats travel.** Every bound and heuristic above (the NUL sniff, coalescing, timeouts, hard
  links, the realpath race, the inotify quota) carries a `Caveat:` line (`devil caveat --strict` green).

## Unknowns

| U | What | When |
|---|---|---|
| U1 | Chrome LNA and `Sec-Fetch-Site` for a second loopback frame (`/editor/`) and its socket. The terminal's own U1/U5 results carry over only if they were measured on the same build | Before merging to develop (F19) |
| U2 | Whether Monaco with TextMate grammars on the node page needs `'wasm-unsafe-eval'` (the IDE page's CSP has it, `static-client.mjs:37`; the terminal page's does not) | Before writing F3's header |
| U3 | The cost of moving the explorer into the node page: its rows import app stores (E7). Library-first: inject them, do not copy the explorer | Before the first commit; state the `/editor/` bundle size |
| U4 | Node's threadpool size and fs behaviour on a hung mount (failure 7 is training memory) | Before main; F11's test settles it |
| U5 | What the owner loses: run, format, LSP and AI on disk files went through the bridge sandbox (E4) and do not come with this. The dock's terminal is the run path. The owner must hear this before building, not after | Before building |

## What lifting the BLOCK on the original design would take

The owner may decide that the app itself is a file principal, as vscode.dev is for its tunnels. That is an
owner decision, recorded in ADR 0044, not something conditions can make safe. It would at least need:

- the production origin only, never the beta;
- every write under a dot-segment refused;
- read-only by default per root;
- F4–F17.

It would still leave `package.json` and `Makefile` writes as code execution for any XSS in the app.
The facts that would change this ruling are in `.out-of-scope/app-driven-file-relay-to-the-users-machine.md`.
