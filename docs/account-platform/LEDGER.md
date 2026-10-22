# Account platform — work-package ledger

Plan: `/home/dlesieur/.claude/plans/for-all-users-in-reactive-panda.md`. Rules: `COMMON.md`.
Integration branch: `feat/account-platform` (from `origin/develop` @ 14e519ca). Nothing is pushed.

Baseline on 14e519ca (2026-10-22): `quality` rc=0 · `test-bridge` 1430 pass / 1 skip · `test-canvas` 2562 pass / 2 skip.

Workers: opencode free models only, one session per WP, rotated across models on a refusal
(`/home/dlesieur/Documents/groot-wt/bin/oc-rotate.sh`; per-attempt model in `target/wf/<WP>.rotate.log`).
2026-10-22: three simultaneous starts were all refused (`provider.quota`) after 2-3 requests each;
one session alone then ran 40+ requests in ~12 min unrefused — a burst/concurrency limit, not a volume cap.
Later the same night 3-4 concurrent sessions ran without a refusal when started minutes apart.
`opencode run` blocks at "cli starting" when stdin is an open non-TTY (a background shell's socket); `oc-rotate.sh` passes `</dev/null`.

| WP | Status | Branch | Model(s) | Gates (my re-run) | Verdict |
|---|---|---|---|---|---|
| P0-2 | fix round 3 (devil PwC on the diff: 2 test blockers + 22023 mapping + 7 follow-ups) | feat/acct-bake-deepseek (25a14dc8, d259e0c9) | deepseek-v4.1-flash (+rotation on refusal) | — | spec: devil PwC, 11 conditions applied |
| P1-3a | **merged** 86a66750 | feat/acct-P1-3a (f5e8b41c) | glm-5.3-flash, 1 attempt | quality 0 · canvas 2564/0/2 · settings e2e 22/22 · visual vs local system baseline 8/8 · browser: 19 panels render, 4 profile modals open/close, 1440 matches before, 375 no page overflow | accepted; deviations: dead `memberRows` dropped (verified unused), `downloadInvoicePdf` moved to Billing |
| P0-1 | running | (root repo) feat/acct-P0-1 | big-pickle (+rotation) | harness baseline 44/0 | spec: devil PwC, 12 conditions applied; root ADR 0028 |
| P1-3b | running | feat/acct-P1-3b | glm-5.3-flash (+rotation) | — | — |
| P0-3 | fix round 1 (IPv6 rate-limit keys, in-order fake redis, split redis client) | feat/acct-P0-3 (84d4251b) | deepseek-v4.1-flash, 1 attempt | — | spec: devil PwC, 11 conditions applied; ADR 0002 |
| P0-7 | running (root repo; DB query budgets, no HTTP driver until P0-5) | feat/acct-P0-7 | nemotron-3-ultra (+rotation) | — | no devil gate |
| P1-4 | spec written, waits for P1-3b | — | — | — | no devil gate |

Open follow-ups
- `tests/e2e/visual/surfaces.spec.mjs-snapshots/settings-{light,dark}-linux.png` show the modal; after
  P1-3b they must be regenerated on a host that can download Playwright's Chromium (this one gets 403;
  the `system` Chromium renders differently, 8/8 visual diffs on 14e519ca).
- Desktop edition (`apps/osionos-electron/native/firstrun.mjs`) applies an explicit migration list before
  GoTrue exists; the account-plane tables (FK to auth.users) must be applied in its after-GoTrue step
  before P0-4 makes the bridge write sessions.
- Before P0-4 is specced: run plan preflight #1 (orphan `osionos_bridge_identities` rows without an
  `auth.users` row) on live — read-only, needs the owner's go-ahead. The handoff subject is GoTrue's
  `user.id` (`opposite-osiris/scripts/auth-gateway.mjs:960-971`); other sign-in paths are unverified.
- P0-4 must add `bridge-pg.mjs`, `bridge-paging.mjs`, `bridge-kv.mjs`, `bridge-redis.mjs`, `bridge-guard.mjs`
  to the explicit COPY list of `deploy/bridge-fly/Dockerfile` (the root `bridge.Dockerfile` uses globs;
  `tests/bridge/bridge-dockerfile-closure.test.mjs` fails on a missing transitive import).
- P0-4: the 22023 → 503 mapping (ADR 0001) rests on PostgREST v12 answering a failed role switch with
  400/22023 — unverified live; check it against the pinned image before wiring `asUser`.
- When P0-4/P1-2 add the first `writeAudit` callers: event types become one exported list (the
  principle of root ADR 0023, which governs `auth_audit_events`).
- After P0-1 merges: lift the throwaway-Postgres bring-up shared by `models-grants.sh` and
  `account-load.sh` (P0-7) into `scripts/verify/lib/`.
- Separate defect, to file on its own (devil, 2026-10-22): `anon` can execute `auth_record_audit_event`
  — `auth-security-migration.sql:178` revokes from anon/authenticated, but the grant is PUBLIC's
  (`{=X/postgres,…}`); called as anon it returned `{"status":"recorded"}`. Check `h` only scans `osionos_%`.
