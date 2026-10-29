<!-- Copied from the host repo's template (.claude/templates/adr.md). The host
     repo (the groot root) owes its own copy, numbered in ITS own sequence;
     this one lives with the code it describes. -->

# 0005. A private page takes grants only from its owner

- Status: Accepted
- Date: 2026-10-28
- Deciders: X1 plan, devil verdict X1 (PROCEED-WITH-CONDITIONS)
- Context: osionos repo, base origin/develop 41e055bc4

## Context

A private page was readable by anyone a share rule named, whoever wrote the rule.
`rulesAt` merged the workspace-wide rules into every page and the nearest grant
won before visibility, so four paths opened another member's private page:

- R1: an admin's workspace-wide grant.
- R2: an admin's rule on the private page itself.
- R3/R4: a grant on an ancestor the page's owner does not control — another
  owner's page, or the owner's own SHARED page, which admins may also write.

The admin exemption covered reading only, and `mayChangeRule` let an admin write
any rule. "Private" therefore meant "private until an admin says otherwise".

## Decision

- Read side (`scripts/bridge-page-access.mjs`, `decidePageAccess`): on a private
  page, for a caller other than its owner, a GRANT counts only from rules the
  owner controls — the page's own rules, or an unbroken run of ancestors that
  have the same `owner_id` and are themselves private. The page metadata comes
  from `listWorkspacePageRefs`, which selects `id,parent_page_id,owner_id,visibility`
  only when the workspace holds a grant rule (the two columns add 72% payload on
  the largest live workspace; a deny-only workspace keeps the two-column read).
  Missing metadata fails closed (the ancestor grant is ignored, never a throw).
- Rules the owner does not control only LOWER access: a `no_access` still denies,
  and a can_view/can_comment still caps a collaborator's write (C558). They never
  raise the level above the visibility default.
- Write side (`scripts/bridge-perms-rule-owners.mjs`): a rule about a private page
  the caller does not own is refused (403) for everyone, admins included. An
  admin may DELETE a non-`no_access` rule there (revocation only). 'owner' counts
  only while the caller is still a member of the page's workspace. A rule whose
  `workspace_id` differs from its page's is refused. Every 8-4-4-4-12 hex id is
  looked up, not only v1–v5 UUIDs.
- The client (`src/shared/lib/auth/pageAccess.ts`, `pageRuleLevel`) applies the
  same rule, so the UI never offers a private-page write the server refuses.
  The AI retrieval twin (`services/osionos-ai/src/retrieval/shareRules.ts`)
  loads the same columns.

## Consequences

- Devil verdict X1, 2026-10-28: PROCEED-WITH-CONDITIONS, X1-C1 to X1-C11
  (`osionos-ai-records/verdict-x1-private-grants-2026-10-28.md`). Worst axis:
  cost on failure 5 (a silent privacy breach).
- Proven by `tests/bridge/bridge-private-page-grants-routes.test.mjs`: against
  the previous `scripts/` three of its six cases fail (the leaks); with this
  change all six pass. Decision-level coverage lives in
  `bridge-page-access.test.mjs` and `bridge-perms.test.mjs`.
- An owner who wants a reader on a private page must share the page (or grant
  on their own private ancestor). An admin can no longer grant into it — only
  revoke.
- Residuals, not fixed here:
  - A non-owner grant written on a page that is later flipped to private, or
    pre-written on an id with no page yet, is still counted if it is the page's
    own rule. The fix is a `created_by` column with legacy NULL read as foreign.
  - When the owner grants a team, the team's membership stays admin-governed.
  - An editor can re-parent a private page within the same owner's private subtree.
  - `GET /api/perms/rules` still lists rules about private pages to any member
    (ids and targets, no content) — Univers42/osionos#225.
  - Content already cached in a removed reader's browser, notifications or
    comments is not recalled; live page subscriptions need a re-authorisation
    at cutover (X1-C8).
