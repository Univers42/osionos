# Co-editing latency baseline

Measures keystroke -> peer DOM for two users on one shared page. It reports; it asserts no
speed (the p95 gate waits for a measured baseline).

## Instruments (all off by default)

| Where | Switch | What it adds |
| --- | --- | --- |
| Bridge | `COLLAB_SERVER_TIMING=1` | `Server-Timing` header on `POST /api/collaboration/:ws/events`: `session`, `membership`, `access`, `publish`, `total` (ms) and `postgrest;desc="<calls>"`. Success and error responses both carry it. |
| Client | `localStorage['osio:collab-timing']='1'` before load | `performance` marks `collab:frame` (adapter `handleFrame`), `collab:dom` (after the block DOM write, `detail.len`) and measure `collab:frame-to-dom`. |

Wire format is unchanged; with both flags off nothing is added.

## Run

Inputs are env names only; never put values in a command line that is logged.

```sh
# local stack (the compose bridge + app), or a deployed site:
export COEDIT_OWNER_EMAIL=... COEDIT_OWNER_PASSWORD=... COEDIT_MEMBER_EMAIL=... COEDIT_MEMBER_PASSWORD=...
export COEDIT_PAGE_TITLE='<a page both users see, owner can edit>'
export PLAYWRIGHT_API_URL=https://<bridge>            # build-time bridge for the dev server
pnpm test:e2e:coedit
# against a live site instead of a local dev server:
PLAYWRIGHT_BASE_URL=https://<site> PLAYWRIGHT_REUSE_EXISTING_SERVER=1 COEDIT_API_URL=https://<bridge> pnpm test:e2e:coedit
```

Optional: `COEDIT_CHARS` (100), `COEDIT_INTERVAL_MS` (150), `COEDIT_SETTLE_MS` (15000).
Artifact: `test-results/latency/coedit-latency.json` (loss, `keyToDomMs` p50/p95/max,
`hopsMs.{keyToPost,postRoundTrip,postToFrame,frameToDom,server.*}`).

## Reading it

- Same-host or LAN peers only: both users share one Chromium and one clock.
- The 250 ms idle-commit debounce starves under typing faster than 250 ms per key, so the
  default 150 ms interval measures today's behaviour, not a floor.
- A hop is `null` when its instrument is absent (older client or bridge flag off), never 0.
- Same-block concurrent typing is bounded by the focused-block hold rule and whole-block
  last-write-wins; it is out of scope for the 20 ms target.
- Not in CI: no existing CI job runs a multi-user e2e against a real bridge, and this one
  needs two accounts. It is excluded from the default suite (`PLAYWRIGHT_COEDIT=1` opts in).

Caveat: N-user runs use one Chromium with N renderers on one host, which inflates the tail;
it says nothing about remote peers.

## N-peer run

Inputs are env names only; never put values in a command line that is logged.

```sh
export COEDIT_OWNER_EMAIL=... COEDIT_OWNER_PASSWORD=...
export COEDIT_MEMBER_EMAIL=... COEDIT_MEMBER_PASSWORD=...
export COEDIT_USER_3_EMAIL=... COEDIT_USER_3_PASSWORD=...
# optional: COEDIT_USER_4_* .. COEDIT_USER_6_*
export COEDIT_PAGE_TITLE='<a page all users see, owner can edit>'
pnpm test:e2e:coedit
```

Optional: `COEDIT_CHARS`, `COEDIT_INTERVAL_MS`, `COEDIT_SETTLE_MS`.
Artifact: `test-results/latency/coedit-latency-n.json`.

## Reading the pair matrix

`coedit-latency-n.json` contains `pairs`: one entry per ordered typist->observer pair
(`u1`..`uN`, never emails) with `sent`, `lost` and `keyToDomMs` (`p50`/`p95`/`max`),
plus `aggregate` over all pairs and `slowest` (the worst p95 pair). `presence` reports
`expected: N-1`, `seen: {<label>: count}` and `timeToPresenceMs`. Presence is reported,
not asserted.
