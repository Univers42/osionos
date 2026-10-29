<!-- Copied from the host repo's template (.claude/templates/out-of-scope.md). The
     host repo (the groot root) owes its own copy. -->

# The assistant changes the sharing of a page — out of scope

- Decided: 2026-10-21 · by the devil (risk magistrate), on the P4a design
- Holds while: the assistant's write path is restricted to a sharing-free field set

## The concept

The assistant may change who may read a page: make it public, share it with
another user, or move it to another workspace. Today the answer is no, and the
reason is not that the feature is unwanted: it is that the bridge does not
bound it, and the card that would tell the user is not built.

## Why not

- The bridge does not strip the sharing keys for the owner of a page: the
  owner may set `visibility`, `collaborators`, `properties` and `workspaceId`
  through a PATCH (`scripts/bridge-api.mjs:3366` strips them only for a
  non-owner; the owner's path is `:760-762` and `:751`).
- A public page is readable by ANY authenticated user of the deployment, with
  no workspace membership (`scripts/bridge-page-read.mjs:52-54`, and
  `scripts/bridge-api.mjs:1047-1050`). A private page that becomes public
  leaks deployment-wide.
- The verdict's condition C1 asks for a strict whitelist of the write schema
  that excludes those keys, and for the service to strip them before the
  bridge call (`scratchpad/devil/p4a-verdict.md`, C1).

## Prior requests

- 2026-10-21 (the P4a design): the write tools of the assistant were
  proposed with a payload that the bridge takes as it is, and the design did
  not say which keys the tool schema carries.
- 2026-10-21 (the devil's verdict): the same design, ruled
  PROCEED-WITH-CONDITIONS; the sharing keys were the worst silent path, and
  the card that was proposed would show a text diff and nothing else.

## Reopen when

The bridge stops letting an owner change the sharing keys through a PATCH, OR
the assistant's write path is restricted to a sharing-free field set AND the
card renders every key that will be written. When it happens, re-decide the
concept from scratch — a product requirement that needs it is a new surface
with its own confirmation, not an assistant tool.
