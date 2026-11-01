# Devil verdict: the desktop local terminal (node-pty in the Electron shell), 2026-10-31

**PROCEED-WITH-CONDITIONS.** C1 to C4 are ship gates: until all four hold, no `pty:*` handler exists. C5 to C9 are acceptance criteria.

## Steel-man

The person at the keyboard already has a shell, so a step-up code, a token or pairing protects nothing: hostile script would type into a terminal the human already opened. Without a network there is no bridge, cookie or tunnel to attack. Renderer integrity is the only boundary, which is VS Code's model.

## Evidence (shell = `groot/apps/osionos-electron`, app = `desktop-style`)

| # | Fact | Proof |
|---|---|---|
| E1 | Electron is pinned `^32.2.0` and installed as 32.3.3. npm `latest` is 45.2.1 | shell `package.json:19`; `node_modules/electron/dist/version`; `npm view electron dist-tags.latest` |
| E2 | The CSP is enforced and webSecurity is on in FULL only. LOCAL and NATIVE run Report-Only with webSecurity off | `desktop-guards.js:7,17-26`; `main.js:190,280` |
| E3 | The workspace page `tasks.json` reaches the PTY as `cd /workspace && ${command}`; a `;` runs even when the `cd` fails | `ideTasks.ts:82,86-95,115-123`; `CodeFileView.tsx:127` |
| E4 | 18 innerHTML sinks render page content; the markdown `html_block` goes in raw | e.g. `CalloutBlockReadOnly.tsx:50`, `TableParts.tsx:151`; `notion-database-sys/.../renderers/react.tsx:164-165` |
| E5 | C17 holds: Mermaid **is** imported (the brief was wrong) and locked to `strict` with `htmlLabels:false` | `osionos-ui/.../MermaidDiagram.tsx:137`, `lockedMermaid.ts:117-119` |
| E6 | C18 does not hold: no scheme check, and a URL that fails to parse returns true | `src/shared/config/appUrls.ts:30-39` |
| E7 | The preload runs in main frames only (`nodeIntegrationInSubFrames` is unset), but child windows inherit it, the machine window included | `main.js:129-136,180-191` |
| E8 | `senderAllowed` checks the sender, the top frame and the `app://osionos/` path. A same-origin frame gets past it through `parent.osionosDesktop` | `desktop-guards.js:106-120`; `ADR-005-desktop-host-providers.md:56-58` |
| E9 | `/__baas/` cannot serve script under `'self'`: octet-stream with `nosniff` | `desktop-guards.js:122-133` |
| E10 | node-pty 1.2.0-beta.15 is N-API and has an install script | code-server 4.138.0 `node_modules/node-pty/package.json` |
| E11 | The main process auto-reloads the window and hosts the BaaS relay | `main.js:203-204,243-282` |

## Failures nobody mentioned

1. **A collaborator's `tasks.json` runs in your `$HOME`** when you press Build (E3). This is the workspace-trust hole.
2. **The old Chromium leaves the shell one bug away.** Electron 32 is 13 majors behind (E1; Electron supports the latest three majors per electronjs.org timelines, unverified here). Under `img-src https:`, the app's renderer process decodes any image a collaborator links. A compromised renderer sends IPC as its own top frame, which `senderAllowed` cannot detect. Today that gets it `win:minimize`; after this plan it gets a shell, with no sandbox escape.
3. **In LOCAL and NATIVE, `<img onerror>` in any unescaped sink executes** (E2, E4).
4. **`yes` floods the main event loop**, which stalls the relay and the window controls (E11; not measured).
5. **Reloads (automatic, F5, Ctrl+Shift+R) leave shells running**, because the window stays open.

## Risk

| Axis | Score | Why |
|---|---|---|
| Blast radius | 5 | Code execution as the user on every member's machine, from one stored payload |
| Reversibility | 4 | The code reverts in one release; stolen `~/.ssh` keys and a `.bashrc` implant do not |
| Cost on failure | **5** | Code execution and credential theft |
| Confidence | 3 | Sink escaping, who can edit `tasks.json`, and flood behaviour are not measured |

Worst: cost on failure, tied with blast radius.

## What makes "page script reaches a shell" acceptable (VS Code's bar)

1. Only bundled code runs on `app://osionos` (an enforced CSP; E9 already holds).
2. Untrusted active content runs on another origin (E7 holds for frames).
3. No command taken from page content reaches the shell without a trust decision.
4. Chromium is current.

What is left after that is a compromised bundled dependency, the same risk VS Code accepts.

## Conditions

| C | Requirement | Test |
|---|---|---|
| C1 | Electron on a supported major, pinned exactly, with the lockfile committed | The smoke asserts the `process.versions.electron` major ≥ latest−2; the C15 smoke is green |
| C2 | `pty:*` and the preload `pty` exist only in `HARDENED_EDITIONS` | `node --test`: `ptyEnabledFor("local"/"native")` is false, `("full")` is true. FULL smoke: a block with `<img src=x onerror="window.__p=1">` leaves `__p` undefined |
| C3 | The local transport carries xterm `onData` and resize only. The run bus, tasks and debugger stay unwired until a separate ruling with a trust prompt in the main process | vitest: `runDefaultTask()` with `{"command":"true; touch $S"}` makes 0 `pty.write` calls; smoke: `$S` is absent |
| C4 | Launch and embed URLs are `http:` or `https:` only | Unit: `javascript:`, `data:` and an unparsable URL each return `""` |
| C5 | Every handler runs `senderAllowed` first, and a PTY id is bound to the webContents that created it. The preload exposes `pty` only when `location.origin === "app://osionos"`, or the desktop machine-window allowance is removed. The renderer cannot choose shell, argv, cwd or env. A write is a string of at most 64 KiB; resize values are integers from 1 to 1000 | Spy: a rejected sender means spawn is never called. Smoke: `pty.create` from the machine window yields 0 shells; malformed input is rejected |
| C6 | The PTY host is a `utilityProcess`. Shells are killed on `destroyed`, on main-frame `did-start-navigation` and on `render-process-gone`. At most 8 per window | Smoke: open 2, reload, and `pgrep -P <host>` reaches 0 within 2 s. A 9th create is refused. A SIGKILL of the host leaves the window alive |
| C7 | The PTY pauses above a high watermark of unacknowledged bytes and resumes below a low one | Smoke: during `timeout 10 yes`, `/__baas/` and `win:*` answer in under 1 s; the artifact is recorded |
| C8 | The shell's environment drops `ELECTRON_*`, `NODE_OPTIONS` and the AppImage's `APPDIR`/`LD_LIBRARY_PATH` | Smoke: `env \| grep -c '^ELECTRON_'` prints 0 |
| C9 | node-pty is pinned exactly and built for the shipped Electron. The `.node` is in `asarUnpack` and in both `files` lists (`package.json:27`, `electron-builder.native.json:6`), with its sha256 recorded and its install script accounted for | `npm ls node-pty` shows the exact pin; the built `.deb` opens a shell |

C3 replaces two of ADR-005 S4U5's gates, "S4U3 first" and the trust prompt, because it removes the path from page content to the shell. C1, C2, C4 and C9 carry over C19, C14, C18 and the supply-chain accounting.

Record owed: groot `docs/adr/0038-*`. It was not written; this run was read-only.

**PROCEED-WITH-CONDITIONS.** The design is sound, but this renderer shows collaborators' content on an unsupported Chromium, so the shell stays unregistered until C1 to C4 hold.

## Amendment 1 (2026-10-31): VS Code's terminal in a framed `app://osionos/terminal/` page

**PROCEED-WITH-CONDITIONS** on the framed page. (a) is the fallback; (b) and (c) are rejected.

**The claim this refutes.** "Whoever can create an iframe already runs script" is false, because HTML injection without script is enough.
- Under the enforced CSP, any E4 sink can insert `<iframe src="app://osionos/terminal/index.html" style="position:fixed;inset:0;opacity:0">`. Inline style is allowed (`desktop-guards.js:183`).
- The page then creates a shell and focuses it without being asked (`src/terminal-client/main.ts:71,77`). The user's next keystrokes run as commands.
- C4 guards the code that builds URLs, not raw HTML.
- `isAllowedSubframeUrl` ignores the parent frame, so a third-party embed can nest this page. Only `window.parent` (`main.ts:22`) makes that fail, and by accident.
- The page also reuses `editorModeServices`, which loads the task and debug services (`src/ide-client/services.ts:81,86`), and it hard-codes `trusted: true` (`main.ts:68`). That breaks C3 inside the page itself.

| A | Condition | Test |
|---|---|---|
| A1 | The page never reads `parent.osionosDesktop`. The panel hands the pty API to the iframe element it rendered itself; without that handoff the page draws nothing and takes no focus | Electron smoke: an iframe inserted through a block's innerHTML causes 0 `pty:create` calls in main, and `document.activeElement` is unchanged |
| A2 | `/terminal/` responses carry `frame-ancestors 'self'`, and the page also checks `window.parent === window.top` | Smoke: the page nested in an https embed causes 0 `pty:create` calls |
| A3 | A dedicated `terminalModeServices`: no task, debug, extension, gallery, remote-agent, scm or search overrides. `trusted: false`, unless a measurement shows it breaks the terminal, in which case the reason is recorded | Unit test on the service keys; `grep -c task-service-override` over the built terminal chunks prints 0 |
| A4 | `isAllowedSubframeUrl` matches exactly: host `osionos`, path `/terminal/index.html`, no userinfo, no hash | Unit: `/terminal/`, `/terminal/../index.html`, `/terminal/%2e%2e/index.html`, `/terminal\index.html` and `app://x/terminal/index.html` return false; `?theme=light` returns true |
| A5 | `test/desktop-guards.test.js:171` becomes "the only `app:` source in frame-src is `app://osionos/terminal/`", with the pinned output updated in the same commit, citing ADR 0038 | `node --test` |
| A6 | Zero CSP violations on the page in FULL (no `unsafe-eval`). Time-to-prompt is measured | The smoke counts 0 `securitypolicyviolation` events; the timing artifact is recorded |

**Fallback.** If A1 cannot go green, take (a) and expose `pty` only to the view's own preload. The main document then has no path to the shell at all.

(b) is rejected because it puts VS Code's platform into the document that renders collaborators' content. (c) is rejected because it fails the owner's requirement.

**PROCEED-WITH-CONDITIONS.** A framed page of our own code is acceptable once framing it grants nothing.

## Amendment 2 (2026-11-01): the terminal page on its own origin, a direct port per pty, VS Code's panel

**PROCEED-WITH-CONDITIONS.** The plan is `plan-2026-11-01-terminal-own-process.md`. T1 to T11 are the acceptance criteria for the release that carries the direct port. T1, T2, T4 and T7 are the security gates.

### Steel-man

- The measurements put the delay in the renderer thread the terminal shares with the app. Frame → panel is p50 10.4–12.2 ms and p95 17.7–20.8 ms, and echo → frame is p50 14.6 ms. Main, the host and the shell together take 1.5–1.9 ms. In the spike, an own process with a direct port cuts the busy p95 from 11.0 ms to 0.9 ms.
- A pty port grants less than the app world holds today. Today the app world has `create`, `write`, `resize`, `ack` and `onData` (`preload.js:28-36`); a port carries one shell's I/O. Once transferred to the frame, the port is gone from the app world. Main leaves the output path, so failure 4 (a flood stalling main) is gone for output.
- The frame gets no preload, and A1's handoff keeps its shape.

**Not claimed:** the out-of-process frame fixes latency. It is not a security boundary. The app world keeps `pty.create`, so a script on `app://osionos` still reaches a shell, as ADR 0038's Consequences say.

### Evidence

| # | Fact | Proof |
|---|---|---|
| F1 | The host's one handler dispatches `create` and trusts `message.id`. Port traffic routed into it would let the port's holder spawn shells that main never counted or owns, and write to other ptys | `desktop-pty.js:73-81` |
| F2 | The `app:` handler ignores the host. `/__baas/` is relayed before any host check, a missing file falls back to the app's `index.html`, and containment is a bare string prefix | `main.js:274-307` (`281`, `306-307`) |
| F3 | The smoke runs with the Chromium sandbox **off**. Its Electron comes from `npm install` into `/cache`, so `chrome-sandbox` is not setuid root and main appends `no-sandbox`. Pid 138 vs 73 shows a separate process, not a sandboxed one | `pty-entry.sh:9-12`; `main.js:56-64` |
| F4 | VS Code's terminal answers OSC 52 clipboard **reads**. The built page loads `ClipboardAddon` with `readText → clipboardService.readText`, and on `?` the addon writes the clipboard back as terminal input. No setting gates it (the bundle has only the paste settings). The shell sets no permission handler | `build/terminal/assets/index-L1UhhtTY.js` (search `importAddon("clipboard")`); `addon-clipboard-C-fMRGk9.js` (`_setOrReportClipboard`); `grep setPermissionRequestHandler *.js` → none |
| F5 | main handles F5, Ctrl+R, Ctrl+Shift+H and Ctrl+=/+/-/_/0 for every key that reaches the webContents, the framed terminal included. A reload kills every shell. Ctrl+R is bash's reverse search and Ctrl+_ is readline's undo. Electron 44.8.0 has `webContents.focusedFrame` | `main.js:241-252`, `222`; `~/.cache/osionos-desktop-machines/node_modules/electron/electron.d.ts:18941` |
| F6 | The views override also pulls in `quickaccess` (VS Code's command palette) and `keybindings`. `view-common` registers the webview and auxiliary-window services and imports `bulk-edit`. Its only references to debug, remote and scm are `VIEWLET_ID` constants from the api package, not the services A3 bans. All three packages are MIT, 37.6.1, with no `scripts` field (checked from the npm-cache tarballs) | views `package.json:18-22`; view-common `common.js:105,109`, `viewsExtensionPoint.js:20-23` |
| F7 | The panel reads `frame.contentWindow.location.pathname`, which throws on a cross-origin frame. Its replacement must be the targetOrigin, not a dropped check | `LocalVsCodeTerminal.tsx:32,37` |
| F8 | `contextBridge` cannot carry a MessagePort (Electron docs; training memory, not checked in 44.8.0). The spike reposted the port with `window.postMessage` and the page accepted it on `e.source === window`. Embeds can post to that same `message` event, and only the source check tells them apart | `spike-port/app/preload.js:2`, `www/main/main.js:21` |
| F9 | A6 counts console lines. Whether Playwright reports an out-of-process frame's console on `page` is not shown, so after the move the count can pass vacuously | `terminal-page-smoke.mjs:6-7,40-45` |
| F10 | `frame-ancestors` does not stop an embed that navigates itself to the page, and `isAllowedSubframeUrl` admits the URL at any depth. What holds there is A1 (no handoff) | groot `.out-of-scope/frame-ancestors-self.md`; `main.js:151` |
| F11 | The pty smoke drives `write`, `resize`, `ack` and `onData` through the preload. "pty smoke stays 12/12" and dropping the IPC write path cannot both be true without porting it | `test/smoke/pty-smoke.mjs:39,43,72,114` |

### Failures nobody mentioned

1. **A spoofed port keylogs the terminal.** Any collaborator's https embed can call `parent.postMessage({…pty port shape…}, "*", [itsPort])`. If the panel forwards that port without checking `event.source === window` and matching the id, every keystroke goes to the embed, sudo passwords included, and the embed paints the output.
2. **The host as a confused deputy (F1).** It could spawn shells past the cap of 8 that main does not know about, so main's kill on reload, crash or close misses them. A forged `id` could write into another shell.
3. **The new origin inherits the old handler's looseness (F2).** `app://terminal/__baas/*` would relay, an unknown path would serve the whole app on the terminal origin, and `..%2f` reaches any sibling directory whose name starts with `terminal`.
4. **Slot leak.** If exit travels only on the port, main never frees the slot. After 8 `exit`s no terminal opens until the app reloads.
5. **A write or resize after exit, sent straight from the frame, can throw in the host** (node-pty 1.1.0, not measured). The host would die and take every shell in the window with it.
6. **OSC 52 read sends the clipboard to whatever is at the other end of the pty (F4).** That includes a remote host over `ssh`. Paste needs `allow="clipboard-read"` on the now cross-origin frame, which turns the read on there. This breaks "data stays on the machine".
7. **Ctrl+R in the terminal reloads the app and kills every running shell (F5).** VS Code's keybindings, which the plan claims, never do that.
8. **"Chromium's sandbox stays on" is unproven for the terminal's process (F3).**
9. **A port that cannot be routed lives until GC.** Its shell lives until the window reloads. The cap bounds this at 8 shells per window, none with a reader.

### Risk

| Axis | Score | Why |
|---|---|---|
| Blast radius | 5 | A routing flaw (1, 2) gives every member's embed keystrokes or a shell |
| Reversibility | 4 | The code reverts in one release; a typed password or a clipboard sent over ssh does not |
| Cost on failure | **5** | Credential theft |
| Confidence | 3 | The spike measured transport. Port `close`, the sandbox, the OOPIF console and OSC 52 are not measured |

Worst: cost on failure, tied with blast radius. Each is held by a testable guard below.

### Rulings on the six questions

| Q | Ruling | Held by |
|---|---|---|
| 1. Who can hold a port, what it grants | The holder gets one shell's I/O, never create, never another pty, never past the pty's exit. Holding it briefly widens nothing over today (F8 and `preload.js:28-36`), provided the intake checks its source | T1, T2, T3 |
| 2. C5 for port traffic in the host | Accepted, as a **separate** handler bound to the port. C5's "id bound to the webContents" becomes "pty bound to the port" for port traffic | T2 |
| 3. The `app://terminal` origin | Accepted with a host-dispatching handler, a policy narrower than the renderer's, and A2, A4 and A5 re-pinned | T4 |
| 4. Cleanup | Sound in design. The frame-crash case rests on port `close` alone, and that is not measured | T5 |
| 5. Supply chain | Accepted (rung 6). It also adds the command palette (F6) | T10 |
| 6. A3 with the views override | Holds (F6). The proof must not be a vacuous grep | T8 |

### Conditions

| T | Requirement | Test |
|---|---|---|
| T1 | **Port intake.** The preload reposts each pty port to its own window, targetOrigin `app://osionos`, with the pty id. The panel takes a port only when `event.source === window` and `event.origin === "app://osionos"`, for an id its own `create` returned and not yet routed, in either arrival order. It forwards the port only inside the `created` reply on the control port its frame accepted, never through `window.postMessage`. Every other port is closed at once: an unknown id, a duplicate, one after stop or unmount. The handoff posts with targetOrigin exactly `app://terminal`, replacing `LocalVsCodeTerminal.tsx:32` | osionos node:test on the routing function: a port posted from another window object with a valid-looking id is closed, not forwarded. Wrong id, duplicate, port-before-reply, reply-before-port and after-stop each close or route correctly |
| T2 | **The host's port handler.** Port traffic has its own handler, bound to one pty in a closure, never `sessions.handle`. Accepted: `write` (a string of at most 65536 chars), `resize` (integers 1–1000), `ack` (a positive safe integer). Any `id`, `create`, `kill` or other op is ignored, and ports transferred on it are closed. Each message runs in try/catch; a write or resize after exit or kill is dropped. The host closes the port when the pty exits or is killed, kills the pty on port `close`, and still reports every exit to main | node:test on the pure session: a table of malformed input (non-object, array, no op, a non-string or 65537 chars, cols 0/1001/1.5/NaN/"80", ack 0/-1/1.5/2^53, `{op:"create"}`, `{op:"write",id:other}`) makes 0 pty calls. 65536 chars passes. Port close → exactly 1 kill; exit → exactly 1 port close and 1 report. Smoke: after `exit`, 100 writes and a resize on that port, a second shell still echoes |
| T3 | **One path, slots freed.** `pty:write`, `pty:resize`, `pty:ack` and `pty:data` are gone from main, the broker and the preload; the preload's `pty` is create, kill, onExit and the port intake. The app's `PTY_METHODS` (`localPty.ts:48`) changes in the same release, so a skewed build shows no local terminal. main frees the slot on every exit | Smoke: `ipcMain.listenerCount` for each removed channel is 0. Create 8, `exit` in all 8, then a 9th create succeeds (a 9th concurrent one is still refused). The pty smoke's 12 checks are ported to the port path, each keeping its assertion (F11), C7's flood and BaaS-relay checks included |
| T4 | **The origin.** The handler dispatches on the host first. `osionos` keeps today's behaviour, except `/terminal/*` returns 404. `terminal` serves files under its own root only, with containment by `path.relative` or `root + path.sep`. It has no `/__baas/` and no index fallback (404), and every response, 404 included, carries a terminal policy: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`, `img-src 'self' data: blob:`, `frame-src 'none'`, no `https:`, `wss:` or loopback source, and `frame-ancestors app://osionos`. Any other host gets 404. `isAllowedSubframeUrl` admits exactly `app://terminal/index.html` plus the query. The app's `frame-src` has `app://terminal/` as its only `app:` source (A4 and A5 re-pinned, citing ADR 0039). The panel's iframe has no `name`, and its `allow` is exactly `clipboard-read; clipboard-write` | node:test on a pure resolver `(host, path) → file or 404, policy`. Each of these is a 404 carrying the terminal policy where the host is `terminal`: `app://terminal/__baas/rest/v1/x`, `/missing.js`, `/..%2findex.html`, `/..%2fterminal-x/a`, `/%E0%A4%A`, `app://x/index.html`, `app://osionos/terminal/index.html`. The A4 table with the new host, where `app://osionos/terminal/index.html` → false. Smoke: (a) a frame on an origin `frame-src` admits navigates itself to `app://terminal/index.html` → 0 creates and `activeElement` unchanged (F10); (b) the page nested in it is refused (A2); (c) the A6 negative control: one deliberate violation inside `app://terminal` is counted, then the real run counts 0 |
| T5 | **The cleanup matrix.** Each of these leaves `shells()` at 0 within 2 s: the frame reloads itself, the panel unmounts, the frame's renderer pid is SIGKILLed, the main window reloads, `forcefullyCrashRenderer`, close. A SIGKILLed host leaves the window alive, the frame showing the exit, and the next terminal starting | Smoke, one check per row. The frame-SIGKILL row is the one only port `close` covers (U1). If it fails, the bound (at most 8 shells, no reader, gone on window reload or close) goes in a `Caveat:` in `pty-host.js` with a linked issue |
| T6 | **The sandbox on the installed .deb.** The terminal frame's renderer pid differs from the app's, and it shows the same sandbox markers as the app's renderer: `Seccomp: 2` and a nested PID namespace in `NSpid` | One recorded artifact from `/proc/<pid>/status` on the owner's install. The xvfb smoke cannot prove this (F3) |
| T7 | **OSC 52 read is refused** (`.out-of-scope/desktop-terminal-osc52-clipboard-read.md`). OSC 52 write, Ctrl+Shift+C and Ctrl+Shift+V keep working | Smoke: with a clipboard canary set from main, `printf '\033]52;c;?\007'; timeout 1 cat -v` prints no `]52;c;`. The plan's copy/paste checks stay green |
| T8 | **A3 with the views override.** The service map has no key registered by the task, debug, extensions, extension-gallery, remote-agent, scm or search overrides. The build's module list contains none of those seven packages. `trusted: false` stays. The handoff carries hex colours only (`terminalPort.ts:27-35`). `pty:create` keeps taking (cols, rows) only, so "new with profile" opens the account's shell whatever profile is picked | Unit test on the keys. A module-list check (rollup output or a manifest, not minified text) with one recorded negative control, where adding `task-service-override` makes it fail. A host spawn spy shows the same shell, args and cwd for every create |
| T9 | **Keys reach the shell.** When `webContents.focusedFrame` is the terminal frame, main does not act on F5, Ctrl+R, Ctrl+Shift+H or Ctrl+=/+/-/_/0. The global Ctrl+Shift+R recovery stays | Smoke: with the terminal focused, Ctrl+R shows `(reverse-i-search)`, with 0 main-frame navigations and an unchanged shell count. Outside the terminal, Ctrl+R still reloads |
| T10 | **Supply chain (rung 6, stated in the commit).** views, view-common and layout are pinned exactly at 37.6.1 in `package.json` and `pnpm-lock.yaml`, with integrity. Their dependencies quickaccess and bulk-edit are already at 37.6.1. One `@codingame/monaco-vscode-api`. Only `src/terminal-client` imports them | `pnpm why @codingame/monaco-vscode-api` → one version. The app entry's JS and CSS gzip sizes are unchanged before and after |
| T11 | **Budgets.** The plan's: transport p95 < 2 ms with the app idle and busy, keydown → echo p95 < 5 ms, a distinct pid. Added: echo → the frame's next animation frame p95 < 20 ms with the app busy. Time from frame insertion to first shell output ≤ 1.6 s on xvfb (today 0.83–1.05 s), or the reason recorded. The terminal renderer's RSS recorded | Smoke artifacts. Key-to-pixel on the owner's GPU is reported **SKIP** until it is measured on the installed .deb |

### Unknowns to measure before shipping

| U | Unknown | Where it is settled |
|---|---|---|
| U1 | Whether `MessagePortMain` emits `close` in the utility process on a frame reload and on a SIGKILL of the frame's renderer. The spike's probe (`drive.mjs:20-25`) has no recorded output | T5 |
| U2 | Whether the terminal's renderer is sandboxed on the .deb | T6 |
| U3 | Whether Playwright surfaces an out-of-process frame's console messages | T4 (c) |
| U4 | Whether Chromium matches `frame-ancestors app://osionos` for a custom scheme. If not, it fails closed: the page never loads | T4 and the A1 smoke |
| U5 | Whether the views override runs clean under the narrower policy | A6 / T4 (c) |
| U6 | node-pty 1.1.0's behaviour on a write or resize after exit | T2 |
| U7 | Whether an http(s) frame can navigate itself to `app://terminal` at all (either answer is recorded) | T4 (a) |
| U8 | Key-to-pixel on a real GPU | T11: SKIP |
| U9 | Whether `unresponsive` fires for a hung terminal frame, which would reload the app and kill every shell (`main.js:235`). Observe it; it is not a ship gate | Note in the smoke |

Records: groot `docs/adr/0039-the-desktop-terminal-runs-on-its-own-origin-with-a-direct-port-to-the-pty-host.md` and `.out-of-scope/desktop-terminal-osc52-clipboard-read.md`.

**PROCEED-WITH-CONDITIONS.** The direct port grants the app world nothing it lacks today and takes it off the keystroke path. The new risk is in the glue (the port intake, the host's untrusted input, the new origin's handler), and each piece has a test that proves it.
