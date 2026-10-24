# F-3c — one GoTrue admin read: identities and sudo use `readGotrueUser`

**Repo/branch:** app = `/home/dlesieur/Documents/groot-wt/integration/app` on `feat/account-platform` (worker branch `feat/acct-F-3c`). A refactor of two 👹 files (sudo, identities). Every status and code a caller sees stays the same, except the one change named below. Library-first follow-up recorded by F-3 (LEDGER row F-3c). Facts from a fresh read on 2026-10-24.

## Why (verified anchors)

There are three copies of `GET {baasUrl}/auth/v1/admin/users/{id}` with the service key:
1. `readGotrueUser` (`scripts/bridge-gotrue-user.mjs:31-48`). It has an 8 s timeout. Any failure throws a 503 `gotrue_read_failed` error that carries `upstreamStatus` (`null` for a throw, a timeout or an unconfigured plane). Headers come from `gotrueAdminHeaders` (`:25-27`).
2. `readIdentities` (`scripts/bridge-account-identities.mjs:48-62`). It has its own fetch with the same headers and an 8 s timeout (`:32`). Any failure answers 503 `account_plane_unavailable`.
3. `accountAddress` (`scripts/bridge-account-sudo.mjs:140-151`). It goes through `grobase()` (`:128-137`, 8 s `OTP_TIMEOUT_MS`).
   - An upstream 404 answers 409 `no_email`.
   - Any other non-2xx answers 503 `sudo_unavailable`.
   - An unparseable 2xx body counts as no address, so it answers 409 `no_email`.
   - Its callers are the sudo routes in the same file and `bridge-account-password.mjs:146`.

## Contract

- `readIdentities` calls `readGotrueUser({ config, fetchImpl }, userId)`. Any error it throws becomes 503 `account_plane_unavailable` with the same message as today. The projection (`projectIdentity`) does not change.
- `accountAddress` calls `readGotrueUser`. A `gotrue_read_failed` error with `upstreamStatus === 404` becomes 409 `no_email`. Every other error becomes 503 `sudo_unavailable`. The address checks (trim, lowercase, `ADDRESS_SHAPE`) do not change.
- **One accepted change:** an upstream 2xx whose body is not JSON now answers 503 `sudo_unavailable` instead of 409 `no_email`. The address was not read, and an outage is the honest answer. Put a one-line note in the commit body.
- `grobase()` stays: the OTP request still uses it. Delete only the code the move makes dead.
- No new export. `gotrueAdminHeaders` is used only if a caller still needs headers; after the move, neither caller does.

## OWNS

- `scripts/bridge-account-identities.mjs` and `scripts/bridge-account-sudo.mjs`: only the two functions above and their imports.
- `tests/bridge/bridge-account-identities.test.mjs`: extend only if an assertion below is missing.
- The bridge test file that covers sudo's `accountAddress`. Find it with `rg -l "no_email|sudo_unavailable" tests/bridge`, and extend only that file.
- `docs/account-platform/LEDGER.md`: the F-3c row.

## MUST NOT TOUCH

`bridge-gotrue-user.mjs` (its contract is F-3's), `bridge-account-password.mjs`, any route logic outside the two functions, `deploy/bridge-fly/Dockerfile` (no new module), `src/**`.

## Tests

Before editing, run the two test files once with the one-file command and record their counts.

Every one of these must hold after the change. Add each assertion that does not exist yet:
- I1: identities, upstream 500 → 503 `account_plane_unavailable`.
- I2: identities, fetch throws → 503 `account_plane_unavailable`.
- I3: identities, no service key → 503 `account_plane_unavailable`, and no fetch is made.
- S1: sudo, upstream 404 → 409 `no_email`.
- S2: sudo, upstream 500 → 503 `sudo_unavailable`.
- S3: sudo, fetch throws → 503 `sudo_unavailable`.
- S4: sudo, a 2xx with an empty or malformed `email` → 409 `no_email`.
- S5: sudo, a 2xx that is not JSON → 503 `sudo_unavailable`. This is the accepted change; it fails red on today's code, so record that red run.
- H1: both callers send the request to `/auth/v1/admin/users/<encoded id>` with `apikey` and `Authorization: Bearer <service key>`. Assert this through the fake fetch.

## Mutants (after the commit)

| # | Mutant | Must fail |
|---|---|---|
| 1 | `accountAddress` maps every `gotrue_read_failed` to 409 | S2 or S3 |
| 2 | `accountAddress` maps nothing to 409 | S1 |
| 3 | `readIdentities` passes the raw `gotrue_read_failed` code through | I1 |
| 4 | `readGotrueUser` drops `encodeURIComponent` | H1 |

## Gates

- The one-file runs of both test files, plus every bridge test file that imports either module: `grep -l "bridge-account-sudo.mjs\|bridge-account-identities.mjs" tests/bridge/*.test.mjs`.
- `test:quality`.
- I run the full bridge suite on integration after the merge.

## Commit message

`refactor(account): identities and sudo read the GoTrue user through readGotrueUser — library-first`
