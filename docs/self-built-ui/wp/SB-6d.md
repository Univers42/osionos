# SB-6d — User copies of settings pages, the database half: one owner-only table (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 "Storage"). A user's edited copy of a settings page is stored server-side, one row per user per page, readable and writable only by that user. This package is the table, its grants and row-level security, its place in export and erasure, and the one line that ships the system-document schema in the bridge image so the bridge (SB-6d2) can validate copies. It is a root `models/` change, so it is 👹.

Repo: the **root** repo (`groot`), not the app. Worktree: a root worktree on a new branch from root `feat/account-platform` (5ac575bd or later), which carries the account plane (`osionos_account_uid()`, the `osionos_account_user` role, `osionos_account_data_map`).

## What exists (read these first)

- `models/osionos-account-profiles-migration.sql`: `osionos_user_settings` (lines 214-222) and its RLS and column grants (lines 589-648) are the pattern to copy: realtime trigger dropped, RLS on, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, service-role policy, owner policy `user_id = (SELECT public.osionos_account_uid())` (wrapped, evaluated once per query), column grants to `osionos_account_user`, `COMMENT … 'osionos:account-plane'`.
- `models/osionos-account-erasure-migration.sql:300-330`: the `osionos_account_data_map` seed (export columns, erase action) that the export runner (`apps/osionos/app/scripts/bridge-account-export-runner.mjs:100`) and the erasure runner read.
- `scripts/apply-models-migrations.sh:195`: `ORDERED_LAST`.
- `scripts/verify/models-grants.sh` and `scripts/verify/models-grants/account-checks.sql`: `account_plane_rls` (line 65, generic over every account-plane table), `account_plane_expected` (lines 91-104, the list "later packages append theirs" to), and the data-map coverage checks (lines 2073-2358).
- `infrastructure/docker/osionos/bridge.Dockerfile:22-28` and its `.dockerignore` (which drops `src`): the wildcard-COPY precedent for `moderation-list[s]/`.

**OWNS:**
- `models/osionos-user-system-pages-migration.sql` (new);
- `scripts/apply-models-migrations.sh` (one name in `ORDERED_LAST`, right before `osionos-account-erasure-migration.sql`);
- `models/osionos-account-erasure-migration.sql` (one seed row);
- `scripts/verify/models-grants/account-checks.sql` (one name in `account_plane_expected`, plus the checks in Rule 4);
- `infrastructure/docker/osionos/bridge.Dockerfile` and `bridge.Dockerfile.dockerignore` (Rule 5).

**MUST NOT TOUCH:** every other migration, the app repo, the grobase gitlink (never `git commit -a`; stage by path).

**Commit message:** `feat(models): osionos_user_system_pages — one owner-only copy per user per settings page`

## Contract

```sql
CREATE TABLE IF NOT EXISTS public.osionos_user_system_pages (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id      TEXT NOT NULL CHECK (page_id ~ '^[a-z0-9_-]{1,64}$'),   -- a settings document id: src/system-docs/settings/<page_id>.json
  base_version INTEGER NOT NULL CHECK (base_version > 0),            -- the shipped version the copy last merged
  blocks       JSONB NOT NULL CHECK (jsonb_typeof(blocks) = 'array' AND octet_length(blocks::text) <= 1048576),
  fingerprints JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fingerprints) = 'object' AND octet_length(fingerprints::text) <= 262144),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),       -- If-Match for two tabs editing one copy
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);
```

- `osionos_account_user`: `SELECT (user_id, page_id, base_version, blocks, fingerprints, version, updated_at)`, `INSERT (user_id, page_id, base_version, blocks, fingerprints)`, `UPDATE (base_version, blocks, fingerprints, version, updated_at)`, `DELETE`; one owner policy `FOR ALL … USING / WITH CHECK (user_id = (SELECT public.osionos_account_uid()))`.
- The size CHECKs are backstops at twice the bridge's limits (the bridge enforces `maxBytes` 524288 on compact JSON; `jsonb::text` adds a space after every `:` and `,`). Say so in a comment.
- Data map seed row: `('osionos_user_system_pages', 'user_id', 'owner', 'delete', '{page_id,base_version,blocks,updated_at}', NULL, NULL, NULL, NULL)`.

## Rules (each one is tested)

1. **The pattern, not a variant.** Header (WHY / WHAT / WHO REACHES WHAT, as `osionos-user-emails-migration.sql` writes it), idempotent: every statement can run twice (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` then `CREATE`, `REVOKE` before `GRANT`). A second apply changes no ACL and no policy (`models-grants.sh` check g, a second runner pass).
2. **Isolation.** User A's per-user JWT, sent to PostgREST, reads 0 of B's rows, cannot insert a row with B's `user_id`, cannot update or delete B's row, and cannot `select=*` (column grants, 42501). `anon` and `authenticated` reach nothing.
3. **Export and erasure.** The seed row lands in `osionos_account_data_map`; the data-map coverage checks pass with the new table (every user-keyed column registered). Deleting the auth user deletes their copies (FK cascade; the erasure check that lists cascaded tables stays green).
4. **Checks.** `osionos_user_system_pages` joins `account_plane_expected`. Add one check `user_system_pages_isolation` to `account-checks.sql` in the style of its neighbours: as `osionos_account_user` with A's uid set, a row of B is invisible to SELECT and untouched by UPDATE and DELETE, and an INSERT naming B fails the policy. Each new check names, in a comment, the mutant it fails on.
5. **The bridge image carries the schema.** The bridge validates copies against `src/system-docs/schema.generated.json` (the one schema file, design §10). In `bridge.Dockerfile`, add `COPY src/system-doc[s]/schema.generated.json ./src/system-docs/` (the one-character class makes it a wildcard, so an app pin that predates the file still builds, as with `moderation-list[s]/`), with a comment saying why. In the `.dockerignore`, re-include the file after `src` (`!src/system-docs/schema.generated.json`). Test: `scripts/tests/bridge-image-closure.bats` stays green, and a build of the image from an app pin that has the file contains `/app/src/system-docs/schema.generated.json` (paste `docker run --rm --entrypoint ls <image> /app/src/system-docs`).

## Steps

- [ ] **Step 1: Failing checks.** Add the `account_plane_expected` name and the `user_system_pages_isolation` check; run `bash scripts/verify/models-grants.sh` and see them fail (the table does not exist).
- [ ] **Step 2: The migration**, the `ORDERED_LAST` line and the seed row.
- [ ] **Step 3: Apply and verify.** `bash scripts/verify/models-grants.sh` rc 0: it runs the real runner on a fresh and a legacy database and re-runs it (check g). Paste the tail of each scenario.
- [ ] **Step 4: Mutants** (scratch copies, never committed). Paste the failing check name for each:
  - (a) the owner policy without `WITH CHECK`;
  - (b) a table-level `GRANT SELECT` to `osionos_account_user`;
  - (c) no seed row;
  - (d) the owner policy compares `user_id = auth.uid()`.
- [ ] **Step 5: The image** (Rule 5), then `bats scripts/tests/bridge-image-closure.bats`.
- [ ] **Step 6: Commit** with the message above, staging by path. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the two `models-grants.sh` tails, the mutant results, the image `ls`, and the SHA. A gate you could not run is SKIPPED with the reason.
