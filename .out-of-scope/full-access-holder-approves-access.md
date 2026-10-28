<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Full-access-rule holder approves access — out of scope

- Decided: 2026-10-28 · by devil verdict Plan A (A1)
- Holds while: page access requests are owner-only

## The concept

Let users who hold `full_access` on a page through a rule receive and decide
access requests for that page, instead of the page owner alone.

## Why not

- `mayChangeRule` grants rule-writing only to the page owner or a workspace
  owner/admin (`scripts/bridge-perms-rule-owners.mjs:55,67-69`). A full-access
  holder's approval would return 403 for every non-owner.
- Making it work widens who may write a grant; that is a separate security
  change and needs its own devil verdict.
- It also depends on X1 being closed: an admin can currently write a grant on
  another member's private page.

## Reopen when

`mayChangeRule` grants rule-writing to full-access holders under its own
verdict, and X1 is closed.
