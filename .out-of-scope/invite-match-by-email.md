<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Invite match by email — out of scope

- Decided: 2026-10-28 · by devil verdict Plan B (B1, B2)
- Holds while: invites bind `invited_user_id` at creation

## The concept

Match a pending invite to the caller by their email address instead of by the
account id the invite was created for.

## Why not

- The session token carries no email claim
  (`scripts/bridge-session-token.mjs:110-126,197-207`), and refresh hard-codes
  `emailVerified` false. The "verified JWT email" key does not exist.
- Implementing it means a GoTrue lookup on every invite request, keyed on a
  mutable attribute.
- Email-change race: an invite to X addressed to account A resolves to B once
  B owns X. B would see the workspace name, inviter and role, and could join on
  an invite addressed to A, provided B is friends with the inviter.
- The account is already fixed at creation
  (`models/osionos-workspace-invites-migration.sql:19-21`), and the email
  column is display only.

## Reopen when

The session carries a verified, immutable email claim, and the invite stops
binding `invited_user_id` at creation. Neither is planned.
