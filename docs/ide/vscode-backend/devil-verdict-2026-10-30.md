# Devil verdict: VS Code's backend, osionos as the host (ADR-006), 2026-10-30

Decision under ruling: groot `docs/ide/ADR-006-vscode-backend-osionos-host.md` (PROPOSED).
Evidence: `spike-2026-10-30.md` and `REPLACED-BY.md` (this folder), spike code
`~/.cache/osionos-wt/vscode-spike`, server artifact `~/.cache/osionos-wt/spike-dl/code-server-4.138.0`.
Prior rulings touched: ADR-004 decision 8, ADR-005 (S4U3, S4U5), `byo-agent/contract.md` D3, D4, §7.2,
§7.4, `byo-agent/devil-verdict-2026-10-19.md`, groot ADR 0022.
Record: groot `docs/adr/0034-the-ide-runs-on-vs-codes-server-behind-a-non-public-node-proxy.md`.

**Verdict: PROCEED-WITH-CONDITIONS.** Adopting the VS Code server in editor mode is sound. The spike
measured function, not security. Phase 1 must prove the security half (C1–C13) before
`/api/node` serves any machine. Stage 1 (any person other than the owner) stays BLOCKED.

## Steel-man

- The hand-built IDE is a set of copies of VS Code features with a fraction of the coverage:
  - an LSP relay with 4 features;
  - a debugger that speaks only Python;
  - git without branches;
  - a sandbox that ADR 0022 caps at about 3 boxes.
- The spike replaced each piece with VS Code's own and passed 7/7 checks on two machines (`spike-2026-10-30.md`):
  - a real shell;
  - a branch switch;
  - a debugpy breakpoint;
  - basedpyright completions;
  - a machine switch in ≤ 1.32 s;
  - 4.06 MB of gzip in total.
- The server is MIT and the client library is the one ADR-004 already named as the upgrade route.
- osionos keeps the UI, so options A and B stay rejected.
- The owner's request (laptop, VM and later Windows/macOS, with a full toolchain) is what VS Code Remote does, and nothing smaller does it.
- Rebuilding this by hand is the expensive and fragile option.

## Facts measured for this ruling

| # | Fact | Where |
|---|---|---|
| F1 | Server commit `59c988c744a2…`, version 1.138.0, `serverDataFolderName` `.vscode-server-oss`, `enableTelemetry: true` | `code-server-4.138.0/lib/vscode/product.json:15,209,223` |
| F2 | The bare server serves the workbench at `/` and answers it with `Set-Cookie: vscode-tkn=<connection token>; SameSite=Lax; Max-Age=604800`. A `tkn` query on that path also sets the cookie and sends a 302. It honours a client-supplied `x-forwarded-prefix`. It serves `/version` and `/delay-shutdown` **before** the token check. | `lib/vscode/out/server-main.js` (minified; `grep -o '.\{200\}Set-Cookie.\{200\}'`) |
| F3 | `/vscode-remote-resource?path=<any path>` serves any file the user can read, after the token check | same file, `"/vscode-remote-resource"` branch |
| F4 | Upstream release asset sha256 `5d63f26c5dabc2acd29610b9b27f413b016aa67019e2cfcdf54031625e18f535`. Slim artifact sha256 `6e576746bdc708ecff467fbc154ef6c45e81f0946e36025a748e6f78a6d78df4`. Neither is recorded in any repo. | `sha256sum` in `spike-dl/` |
| F5 | The slim artifact differs from upstream in exactly `copilot` and `mermaid-markdown-features` | `tar tzf … \| grep -o 'extensions/[^/]*/'` vs `ls lib/vscode/extensions` |
| F6 | The spike put the connection token in the page URL | `vscode-spike/src/main.ts:65` (`params.get('token')`) |
| F7 | The spike hard-codes workspace trust | `vscode-spike/src/main.ts:67` (`trusted: true`) |
| F8 | One dependency is a caret range, not a pin | `vscode-spike/package.json:47` (`"^37.6.1"`) |
| F9 | The spike proxy routes any URL containing `reconnectionToken=` to the server. It echoes upstream errors and forwards every client header, `Cookie` included. | `vscode-spike/proxy.mjs:10,14,18` |
| F10 | The shared IDE edge lets a request with **no** `Origin` through | `scripts/ide-http-edge.mjs:27` |
| F11 | The app frames third-party embeds with `allow-same-origin` | `src/widgets/embed-app/ui/EmbedFrame.tsx:39`, `src/shared/lib/embed/embedPolicy.ts:35` |
| F12 | ADR-005 blocked the local PTY because page-level script reaches host APIs (Mermaid `loose`, same-origin embed frames). C17 and C18 were done only on an unmerged branch. | `ADR-005-desktop-host-providers.md:56-60,126-128,162` |
| F13 | The desktop edition's page origin is `app://osionos`. Its only proxy (`/__baas/`) buffers bodies through `protocol.handle`, which carries no WebSocket upgrade. | `apps/osionos-electron/main.js:190,235-262` |
| F14 | The ledger deletes `bridge-ide-ops.mjs` in Phase 2, but `ide-preview.mjs:19` (Phase 4) imports `tunnelUpstream` from it. `ide-server.mjs:22` takes `parseExactOrigin` from `ide-preview.mjs`. The kept mint `bridge-ide-token.mjs:18,20` imports from `ide-sandbox-spec.mjs` (its git allowlist is deleted in Phase 2) and from `bridge-ide-sandbox.mjs`. | `rg` import map, worktree `feat/vscode-backend` |
| F15 | The BYO consent text promises "It does NOT allow … a shell on this host". §7.4's closed action set allows only a container. | `byo-agent/contract.md:553-554,569-578` |
| F16 | A sudo/aal2 gate already exists and guards account tokens and export | `scripts/bridge-account-sudo.mjs:200` |

## The failures nobody mentioned

1. **A file on any connected machine can run script on the app origin.**
   - Decision 6 puts the server on the app's origin. F3 makes `vscode-remote-resource` return a repo's `x.html` or `x.svg` with its real content type, on that origin.
   - One navigation to that URL runs the file's script with the app's privileges. It can read the session and open a terminal on every machine.
   - The attacker needs one hostile file in a cloned repository plus a click. No ruling covers it.
2. **Every same-origin XSS becomes a host shell.**
   - ADR-005 blocked S4U5 because page script reached host APIs (F12).
   - ADR-006 "moots" S4U5 but sends the same reach through HTTP. The preconditions (C17, C18, CSP, embed framing F11) were never met on main.
   - Mooting the implementation does not moot the threat.
3. **The browser cannot present `osionos_ide1` on the requests VS Code makes.**
   - Resource GETs come from `<img>`, `<link>`, workers and library `fetch`, which cannot add a header.
   - VS Code's own sockets do not carry the `osio-token.` subprotocol (`ide-ws-auth.mjs`).
   - The ADR names the token but not the carrier. A cookie is the only workable carrier. A cookie route that inherits F10 (no `Origin` passes) accepts cross-site no-cors GETs.
4. **The server leaks its own token to the browser on the root path.**
   - F2: a proxy that forwards `/`, or a `tkn` query, hands the browser a 7-day `SameSite=Lax` cookie holding the server's connection token.
   - `/version` and `/delay-shutdown` answer without any token.
5. **The 15-minute credential and VS Code's 3-hour reconnect grace are unreconciled.**
   - If the socket closes at `exp` (the existing `armTokenExpiry`), the session must re-authenticate every 15 minutes.
   - If it does not close, a revoked owner keeps a full-rights shell for hours.
6. **The ledger breaks the build in Phase 2 (F14).** The preview, the origin parser and the kept mint import from Phase-2 rows.
7. **`tunnel+` turns the BYO contract's guarantees into false statements (F15).**
   - The relay is the authorization authority (D3 minimal, §7.4 "trusts the relay's claim").
   - Under `tunnel+` it opens a full-rights server instead of a container.
   - A stolen owner session (`osionos_v1`, up to 3600 s of minting) used to reach a container (D4). It now reaches the laptop, its ssh keys, and through them the VM that holds `/opt/grobase/.env`.
8. **The desktop edition cannot satisfy decision 6 as written (F13).** It has no same-origin path for the WebSocket. The spike ran only in a browser on `http://127.0.0.1:5200`.
9. **Two tabs, two sources.**
   - With one machine per page, two tabs can feed the `.omd` inbound pipeline from two `IFileService` watchers.
   - ADR-004 decision 6 echo suppression was built for one fs agent. A concurrent edit is either a duplicate page change or a lost write.

## Rulings on the five questions

1. **Dependency (code-server v4.138.0 bare server, commit override at equal version): accept, under C1–C3.**
   - MIT, with an exit already named: our own Code-OSS REH build, which decision 3 uses for Windows.
   - The lockstep is the real cost. A VS Code security fix lands only when both `@codingame` and code-server ship the same version.
   - The skew is therefore made a build failure, and the bump becomes one reviewed commit.
   - The claim "the server refuses a different commit" (`:351`) was not tested in the spike. C2 tests it.
2. **Slim artifact: accept, under C3.**
   - The removal is exactly two built-ins (F5).
   - Today the artifact is a hand-made tgz whose hash is recorded nowhere (F4). It becomes a scripted, hash-verified build, checked on the target machine.
3. **Security model: accept, with C4–C11, C18–C21. The connection token never reaches the browser.**
   - The bridge injects it on the loopback hop.
   - The browser holds only a short node capability in an `HttpOnly` cookie.
   - The proxy is the security boundary, and its refusal list is C7.
   - `ssh+` uses the user's config, but argv is fixed and the alias validated (C18).
4. **Deletion ledger: accept the order, amended by C14–C16.**
   - "Delete after replacement green" holds, but only once kept symbols are extracted (F14).
   - The relay seam, the BYO container path, the preview's opaque origin and the security tests stay.
5. **Worker extension host off, one machine per page: both accepted.**
   - Off is the only measured-safe state, and C13 makes a regression bounded, not a hang.
   - Turning it on needs an iframe domain that is neither the app nor the IDE origin, under its own ruling.
   - One machine per page costs per-tab memory, which C12 measures, and two inbound sources, which C17 covers.

## Risk scores

| Axis | Score | Why |
|---|---|---|
| Blast radius | **5** | A breach of the proxy or credential gives code execution with the owner's rights on every connected machine. The VM holds grobase prod keys. |
| Reversibility | 3 | The code sits behind a flag and the deletions revert in git. A host compromise, or a published agent that grants host shells, is a one-way door. |
| Cost on failure | **5** | Exfiltrated ssh keys and prod secrets; silent persistence in shell rc files and `.git/hooks`. |
| Confidence | 4 | Function is measured (7/7, two machines). The security half is unmeasured: the credential carrier, `/api/node/<id>/` prefix rooting (the spike routed at `/`), the reconnect-versus-expiry behaviour, the desktop origin, and the commit-refusal claim. |

**Worst axes: blast radius and cost on failure (5).** These are tolerable only because milestone 1 has one user who is also the operator. The conditions exist to keep the confidence axis from multiplying them.

## Conditions (acceptance criteria for the builder)

Every TEST below is RED first and runs in the project framework: `node:test` for the bridge and
scripts, Playwright for the browser. Each is green in CI before the phase is called done.

### Before Phase 1 code: ADR-006 amendments (documentation, same commit as the ADR status change)

- **C0. Amend ADR-006.**
  - (a) Decision 6 reads "on the non-public IDE origin", not "the app's origin".
  - (b) A topology table, for each machine kind:
    - which process runs the server, which runs `ssh` and which runs the relay link;
    - which hop carries which credential.
  - (c) The desktop edition is listed as not covered until C23 holds.
  - (d) New falsifiers:
    - "the client cannot be rooted under `/api/node/<id>/`";
    - "a commit-mismatched client hangs instead of being refused".
  - (e) Amendment lines in ADR 0022 and `byo-agent/contract.md` D4 and §7.4 point to this verdict.
  - **TEST:** `bash tools/selfcheck.sh` is green, and `rg -n 'app.s origin' ADR-006` returns 0 hits.

### Phase 1: client, proxy, local machine

- **C1. Exact pins.**
  - Every `@codingame/*`, `vscode` and `monaco-editor` dependency is an exact version (F8).
  - CI installs with `npm ci` only.
  - **TEST:** the `jq` filter over `package.json` deps that match `codingame|^vscode$|^monaco-editor$` finds 0 values containing `^` or `~`.
- **C2. The version skew is a build failure, and a mismatch is refused rather than hung.**
  - A check compares the library's VS Code version with the server's `product.json` `version`, and `productConfiguration.commit` with its `commit`.
  - **TEST:** the build fails when the commit is changed by one hex digit.
  - **TEST:** at runtime, a client presenting a wrong commit receives a surfaced error within 10 s, with no pending promise left.
- **C3. Artifact provenance.**
  - The upstream sha256 (F4) is checked against the GitHub release asset digest before first use.
  - A committed script builds the slim tgz deterministically (`tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner`, `gzip -n`) and records its sha256 in the repo.
  - The installer verifies the hash **on the target machine** before unpacking.
  - **TEST:** two script runs give the same hash.
  - **TEST:** the extension-directory diff against upstream is exactly `{copilot, mermaid-markdown-features}`.
  - **TEST:** a tgz with one flipped byte is refused, and nothing is unpacked.
  - **TEST:** the git, js-debug and TypeScript built-ins activate (ADR falsifier 4).
- **C4. Fixed server launch.**
  - Flags:
    - `--host 127.0.0.1`, explicit;
    - `--connection-token-file`, in a 0700 directory, written under `umask 077` (no write-then-chmod);
    - never `--without-connection-token`.
  - A dedicated `--server-data-dir` under `~/.osionos/`: neither `.vscode-server-oss` (F1) nor `.vscode-server`.
  - Settings and shell:
    - `telemetry.telemetryLevel: "off"`;
    - `extensions.autoUpdate` and `extensions.autoCheckUpdates` false;
    - the shell is the user's login shell.
  - **TEST:** an argv snapshot.
  - **TEST:** `ss -ltn` shows the port only on `127.0.0.1`.
  - **TEST:** `stat -c %a` gives 600 for the file and 700 for the directory.
  - **TEST:** a request with no token gets 403.
- **C5. The connection token never reaches the browser.**
  - The client is initialised without `connectionToken` (F6 is removed).
  - The proxy injects `tkn` upstream.
  - **TEST (Playwright, full session: edit, terminal, SCM, debug):** the token string occurs 0 times in:
    - the HAR (URLs and headers);
    - `document.cookie`, localStorage, sessionStorage and IndexedDB dumps;
    - the page history;
    - the bridge log.
- **C6. The browser credential is a node capability in a cookie.**
  - It is minted by a `POST` carrying a valid `osionos_ide1` bearer and the exact Origin.
  - Cookie attributes: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Strict`.
  - The value is MAC'd with a key derived from the IDE secret under a new label, and binds `sub`, `node_id` and `exp ≤ 900 s`.
  - **TEST:** the capability, `osionos_ide1` and `pc1` do not verify as one another, in all 6 directions.
  - **TEST:** an expired capability gets 401.
  - **TEST:** a foreign or unknown node gets the same 404 body.
- **C7. The proxy refuses** each of the following, with one named test per item:
  - a. An upgrade with no `Origin` or a non-exact one gets 403 before the handshake.
    - An HTTP request whose `Sec-Fetch-Site` is not `same-origin` gets 403. Absent counts as not `same-origin`.
    - `routeIdeApi`'s absent-Origin pass (F10) is not reused for this route.
  - b. `OSIONOS_IDE_ACCESS` unset or `off`, or a `sub` outside the allowlist, gets 403 (`requireIdeApproval`).
  - c. The node id is resolved only inside `nodesBySub.get(sub)`. It is a registry key and is never parsed into a host, port or socket path.
  - d. A path outside the allowlist gets 404. The allowlist:
    - `/stable-<40hex>/vscode-remote-resource`;
    - `/vscode-remote-resource`;
    - static client paths the build is measured to need;
    - the WebSocket upgrade carrying `reconnectionToken` and `type`.
    - Explicitly refused: `GET /` (F2), `/version`, `/delay-shutdown`, `/callback`, `/web-extension-resource/*`, `/proxy/*`.
    - Also refused: `..`, `%2e`, `%2f`, `%5c`, `\` and `//`, after decoding.
  - e. Upstream request: strip the client's `Cookie`, `Authorization`, `X-Forwarded-*` (prefix included, F2) and `tkn`; set `Host`; inject the token.
  - f. Response:
    - strip `Set-Cookie`, `Access-Control-*` and any off-prefix `Location`;
    - add `Content-Security-Policy: sandbox; default-src 'none'; frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` to every response except a measured allowlist of client script and worker paths.
    - **TEST:** a workspace file `x.html` holding `<script>` is opened top-level through the proxy. `window.origin === "null"`, and app storage is unreadable.
  - g. The socket closes with 4011 at the capability's `exp`.
    - **TEST (short TTL, e.g. 30 s):** a session survives 3 refreshes with terminal state intact.
    - **TEST:** with no refresh, the reconnect is refused and the socket is gone ≤ 5 s after `exp`.
  - h. Bounds:
    - an upstream connect timeout of 10 s;
    - a per-`sub` socket cap;
    - a 502 with a fixed body, never the upstream error text (F9).
- **C8. Never on a public origin.**
  - The node proxy module loads only in the tailnet-only bridge (2026-10-19 C-S2, C-S4, C-S8).
  - **TEST:** `public-funnel.sh verify` gains a check that `GET <public>/api/node/x/vscode-remote-resource` answers 404.
  - **TEST:** the public bridge's env lacks the node variables.
- **C9. Page-script hardening before `/api/node` opens on an origin** (the S4U5 preconditions carried over).
  - On that origin:
    - C17 (Mermaid `strict`) and C18 (`launchUrl` is http(s) only) are merged;
    - embeds either drop `allow-same-origin` (F11) or are not rendered;
    - the document carries an **enforced** CSP with no `script-src 'unsafe-inline'`. `'unsafe-eval'` is allowed only if measured as required by the library, and then recorded.
  - **TEST (Playwright):** a page carrying a Mermaid click callback and a self-navigating embed obtains 0 successful `/api/node/*` responses.
- **C10. Step-up.** Minting the node capability requires a live sudo/aal2 grant (F16).
  - **TEST:** without sudo, 403 `step_up_required`; with sudo, 200.
- **C11. Workspace trust is real (F7 removed).**
  - **TEST:** a folder whose `.vscode/tasks.json` runs on `folderOpen` to write a sentinel leaves the sentinel absent until the owner trusts the folder.
  - **TEST:** debug launch is refused while the folder is untrusted.
- **C12. Cost stays bounded.**
  - The VS Code client is a lazy chunk.
  - **TEST:** the app entry gzip changes by ≤ 1% against the pre-change baseline.
  - **TEST:** a machine switch on the **production** build takes ≤ 2 s.
  - Idle JS heap for 1 and for 3 machine tabs is measured and committed as an artifact.
- **C13. Worker host off, and nothing can hang.**
  - **TEST:** `enableWorkerExtensionHost === false`.
  - Every osionos `executeCommand` call goes through a bounded wrapper that surfaces a timeout error.
  - An extension whose only entry is `browser` is shown as unsupported, never installed silently.

### Phase 2: panels and deletions

- **C14. Extract before deleting (F14).**
  - These symbols move into kept modules before any Phase-2 deletion: `requireSandboxIdentity`, `requireIdeSubject`, `jsonReply`, `parseExactOrigin`, and `tunnelUpstream` while the preview lives.
  - **TEST:** after each deletion commit, `node -e "await import('./scripts/<m>.mjs')"` succeeds for every Keep module, `ide-relay-*.mjs`, `bridge-agent.mjs` and `ide-ws-auth.mjs`.
  - **TEST:** their `node:test` suites are green.
- **C15. Replacement green, then delete, in separate commits.**
  - Each row's replacement has a committed Playwright spec against a real server, on the production build, behind the flag (default OFF), green in CI.
  - Only then does a separate deletion commit follow, revertible by one `git revert`.
- **C16. Must NOT be deleted, whatever the ledger says:**
  - `ide-ws.mjs`, `ide-ws-auth.mjs`, `ide-agent-frames.mjs`, `ide-relay-*.mjs` and `bridge-agent.mjs`: `tunnel+` reuses them.
  - `ide-docker.mjs`'s agent constructor and the T-P6 test: D4's container default stays for every non-owner terminal.
  - `ide-preview.mjs`, `pc1` and `idePorts.ts`, until Phase 4 proves forwarded ports are served on an **opaque or separate origin**.
    - The bare server has no `/proxy/<port>`. That route belongs to code-server's outer app (`server-main.js` only templates it), so "VS Code port forwarding" needs an embedder tunnel provider, which is unproven.
  - Every security-invariant test whose module stays: cross-kind token verification, origin parsing, `extractWsAuth`, `parseResizeFrame`.
  - `osio-fs-agent.mjs` in the groot sandbox image, until the change passes ADR 0022's `verify.sh` (57 checks) or `container+` replaces it in M2.
  - The `sha16` echo suppression of the inbound pipeline when its source moves to `IFileService`.
- **C17. Two-tab concurrency.**
  - **TEST (two Playwright contexts, two machines, one `.omd` page):** a concurrent edit gives exactly one surfaced conflict, no lost write, and no echo loop within 30 s.
- **C22. Extension supply chain.** Open VSX has shipped malicious extensions; that is external knowledge, not verified in this session.
  - Installs happen only on an explicit owner action.
  - The confirmation lists the full dependency closure (the spike's debugpy install pulled `ms-python.python`).
  - Installed `id@version` is recorded per machine.
  - **TEST:** installing debugpy names `ms-python.python` before any download starts.

### Phase 3: `ssh+`, `tunnel+`, keys

- **C18. `ssh+` argv.**
  - The alias must be a non-wildcard `Host` entry parsed from `~/.ssh/config` and match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. It is passed after `--`.
  - Options: `-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes`.
  - Never `StrictHostKeyChecking=no` or `UserKnownHostsFile=/dev/null`.
  - `-L` binds `127.0.0.1` only, or a unix socket in a 0700 `$XDG_RUNTIME_DIR` directory.
  - The process is spawned by the node daemon that owns `~/.ssh`, under a watchdog. The bridge holds no ssh key.
  - **TEST:** the aliases `-oProxyCommand=touch /tmp/x`, `a b` and `*` are refused, and the sentinel is absent.
  - **TEST:** an unknown host key fails with a surfaced error in ≤ 15 s.
  - **TEST:** an argv snapshot.
- **C19. Remote install.**
  - The hash is verified on the remote before unpacking (C3).
  - The C4 argv applies on the remote.
  - The token is read over the ssh channel and never logged.
  - **TEST:** a tampered remote tgz is refused.
  - **TEST:** `grep` of the daemon log for the token returns 0 hits.
- **C20. `tunnel+` is a separate, opt-in kind for the owner only.**
  - It inherits every stage-0 condition of the 2026-10-19 verdict (C-S1 to C-S12).
  - The BYO default stays the container (D4).
  - The `tunnel+` consent text replaces F15. It names "full access as `<user>` on `<host>`: files, keys, and every process you can start", and is shown at pairing.
  - The `tunnel+` action set: open streams to the one local server port only. The relay never supplies a host or port (INV-3).
  - **TEST:** an OPEN naming another port or host is refused.
  - **TEST:** a snapshot of the consent string.
- **C21. Stage 1 is BLOCKED for every machine kind.**
  - It covers any machine or session belonging to anyone but the owner.
  - It opens only with D3 extensible (owner-signed OPEN), isolation, and its own ruling.
  - **TEST:** the node mint answers `not-allowed` for the exempt test account.
- **C23. Desktop edition (F13).** No `/api/node` from `app://osionos` until a measured run shows, from the desktop app:
  - resource GETs and the WebSocket both working;
  - the C5 and C7 tests passing.

## Records owed

- groot `docs/adr/0034-the-ide-runs-on-vs-codes-server-behind-a-non-public-node-proxy.md`: written.
- groot `.out-of-scope/vscode-server-connection-token-in-the-browser.md`: written.
- groot `.out-of-scope/ide-node-proxy-on-the-public-origin.md`: written.
- C0 amendments to ADR-006, ADR 0022 and the BYO contract: owed by the builder.

## What this ruling did not verify

- I did not run the server, the spike or the proxy. Facts F1–F5 and the route list come from reading the minified `server-main.js`.
  - A route the regexes missed would make C7d's list incomplete in the dangerous direction.
  - C7d is therefore an allowlist, not a denylist.
- `remoteExtensionHostAgentServer.ts:351` was not read. C2 tests the claim instead.
- The upstream sha256 was not compared against GitHub, because this laptop's traffic goes through Tor. C3 owes that check.
- `Sec-Fetch-Site` is assumed to be sent by every browser the owner uses. Chromium is; others are unmeasured. C7a refuses its absence, so a browser that does not send it fails closed.

## Verdict

**PROCEED-WITH-CONDITIONS.** The architecture is right and its function is measured. Its security
is not yet measured: who holds the token, what the proxy refuses, and which origin it lives on.
C0–C23 are the acceptance criteria. Stage 1 and the desktop edition stay BLOCKED until C21 and C23.

---

## Amendment ruling (2026-10-30, later the same day): socket mode replaces C4's token file

Request: groot `docs/ide/ADR-006-vscode-backend-osionos-host.md`, "Amendment request (pending a devil ruling)".

**Ruling: ACCEPT-WITH-CONDITIONS.** Socket mode is narrower than C4, and it deletes a credential instead of
guarding one. The protection moves from a secret to a filesystem permission. That makes one mistake,
bridging the socket to TCP or widening its modes, an unauthenticated owner-level RCE. A1–A9 exist to
prevent that.

### The three claims, checked

1. **True. The token is checked in the framed protocol, not only on the upgrade.**
   - The server's first control message must be `{type:"auth"}`. With a token configured it runs `this._connectionToken.type===2&&!this._connectionToken.validate(v.auth)` and refuses with "Unauthorized client refused: auth mismatch" (`lib/vscode/out/server-main.js`, minified).
   - Injecting the token therefore means rewriting the first frame inside the WebSocket and VS Code's protocol framing.
   - That is a protocol-aware proxy: rung 7 of the minimalism ladder, for a secret that socket mode removes.
2. **True, and stronger than stated.**
   - On Linux, `connect()` needs search permission on the 0700 directory, so other users get `EACCES`.
   - Every process that can connect could also have read a 0600 token file.
   - Socket mode also removes a threat C4 kept: **a web page in the owner's browser can reach `127.0.0.1:<port>`** (DNS rebinding, incomplete Private Network Access). In token mode, `/version` and `/delay-shutdown` answer there without any token (F2). A browser cannot reach a Unix socket.
3. **Mostly true.**
   - With `--without-connection-token` there is no server credential to leak. The server's root path then sets no `vscode-tkn` cookie (that cookie is set only when `_connectionToken.type!==0`), so F2's leak is gone.
   - C5 is not vacuous, though: it shrinks to A8. The browser-side credential (C6) still exists.
- The flags combine: the server rejects `--without-connection-token` only alongside `--connection-token` or `--connection-token-file` (same bundle).

### What socket mode costs, and the conditions that pay for it

- **A1. Socket directory.**
  - The daemon creates it with an explicit `mkdir` mode 0700, under `umask 077`.
  - Then it checks with `lstat`: a directory, not a symlink, owned by the euid, `mode & 077 == 0`. It refuses to start otherwise.
  - Location: a local filesystem that survives logout. `$XDG_RUNTIME_DIR` is used only with linger on (logind removes it at the last logout of an ssh-only VM user); otherwise `~/.osionos/run/`.
  - The full socket path is ≤ 100 bytes (`sun_path` is 108 on Linux, 104 on macOS).
  - **TEST:** a pre-planted symlink, a 0755 directory, or a directory owned by another uid → refusal with a message.
  - **TEST:** a 101-byte path → refusal.
- **A2. `umask 077` applies to directory creation only, never to the server's lifetime.**
  - Otherwise every file the owner's terminals, git and extensions create becomes 0600/0700, which breaks shared repositories and web roots.
  - **TEST:** `umask` in a server terminal equals the owner's login umask.
- **A3. Server argv.**
  - `--socket-path <dir>/reh.sock --without-connection-token`, with no `--host` or `--port`.
  - The daemon clears `VSCODE_SERVER_HOST` and `VSCODE_SERVER_PORT` from the environment; the bundle reads both as defaults.
  - **TEST:** `ss -ltnp` lists no TCP listener whose pid is the server's **main** process. Debug adapters and language servers the owner starts may listen; they are not the server.
- **A4. No TCP bridge to the socket, ever.** Only three consumers are allowed:
  - (a) the IDE-origin proxy (C6/C7);
  - (b) `ssh -L <local sock>:<remote sock>`, socket to socket;
  - (c) the `tunnel+` agent's `reh` channel, connecting to the path.
  - There is no fallback to a TCP forward when a socket forward fails.
  - **TEST:** an ssh argv snapshot rejects any `-L` whose local side is `host:port`.
  - **TEST:** during a full Playwright session, `ss -ltnp` on both machines shows no listener owned by osionos-node, our `ssh` child or the server's main pid.
  - **TEST:** `rg -n 'socat|TCP-LISTEN|listen\(\s*\d'` over the node daemon = 0.
- **A5. The ssh socket forward.**
  - Options: `-o StreamLocalBindMask=0177 -o StreamLocalBindUnlink=yes -o ExitOnForwardFailure=yes`, plus every C18 option.
  - The local socket lives in the A1 directory. The remote socket path is absolute and reported by the remote daemon.
  - Before Phase 3, `sshd -T | grep -i allowstreamlocalforwarding` on the VM (`dc-lan`) says `yes`.
  - **TEST:** against an sshd with `AllowStreamLocalForwarding no`, a surfaced error appears within 15 s and no TCP fallback runs.
- **A6. Proxy identity.**
  - The process that connects to the socket runs as the socket's owner uid: on the same host, or through a bind mount with a matching uid.
  - Making it work by widening modes is forbidden: group or other bits, `chmod 0770/0777`, or `setfacl`.
  - The topology table names the proxy's uid and its path to the socket. It does not today; `ide-server.mjs`'s deployment and runtime uid were not found in the osionos tree.
  - **TEST:** a process as a second uid gets `EACCES` on `connect()`.
  - **TEST:** after a full session, the directory and socket have `mode & 077 == 0` and the owner uid.
- **A7. Stale socket.**
  - If the path exists at start: when `lstat` says it is a socket and `connect` gives `ECONNREFUSED`, unlink it (only inside the A1 directory). When a server answers, reuse it instead of starting a second one. When it is any other file type, refuse.
  - **TEST:** after `kill -9`, a restart within 5 s succeeds.
  - **TEST:** a regular file at the path is refused and not unlinked.
- **A8. C5 restated.**
  - The client is initialised with no `connectionToken`, the HAR holds no `tkn=`, and the node cookie is absent from `document.cookie` (it is `HttpOnly`).
  - The `.out-of-scope` record on a token in the browser stays in force, in case a token mode ever returns.
- **A9. Text.**
  - ADR-006 decision 7 changes "a `-L` TCP forward" to the socket-to-socket forward.
  - C4 in this verdict and in ADR 0034 reads "replaced by A1–A7".
  - Windows (named pipes) and macOS each get their own run when they arrive, with A1's 104-byte limit on macOS.

**Replacement test for C4:**
- A1 checks: directory 0700, a regular directory, owned by the owner uid.
- The socket is owned by the owner uid, and a second uid gets `EACCES`.
- A2: the user's own umask inside the server.
- A3: no TCP listener on the server's main pid (`ss -ltnp`).
- A4: no listener owned by the daemon or its `ssh`.
- A7: the stale-socket cases.

### C0 check (ADR-006, ADR 0022, contract.md)

| Item | State | Finding |
|---|---|---|
| (a) decision 6 → non-public IDE origin | **done, and it adds a design** | The app now **frames** the IDE origin. That creates two new obligations, C0-F1 and C0-F2 below. |
| (b) topology table | done, incomplete | It is missing the proxy's uid and how it reaches the socket (A6). |
| (c) desktop not covered | done | none |
| (d) new falsifiers | done | A blank line splits the falsifier list. Add a falsifier: "the framed IDE page cannot carry its node cookie" (C0-F1). |
| (e) amendment lines | done | ADR 0022:60, contract.md:142 (D4) and :573 (§7.4). The §7.2 consent text itself is still owed under C20 (Phase 3). |
| decision 7 | stale | It still says TCP forward (A9). |

- **C0-F1. Is the frame's cookie sent at all? UNKNOWN, load-bearing for C6.**
  - A cookie in a frame is sent only if the frame and the top-level page are same-site.
  - Whether two hosts under `*.ts.net` (or the app's public host and the tailnet host) are same-site depends on the Public Suffix List entry. That was not checked.
  - If they are cross-site, `SameSite=Strict` is not sent, and third-party cookie blocking applies to any weaker setting.
  - **TEST (Playwright, real hostnames):** the framed IDE page completes a full session (edit, terminal, SCM).
  - If that fails, the IDE opens as a top-level window. **Never** relax the cookie to `SameSite=None`.
- **C0-F2. The postMessage contract between the app and the IDE frame is the new boundary.**
  - Both sides check the exact origin.
  - The frame exposes **no** action that runs code: terminal input, task, debug launch, extension install, or settings write.
  - Its only writes are `.omd` files under the pages mount. Relative paths are validated: no `..`, no `.git`, no dotfiles.
  - The IDE origin sends `frame-ancestors <exact app origin>`. The app keeps `'none'`.
  - **TEST:** from the app origin, a message asking to write `.git/hooks/post-checkout`, or to send terminal input, is refused.
  - **TEST:** a message from any other origin is ignored.
  - Payoff: with C0-F2 green, **C9 applies to the IDE origin's document only**. The app origin's Mermaid, launch-URL and embed fixes stop being preconditions for `/api/node`. An app XSS reaches only the C0-F2 message API.

**Verdict on the amendment: ACCEPT-WITH-CONDITIONS (A1–A9; C0-F1 and C0-F2 added).** The overall verdict stays **PROCEED-WITH-CONDITIONS**. C4 is replaced by A1–A7, and C5 is restated by A8.
