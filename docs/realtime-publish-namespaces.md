# Realtime publish: protected namespaces and the socket lane

Read-only record from the gateway source, grobase `origin/main` 188edf08,
`infra/docker/services/realtime/realtime-agnostic/crates`. Nothing here changes the gateway.

## How a publish is gated

- `realtime-auth/src/jwt/mod.rs:90-102`: `REALTIME_PROTECTED_NAMESPACES` (comma list of
  prefixes, e.g. `collab:`) is read once at provider construction. Empty (the default) means
  `"*"` covers every namespace.
- `realtime-core/src/types/auth_claims.rs:101-120`: a socket PUBLISH needs `can_publish`, a
  non-empty `namespaces`, and `namespace_allowed(topic.namespace())`: an exact match always
  wins; `"*"` wins only when the topic namespace does not start with a protected prefix.
- `realtime-core/src/types/topic_path.rs:63`: the namespace is the topic up to the first `/`.
  The bridge topics `collab:<workspaceId>` and `collabpage:<pageId>` have no `/`, so their
  namespace is the whole topic: a protected `collab:` prefix needs one exact grant per
  workspace, and `collabpage:` one per page. A prefix grant does not exist.
- Subscribing follows the same rule (`can_subscribe_to_scoped`); a pattern spanning every
  namespace (`**`, `*/x`) is admitted only for an all-access claim while nothing is protected.

## What the bridge does about it

`REALTIME_PUBLISH_WS_URL` (opt-in, default unset) turns on the lane in
`scripts/bridge-realtime-ws-lane.mjs`. The token carries `REALTIME_PUBLISH_NAMESPACES` exactly
(a `*` entry is dropped) plus one canary namespace.

Consequence, not solved here: with `collab:`/`collabpage:` protected, the lane can publish
only to the namespaces listed, so per-id topics are not coverable by a static list. Either
the live gateway leaves them unprotected and the lane stays on HTTP (no namespaces granted =
lane off), or a per-topic token mint is a later phase. UNKNOWN: whether the live gateway
sets `REALTIME_PROTECTED_NAMESPACES`; that probe needs the VM and was not run.

## C9: `/v1/publish` has no auth

`rest_api.rs:103` (`publish_event`) and the route at `realtime-server/src/server.rs:244` take
no token; the HTTP fallback inherits that. Whether the route is reachable outside the bridge
network is not verified here (needs a live probe). Reported as a separate security item;
untouched.
