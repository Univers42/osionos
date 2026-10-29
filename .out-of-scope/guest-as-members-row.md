<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# Guest as members row — out of scope

- Decided: 2026-10-28 · by share-p1 verdict
- Holds while: F2 blocked

## The concept

Represent guests as rows in osionos_workspace_members.

## Why not

- Would open every member-gated surface (members list, teams, invites, chat,
  search, graph, AI) to guests.
- Members table has no expiry column.
- Requires separate guest principal and separate route set (C610).

## Reopen when

F2 design with separate guest principal and route allowlist is approved.
