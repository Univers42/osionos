# Own machines: every user pairs their own machine, one click opens it (Phase 1, completed)

Owner's rule, 2026-10-31: every user connects their own system, the way VS Code does. We never host
an OS. The bridge only brokers identity, pairing and presence. Files and the terminal stay between
the user's browser and the user's machine.

## What exists (measured 2026-10-31)

- `/machine?node=<id>&folder=<abs>` opens the IDE origin (osionos-node, `http://127.0.0.1:4100`) as
  its own window.
- The live web app and the desktop app both edit, save and run a terminal there (C23 met).
- **Owner only.** The node verifies `osionos_ide1` tokens with the bridge's shared IDE secret and one
  fixed owner id (`packages/osionos-node/cli.mjs:58`). Handing that secret to anyone else would let
  them forge tokens for every user.
- The app's own Terminal still opens the hosted sandbox (`src/features/ide/model/useIdeTerminal.ts:90`).
- The IDE page has no file tree.

## Design

### 1. Machine identity (osionos-node)

`osionos-node pair --bridge <url> --name <name>`:
- generates an Ed25519 key pair with `generateAgentKeyPair` from `scripts/ide-agent-frames.mjs`;
- stores `~/.osionos/machine.json` (mode 0600) holding `machineId`, `ownerId`, the private key,
  `bridgeUrl` and `bridgeKey` (the bridge's machine-signing public key, pinned at pairing).

`osionos-node serve` then needs no secret and no owner flag: both come from `machine.json`.

### 2. Pairing (device code, like `gh auth login`)

1. **The node starts it.** `POST /api/machines/pair/start` (no session) with
   `{pubkey, name, platform, version, ts, sig}`.
   - `sig` signs `osionos-machine-pair\n<bridge origin>\n<pubkey>\n<ts>`.
   - Rate-limited per IP and globally (`createSlidingLimiter`).
   - Answers `{pairId, code}`, with an 8-letter code from the relay's alphabet, valid 300 s.
2. **The node prints:** `Open <app>/machines and enter BCDF-GHJK. Fingerprint XXXX-XXXX-XXXX-XXXX.`
3. **The user enters the code** in the app (session + sudo step-up):
   - `POST /api/machines/pair/claim {code}` answers the name, platform and fingerprint;
   - the user confirms the fingerprint matches what the machine printed;
   - `POST /api/machines/pair/approve {pairId}` writes the row.
   - Limits: failures per user, at most 5 machines per user.
4. **The node polls** `POST /api/machines/pair/poll {pairId, ts, sig}` until approved. It gets
   `{machineId, ownerId, bridgeKey}` once; the pending entry is then dropped.

### 3. Tokens for a machine

- **Mint:** `POST /api/machines/:id/token` (session + sudo, for the row's owner only) returns
  `osionos_mc1.<payload>.<sig>`.
  - The payload is `{sub, machine, exp ≤ 900 s, iat, jti}`.
  - It is signed Ed25519 with the bridge key `OSIONOS_MACHINE_SIGNING_KEY` (a new secret, a 32-byte
    seed).
- **Verify (node):** offline, with the pinned `bridgeKey`. `sub` must be the paired owner and
  `machine` its own id. It then mints its own cookie cap, as today (C6 as amended).
- **Shared secret gone:** a machine can only verify, never mint, so no machine can forge a token for
  anyone, itself included.
- **Kept for now:** the `osionos_ide1` node scope stays for the laptop already set up, until it is
  re-paired. It is then removed.

### 4. Presence

- **Heartbeat:** every 30 s the node sends `POST /api/machines/heartbeat {machineId, ideOrigin, ts, sig}`.
  - `ideOrigin` must be `http://127.0.0.0/8:<port>`, the only kind the desktop guard and C6 allow.
  - The bridge keeps it in kv with a 90 s TTL. No path and no file name ever reach the bridge.
- **List:** `GET /api/machines` (session) answers `[{id, name, platform, fingerprint, isDefault, online, ideOrigin, lastSeenAt}]`.
- **Default:** `PUT /api/machines/:id/default` (session).
- **Remove:** `DELETE /api/machines/:id` (session + sudo) revokes the row.
  - The node learns it from its next heartbeat (410) and wipes `machine.json`.
  - Tokens already minted live at most 900 s. The node also re-checks revocation on each heartbeat.

### 5. Storage

- **Table:** groot `models/osionos-machines-migration.sql` creates `public.osionos_machines`.
  - Columns: `id` (machine id, `NODE_ID` shape), `user_id`, `name`, `platform`, `pubkey`, `fingerprint`,
    `is_default`, `created_at`, `revoked_at`.
  - The service role writes. The account role reads only its own rows, under RLS, with column grants
    (the PAT model).
- **Erasure:** the account erasure migration deletes these rows.
- **Not stored:** pending pairings live in memory, presence in kv.

### 6. App

- **Settings → Machines:**
  - lists the user's machines with online state;
  - "Add a machine" shows the install and pair commands, then a code box with a fingerprint confirm;
  - set default, remove.
- **Terminal, "Open on my machine" and `/machine` without `node=`** open the user's default online
  machine:
  - the window opens on the machine's `ideOrigin` (from the list, not baked at build time);
  - it opens the user's home folder, which the node picks: the app sends no path.
  - With no online machine, a panel says how to start or pair one. The hosted sandbox is not a
    fallback.

### 7. IDE page

- A file tree beside the editor, built from VS Code's own `IFileService`: lazy folders, open on click,
  dot-folders shown.
- Every file opens in the editor with VS Code's language for its extension. That works today.

## Out of scope

- Machines on another network: SSH is Phase 3 and the tunnel is Phase 6. The heartbeat refuses a
  non-loopback `ideOrigin` until those land.
- Sharing a machine between users.

## Tests (RED first)

- **Node:**
  - `pair` writes 0600 `machine.json`;
  - the `osionos_mc1` verify refuses another sub, another machine, an expired token, a bad signature
    and a foreign bridge key;
  - the heartbeat signs, and a 410 wipes `machine.json`.
- **Bridge:**
  - start: rate limits, a bad sig is refused;
  - claim: the wrong code is counted and capped;
  - approve: only the claimer, 5-machine cap;
  - poll: once only;
  - token mint: owner only, sudo needed, a revoked machine is refused;
  - heartbeat: a bad sig and a non-loopback origin are refused;
  - list: only my rows;
  - delete: needs sudo.
- **SQL:** grants and RLS checks in groot `scripts/verify/models-grants`.
- **App:**
  - the machines list and pairing UI (canvas tests);
  - the terminal opens the default machine.
- **End to end:**
  - pair this laptop with the real CLI, open from the Terminal button, open a file from the tree,
    edit, save, terminal, on web and desktop;
  - a second account cannot list, mint for or open the owner's machine.

## Devil verdict 2026-10-31

**PROCEED-WITH-CONDITIONS.** Strongest case: only the bridge can sign, a machine can only verify, so
the shared-secret forgery (`cli.mjs:56-58`) disappears. Pairing reuses the relay code
(`ide-relay-pairing.mjs`). Phase 1 loopback-only `ideOrigin` caps the phishing blast radius: a
victim's browser can only reach its own 127.0.0.1. Worst axis: confidence. The browser has no proof
that the node on its loopback is the machine the list names.

1. **C21 is amended, not bypassed.** New text: "BLOCKED for any machine the viewer does not own. A
   machine whose row `user_id` = token `sub` = node `ownerId` is allowed." C5/C6/C7 apply per machine.
   TEST: a second account gets `not-allowed` on mint, list and open.
2. **Token.** Use a domain-separated prefix, a `kid`, `crypto.verify(null, …)` against the pinned set,
   and `aud` = the node's configured `ideOrigin`. `jti` is single-use at the node. Cap exp ≤ token
   exp (already `ide-origin.mjs:99`). One TEST per refusal.
3. **Rotation.** `machine.json` pins keys by `kid`. The heartbeat reply carries the next key, signed
   by the current one. Overlap ≥ 1800 s. If the key leaks, everyone re-pairs (documented). Boot fails
   on a missing or non-32-byte seed. TEST: rotate without re-pairing.
4. **Phishing / code hijack.** Poll returns the account email. The node writes `machine.json` only
   after a local `y` or `--accept-account` (the C-H6 analogue). Approve shows the start IP vs. the
   approver's, and the warning text is snapshot-tested. A new machine is never auto-default. The code
   is consumed on first claim. Claim failures are capped per user AND globally, because many accounts
   can brute-force together. This condition is mandatory before Phase 3/6 lift loopback.
5. **Local identity.** Before it posts a token, the app sends a nonce. The node at `ideOrigin` must
   answer `{machineId, sig}` with its machine key, or no token is sent. This covers a machine that is
   online elsewhere while a different process sits on this loopback port. TEST: two machines both
   claim `:4100`.
6. **Heartbeat.** The sig covers the bridge origin, `machineId`, `ideOrigin` and `ts`. `ts` must be
   within ±60 s and strictly greater than the last one (kv). `ideOrigin` is parsed with `URL`: http,
   a 127.0.0.0/8 literal, port 1024–65535, no path or userinfo. The app re-validates it before
   `window.open`. Unknown and revoked ids get the same answer.
7. **Revocation.** Mint reads `revoked_at` from Postgres, not a cache. On a 410 the node closes live
   sockets. The stated worst case is 900 s while the bridge is unreachable. TEST: a delete closes the
   open terminal within one heartbeat.
8. **IDs.** The bridge generates a random machine id. `NODE_ID` (`ide-token.mjs:35`) admits
   `laptop` for every user, so two users would collide. Tests for RLS, grants and erasure.
9. **Funnel residual.** Behind Funnel the start limit is one global key
   (`ide-relay-pairing.mjs:9,51`), so one client can stall pairing for all users. Name it in the
   residuals.
10. **`osionos_ide1` retirement** gets a linked issue. After the re-pair, the node refuses
    `OSIONOS_IDE_TOKEN_SECRET`.

Record: groot ADR 0037.

## API contract (binding for the node, the bridge, the app and the migration)

Shared code: `scripts/ide-machine-protocol.mjs`. It holds the token, the messages, `isLoopbackIdeOrigin` and
`newMachineId`. Ed25519 helpers come from `scripts/ide-agent-frames.mjs` (`signMessage`,
`verifyMessage`, `fingerprint`, `generateAgentKeyPair`, `rawPublicKey`). `origin` in every signed
message is the bridge's public origin (`config.publicOrigin`, e.g. `https://baas.tail10f2ea.ts.net:10000`).

**Bridge config.**
- `OSIONOS_MACHINE_SIGNING_KEY` is the current 32-byte seed. Optional
  `OSIONOS_MACHINE_SIGNING_KEY_NEXT` is the next one (rotation).
- No current key means the routes answer 503 `machines_unavailable`; there is no partial boot.
- Rotation, in order: set `_NEXT` and deploy; wait at least 1800 s, so every online node has beaten
  and pinned the next key (it writes it to `machine.json`); move `_NEXT` into the current key, drop
  the old one, deploy. On its next beat a node drops the kid the bridge no longer lists. A node that
  was offline for the whole overlap only holds the old kid, cannot verify new tokens, and re-pairs.
- A reply that lists none of the node's pinned kids changes nothing on the node, so a wrong or
  impostor bridge cannot empty the pinned set.

**Routes.** All bodies are JSON and every error is `{ ok:false, code, message }`. `S` = app session
(`osionos_v1`); `S+sudo` = session plus a live step-up grant (`requireSudo`, scripts/bridge-guard.mjs).

| Route | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/machines/pair/start` | none (sig) | `{pubkey,name,platform,version,ts,sig}`; sig = `pairStartMessage` | 200 `{pairId, code:"BCDF-GHJK", expiresIn:300, interval:5}` | 400 `bad_request`, 401 `bad_signature`, 429 `rate_limited` |
| `POST /api/machines/pair/claim` | S+sudo | `{code}` | 200 `{pairId,name,platform,fingerprint,startIp,yourIp}`. The code is consumed on the first claim. | 404 `not_found` (unknown, used or expired: same body), 429 |
| `POST /api/machines/pair/approve` | S+sudo, the claimer | `{pairId}` | 201 `{id}`. `is_default` = false. | 404, 409 `machine_cap` (5) |
| `POST /api/machines/pair/decline` | S, the claimer | `{pairId}` | 204 | 404 |
| `POST /api/machines/pair/poll` | none (sig) | `{pairId,ts,sig}`; sig = `pairPollMessage` with the start key | 202 `{status:"pending"}`, or 200 once `{machineId, ownerId, accountEmail, bridgeKeys:[{kid,publicKey}]}`, then the entry is gone | 401, 404 `not_found`, 410 `declined` |
| `POST /api/machines/heartbeat` | none (sig) | `{machineId,ideOrigin,ts,sig}`; sig = `heartbeatMessage`; \|ts−now\| ≤ 60 s and ts > last ts | 200 `{bridgeKeys:[{kid,publicKey,sig?}]}`. A next key carries `sig` = current key over `nextKeyMessage`. | 400 `stale`, 401, 410 `gone` (unknown and revoked look the same), 429 `rate_limited` (20 a minute per client address, before any query) |
| `GET /api/machines` | S | — | 200 `{machines:[{id,name,platform,fingerprint,isDefault,online,ideOrigin,lastSeenAt}]}`. `ideOrigin` is null when offline. | 401 |
| `PUT /api/machines/:id/default` | S | — | 204 | 404 |
| `DELETE /api/machines/:id` | S+sudo | — | 204 (sets `revoked_at`, drops presence) | 404 |
| `POST /api/machines/:id/identity` | S | `{nonce,sig}`; sig = `whoamiMessage` with the row's pubkey and the presence `ideOrigin` | 200 `{ok:true}` | 404, 409 `offline`, 422 `identity_mismatch` |
| `POST /api/machines/:id/token` | S+sudo | — | 200 `{token, exp}`. aud = presence `ideOrigin`. `revoked_at` is read from Postgres. Needs a successful `identity` call for the same origin in the last 60 s; one check buys one mint. | 404, 409 `offline`, 403 `not_allowed`, 428 `identity_required` |

- **Presence** lives in kv `machine-presence:<id>` = `{ideOrigin, ts, lastSeenAt}`, with a 90 s TTL.
- **Pending pairings** live in memory and expire after 300 s.
- **Rate limits** use `createSlidingLimiter`:
  - start: per IP and global;
  - claim failures: per user and global.

**Table** (groot `models/osionos-machines-migration.sql`): `public.osionos_machines`.

| Column | Definition |
|---|---|
| `id` | `text` primary key, `^m-[a-z2-7]{16}$` |
| `user_id` | `uuid` not null, references `auth.users` on delete cascade |
| `name` | `text` 1–64 chars |
| `platform` | `text` |
| `pubkey` | `text`, 43 base64url chars |
| `fingerprint` | `text` |
| `is_default` | `boolean` default false; at most one true per user (partial unique index) |
| `created_at` | `timestamptz` |
| `revoked_at` | `timestamptz` null |

- `service_role` has every right.
- `osionos_account_user` may SELECT `id, name, platform, fingerprint, is_default, created_at, revoked_at`
  on its own rows (RLS `user_id = auth.uid()`). It has no `pubkey` and no write.
- Erasure deletes the rows.

**Node** (`packages/osionos-node`):
- `cli.mjs pair --bridge <url> --name <n> [--accept-account <email>]`:
  - writes `~/.osionos/machine.json` (0600): `{machineId, ownerId, accountEmail, bridgeUrl,
    bridgeKeys:{kid:publicKey}, privateKey (pkcs8 b64url)}`;
  - writes it only after a typed `y`, or when `--accept-account` equals the returned email.
- `serve` with `machine.json` present:
  - node id = `machineId`; owner = `ownerId`;
  - accepts `osionos_mc1` at `POST /api/node/session` (aud = its ideOrigin, jti single-use);
  - refuses to start if `OSIONOS_IDE_TOKEN_SECRET` is also set (condition 10);
  - heartbeats every 30 s;
  - on a 410 it closes every socket, removes `machine.json` and stops.
- **`POST /api/machine/whoami {nonce}`**: same-origin only. It answers `{machineId, sig}` signed over
  `whoamiMessage`.
- **`GET /api/machine/home`**: needs the node cookie. It answers `{folder: os.homedir()}`.
