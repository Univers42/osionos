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
| P0-2 | **merged** | feat/acct-bake-deepseek (25a14dc8 → 5e1f8a33, 4 commits) | deepseek-v4.1-flash, 4 rounds in one session | test-bridge 1477/0/1 · quality 0 · 2 mutants (timeout signal, jti seam) caught by the intended tests | devil PwC on spec (11) and diff (10); all met |
| P1-3a | **merged** 86a66750 | feat/acct-P1-3a (f5e8b41c) | glm-5.3-flash, 1 attempt | quality 0 · canvas 2564/0/2 · settings e2e 22/22 · visual vs local system baseline 8/8 · browser: 19 panels render, 4 profile modals open/close, 1440 matches before, 375 no page overflow | accepted; deviations: dead `memberRows` dropped (verified unused), `downloadInvoicePdf` moved to Billing |
| P0-1 | **merged** into root `feat/account-platform` (`c5c03664`, --no-ff, local) | (root repo) feat/acct-P0-1 (c0833ba9) | big-pickle 2 rounds + mimo fix2 | my re-run on c0833ba9: models-grants 82/0 rc 0; plain-GRANT mutant (`TO authenticator ;`) → `FAIL legacy k7 1 — authenticator_inherits`, 81/1 rc 1; on the merge: 82/0 rc 0 | spec: devil PwC (12); diff: BLOCK → D-P0-1b PwC (8 not gated) → fix2 gated it |
| P1-3b | running | feat/acct-P1-3b | glm-5.3-flash (+rotation) | — | — |
| P0-3 | **merged** (9f15755d) | feat/acct-P0-3 (77338c7c) | ses_e9eddf5e…, minimax (3 rounds) | my run: test-bridge 1471/0/1, quality 0; integration after merge: test-bridge 1518/0/1, quality 0; devil's 18 mutants replayed on 77338c7c: 10 killed, 4 no longer apply, 1 equivalent (fallback line now reached only when disconnected), 4 test gaps moved to P0-4 (AUTH sent, memory window, TLS SNI, setNx vs counters) + integer-reply fix | spec: devil PwC (11); diff: PwC (2 blockers) → met |
| P0-7 | fix round 3 (mimo, same session): the two workspace queries still pick ids by subquery (`slug LIKE`, the seq scan the fixed check now reports), the members query is not coMemberPath's shape, measure.sh 303 lines | (root repo) feat/acct-P0-7 (2efde6d8) | nemotron-3-ultra 3 rounds + mimo | my run of 2efde6d8: baseline rc 0 (seed 10 s), gate rc 1 naming email_hash, feed_shares, directory_by_ids (user_profiles), directory_search, pages_of_workspace + members (osionos_workspaces); self-test present | — |
| P0-6 | spec written; dispatch after P0-4 + P1-1 merge (needs the mount seam and `osionos_profiles.avatar_url`) | — | — | research: R-P0-6 | — |
| P0-5a | spec written (root SQL: colleague trigger at join, one-time backfill, `osionos_feed_page_counts`); devil spec review D-P0-5 (beam): PwC, 15 conditions — 1-7 folded (named trigger, blocked pairs inserted, set-based insert, narrow exception, backfill orientation, 200-member semantics delta); #6 (lock_timeout 30 s) declined: 5 s matches P0-1; dispatch after P0-1 + P0-7 merge | — | — | research: R-P0-5 (mimo) | — |
| P0-5b | spec written (bridge: presence in kv, ≤1 PG write/user/10 min, GET /api/connections read-only, chunked `in.()`, counts in one request); D-P0-5 conditions 8-14 folded (server clock, TTL constant home, kv in handler deps, `restCount`, RPC 404 → 503, fail-fast chunk reads); #15 (deploy order) is the existing ship gate; dispatch after P0-4 merges | — | — | research: R-P0-5 | — |
| P1-1 | spec + D-P1-1 (big-pickle) PwC folded: settings grants incl. arbiter/version columns, EXECUTE on CHECK functions, two-pass backfill, k4 expression/unique-aware, NOTIFY pgrst, view REVOKE, check_standalone applies the file, GIN plan required for a rare term, ADR 0029 owed; dispatch after P0-7 merges | — | — | reviewer proved conditions 1-4 in a throwaway PG (prototype + 10K users) | spec: PwC (5 blocking) |
| P0-4 | **dispatched** (minimax) | feat/acct-P0-4 from 9f15755d | minimax | — | spec: devil PwC (10) |
| P0-4r | **merged** into root `feat/account-platform` (`198112e3`, --no-ff, local) | (root repo) feat/acct-P0-4r (3c1b3265) | minimax (deepseek/glm refused on quota) | my runs: desktop tests 34/0 (node:22, --network none); compose config base `redis://mini-baas-redis:6379` + `x-real-ip`, overlay `""`; desktop-shaped PG16 (bootstrap + 13 MIGRATIONS + auth stand-in) post-GoTrue step twice → ok/ok, sessions table present, feed_shares index absent; models-grants on the merge 82/0 | — |
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

- 2026-10-22: reviews move to opencode — the devil runs as an opencode session on a model other than the implementer's (prompt: read `.claude/agents/devil.md`, experiments in `oc-review-*` throwaway containers, scratch in `target/review/<label>/`); `git status` before/after proves it edited nothing. Claude subagents only for what opencode cannot do, always Sonnet.
- 2026-10-22: the P0-4 devil's index `osionos_sessions (expires_at) WHERE revoked_at IS NOT NULL` is not added — P0-1 already has `osionos_sessions_revoked_idx (revoked_at) WHERE revoked_at IS NOT NULL` (`osionos-account-foundation-migration.sql:187`), which serves the 10 s revoked-set poll.
- Follow-up (D-P1-1 #11): `models-first-run.sh` pass 2 replays the models runner, not a grobase boot; restart the stack between passes to prove triggers survive a boot.
