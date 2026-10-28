<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Execute mode on public pages — out of scope

- Decided: 2026-10-28 · by share-p1 verdict
- Holds while: publish remains read-only snapshots

## The concept

Allow executing page code/automation in "execute mode" on public pages.

## Why not

- Running page code on a public origin is stored XSS and a drive-by surface.
- Needs its own sandbox verdict and isolation model.
- Would expand unauthenticated surface beyond read-only snapshots.

## Reopen when

A hardened sandbox with isolation, CSP, and explicit security approval exists.
