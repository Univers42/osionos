# 0003. Co-edit events take a bridge fast lane; clients never publish to the gateway

- Status: accepted
- Date: 2026-10-27
- Deciders: the devil ruled PROCEED-WITH-CONDITIONS on design A
  (`osionos-ai-records/coedit-latency-verdict.md`, C1–C16)

## Context

- Live key-to-DOM latency between two editors was 380–460 ms (rtmulti, 2026-10-27):
  ~283 ms before the POST (the 250 ms idle commit), ~130 ms in the bridge, 3–10 ms in the DOM.
- The bridge read membership, the page row and the share rules several times per event,
  one after another.

## Decision

Every step is opt-in and off by default; the wire format is unchanged (C15).

- `COLLAB_SERVER_TIMING=1`: a `Server-Timing` header per hop (`docs/coedit-latency.md`).
- One access read per event: membership, page row and share rules are read once and
  shared by `pageLevelFor` and `authorizeBlocks`; shape checks run before any read. No
  cross-request cache (C4). Every share-rule read still fails closed.
- Presence and cursors key by `memberIdOf(actor)`, so per-tab cursors survive a snapshot.
- `REALTIME_PUBLISH_URL` set: the bridge publishes over one gateway socket with an exact
  namespace grant, falls back to HTTP `/v1/publish` when the socket is down or the queue
  is full, and fails health when the startup canary does not echo (C8).
- `osio.collab.fastsend`: the client sends a block's draft text in the same task, on its
  own HTTP lane, and emits a corrective put on undo or cancel (C10). The 800 ms
  persistence PATCH is unchanged.

## Rejected: clients publish straight to the gateway (design B)

The gateway does not enforce token expiry on a live socket, and does not stamp a
verified sender on forwarded events, so a client-published edit could not be revoked or
attributed. `.out-of-scope/client-ws-publish.md` records the reopen condition.

## Consequences

- The 20 ms target holds only for same-host or LAN peers typing in different blocks
  (C13). Same-block typing waits for the per-block text CRDT
  (`osionos-ai-records/coedit-sameblock-verdict.md`).
- Live enablement is one flag at a time, each with a fresh go (C14, P6).
- Tests: `tests/bridge/bridge-collab-event-dedupe.test.mjs`, the ws publisher and canary
  tests, `tests/canvas` fast-send tap/undo/out-of-order tests, and `pnpm e2e:coedit`.
