# Clients publish co-edit events straight to the gateway — out of scope

- Decided: 2026-10-27 · by the devil (risk magistrate), on the co-edit latency plan
- Holds while: the realtime gateway trusts a socket for its whole life

## The concept

The editor publishes its block ops over its own gateway socket instead of POSTing them
to the bridge, saving the bridge hop (~130 ms before the fast lane).

## Why not

- The gateway checks the token once, at AUTH; a socket outlives the token's expiry, so a
  removed member keeps publishing until it disconnects.
- The bridge is where page-level write access (`authorizeBlocks`) runs; the gateway only
  knows namespaces, so a viewer of a page could write to it.
- A forwarded event does not carry a gateway-verified sender, so peers could not tell
  who wrote it.

## Reopen when

The gateway enforces token expiry on live sockets AND stamps a verified sender id on
forwarded events AND a per-page write grant can be minted by the bridge. Re-decide from
scratch; ADR 0003 is the current answer.
