# SB-6f — "Show in Settings", the server half: who may put a page in the Settings nav (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §13 "Any page can be a settings page"). A page can be flagged to appear in the Settings nav, for its author only ("Only me") or for everyone in the workspace ("Everyone", owners and admins only). This package is the bridge half: the routes, their checks and the storage, so the client half (SB-6f2) builds on a fixed contract. It extends the two settings stores that exist; it adds no table.

👹 because a workspace-wide entry puts one person's page in front of every member, inside the app's own Settings chrome.

Base: the integration tip with SB-6a merged.

## What exists (read these first)

- `scripts/bridge-workspace-settings.mjs`: `osionos_workspaces.settings` (jsonb), `ALLOWED_KEYS`, `loadCaller` (owner, or member with role `admin` → `canWrite`), the GET/PATCH shape and error envelope.
- `scripts/bridge-account-settings.mjs` and the `osionos_user_settings_merge(p_section, p_patch)` RPC (root `models/osionos-account-profiles-migration.sql:311-334`): top-level keys merge, a `null` value removes its key (`jsonb_strip_nulls`); section names match `^[a-z][a-z0-9_-]{0,31}$`.
- Page access: `canReadPageRow`, `canReadPageRowAsMember` (`scripts/bridge-page-read.mjs:68-90`), `canWritePageRow` (`scripts/bridge-api.mjs:1173`).
- `writeAudit`, `rateLimit` (`scripts/bridge-guard.mjs:167,224`); `scripts/bridge-account-mounts.mjs` (the mount list); `deploy/bridge-fly/Dockerfile` (every module by name) and `tests/bridge/bridge-dockerfile-closure.test.mjs`.

**OWNS:**
- `scripts/bridge-settings-pages.mjs` (new): the routes below, and `SETTINGS_PAGE_ICONS` (the icon allowlist);
- `bridge-account-mounts.mjs` (one line), `deploy/bridge-fly/Dockerfile` (one name);
- `bridge-workspace-settings.mjs` (modified): `settingsPages` is returned by GET (default `{}`); its PATCH refuses a `settingsPages` key (writes go through the new routes and their checks) and writes with the compare-and-swap of Rule 5;
- tests: `tests/bridge/bridge-settings-pages.test.mjs` (new).

**MUST NOT TOUCH:** the root `models/` (no migration), `bridge-api.mjs` beyond importing `canWritePageRow`, `bridge-page-read.mjs` (call it).

**Commit message:** `feat(bridge): settings-page entries, per user and per workspace, with owner and admin checks`

## Contract

```
GET    /api/settings-pages?workspaceId=<uuid>
  200 { entries: Entry[] }        the caller's own entries + the workspace's, each only if the caller can read the page now
PUT    /api/settings-pages/<pageId>   body { audience: "me" | "workspace", workspaceId, group, label, icon, position }
  200 { entry: Entry }
DELETE /api/settings-pages/<pageId>?audience=me|workspace&workspaceId=<uuid>
  200 { ok: true }

Entry = {
  pageId: uuid; audience: "me" | "workspace";
  group: "account" | "workspace" | "features" | "access" | `custom:${slug}`;   // slug ^[a-z][a-z0-9-]{0,23}$
  groupLabel?: string;           // only for custom groups, 1–24 characters
  label: string;                 // 1–40 characters
  icon: string;                  // one of SETTINGS_PAGE_ICONS
  position: number;              // integer 0–999
  pageTitle: string;             // the page's current title, read at GET time
  authorName: string;            // the page owner's display name, read at GET time
  flaggedBy: uuid;
}
Errors: { ok: false, code, message }, as bridge-workspace-settings.mjs sends them.
  401 no or bad session · 403 not_allowed · 404 page_not_found / workspace_not_found · 409 too_many / conflict · 422 invalid_<field> / unknown_field / field_not_editable · 429 rate_limited · 503 audit_unavailable / store_unavailable
```

Storage: "me" entries in `osionos_user_settings`, section `settings_pages`, value `{ "<pageId>": EntryCore }`, written with `osionos_user_settings_merge` as the user (`null` removes). "workspace" entries in `osionos_workspaces.settings.settingsPages`, the same map, written with the service role after the check. `EntryCore` is the stored subset (`group`, `groupLabel`, `label`, `icon`, `position`, `flaggedBy`); `pageTitle` and `authorName` are never stored.

## Rules (each one is tested)

Devil conditions (D-SB-6f-spec, 02:12, PROCEED-WITH-CONDITIONS, cost 5) are folded in below.

1. **Who may write.** Every route authenticates with `verifySession(bearerToken(request), config)` before any pg call (401 otherwise), as `bridge-workspace-settings.mjs:66` does. The page row and the caller's memberships are read in parallel, so the response time does not depend on whether the page exists.
   - "me": the caller can edit the page (`canWritePageRow(pageRow, userId, membership, "update")`), as design §13 says ("open to anyone who can edit the page"). A reader gets 403 and `osionos_user_settings_merge` is not called.
   - "workspace": the caller is the workspace owner or an `admin` member (`loadCaller`'s `canWrite`), and `page.workspace_id === workspaceId`. A present member without write gets 403; a non-member gets 404 `workspace_not_found` (as `loadCaller` does). Nothing is written on refusal: the test reads the workspace row before and after and compares it byte for byte. This is the plan's done-when.
   - A page that is missing, archived (`archived_at` set), unreadable by the caller, or (for "workspace") in another workspace answers 404 `page_not_found` with the same body in every case, never 403, so the route does not reveal that a page exists.
   - `flaggedBy`, `pageTitle` and `authorName` come from the server (`flaggedBy` = the caller; `authorName` = the page owner's `osionos_profiles.display_name`, else "Member"); a body that sends them is a 422 (Rule 3).
2. **Who may see.** GET returns the caller's own entries and the workspace's, each kept only if `!row.archived_at && canReadPageRowAsMember(row, userId, workspaceIds)` at request time, where `workspaceIds` is the session's workspace ids plus the caller's `osionos_workspace_members` rows (`bridge-api.mjs:3784-3795`). The page rows are read in one query (`id=in.(…)`, chunked at 50 with `idChunks`), never one per entry. A workspace entry for a page the caller cannot read (a private page an admin flagged) is absent. A non-member asking for a workspace gets 404 `workspace_not_found`. Caveat (module header): `canReadPageRowAsMember` ignores share rules, so a page a member can read only through a share rule is not listed for them; listing follows membership, not sharing.
3. **Validation.** Every field is checked before any write; an unknown body key is a 422. `group` is one of the four shipped ids or `custom:<slug>`; `groupLabel` is required exactly when the group is custom. `label` and `groupLabel` go through `safeText` (which NFKC-normalises) and are length-checked after it and after trimming (1–40, 1–24). `icon` must be in `SETTINGS_PAGE_ICONS`; `position` an integer 0–999. At most 50 entries per user and 50 per workspace (409 `too_many`), counted on the stored map without the key being replaced, so editing an entry at the cap is allowed. A PUT stores the whole `EntryCore` (the merge RPC replaces a top-level key whole and strips nulls). A table test covers each field's bad values.
4. **Rate, then audit, then write.** Every PUT and DELETE calls `rateLimit(kv, ["settings-pages", userId], { limit: 30, windowMs: 60000 })` before any write; a down KV answers 503 and writes nothing. Every workspace-audience PUT and DELETE writes its audit row (`settings_page.flag`, `settings_page.unflag`, details `{ pageId, workspaceId, label }`) **before** the change; if the audit write fails, the answer is 503 `audit_unavailable` and nothing changes. An audit row for a change that then fails is acceptable (it records an attempt); a change without an audit row is not.
5. **Concurrent workspace writes do not lose an unflag.** The workspace map is read, changed and written back with a compare-and-swap on `updated_at`: the PATCH filter is `id=eq.<id>&updated_at=eq.<value read>` with `prefer: return=representation`; zero rows updated means another write landed, so re-read and retry, at most 3 times, then 409 `conflict`. Every other key of `settings` is preserved. The workspace-settings PATCH (`bridge-workspace-settings.mjs:128-160`) gets the same compare-and-swap, since it rewrites the whole `settings` object and would otherwise put back a stale `settingsPages`. Test: two interleaved writers (a flag and an unflag of different pages, and the workspace PATCH racing an unflag) end with both changes applied.
6. **The workspace-settings PATCH cannot bypass this.** `PATCH /api/workspaces/<id>/settings` with a `settingsPages` key answers 422 `field_not_editable` and writes nothing; GET returns the map, `{}` when absent (so an export carries it).
7. **The server does not police labels.** A label may equal a shipped section's label: the server cannot know the client's registry. What keeps a flagged page from passing for a shipped section is SB-6f2's "Custom · by <author>" mark and the `page:` id. Only owners and admins can show a page to everyone, and they already control the workspace.

## Steps

- [ ] **Step 1: Failing tests** (`tests/bridge/bridge-settings-pages.test.mjs`, the fake pg and session helpers the other bridge tests use): Rules 1–6, plus DELETE for both audiences and the Dockerfile closure.
- [ ] **Step 2: Run them and see them fail.** `npm run test:bridge -- tests/bridge/bridge-settings-pages.test.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) "workspace" writes check page edit rights instead of owner/admin;
  - (b) GET skips the read filter for workspace entries;
  - (c) an unreadable page answers 403;
  - (d) the workspace-settings PATCH accepts `settingsPages`;
  - (e) GET keeps an archived page;
  - (f) the workspace write drops the `updated_at` filter (the race test fails);
  - (g) the mutation runs before the audit write.
- [ ] **Step 5: Gates.** `npm run test:bridge` rc 0 (all); `npm run test:quality` rc 0. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), Rule 4's ordering choice, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
