# SB-6h — Workspace defaults for settings pages, the database half: the current default, its history, and one function that writes both (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 "Three layers of defaults"). A workspace owner or admin can change a settings page for every member of the workspace, live, and roll back to any earlier version. A settings page then resolves in three layers: shipped document → workspace default → the viewer's own copy (SB-6d). This package is the storage: the current default per workspace per page, an append-only history, and one `SECURITY DEFINER` function that is the only way to write either, so a write, its history row and the owner/admin check happen in one transaction. It is a root `models/` change shown to every member, so it is 👹.

Repo: the **root** repo (`groot`), not the app. Worktree: a root worktree on a new branch from root `feat/self-built-ui` **after SB-6d is merged there** (both packages append to `ORDERED_LAST`, the data-map seed and `account-checks.sql`).

## What exists (read these first)

- `models/osionos-bridge-migration.sql:28-47`: `osionos_workspaces` (`owner_id`) and `osionos_workspace_members` (`role` in owner/admin/editor/viewer).
- The app's `scripts/bridge-workspace-settings.mjs:33-43` `loadCaller`: who may change a workspace's settings — `osionos_workspaces.owner_id = caller`, or a member row with `role = 'admin'`. The function below applies the same rule, so the bridge (SB-6h2) and the database cannot disagree.
- SB-6d (`docs/self-built-ui/wp/SB-6d.md`) and its migration `models/osionos-user-system-pages-migration.sql`: the column shapes and size backstops to copy.
- `models/osionos-service-role-only-migration.sql`: every `osionos_*` relation is revoked from PUBLIC, anon and authenticated by name pattern. These tables are service-role only; they are not on the account plane (no `osionos_account_user` grant, no `osionos:account-plane` comment).
- `models/osionos-account-erasure-migration.sql:164-180` (erase actions; `anonymise` makes the column the tombstone) and `:300-330` (the seed); `osionos_account_erase_run` is `SECURITY DEFINER`, so it can update a table the bridge cannot.
- `scripts/verify/models-grants/account-checks.sql:2310-2358` (`p5_erasure_complete`: a column named like `updated_by` must be registered) and `:2175-2192` (`p5_seed_user`, and SB-6d's `p5_insert_system_page`).

**OWNS:**
- `models/osionos-workspace-system-pages-migration.sql` (new);
- `scripts/apply-models-migrations.sh` (one name in `ORDERED_LAST`, right after `osionos-user-system-pages-migration.sql`);
- `models/osionos-account-erasure-migration.sql` (two seed rows);
- `scripts/verify/models-grants/account-checks.sql` (the p5 seed helpers for the two tables, and the checks in Rule 5).

**MUST NOT TOUCH:** every other migration, the app repo, the grobase gitlink (never `git commit -a`; stage by path).

**Commit message:** `feat(models): workspace defaults for settings pages — current version, append-only history, one guarded write function`

## Contract

```sql
CREATE TABLE IF NOT EXISTS public.osionos_workspace_system_pages (
  workspace_id UUID NOT NULL REFERENCES public.osionos_workspaces(id) ON DELETE CASCADE,
  page_id      TEXT NOT NULL CHECK (page_id ~ '^[a-z0-9_-]{1,64}$'),
  base_version INTEGER NOT NULL CHECK (base_version > 0),
  blocks       JSONB NOT NULL CHECK (jsonb_typeof(blocks) = 'array' AND octet_length(blocks::text) <= 1048576),
  fingerprints JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fingerprints) = 'object' AND octet_length(fingerprints::text) <= 262144),
  version      INTEGER NOT NULL CHECK (version > 0),
  updated_by   UUID,                                   -- no FK: the author outlives an erase as the tombstone
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.osionos_workspace_system_page_history (
  workspace_id   UUID NOT NULL REFERENCES public.osionos_workspaces(id) ON DELETE CASCADE,
  page_id        TEXT NOT NULL CHECK (page_id ~ '^[a-z0-9_-]{1,64}$'),
  version        INTEGER NOT NULL CHECK (version > 0),
  action         TEXT NOT NULL CHECK (action IN ('save', 'rollback', 'restore_shipped')),
  rolled_back_to INTEGER CHECK (rolled_back_to > 0),
  base_version   INTEGER CHECK (base_version > 0),
  blocks         JSONB CHECK (blocks IS NULL OR (jsonb_typeof(blocks) = 'array' AND octet_length(blocks::text) <= 1048576)),
  fingerprints   JSONB CHECK (fingerprints IS NULL OR (jsonb_typeof(fingerprints) = 'object' AND octet_length(fingerprints::text) <= 262144)),
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, page_id, version),
  CHECK ((action = 'restore_shipped') = (blocks IS NULL AND fingerprints IS NULL AND base_version IS NULL)),
  CHECK ((action = 'rollback') = (rolled_back_to IS NOT NULL))
);

-- the only writer of both tables
CREATE OR REPLACE FUNCTION public.osionos_workspace_system_page_apply(
  p_workspace uuid, p_page text, p_actor uuid, p_action text,
  p_expected_version integer,          -- NULL: create (refused when a row exists); else the If-Match version
  p_base_version integer, p_blocks jsonb, p_fingerprints jsonb,   -- 'save' only
  p_rollback_to integer                -- 'rollback' only
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
-- returns { "ok": true, "default": <row as json> | null }
--      or { "ok": false, "code": "not_allowed" | "copy_exists" | "version_mismatch" | "version_not_found" | "invalid_action", "default": <current row> | null }
```

Privileges: `service_role` gets `SELECT` on both tables and `EXECUTE` on the function, and nothing else (no INSERT, UPDATE, DELETE or TRUNCATE on either table: `REVOKE` them explicitly, since grobase's default privileges may grant them). `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`. The function is owned by the migration's role (postgres), so it can write; cascade deletes from `osionos_workspaces` and the erase (`SECURITY DEFINER`) still reach both tables.

Data map seed rows: `('osionos_workspace_system_pages', 'updated_by', 'author', 'anonymise', NULL, NULL, NULL, 'workspace_id', NULL)` and the same for `osionos_workspace_system_page_history`.

## Rules (each one is tested)

1. **The pattern.** Header (WHY / WHAT / WHO REACHES WHAT, as `osionos-user-emails-migration.sql` writes it, naming SB-6h2 as the only caller of the function); idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `REVOKE` before `GRANT`); a second apply changes no ACL (`models-grants.sh` check g). The size CHECKs are backstops at twice the bridge's limit, as in SB-6d; say so in a comment.
2. **Who may write, in the database.** The function first checks `p_actor`: allowed when `osionos_workspaces.owner_id = p_actor` or a member row `(p_workspace, p_actor)` has `role = 'admin'` (`loadCaller`'s rule). Otherwise it returns `not_allowed` and writes nothing. A missing workspace is also `not_allowed` (the bridge answers 404 before it calls). Caveat (in the function's comment): a member whose role is `'owner'` but who is not `owner_id` is refused, as `loadCaller` refuses them; both change together or neither does.
3. **One transaction, compare-and-swap, history always.** The function locks the current row (`SELECT … FOR UPDATE`) and:
   - `save` with `p_expected_version` NULL: refused with `copy_exists` (and the current row) when a row exists; else inserts with `version = coalesce(max(history.version), 0) + 1` for that page;
   - `save` with a version: refused with `version_mismatch` (current row, or `null` when there is none) unless it equals the row's; else updates with `version + 1`;
   - `rollback`: needs `p_expected_version` matching the current row's version, or NULL when there is no current row (a rollback after a restore); `p_rollback_to` must name a history row of this page whose action is not `restore_shipped`, else `version_not_found`; the current row becomes that row's `base_version`, `blocks` and `fingerprints`, byte for byte (`::text` equal), with the next version;
   - `restore_shipped`: needs the matching `p_expected_version`; deletes the current row;
   - any other action, or `save` without blocks: `invalid_action`.
   Every successful call appends exactly one history row (the new version, the action, `rolled_back_to`, the content or NULLs for a restore, `p_actor`, `now()`), and `updated_by`/`updated_at` on the current row are `p_actor`/`now()`. Versions of one page never repeat, across restores. A failed call writes nothing.
4. **Bounded history.** After the append, the function deletes this page's history rows older than its newest 50. Caveat (in the header): a rollback reaches only the newest 50 versions, and one workspace can hold up to 32 pages × 51 rows of at most 512 KiB of compact JSON each (the bridge's limits, SB-6h2); the bridge's rate limit is what keeps an admin from churning it.
5. **Checks** (`account-checks.sql`, each naming in a comment the mutant it fails on):
   - `workspace_system_pages_privileges`: `service_role` holds exactly SELECT on both tables (no INSERT, UPDATE, DELETE, TRUNCATE) and EXECUTE on the function; anon, authenticated and `osionos_account_user` hold nothing on any of the three. Run after the whole runner, the service-role-only sweep included.
   - `workspace_system_pages_apply`: as `service_role`, on a seeded workspace with an owner, an admin, an editor and a stranger: the editor and the stranger get `not_allowed` and the tables are unchanged; the owner creates (version 1), the admin saves (2), a stale save with version 1 gets `version_mismatch`, a second create gets `copy_exists`, a rollback to 1 gives `blocks::text` and `fingerprints::text` equal to version 1's, a restore deletes the row, a save after it creates version 5, a rollback to the restore's version gets `version_not_found`; the history holds versions 1–5 with the right actions and actors; 52 saves leave exactly 50 history rows; a direct `INSERT`, `UPDATE` or `DELETE` on either table as `service_role` fails with 42501.
   - The erase: `p5_seed_user` seeds both tables (helpers `p5_insert_workspace_system_page` and `p5_insert_workspace_system_page_history`, each with a workspace the seed already makes), and `p5_erase_canary`, `p5_erasure_complete` and the other p5 checks pass: after the erase, `updated_by` is the tombstone in both tables and the rows remain (they are the workspace's, not the user's).
   - Deleting the workspace deletes its rows in both tables (cascade).

## Steps

- [ ] **Step 1: Failing checks** (Rule 5); run `bash scripts/verify/models-grants.sh` and see them fail.
- [ ] **Step 2: The migration**, the `ORDERED_LAST` line and the two seed rows.
- [ ] **Step 3: Apply and verify.** `bash scripts/verify/models-grants.sh` rc 0 on the fresh and the legacy database, with check g. Paste the tail of each scenario.
- [ ] **Step 4: Mutants** (scratch copies, never committed). Paste the failing check name for each:
  - (a) the function skips the actor check;
  - (b) `GRANT INSERT` on the current table to `service_role`;
  - (c) `rollback` copies `blocks` but not `fingerprints`;
  - (d) the function writes the row but not the history row;
  - (e) no seed row for the history table.
- [ ] **Step 5: Commit** with the message above, staging by path. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the two `models-grants.sh` tails, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
