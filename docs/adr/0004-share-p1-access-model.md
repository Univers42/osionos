<!-- Copied from the host repo's template (.claude/templates/adr.md). The host
     repo (the groot root) owes its own copy, numbered in ITS own sequence;
     this one lives with the code it describes. -->

# 0004. Share P1 access model

- Status: Accepted
- Date: 2026-10-28
- Deciders: share-p1 plan
- Context: osionos repo, base origin/develop edfcdfbc5

## Context

Share P1 needs to gate permanent workspace membership behind friendship while
keeping publish public and preserving existing behaviour when the flag is off.
The devil's verdict (share-p1-verdict.md) requires friendship checks only
through a manual accepted connection, blocks read from osionos_user_blocks,
and enumeration of all members-row writers.

## Decision

- F1: permanent workspace membership must be authorized only by FRIENDSHIP
  (a manual accepted connection), behind opt-in flag OSIONOS_INVITE_REQUIRES_CONNECTION=1.
  Gate is in saveInviteForAccount (covers email invitePerson, id createInviteForUser,
  legacy inviteMember). resendInvite is gated. acceptInvite re-checks edge and block
  before members POST and voids the invite atomically on failure.
- F2: link/QR guests are BLOCKED until lift conditions met (not implemented).
- F3: public subdomain/publish path is read-only snapshot only; anonymous edit and execute
  remain out of scope.
- Alternative rejected: gating only createInviteForUser/email route separately
  (would miss routes and be inconsistent). Also rejected counting colleague edges
  as friendship.

## Consequences

- Flag off is byte-identical (C606 fixture). Flag on enforces friendship.
- All members-row writers enumerated with gated/exempt status (C605).
- Legacy collab error handler propagates code/profileUserId (C607).
- Live flip voids pending invites to non-connections at accept (C604), needs user go.
