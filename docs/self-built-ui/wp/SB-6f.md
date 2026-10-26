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
- `bridge-workspace-settings.mjs` (modified): `settingsPages` joins `ALLOWED_KEYS` for reading back only; its PATCH must refuse a `settingsPages` key (writes go through the new routes and their checks);
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
  401 no or bad session · 403 not_allowed · 404 page_not_found / workspace_not_found · 409 too_many · 422 invalid_<field> · 429 rate_limited
```

Storage: "me" entries in `osionos_user_settings`, section `settings_pages`, value `{ "<pageId>": EntryCore }`, written with `osionos_user_settings_merge` as the user (`null` removes). "workspace" entries in `osionos_workspaces.settings.settingsPages`, the same map, written with the service role after the check. `EntryCore` is the stored subset (`group`, `groupLabel`, `label`, `icon`, `position`, `flaggedBy`); `pageTitle` and `authorName` are never stored.

## Rules (each one is tested)

1. **Who may write.**
   - "me": the caller can edit the page (`canWritePageRow` with the caller's membership), as design §13 says ("open to anyone who can edit the page"). A reader gets 403 and nothing is written.
   - "workspace": the caller is the workspace owner or an `admin` member (`loadCaller`'s `canWrite`), and the page belongs to that workspace. A member gets 403 and nothing is written: the test reads the workspace row before and after and compares it byte for byte. This is the plan's done-when.
   - A page the caller cannot read answers 404 (`page_not_found`) for both audiences, never 403, so the route does not reveal that a page exists.
2. **Who may see.** GET returns the caller's own entries and the workspace's, each filtered by `canReadPageRowAsMember` for the caller at request time. A workspace entry for a page the caller cannot read (a private page an admin flagged) is absent. A non-member asking for a workspace gets 404 `workspace_not_found`, as `loadCaller` does today.
3. **Validation.** Every field is checked before any write; an unknown body key is a 422. `label` and `groupLabel` go through `safeText` and must stay inside their lengths after trimming. `icon` must be in `SETTINGS_PAGE_ICONS`. At most 50 entries per user and 50 per workspace (409 `too_many`). A table test covers each field's bad values.
4. **Audit and rate.** Every workspace-audience PUT and DELETE writes one audit row (`settings_page.flag`, `settings_page.unflag`) with `{ pageId, workspaceId, label }` in its details; if the audit write fails, the change is not made (write the audit first or roll back; say which). Writes are limited to 30 a minute per user (`rateLimit`).
5. **Concurrent workspace writes.** The workspace map is read, changed and written back. `Caveat:` two admins writing at the same moment can lose one change, as the other workspace settings can today; the second write wins. Test the single-writer path; record the caveat in the module header.
6. **The workspace-settings PATCH cannot bypass this.** `PATCH /api/workspaces/<id>/settings` with a `settingsPages` key answers 422 and writes nothing; GET returns the map (so an export carries it).

## Steps

- [ ] **Step 1: Failing tests** (`tests/bridge/bridge-settings-pages.test.mjs`, the fake pg and session helpers the other bridge tests use): Rules 1–6, plus DELETE for both audiences and the Dockerfile closure.
- [ ] **Step 2: Run them and see them fail.** `npm run test:bridge -- tests/bridge/bridge-settings-pages.test.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) "workspace" writes check page edit rights instead of owner/admin;
  - (b) GET skips the read filter for workspace entries;
  - (c) an unreadable page answers 403;
  - (d) the workspace-settings PATCH accepts `settingsPages`.
- [ ] **Step 5: Gates.** `npm run test:bridge` rc 0 (all); `npm run test:quality` rc 0. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), Rule 4's ordering choice, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
