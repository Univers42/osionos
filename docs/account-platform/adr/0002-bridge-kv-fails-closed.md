# ADR 0002 — single-use bridge state lives in Redis and fails closed

Status: accepted 2026-10-22 (devil verdict PROCEED-WITH-CONDITIONS on the P0-3 spec).

## Decision
Handoff tokens, replay markers, sudo grants and rate-limit counters move from process `Map`s
(`bridge-api.mjs:402-419`, `:1632-1660`, `bridge-ratelimit.mjs`) to `scripts/bridge-kv.mjs`: Redis
`SET … PX … NX` and `GETDEL` for single use, a bounded memory store when Redis is not configured.
On a multi-replica deploy the store runs `required`: no Redis means 503 `kv_unavailable`, never a
memory fallback, because a memory fallback on two replicas is the double-consume this exists to stop.

## Rules other packages must keep
1. A Redis command that times out destroys the socket; replies are matched to waiters by order, so
   a dropped waiter would hand its reply to the next caller.
2. Key spaces are prefixed (`osb:`, then `rl:` / `sudo:` / …); a counter can never create a grant.
3. A sudo grant is keyed by the session `jti` (a uuid) and holds the user id; no uuid jti, no sudo.
4. The client IP comes from ONE configured header or the socket — never the left-most
   `X-Forwarded-For`. A configured header that is missing gives no IP, not the proxy's.
5. IP hashes are HMAC-SHA256 with a server secret; no secret, no hash.
6. An audit row is written before the irreversible action and records an attempt; a failed audit
   write blocks the action (503 `audit_unavailable`).

## Open for P0-4
The client-IP header that survives Vercel → grobase-stack → bridge, the production Redis version
(`GETDEL` ≥ 6.2, `PEXPIRE NX` ≥ 7.0), and a replay-marker TTL of `2 × skew` (`bridge-api.mjs:407,418`).
