# F-3b2g: make-primary also ends the user's GoTrue sessions (r2)

r2 folds in the devil spec review D-F-3b2gs (PROCEED-WITH-CONDITIONS, conditions C1-C10, in
`target/review/D-F-3b2gs/VERDICT.md`). Each condition is cited where it lands.

## Why (verified anchors and measurements)

- F-3b2 (merged 73db2c037) ends the other **bridge** sessions after a primary-address change:
  `finish` in `scripts/bridge-account-email-primary.mjs:127-138` calls
  `endOtherSignIns(ctx, session, response, 'logout_all')` (`scripts/bridge-account-password.mjs:110`).
- GoTrue sessions survive the admin email PUT. Probe 2026-10-24
  (`groot-wt/deploy/probe/gotrue-email-change.mjs`): after the PUT, the old access token's getUser
  returns 200 and the old refresh token returns 200.
- The website re-mints a bridge session from any GoTrue access token that `getUser()` accepts:
  `handleOsionosSession` in `opposite-osiris/scripts/auth-gateway.mjs`. It has no issued-at check,
  and the browser keeps its GoTrue session through the `POST /api/auth/refresh` cookie.
  - The anchor was read in the main checkout `apps/opposite-osiris` and in
    `groot-wt/ref/prismatica/scripts/auth-gateway.mjs:936,950-1013`.
  - The submodule is not populated in root-integration, so the pinned SHA could not be read
    (D-F-3b2gs).
  - Result: a device that held a website session before make-primary can open osionos again
    afterwards.
- **The fix, measured on the live GoTrue** (probe `groot-wt/deploy/probe/gotrue-session-revoke.mjs`,
  throwaway user, logs `groot-wt/logs/probe-gotrue-session-revoke-*.log`, last run
  `...-1234c.log`, 2026-10-25):
  - `POST /auth/v1/admin/users/:id/logout` → 404. The route does not exist.
  - `POST /auth/v1/logout?scope=global` with `Authorization: Bearer <HS256 token signed with
    JWT_SECRET, claims {sub, role:'authenticated', aud:'authenticated', iat, exp:iat+60}, no
    session_id>` → 204. `apikey` can be the anon key or the service key.
  - After it: the old refresh token → 400, and the old ACCESS token's `GET /auth/v1/user` → 403
    `session_not_found` (C1). Password sign-in still → 200.
  - Since the website handoff calls `getUser()`, the re-entry is **closed** at once, not narrowed
    to the 3600 s access-token TTL.
  - A `sub` that does not exist → 403 `user_not_found`.
- **Reusable pieces:**
  - `signRealtimeJwt(claims, secret)` at `scripts/bridge-realtime-socket.mjs:56`, already used by
    `mintAccountJwt` at `scripts/bridge-pg.mjs:56-65`.
  - `UUID_REGEX` at `scripts/bridge-social-core.mjs:39`. Use it (C6): `bridge-pg.mjs` does not
    export its pattern, and `isUuid` in the rows module would create an import cycle.
  - In `scripts/bridge-gotrue-user.mjs`: `gotrueAdminHeaders`, `TIMEOUT_MS` (8 s), and the error
    shapes with a `code`.
  - The make-primary `ctx` already carries `env` and `secret` (`String(env.JWT_SECRET).trim()`) at
    `scripts/bridge-account-emails.mjs:124-128`.

## Contract

1. **`endGotrueSessions(deps, userId)`**, exported from `scripts/bridge-gotrue-user.mjs`.
   `deps` is `{ config, fetchImpl, env }`.
   - **Before any fetch:**
     - `userId` must match `UUID_REGEX`.
     - `config.baasUrl`, `config.serviceKey` and a non-blank `env.JWT_SECRET` must be present.
     - Any check failing throws `{ status: 503, code: 'gotrue_signout_failed' }`. Nothing is ever
       skipped silently.
   - **Token:** minted with `signRealtimeJwt`. Claims are exactly `{ sub: userId.toLowerCase(),
     role: 'authenticated', aud: 'authenticated', iat, exp: iat + 60 }`, with no `session_id` and
     no `iss`. It is never logged, never returned, and never attached to an error.
   - **Request:** `POST ${config.baasUrl}/auth/v1/logout?scope=global`, headers
     `{ apikey: config.serviceKey, Authorization: 'Bearer ' + token }`, no body,
     `AbortSignal.timeout(TIMEOUT_MS)`.
   - **Outcomes:**
     - Any 2xx resolves.
     - 403 whose JSON `error_code` or `code` is `user_not_found` also resolves: there are no
       sessions to end.
     - Every other status, a network error or a timeout throws an error carrying ONLY `status: 503`,
       `code: 'gotrue_signout_failed'` and `upstreamStatus` (C2).
   - **JSDoc** (C8, C10), stated here and in the report:
     - Global scope also signs the CALLER out of the website. The osionos tab stays signed in,
       because its bridge session is kept, but the website asks for a new sign-in.
     - The 60 s token carries role `authenticated` and is sent only to `/auth/v1/logout`.
     - A `Caveat:` line: the call can take up to 8 s inside make-primary's 60 s kv lock.
2. **make-primary order** (C3). In `finish`, after the row removal and the audit:
   1. `endGotrueSessions(ctx, session.userId)` FIRST, then `endOtherSignIns(ctx, session, response,
      'logout_all')`.
   2. BOTH always run: a GoTrue failure does not skip the bridge sweep, and a bridge failure does
      not skip GoTrue.
   3. If either failed, answer 503 `email_changed_signout_failed`.
   4. The address HAS changed, so nothing is rolled back.
   - Why GoTrue first: a website session cannot mint a new bridge session after the GoTrue logout,
     so the sweep that follows catches every bridge session that exists.
3. **The failure sentence** (C4), server and client, the same words:
   - `scripts/bridge-account-email-primary.mjs:134`: "Your primary address HAS changed, but other
     devices could not be signed out. Change your password to sign them out."
   - `src/features/settings/profile/emailCopy.ts:39`: the same sentence. A password change ends
     every GoTrue session (measured 2026-10-24) and every other bridge session; the sessions list
     ends neither GoTrue session.
   - Keep the code `email_changed_signout_failed` and the "HAS changed" phrase: tests at
     `tests/canvas/account-emails-primary.test.ts:116` and
     `tests/bridge/bridge-account-email-primary.test.mjs:81-85` match it.
4. Nothing else changes:
   - not the password change;
   - not `/api/auth/bridge/logout` (`bridge-api.mjs:4738`). That is out of scope: it is the
     osionos log-out, and a global GoTrue sign-out there would end the user's website session on
     every device. Ledger row F-3b-logout-gotrue;
   - not the session list.

## OWNS

- `scripts/bridge-gotrue-user.mjs`: the new export and its JSDoc.
- `scripts/bridge-account-email-primary.mjs`: `finish` and the sentence.
- `src/features/settings/profile/emailCopy.ts`: the one sentence at line 39.
- `tests/bridge/bridge-gotrue-user.test.mjs` and `tests/bridge/bridge-account-email-primary.test.mjs`.
- `tests/bridge/support/email-world.mjs` (C5). It routes unknown paths to the user lookup
  (`email-world.mjs:119-120,168-181`), so without a route every existing make-primary test turns
  503. Add `POST /auth/v1/logout`:
  - it answers 204 by default;
  - it records each call (URL, headers) on `world.gotrueLogouts`;
  - it pushes `'gotrue_logout'` to `world.events`;
  - it is switchable to fail (a status, or a rejection) the way the world's other routes are.
- `tests/canvas/account-emails-primary.test.ts`, only if the new sentence needs an assertion.

## MUST NOT TOUCH

- `scripts/bridge-pg.mjs`: the account plane's role boundary.
- `scripts/bridge-realtime-socket.mjs`: import from it only.
- `scripts/bridge-account-password.mjs`, `scripts/bridge-sessions.mjs`, `scripts/bridge-api.mjs`,
  `scripts/bridge-account-emails.mjs` (the ctx already has `env`).
- Every other `src/**` file, `deploy/**`, `.env*`, vendored trees and `packages/**`.

## Tests to add (node:test, the existing bridge style)

The `G1`–`G4` names are taken in `bridge-gotrue-user.test.mjs:22,37,43,51`, so the new tests are
`L1`–`L6` (C9).

`bridge-gotrue-user.test.mjs`:
- **L1. The request:** the URL equals EXACTLY `${baasUrl}/auth/v1/logout?scope=global`, so the
  `scope=others` mutant fails. Also: POST, `apikey` equal to the service key, and no body. The
  Bearer token has header alg HS256, its signature verifies with the test secret, and its claims
  are exactly `sub` (lowercased), `role`, `aud`, `iat` and `exp`, with `exp - iat === 60` and no
  `session_id` and no `iss`.
- **L2.** 204 resolves; 200 resolves.
- **L3.** 403 with `{"error_code":"user_not_found"}` resolves, and so does 403 with
  `{"code":"user_not_found"}`. 403 with any other body throws `gotrue_signout_failed`.
- **L4.** 401, 500, a non-JSON 502, a network rejection and a timeout each throw
  `gotrue_signout_failed` carrying `upstreamStatus`.
- **L5.** A missing or blank `JWT_SECRET`, a missing `baasUrl` or `serviceKey`, and a non-UUID
  `userId` each throw before ANY fetch: the fetch spy is called 0 times.
- **L6** (C2). For each failing case of L4 and L5, neither the minted token nor the secret appears
  in `JSON.stringify(error)`, in `util.inspect(error, { depth: 5 })`, or in `error.message`.

`bridge-account-email-primary.test.mjs`:
- **P30.** On success, the GoTrue logout is called exactly once, for the caller's user id, BEFORE
  the bridge sweep. Assert the order on `world.events`.
- **P31.** The GoTrue logout fails:
  - the bridge sweep still runs;
  - the answer is 503 `email_changed_signout_failed` with the new sentence;
  - the row is removed, the audit row is written, and the GoTrue email is the new address.
- **P32.** The bridge sweep fails (the existing P17 setup): the GoTrue logout WAS called, and the
  answer is 503 `email_changed_signout_failed`.

## Mutants (each must turn at least one test red; report which)

- the call removed from `finish`;
- `scope=global` changed to `scope=others`;
- `exp: iat + 3600`;
- the `user_not_found` branch resolving every 403;
- the bridge sweep skipped when the GoTrue logout fails;
- the token attached to the thrown error (`Object.assign(error, { token })`).

## Gates

- `test:bridge`: the whole suite, 0 fail.
- `test:canvas`.
- `test:quality`.

After the merge, I re-run the probe on the stack the release ships to and log it (C7). That is my
step, not the worker's.

## Report

Commits (conventional message, no trailers, no push); each gate with its command and counts; each
mutant with the test that went red; any deviation from this spec with its reason.

## Commit message

`fix(account): make-primary also ends the user's GoTrue sessions`
