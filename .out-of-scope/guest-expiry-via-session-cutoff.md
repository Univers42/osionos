<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Guest expiry via session cutoff — out of scope

- Decided: 2026-10-28 · by share-p1 verdict
- Holds while: F2 guests not implemented

## The concept

Use auth_session_cutoffs to expire guest sessions.

## Why not

- auth_session_cutoffs are per user and global (bridge-session-cutoff.mjs).
- Stamping it would sign the user out of all their own workspaces.
- Gateway checks exp only at AUTH; page tokens are 3600s with no epoch/key rotation.
- B' revoke-live-leak mechanism not present on develop.

## Reopen when

F2 guest principal design is re-submitted and B' is live with proper epoch/key rotation.
