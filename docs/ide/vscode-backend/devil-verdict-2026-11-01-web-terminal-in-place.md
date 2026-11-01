# Devil verdict: the web terminal opens in place (2026-11-01)

Plan: `plan-2026-11-01-web-terminal-in-place.md` (branch `feat/web-terminal-inplace`, base develop `d07545d9`).
Record: groot ADR 0041. Amends ADR 0034 C7g (for `/api/pty` only) and ADR 0036 (the terminal on the web).

**Verdict: PROCEED-WITH-CONDITIONS (W1–W16).** The design is sound. Its weak points are in what the
plan leaves unnamed: no Host check exists today, there is no WebSocket server, the page is on
an unmerged branch, and a develop build already holds frame rights on the owner's node.

## Steel-man

The plan drops the one thing ADR 0034 C0-F1 rejected, a cross-site cookie. In its place it puts a
credential that the browser cannot attach on its own. To open a shell, the caller must do all four:

- run on the node's own origin, because the WebSocket `Origin` cannot be forged from a page;
- hold a one-shot ed25519 token that only the bridge can sign, `aud`-bound to this node's origin,
  owner-only and 900 s;
- pass the per-mint identity check, which needs the machine's private key (`scripts/bridge-machines.mjs:207-210`);
- connect over loopback.

On the web, the app never touches the socket: the node-served frame opens it. So on the web the frame
is a real boundary, which the desktop design was not (ADR 0039 alternatives, option (d)). The
window design gave no extra security; it was only how the cookie was carried.

## Evidence

| # | Fact | Where |
|---|---|---|
| E1 | No `Host` check anywhere on the node. `/api/machine/self` gates only on `sec-fetch-site`, which a DNS-rebound page satisfies, so it leaks the machine id today | `packages/osionos-node/ide-origin.mjs:129,135-150`, `machine-identity.mjs:129-131`, `scripts/ide-node-policy.mjs:90-95` |
| E2 | The upgrade check requires `Origin === ideOrigin` and `sec-fetch-site` absent or `same-origin` | `scripts/ide-node-policy.mjs:92` |
| E3 | The token has the claims `{sub, machine, aud, iat, exp, jti}`: it says nothing about which app origin asked for it | `scripts/ide-machine-protocol.mjs:46-51` |
| E4 | The jti guard is in memory, so a restart reopens a 900 s replay window (the caveat is already written) | `machine-identity.mjs:81-91` |
| E5 | Today every node socket closes at the lease `exp` (C7g), and revoke cuts every socket | `node-proxy.mjs:101-149`, `devil-verdict-2026-10-30.md:218` |
| E6 | The heartbeat caveat says a removed machine is "bounded by its tokens' 900 s life". An open shell that outlives its token makes that sentence false | `heartbeat.mjs:56-57` |
| E7 | The owner's running node trusts `https://baas-beta.tail10f2ea.ts.net`, which runs develop and is rebuilt on every push, against the production bridge | `~/.config/systemd/user/osionos-node.service` ExecStart; `ps` shows the same argv; ADR 0040 |
| E8 | The node has no WebSocket server and no dependencies. The pinned server ships `ws` 8.21.0 and `node-pty` 1.2.0-beta.15 | `packages/osionos-node/package.json`; `~/.osionos/server/1.138.0/vscode/node_modules/{ws,node-pty}` |
| E9 | **U2 is measured, on this laptop only.** `require(node-pty)` from the server loads under the node's own Node 24.21.0 and spawns a shell (`DATA:pty-ok 253310`, `EXIT {"exitCode":0}`). The modules ABI is 137 on both Nodes (server node v24.18.1). The node accepts any Node >= 22 (`package.json` engines), and Node 22 has a different ABI | the command in this ruling's session |
| E10 | The terminal page and the port code (`src/terminal-client/*`, `terminalPort.ts`, `osc52ReadFilter.ts`) exist only on `feat/vscode-terminal` (`60736f2f`), which is not an ancestor of HEAD. That branch's copy of the desktop verdict has Amendment 1 only (line 73); Amendment 2 (T1–T11) is missing | `git merge-base --is-ancestor` → NOT-in-HEAD |
| E11 | Step-up lasts 600 s. Under "one token = one shell", every new terminal tab after 10 min costs an email code, and those codes arrive one request late (owner memory, 2026-10-31) | `scripts/bridge-account-sudo.mjs:51` |
| E12 | The desktop page's frame check is `parent !== self && parent === top`. The plan's text drops `parent !== self`, and without it a top-level window passes | `feat/vscode-terminal:src/features/ide/model/terminalPort.ts:63` |

## Risk

| Axis | Score | Why |
|---|---|---|
| Blast radius | 4 | A shell as the user, on every paired machine. Through the owner's ssh keys it reaches the VM that holds `/opt/grobase/.env` (2026-10-30 F15) |
| Reversibility | 3 | The code reverts in one release and a node restart. A shell an attacker opens is one-way: they can install persistence within a second |
| Cost on failure | **5** | If the Origin/Host/token gate fails, any web origin gets code execution on the user's machine |
| Confidence | 3 | U2 is measured (E9). Still unverified: U1 (LNA), the WebSocket implementation, `sec-fetch-site` on a nested-frame WebSocket, and the step-up UX |

**Worst: cost on failure (5).** It is bounded because three independent gates must all fail together:
the Origin (browser-enforced), the bridge signature with the per-mint machine identity, and loopback.

## Failures nobody mentioned

1. **DNS rebinding hits the static and read routes, not the pty.** Take a page at `http://evil:4100`
   rebound to 127.0.0.1. It sends `Origin: http://evil:4100`, so a strict Origin check alone stops
   `/api/pty`. But it already reads `/api/machine/self` (E1), and every new GET route the plan adds
   inherits that. Hence W1: a Host allowlist on every request, not only on the upgrade.
2. **"`window.parent === window.top`" holds for a top-level window** (E12). With that check, any site
   can `window.open` the page and the guard passes. The sender-origin check still saves it today.
3. **The beta can frame a shell on the owner's laptop** (E7, E3). Develop code on baas-beta can relay
   whoami, mint after step-up (production bridge, same account) and post the token. Nothing in the
   token tells beta apart from production. This is already true for the IDE window. In place, it
   becomes a frame with no visible window.
4. **One token per shell fights the owner's UX** (E11). The second tab after 10 minutes asks for an
   email code. That is a security-neutral failure of the stated goal.
5. **No WebSocket server exists** (E8). A hand-rolled frame parser on loopback, fed by any local
   process, is the likeliest place for a crash or a bypass.
6. **The 5 s pre-auth window is unbounded in count.** Unauthenticated sockets each hold an fd for 5 s,
   and any local process can open thousands.
7. **Port squatting by another local user** while the node is down. The squatter cannot get a token,
   because the identity check needs the machine key. A fake terminal page can still phish keystrokes.
   This is residual and multi-user only; the fallback panel's honesty limits it.
8. **Shells die on reload.** That is accepted (no reattach credential means less surface), but the
   plan should say so.

## Rulings on the asks

- **Website → `ws://127.0.0.1:4100/api/pty` (CSWSH):** closed by the exact-Origin match (W2).
  A browser cannot forge `Origin`. A non-browser local process can forge it but still needs a token (W3).
- **Token theft or replay from the frame:** acceptable. The app already holds the same token, and the
  frame is a narrower holder. The token is consumed once, through the same jti guard as
  `/api/node/session`. The residual is the post-restart 900 s window (E4), already caveated.
- **A malicious develop build:** an owner trust decision, not a code fix (W15).
- **The LNA prompt:** feasibility only. A refusal fails closed into the fallback panel (W14).
- **"The token gates the opening, not the life": ACCEPTED** for `/api/pty` on loopback, owner-only.
  C7g protected a *remote* revoked owner. Here the pty is reachable only from the owner's own
  machine, and once a shell is open, a lifetime cap adds nothing: one second of shell is enough to
  install persistence. Conditions: kill on close, stop, unpair and revoke, and fix the caveat that
  becomes false (W8).
- **U3:** resolved by W10/W11. It is not a blocker.

## Conditions (each one is a test the builder shows green)

- **W1 Host allowlist.** Every request and upgrade whose `Host` is not exactly the configured
  ideOrigin `host:port` gets 403 (raw, no 101). TEST: `Host: evil.test:4100` on `GET /terminal/`,
  `GET /api/machine/self`, `GET /` and the `/api/pty` upgrade, all refused. `127.0.0.1:4100` is accepted.
- **W2 Origin.** The `/api/pty` upgrade goes through `checkNodeOrigin(headers, ideOrigin, true)`.
  TEST: Origin absent, `null`, `https://baas.tail10f2ea.ts.net:8443`, `http://localhost:4100` and
  `http://127.0.0.1:4101` are each refused before any upgrade. A spawn spy counts 0.
- **W3 Token.** The first message arrives within 5 s, the pre-auth payload is at most 4 KiB, and it is
  checked by the **same** `verifySession` instance (the same jti guard) as `/api/node/session`, with
  `userId === ownerId` and `isRevoked`. TEST: a token used once by either route is refused by the
  other. Expired, another `aud`, another machine, a bad signature, a non-JSON message, a binary frame
  and silence each give 4401 and spawn count 0. In shared-secret mode, `/api/pty` returns 404.
- **W4 Bounds.** At most 4 unauthenticated sockets are pending (more are refused). Shells are capped at
  8 per node, counted apart from the IDE socket registry and reserved before spawn. TEST: the 9th
  shell gets 4429 with no spawn, and closing a shell frees its slot.
- **W5 Wire.** After auth, the desktop contract is validated exactly: `write` is a string of ≤ 65536
  chars, `resize` takes integers 1..1000, `ack` takes a non-negative integer. An unknown op or
  malformed JSON closes the socket and the node does not crash. `maxPayload` is set. TEST: a
  property-based run over generated messages; the node stays up and nothing out of bounds reaches
  `pty.write` or `pty.resize`.
- **W6 No hand-rolled WebSocket.** Use the pinned server's `ws` (8.21.0, E8) through `createRequire`
  from `--server`, or add `ws` to the manifest with the rung-6 accounting in the commit.
- **W7 The pty runtime.** `node-pty` comes from the pinned server. If
  `process.versions.modules` differs from the server Node's ABI, the pty host runs under
  `<server>/node`. It never fails open and never crashes the node. The pty env is
  `serverEnv()` (`server-launch.mjs:54-57`), the cwd is `$HOME`, the shell is `$SHELL`. TEST: the
  runtime choice for a matching and a mismatching ABI.
- **W8 Lifetime.** The token gates the opening only. TEST: a socket close kills the pty (its
  process group gets SIGHUP) within 1 s. SIGTERM, `stop()` and the heartbeat's `onGone` kill every
  pty. `revoke(userId)` kills every pty. Change the `heartbeat.mjs:56-57` caveat in the same commit.
  ADR 0034 C7g is amended for `/api/pty` only (ADR 0041).
- **W9 Flow control.** TEST: with a shell running `yes` and the frame not acking, the pty is paused at
  the high watermark, and the socket's `bufferedAmount` plus the node's buffered output stay under a
  stated bound.
- **W10 Frame intake.** The page starts only if `window.parent !== window && window.parent === window.top`.
  It accepts only messages whose `event.source === window.parent` and whose `event.origin` is one of
  the node-injected app origins, and it pins the first such origin. It posts only to that origin,
  never `"*"`. It accepts only `{token}` and colours; every other message, including `{op:'write'}`,
  does nothing. The token is dropped after it is sent and never reaches storage, a URL or a log.
  TEST: each of these as a unit, plus "top-level opened → draws nothing".
- **W11 App side.** The app accepts frame messages only when `event.source === frame.contentWindow` and
  the origin is exactly the node origin. It posts with that exact `targetOrigin`. Each mint keeps
  its own identity check (whoami relayed by the frame). A failed whoami means no token is posted.
  TEST: a wrong source or origin is ignored, and a failed identity means no post.
- **W12 Page policy.** `/terminal/` gets its own CSP: `default-src 'none'`, `script-src 'self'`,
  `connect-src 'self'`, `frame-src 'none'`, `base-uri 'none'`, `form-action 'none'`,
  `frame-ancestors <app origins>`, and no Open VSX. Only `/terminal/`, `/terminal/index.html` and
  flat assets from the terminal build's own root are served. TEST: the header is exact, and
  `/terminal/../x` and nested asset paths return 404.
- **W13 Clipboard.** OSC 52 reads are refused (`osc52ReadFilter` carried over, ADR 0039).
  `clipboard-read` stays out of `allow=` unless a test shows paste fails without it.
- **W14 Fallback.** If the frame does not post `ready` within the bound, the dock shows a panel naming
  both causes (node not running; local network access refused, and how to allow it again). There is
  never a blank frame. A node without `/terminal/` shows "update osionos-node". The bound carries a
  `Caveat:` marker. TEST: no node, a 404 node, and a frame that never answers.
- **W15 Beta trust.** Before this ships to the owner's laptop, do one of two things. Either remove
  `--app-origin https://baas-beta.tail10f2ea.ts.net` from the owner's node unit, or have the owner
  record in ADR 0041 that every develop push is trusted with a shell on this laptop. (This also
  applies to today's IDE window.)
- **W16 Base.** Build on the terminal page and port code from `feat/vscode-terminal` with its T1–T11
  (ADR 0039). Restore Amendment 2 into the verdict file first, since only Amendment 1 is on the branch
  (E10). Extract shared modules (library-first); do not copy them.

## Unknowns: when each must be measured

| U | What | Must be measured |
|---|---|---|
| U1 | Chrome LNA on the iframe navigation and on its WebSocket; Firefox; Safari (mixed content to `http://127.0.0.1`) | Chrome: **before merging to develop** (develop auto-deploys to the beta in about 3 min, so a merge is a ship). Firefox and Safari: before main. An unsupported browser gets W14's panel |
| U2 | Server `node-pty` under the node's Node | **Measured green here** (E9). The ABI-mismatch path (Node 22) before main (W7) |
| U3 | Token in frame memory | **Resolved by ruling** (W10, W11) |
| U4 | WebSocket server implementation | **Before writing code** (W6) |
| U5 | Does Chrome send `Sec-Fetch-Site: same-origin`, or none, on the frame's own WebSocket while the frame is nested cross-site? If it sends `cross-site`, `checkNodeOrigin` refuses the real frame (fails closed) | Before merging to develop |
| U6 | Step-up cadence: the second shell after 600 s asks for an email code | Before main. **Pre-ruled option:** on the first token, the node may issue a 256-bit random session secret to the frame. It lives in memory only, is sent only as a WebSocket first message, opens shells under W2–W5 and dies when that frame's last socket closes. It widens nothing: whoever can read the frame's memory can already type into its shell |

## Amendment 1 (2026-11-01): "remember this computer"

The owner's complaint, verbatim: "each time we connect it asks us to reconnect through mail the terminal...
the app should add the machine and app just once that's all... we cannot ask constantly to people to send
themselves a mail to be connected that's wrong" and "each time we reload and each time we need to reconnect
that's also wrong for UX".

The proposal: after the first step-up, the node issues a 256-bit device secret. The node stores it hashed,
bound to {owner, machine}. The frame keeps it in its own localStorage. Later loads open shells with it,
with no mint and no step-up. It lasts 30 days, sliding, and is revoked on removal, unpair, "Forget this
computer" and sign-out-everywhere.

**Verdict: PROCEED-WITH-CONDITIONS (R1–R14).** The complaint is right: an emailed code on every reload is
a defect, not a safeguard. But the proposal as written rests on two assumptions that are false. With R1–R14
it is sound: the device secret becomes a second factor, not a bearer credential.

### Steel-man

Remembering the device takes nothing away from security on the threats that matter. Anyone who has the
owner's unlocked OS session already has a shell (GNOME Terminal), so a stolen unlocked laptop or a
colleague at the owner's desk gains nothing. The secret is usable only over loopback, from code running
on the node's own origin. Only frames that `frame-ancestors` allows can run that code
(`static-client.mjs:50`). The frame never lets the app read its DOM or its storage. And the
in-memory session secret (U6) already ships: `pty-service.mjs:32-41`. This only changes how long it lives.

### Evidence

| # | Fact | Where |
|---|---|---|
| A1 | **`ts.net` is on the Public Suffix List**, so `https://baas.tail10f2ea.ts.net:8443` (production) and `https://baas-beta.tail10f2ea.ts.net` (beta) are the **same site**, `https://tail10f2ea.ts.net`. Chrome, Firefox (Total Cookie Protection) and Safari all key third-party storage by top-level *site*, so the frame gets **the same localStorage partition** under the beta as under production. "Other sites get a different partition" is false for the one other origin the owner trusts | `/usr/share/publicsuffix/public_suffix_list.dat:15841`; the owner's node unit lists both (`~/.config/systemd/user/osionos-node.service`) |
| A2 | The partition is not the boundary. The origin is: only node-served code reads `http://127.0.0.1:4100` storage, and only an `--app-origin` can frame it. Partitioning is defence in depth. Turning it off (enterprise policy, an old browser) changes nothing that matters | `static-client.mjs:47-50`, `terminalAppLink.ts:33,46-47` |
| A3 | The account check is in the **app**: the frame only relays whoami (`terminalAppLink.ts:61-64`, `machineWhoami.ts:7-17`). A malicious or buggy app skips it for free. Nothing the app tells the frame about "who is signed in" can be trusted | same |
| A4 | The node is owner-only: `token.userId !== ownerId` refuses every other account (`pty-service.mjs:38`). So a remembered secret can only ever open the owner's shell | same |
| A5 | **The node has no live revocation channel.** `revoke(userId)` (`ide-origin.mjs:195-199`) has no caller outside tests. The node learns only of removal, through the heartbeat's 410 within 30 s (`heartbeat.mjs:22,73-76`). It cannot learn of sign-out-everywhere | `rg '\.revoke\('` |
| A6 | The bridge checks the app session statelessly (`bridge-account-sudo.mjs:73-80`, JWT verify, no GoTrue call). Sign-out-everywhere therefore takes effect at the access token's expiry, not at once (the TTL is **unverified**; the GoTrue default is 3600 s) | same |
| A7 | A mint already needs a fresh identity check signed by the machine key, one per mint within 60 s (`bridge-machines.mjs:207-210`). That check costs no email; only `requireSudo` (`:201`) does | same |
| A8 | The machine token is `osionos_mc1.…` (`pty-wire.mjs:51`). Any new bridge-signed assertion that a current node's `verifySession` would accept as a machine token **is a step-up bypass on every node not yet updated** | `scripts/ide-machine-protocol.mjs:46-51` |
| A9 | The owner overrode ADR 0042 C-3, so shipped Connectors trust the beta too (`.out-of-scope/connector-trusts-non-production-app-origins.md`). A beta-remembered secret would reach testers' machines, not only the owner's laptop | groot ADR 0042 |

### Risk

| Axis | Score | Why |
|---|---|---|
| Blast radius | 4 | Unchanged: the owner's shell, on each computer that remembers |
| Reversibility | 3 | Forget plus a node update reverts it. A shell opened by abuse is one-way |
| Cost on failure | 5 | A device secret that works as a bearer credential is a 30-day, step-up-free key to a shell for whoever runs code at the node origin or under a trusted app origin |
| Confidence | 3 | A1 and A5 are measured. Still unverified: the access-token TTL (A6), Safari's purge of partitioned storage, Firefox's partitioning of loopback |

**Worst: cost on failure (5).** It stays bounded only if the device secret is never enough on its own (R1).

### Failures nobody mentioned

1. **The beta inherits production's memory (A1).** Remember once on production, then open the beta: the
   frame reads the same localStorage and opens a shell with no step-up. Every develop push gets what the
   owner granted only to production, and so does every tester's Connector (A9). Hence R4 and R5.
2. **"The frame must refuse when the app's account differs" cannot be built as written (A3).** The frame
   cannot tell what account the app has. The app's word costs nothing, and the frame has no bridge
   session. The answer is to let the **bridge** state the account in a signature (R1–R3). Does a lie only
   hurt the liar? For the account question, yes: the node is owner-only (A4), and a person on the owner's
   unlocked OS session already has a shell. For revocation, no: a lying or stale app would keep a revoked
   owner's computer opening shells for 30 days. That is why the bridge must sign something on every load.
3. **Sign-out-everywhere cannot reach the node (A5).** "If the node can learn of it": it cannot. Requiring
   a bridge assertion on each load is what makes sign-out, removal and account deletion take effect,
   within the access token's TTL (A6).
4. **Port squatting turns into secret theft.** While the node is down, another local user who binds
   127.0.0.1:4100 serves a page that **is** the node origin. Framed by the app, it runs in the same
   partition and reads the device secret. Today such a squatter gets nothing persistent. Under R1 the
   stolen secret is useless without a resume assertion, which the bridge signs only after the real
   machine key answers whoami (A7).
5. **A new assertion type can unlock old nodes (A8).** If the "resume" credential shares the machine
   token's format, a node not yet updated accepts it as a full token. That would be a step-up bypass on
   exactly the machines nobody is watching.
6. **Sliding forever.** A copy of the secret that keeps being used never expires. An absolute cap bounds it (R7).
7. **A hidden frame becomes a place to type into, with no prompt.** A malicious build on a trusted origin
   can stack the frame at opacity 0, focus it, and get the human to type or paste (a "Copy" button first
   loads the clipboard). Today that needs a step-up on that page load. Under remember it needs none.
   Residual, and accepted only for the production origin (R5), which can already mint tokens. Bracketed
   paste in bash 5.1+ and zsh blunts the paste variant; it does not remove it.

### On the owner's alternative: "synchronize by tunneling (ssh) each time"

**Rejected.** A browser cannot speak ssh, so someone has to relay it: the bridge or a server holding an ssh
key that logs into the user's machine. That is a cloud-held credential to every user's computer, and a
network-reachable sshd in place of a loopback port. It is the remote path ADR 0037 and ADR 0041
("relay the pty through the bridge") refused, and it breaks the sovereignty rule (users' own machines,
never a cloud OS). It also does not remove the question: the ssh key has to survive a reload too, so it is
"remember this computer" with a far larger blast radius. Recorded in groot
`.out-of-scope/ssh-tunnel-per-terminal-session.md`.

### Conditions (each one is a test the builder shows green)

- **R1 Two factors.** A remembered open needs **both** the device secret and a fresh bridge-signed resume
  assertion. TEST: a secret alone, an assertion alone, a secret with an expired assertion, and a secret
  with a replayed assertion each give 4401, and the spawn count is 0.
- **R2 The resume assertion.** The bridge mints it **without** `requireSudo`, but only after a fresh
  identity check (the same one-identity-one-mint `getDel`, `bridge-machines.mjs:207-210`) and only for a
  machine row the caller owns with `revoked_at` null. Claims: `{typ:'resume', sub, machine, aud, iat, exp, jti}`,
  `exp - iat <= 60`. It has its own prefix (`osionos_mr1.` or similar) and a domain-separated signed message.
  Its jti is spent through the same guard as the token (W3). TEST: **the node verifier at bae4497e rejects a
  resume assertion** (A8); `/api/node/session` rejects it; a machine token is rejected where a resume
  assertion is expected; a resume mint for a removed machine or for another account's machine gets 403/404.
- **R3 The account comes from the bridge, never from the app.** The node requires
  `assertion.sub === ownerId === record.owner` and `assertion.machine ===` this machine. The frame has no
  "who is signed in" input. TEST: a valid secret with another account's assertion gives 4401.
- **R4 Bound to the app origin.** The device record stores the frame's pinned `event.origin`
  (`terminalAppLink.ts:47`; the browser sets it, so it cannot be forged). The frame keys its localStorage
  entry by that origin and presents it as such, and the node refuses the secret under any other origin.
  TEST: remember under production, then open the frame under the beta in the same browser (same partition,
  A1): there is no remembered open, and it falls back to the token path.
- **R5 Production only.** The node issues device secrets only to origins named by a new explicit option
  (for example `--remember-origin`). The owner's unit and the Connector name only
  `https://baas.tail10f2ea.ts.net:8443`. The beta never gets one unless the owner records an override in
  ADR 0041, the way W15 was recorded. TEST: a token open pinned to the beta returns `opened` with no device secret.
- **R6 Issued from a step-up only.** A device secret is issued only on an open authenticated with a machine
  token (step-up), and only when the user checked "Remember this computer". It is never issued from a session
  secret or a remembered open. No rotation on use: two tabs opening at once would race and lock each other out.
  TEST: each path, plus the checkbox off giving no secret.
- **R7 Node storage.** The node stores `{sha256(secret), owner, machine, appOrigin, createdAt, lastUsedAt}` in
  a file in its state directory, mode 0600, written atomically. At most 8 records; the oldest is evicted.
  Sliding 30 days idle, **absolute 90 days**. TEST with a fake clock: used at 29 days idle opens; 31 days idle
  is refused; 91 days absolute is refused; a 9th record evicts the oldest; the mode is 0600; the plaintext
  secret appears nowhere in the file.
- **R8 Revocation.** The file is deleted **before** `stop()` on the heartbeat's 410 (`onGone`), on unpair, on
  re-pair to another owner, and on `revoke(owner)`. "Forget this computer" (Settings › Machines and the dock)
  goes through the frame: a `forget` message from the pinned parent deletes the frame's entry and the node's
  record. It only ever removes access, so a malicious app sending it is a denial of service and nothing more.
  Sign-out-everywhere and account deletion take effect because the bridge stops minting R2 assertions. The
  stateless lag (A6) carries a `Caveat:` stating the measured access-token TTL. TEST: 410 leaves no file;
  forget, then reload, takes the token path; the bridge refuses a resume mint once the machine is removed.
- **R9 The secret stays in the frame.** It lives only in the node origin's localStorage inside the frame. It is
  sent only as the first WebSocket message. It never goes into `postMessage`, a URL, a log or the app bundle.
  TEST: a `postMessage` spy over a full remember, reload and open never sees the secret.
- **R10 Frame intake (W10).** W10 grows by exactly two messages: the resume assertion (handled like the token)
  and `forget`. TEST: a parent message carrying `secret` or `device` does nothing.
- **R11 Fail closed.** If storage is missing, purged (Safari ITP), unpartitioned or `credentialless`, or the
  bridge is unreachable, the frame takes today's token path with a step-up. There is never an error loop or a
  blank frame. TEST: each case, using a stubbed storage.
- **R12 One email per computer, measured.** e2e in Chrome: step-up once on production with remember checked,
  reload 3 times and open 2 tabs, and the step-up endpoint is called exactly once. Run it before merging to
  develop. Firefox and Safari before main. An unsupported browser falls back under R11.
- **R13 The lists stay true.** In the same commit, update the headers of `pty-service.mjs` and `pty-wire.mjs`,
  the `heartbeat.mjs:56-59` caveat and ADR 0041. The step-up dialog's "Remember this computer" says
  "don't check this on a shared computer".
- **R14 Old nodes and old frames.** An old frame against a new node, and a new frame against an old node
  (the Connector version floor, ADR 0042), both work on the token path. TEST: both pairings against fixtures.

### Unknowns

| U | What | When |
|---|---|---|
| R-U1 | The access-token TTL on production GoTrue, which bounds A6 | Before main. Write it into R8's Caveat |
| R-U2 | Safari's 7-day purge and its partitioning of loopback third-party storage; Firefox's partitioning of loopback | Before main. A failure only costs UX, under R11 |
