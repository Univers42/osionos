# ADR 0007 — the share rules are the page's authority

Status: accepted 2026-10-22 (P3-6-c, devil verdict D-P3-6 conditions C-5, C-6, C-9, C-10, C-12).

## Context
`public.osionos_share_rules` was written by the Share dialog and read by nobody: the bridge
listed and stored the rules, and every page read and write went on without them. A user the
dialog granted `can_edit` on was refused 403 by the PATCH route, and a user granted
`no_access` was still served. The rules existed; the authority did not.

## Decision
The rules stored for a page decide that page's access, next to the rules that were always
there. The bridge is the authority; the client mirrors it and may under-grant.

- The levels are the app's own: `no_access`, `can_view`, `can_comment`, `can_edit`,
  `full_access`. `no_access` is an explicit deny, and a deny beats every grant — for
  everyone but the page owner and the workspace owner/admin, whose access the rules never
  change. `can_comment` reads and never writes.
- A rule can only add a grant inside a workspace the caller already reaches: the workspace
  gate answers first, and its 403/404 stands. A rule never widens the workspace scope —
  sharing outside the workspace is publishing (`osio.publish`), not a rule.
- The rules are read on every route that resolves one page: `GET/PATCH/DELETE /api/pages/:id`
  and the page-scoped routes (`config`, `actions`, `translate`). The list, the search, the
  graph, the feed and the profile gallery keep today's read rule — a named follow-up, and
  content still leaks through the list and the search (C-12).
- A page hidden by a `no_access` rule answers the same 404 as a missing id on every
  route that resolves one page — `GET/PATCH/DELETE /api/pages/:id`, `GET/PATCH
  /api/pages/:id/config`, `POST /api/pages/:id/actions`, `POST /api/pages/:id/translate`,
  `GET /api/pages/:id/backlinks`, and `POST /api/favorites` — and writes nothing under
  the page's workspace. A hidden page never answers 403, which would confirm that it
  exists.
- A rule about a page is the page owner's to change: writing or deleting one needs the
  page's owner (or the workspace owner/admin), not the workspace `update` permission alone.
- A store failure is never a silent "no rules": a missing table answers `[]` (no rule can
  exist), every other failure is a 503 `share_rules_unavailable`.

## Alternatives rejected
- **Keep the rules inert.** The Share dialog would keep promising a decision the server
  never made, and the only way to share a page would stay the workspace membership.
- **The workspace as the only sharing root.** Then a page can only be shared with the whole
  workspace, and the five levels the app already speaks would stay decorative.

## Rules other packages must keep
1. A page the caller may not read answers 404, never a 403 that would confirm it exists.
2. A rule-holder is a non-owner: the sharing keys (`visibility`, `collaborators`,
   `workspaceId`) stay the owner's.
3. The bridge stays the authority; the client under-grants when it does not know the rules.
4. `no_access` is a deny, not an absence of a grant. Sharing outside the workspace is
   publishing, not a rule.
