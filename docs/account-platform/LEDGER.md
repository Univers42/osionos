# Account platform — work-package ledger

Plan: `/home/dlesieur/.claude/plans/for-all-users-in-reactive-panda.md`. Rules: `COMMON.md`.
Integration branch: `feat/account-platform` (from `origin/develop` @ 14e519ca). Nothing is pushed.

Baseline on 14e519ca (2026-10-22): `quality` rc=0 · `test-bridge` 1430 pass / 1 skip · `test-canvas` 2562 pass / 2 skip.

Workers: opencode free models only, one session per WP, rotated across models on a refusal
(`/home/dlesieur/Documents/groot-wt/bin/oc-rotate.sh`; per-attempt model in `target/wf/<WP>.rotate.log`).
2026-10-22: three simultaneous starts were all refused (`provider.quota`) after 2-3 requests each;
one session alone then ran 40+ requests in ~12 min unrefused — a burst/concurrency limit, not a volume cap.

| WP | Status | Branch | Model(s) | Gates (my re-run) | Verdict |
|---|---|---|---|---|---|
| P0-2 | running | feat/acct-bake-deepseek | deepseek-v4.1-flash (+rotation on refusal) | — | spec: devil PwC, 11 conditions applied |
| P1-3a | running | feat/acct-P1-3a | glm-5.3-flash (+rotation) | — | no devil gate (pure move) |
| P0-1 | spec under devil review | (root repo) feat/account-platform | — | harness baseline 44/0 | — |
| P1-3b | spec written, waits for P1-3a | — | — | — | — |

Open follow-ups
- `tests/e2e/visual/surfaces.spec.mjs-snapshots/settings-{light,dark}-linux.png` show the modal; after
  P1-3b they must be regenerated on a host that can download Playwright's Chromium (this one gets 403;
  the `system` Chromium renders differently, 8/8 visual diffs on 14e519ca).
- Desktop edition (`apps/osionos-electron/native/firstrun.mjs`) applies an explicit migration list before
  GoTrue exists; the account-plane tables (FK to auth.users) must be applied in its after-GoTrue step
  before P0-4 makes the bridge write sessions.
