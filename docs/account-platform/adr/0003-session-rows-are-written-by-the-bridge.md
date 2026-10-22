# ADR 0003 — session rows are written by the bridge, revocations are polled

Status: accepted 2026-10-22 (devil verdict PROCEED-WITH-CONDITIONS on the P0-4 spec). Amends ADR 0001.

## Decision
`public.osionos_sessions` has exactly two writers, both in `scripts/bridge-sessions.mjs` and both
through the service role (`asService`):
1. the insert at handoff consumption — the moment a token reaches a client — with the row built
   only from the token being delivered (`jti`, `sub`, `iat_ms`, `exp`);
2. the revoke `PATCH`, filtered by `id` and by the caller's `user_id` taken from the verified
   session, never from the request.

Owners read their rows through `asUser` (ADR 0001). The role `osionos_account_user` never writes
its own session rows: P0-1 grants it SELECT on nine columns and nothing else. This is the one
account-plane table whose writes do not go through `asUser`; ADR 0001's "never fall back to the
service role" still holds for every other table.

Every bridge replica reloads the revoked, unexpired session ids every 10 s and checks them
synchronously in `verifyAppSessionToken`, right after the per-user cutoff (ADR 0025). A replica that
cannot load the set answers 503 rather than accept a revoked token. A revoke applies on its own
replica at once, from the rows the `PATCH` returned.

## What a revoke does not end
- Derived credentials minted before it: the IDE token (15 min), the account JWT (120 s), LiveKit
  grants (up to 6 h).
- Tokens minted before P0-4 was deployed, or while records were off: they have no row, so they are
  neither listed nor revocable one at a time. The per-user cutoff still ends them.
- Other replicas, for up to one poll (10 s), or the stale threshold (60 s) during a poll outage.

## Rules other packages must keep
1. A session's expiry comes from the token, never from the handoff record (which carries the
   90 s handoff expiry).
2. Records, enforcement and the session routes are on or off together; off answers 503
   `session_records_off`, never a 204 for a revoke nobody enforces.
3. Nothing but `bridge-sessions.mjs` writes `osionos_sessions`.
