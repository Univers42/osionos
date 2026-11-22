# A length cap on inline Markdown before it parses — out of scope

- Decided: 2026-11-21 · by the devil (risk magistrate), on osionos#321 (option A)
- Holds while: the markdown engine's inline scan is linear in the text length

## The concept

The app cuts message and block text at N characters before handing it to the inline
parser, so one member's long text cannot freeze every reader's main thread.

## Why not

- Chat already has a server cap: `safeText(content, 8000)` on post, edit, AI posts and DM
  shares, and the bridge is the only writer. Any N ≥ 8000 is dead code there; any N below it
  truncates messages the server accepted.
- Blocks have no length cap (a page body may be 6 MiB). With a quadratic parser, a per-block
  cap leaves the page cost growing with N; only N ≤ 2000 bounds it, and at that size real
  paragraphs lose their links, code and emphasis past the cut — the owner's pages included.
- It is a patch in three callers, not a fix at the shared function. The fix landed in the
  engine instead (osionos#321, groot ADR 0073): every measured shape is linear in scan steps.

## Reopen when

The engine cannot be made linear for some inline shape, or a per-page inline budget becomes
the design. Re-measure the shape with the scan-step counter first.
