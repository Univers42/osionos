> **Blocked on owner decisions (2026-10-24, orchestrator):** the packaged desktop copies only `bridge-api.mjs` and `bridge-graph.mjs` (root `apps/osionos-electron/build-native.sh:33`) while `bridge-api.mjs` imports 62 sibling `bridge-*`/`ide-*` modules, so the packaged desktop bridge cannot start at all, account plane or not. That predates the account platform. B1 (desktop `public.users.id` is SERIAL, `models/user.sql:3`), B2 (pgvector in the embedded Postgres) and the bridge packaging are product decisions for the owner. Not dispatched; supersedes D-P3-3a condition 11.

# DESK-1 — the desktop edition applies the whole account plane

Repo: root worktree `/home/dlesieur/Documents/groot-wt/root-integration` (owns `apps/osionos-electron/`, `scripts/verify/`). App worktree `integration/app` is read-only here.
Branch: `feat/desk-1-account-plane-migrations` from `develop`. Facts read 2026-10-24. Status: DRAFT, needs a devil verdict before build (data/schema + wide blast, `rules/risk.md`).

## Why (verified anchors)

- Desktop applies a hand-kept list before GoTrue: `MIGRATIONS` `apps/osionos-electron/native/firstrun.mjs:35-50` (user, gdpr, auth-security, osionos-bridge, folder-surface, rls-hardening, admin, object-databases, page-cover-position, page-search, page-version, app-connections, code-surface, SERVICE_ROLE_ONLY). It runs only when `osionos_pages` is absent (`firstRun` :91-109); on an existing install only SERVICE_ROLE_ONLY is re-applied (:100-103). So a new pre-GoTrue file never reaches an existing install.
- After GoTrue only 2 files run, every boot: `applyPostGoTrueMigrations` :116-125 = `AUTH_SESSION_CUTOFFS`, `ACCOUNT_FOUNDATION`. `supervisor.mjs:87` calls it, before `importDump` (:90) and PostgREST.
- Server order: `scripts/apply-models-migrations.sh` ORDERED_FIRST :194, ORDERED_LAST :195 (17 files, single line), alphabetical middle with `skipped()` :200-213. A missing FIRST/LAST file counts as FAILED there, so the server fails loudly.
- The account plane is absent on desktop: LEDGER.md:87 (D-P1-2s3): P1-1's file fails `osionos_bridge_identities.profile is missing`; no chat/social identity columns, no `public.user_profiles`, `public.users` is SERIAL (`models/user.sql:3`) vs uuid on the server (grobase `001_initial_schema.sql:47`), no `aud=osionos-account` token (`firstrun.mjs:67-68`). Open devil condition 11 (`target/review/D-P3-3a/VERDICT.md:133`): add `osionos-session-refresh-migration.sql`.
- Bridge reads (from `scripts/bridge-account-mounts.mjs` :26-51 and helper modules): osionos_profiles, _user_settings(+_merge), _account_uid, _sessions, _published_pages, _bridge_identities, _user_keys, _workspace_members/_workspaces, _share_rules, _workspace_mark_delete, _workspace_transfer_ownership, _teams, _team_members, _people_directory, _bridge_audit_events, _activity_daily/_events, _notifications, _user_reports, _account_exports, _account_deletion_requests/_claim/_due, _account_erase/_erase_plan, _account_erasure_objects, _account_change_username, _follows, _presence, _personal_access_tokens, _mfa_totp, _mfa_recovery_codes.
- Packaging: `build-native.sh:36` `cp models/*.sql "$RT/models/"`; `electron-builder.native.json:7` ships `native-runtime`; runtime `migrationsDir` = `RT/models` (`supervisor-run.mjs:25`); CLI default `OSIONOS_MIGRATIONS_DIR` or `../../../models` (`firstrun.mjs:161`). `scripts/apply-models-migrations.sh` is NOT shipped.
- Existing precedent for real PG: `scripts/verify/models-grants.sh` (+ `models-grants/{roles,shim,checks,account-checks}.sql`), throwaway `docker run --rm --network none`, replay check `g` (`check_idempotent` :332), `check_ordered_last` :556-591 parses `^ORDERED_LAST=`. `groot-wt/bin/rootmg.sh <wt> <label> [file perl-expr]` runs it on a `git archive` with one mutant. LEDGER.md:30 (P0-4r) already ran a desktop-shaped PG16 (bootstrap + 13 MIGRATIONS + auth stand-in) with the post-GoTrue step twice.

## 1. Dependency table (file -> needs -> provided by)

Step: all new files go POST-GoTrue (every boot). Reason: existing installs skip the pre-GoTrue list, and most files FK `auth.users`. The pre-GoTrue list stays unchanged.

| File (desktop order) | Needs (not created on desktop today) | Provided by |
|---|---|---|
| auth-session-cutoffs.sql (exists) | auth.users | GoTrue |
| auth-gateway-users-reconcile | auth.users (:148,:156), public.users uuid + username cols | GoTrue; **BLOCKER B1** |
| osionos-chat | osionos_bridge, workspaces | on desktop (bridge) |
| osionos-social | chat tables, bridge, `vector` ext (:12, `vector(384)` :20) | chat; **BLOCKER B2** |
| osionos-engagement | chat | chat |
| osionos-comments | osionos_pages, notifications | page, engagement |
| osionos-publish | osionos_pages | on desktop |
| osionos-share-rules, -teams, -workspace-invites, -workspace-lifecycle | workspaces/members/pages | on desktop |
| osionos-tasks | pages, `osionos_page_blocks()`, notifications | page-search (desktop), engagement |
| osionos-user-moderation | `osionos_user_reports` | social |
| 1 account-foundation | bridge_identities, bridge_audit_events, auth.users, public.users | desktop + GoTrue |
| 2 session-refresh | osionos_sessions | foundation |
| 3 account-profiles | auth.users (5 FK), pg_trgm, uuid public.users, **public.user_profiles** (view + backfill :712-740, :849-854) | **B1, B3** |
| 4 username / 5 profession / 6 readme | osionos_profiles (+ pages for readme) | profiles |
| 7 publish-account | osionos_published_pages | osionos-publish (middle) |
| 8 personal-access-tokens, 11 mfa, 12 user-keys | auth.users | GoTrue |
| 9 self-data-indexes | osionos_pages, osionos_tasks; `CREATE INDEX CONCURRENTLY` | tasks; **B4** |
| 10 social-follow-presence | osionos_profiles, osionos_user_blocks (RAISE :47-51), auth.users | profiles, social |
| 13 activity-analytics | public.users | user.sql |
| 14 account-erasure | auth.users (:118), osionos_user_reports (:181); erase loops guarded by `to_regclass` (:585, :679); `osionos_account_workspace_has_foreign_content` reads messages/channels/page_comments at call time (:451-470) | social, chat, comments |
| 15 service-role-only, 16 realtime-cdc-off (no-op without `realtime_notify`, header :20), 17 users-pii-grants | all tables above | last, pinned |

Not added: page-links, feed-engagement, membership-cutoff, ai_* family (erasure skips them via `to_regclass`).

Blockers (must be resolved in this WP or split out; none decided here):
- B1 `public.users.id` is SERIAL on desktop; profiles/reconcile join `a.id = u.id` (uuid = integer fails). Existing installs need a destructive conversion -> devil verdict.
- B2 `CREATE EXTENSION vector`: unverified whether the zonky PG ships pgvector. follow-presence hard-depends on social's user_blocks.
- B3 `public.user_profiles` does not exist on desktop; profiles' view and backfill read it.
- B4 `CONCURRENTLY` fails through `pg.query(wholeFile)` (multi-command string).

## Contract

1. `applyPostGoTrueMigrations` applies, in order: `auth-session-cutoffs.sql`, then DESKTOP_MIDDLE (the hand-kept, desktop-specific subset above, in the server's relative order), then ORDERED_LAST parsed from the server script.
2. One source of truth: `build-native.sh` copies `scripts/apply-models-migrations.sh` verbatim into `$RT/models/` (same dir that already ships). `firstrun.mjs` exports a pure `parseOrderedLast(shText)` using `/^ORDERED_LAST="([^"]*)"$/m`. Script located at `join(migrationsDir,"apply-models-migrations.sh")`, falling back to `join(migrationsDir,"..","scripts","apply-models-migrations.sh")` (repo/CLI case). Throws, never skips, when: script not found; no match; empty list; any listed file missing (message names the file; closes the client first). Pin the tail like `check_ordered_last` (service-role-only, realtime-cdc-off, users-pii-grants last; foundation before PAT).
   `Caveat:` the parse breaks if the assignment is wrapped over several lines; that fails loudly (no match), never silently.
3. DESKTOP_MIDDLE is guarded by a unit test: it is a subsequence of the server order (ORDERED_FIRST, then alphabetical minus `skipped()`), every file exists in `models/`.
4. Self-data-indexes: strip `CONCURRENTLY` at apply time only for that file (desktop DB is single-user, no concurrent writers), or apply statement by statement. Pick one; `Caveat:` regex strip breaks if the keyword appears in a comment/DO text.
5. After `importDump` (runs with `session_replication_role=replica`, so the profiles trigger/backfill do not cover imported users) re-run the profiles file, or run the post-GoTrue step again after the import.
6. A failed file aborts the step and ends the client; never reuse the client after an error (BEGIN/COMMIT files leave it in an aborted transaction).

## 3. Idempotence on an existing install

Server re-applies all of these every boot (replay check `g`, `models-grants.sh:332`), and headers say "Idempotent" in most files; policies/triggers pair with `DROP ... IF EXISTS`; CHECKs/FKs are added through guarded DO blocks (profession, social, erasure); the people-directory view uses `DROP VIEW IF EXISTS` (:676) then CREATE. Exceptions to prove, not assume:
- `self-data-indexes`: CONCURRENTLY (B4).
- profiles backfill rescans `public.users` every boot (cost grows with users; correct, not cheap).
- files with BEGIN/COMMIT (foundation :62/:275) vs the aborted-transaction rule.
- `user-moderation` and `users-pii-grants` have no "idempotent" header; the real-PG replay (below) is the proof.

## 4. Real-Postgres proof

New `scripts/verify/desktop-first-run.sh` (+ `desktop-first-run/` sql), modelled on `models-grants.sh`: throwaway container, `--network none`, vanilla `postgres:16` image WITHOUT pgvector (mimics zonky; the result settles B2). Steps: desktop `native/bootstrap.sql` (not grobase roles.sql) -> desktop pre-GoTrue `MIGRATIONS` -> auth stand-in -> post-GoTrue list, applied **twice** (each file fed as one `query()` to mirror `pg`, not psql) -> assertions. Wrap with `rootmg.sh` for archive + mutants.

Auth stand-in minimum (what the SQL references): schema `auth`; `auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb)`. `id` is the only FK/EXISTS target; email and raw_user_meta_data are read by reconcile's backfill (:148, :156). GoTrue's other tables are not referenced. Also needed in the desktop DB: uuid `public.users` and `public.user_profiles` (B1, B3) — the stand-in must NOT paper over them; they are the SUT.

Assertions: every table/function in the "Bridge reads" list exists (`to_regclass` / `pg_proc`), second pass exits 0 with no diff of `pg_dump --schema-only`, no anon/authenticated privilege on `osionos_%` (models-grants check c).
Expected today: RED at profiles (uuid vs integer), social (vector), self-data-indexes (CONCURRENTLY).

## OWNS

- `apps/osionos-electron/native/firstrun.mjs` (post-GoTrue list, `parseOrderedLast`, re-run after import)
- `apps/osionos-electron/build-native.sh` (copy the runner script)
- `apps/osionos-electron/test/native-cutoffs.test.js` (extend) or a new `native-order.test.js`
- `scripts/verify/desktop-first-run.sh` and its sql dir

## MUST NOT TOUCH

- `models/*.sql`, `scripts/apply-models-migrations.sh` (server source of truth; read-only)
- `integration/app/scripts/bridge-*.mjs` and the grobase submodule
- the pre-GoTrue `MIGRATIONS` list (existing installs never re-run it)
- gate budgets / check lists (workers loosen gates: diff them)

## Tests to add

- A1 `parseOrderedLast` returns the 17 names in order from the real script text.
- A2 throws on: no match, empty list, wrapped assignment.
- A3 throws naming the file when a listed file is missing; client closed.
- A4 recording stub: call order = cutoffs, middle, ORDERED_LAST, each once; tail pinned.
- A5 DESKTOP_MIDDLE is a subsequence of the server order and every file exists in `models/`.
- A6 `build-native.sh` output contains `models/apply-models-migrations.sh` (grep on a dry-run tree).
- B1 real-PG: two passes green, schema dump identical, all bridge tables/functions exist, no anon/authenticated grants.
- B2 real-PG on an integer-id `public.users` install: conversion path green (or documented refusal).

## Mutants

| # | Mutant | Test that must fail |
|---|---|---|
| M1 | drop `osionos-session-refresh` (or any ORDERED_LAST file) from the applied list | A4, B1 (table missing) |
| M2 | swap foundation after personal-access-tokens | A4, B1 (FK/role missing) |
| M3 | service-role-only not last | A4 (tail pin), B1 (grants) |
| M4 | missing listed file skipped silently (catch ENOENT, continue) | A3 |
| M5 | `parseOrderedLast` returns [] without throwing | A2 |
| M6 | DESKTOP_MIDDLE gains a file out of server order | A5 |
| M7 | runner script not copied by build-native.sh | A6 |
| M8 | CONCURRENTLY left in self-data-indexes | B1 |
| M9 | drop the re-run after importDump | B2 (imported user has no profile) |
| M10 | second-pass uses a non-idempotent statement | B1 (second pass red) |

Commit mutants before running them (a checkout of a mutant wipes an uncommitted fix).

## Gates

`devil preflight`; run node:test and the docker harness under `devil watch` (hard + idle timeout); `devil quality`; `rootmg.sh` for the real-PG check and each mutant. Skipped is not passed.

## Not verified

- Whether zonky PG ships pgvector, pgcrypto, pg_trgm (no `vector.control` on the host; `.native-cache`/`native-runtime` absent).
- Packaged bridge: `build-native.sh:33` copies only `bridge-api.mjs` and `bridge-graph.mjs`, while `bridge-api.mjs` imports ~61 local modules; pinned app submodule is empty in this worktree, so unchecked.
- Real-PG results for any of the above (no run was made; harness not executed).
- Row counts / upgrade time on a large existing desktop DB.

## Open questions

1. B1: convert integer `public.users.id` to uuid in place (destructive, needs devil) or give the account plane its own uuid identity table on desktop?
2. B2: does the desktop PG ship pgvector? If not, split `bio_embedding` out of social, or ship the extension?
3. B3: create `public.user_profiles` on desktop, or make the profiles view/backfill tolerate its absence (server file change, out of scope)?
4. B4: strip CONCURRENTLY vs statement-by-statement.
5. Packaged bridge ships 2 of ~61 modules: is a sibling WP fixing it? Without it, the new tables are unreachable.
6. `aud=osionos-account` token on desktop (LEDGER:87): sibling WP?
7. Re-run the whole post-GoTrue step after `importDump`, or only the profiles file?

## Commit message

`feat(desktop): apply the account-plane migrations after GoTrue from the server's ORDERED_LAST`
