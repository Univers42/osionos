# Devil verdict: bring-your-own-compute terminals (`osio-agent` + `osionos-ide-relay`), 2026-10-19 ~12:30

Plan read: scratchpad `byo-agent-contract.md` (959 lines, architect, no code). Binding priors:
`devil-verdict-ide.md` (N1/N2, host-rootless ruling), `devil-verdict-ide-same-vm.md` (S1–S9, R1–R12,
G0, ingress), ADR 0022 and `.out-of-scope/ide-terminal-for-every-user-on-the-seat.md` +
`.out-of-scope/ide-on-the-seat-rootless-docker.md` (both in `/goinfre/dlesieur/wt-groot-allowlist`).
Nothing in the live stack was changed. Probes were read-only (`ps`, `ss`, `docker ps/info/image ls`, `git
show`), plus two local Node probes in `scratchpad/nodeprobe/` against 127.0.0.1 sinks.

## Steel-man

This is the first terminal design that sidesteps every reason the earlier ones were blocked. The code
runs on the *user's* kernel and the user's disk, so the K1/K2 CPU hazard, the seat's missing disk and the
3-box capacity ceiling all stop applying. The agent dials out, so no user opens a port. The relay is
DB-less and holds no output at rest, and the agent decides what runs (INV-3: OPEN has no argv, image,
env or mount field). Most of the hard parts already exist and are tested: the token, the subject gate,
the WS codec, the session ring and the docker exec client. The decisions are argued on the minimalism
ladder, each one names what would reverse it, and the threat model admits its two real residuals
(plaintext at the relay, device-code phishing) instead of hiding them. I rule on this version.

## Facts measured for this ruling

| # | Fact | Evidence |
|---|---|---|
| B1 | **The seat has exactly one osionos bridge**, `track-binocle-osionos-bridge-1`, in compose project `track-binocle`. That is the project `public-funnel.sh` drives (`PROJECT` default, `scripts/public-funnel.sh:34`), and Funnel maps public `10000 → 127.0.0.1:4000` (`:38`), which is that bridge's publish (`docker-compose.yml:21`). There is no separate "non-public project" bridge. | `docker ps -a --format` gives 17 `track-binocle` containers and 1 bridge |
| B2 | The mint is switched on by the secret alone (`bridge-ide-token.mjs:39-46`, W). The app always mints at `${apiBase}/api/ide/token`, the main bridge (`src/features/ide/api/ideToken.ts:15,77`, W). | `sed`, `grep` |
| B3 | **In `allowlist` mode the deny list is never read**: `assertIdeSubject` returns right after the allowlist check, and only `approved`/`verified` consult `OSIONOS_IDE_DENIED_SUBJECTS` (`scripts/ide-access.mjs:46-51`, identical on `origin/develop`). | `git show origin/develop:scripts/ide-access.mjs` |
| B4 | **`vault42 volumes` archives every docker volume on the daemon** (`docker volume ls -q`, `vendor/scripts/vault42/lib/volumes.sh:63`). It skips only `*gobuild *gomod *cargo-home *pnpm_store *node_modules` (`:32-37`). | `sed` |
| B5 | Rootless docker's data-root is `/goinfre/dlesieur/docker`, so the relay volume is wiped with `/goinfre` (U8 answered: fails closed). rootlesskit and slirp4netns run with `--disable-host-loopback`, restarted 12:04:45, so a container cannot reach host 127.0.0.1. Only `memory pids` controllers are delegated. | `docker info`, `ps`, `cgroup.controllers` |
| B6 | One human login on the seat (`who` → dlesieur). The uids 201989/202887/202888 are dlesieur's own subuid range (`/etc/subuid: dlesieur:201889:65536`). | `who`, `/etc/subuid` |
| B7 | The seat still holds prod: qemu pid 153241 runs as dlesieur (started 2026-10-17 14:15), and `the emergency dump` (104 auth.users) is `0600 dlesieur`. `/sgoinfre/.../virtual_machines/baas/` is gone. | `ps`, `ls -l` |
| B8 | The seat's tailscaled is `--tun=userspace-networking --state=mem:` (restarted 12:05:24). A seat process reaches `*.ts.net` only through `localhost:1055` (SOCKS5 + HTTP proxy). | `ps` |
| B9 | **Node v22.22.3's global `WebSocket` honours `NODE_USE_ENV_PROXY=1`**: the proxy saw `CONNECT host:443`. **When the proxy accepts the CONNECT and drops it, undici retries without backoff**: 21,702 CONNECTs in 4 s for `ws://`, 6,286 for `wss://`. When the proxy answers 502 it tries once. | `scratchpad/nodeprobe/{proxy-sink,proxy-502,ws-dial}.mjs` |
| B10 | The bridge lets a WS upgrade with **no** `Origin` through to token auth (`bridge-ide-exec.mjs:187-190`, W). Node 22's WebSocket sends none. So a Node client cannot exercise T-N7. | `sed` |
| B11 | **ADR 0023, 0024 and 0025 already exist on `origin/main`** (audit types, egress firewall, session cutoff). The contract's "0023 is next free" is wrong. The next free number is **0026**. | `git ls-tree origin/main docs/adr/` |
| B12 | osionos `origin/develop` and `origin/main` contain `8f393395` (revocation enforcement). The groot pin `ab21ebd7` lacks `ide-access.mjs`, so the BYO work needs a bridge newer than the pin, and that bridge 503s every token until `public.auth_session_cutoffs` exists on prod (user memory `session-revocation-rollout`). | `git branch -a --contains`, `git show ab21ebd7:` |
| B13 | Disk: `/goinfre` has 25G free (64%). **`$HOME` has 664M free (87% of 4.7G)**, and `~/osio-workspace` is the agent's default workspace (§7.1). | `df -h` |
| B14 | Images present locally: `node:22-bookworm-slim` (d0a16be756b6) and `node:22-alpine`. **No `debian:12-slim`** (O6's default), so the harness would pull from Hub on the school IP. | `docker image ls` |
| B15 | The production primitives a harness needs are exported: `signIdeToken`/`verifyIdeToken`/`ideTokenSecret` (`ide-token.mjs:91,100,114`), `assertIdeSubject` (`ide-access.mjs:43`), and the workspace binding `session.workspaceIds.includes(workspaceId)` (`ide-sandbox-spec.mjs:42`). | `grep ^export` |

## The failures nobody mentioned

1. **Stage 0's mint has no home (B1, B2).** D6 says "the relay runs in the non-public project". That is
   true for the relay, but the browser mints at the *main bridge*. The seat has one bridge, and it sits
   behind Funnel :10000. The first real-account test would put `OSIONOS_IDE_TOKEN_SECRET` on the
   internet-facing bridge: `public-funnel.sh verify` goes red on `BRIDGE_MUST_BE_EMPTY`
   (`scripts/lib/public-verify.sh:26`), and S1/N1 break. Alternatively a second bridge and app build
   gets built under time pressure. Every harness gate can be green while the real stage-0 path is
   impossible as written.
2. **A backup revives revoked agents (B4).** §5.4 says "no backups, on purpose: a restore would revive
   revoked agents". vault42 captures every non-cache volume, `osionos-ide-relay-data` included. After
   the next /goinfre wipe (two in 30 h), the restore brings back every agent the owner revoked. That is
   fail-open, and nothing in the contract would show it.
3. **A seat agent through userspace tailscaled can hammer it (B8, B9).** The only way a seat process
   reaches node 3 is the :1055 proxy. Node's env-proxy path retries an accept-and-drop CONNECT about
   5,000 times/s, outside the agent's own 1–60 s backoff (§3.6). The same tailscaled carries the public
   Funnel.
4. **The operator's per-subject kill does nothing in allowlist mode (B3).** §5.3 lists
   `OSIONOS_IDE_DENIED_SUBJECTS` as an operator path, and the bridge mint ignores it in the only mode
   N2 allows. Removing the subject from the allowlist is the real switch.
5. **The pin bump in §11.2 trips the revocation trap (B12):** every bridge request 503s until prod has
   the cutoff table, and prod has no disk.
6. ADR number collision (B11).

## Rulings on D1–D6

| D | Ruling | Change required |
|---|---|---|
| D1 multiplexed link, sessions on the agent | **Accept.** | None. T-P3 must prove that a relay restart keeps shells. |
| D2 relay-local JSON registry | **Accept, amended.** | Kept out of every vault42 capture (C-S10). The harness store path is per run and never the stage-0 path. |
| D3 no E2E | **Accept** for the operator plus ≤ 5 named people. | The plaintext sentence ("whoever runs the relay can see everything typed") appears in the **pairing consent prompt** (§4 step 6), not only at `run`/`status`. |
| D4 container on the user's Docker | **Accept, amended.** | The agent refuses euid 0. Containers carry a label `io.osionos.agent=<agent_id>`. The rootful branch of §7.1 is measured before stage 1 (the seat is rootless only, B5). |
| D5 shared HMAC, N1' | **Accept for stage 1 ≤ 5, amended.** | The relay checks the deny list explicitly on every route (B3). Stage 0 never puts the secret on the Funnel-fronted bridge (B1). E3 (asymmetric) remains mandatory before any growth past named users. |
| D6 tailnet-only stage 0 | **Accept the intent, amended.** | A real non-public bridge and app pair has to be built (C-S2). Node 3 gets a persistent statedir. The seat-agent proxy path must be bounded, or the agent runs on a tun-mode machine (C-S5). |

## Q4: does a test agent on the seat violate G0 or ADR 0022?

- **Harness (loopback relay, ephemeral secret, synthetic subjects): no.**
  - G0 is about *untrusted* code on the kernel that holds prod. Here only dlesieur can cause an OPEN:
    - the relay is bound to 127.0.0.1;
    - the seat has one human login (B6);
    - the secret exists only in a 0600 file.
  - The containers cannot reach host loopback (B5).
  - The operator already runs his own containers on this daemon all day. Nothing new is granted.
- **Stage 0 over the tailnet: tolerated, with C-S7/C-S8.**
  - The new grant is that a stolen operator app session plus tailnet reach becomes a shell on the
    seat. Hence foreground-only, an ACL on node 3, and unpairing after each session.
- **Stage 1: yes, it would violate them. No agent on the seat (C-P2).**
  - From stage 1 the parties who can trigger OPEN include anyone who compromises the internet-facing
    bridge (N1') or the relay.
  - An escape from a rootless container lands as dlesieur, who runs qemu 153241 and owns the
    emergency dump (B7).
  - That is exactly `.out-of-scope/ide-on-the-seat-rootless-docker.md`, which "holds while the IDE
    host's uid owns the prod VM disk or a prod credential". It still holds.
- **Consequence:** the owner's "connect to their own Linux system" can be proven with real users only
  on a Linux machine that is not this seat. Which machine is UNKNOWN (new O13).

## Q2: is a token-minting harness acceptable evidence?

- **Yes, for the relay and agent invariants** (INV-1…6, T-N1…T-N19, T-P1…T-P7). Those properties hold
  *given a token*. A harness minting with the production `signIdeToken` exercises exactly the
  verifier the relay will run in production (B15).
- **No, for stage 0.** It proves nothing about:
  - the mint binding `sub` to the session (B2);
  - the app UI (picker, pairing, reconnect);
  - Origin from a real browser;
  - the transport (U1–U3, B9);
  - N1'.
- The harness result is labelled **"protocol harness"**, never "stage 0 passed" (C-H13).
- **What the real-account e2e must add** (C-S9, C-P10):
  - **Stage 0:**
    - `the operator account` signs in → real mint → node 3 → agent → sentinel echoed →
      detach/replay → revoke in < 5 s, all in Playwright;
    - `the exempt test account` proves the **refusal** (mint `{ok:false, reason:"not-allowed"}`,
      `bridge-ide-token.mjs:65-71`).
  - **Stage 1:**
    - dylan becomes explicit roster entry B. It is exempt, so it can only ever be an explicit
      allowlist entry (exempt ruling E5).
    - T-N1 is re-run with the two real accounts and two agents on **two different machines**.

## Risk scores

| Axis | Harness (now) | Stage 0 (operator, real account) | Stage 1 (≤ 5 named, Funnel) |
|---|---|---|---|
| Blast radius | 2: containers on the daemon that also runs the live stack | 3: a shell on the seat via a stolen operator session over the tailnet | 4: five users' machines and their plaintext keystrokes; **5 if any agent is on the seat** |
| Reversibility | 1: delete containers and dirs | 2 | 4: the agent binary, once published and downloaded, is a one-way door (O4) |
| Cost on failure | 2: a disturbed live stack (other sessions are restoring it) | 3 | 4: typed passwords seen, shells on users' boxes |
| Confidence | 2 | **4**: U9 sign-in down; B1, B3, B4, B9, B12 contradict the contract | **5**: U1–U3, U11, U13, O1 unmeasured; O8 needs grobase OTP (down); rootful branch unmeasured; no non-seat Linux machine named |

**Worst axis: confidence.** The protocol is sound. What it rests on (where the mint lives, what backs up
the registry, how a seat agent reaches node 3) was assumed, and five of those assumptions measure false.

## Conditions

### H: the protocol harness. May run now, without sign-in.

- **C-H1. The live stack is not touched.**
  - The relay and the agents run as plain `node` processes from a **worktree** of osionos develop. Not
    the shared checkout (user memory `concurrent-sessions-share-checkout`).
  - No compose, no image build, no network created.
  - The only docker objects are the agents' containers: named `osio-agent-*`, labelled
    `io.osionos.agent=<id>` and `osio.test.run=<run>`.
  - **TEST:** run `docker inspect -f '{{.Name}} {{.State.StartedAt}}' $(docker ps -q)` before and after.
    The diff shows only the test's names. After teardown,
    `docker ps -aq --filter label=osio.test.run=<run> | wc -l` = 0 and `docker volume ls -q | wc -l`
    is unchanged.
- **C-H2. Loopback only, and no tailnet change.**
  - The relay binds 127.0.0.1 on a port that is not 4110 or 8447.
  - **TEST:** `ss -ltnpH | grep node` lists only `127.0.0.1:<port>`. The sha256 of `tailscale serve
    status` and of `funnel status` is identical before and after.
- **C-H3. An ephemeral secret and synthetic subjects.**
  - The secret is `openssl rand -base64 48` into a 0600 scratchpad file, never written to any `.env`.
  - The harness refuses to start if `OSIONOS_IDE_TOKEN_SECRET` is inherited from the environment.
  - Subjects A and B are fresh `uuidgen -r` values.
  - **TEST:** `stat -c %a` = 600. An in-shell `grep -rqF` of the value across
    `/goinfre/dlesieur/groot/.env*` and the worktree finds nothing; the value is never printed. The
    file is gone after teardown.
- **C-H4. Production verifiers, with negative controls run alongside.**
  - Tokens are minted with `signIdeToken` (W `ide-token.mjs:100`).
  - The relay uses `verifyIdeToken`/`ideTokenSecret` (`:114,:91`), `assertIdeSubject`
    (`ide-access.mjs:43`) and `requireSandboxIdentity` (`ide-sandbox-spec.mjs:38-45`).
  - **TEST:** `grep -c createHmac scripts/ide-relay*.mjs` = 0. In the same run:
    - a token signed by another secret → 401;
    - a valid token for an unlisted UUID → 403;
    - a token for ws1 with `workspaceId=ws2` → 403.
- **C-H5. T-N1 with two real agents, proven from B's side, and shown not to be vacuous.**
  - Setup:
    - Two `osio-agent` processes, each with its own `XDG_CONFIG_HOME` and `XDG_RUNTIME_DIR`. The pid
      file (§7.3) and the config dir (§7.4) would otherwise collide.
    - Each gets an explicit `DOCKER_HOST=unix:///run/user/101889/docker.sock`. Overriding
      `XDG_RUNTIME_DIR` otherwise breaks §7.1's socket discovery.
    - Both are paired through the real claim/confirm/accept flow.
  - Positive control first: A's token reaches A's agent and echoes a random sentinel.
  - Then A's token is used against B:
    - pty `agent=<B>`;
    - `DELETE /api/ide/agents/<B>`;
    - `DELETE /api/ide/session?agent=<B>`.
  - **TEST:**
    - Each attempt gets the same 4004/404 as an unknown id.
    - B's agent reports an OPEN count of 0.
    - `docker events --since t0 --until t1 --filter label=io.osionos.agent=<B> --filter
      event=exec_create` prints 0 lines.
    - B's registry record has the same sha256 before and after.
    - **A mutant relay that resolves through a global id map makes this test FAIL.** Record the
      failing assertion.
- **C-H6. A cross-account confirm is declined locally.**
  - A confirms B's pending code. B's agent, run with `--accept-account <B subj>`, declines.
  - **TEST:** `pair_accept status:declined` is written, and the registry count is unchanged.
- **C-H7. The deny list holds on every relay route in allowlist mode (B3).**
  - **TEST:** with A in both lists, A is refused on pty, claim, confirm and session, and A's agent
    gets AUTH 4003.
- **C-H8. Signatures bind the agent's configured origin.**
  - The agent signs the relay origin from its own `agent.json`, never `CHALLENGE.origin`.
  - **TEST:** a stub relay sends a mismatched `origin`. The agent closes the link and sends zero AUTH
    frames.
- **C-H9. The rest of §11.4.**
  - T-N2…T-N19 and T-P1…T-P6 run under `node --test`.
  - T-N7 uses a raw `http.request` upgrade or Playwright, not Node's WebSocket (B10).
  - T-P7 runs on the seat's rootless daemon. The rootful run is SKIP, stated as such, unless a
    `docker:dind` daemon is used.
  - **TEST:** paste the runner's pass/fail/skip line. A SKIP is reported as a SKIP.
- **C-H10. No pull from Hub.**
  - Use a local image pinned by digest (`node:22-bookworm-slim` d0a16be756b6, B14).
  - **TEST:** `docker events --filter event=pull` shows 0 events during the run.
- **C-H11. Revoke and stop are measured.**
  - **TEST:** T-N2 revoke-to-drop stays under 5000 ms and the number is recorded. `osio-agent stop`
    leaves the container stopped.
- **C-H12. Workspace on `/goinfre`, never `$HOME`** (664M free, B13).
  - **TEST:** `docker inspect` Binds is exactly one entry, `/goinfre/dlesieur/osio-byo-test-<run>/…:/workspace`.
- **C-H13. Honest label.**
  - The report says "protocol harness" and names what it did not prove (the Q2 list above).

### S: stage 0, the operator with a real account. After sign-in returns.

All of H, plus:

- **C-S1. Sign-in works (U9).**
  - grobase is restored on a disk that is not `/sgoinfre`.
  - **TEST:** `the operator account` signs in and receives an `osionos_v1` session.
- **C-S2. A separate minting bridge and app (B1).**
  - The stage-0 secret goes on a second bridge in its own compose project, with no Funnel target.
  - The app image carrying `VITE_OSIONOS_IDE_URL` (the node 3 origin) is a separate, non-public build.
  - **TEST:** with the pair running, `public-funnel.sh verify` is green (`BRIDGE_MUST_BE_EMPTY` still
    lists the secret, `public-verify.sh:26`), and `funnel status` on every node lists none of the
    stage-0 ports.
- **C-S3. The revocation order holds (B12).**
  - Either the REV ruling's O2–O4 have run on prod, or the stage-0 bridge runs
    `OSIONOS_SESSION_CUTOFFS=off`, recorded as a stage-0 residual.
  - groot's osionos gitlink is not bumped (§11.2) before that.
  - **TEST:** the stage-0 bridge's mint answers 200 `ok:true` for the operator, and `git ls-tree HEAD
    apps/osionos/app` is unchanged until the REV order is met.
- **C-S4. Node 3 has a persistent `--statedir` and uses `serve`, never `funnel`.**
  - **TEST:** on node 3, `funnel status` shows no funnel, and `serve status` shows exactly
    `443 → 127.0.0.1:8447`.
- **C-S5. The agent's path to node 3 is bounded (B9).**
  - Either the agent runs on a tun-mode tailnet machine, or its proxy path is bounded.
  - **TEST:**
    - against an accept-and-drop proxy sink, the agent makes ≤ 10 CONNECTs in 60 s;
    - a real handshake through `localhost:1055` reaches node 3.
- **C-S6. The allowlist on the bridge and the relay is the operator's `sub`, pasted by the owner.**
  - **TEST:** `the exempt test account` gets `{ok:false, reason:"not-allowed"}` at the mint, and nothing else.
- **C-S7. The seat agent runs in the foreground only.**
  - No unit and no autostart. The workspace is on `/goinfre`. The agent is unpaired at the end of
    every session.
  - **TEST:** `systemctl --user list-unit-files | grep -c osio` = 0, and the registry holds 0 records
    after the session.
- **C-S8. Node 3 is reachable only from the operator's devices (tailnet ACL).**
  - **TEST:** from another tailnet node, `curl https://<node3>/healthz` fails.
- **C-S9. The real e2e passes in Playwright.**
  - The run covers: sign-in → Terminal → pair (a real agent prints the code) → confirm → shell →
    sentinel → detach/replay → revoke in < 5 s.
  - **TEST:** the relay's stdout contains the sentinel 0 times (INV-5). The spec file and the artifact
    are committed.
- **C-S10. The registry is never backed up (B4).**
  - It is excluded from `vault42 volumes` capture, or it lives outside docker volumes and outside the
    secrets target's patterns.
  - **TEST:** `vault42 volumes list` does not show it.
- **C-S11. The kill-switch drill completes in ≤ 60 s** (S6 carried).
- **C-S12. The records exist.**
  - ADR **0026** (not 0023, B11) holds D1–D6 as amended here and this verdict's conditions in
    Consequences.
  - ADR 0022 gets an amendment line.

### P: stage 1, the first non-operator agent or any Funnel exposure. BLOCKED until every item holds.

- **C-P1.** Every S condition is met and its artifact is recorded.
- **C-P2. No agent on the seat**, or on any host whose uid owns the prod VM or a prod credential (B7).
  - **TEST:** no registry `fp` equals the seat agent's, and `osio-agent status` on the seat says "not
    paired".
- **C-P3. The N1' checks land first.**
  - The §9.3 checks and the T-N20 mutants are merged and green *before* the public bridge receives the
    secret.
- **C-P4. The Funnel facts are measured through node 3** (O1, U1, U2, U3, U11), and the numbers
  replace the guesses in §12.
- **C-P5. U13 is answered in writing:** 42's policy on relaying users' traffic through the seat.
- **C-P6. Distribution is decided and verified** (O3, O4, O5, O6).
  - **TEST:** `ssh-keygen -Y verify` passes on a clean machine.
  - The publish step is irreversible and is run by the owner.
- **C-P7. Step-up is live** (O8 / R9).
  - grobase OTP is down today. While it stays down, stage 1 does not open.
- **C-P8. O12 is done:** the AUP and the residual are dated and signed in ADR 0026.
  - The residual names: plaintext at the relay, the relay as the authority, device-code phishing, a
    bridge compromise reaching users' containers, and the registry lost on a wipe.
- **C-P9. The rootful branch is measured.**
  - **TEST:** T-P7 runs on a rootful daemon and is not a SKIP. `sudo -E osio-agent run` exits non-zero.
- **C-P10. T-N1 is repeated with real accounts.**
  - `the exempt test account` is the explicit roster entry B. The test uses two real accounts on two different
    machines, with B-side evidence as in C-H5.
- **C-P11. The relay is load-tested at 2× its caps** (R10-equivalent).
  - The artifact is recorded and RSS stays under 256 MiB.
- **C-P12. The roster is ≤ 5 pasted subjects, and the bridge and relay allowlists are equal.**

## Owner decisions by stage (Q5)

| Before | Decisions |
|---|---|
| The harness (now) | **O9**: a seeded loop under `node:test` (rung 2) is enough. `fast-check` is rung 6 and is not needed. **O10**: the hashed `subj` default is acceptable. **O11**: accept 12 h or set another value. The harness takes no other decision; its image is local (C-H10). |
| Stage 0 | **O7**: the path, the app origin, and the agent machine (C-S5). The **`OSIONOS_SESSION_CUTOFFS`** choice (C-S3). Confirm O10 and O11. |
| Stage 1 | **O1, O3, O4, O5, O6, O8, O12**, plus a new **O13**: which Linux machine, other than the seat, runs the first real agent. |
| Phase 1b only | O2. |

## Records owed

None were written by this session: the checkout is shared, and other sessions are restoring the stack.

- **ADR 0026** (the contract's "0023", renumbered, B11), written in a worktree when the work lands.
  - Context: B1–B15.
  - Consequences: this verdict, C-H/C-S/C-P, and the stage-1 residual for signature.
- **`.out-of-scope/ide-on-the-seat-rootless-docker.md`**: add one "Prior requests" line: "2026-10-19:
  BYO agent on the seat from stage 1, refused (C-P2)." The reopen fact is unchanged.

## Verdict

**PROCEED-WITH-CONDITIONS.** The protocol harness may run now under C-H1–C-H13. Stage 0 is allowed
after C-S1–C-S12. **Stage 1 stays BLOCKED until C-P1–C-P12.** The design is sound, but its stage-0 mint
has no home that keeps N1, and the seat must never host an agent once Funnel is open.
