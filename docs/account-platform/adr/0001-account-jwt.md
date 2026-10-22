# ADR 0001 — per-user account JWT for the account plane

Status: accepted 2026-10-22 (devil verdict PROCEED-WITH-CONDITIONS on P0-2).

## Decision
The bridge reads and writes account-plane tables (`osionos_profiles`, `osionos_user_settings`,
`osionos_user_emails`, `osionos_sessions`, …) through PostgREST with a token minted per request:

| claim | value | why |
|---|---|---|
| `iss` | `supabase` | Kong's JWT key for this secret is `supabase` (`kong.yml:28-30`); any other issuer falls through to the anonymous consumer and skips Kong's signature check |
| `aud` | `osionos-account` | a label only — PostgREST sets no `PGRST_JWT_AUD`, and GoTrue lets a client pick `aud` |
| `role` | `osionos_account_user` | **the boundary**: PostgREST switches to this role; GoTrue never issues it |
| `sub` | the user's uuid | read by `osionos_account_uid()` |
| `sid` | the app session `jti`, when a uuid | lets per-session revocation reach the account plane later |
| `iat`/`exp` | now / now + 120 s | short enough that a leaked token is near-worthless |

Signed HS256 with `JWT_SECRET`. A blank secret is a 503 `account_plane_unavailable`; the bridge
never falls back to the service role for these tables.

## Rules other packages must keep
1. The SQL helper keys on the role, not the audience: RLS policies are `TO osionos_account_user`
   and `osionos_account_uid()` returns the `sub` claim only when
   `current_user = 'osionos_account_user'` (else NULL).
2. No other code that signs with `JWT_SECRET` may emit `role: osionos_account_user`.
   Realtime tokens (`bridge-collab.mjs:58`) carry no role and run as `anon`.
3. If `PGRST_JWT_AUD` is ever set, it must be `osionos-account` or every `asUser` call becomes a 503.
4. Error bodies from PostgREST never reach the browser: `message` is fixed per code; the upstream
   text stays on the error object for logs.

## Status mapping (asUser)
401/403 → 503 (setup fault, never the user's), 404 → 503 (missing table/function; a missing row is
`200 []`), 400 → 422, 409 → 409, 429 → 429, other → 502, network → 503 `baas_unreachable`.
`upstreamCode` (`42501` = RLS refusal) separates a policy refusal from a JWT/grant fault in logs.

## Not decided here
Directory, admin and background-job reads keep the service role (`asService`); their own filters
remain the only isolation for those paths.
