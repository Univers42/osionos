<!-- Copied from the host repo's template (.claude/templates/adr.md). The host
     repo (the groot root) owes its own copy, numbered in ITS own sequence;
     this one lives with the code it describes. -->

# 0006. Page access requests and the invite inbox

- Status: Accepted with conditions
- Date: 2026-10-28
- Deciders: devil verdict + product owner
- Related: 0005 (X1, private-page grants) landed first and takes 0005

## Context

The devil verdict `verdict-notion-access-requests-2026-10-28.md` ruled two
plans. Their facts, with the code they were read from:

- A1: only a page owner, or a workspace owner/admin, may write a rule about a
  page (`scripts/bridge-perms-rule-owners.mjs:55,67-69`). A `full_access`
  holder may not, so Plan A's "full-access holders approve" returns 403 for
  every non-owner recipient.
- A2: `ownerHoldsPage` requires live membership, `canChangePageSharing` does
  not (`scripts/bridge-page-read.mjs:53-55,101-103`): a decision must re-check
  membership.
- A3: deny wins over any grant in the ancestor chain
  (`scripts/bridge-page-access.mjs:131-136`), so approval must verify the
  resulting level.
- A4: a rule upsert replaces the rule for the same target, so an approve UI
  must show and not silently downgrade an existing rule.
- A5: the notification `type` CHECK list is copied into three migrations and
  the last applied wins; `page_comment` was dropped once. The client union is
  already stale (`src/shared/chat/notifyApi.ts:17-19`).
- A6: every new public table gets a realtime trigger that broadcasts every row,
  and new tables get anon/authenticated CRUD by default
  (`models/osionos-account-erasure-migration.sql:344-347`,
  `models/osionos-workspace-invites-migration.sql:8-10,55-57`).
- A7: the erasure seed deletes registry rows that are not in its own file, and
  its canary scans every other table for the erased uuid.
- A8: a page delete is a hard delete, descendants first; a page FK without
  `ON DELETE CASCADE` half-deletes a tree.
- A9: the same 202 is not the same timing: a stored request inserts, notifies,
  publishes and pushes; a dropped one does none of these.
- A10: "already readable" must be the one access decision
  (`scripts/bridge-api.mjs:1045,1056-1063`), not a second check.
- B1: the session token carries no email claim
  (`scripts/bridge-session-token.mjs:110-126,197-207`;
  `scripts/bridge-api.mjs:2040`), and refresh hard-codes `emailVerified` false.
- B2: the invite already binds the account id at creation, and acceptance
  compares that id, never the email
  (`models/osionos-workspace-invites-migration.sql:19-21`;
  `scripts/bridge-workspace-invites.mjs:156-158,238`).
- B3: no declined state existed; live = `accepted_at` and `revoked_at` null,
  and the live unique index uses the same predicate.
- B4: exactly one accept path existed; its order was wrong account → revoked →
  used → expired, already member, block/non-friend, atomic claim, membership
  write, publish.
- B5: accept never re-checked that `invited_by` still holds owner/admin.
- B6: the `user:<id>` realtime topic is granted only to its owner
  (`scripts/bridge-realtime-token.mjs:50-54`).

## Decision

- Page access requests go to the page owner only (N1) and are approved through
  the existing share-rule functions (N7), with the uniformity, rate-limit,
  block, notification, migration, erasure and client conditions N2–N16.
- Invites are matched by `invited_user_id = session.userId` (N17). No route
  compares an email; the account was fixed when the invite was created.
- The token accept and the by-id accept are one function, `acceptInviteRow`
  (N19). The by-id route looks the row up by `id` + `invited_user_id`; every
  miss is the same 404 as an unknown token. Both routes share `ACCEPT_BUCKET`.
- The invitee sees their live invites at `GET /api/invites/mine` (N18): five
  fields, newest first, no token/hash/email/user id/workspace id, blocks hidden
  in either direction, non-friends hidden under the flag, side-effect free,
  limit 50. `POST /api/invites/resolve` maps the dialog's token to `{id}` only
  for its addressee (N23).
- Declining is a filtered PATCH on the existing `LIVE` predicate that sets
  `revoked_at` and `declined_at` together (N21), so accept and decline cannot
  both win. `publicInvite` carries `declinedAt`.
- `acceptInviteRow` re-checks that the inviter is still the workspace owner or
  an admin; otherwise it revokes and answers 410 `invite_used` (N20). This also
  applies to the token route, which is intended.
- No route accepts without a session or without the friendship gate (N27).
  With the flag unset both accept routes behave as the token route did, less
  auto-join (N28).

## Alternatives refused

- Full-access-rule holders approve access (A1): it widens who may write grants.
  Tracked in `.out-of-scope/full-access-holder-approves-access.md`.
- An email-keyed inbox (B1): there is no verified email claim, and an email
  change moves the invite to another account. Tracked in
  `.out-of-scope/invite-match-by-email.md`.
- A third "live" column for decline (B3): it rebuilds the live index and leaves
  two predicates that can disagree.

## Consequences

- N1–N28 are acceptance criteria. N17–N21, N23, N25, N27 and N28 are covered by
  `tests/bridge/bridge-invite-inbox.test.mjs` and
  `tests/bridge/bridge-invite-accept-by-id.test.mjs`; N22 landed in groot
  (`feat/invite-decline 111c9267`); N24/N26 belong to the front unit.
- The invite inbox never auto-joins: membership is written only by an explicit
  accept, and declining writes no membership.
- Re-inviting after a decline goes through `saveInviteForAccount` unchanged
  (N25): rate-limited and friendship-gated, with no auto-suppression.
- X1 remains tracked separately; this ADR does not claim private pages are
  owner-only.
