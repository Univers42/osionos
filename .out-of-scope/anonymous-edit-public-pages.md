<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Anonymous edit on public pages — out of scope

- Decided: 2026-10-28 · by share-p1 verdict
- Holds while: publish remains read-only snapshots

## The concept

Allow anonymous/unauthenticated editing of public pages.

## Why not

- No identity to rate-limit, ban, or attribute. Moderation L0 is warn-only
  with no moderation_state on published pages (bridge-public.mjs:20-24).
- Anonymous writes into shared workspaces bypass friendship gate entirely.
- Stored XSS and abuse surface on unauthenticated path.

## Reopen when

A proper identity/rate-limit/moderation model exists for anonymous writes
with its own security review.
