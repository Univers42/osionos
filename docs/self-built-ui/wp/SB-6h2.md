# SB-6h2 — Workspace defaults for settings pages, the bridge half: members read, owners and admins write, every change audited and reversible (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 "Three layers of defaults"). SB-6h added `osionos_workspace_system_pages`, its history and `osionos_workspace_system_page_apply`. This package is the routes: every member reads the workspace's default for a settings page; the owner and admins save it, list and open its versions, roll back and restore the shipped default. Trees are checked with SB-6d2's validator before they are stored.

👹 because a workspace default is content one person puts in front of every member, inside Settings.

Base: the integration tip with SB-6d2 and SB-6f merged. The tests use the fake pg the other bridge tests use, so SB-6h need not be applied.

## What exists (read these first)

- SB-6h's contract (`docs/self-built-ui/wp/SB-6h.md`): the function, its result codes, the 50-version bound.
- `scripts/bridge-system-pages.mjs` and `scripts/bridge-system-doc-check.mjs` (SB-6d2): `checkSystemBlocks`, `checkFingerprints`, `loadSystemDocSchema`, the body limit, the error list. Reuse them; do not copy them.
- `scripts/bridge-workspace-settings.mjs:33-43` `loadCaller` (owner or admin → `canWrite`; non-member → 404 `workspace_not_found`). Export it and call it; there is one rule for "owner or admin".
- `writeAudit`, `rateLimit` (`scripts/bridge-guard.mjs:167,224`); the audit-before-write order of `scripts/bridge-settings-pages.mjs` (SB-6f Rule 4).
- `scripts/bridge-account-profile.mjs:15-30,128-129`: If-Match (428 without the header, 412 with the current row).
- `scripts/bridge-account-mounts.mjs`, `deploy/bridge-fly/Dockerfile`, `tests/bridge/bridge-dockerfile-closure.test.mjs`.

**OWNS:**
- `scripts/bridge-workspace-system-pages.mjs` (new): the routes;
- `scripts/bridge-workspace-settings.mjs` (modified): `export` on `loadCaller`, nothing else;
- `scripts/bridge-account-mounts.mjs` (one line), `deploy/bridge-fly/Dockerfile` (one name);
- tests: `tests/bridge/bridge-workspace-system-pages.test.mjs` (new).

**MUST NOT TOUCH:** `bridge-system-doc-check.mjs` (call it), `bridge-system-pages.mjs`, the root repo, `bridge-api.mjs`.

**Commit message:** `feat(bridge): workspace defaults for settings pages — members read, owners and admins save, roll back and restore`

## Contract

```
GET    /api/workspaces/<wsId>/system-pages/settings/<pageId>                    any member · 200 { default: Default | null }
PUT    /api/workspaces/<wsId>/system-pages/settings/<pageId>                    owner/admin · body { baseVersion, blocks, fingerprints }
         no If-Match → create (412 copy_exists with the row) · If-Match: <version> → save (412 version_mismatch with the row or null)
         200 { default: Default }
DELETE /api/workspaces/<wsId>/system-pages/settings/<pageId>                    owner/admin · If-Match required (428) · restore shipped · 200 { default: null }
GET    /api/workspaces/<wsId>/system-pages/settings/<pageId>/history?before=<v>&limit=<n>   owner/admin
         200 { versions: VersionSummary[], next: number | null }        newest first, limit 1–50 (default 20)
GET    /api/workspaces/<wsId>/system-pages/settings/<pageId>/history/<version>              owner/admin · 200 { version: Version }
POST   /api/workspaces/<wsId>/system-pages/settings/<pageId>/rollback                       owner/admin · If-Match (or none when there is no current row) · body { version }
         200 { default: Default } · 404 version_not_found

Default        = { workspaceId, pageId, baseVersion, blocks, fingerprints, version, updatedAt, updatedBy: { id, name } | null }
VersionSummary = { version, action: "save" | "rollback" | "restore_shipped", rolledBackTo: number | null, createdAt, updatedBy: { id, name } | null }
Version        = VersionSummary & { baseVersion, blocks, fingerprints }     (null content for restore_shipped)
Errors: { ok: false, code, message } as SB-6d2 sends them.
  401 · 403 not_allowed · 404 workspace_not_found / not_found / version_not_found · 409 too_many · 412 copy_exists / version_mismatch · 413 · 422 invalid_<field> / unknown_field / invalid_tree · 428 if_match_required · 429 · 503 audit_unavailable / store_unavailable / system_pages_schema_missing
```

## Rules (each one is tested)

1. **Who may read, who may write.** Every route authenticates before any pg call. `loadCaller(pg, userId, wsId)` runs first: a non-member gets 404 `workspace_not_found` on every route; a member without `canWrite` reads the current default (GET) and gets 403 `not_allowed` on every other route, with nothing written and no audit row. The function is called with `p_actor` = the session's user id, never a body or header value; if it still answers `not_allowed` (the role changed between the two reads), the route answers 403. Test: an editor's PUT, DELETE and rollback leave the fake store and the audit log unchanged; the editor's GET returns the default; a stranger gets 404 on all six routes with the same body.
2. **Checked before stored.** PUT runs SB-6d2's checks unchanged (`checkSystemBlocks`, `checkFingerprints`, `baseVersion` 1–1,000,000, unknown key → 422, body limit → 413). An invalid tree is 422 `invalid_tree` with the error list and no function call. `pageId` must match `^[a-z0-9_-]{1,64}$` (404 `not_found` before any read). At most 32 pages per workspace (409 `too_many` on a create beyond it, counted with one `select=page_id` query).
3. **Rate, audit, write.** Every write route calls `rateLimit(kv, ["workspace-system-pages", userId, wsId], { limit: 60, windowMs: 60000 })` before anything else is written; a down KV is 503. Each write records its audit row **before** the function call: `settings_default.save`, `settings_default.rollback` (details include `rolledBackTo`), `settings_default.restore_shipped`, each with `{ workspaceId, pageId, expectedVersion }`. If the audit write fails: 503 `audit_unavailable` and no function call.
4. **The function's answer is the answer.** `ok:false` codes map one to one: `not_allowed` → 403, `copy_exists` and `version_mismatch` → 412 with `default` as the function returned it, `version_not_found` → 404, `invalid_action` → 500 (a bridge bug; logged). A failed or unreachable call is 503 `store_unavailable`. The routes never write either table directly (test: the fake pg records no `POST`/`PATCH`/`DELETE` on the two table paths, only `rpc/osionos_workspace_system_page_apply`).
5. **History reads.** Keyset by version (`version=lt.<before>`, `order=version.desc`, `limit+1` rows to compute `next`), never offset. The summary query selects no `blocks` or `fingerprints`. `updatedBy.name` is the author's `osionos_profiles.display_name`, read for the page of results in one query (`idChunks`), `"Member"` when missing, `null` for the tombstone.
6. **Image closure.** The fly Dockerfile lists the module; `bridge-dockerfile-closure.test.mjs` passes.

## Steps

- [ ] **Step 1: Failing tests** (`tests/bridge/bridge-workspace-system-pages.test.mjs`): Rules 1–5, every row of the error table, the history keyset (55 versions → three pages, no overlap, no gap).
- [ ] **Step 2: Run them and see them fail.** `npm run test:bridge -- tests/bridge/bridge-workspace-system-pages.test.mjs tests/bridge/bridge-dockerfile-closure.test.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the write routes skip `canWrite`;
  - (b) the audit row is written after the function call;
  - (c) `p_actor` is taken from the body;
  - (d) PUT skips `checkSystemBlocks`;
  - (e) the history summary selects `blocks`.
- [ ] **Step 5: Gates.** `npm run test:bridge` rc 0 (all); `npm run test:quality` rc 0. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
