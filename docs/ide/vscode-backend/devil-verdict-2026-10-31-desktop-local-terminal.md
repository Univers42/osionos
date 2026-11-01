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
